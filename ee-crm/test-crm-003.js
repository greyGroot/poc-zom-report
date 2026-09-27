// ee-crm/test-crm-003.js
// Unit & Integration Test Suite for CRM-003:
// 1. NextAuth Middleware Webhook Exemption
// 2. Zoom HMAC-SHA256 Signature Verification & CRC
// 3. Live Webhook Ingestion Dual-Write (Occurrence Store + Legacy POC)
// 4. One-Time Historical Migration Adapter (Dry-Run, Live Mode, Guard, Idempotency)
// 5. Teacher Page Query for Historical Backfilled Dates

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  getHeader,
  computeZoomSignature,
  verifyZoomWebhookSignature,
  generateCrcResponse
} from '../api/lib/zoom-signature.js';
import {
  toSafeOccurrenceId,
  fromSafeOccurrenceId,
  calculateIntervalUnionSeconds,
  deriveFactFingerprint,
  normalizeWebhookEventToFacts,
  reduceOccurrenceFacts,
  transformLegacyMeetingToOccurrence
} from '../api/lib/zoom-occurrence.js';
import {
  InMemoryRedis,
  setRedisClient,
  resetRedisClient,
  getZoomOccurrence,
  MEETING_KEY_PREFIX,
  MEETINGS_INDEX_KEY,
  WEBHOOK_LOGS_KEY,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  MIGRATION_STATE_KEY
} from '../api/lib/redis.js';
import webhookHandler from '../api/webhooks/zoom.js';
import {
  runMigration,
  getRedactedFingerprint
} from './scripts/migrate-poc-zoom-occurrences.js';
import {
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay,
  resetOccurrenceMemoryStore,
  setOccurrenceRedisClient
} from './lib/zoom-occurrences.js';

let passedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// Helper to test middleware regex matcher
function doesMatcherMatch(pathname) {
  const middlewareFile = path.resolve(process.cwd(), 'middleware.js');
  const content = fs.readFileSync(middlewareFile, 'utf-8');
  const match = content.match(/'(\/\(\(\?!.*?\)\.\*\))'/);
  const pattern = match ? match[1] : '';
  const regexStr = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  const regex = new RegExp('^/' + regexStr + '$');
  return regex.test(pathname);
}

// Mock HTTP harness
function createMockReq({ method = 'POST', headers = {}, body = null, rawBody = null } = {}) {
  const raw = rawBody !== null ? rawBody : (typeof body === 'string' ? body : JSON.stringify(body));
  return {
    method,
    headers: { ...headers },
    body,
    rawBody: raw,
    on(event, handler) {
      if (event === 'data' && raw) handler(Buffer.from(raw));
      if (event === 'end') handler();
      return this;
    }
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    send(data) {
      res.body = data;
      return res;
    },
    end(data) {
      if (data && !res.body) {
        try {
          res.body = JSON.parse(data);
        } catch {
          res.body = data;
        }
      }
      return res;
    }
  };
  return res;
}

console.log('====================================================');
console.log('🧪 CRM-003 Webhook Ingestion & Migration Test Suite');
console.log('====================================================\n');

// ----------------------------------------------------------------------------
// Suite 1: Middleware Webhook Exemption
// ----------------------------------------------------------------------------
console.log('--- 1. Middleware Webhook Exemption ---');

await test('Scenario 1: /api/webhooks/zoom is excluded from NextAuth interception', () => {
  // Excluded paths MUST NOT match the middleware matcher (so they bypass NextAuth redirect)
  assert.equal(doesMatcherMatch('/api/webhooks/zoom'), false, '/api/webhooks/zoom should not match (exempt)');
  assert.equal(doesMatcherMatch('/api/webhooks'), false, '/api/webhooks should not match (exempt)');
  assert.equal(doesMatcherMatch('/api/webhooks/zoom/test'), false, '/api/webhooks/* should not match (exempt)');
});

await test('Protected routes (teachers, teacher APIs, schedule) remain intercepted by middleware', () => {
  assert.equal(doesMatcherMatch('/teachers'), true, '/teachers must be protected');
  assert.equal(doesMatcherMatch('/teachers/123'), true, '/teachers/123 must be protected');
  assert.equal(doesMatcherMatch('/api/teachers/123/zoom-meetings'), true, '/api/teachers/:id/zoom-meetings must be protected');
});

// ----------------------------------------------------------------------------
// Suite 2: Zoom HMAC-SHA256 Signature Verification & CRC
// ----------------------------------------------------------------------------
console.log('\n--- 2. Zoom HMAC Signature Verification & CRC ---');

const TEST_SECRET = 'test_webhook_secret_token_12345';

await test('CRC validation challenge produces correct HMAC-SHA256 response', () => {
  const plainToken = 'sample_token_xyz_987';
  const expectedHash = crypto.createHmac('sha256', TEST_SECRET).update(plainToken).digest('hex');

  const crcRes = generateCrcResponse(plainToken, TEST_SECRET);
  assert.equal(crcRes.plainToken, plainToken);
  assert.equal(crcRes.encryptedToken, expectedHash);
});

await test('Signature verification succeeds for fresh, valid HMAC request', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event: 'meeting.started', payload: {} });
  const sig = computeZoomSignature(nowSec, rawBody, TEST_SECRET);

  const req = createMockReq({
    headers: {
      'x-zm-request-timestamp': String(nowSec),
      'x-zm-signature': sig
    },
    rawBody
  });

  const result = verifyZoomWebhookSignature({ req, rawBody, secret: TEST_SECRET });
  assert.equal(result.valid, true);
});

await test('Signature verification rejects stale timestamp (> 300s)', () => {
  const staleSec = Math.floor(Date.now() / 1000) - 400; // 400s in past
  const rawBody = JSON.stringify({ event: 'meeting.started', payload: {} });
  const sig = computeZoomSignature(staleSec, rawBody, TEST_SECRET);

  const req = createMockReq({
    headers: {
      'x-zm-request-timestamp': String(staleSec),
      'x-zm-signature': sig
    },
    rawBody
  });

  const result = verifyZoomWebhookSignature({ req, rawBody, secret: TEST_SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'stale_timestamp');
});

await test('Signature verification rejects forged or invalid HMAC signature', () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event: 'meeting.started', payload: {} });

  const req = createMockReq({
    headers: {
      'x-zm-request-timestamp': String(nowSec),
      'x-zm-signature': 'v0=0000000000000000000000000000000000000000000000000000000000000000'
    },
    rawBody
  });

  const result = verifyZoomWebhookSignature({ req, rawBody, secret: TEST_SECRET });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_signature');
});

// ----------------------------------------------------------------------------
// Suite 3: Live Webhook Ingestion Dual-Write
// ----------------------------------------------------------------------------
console.log('\n--- 3. Live Webhook Ingestion Dual-Write ---');

await test('Scenario 2: Live webhook creates occurrence record & updates host index', async () => {
  const redis = new InMemoryRedis();
  setRedisClient(redis);

  const meetingId = '98765432101';
  const meetingUuid = '4444AAAA-BBBB-CCCC-DDDD-EEEEFFFF0001';
  const hostEmail = 'elena.petrenko@empire.eu';
  const startTime = '2026-09-26T10:00:00Z';

  // 1. meeting.started
  const startReq = createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: meetingId,
          uuid: meetingUuid,
          topic: 'English B2 Upper-Intermediate',
          host_id: 'host_elena',
          host_email: hostEmail,
          start_time: startTime
        }
      }
    }
  });
  const startRes = createMockRes();
  await webhookHandler(startReq, startRes);
  assert.equal(startRes.statusCode, 200);

  // Verify occurrence projection saved under zoom:occurrence:{safeId}
  const safeId = toSafeOccurrenceId(meetingUuid);
  const occ = await getZoomOccurrence(safeId);
  assert.ok(occ, 'Occurrence must be saved');
  assert.equal(occ.uuid, meetingUuid);
  assert.equal(occ.host_email, hostEmail);
  assert.equal(occ.duration_state, 'incomplete'); // Start without end is incomplete

  // Verify host sorted set index updated
  const hostMembers = await redis.zrange(`${HOST_OCCURRENCES_KEY_PREFIX}${hostEmail}`, 0, -1);
  assert.ok(hostMembers.includes(safeId), 'Host index must contain safeId');

  // Verify legacy meeting write is preserved (dual-write)
  const legacyMeeting = await redis.get(`${MEETING_KEY_PREFIX}${meetingId}`);
  assert.ok(legacyMeeting, 'Legacy meeting record must be saved for backward compatibility');

  // 2. participant_joined: Host + Student
  const joinReq = createMockReq({
    body: {
      event: 'meeting.participant_joined',
      payload: {
        object: {
          id: meetingId,
          uuid: meetingUuid,
          host_email: hostEmail,
          participant: {
            user_id: '16778240',
            name: 'Elena Petrenko',
            email: hostEmail,
            join_time: '2026-09-26T10:00:05Z'
          }
        }
      }
    }
  });
  await webhookHandler(joinReq, createMockRes());

  // Student joins
  const studentJoinReq = createMockReq({
    body: {
      event: 'meeting.participant_joined',
      payload: {
        object: {
          id: meetingId,
          uuid: meetingUuid,
          host_email: hostEmail,
          participant: {
            user_id: 'u_student_1',
            name: 'Dmytro Kravchenko',
            email: 'dmytro@softsvit.com',
            join_time: '2026-09-26T10:01:00Z'
          }
        }
      }
    }
  });
  await webhookHandler(studentJoinReq, createMockRes());

  // 3. meeting.ended
  const endReq = createMockReq({
    body: {
      event: 'meeting.ended',
      payload: {
        object: {
          id: meetingId,
          uuid: meetingUuid,
          end_time: '2026-09-26T10:45:00Z'
        }
      }
    }
  });
  await webhookHandler(endReq, createMockRes());

  // Final verification of occurrence projection
  const finalOcc = await getZoomOccurrence(safeId);
  assert.equal(finalOcc.duration_seconds, 2700, '45 min duration (2700 seconds)');
  assert.equal(finalOcc.duration_state, 'complete');
  assert.ok(finalOcc.participants['email_elena.petrenko@empire.eu'], 'Host participant exists');
  assert.ok(finalOcc.participants['email_dmytro@softsvit.com'], 'Student participant exists');
  assert.equal(finalOcc.participants['email_dmytro@softsvit.com'].duration_seconds, 2640); // 44 min
});

await test('Dual-write keeps separate occurrences sharing numeric meeting ID isolated', async () => {
  const redis = new InMemoryRedis();
  setRedisClient(redis);

  const sharedRoomId = '88877766655';
  const uuid1 = 'UUID-SESSION-MORNING-1111';
  const uuid2 = 'UUID-SESSION-EVENING-2222';

  // Occurrence 1: Morning
  await webhookHandler(createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: sharedRoomId,
          uuid: uuid1,
          topic: 'Morning Class',
          host_email: 'teacher@empire.eu',
          start_time: '2026-09-26T08:00:00Z'
        }
      }
    }
  }), createMockRes());

  // Occurrence 2: Evening (same numeric room ID)
  await webhookHandler(createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: sharedRoomId,
          uuid: uuid2,
          topic: 'Evening Class',
          host_email: 'teacher@empire.eu',
          start_time: '2026-09-26T18:00:00Z'
        }
      }
    }
  }), createMockRes());

  const occ1 = await getZoomOccurrence(uuid1);
  const occ2 = await getZoomOccurrence(uuid2);

  assert.ok(occ1 && occ2, 'Both occurrences must exist separately');
  assert.equal(occ1.topic, 'Morning Class');
  assert.equal(occ2.topic, 'Evening Class');
  assert.notEqual(occ1.uuid, occ2.uuid);
});

// ----------------------------------------------------------------------------
// Suite 4: One-Time Historical Migration Adapter
// ----------------------------------------------------------------------------
console.log('\n--- 4. Historical Migration Adapter ---');

await test('Scenario 3: Migration dry-run audits existing Redis records without mutations', async () => {
  const src = new InMemoryRedis();
  const tgt = new InMemoryRedis();

  // Populate source with legacy meeting records
  const legacyMeetings = [
    {
      meeting_id: '10001',
      uuid: 'HIST-UUID-001',
      topic: 'Historical Math 101',
      host_email: 'iryna.zhuravlova@empire.eu',
      start_time: '2026-09-25T08:00:00Z',
      end_time: '2026-09-25T09:00:00Z',
      participants: {
        p1: { name: 'Iryna Zhuravlova', email: 'iryna.zhuravlova@empire.eu', is_host: true, join_time: '2026-09-25T08:00:00Z', leave_time: '2026-09-25T09:00:00Z' }
      }
    },
    {
      // Missing UUID in record, but present in webhook logs
      meeting_id: '10002',
      uuid: '',
      topic: 'Historical Physics',
      host_email: 'iryna.zhuravlova@empire.eu',
      start_time: '2026-09-25T10:00:00Z',
      end_time: '2026-09-25T11:00:00Z'
    },
    {
      // Missing UUID with no log recovery -> should be skipped
      meeting_id: '10003',
      uuid: null,
      topic: 'Unrecoverable Meeting',
      host_email: 'iryna.zhuravlova@empire.eu',
      start_time: '2026-09-25T14:00:00Z'
    },
    {
      // Missing host email -> should be skipped
      meeting_id: '10004',
      uuid: 'HIST-UUID-004',
      topic: 'No Host Meeting',
      host_email: '',
      start_time: '2026-09-25T15:00:00Z'
    }
  ];

  for (const m of legacyMeetings) {
    await src.set(`${MEETING_KEY_PREFIX}${m.meeting_id}`, m);
    await src.zadd(MEETINGS_INDEX_KEY, { score: Date.parse(m.start_time), member: m.meeting_id });
  }

  // Add supplementary log for meeting 10002
  await src.lpush(WEBHOOK_LOGS_KEY, JSON.stringify({
    meeting_id: '10002',
    payload_raw: JSON.stringify({ payload: { object: { uuid: 'HIST-UUID-002-RECOVERED' } } })
  }));

  const report = await runMigration({
    sourceClient: src,
    targetClient: tgt,
    cliArgs: {
      isDryRun: true,
      isExecute: false,
      batchSize: 50,
      reportFile: './test-dry-run-report.json'
    }
  });

  // Verify dry-run statistics
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.totalScanned, 4);
  assert.equal(report.candidates, 2, '2 valid candidates (1 direct UUID, 1 log-recovered)');
  assert.equal(report.readyToMigrate, 2);
  assert.equal(report.skippedMissingUuid, 1);
  assert.equal(report.skippedMissingHost, 1);

  // Assert target Redis had 0 writes
  const targetOccKeys = await tgt.keys(`${OCCURRENCE_KEY_PREFIX}*`);
  assert.equal(targetOccKeys.length, 0, 'Dry-run must not write any occurrence keys');

  const targetHostKeys = await tgt.keys(`${HOST_OCCURRENCES_KEY_PREFIX}*`);
  assert.equal(targetHostKeys.length, 0, 'Dry-run must not write any host index keys');

  // Assert source records are 100% intact
  const srcKeys = await src.keys(`${MEETING_KEY_PREFIX}*`);
  assert.equal(srcKeys.length, 4, 'Source keys must not be modified or deleted');
});

await test('Scenario 4 & 5: Live migration backfills historical meetings and surfaces on teacher page', async () => {
  const src = new InMemoryRedis();
  const tgt = new InMemoryRedis();
  setRedisClient(tgt);
  setOccurrenceRedisClient(tgt);
  resetOccurrenceMemoryStore();

  const teacherEmail = 'iryna.zhuravlova@empire.eu';
  const histUuid = 'HIST-UUID-20260925-01';

  // Seed source
  const legacyRecord = {
    meeting_id: '55512345678',
    uuid: histUuid,
    topic: 'English C1 Advanced',
    host_email: teacherEmail,
    start_time: '2026-09-25T14:00:00Z',
    end_time: '2026-09-25T15:00:00Z',
    participants: {
      p1: { name: 'Iryna Zhuravlova', email: teacherEmail, is_host: true, join_time: '2026-09-25T14:00:00Z', leave_time: '2026-09-25T15:00:00Z' },
      p2: { name: 'Student Anna', email: 'anna@client.com', is_host: false, join_time: '2026-09-25T14:02:00Z', leave_time: '2026-09-25T14:58:00Z' }
    }
  };
  await src.set(`${MEETING_KEY_PREFIX}${legacyRecord.meeting_id}`, legacyRecord);
  await src.zadd(MEETINGS_INDEX_KEY, { score: Date.parse(legacyRecord.start_time), member: legacyRecord.meeting_id });

  const targetFingerprint = getRedactedFingerprint('');

  // Execute live migration
  const report = await runMigration({
    sourceClient: src,
    targetClient: tgt,
    cliArgs: {
      isDryRun: false,
      isExecute: true,
      confirmTarget: targetFingerprint,
      batchSize: 50,
      reportFile: './test-live-report.json'
    }
  });

  assert.equal(report.migrated, 1);

  // Verify target keys
  const safeId = toSafeOccurrenceId(histUuid);
  const occ = await tgt.get(`${OCCURRENCE_KEY_PREFIX}${safeId}`);
  assert.ok(occ, 'Migrated occurrence must exist in target');
  assert.equal(occ.uuid, histUuid);
  assert.equal(occ.duration_seconds, 3600);

  // Verify migration status is 'complete'
  const state = await tgt.get(MIGRATION_STATE_KEY);
  assert.equal(state.status, 'complete');

  // Verify teacher page query for 2026-09-25 returns the backfilled occurrence
  const results = await getZoomOccurrencesForTeacher({
    teacherZoomEmail: teacherEmail,
    teacherEmail,
    fromDate: '2026-09-25',
    toDate: '2026-09-25'
  });

  assert.equal(results.length, 1, 'Teacher must see 1 meeting for 2026-09-25');
  const formatted = formatOccurrenceForDisplay(results[0]);
  assert.equal(formatted.uuid, histUuid);
  assert.equal(formatted.durationMinutes, 60);
  assert.equal(formatted.durationState, 'complete');
  assert.equal(formatted.participantsCount, 2);
});

await test('Scenario 6: Re-running completed live migration is prohibited by completion guard', async () => {
  const tgt = new InMemoryRedis();
  await tgt.set(MIGRATION_STATE_KEY, { status: 'complete', completedAt: new Date().toISOString() });

  const targetFingerprint = getRedactedFingerprint('');

  await assert.rejects(
    async () => {
      await runMigration({
        sourceClient: new InMemoryRedis(),
        targetClient: tgt,
        cliArgs: {
          isDryRun: false,
          isExecute: true,
          confirmTarget: targetFingerprint,
          batchSize: 50,
          reportFile: './test-guard-report.json'
        }
      });
    },
    /Migration CRM-003 has already completed successfully\. Re-running is prohibited\./
  );
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedCount} CRM-003 ACCEPTANCE TESTS PASSED!`);
console.log('====================================================\n');
