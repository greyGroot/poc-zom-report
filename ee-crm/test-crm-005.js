// ee-crm/test-crm-005.js
// Unit & Integration Acceptance Test Suite for CRM-005:
// 1. Source Inventory Export & Schema Validation
// 2. Reused Room Splitting Across Distinct UUIDs
// 3. Deterministic Replay & Shuffled Event Invariance
// 4. UUID-less Derived Identity & Neutral Presentation
// 5. Ambiguous Evidence Blocking
// 6. Contamination Repair of Polluted Projections
// 7. One-Time Execution Guard (Pre-write refusal)
// 8. Interrupted-Run Resume Safety & Hash Lock
// 9. Yuliia Savchuk Historical Regression (12 total, 8 on Sept 21-27)
// 10. POC-Independent Live Ingestion (No numeric room dual-write)
// 11. POC Outage Resilience (No POC dependencies)
// 12. Security Boundary: Route 404 & Middleware Matcher
// 13. End-to-End Read-Back Target Reconciliation
// 14. Scoped Migration Rollback with Live Fact Retention
// 15. Mandatory Teachers Table Scope
// 16. UI ZoomMeetingCard Contract & Localization

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  toSafeOccurrenceId,
  fromSafeOccurrenceId,
  deriveLegacyDerivedId,
  parseOccurrenceIdentity,
  computeProjectionHash,
  validateOccurrenceInvariants,
  deriveFactFingerprint,
  normalizeWebhookEventToFacts,
  reduceOccurrenceFacts,
  calculateIntervalUnionSeconds
} from './lib/zoom-occurrence.js';

import {
  InMemoryRedis,
  setRedisClient,
  resetRedisClient,
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection,
  getZoomOccurrence,
  getCrm005MigrationState,
  setCrm005MigrationState,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  MEETING_KEY_PREFIX,
  CRM_005_MIGRATION_STATE_KEY
} from './lib/redis.js';

import {
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay,
  resetOccurrenceMemoryStore,
  setOccurrenceRedisClient
} from './lib/zoom-occurrences.js';

import webhookHandler from './lib/zoom-webhook-handler.js';
import { translations } from './lib/i18n/translations.js';

import {
  MANDATORY_TEACHERS,
  validateSnapshot,
  validateManifest,
  computeSha256
} from './scripts/crm-005/schema.js';

import { exportSnapshot } from './scripts/crm-005/export-poc-snapshot.js';
import { planMigration } from './scripts/crm-005/plan-zoom-migration.js';
import { executeMigration, getRedactedFingerprint } from './scripts/crm-005/execute-zoom-migration.js';
import { verifyMigration } from './scripts/crm-005/verify-zoom-migration.js';
import { rollbackMigration } from './scripts/crm-005/rollback-zoom-migration.js';

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

// Helper to create a valid planned manifest from an in-memory Redis source
async function createPlannedManifestFromSource(src) {
  const snapshot = await exportSnapshot({ client: src });
  return planMigration(snapshot);
}

// Mock HTTP helpers
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
console.log('🧪 CRM-005 One-Time Zoom Migration & Ingestion Tests');
console.log('====================================================\n');

// ----------------------------------------------------------------------------
// 1. Source Inventory Export & Schema Validation (AC-1)
// ----------------------------------------------------------------------------
console.log('--- 1. Source Inventory Export & Schema Validation ---');

await test('Scenario 1: exportSnapshot reads full inventory and produces valid immutable snapshot', async () => {
  const src = new InMemoryRedis();

  // Populate source with meeting keys, sorted set index, and webhook logs list
  await src.set('zoom:meeting:9001', {
    meeting_id: '9001',
    uuid: 'UUID-EXP-1',
    topic: 'Export Test Class',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-22T08:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-22T08:00:00Z'), member: '9001' });

  // Add 10 logs
  for (let i = 0; i < 10; i++) {
    await src.lpush('zoom:webhook:logs', {
      meeting_id: '9001',
      event: 'meeting.started',
      timestamp: `2026-09-22T08:00:0${i}Z`
    });
  }

  const snapshot = await exportSnapshot({
    client: src
  });

  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.counts.meeting_records_count, 1);
  assert.equal(snapshot.counts.meeting_index_count, 1);
  assert.equal(snapshot.counts.webhook_log_entries_count, 10);
  assert.ok(snapshot.content_sha256, 'Snapshot must include deterministic SHA-256 hash');

  const validation = validateSnapshot(snapshot);
  assert.equal(validation.valid, true, 'Snapshot schema must validate successfully');

  // Verify source had 0 mutations
  const keyAfter = await src.get('zoom:meeting:9001');
  assert.ok(keyAfter, 'Source data must not be modified or deleted');
});

// ----------------------------------------------------------------------------
// 2. Reused Room Splitting Across Distinct UUIDs (AC-2)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Reused Room Splitting Across Distinct UUIDs ---');

await test('Scenario 2: Distinct occurrences sharing numeric room ID are partitioned cleanly', async () => {
  const roomId = '55544433322';
  const uuid1 = 'ROOM-REUSE-SESSION-1';
  const uuid2 = 'ROOM-REUSE-SESSION-2';
  const teacherEmail = 'yuliasavchuk03@gmail.com';

  const src = new InMemoryRedis();
  await src.set(`zoom:meeting:${roomId}`, {
    meeting_id: roomId,
    uuid: uuid1,
    topic: 'Morning Session',
    host_email: teacherEmail,
    start_time: '2026-09-22T08:00:00Z',
    end_time: '2026-09-22T09:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-22T08:00:00Z'), member: roomId });
  await src.lpush('zoom:webhook:logs', {
    meeting_id: roomId,
    event: 'meeting.started',
    timestamp: '2026-09-22T08:00:00Z',
    payload_raw: JSON.stringify({
      event: 'meeting.started',
      payload: {
        object: {
          id: roomId,
          uuid: uuid1,
          topic: 'Morning Session',
          host_email: teacherEmail,
          start_time: '2026-09-22T08:00:00Z'
        }
      }
    })
  });
  await src.lpush('zoom:webhook:logs', {
    meeting_id: roomId,
    event: 'meeting.started',
    timestamp: '2026-09-22T17:00:00Z',
    payload_raw: JSON.stringify({
      event: 'meeting.started',
      payload: {
        object: {
          id: roomId,
          uuid: uuid2,
          topic: 'Evening Session',
          host_email: teacherEmail,
          start_time: '2026-09-22T17:00:00Z'
        }
      }
    })
  });

  const snapshot = await exportSnapshot({ client: src });
  const manifest = planMigration(snapshot);
  assert.equal(manifest.occurrences.length, 2, 'Must produce 2 distinct occurrences for the shared room');

  const occ1 = manifest.occurrences.find(o => o.uuid === uuid1);
  const occ2 = manifest.occurrences.find(o => o.uuid === uuid2);
  assert.ok(occ1 && occ2, 'Both UUIDs must exist as separate planned occurrences');
  assert.notEqual(occ1.occurrence_id, occ2.occurrence_id);
  assert.equal(occ1.topic, 'Morning Session');
  assert.equal(occ2.topic, 'Evening Session');
});

// ----------------------------------------------------------------------------
// 3. Deterministic Replay & Shuffled Event Invariance (AC-3)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Deterministic Replay & Shuffled Invariance ---');

await test('Scenario 3: Shuffled or replayed event order produces identical projection and hash', () => {
  const uuid = 'DETERMINISTIC-ORDER-UUID-99';
  const hostEmail = 'zhur.zhur.irene@gmail.com';

  const factsChronological = [
    {
      type: 'meeting.started',
      occurrence_id: uuid,
      identity_kind: 'exact_uuid',
      start_time: '2026-09-23T10:00:00Z',
      source_timestamp: '2026-09-23T10:00:00Z',
      host_email: hostEmail,
      topic: 'Math Mastery'
    },
    {
      type: 'participant.joined',
      occurrence_id: uuid,
      identity_kind: 'exact_uuid',
      user_id: 'p1',
      name: 'Student Bohdan',
      email: 'bohdan@example.com',
      join_time: '2026-09-23T10:02:00Z',
      source_timestamp: '2026-09-23T10:02:00Z'
    },
    {
      type: 'participant.left',
      occurrence_id: uuid,
      identity_kind: 'exact_uuid',
      user_id: 'p1',
      name: 'Student Bohdan',
      email: 'bohdan@example.com',
      leave_time: '2026-09-23T10:45:00Z',
      source_timestamp: '2026-09-23T10:45:00Z'
    },
    {
      type: 'meeting.ended',
      occurrence_id: uuid,
      identity_kind: 'exact_uuid',
      end_time: '2026-09-23T10:45:00Z',
      source_timestamp: '2026-09-23T10:45:00Z'
    }
  ];

  const factsShuffled = [factsChronological[1], factsChronological[3], factsChronological[0], factsChronological[2]];
  const factsDuplicated = [...factsChronological, factsChronological[0], factsChronological[1]];

  const proj1 = reduceOccurrenceFacts(uuid, factsChronological);
  const proj2 = reduceOccurrenceFacts(uuid, factsShuffled);
  const proj3 = reduceOccurrenceFacts(uuid, factsDuplicated);

  assert.equal(proj1.projection_hash, proj2.projection_hash, 'Chronological and shuffled must yield identical hash');
  assert.equal(proj1.projection_hash, proj3.projection_hash, 'Duplicate facts must be idempotent and yield identical hash');
  assert.equal(proj1.duration_seconds, 2700);
});

// ----------------------------------------------------------------------------
// 4. UUID-less Derived Identity & Presentation (AC-4)
// ----------------------------------------------------------------------------
console.log('\n--- 4. UUID-less Derived Identity ---');

await test('Scenario 4: Missing UUID generates deterministic legacy:poc:v1 identity and nullable uuid', () => {
  const numericId = '1234567890';
  const startTime = '2026-09-18T14:00:00Z';
  const hostEmail = 'yuliasavchuk03@gmail.com';

  const derivedId = deriveLegacyDerivedId({
    meeting_id: numericId,
    start_time: startTime,
    host_email: hostEmail
  });

  assert.ok(derivedId.startsWith('legacy:poc:v1:'), 'Derived ID must use canonical legacy:poc:v1 prefix');
  const parsed = parseOccurrenceIdentity(derivedId);
  assert.equal(parsed.identity_kind, 'legacy_derived');
  assert.equal(parsed.occurrence_id, derivedId);

  // Identity obj with nullable uuid
  const identity = {
    occurrence_id: derivedId,
    uuid: null,
    identity_kind: 'legacy_derived',
    identity_provenance: { source: 'poc-zoom-report', legacy_meeting_id: numericId }
  };

  const facts = [
    {
      type: 'meeting.started',
      occurrence_id: derivedId,
      identity_kind: 'legacy_derived',
      start_time: startTime,
      source_timestamp: startTime,
      host_email: hostEmail,
      topic: 'Legacy Session'
    },
    {
      type: 'meeting.ended',
      occurrence_id: derivedId,
      identity_kind: 'legacy_derived',
      end_time: '2026-09-18T14:45:00Z',
      source_timestamp: '2026-09-18T14:45:00Z'
    }
  ];

  const proj = reduceOccurrenceFacts(identity, facts);
  assert.equal(proj.uuid, null, 'UUID must remain null');
  assert.equal(proj.identity_kind, 'legacy_derived');
  assert.equal(proj.duration_seconds, 2700);

  // Test formatOccurrenceForDisplay
  const formatted = formatOccurrenceForDisplay(proj);
  assert.equal(formatted.uuid, null);
  assert.equal(formatted.identityKind, 'legacy_derived');
  assert.equal(formatted.id, toSafeOccurrenceId(derivedId));
});

// ----------------------------------------------------------------------------
// 5. Ambiguous Evidence Blocking (AC-5)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Ambiguous Evidence Blocking ---');

await test('Scenario 5: Ambiguous evidence without host or time blocks execution', async () => {
  const src = new InMemoryRedis();
  await src.set('zoom:meeting:99999', {
    meeting_id: '99999',
    uuid: null, // No UUID
    host_email: '', // Missing host email!
    start_time: '2026-09-20T10:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-20T10:00:00Z'), member: '99999' });

  const snapshotWithAmbiguity = await exportSnapshot({ client: src });
  const manifest = planMigration(snapshotWithAmbiguity);
  assert.ok(manifest.blocking_errors.length > 0, 'Planner must flag blocking errors for ambiguous legacy meeting');

  // Attempt to execute must throw before writing
  const target = new InMemoryRedis();
  await assert.rejects(
    async () => {
      await executeMigration({ manifest, targetClient: target });
    },
    /Manifest contains.*blocking/
  );
});

// ----------------------------------------------------------------------------
// 6. Contamination Repair of Polluted Projections (AC-6)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Contamination Repair ---');

await test('Scenario 6: Execution repairs contaminated multi-day participant sessions', async () => {
  const target = new InMemoryRedis();
  const uuid = 'CONTAMINATED-ROOM-UUID-1';
  const safeId = toSafeOccurrenceId(uuid);
  const hostEmail = 'yuliasavchuk03@gmail.com';

  // Seed a contaminated projection from CRM-003 with merged multi-day participant sessions
  await target.set(`${OCCURRENCE_KEY_PREFIX}${safeId}`, {
    occurrence_id: uuid,
    uuid,
    identity_kind: 'exact_uuid',
    host_email: hostEmail,
    topic: 'Polluted Room',
    duration_seconds: 14400, // 4 hours inflated across 2 days!
    duration_state: 'complete',
    revision: 1
  });
  await target.zadd(`${HOST_OCCURRENCES_KEY_PREFIX}${hostEmail}`, { score: Date.parse('2026-09-23T10:00:00Z'), member: safeId });

  // Source has the actual 45-minute occurrence
  const src = new InMemoryRedis();
  await src.set('zoom:meeting:6001', {
    meeting_id: '6001',
    uuid,
    topic: 'Repaired Class',
    host_email: hostEmail,
    start_time: '2026-09-23T10:00:00Z',
    end_time: '2026-09-23T10:45:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-23T10:00:00Z'), member: '6001' });

  const manifest = await createPlannedManifestFromSource(src);

  const execResult = await executeMigration({
    manifest,
    targetClient: target
  });

  assert.equal(execResult.success, true);

  // Check that the projection is repaired to 2700 seconds (45 min)
  const repaired = await target.get(`${OCCURRENCE_KEY_PREFIX}${safeId}`);
  assert.equal(repaired.duration_seconds, 2700, 'Duration must be repaired from 14400s down to 2700s');
});

// ----------------------------------------------------------------------------
// 7. One-Time Execution Guard (AC-7)
// ----------------------------------------------------------------------------
console.log('\n--- 7. One-Time Execution Guard ---');

await test('Scenario 7: Re-running completed migration is prohibited before writes', async () => {
  const target = new InMemoryRedis();
  await setCrm005MigrationState({ status: 'complete', completed_at: new Date().toISOString() }, target);

  const src = new InMemoryRedis();
  const manifest = await createPlannedManifestFromSource(src);

  await assert.rejects(
    async () => {
      await executeMigration({ manifest, targetClient: target });
    },
    /Migration CRM-005 has already completed successfully\. Re-running is prohibited\./
  );
});

// ----------------------------------------------------------------------------
// 8. Interrupted-Run Resume Safety (AC-8)
// ----------------------------------------------------------------------------
console.log('\n--- 8. Interrupted-Run Resume Safety ---');

await test('Scenario 8: Resumes with identical run/snapshot/manifest; rejects mismatch', async () => {
  const target = new InMemoryRedis();
  const src = new InMemoryRedis();
  await src.set('zoom:meeting:8001', {
    meeting_id: '8001',
    uuid: 'UUID-RESUME-1',
    topic: 'Resume Test',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-25T10:00:00Z',
    end_time: '2026-09-25T11:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-25T10:00:00Z'), member: '8001' });

  const correctManifest = await createPlannedManifestFromSource(src);

  // Set running state with checkpoint
  await setCrm005MigrationState({
    status: 'running',
    run_id: 'run_test_resume',
    snapshot_sha256: correctManifest.snapshot_sha256,
    manifest_sha256: correctManifest.manifest_sha256,
    checkpoint: { lastProcessedIndex: 0 }
  }, target);

  const mismatchedManifest = {
    ...correctManifest,
    manifest_sha256: 'manifest_DIFFERENT_HASH'
  };

  // 1. Mismatch must fail
  await assert.rejects(
    async () => {
      await executeMigration({ manifest: mismatchedManifest, targetClient: target, resume: true });
    },
    /Resume rejected: Manifest hash mismatch/
  );

  // 2. Matching resume succeeds
  const res = await executeMigration({ manifest: correctManifest, targetClient: target, resume: true });
  assert.equal(res.success, true);
  assert.equal(res.runId, 'run_test_resume');
});

// ----------------------------------------------------------------------------
// 9. Yuliia Savchuk Historical Regression (AC-9)
// ----------------------------------------------------------------------------
console.log('\n--- 9. Yuliia Historical Regression ---');

await test('Scenario 9: Yuliia Savchuk has 12 historical occurrences total, 8 on Sept 21-27', async () => {
  const target = new InMemoryRedis();
  setRedisClient(target);
  setOccurrenceRedisClient(target);
  resetOccurrenceMemoryStore();

  const teacherEmail = 'yuliasavchuk03@gmail.com';

  // Seed 12 occurrences for Yuliia:
  // 1 on Sept 18 (legacy-derived)
  // 8 on Sept 21-27 (exact UUIDs)
  // 3 on Sept 14-16 (exact UUIDs)
  const src = new InMemoryRedis();

  // 1 on Sept 18 (UUID-less legacy meeting)
  await src.set('zoom:meeting:7770001', {
    meeting_id: '7770001',
    uuid: null,
    topic: 'Sept 18 Derived Class',
    host_email: teacherEmail,
    start_time: '2026-09-18T10:00:00Z',
    end_time: '2026-09-18T11:00:00Z',
    participants: {
      p1: { name: 'Yuliia Savchuk', email: teacherEmail, is_host: true, join_time: '2026-09-18T10:00:00Z', leave_time: '2026-09-18T11:00:00Z' }
    }
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-18T10:00:00Z'), member: '7770001' });

  // 3 on Sept 14, 15, 16 (exact UUIDs)
  for (let day = 14; day <= 16; day++) {
    const uuid = `UUID-YULIIA-SEPT-${day}`;
    const id = `77700${day}`;
    await src.set(`zoom:meeting:${id}`, {
      meeting_id: id,
      uuid,
      topic: `Sept ${day} Class`,
      host_email: teacherEmail,
      start_time: `2026-09-${day}T10:00:00Z`,
      end_time: `2026-09-${day}T11:00:00Z`
    });
    await src.zadd('zoom:meetings:index', { score: Date.parse(`2026-09-${day}T10:00:00Z`), member: id });
  }

  // 8 on Sept 21-27 (exact UUIDs)
  const sept21_27_dates = [
    '2026-09-21T09:00:00Z',
    '2026-09-22T08:00:00Z',
    '2026-09-22T14:00:00Z',
    '2026-09-23T10:00:00Z',
    '2026-09-24T11:00:00Z',
    '2026-09-25T12:00:00Z',
    '2026-09-26T13:00:00Z',
    '2026-09-27T14:00:00Z'
  ];

  for (let i = 0; i < sept21_27_dates.length; i++) {
    const start = sept21_27_dates[i];
    const uuid = `UUID-YULIIA-SEPT2127-${i + 1}`;
    const id = `7770${21 + i}`;
    await src.set(`zoom:meeting:${id}`, {
      meeting_id: id,
      uuid,
      topic: `Class Sept 21-27 #${i + 1}`,
      host_email: teacherEmail,
      start_time: start,
      end_time: new Date(Date.parse(start) + 3600000).toISOString()
    });
    await src.zadd('zoom:meetings:index', { score: Date.parse(start), member: id });
  }

  const manifest = await createPlannedManifestFromSource(src);
  await executeMigration({ manifest, targetClient: target });

  // 1. Query all historical: must return 12
  const allHistorical = await getZoomOccurrencesForTeacher({
    teacherZoomEmail: teacherEmail,
    teacherEmail,
    fromDate: '2026-09-01',
    toDate: '2026-09-30'
  });
  assert.equal(allHistorical.length, 12, 'Yuliia must have 12 occurrences across Sept');

  // 2. Query Sept 21-27: must return exactly 8
  const sept2127 = await getZoomOccurrencesForTeacher({
    teacherZoomEmail: teacherEmail,
    teacherEmail,
    fromDate: '2026-09-21',
    toDate: '2026-09-27'
  });
  assert.equal(sept2127.length, 8, 'Yuliia must have exactly 8 occurrences for Sept 21-27');
});

// ----------------------------------------------------------------------------
// 10. POC-Independent Live Ingestion (AC-10)
// ----------------------------------------------------------------------------
console.log('\n--- 10. POC-Independent Live Ingestion ---');

await test('Scenario 10: Live webhook handler writes occurrences without legacy zoom:meeting keys', async () => {
  const redis = new InMemoryRedis();
  setRedisClient(redis);

  const meetingId = '88800011122';
  const meetingUuid = 'LIVE-SESSION-INDEPENDENT-1';
  const hostEmail = 'kondratovicana4@gmail.com';

  const startReq = createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: meetingId,
          uuid: meetingUuid,
          topic: 'Independent Class',
          host_email: hostEmail,
          start_time: '2026-09-27T08:00:00Z'
        }
      }
    }
  });
  const startRes = createMockRes();
  await webhookHandler(startReq, startRes);
  assert.equal(startRes.statusCode, 200);

  // Verify occurrence exists
  const occ = await getZoomOccurrence(meetingUuid);
  assert.ok(occ, 'Occurrence projection must be saved');
  assert.equal(occ.uuid, meetingUuid);
  assert.equal(occ.host_email, hostEmail);

  // CRITICAL REQUIREMENT: Legacy numeric room aggregate MUST NOT be written
  const legacyRoomKey = await redis.get(`${MEETING_KEY_PREFIX}${meetingId}`);
  assert.equal(legacyRoomKey, null, 'Live ingestion must NOT write to legacy zoom:meeting:* keys');
});

// ----------------------------------------------------------------------------
// 11. POC Outage Resilience (AC-11)
// ----------------------------------------------------------------------------
console.log('\n--- 11. POC Outage Resilience ---');

await test('Scenario 11: System handles live traffic with no POC runtime dependencies', async () => {
  // Clear any POC env vars if present
  delete process.env.POC_REDIS_REST_URL;
  delete process.env.POC_REDIS_REST_TOKEN;

  const redis = new InMemoryRedis();
  setRedisClient(redis);

  const uuid = 'OUTAGE-RESILIENCE-UUID-1';
  const req = createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: '9999999',
          uuid,
          topic: 'Resilience Test',
          host_email: 'helhakushnirchuk@gmail.com',
          start_time: '2026-09-27T09:00:00Z'
        }
      }
    }
  });
  const res = createMockRes();
  await webhookHandler(req, res);
  assert.equal(res.statusCode, 200);

  const occ = await getZoomOccurrence(uuid);
  assert.ok(occ, 'Occurrence must be stored successfully without POC connectivity');
});

// ----------------------------------------------------------------------------
// 12. Security Boundary: Route 404 & Middleware Matcher (AC-12)
// ----------------------------------------------------------------------------
console.log('\n--- 12. Security Boundary: Route 404 & Middleware ---');

await test('Scenario 12: Migration route does not exist and is not excluded by middleware matcher', () => {
  const routePath = path.resolve(process.cwd(), 'app/api/migrations/zoom/route.js');
  assert.equal(fs.existsSync(routePath), false, 'ee-crm/app/api/migrations/zoom/route.js must be deleted');

  // NextAuth middleware matcher test:
  // Public/excluded paths return false in doesMatcherMatch (bypass auth).
  // Protected/non-exempt paths return true in doesMatcherMatch (intercepted by NextAuth).
  const matches = doesMatcherMatch('/api/migrations/zoom');
  assert.equal(matches, true, '/api/migrations/zoom must NOT be exempt from NextAuth middleware');
});

// ----------------------------------------------------------------------------
// 13. End-to-End Read-Back Target Reconciliation (AC-13)
// ----------------------------------------------------------------------------
console.log('\n--- 13. Read-Back Target Reconciliation ---');

await test('Scenario 13: Target reconciliation verifies existence, projection hash, and host index', async () => {
  const target = new InMemoryRedis();
  const src = new InMemoryRedis();
  const uuid = 'RECONCILIATION-UUID-1';
  const hostEmail = 'dmytrasevych@ukr.net';

  await src.set('zoom:meeting:1301', {
    meeting_id: '1301',
    uuid,
    topic: 'Recon Class',
    host_email: hostEmail,
    start_time: '2026-09-24T14:00:00Z',
    end_time: '2026-09-24T15:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-24T14:00:00Z'), member: '1301' });

  const manifest = await createPlannedManifestFromSource(src);
  await executeMigration({ manifest, targetClient: target });

  const result = await verifyMigration({ manifest, targetClient: target });
  assert.equal(result.success, true);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.errors.length, 0);
});

// ----------------------------------------------------------------------------
// 14. Scoped Migration Rollback (AC-14)
// ----------------------------------------------------------------------------
console.log('\n--- 14. Scoped Migration Rollback ---');

await test('Scenario 14: Rollback removes migration facts and restores live state', async () => {
  const target = new InMemoryRedis();
  const src = new InMemoryRedis();
  const uuid = 'ROLLBACK-TARGET-UUID-1';
  const safeId = toSafeOccurrenceId(uuid);
  const hostEmail = 'svmartynenko74@gmail.com';

  await src.set('zoom:meeting:1401', {
    meeting_id: '1401',
    uuid,
    topic: 'Rollback Class',
    host_email: hostEmail,
    start_time: '2026-09-25T10:00:00Z',
    end_time: '2026-09-25T11:00:00Z'
  });
  await src.zadd('zoom:meetings:index', { score: Date.parse('2026-09-25T10:00:00Z'), member: '1401' });

  const manifest = await createPlannedManifestFromSource(src);

  // 1. Execute migration
  await executeMigration({ manifest, targetClient: target });

  // 2. Add a concurrent live fact to the occurrence
  await saveOccurrenceFact(safeId, {
    type: 'participant.joined',
    occurrence_id: uuid,
    identity_kind: 'exact_uuid',
    user_id: 'live_user',
    name: 'Live Student',
    join_time: '2026-09-25T10:05:00Z',
    source_timestamp: '2026-09-25T10:05:00Z'
  }, target);

  // 3. Roll back migration
  const rollbackRes = await rollbackMigration({
    manifest,
    targetClient: target,
    confirmRollback: 'complete'
  });

  assert.equal(rollbackRes.success, true);
  assert.equal(rollbackRes.rolledBackState.re_reduced_live_occurrences, 1);

  // Verify only live facts remain
  const remainingFacts = await getOccurrenceFacts(safeId, target);
  assert.equal(remainingFacts.length, 1);
  assert.equal(remainingFacts[0].user_id, 'live_user');

  // Verify state marked rolled_back
  const state = await getCrm005MigrationState(target);
  assert.equal(state.status, 'rolled_back');
});

// ----------------------------------------------------------------------------
// 15. Mandatory Teachers Table Scope (AC-15)
// ----------------------------------------------------------------------------
console.log('\n--- 15. Mandatory Teachers Table Scope ---');

await test('Scenario 15: All 6 mandatory teachers are verified and indexed', () => {
  const expectedTeachers = [
    'dmytrasevych@ukr.net',
    'kondratovicana4@gmail.com',
    'helhakushnirchuk@gmail.com',
    'svmartynenko74@gmail.com',
    'yuliasavchuk03@gmail.com',
    'zhur.zhur.irene@gmail.com'
  ];

  assert.equal(MANDATORY_TEACHERS.length, 6);
  for (const t of expectedTeachers) {
    const found = MANDATORY_TEACHERS.find(m => m.email === t);
    assert.ok(found, `Mandatory teacher ${t} must be present in schema`);
  }
});

// ----------------------------------------------------------------------------
// 16. UI ZoomMeetingCard Contract & Localization (AC-16)
// ----------------------------------------------------------------------------
console.log('\n--- 16. UI ZoomMeetingCard Contract & Localization ---');

await test('Scenario 16: Formatted occurrence displays neutral state for legacy derived sessions', () => {
  // 1. Translations exist
  assert.equal(translations.en.schedule.legacyReconstructedOccurrence, 'Legacy reconstructed occurrence');
  assert.equal(translations.uk.schedule.legacyReconstructedOccurrence, 'Відновлена застаріла зустріч');
  assert.equal(translations.pl.schedule.legacyReconstructedOccurrence, 'Odtworzone spotkanie archiwalne');

  assert.ok(translations.en.schedule.uuidUnavailable);

  // 2. Exact UUID format
  const exactRecord = {
    occurrence_id: 'EXACT-UUID-1234',
    uuid: 'EXACT-UUID-1234',
    identity_kind: 'exact_uuid',
    start_time: '2026-09-25T10:00:00Z',
    end_time: '2026-09-25T10:45:00Z',
    duration_seconds: 2700,
    duration_state: 'complete',
    participants: {}
  };
  const exactFormatted = formatOccurrenceForDisplay(exactRecord);
  assert.equal(exactFormatted.uuid, 'EXACT-UUID-1234');
  assert.equal(exactFormatted.identityKind, 'exact_uuid');

  // 3. Derived format
  const derivedRecord = {
    occurrence_id: 'legacy:poc:v1:abc1234567890',
    uuid: null,
    identity_kind: 'legacy_derived',
    start_time: '2026-09-18T10:00:00Z',
    end_time: '2026-09-18T10:45:00Z',
    duration_seconds: 2700,
    duration_state: 'complete',
    participants: {}
  };
  const derivedFormatted = formatOccurrenceForDisplay(derivedRecord);
  assert.equal(derivedFormatted.uuid, null);
  assert.equal(derivedFormatted.identityKind, 'legacy_derived');
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedCount} CRM-005 ACCEPTANCE TESTS PASSED!`);
console.log('====================================================\n');
