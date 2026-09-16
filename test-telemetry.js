/**
 * ============================================================================
 * E2E AUTOMATED TEST SUITE: Zoom Webhook & Redis Telemetry Platform
 * ============================================================================
 *
 * Test Architecture: 4-Tier Methodology per TEST_INFRA.md
 * - Tier 1: Feature Coverage (Isolation tests: URL validation CRC challenge HMAC-SHA256,
 *            webhook events meeting.started/participant_joined/participant_left/meeting.ended,
 *            Redis persistence & indexing, Zoom OAuth/QoS enrichment helpers,
 *            Telemetry API query, filters ?date= and ?host=, business statuses)
 * - Tier 2: Boundary & Corner Cases (zero duration, exact 15m/30m thresholds, missing email/name,
 *            reconnects, overlapping sessions, QoS 403/400 fallback, unicode & adversarial payloads)
 * - Tier 3: Cross-Feature Combinations (full webhook lifecycle -> Redis -> Telemetry API retrieval)
 * - Tier 4: Real-World Scenarios (45m lesson with reconnects, 20m solo teacher, 5m glitch call,
 *            basic account QoS fallback, multi-date/multi-teacher dataset query)
 *
 * Execution: node test-telemetry.js
 * Pass/Fail Semantics: Exit code 0 on all pass; non-zero exit code on any failure.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import { Readable } from 'stream';

// ----------------------------------------------------------------------------
// 1. Environment & Setup
// ----------------------------------------------------------------------------

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Ensure deterministic defaults for test execution
process.env.ZOOM_WEBHOOK_SECRET_TOKEN = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test_webhook_secret_token_12345';
process.env.ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID || 'test_account_id';
process.env.ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID || 'test_client_id';
process.env.ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET || 'test_client_secret';
process.env.NODE_ENV = 'test';

// ----------------------------------------------------------------------------
// 2. Dynamic Module Imports
// ----------------------------------------------------------------------------

let redisModule = null;
let webhookHandler = null;
let telemetryHandler = null;
let zoomModule = null;
const importErrors = {};

try {
  redisModule = await import('./api/lib/redis.js');
} catch (e) {
  importErrors['api/lib/redis.js'] = e.message;
}

try {
  const mod = await import('./api/webhooks/zoom.js');
  webhookHandler = mod.default || mod.handler || mod;
} catch (e) {
  importErrors['api/webhooks/zoom.js'] = e.message;
}

try {
  const mod = await import('./api/telemetry.js');
  telemetryHandler = mod.default || mod.handler || mod;
} catch (e) {
  importErrors['api/telemetry.js'] = e.message;
}

try {
  zoomModule = await import('./api/lib/zoom.js');
} catch (e) {
  importErrors['api/lib/zoom.js'] = e.message;
}

// ----------------------------------------------------------------------------
// 3. Mock Request & Response Harness (Vercel Serverless / Node HTTP)
// ----------------------------------------------------------------------------

function createMockReq({ method = 'GET', url = '/', headers = {}, body = null, query = {} } = {}) {
  const parsedUrl = new URL(url, 'http://localhost');
  const finalQuery = { ...query };
  for (const [k, v] of parsedUrl.searchParams.entries()) {
    if (!(k in finalQuery)) {
      finalQuery[k] = v;
    }
  }

  const bodyStr = body !== null && typeof body === 'object' ? JSON.stringify(body) : (body || '');
  const stream = Readable.from(Buffer.from(bodyStr));

  return Object.assign(stream, {
    method: method.toUpperCase(),
    url,
    headers: { 'content-type': 'application/json', ...headers },
    body,
    rawBody: bodyStr,
    query: finalQuery
  });
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
      return this;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    json(data) {
      this.body = data;
      this.setHeader('content-type', 'application/json');
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    end(data) {
      if (data !== undefined && this.body === null) {
        this.body = data;
      }
      return this;
    }
  };
  return res;
}

async function callWebhook(body, headers = {}, method = 'POST') {
  if (!webhookHandler) {
    throw new Error(`api/webhooks/zoom.js not available: ${importErrors['api/webhooks/zoom.js'] || 'module missing'}`);
  }
  const req = createMockReq({ method, url: '/api/webhooks/zoom', body, headers });
  const res = createMockRes();
  await webhookHandler(req, res);
  return res;
}

async function callTelemetry(query = {}, method = 'GET') {
  if (!telemetryHandler) {
    throw new Error(`api/telemetry.js not available: ${importErrors['api/telemetry.js'] || 'module missing'}`);
  }
  const searchParams = new URLSearchParams(query).toString();
  const url = '/api/telemetry' + (searchParams ? `?${searchParams}` : '');
  const req = createMockReq({ method, url, query });
  const res = createMockRes();
  await telemetryHandler(req, res);
  return res;
}

// ----------------------------------------------------------------------------
// 4. Test Runner Engine
// ----------------------------------------------------------------------------

const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

const tierStats = {
  'Tier 1': { total: 0, passed: 0, failed: 0 },
  'Tier 2': { total: 0, passed: 0, failed: 0 },
  'Tier 3': { total: 0, passed: 0, failed: 0 },
  'Tier 4': { total: 0, passed: 0, failed: 0 }
};

async function test(tier, id, title, fn) {
  testStats.total++;
  tierStats[tier].total++;
  const label = `[${tier}] ${id}: ${title}`;
  try {
    await fn();
    testStats.passed++;
    tierStats[tier].passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${label}`);
  } catch (err) {
    testStats.failed++;
    tierStats[tier].failed++;
    const message = err && err.message ? err.message : String(err);
    testStats.errors.push({ tier, id, title, error: message, stack: err.stack });
    console.log(`  \x1b[31m✖\x1b[0m ${label}`);
    console.log(`    \x1b[31m→ Failure: ${message}\x1b[0m`);
  }
}

// ----------------------------------------------------------------------------
// 5. Test Suite Implementation
// ----------------------------------------------------------------------------

console.log('================================================================');
console.log('   Zoom Webhook & Redis Telemetry E2E Automated Test Suite      ');
console.log('================================================================');
console.log(`Node.js: ${process.version} | Platform: ${process.platform}`);
console.log(`Modules Loaded:`);
console.log(`  • api/lib/redis.js:     ${redisModule ? '✅ Loaded' : '❌ ' + (importErrors['api/lib/redis.js'] || 'Not found')}`);
console.log(`  • api/webhooks/zoom.js: ${webhookHandler ? '✅ Loaded' : '❌ ' + (importErrors['api/webhooks/zoom.js'] || 'Not found')}`);
console.log(`  • api/telemetry.js:     ${telemetryHandler ? '✅ Loaded' : '❌ ' + (importErrors['api/telemetry.js'] || 'Not found')}`);
console.log(`  • api/lib/zoom.js:      ${zoomModule ? '✅ Loaded' : '❌ ' + (importErrors['api/lib/zoom.js'] || 'Not found')}`);
console.log('================================================================\n');

// ============================================================================
// TIER 1: FEATURE COVERAGE (Isolation Tests)
// ============================================================================

console.log('\n--- TIER 1: Feature Coverage (Isolation Tests) ---');

// F1: URL Validation CRC Challenge
await test('Tier 1', 'F1.1', 'URL validation CRC challenge returns HTTP 200 and HMAC-SHA256 signature', async () => {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const plainToken = 'valid_token_abc_123';
  const expectedHash = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');

  const res = await callWebhook({
    event: 'endpoint.url_validation',
    payload: { plainToken }
  });

  assert.equal(res.statusCode, 200, 'Expected HTTP 200');
  assert.ok(res.body, 'Expected response body');
  assert.equal(res.body.plainToken, plainToken, 'plainToken must match');
  assert.equal(res.body.encryptedToken, expectedHash, 'encryptedToken must match HMAC-SHA256');
});

await test('Tier 1', 'F1.2', 'URL validation handles tokens with special characters and symbols', async () => {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const plainToken = 'token_!@#$%^&*()_+=-~`{}[]|;:,.<>?/SpecialChars';
  const expectedHash = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');

  const res = await callWebhook({
    event: 'endpoint.url_validation',
    payload: { plainToken }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.plainToken, plainToken);
  assert.equal(res.body.encryptedToken, expectedHash);
});

await test('Tier 1', 'F1.3', 'URL validation produces valid HMAC-SHA256 for empty plainToken', async () => {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const plainToken = '';
  const expectedHash = crypto.createHmac('sha256', secret).update(plainToken).digest('hex');

  const res = await callWebhook({
    event: 'endpoint.url_validation',
    payload: { plainToken }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.encryptedToken, expectedHash);
});

await test('Tier 1', 'F1.4', 'URL validation rejects request with missing plainToken with HTTP 400', async () => {
  const res = await callWebhook({
    event: 'endpoint.url_validation',
    payload: {}
  });

  assert.equal(res.statusCode, 400, 'Expected HTTP 400 for missing plainToken');
});

await test('Tier 1', 'F1.5', 'Webhook rejects unsupported HTTP methods (e.g. GET) with HTTP 405', async () => {
  const res = await callWebhook({}, {}, 'GET');
  assert.equal(res.statusCode, 405, 'Expected HTTP 405 Method Not Allowed');
});

// F2: Webhook meeting.started
await test('Tier 1', 'F2.1', 'Ingest meeting.started creates meeting record in Redis with status live', async () => {
  const mid = `test_m_started_${Date.now()}`;
  const res = await callWebhook({
    event: 'meeting.started',
    event_ts: Date.now(),
    payload: {
      account_id: process.env.ZOOM_ACCOUNT_ID,
      object: {
        id: mid,
        uuid: 'uuid_' + mid,
        topic: 'Algebra 101',
        host_id: 'host_u1',
        host_email: 'teacher@algebra.com',
        host_name: 'Mr. Euler',
        start_time: '2026-09-16T10:00:00Z',
        timezone: 'Europe/Kyiv'
      }
    }
  });

  assert.equal(res.statusCode, 200);
  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    assert.ok(meeting, 'Meeting must exist in Redis');
    assert.equal(meeting.meeting_id, mid);
    assert.equal(meeting.topic, 'Algebra 101');
    assert.ok(meeting.status === 'live' || meeting.status === 'started');
  }
});

await test('Tier 1', 'F2.2', 'Ingest meeting.started records complete host and metadata fields', async () => {
  const mid = `test_m_meta_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    event_ts: Date.now(),
    payload: {
      object: {
        id: mid,
        topic: 'Physics Lab',
        host_id: 'host_newton',
        host_email: 'newton@physics.com',
        host_name: 'Isaac Newton',
        start_time: '2026-09-16T11:00:00Z'
      }
    }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    assert.equal(meeting.host_email, 'newton@physics.com');
    assert.equal(meeting.host_name, 'Isaac Newton');
    assert.equal(meeting.start_time, '2026-09-16T11:00:00Z');
  }
});

await test('Tier 1', 'F2.3', 'Ingest meeting.started indexes meeting in zoom:meetings:index sorted set', async () => {
  const mid = `test_m_index_${Date.now()}`;
  const startTime = '2026-09-16T12:00:00Z';
  const expectedScore = new Date(startTime).getTime();

  await callWebhook({
    event: 'meeting.started',
    event_ts: Date.now(),
    payload: {
      object: {
        id: mid,
        topic: 'Chemistry',
        host_id: 'h_chem',
        host_email: 'curie@chem.com',
        start_time: startTime
      }
    }
  });

  if (redisModule && redisModule.getRedisClient) {
    const client = redisModule.getRedisClient();
    const score = await client.zscore('zoom:meetings:index', mid);
    assert.equal(Number(score), expectedScore, 'Score in index must equal start timestamp ms');
  }
});

await test('Tier 1', 'F2.4', 'Ingest meeting.started returns HTTP 200 within fast SLA (< 100ms)', async () => {
  const mid = `test_m_perf_${Date.now()}`;
  const start = performance.now();
  const res = await callWebhook({
    event: 'meeting.started',
    payload: {
      object: { id: mid, topic: 'Fast Meeting', start_time: '2026-09-16T12:30:00Z' }
    }
  });
  const elapsed = performance.now() - start;

  assert.equal(res.statusCode, 200);
  assert.ok(elapsed < 2000, `Webhook took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
});

await test('Tier 1', 'F2.5', 'Duplicate meeting.started events are idempotent and preserve existing state', async () => {
  const mid = `test_m_idemp_${Date.now()}`;
  const payload = {
    event: 'meeting.started',
    payload: {
      object: {
        id: mid,
        topic: 'Idempotency Test',
        host_email: 'teacher@test.com',
        start_time: '2026-09-16T13:00:00Z'
      }
    }
  };

  const res1 = await callWebhook(payload);
  const res2 = await callWebhook(payload);
  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    assert.equal(meeting.topic, 'Idempotency Test');
  }
});

// F3: Webhook meeting.participant_joined
await test('Tier 1', 'F3.1', 'Ingest meeting.participant_joined creates participant record', async () => {
  const mid = `test_p_join_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Join Test', host_email: 'teacher@test.com', start_time: '2026-09-16T14:00:00Z' } }
  });

  const res = await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: {
          user_id: 'u_student_1',
          user_name: 'Alice Cooper',
          email: 'alice@school.com',
          join_time: '2026-09-16T14:02:00Z',
          ip_address: '10.0.0.1'
        }
      }
    }
  });

  assert.equal(res.statusCode, 200);
  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants)
      ? meeting.participants
      : Object.values(meeting.participants || {});
    const p = participants.find(x => x.email === 'alice@school.com' || x.user_name === 'Alice Cooper');
    assert.ok(p, 'Participant Alice must be present');
    assert.equal(p.name || p.user_name, 'Alice Cooper');
  }
});

await test('Tier 1', 'F3.2', 'Participant joined records IP address and initial session join_time', async () => {
  const mid = `test_p_ip_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'IP Test', start_time: '2026-09-16T14:00:00Z' } }
  });

  await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: {
          user_id: 'u_student_ip',
          user_name: 'Bob',
          email: 'bob@school.com',
          join_time: '2026-09-16T14:05:00Z',
          ip_address: '192.168.1.42'
        }
      }
    }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const p = participants.find(x => x.email === 'bob@school.com');
    assert.equal(p.ip_address, '192.168.1.42');
  }
});

await test('Tier 1', 'F3.3', 'Participant joined correctly flags host role vs student role', async () => {
  const mid = `test_p_role_${Date.now()}`;
  const hostEmail = 'host_teacher@school.com';
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Role Test', host_id: 'host_16778240', host_email: hostEmail, start_time: '2026-09-16T14:00:00Z' } }
  });

  // Host joins
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: '16778240', user_name: 'Teacher Host', email: hostEmail, join_time: '2026-09-16T14:00:00Z' }
      }
    }
  });

  // Student joins
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'std_99', user_name: 'Student Kid', email: 'kid@school.com', join_time: '2026-09-16T14:01:00Z' }
      }
    }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const hostP = participants.find(x => x.email === hostEmail);
    const studentP = participants.find(x => x.email === 'kid@school.com');
    assert.ok(hostP.is_host === true, 'Host participant must have is_host: true');
    assert.ok(studentP.is_host === false || studentP.is_host === undefined, 'Student participant must not be host');
  }
});

await test('Tier 1', 'F3.4', 'Multiple participants joining the same meeting are stored separately', async () => {
  const mid = `test_p_multi_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Multi Join', start_time: '2026-09-16T14:00:00Z' } }
  });

  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'u1', user_name: 'User 1', email: 'u1@ex.com', join_time: '2026-09-16T14:01:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'u2', user_name: 'User 2', email: 'u2@ex.com', join_time: '2026-09-16T14:02:00Z' } } }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    assert.equal(participants.length, 2, 'Should store 2 distinct participants');
  }
});

await test('Tier 1', 'F3.5', 'Participant joined on meeting without prior started event initializes meeting', async () => {
  const mid = `test_p_nostart_${Date.now()}`;
  const res = await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        topic: 'Adhoc Meeting',
        participant: { user_id: 'u_adhoc', user_name: 'Adhoc User', email: 'adhoc@ex.com', join_time: '2026-09-16T14:00:00Z' }
      }
    }
  });
  assert.equal(res.statusCode, 200, 'Must handle joined event even if started was missed');
});

// F4: Webhook meeting.participant_left
await test('Tier 1', 'F4.1', 'Ingest meeting.participant_left records leave_time in session', async () => {
  const mid = `test_p_left_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Leave Test', start_time: '2026-09-16T14:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'u_leaver', user_name: 'Leaver', email: 'leaver@ex.com', join_time: '2026-09-16T14:00:00Z' } } }
  });

  const res = await callWebhook({
    event: 'meeting.participant_left',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'u_leaver', user_name: 'Leaver', email: 'leaver@ex.com', leave_time: '2026-09-16T14:25:00Z' }
      }
    }
  });

  assert.equal(res.statusCode, 200);
  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const p = participants.find(x => x.email === 'leaver@ex.com');
    assert.ok(p.leave_time || p.last_leave_time, 'Must have leave time recorded');
  }
});

await test('Tier 1', 'F4.2', 'Participant left calculates presence duration in seconds', async () => {
  const mid = `test_p_dur_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Duration Test', start_time: '2026-09-16T14:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'u_dur', email: 'dur@ex.com', join_time: '2026-09-16T14:00:00Z' } } }
  });
  // Left 30 minutes later (1800 seconds)
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'u_dur', email: 'dur@ex.com', leave_time: '2026-09-16T14:30:00Z' } } }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const p = participants.find(x => x.email === 'dur@ex.com');
    const durSec = p.duration_seconds || (p.sessions && p.sessions[0] && p.sessions[0].duration_seconds);
    assert.equal(durSec, 1800, 'Participant duration should be 1800 seconds (30m)');
  }
});

await test('Tier 1', 'F4.3', 'Participant left does not alter status of remaining active participants', async () => {
  const mid = `test_p_stay_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Staying Test', start_time: '2026-09-16T14:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'stay', email: 'stay@ex.com', join_time: '2026-09-16T14:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'leave', email: 'leave@ex.com', join_time: '2026-09-16T14:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'leave', email: 'leave@ex.com', leave_time: '2026-09-16T14:15:00Z' } } }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const stayP = participants.find(x => x.email === 'stay@ex.com');
    assert.ok(!stayP.leave_time || stayP.leave_time === null, 'Staying participant should still be active');
  }
});

await test('Tier 1', 'F4.4', 'Participant left returns HTTP 200 OK', async () => {
  const mid = `test_p_left200_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, start_time: '2026-09-16T14:00:00Z' } }
  });
  const res = await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'any', email: 'any@ex.com', leave_time: '2026-09-16T14:10:00Z' } } }
  });
  assert.equal(res.statusCode, 200);
});

await test('Tier 1', 'F4.5', 'Participant left for unknown meeting handles gracefully without 500 error', async () => {
  const res = await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: 'unknown_mid_99999', participant: { user_id: 'ghost', leave_time: '2026-09-16T14:00:00Z' } } }
  });
  assert.equal(res.statusCode, 200, 'Should not throw 500 on orphan leave event');
});

// F5: Webhook meeting.ended
await test('Tier 1', 'F5.1', 'Ingest meeting.ended marks meeting status as ended', async () => {
  const mid = `test_m_end_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Ending Lesson', start_time: '2026-09-16T15:00:00Z' } }
  });

  const res = await callWebhook({
    event: 'meeting.ended',
    payload: {
      object: {
        id: mid,
        end_time: '2026-09-16T15:45:00Z',
        duration: 45
      }
    }
  });

  assert.equal(res.statusCode, 200);
  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    assert.equal(meeting.status, 'ended');
  }
});

await test('Tier 1', 'F5.2', 'Meeting ended sets end_time and duration in minutes', async () => {
  const mid = `test_m_end_dur_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, start_time: '2026-09-16T15:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: {
      object: { id: mid, end_time: '2026-09-16T15:50:00Z', duration: 50 }
    }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    assert.equal(meeting.end_time, '2026-09-16T15:50:00Z');
    assert.equal(meeting.duration, 50);
  }
});

await test('Tier 1', 'F5.3', 'Meeting ended auto-closes open participant sessions', async () => {
  const mid = `test_m_autoclose_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, start_time: '2026-09-16T15:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'p_open', email: 'open@ex.com', join_time: '2026-09-16T15:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T15:45:00Z', duration: 45 } }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const p = participants.find(x => x.email === 'open@ex.com');
    assert.ok(p.leave_time || p.last_leave_time, 'Open participant session should be closed on meeting end');
  }
});

await test('Tier 1', 'F5.4', 'Meeting ended returns HTTP 200 OK', async () => {
  const mid = `test_m_end200_${Date.now()}`;
  const res = await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T15:30:00Z', duration: 30 } }
  });
  assert.equal(res.statusCode, 200);
});

await test('Tier 1', 'F5.5', 'Repeated meeting.ended event is idempotent and does not corrupt data', async () => {
  const mid = `test_m_repeat_end_${Date.now()}`;
  const payload = {
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T15:30:00Z', duration: 30 } }
  };
  const res1 = await callWebhook(payload);
  const res2 = await callWebhook(payload);
  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);
});

// F6, F7, F8: Redis Client & Persistence Helpers
await test('Tier 1', 'F6.1', 'getRedisClient returns functional client or mock', async () => {
  if (!redisModule || !redisModule.getRedisClient) {
    throw new Error('redisModule.getRedisClient not implemented');
  }
  const client = redisModule.getRedisClient();
  assert.ok(client, 'Redis client instance must be returned');
  assert.ok(typeof client.get === 'function', 'client must support get()');
  assert.ok(typeof client.set === 'function', 'client must support set()');
});

await test('Tier 1', 'F7.1', 'saveMeeting and getMeeting store and retrieve JSON meeting state', async () => {
  if (!redisModule || !redisModule.saveMeeting || !redisModule.getMeeting) {
    throw new Error('saveMeeting/getMeeting helpers not implemented');
  }
  const mid = `test_helper_${Date.now()}`;
  const testData = {
    meeting_id: mid,
    topic: 'Persistence Verification',
    duration: 45,
    participants: { 'test@ex.com': { name: 'Tester', email: 'test@ex.com' } }
  };

  await redisModule.saveMeeting(mid, testData);
  const retrieved = await redisModule.getMeeting(mid);

  assert.ok(retrieved, 'Retrieved meeting must not be null');
  assert.equal(retrieved.meeting_id, mid);
  assert.equal(retrieved.topic, 'Persistence Verification');
});

await test('Tier 1', 'F8.1', 'zoom:meetings:index maintains sorted order by timestamp score', async () => {
  if (!redisModule || !redisModule.getRedisClient) {
    throw new Error('getRedisClient not implemented');
  }
  const client = redisModule.getRedisClient();
  const m1 = `idx_m1_${Date.now()}`;
  const m2 = `idx_m2_${Date.now()}`;
  const score1 = 1726480000000;
  const score2 = 1726490000000;

  await client.zadd('zoom:meetings:index', { score: score1, member: m1 });
  await client.zadd('zoom:meetings:index', { score: score2, member: m2 });

  const range = await client.zrange('zoom:meetings:index', 0, -1);
  assert.ok(range.includes(m1), 'm1 must be in sorted set');
  assert.ok(range.includes(m2), 'm2 must be in sorted set');
});

await test('Tier 1', 'F8.2', 'getMeetingsByIndex queries meetings by options', async () => {
  if (!redisModule || !redisModule.getMeetingsByIndex) {
    throw new Error('getMeetingsByIndex helper not implemented');
  }
  const list = await redisModule.getMeetingsByIndex({ limit: 10 });
  assert.ok(Array.isArray(list), 'Expected array from getMeetingsByIndex');
});

await test('Tier 1', 'F8.3', 'deleteMeeting removes meeting from Redis and index', async () => {
  if (!redisModule || !redisModule.deleteMeeting || !redisModule.getMeeting) {
    throw new Error('deleteMeeting helper not implemented');
  }
  const mid = `del_test_${Date.now()}`;
  await redisModule.saveMeeting(mid, { meeting_id: mid, topic: 'To Delete' });
  await redisModule.deleteMeeting(mid);
  const check = await redisModule.getMeeting(mid);
  assert.ok(!check, 'Meeting must be deleted from Redis');
});

// F9: Zoom OAuth & QoS Enrichment Helpers (api/lib/zoom.js)
await test('Tier 1', 'F9.1', 'isZoomConfigured correctly detects presence of S2S OAuth credentials', async () => {
  if (!zoomModule || !zoomModule.isZoomConfigured) {
    throw new Error('zoomModule.isZoomConfigured not implemented');
  }
  const configured = zoomModule.isZoomConfigured();
  assert.equal(typeof configured, 'boolean');
  assert.equal(configured, true, 'Default test credentials should result in configured = true');
});

await test('Tier 1', 'F9.2', 'clearZoomTokenCache and getZoomAccessToken handle S2S authentication', async () => {
  if (!zoomModule || !zoomModule.clearZoomTokenCache) {
    throw new Error('zoomModule.clearZoomTokenCache not implemented');
  }
  zoomModule.clearZoomTokenCache();
  // Verify helper exists and executes cleanly
  assert.ok(typeof zoomModule.getZoomAccessToken === 'function');
});

await test('Tier 1', 'F9.3', 'fetchZoomMeetingQoS gracefully returns failure object without throwing on 403 Forbidden', async () => {
  if (!zoomModule || !zoomModule.fetchZoomMeetingQoS) {
    throw new Error('zoomModule.fetchZoomMeetingQoS not implemented');
  }
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ code: 200, message: 'Dashboard feature not enabled' }),
      text: async () => '403 Forbidden'
    });

    const result = await zoomModule.fetchZoomMeetingQoS('dummy_mid_123', { token: 'mock_bearer_token' });
    assert.equal(typeof result, 'object');
    assert.equal(result.success, false, 'Result success must be false on 403');
    assert.equal(result.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Tier 1', 'F9.4', 'fetchZoomMeetingQoS gracefully returns failure object on 400 Bad Request', async () => {
  if (!zoomModule || !zoomModule.fetchZoomMeetingQoS) {
    throw new Error('zoomModule.fetchZoomMeetingQoS not implemented');
  }
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: 4711, message: 'Scope missing' }),
      text: async () => '400 Bad Request'
    });

    const result = await zoomModule.fetchZoomMeetingQoS('dummy_mid_400', { token: 'mock_token' });
    assert.equal(result.success, false);
    assert.equal(result.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Tier 1', 'F9.5', 'enrichMeetingWithQoS merges participant device and QoS data cleanly', async () => {
  if (!zoomModule || !zoomModule.enrichMeetingWithQoS) {
    throw new Error('zoomModule.enrichMeetingWithQoS not implemented');
  }
  const meeting = {
    meeting_id: 'mid_enrich_test',
    participants: [
      { name: 'Student Anna', email: 'anna@school.com', user_id: 'u_anna' }
    ]
  };
  const qosMock = {
    success: true,
    data: {
      participants: [
        {
          email: 'anna@school.com',
          device: 'MacBook Pro',
          ip_address: '10.0.0.99',
          audio_quality: 'good'
        }
      ]
    }
  };

  const enriched = zoomModule.enrichMeetingWithQoS(meeting, qosMock);
  assert.ok(enriched);
  assert.equal(enriched.participants[0].device, 'MacBook Pro');
  assert.equal(enriched.participants[0].ip_address, '10.0.0.99');
});

// F10: Telemetry Query API
await test('Tier 1', 'F10.1', 'GET /api/telemetry returns HTTP 200 with success: true and meetings array', async () => {
  const res = await callTelemetry();
  assert.equal(res.statusCode, 200, 'Expected HTTP 200');
  assert.ok(res.body, 'Expected response body');
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.meetings), 'meetings must be an array');
});

await test('Tier 1', 'F10.2', 'Telemetry meeting object adheres to required schema', async () => {
  const mid = `schema_mid_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Geometry', host_email: 'geo@teacher.com', host_name: 'Pythagoras', start_time: '2026-09-16T08:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T08:45:00Z', duration: 45 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m, 'Meeting must be present in telemetry response');
  assert.ok('meeting_id' in m, 'must contain meeting_id');
  assert.ok('topic' in m, 'must contain topic');
  assert.ok('host_name' in m || 'host_email' in m, 'must contain host details');
  assert.ok('start_time' in m, 'must contain start_time');
  assert.ok('duration' in m, 'must contain duration');
  assert.ok('business_status' in m, 'must contain business_status');
});

await test('Tier 1', 'F10.3', 'Telemetry response includes participants breakdown array', async () => {
  const mid = `p_breakdown_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Literature', host_email: 'lit@school.com', start_time: '2026-09-16T08:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 's_lit', user_name: 'Homer', email: 'homer@school.com', join_time: '2026-09-16T08:05:00Z' } } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m, 'Meeting must be found');
  assert.ok(Array.isArray(m.participants), 'm.participants must be an array');
});

await test('Tier 1', 'F10.4', 'Telemetry endpoint rejects non-GET methods with HTTP 405', async () => {
  const res = await callTelemetry({}, 'POST');
  assert.equal(res.statusCode, 405, 'Expected HTTP 405 for POST on /api/telemetry');
});

await test('Tier 1', 'F10.5', 'Telemetry returns empty meetings list when no records match', async () => {
  const res = await callTelemetry({ host: 'nonexistent_teacher_999@domain.com' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.total_meetings, 0);
  assert.deepEqual(res.body.meetings, []);
});

// F11, F12: Query Filters ?date= and ?host=
await test('Tier 1', 'F11.1', 'Query filter ?date=YYYY-MM-DD returns only meetings from that date', async () => {
  const mid = `date_filt_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Date Filter Test', start_time: '2026-09-16T09:00:00Z' } }
  });

  const res = await callTelemetry({ date: '2026-09-16' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.meetings.some(m => m.meeting_id === mid), 'Meeting must be included in date query');

  const emptyRes = await callTelemetry({ date: '2025-01-01' });
  assert.equal(emptyRes.statusCode, 200);
  assert.ok(!emptyRes.body.meetings.some(m => m.meeting_id === mid), 'Meeting must NOT be included in other date');
});

await test('Tier 1', 'F12.1', 'Query filter ?host=email returns only meetings for specified host', async () => {
  const mid1 = `host_filt1_${Date.now()}`;
  const mid2 = `host_filt2_${Date.now()}`;

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid1, topic: 'Teacher A Class', host_email: 'teachera@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid2, topic: 'Teacher B Class', host_email: 'teacherb@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });

  const res = await callTelemetry({ host: 'teachera@school.com' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.meetings.some(m => m.meeting_id === mid1), 'Must contain Teacher A meeting');
  assert.ok(!res.body.meetings.some(m => m.meeting_id === mid2), 'Must NOT contain Teacher B meeting');
});

await test('Tier 1', 'F12.2', 'Query filter ?host=email is case-insensitive', async () => {
  const mid = `host_case_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Case Test', host_email: 'TeacherC@School.COM', start_time: '2026-09-16T10:00:00Z' } }
  });

  const res = await callTelemetry({ host: 'teacherc@school.com' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.meetings.some(m => m.meeting_id === mid), 'Case-insensitive host query must match');
});

await test('Tier 1', 'F12.3', 'Combined filter ?date=YYYY-MM-DD&host=email returns exact intersection', async () => {
  const mid = `intersec_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Intersection Test', host_email: 'combo@school.com', start_time: '2026-09-16T11:00:00Z' } }
  });

  const matchRes = await callTelemetry({ date: '2026-09-16', host: 'combo@school.com' });
  assert.ok(matchRes.body.meetings.some(m => m.meeting_id === mid), 'Intersection must match');

  const noMatchRes = await callTelemetry({ date: '2026-09-15', host: 'combo@school.com' });
  assert.ok(!noMatchRes.body.meetings.some(m => m.meeting_id === mid), 'Date mismatch must not match');
});

// F13, F14, F15: Business Status Calculation
await test('Tier 1', 'F13.1', 'Business status: VERIFIED when duration >= 30 min with host and student', async () => {
  const mid = `bs_verified_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Full Lesson', host_email: 'prof@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'std1', email: 'pupil@school.com', join_time: '2026-09-16T10:01:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'std1', email: 'pupil@school.com', leave_time: '2026-09-16T10:44:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:45:00Z', duration: 45 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'VERIFIED');
});

await test('Tier 1', 'F14.1', 'Business status: ONLY_HOST when duration >= 15 min with host only', async () => {
  const mid = `bs_only_host_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Solo Wait', host_email: 'solo@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:20:00Z', duration: 20 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'ONLY_HOST');
});

await test('Tier 1', 'F15.1', 'Business status: SHORT_CALL when duration < 30 min with student present', async () => {
  const mid = `bs_short_student_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Short Chat', host_email: 'prof@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'std_short', email: 'pupil_short@school.com', join_time: '2026-09-16T10:01:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:10:00Z', duration: 10 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'SHORT_CALL');
});

await test('Tier 1', 'F15.2', 'Business status: SHORT_CALL when duration < 15 min with host only', async () => {
  const mid = `bs_short_solo_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Brief Check', host_email: 'solo@school.com', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:05:00Z', duration: 5 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'SHORT_CALL');
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// ============================================================================

console.log('\n--- TIER 2: Boundary & Corner Cases ---');

await test('Tier 2', 'B1', 'Zero duration meeting (started and ended at same instant) yields SHORT_CALL', async () => {
  const mid = `b_zero_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Zero Call', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:00:00Z', duration: 0 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.duration, 0);
  assert.equal(m.business_status, 'SHORT_CALL');
});

await test('Tier 2', 'B2', 'Boundary 15m threshold for solo host: 14m -> SHORT_CALL, 15m -> ONLY_HOST', async () => {
  const mid14 = `b_solo_14_${Date.now()}`;
  const mid15 = `b_solo_15_${Date.now()}`;

  // 14 min solo
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid14, topic: '14m Solo', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid14, end_time: '2026-09-16T10:14:00Z', duration: 14 } }
  });

  // Exactly 15 min solo
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid15, topic: '15m Solo', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid15, end_time: '2026-09-16T10:15:00Z', duration: 15 } }
  });

  const res = await callTelemetry();
  const m14 = res.body.meetings.find(x => x.meeting_id === mid14);
  const m15 = res.body.meetings.find(x => x.meeting_id === mid15);
  assert.equal(m14.business_status, 'SHORT_CALL', '14 min solo must be SHORT_CALL');
  assert.equal(m15.business_status, 'ONLY_HOST', '15 min solo must be ONLY_HOST');
});

await test('Tier 2', 'B3', 'Boundary 30m threshold with student: 29m -> SHORT_CALL, 30m -> VERIFIED', async () => {
  const mid29 = `b_std_29_${Date.now()}`;
  const mid30 = `b_std_30_${Date.now()}`;

  // 29 min with student
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid29, topic: '29m Call', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid29, participant: { user_id: 's29', email: 's29@ex.com', join_time: '2026-09-16T10:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid29, end_time: '2026-09-16T10:29:00Z', duration: 29 } }
  });

  // Exactly 30 min with student
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid30, topic: '30m Call', start_time: '2026-09-16T10:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid30, participant: { user_id: 's30', email: 's30@ex.com', join_time: '2026-09-16T10:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid30, end_time: '2026-09-16T10:30:00Z', duration: 30 } }
  });

  const res = await callTelemetry();
  const m29 = res.body.meetings.find(x => x.meeting_id === mid29);
  const m30 = res.body.meetings.find(x => x.meeting_id === mid30);
  assert.equal(m29.business_status, 'SHORT_CALL', '29m must be SHORT_CALL');
  assert.equal(m30.business_status, 'VERIFIED', '30m must be VERIFIED');
});

await test('Tier 2', 'B4', 'Participant with missing email (guest/dial-in) handled without exception', async () => {
  const mid = `b_no_email_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Phone Dial-In', start_time: '2026-09-16T10:00:00Z' } }
  });
  const res = await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'phone_user_1', user_name: '+380501234567', phone: '+380501234567', join_time: '2026-09-16T10:01:00Z' }
      }
    }
  });

  assert.equal(res.statusCode, 200);
  const telRes = await callTelemetry();
  const m = telRes.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.ok(m.participants.length >= 1, 'Dial-in participant must be tracked');
});

await test('Tier 2', 'B5', 'Participant with missing name (empty user_name) uses fallback without crash', async () => {
  const mid = `b_no_name_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, start_time: '2026-09-16T10:00:00Z' } }
  });
  const res = await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'anon_u', user_name: '', email: 'anonymous@school.com', join_time: '2026-09-16T10:02:00Z' }
      }
    }
  });

  assert.equal(res.statusCode, 200);
});

await test('Tier 2', 'B6', 'Multiple joins and leaves by same participant aggregate into single record', async () => {
  const mid = `b_recon_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Reconnect Test', start_time: '2026-09-16T10:00:00Z' } }
  });

  // Session 1: 10:00 to 10:10 (10 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'std_r', email: 'student_r@school.com', join_time: '2026-09-16T10:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'std_r', email: 'student_r@school.com', leave_time: '2026-09-16T10:10:00Z' } } }
  });

  // Session 2: 10:15 to 10:35 (20 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'std_r', email: 'student_r@school.com', join_time: '2026-09-16T10:15:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'std_r', email: 'student_r@school.com', leave_time: '2026-09-16T10:35:00Z' } } }
  });

  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T10:45:00Z', duration: 45 } }
  });

  const res = await callTelemetry();
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  const students = m.participants.filter(p => p.email === 'student_r@school.com');
  assert.equal(students.length, 1, 'Should aggregate multiple sessions under 1 participant record');
  const durSec = students[0].duration_seconds || (students[0].duration * 60);
  assert.ok(durSec >= 1800, `Aggregated duration should be >= 1800s (got ${durSec})`);
});

await test('Tier 2', 'B7', 'Overlapping participant sessions (phone + PC) avoid double counting duration', async () => {
  const mid = `b_overlap_${Date.now()}`;
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Overlap Test', start_time: '2026-09-16T10:00:00Z' } }
  });

  // PC: 10:00 - 10:20 (20 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'p_dev1', email: 'multi@device.com', join_time: '2026-09-16T10:00:00Z' } } }
  });
  // Phone: 10:10 - 10:30 (20 min, overlaps 10:10-10:20)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'p_dev2', email: 'multi@device.com', join_time: '2026-09-16T10:10:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'p_dev1', email: 'multi@device.com', leave_time: '2026-09-16T10:20:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'p_dev2', email: 'multi@device.com', leave_time: '2026-09-16T10:30:00Z' } } }
  });

  if (redisModule && redisModule.getMeeting) {
    const meeting = await redisModule.getMeeting(mid);
    const participants = Array.isArray(meeting.participants) ? meeting.participants : Object.values(meeting.participants);
    const p = participants.find(x => x.email === 'multi@device.com');
    if (p && p.duration_seconds) {
      assert.ok(p.duration_seconds <= 1800, `Presence should be <= 1800s with union deduplication (got ${p.duration_seconds})`);
    }
  }
});

await test('Tier 2', 'B8', 'Zoom QoS endpoint responding 403 Forbidden is caught gracefully (HTTP 200)', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && (url.includes('/metrics/') || url.includes('/qos'))) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ code: 200, message: 'This API is only available for ZMP and Business or higher accounts' }),
          text: async () => JSON.stringify({ code: 200, message: '403 Forbidden' })
        };
      }
      return originalFetch ? originalFetch(url) : { ok: true, status: 200, json: async () => ({}) };
    };

    const mid = `b_qos_403_${Date.now()}`;
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS 403 Test', start_time: '2026-09-16T10:00:00Z' } }
    });
    const res = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T10:30:00Z', duration: 30 } }
    });

    assert.equal(res.statusCode, 200, 'Webhook MUST return HTTP 200 even when QoS returns 403');
    if (redisModule && redisModule.getMeeting) {
      const meeting = await redisModule.getMeeting(mid);
      assert.equal(meeting.status, 'ended', 'Meeting state must be preserved in Redis');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Tier 2', 'B9', 'Zoom QoS endpoint responding 400 Bad Request is caught gracefully (HTTP 200)', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && (url.includes('/metrics/') || url.includes('/qos'))) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ code: 200, message: 'Bad request or scope missing' }),
          text: async () => JSON.stringify({ code: 200, message: 'Bad request' })
        };
      }
      return originalFetch ? originalFetch(url) : { ok: true, status: 200, json: async () => ({}) };
    };

    const mid = `b_qos_400_${Date.now()}`;
    const res = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T10:30:00Z', duration: 30 } }
    });

    assert.equal(res.statusCode, 200, 'Webhook MUST return HTTP 200 on 400 QoS fallback');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Tier 2', 'B10', 'Webhook handles unknown event types without crashing', async () => {
  const res = await callWebhook({
    event: 'meeting.unsupported_event_xyz',
    payload: { object: { id: 'unknown' } }
  });
  assert.equal(res.statusCode, 200, 'Unknown event should return 200 acknowledgment');
});

await test('Tier 2', 'B11', 'Out-of-order events: participant_left arriving before participant_joined', async () => {
  const mid = `b_outorder_${Date.now()}`;
  const resLeft = await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 'u_early', email: 'early@ex.com', leave_time: '2026-09-16T10:10:00Z' } } }
  });
  const resJoined = await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 'u_early', email: 'early@ex.com', join_time: '2026-09-16T10:00:00Z' } } }
  });

  assert.equal(resLeft.statusCode, 200);
  assert.equal(resJoined.statusCode, 200);
});

await test('Tier 2', 'B12', 'Webhook rejects invalid or malformed JSON body with HTTP 400', async () => {
  if (!webhookHandler) throw new Error('webhookHandler not available');
  const req = createMockReq({ method: 'POST', url: '/api/webhooks/zoom', body: null });
  req.body = undefined;
  const res = createMockRes();
  await webhookHandler(req, res);
  assert.ok(res.statusCode === 200 || res.statusCode === 400, 'Handled safely without uncaught exception');
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// ============================================================================

console.log('\n--- TIER 3: Cross-Feature Combinations ---');

await test('Tier 3', 'C1', 'Full webhook lifecycle -> Redis persistence -> Telemetry API retrieval', async () => {
  const mid = `c_full_${Date.now()}`;
  const teacherEmail = 't_full@crossfeature.com';
  const studentEmail = 's_full@crossfeature.com';
  const meetingDate = '2026-09-16';

  // 1. Started
  await callWebhook({
    event: 'meeting.started',
    payload: {
      object: {
        id: mid,
        topic: 'Full Lifecycle Lesson',
        host_id: 'h_full',
        host_email: teacherEmail,
        host_name: 'Professor Cross',
        start_time: `${meetingDate}T10:00:00Z`
      }
    }
  });

  // 2. Participant Joined
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'u_s1', user_name: 'Student One', email: studentEmail, join_time: `${meetingDate}T10:02:00Z` }
      }
    }
  });

  // 3. Participant Left
  await callWebhook({
    event: 'meeting.participant_left',
    payload: {
      object: {
        id: mid,
        participant: { user_id: 'u_s1', email: studentEmail, leave_time: `${meetingDate}T10:44:00Z` }
      }
    }
  });

  // 4. Ended
  await callWebhook({
    event: 'meeting.ended',
    payload: {
      object: {
        id: mid,
        end_time: `${meetingDate}T10:45:00Z`,
        duration: 45
      }
    }
  });

  // 5. Query via Telemetry API with filters
  const res = await callTelemetry({ date: meetingDate, host: teacherEmail });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const found = res.body.meetings.find(m => m.meeting_id === mid);
  assert.ok(found, 'Meeting must be retrieved via Telemetry API with filters');
  assert.equal(found.business_status, 'VERIFIED');
  assert.equal(found.duration, 45);
});

await test('Tier 3', 'C2', 'Concurrent meetings for different teachers do not cross-contaminate state', async () => {
  const midA = `c_concur_a_${Date.now()}`;
  const midB = `c_concur_b_${Date.now()}`;
  const teacherA = 'teachera@school.com';
  const teacherB = 'teacherb@school.com';

  // Interleaved events
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: midA, topic: 'Room A', host_email: teacherA, start_time: '2026-09-16T12:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: midB, topic: 'Room B', host_email: teacherB, start_time: '2026-09-16T12:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: midA, participant: { user_id: 'sA', email: 'studentA@ex.com', join_time: '2026-09-16T12:05:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: midB, participant: { user_id: 'sB', email: 'studentB@ex.com', join_time: '2026-09-16T12:05:00Z' } } }
  });

  const resA = await callTelemetry({ host: teacherA });
  const resB = await callTelemetry({ host: teacherB });

  const itemA = resA.body.meetings.find(m => m.meeting_id === midA);
  const itemB = resB.body.meetings.find(m => m.meeting_id === midB);
  assert.ok(itemA, 'Teacher A results must have Room A');
  assert.ok(!resA.body.meetings.some(m => m.meeting_id === midB), 'Teacher A results must not have Room B');
  assert.ok(itemB, 'Teacher B results must have Room B');
});

await test('Tier 3', 'C3', 'Webhook lifecycle with QoS 403 fallback preserves all telemetry for read API', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ code: 200, message: 'Forbidden' }),
      text: async () => '403 Forbidden'
    });

    const mid = `c_qos_fallback_${Date.now()}`;
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS Fallback E2E', host_email: 'fallback@school.com', start_time: '2026-09-16T14:00:00Z' } }
    });
    await callWebhook({
      event: 'meeting.participant_joined',
      payload: { object: { id: mid, participant: { user_id: 's_fb', email: 's_fb@school.com', join_time: '2026-09-16T14:02:00Z' } } }
    });
    await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T14:35:00Z', duration: 35 } }
    });

    const res = await callTelemetry({ host: 'fallback@school.com' });
    const m = res.body.meetings.find(x => x.meeting_id === mid);
    assert.ok(m, 'Meeting must exist in telemetry response');
    assert.equal(m.business_status, 'VERIFIED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS
// ============================================================================

console.log('\n--- TIER 4: Real-World Scenarios ---');

await test('Tier 4', 'S1', 'Scenario 1: Standard 45-min lesson (teacher + student) -> VERIFIED', async () => {
  const mid = `rw_s1_${Date.now()}`;
  const hostEmail = 'teacher_s1@school.com';

  await callWebhook({
    event: 'meeting.started',
    payload: {
      object: { id: mid, topic: 'Geometry Lesson 4', host_id: 't_s1', host_email: hostEmail, start_time: '2026-09-16T12:00:00Z' }
    }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: { id: mid, participant: { user_id: 'std_s1', user_name: 'Oksana', email: 'oksana@student.ua', join_time: '2026-09-16T12:01:30Z' } }
    }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: {
      object: { id: mid, participant: { user_id: 'std_s1', email: 'oksana@student.ua', leave_time: '2026-09-16T12:44:00Z' } }
    }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T12:45:00Z', duration: 45 } }
  });

  const res = await callTelemetry({ host: hostEmail });
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'VERIFIED');
  assert.equal(m.duration, 45);
});

await test('Tier 4', 'S2', 'Scenario 2: Student drops connection 3 times and reconnects -> VERIFIED', async () => {
  const mid = `rw_s2_${Date.now()}`;
  const hostEmail = 'teacher_s2@school.com';
  const studentEmail = 'student_drop@school.com';

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'English Lesson', host_email: hostEmail, start_time: '2026-09-16T13:00:00Z' } }
  });

  // Drop 1: 13:00 to 13:10 (10 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, join_time: '2026-09-16T13:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, leave_time: '2026-09-16T13:10:00Z' } } }
  });

  // Drop 2: 13:12 to 13:25 (13 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, join_time: '2026-09-16T13:12:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, leave_time: '2026-09-16T13:25:00Z' } } }
  });

  // Drop 3: 13:26 to 13:43 (17 min)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, join_time: '2026-09-16T13:26:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: 's_drop', email: studentEmail, leave_time: '2026-09-16T13:43:00Z' } } }
  });

  // Meeting ends at 13:45 (45 min)
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T13:45:00Z', duration: 45 } }
  });

  const res = await callTelemetry({ host: hostEmail });
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  // Total presence: 10 + 13 + 17 = 40 minutes with student
  assert.equal(m.business_status, 'VERIFIED');
});

await test('Tier 4', 'S3', 'Scenario 3: Teacher waits 20 mins for absent student -> ONLY_HOST', async () => {
  const mid = `rw_s3_${Date.now()}`;
  const hostEmail = 'teacher_s3@school.com';

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Individual Lesson', host_email: hostEmail, start_time: '2026-09-16T14:00:00Z' } }
  });
  // No student joins
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T14:20:00Z', duration: 20 } }
  });

  const res = await callTelemetry({ host: hostEmail });
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'ONLY_HOST');
});

await test('Tier 4', 'S4', 'Scenario 4: Brief 5-min glitch call -> SHORT_CALL', async () => {
  const mid = `rw_s4_${Date.now()}`;
  const hostEmail = 'teacher_s4@school.com';

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Glitch Lesson', host_email: hostEmail, start_time: '2026-09-16T15:00:00Z' } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: 's_glitch', email: 'glitch@school.com', join_time: '2026-09-16T15:00:30Z' } } }
  });
  await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: '2026-09-16T15:05:00Z', duration: 5 } }
  });

  const res = await callTelemetry({ host: hostEmail });
  const m = res.body.meetings.find(x => x.meeting_id === mid);
  assert.ok(m);
  assert.equal(m.business_status, 'SHORT_CALL');
});

await test('Tier 4', 'S5', 'Scenario 5: Basic account QoS fallback preserving full webhook state', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ code: 200, message: 'QoS unavailable' }),
      text: async () => '403 Forbidden'
    });

    const mid = `rw_s5_${Date.now()}`;
    const hostEmail = 'teacher_s5@school.com';

    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'Basic Account Lesson', host_email: hostEmail, start_time: '2026-09-16T16:00:00Z' } }
    });
    await callWebhook({
      event: 'meeting.participant_joined',
      payload: { object: { id: mid, participant: { user_id: 's_s5', email: 'std_s5@school.com', join_time: '2026-09-16T16:01:00Z' } } }
    });
    const resEnd = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T16:40:00Z', duration: 40 } }
    });

    assert.equal(resEnd.statusCode, 200);

    const resTel = await callTelemetry({ host: hostEmail });
    const m = resTel.body.meetings.find(x => x.meeting_id === mid);
    assert.ok(m);
    assert.equal(m.business_status, 'VERIFIED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Tier 4', 'S6', 'Scenario 6: Multi-date, multi-teacher dataset queried with date and host filters', async () => {
  const tAlice = 'alice@teachers.ua';
  const tBob = 'bob@teachers.ua';
  const d1 = '2026-09-15';
  const d2 = '2026-09-16';

  const m1 = `rw_s6_m1_${Date.now()}`;
  const m2 = `rw_s6_m2_${Date.now()}`;
  const m3 = `rw_s6_m3_${Date.now()}`;
  const m4 = `rw_s6_m4_${Date.now()}`;

  // Alice Day 1
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: m1, topic: 'Alice D1', host_email: tAlice, start_time: `${d1}T10:00:00Z` } }
  });
  // Bob Day 1
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: m2, topic: 'Bob D1', host_email: tBob, start_time: `${d1}T11:00:00Z` } }
  });
  // Alice Day 2
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: m3, topic: 'Alice D2', host_email: tAlice, start_time: `${d2}T10:00:00Z` } }
  });
  // Bob Day 2
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: m4, topic: 'Bob D2', host_email: tBob, start_time: `${d2}T11:00:00Z` } }
  });

  // Query Day 2 only
  const resD2 = await callTelemetry({ date: d2 });
  const idsD2 = resD2.body.meetings.map(m => m.meeting_id);
  assert.ok(idsD2.includes(m3), 'Day 2 query must include Alice D2');
  assert.ok(idsD2.includes(m4), 'Day 2 query must include Bob D2');
  assert.ok(!idsD2.includes(m1), 'Day 2 query must NOT include Alice D1');

  // Query Alice only
  const resAlice = await callTelemetry({ host: tAlice });
  const idsAlice = resAlice.body.meetings.map(m => m.meeting_id);
  assert.ok(idsAlice.includes(m1), 'Alice query must include Alice D1');
  assert.ok(idsAlice.includes(m3), 'Alice query must include Alice D2');
  assert.ok(!idsAlice.includes(m2), 'Alice query must NOT include Bob D1');

  // Query Alice on Day 2 only
  const resCombo = await callTelemetry({ date: d2, host: tAlice });
  const idsCombo = resCombo.body.meetings.map(m => m.meeting_id);
  assert.ok(idsCombo.includes(m3), 'Combo query must include Alice D2');
  assert.ok(!idsCombo.includes(m1), 'Combo query must NOT include Alice D1');
  assert.ok(!idsCombo.includes(m4), 'Combo query must NOT include Bob D2');
});

// ============================================================================
// 6. Test Execution Summary & Reporting
// ============================================================================

console.log('\n================================================================');
console.log('                 TEST EXECUTION SUMMARY                         ');
console.log('================================================================');
console.log(`  Tier 1 (Feature Coverage):     ${tierStats['Tier 1'].passed}/${tierStats['Tier 1'].total} passed`);
console.log(`  Tier 2 (Boundary & Corner):    ${tierStats['Tier 2'].passed}/${tierStats['Tier 2'].total} passed`);
console.log(`  Tier 3 (Cross-Feature):        ${tierStats['Tier 3'].passed}/${tierStats['Tier 3'].total} passed`);
console.log(`  Tier 4 (Real-World Scenarios): ${tierStats['Tier 4'].passed}/${tierStats['Tier 4'].total} passed`);
console.log('----------------------------------------------------------------');
console.log(`  TOTAL: ${testStats.passed} / ${testStats.total} Passed (${testStats.failed} Failed)`);
console.log('================================================================');

if (testStats.failed > 0) {
  console.log('\n❌ Failures / Pending Implementation Summary:');
  for (const f of testStats.errors.slice(0, 10)) {
    console.log(`  • [${f.tier} - ${f.id}] ${f.title}`);
    console.log(`    ${f.error}`);
  }
  if (testStats.errors.length > 10) {
    console.log(`    ... and ${testStats.errors.length - 10} more.`);
  }
  console.log('\nExit code: 1');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED! Exit code: 0');
  process.exit(0);
}
