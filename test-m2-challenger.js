/**
 * ============================================================================
 * CHALLENGER 2: Milestone M2 Empirical Stress Test Suite
 * ============================================================================
 * Focus Areas:
 * 1. Out-of-order event delivery (participant_left followed by participant_joined)
 * 2. Simulated QoS API failures (403, 400, timeout >2500ms, 500, network crash)
 * 3. SLA compliance (<3000ms) and Redis state preservation
 * 4. Concurrency and race-condition data loss
 * ============================================================================
 */

import assert from 'node:assert/strict';
import { Readable } from 'stream';

process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_REDIS = 'true';
process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'test_webhook_secret_token_12345';
process.env.ZOOM_ACCOUNT_ID = 'test_acc_123';
process.env.ZOOM_CLIENT_ID = 'test_client_123';
process.env.ZOOM_CLIENT_SECRET = 'test_secret_123';

const { default: webhookHandler } = await import('./api/webhooks/zoom.js');
const { getMeeting, saveMeeting, getRedisClient, resetRedisClient } = await import('./api/lib/redis.js');
const { clearZoomTokenCache } = await import('./api/lib/zoom.js');

function createMockReq({ method = 'POST', url = '/api/webhooks/zoom', headers = {}, body = null } = {}) {
  const bodyStr = body !== null && typeof body === 'object' ? JSON.stringify(body) : (body || '');
  const stream = Readable.from(Buffer.from(bodyStr));

  return Object.assign(stream, {
    method: method.toUpperCase(),
    url,
    headers: { 'content-type': 'application/json', ...headers },
    body,
    rawBody: bodyStr
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
  const req = createMockReq({ method, body, headers });
  const res = createMockRes();
  const start = performance.now();
  await webhookHandler(req, res);
  const elapsed = performance.now() - start;
  return { res, elapsed };
}

const suite = {
  total: 0,
  passed: 0,
  failed: 0,
  results: []
};

async function test(id, title, fn) {
  suite.total++;
  const label = '[' + id + '] ' + title;
  try {
    await fn();
    suite.passed++;
    suite.results.push({ id, title, status: 'PASS' });
    console.log('  PASS: ' + label);
  } catch (err) {
    suite.failed++;
    suite.results.push({ id, title, status: 'FAIL', error: err.message, stack: err.stack });
    console.log('  FAIL: ' + label);
    console.log('    Error: ' + err.message);
  }
}

console.log('================================================================');
console.log('   CHALLENGER 2: Stress-Testing M2 Webhook & QoS Enrichment    ');
console.log('================================================================\n');

// ============================================================================
// SECTION 1: OUT-OF-ORDER EVENT DELIVERY STRESS-TESTS
// ============================================================================
console.log('--- SECTION 1: Out-of-Order Event Delivery ---');

await test('OOO-1', 'Basic out-of-order: participant_left arrives before participant_joined', async () => {
  const mid = 'mid_ooo1_' + Date.now();
  const userId = 'u_ooo_1';
  const email = 'ooo1@student.ua';
  const joinTime = '2026-09-16T10:00:00Z';
  const leaveTime = '2026-09-16T10:30:00Z'; // 30 min later (1800s)

  // 1. Meeting started
  const { res: rStart } = await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'OOO Test 1', host_email: 'teacher@school.ua', start_time: joinTime } }
  });
  assert.equal(rStart.statusCode, 200);

  // 2. Participant LEFT arrives FIRST (Out-of-Order)
  const { res: rLeft, elapsed: eLeft } = await callWebhook({
    event: 'meeting.participant_left',
    payload: {
      object: {
        id: mid,
        participant: { user_id: userId, user_name: 'Student OOO1', email, leave_time: leaveTime }
      }
    }
  });
  assert.equal(rLeft.statusCode, 200, 'participant_left must return 200 even when out-of-order');
  assert.ok(eLeft < 1000, 'Must respond within SLA');

  // Verify intermediate orphan state in Redis
  let meeting = await getMeeting(mid);
  assert.ok(meeting, 'Meeting must exist');
  let p = meeting.participants[email] || Object.values(meeting.participants)[0];
  assert.ok(p, 'Participant record must be created for orphan leave');
  assert.equal(p.sessions.length, 1, 'Should have 1 orphan session');
  assert.equal(p.sessions[0].join_time, null, 'Orphan session join_time is null');
  assert.equal(p.sessions[0].leave_time, leaveTime, 'Orphan session leave_time recorded');

  // 3. Participant JOINED arrives SECOND
  const { res: rJoin, elapsed: eJoin } = await callWebhook({
    event: 'meeting.participant_joined',
    payload: {
      object: {
        id: mid,
        participant: { user_id: userId, user_name: 'Student OOO1', email, join_time: joinTime }
      }
    }
  });
  assert.equal(rJoin.statusCode, 200, 'participant_joined must return 200');
  assert.ok(eJoin < 1000, 'Must respond within SLA');

  // Verify reconciled state in Redis
  meeting = await getMeeting(mid);
  p = meeting.participants[email] || Object.values(meeting.participants)[0];
  assert.ok(p, 'Participant record must be present');
  assert.equal(p.sessions.length, 1, 'Should reconcile orphan into 1 session');
  assert.equal(p.sessions[0].join_time, joinTime, 'Reconciled session join_time set');
  assert.equal(p.sessions[0].leave_time, leaveTime, 'Reconciled session leave_time preserved');
  assert.equal(p.sessions[0].duration_seconds, 1800, 'Reconciled session duration must be 1800s');
  assert.equal(p.duration_seconds, 1800, 'Participant total duration must be 1800s');
  assert.equal(p.first_join_time, joinTime, 'first_join_time must be joinTime');
  assert.equal(p.last_leave_time, leaveTime, 'last_leave_time must be leaveTime');
});

await test('OOO-2-BUG', 'BUG PROBE: Participant leave_time must not be reset to null when reconciling closed orphan session', async () => {
  const mid = 'mid_ooo2_bug_' + Date.now();
  const userId = 'u_ooo_2';
  const email = 'ooo2@student.ua';
  const joinTime = '2026-09-16T11:00:00Z';
  const leaveTime = '2026-09-16T11:20:00Z';

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'OOO Test 2', start_time: joinTime } }
  });

  // Left first, then Joined
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: userId, email, leave_time: leaveTime } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: userId, email, join_time: joinTime } } }
  });

  const meeting = await getMeeting(mid);
  const p = meeting.participants[email] || Object.values(meeting.participants)[0];

  console.log('    [Empirical observation] p.leave_time = ' + JSON.stringify(p.leave_time) + ', p.last_leave_time = ' + JSON.stringify(p.last_leave_time));

  // The participant has already left at 11:20! There are no open sessions in p.sessions.
  // Setting leave_time: null falsely indicates the participant is currently active in the meeting.
  assert.notEqual(p.leave_time, null, 'BUG: participant.leave_time was set to null despite all sessions being closed');
  assert.equal(p.leave_time, leaveTime, 'participant.leave_time should be ' + leaveTime);
});

await test('OOO-3-BUG', 'BUG PROBE: meeting.ended must not overwrite participant last_leave_time when participant already left', async () => {
  const mid = 'mid_ooo3_bug_' + Date.now();
  const userId = 'u_ooo_3';
  const email = 'ooo3@student.ua';
  const joinTime = '2026-09-16T12:00:00Z';
  const leaveTime = '2026-09-16T12:25:00Z'; // 25 min (1500s)
  const endTime = '2026-09-16T12:45:00Z';   // 45 min total meeting

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'OOO Test 3', start_time: joinTime } }
  });

  // Out of order delivery: left then joined
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: userId, email, leave_time: leaveTime } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: userId, email, join_time: joinTime } } }
  });

  // Meeting ended 20 minutes AFTER participant left
  const { res: rEnd } = await callWebhook({
    event: 'meeting.ended',
    payload: { object: { id: mid, end_time: endTime, duration: 45 } }
  });
  assert.equal(rEnd.statusCode, 200);

  const meeting = await getMeeting(mid);
  const p = meeting.participants[email] || Object.values(meeting.participants)[0];

  console.log('    [Empirical observation] After meeting.ended: p.last_leave_time = ' + p.last_leave_time + ' (expected ' + leaveTime + ')');

  // BUG: because participant_joined left p.leave_time = null, meeting.ended overwrites p.last_leave_time to endTime!
  assert.equal(p.last_leave_time, leaveTime, 'BUG: participant.last_leave_time was overwritten by meeting.ended to ' + p.last_leave_time);
});

await test('OOO-4', 'Multi-session reconnect with out-of-order second session delivery', async () => {
  const mid = 'mid_ooo4_' + Date.now();
  const userId = 'u_ooo_4';
  const email = 'ooo4@student.ua';

  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, start_time: '2026-09-16T13:00:00Z' } }
  });

  // Session 1 in order: 13:00 - 13:10 (600s)
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: userId, email, join_time: '2026-09-16T13:00:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: userId, email, leave_time: '2026-09-16T13:10:00Z' } } }
  });

  // Session 2 out of order: leave (13:30) arrives BEFORE join (13:15) (900s)
  await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: userId, email, leave_time: '2026-09-16T13:30:00Z' } } }
  });
  await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: userId, email, join_time: '2026-09-16T13:15:00Z' } } }
  });

  const meeting = await getMeeting(mid);
  const p = meeting.participants[email] || Object.values(meeting.participants)[0];
  assert.equal(p.sessions.length, 2, 'Must have exactly 2 sessions');
  // Total presence: 600s + 900s = 1500s
  assert.equal(p.duration_seconds, 1500, 'Total aggregated union duration must be 1500s (25m)');
});

await test('OOO-5', 'Orphan participant_left arriving before meeting.started is even received', async () => {
  const mid = 'mid_ooo5_unstarted_' + Date.now();
  const userId = 'u_ooo_5';
  const email = 'ooo5@student.ua';

  // 1. Participant left arrives for non-existent meeting
  const { res: rLeft } = await callWebhook({
    event: 'meeting.participant_left',
    payload: { object: { id: mid, participant: { user_id: userId, email, leave_time: '2026-09-16T14:15:00Z' } } }
  });
  assert.equal(rLeft.statusCode, 200, 'Must handle orphan leave gracefully');

  // 2. Participant joined arrives
  const { res: rJoin } = await callWebhook({
    event: 'meeting.participant_joined',
    payload: { object: { id: mid, participant: { user_id: userId, email, join_time: '2026-09-16T14:00:00Z' } } }
  });
  assert.equal(rJoin.statusCode, 200);

  // 3. Meeting started arrives last
  const { res: rStart } = await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Late Start Event', host_email: 'host@ua.com', start_time: '2026-09-16T14:00:00Z' } }
  });
  assert.equal(rStart.statusCode, 200);

  const meeting = await getMeeting(mid);
  assert.ok(meeting, 'Meeting must exist in Redis');
  assert.equal(meeting.topic, 'Late Start Event');
  const p = meeting.participants[email] || Object.values(meeting.participants)[0];
  assert.ok(p, 'Participant must be preserved when meeting.started arrives late');
  assert.equal(p.duration_seconds, 900, 'Duration 15 min preserved');
});

// ============================================================================
// SECTION 2: SIMULATED ZOOM QOS API FAILURE MODES
// ============================================================================
console.log('\n--- SECTION 2: Simulated Zoom QoS API Failure Modes ---');

const originalFetch = globalThis.fetch;

function mockOAuthFetch(customFetch) {
  globalThis.fetch = async (url, opts = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('zoom.us/oauth/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_bearer_token_xyz', expires_in: 3600 }),
        text: async () => JSON.stringify({ access_token: 'mock_bearer_token_xyz', expires_in: 3600 })
      };
    }
    return customFetch(urlStr, opts);
  };
}

await test('QoS-403', 'Simulated QoS API 403 Forbidden: Webhook returns HTTP 200 within SLA and Redis data intact', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/') || url.includes('/past_meetings/')) {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ code: 200, message: 'This API is only available for Business or higher accounts' }),
        text: async () => '{"code":200,"message":"403 Forbidden"}'
      };
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_403_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS 403 Resilience', host_email: 'teacher@403.com', start_time: '2026-09-16T15:00:00Z' } }
    });
    await callWebhook({
      event: 'meeting.participant_joined',
      payload: { object: { id: mid, participant: { user_id: 'std_403', email: 'std@403.com', join_time: '2026-09-16T15:02:00Z' } } }
    });

    const { res: rEnd, elapsed } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T15:45:00Z', duration: 45 } }
    });

    assert.equal(rEnd.statusCode, 200, 'Must return HTTP 200');
    assert.ok(elapsed < 2000, 'Webhook took ' + elapsed.toFixed(1) + 'ms, must be < 2000ms');

    const meeting = await getMeeting(mid);
    assert.ok(meeting, 'Meeting must exist in Redis');
    assert.equal(meeting.status, 'ended', 'Meeting status must be ended');
    assert.equal(meeting.topic, 'QoS 403 Resilience');
    assert.equal(meeting.duration, 45);
    const p = meeting.participants['std@403.com'] || Object.values(meeting.participants)[0];
    assert.ok(p, 'Participant telemetry must remain intact');
    assert.equal(p.email, 'std@403.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('QoS-400', 'Simulated QoS API 400 Bad Request: Webhook returns HTTP 200 within SLA and Redis data intact', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/') || url.includes('/past_meetings/')) {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ code: 4711, message: 'Invalid access token, does not contain scopes' }),
        text: async () => '{"code":4711,"message":"Bad request"}'
      };
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_400_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS 400 Test', host_email: 'teacher@400.com', start_time: '2026-09-16T16:00:00Z' } }
    });
    const { res: rEnd, elapsed } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T16:30:00Z', duration: 30 } }
    });

    assert.equal(rEnd.statusCode, 200);
    assert.ok(elapsed < 2000, 'Elapsed ' + elapsed + 'ms < 2000ms');
    const meeting = await getMeeting(mid);
    assert.equal(meeting.status, 'ended');
    assert.equal(meeting.topic, 'QoS 400 Test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('QoS-TIMEOUT', 'Simulated QoS API Network Timeout (>2500ms, 4000ms delay): Bounded timeout protects 3s SLA', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/') || url.includes('/past_meetings/')) {
      // Simulate hung upstream connection that takes 4000ms
      await new Promise(resolve => setTimeout(resolve, 4000));
      return {
        ok: true,
        status: 200,
        json: async () => ({ participants: [] }),
        text: async () => '{"participants":[]}'
      };
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_timeout_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'Timeout Test', host_email: 'teacher@timeout.com', start_time: '2026-09-16T17:00:00Z' } }
    });

    const start = performance.now();
    const { res: rEnd, elapsed } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T17:45:00Z', duration: 45 } }
    });

    console.log('    [Empirical observation] Webhook response elapsed time with 4000ms hung upstream: ' + elapsed.toFixed(1) + 'ms');

    assert.equal(rEnd.statusCode, 200, 'Must return HTTP 200 on timeout');
    assert.ok(elapsed >= 2400, 'Expected elapsed >= 2400ms due to 2500ms timeout race (got ' + elapsed.toFixed(1) + 'ms)');
    assert.ok(elapsed < 3000, 'CRITICAL SLA VIOLATION if >= 3000ms! (got ' + elapsed.toFixed(1) + 'ms)');

    const meeting = await getMeeting(mid);
    assert.ok(meeting, 'Meeting must be saved in Redis despite upstream timeout');
    assert.equal(meeting.status, 'ended');
    assert.equal(meeting.duration, 45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('QoS-500', 'Simulated QoS API 500 Internal Server Error: Webhook returns HTTP 200 within SLA and Redis intact', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/') || url.includes('/past_meetings/')) {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('HTML 500 error page from gateway'); },
        text: async () => '<html><body>500 Internal Server Error</body></html>'
      };
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_500_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS 500 Crash', host_email: 'teacher@500.com', start_time: '2026-09-16T18:00:00Z' } }
    });
    const { res: rEnd, elapsed } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T18:35:00Z', duration: 35 } }
    });

    assert.equal(rEnd.statusCode, 200, 'Must return 200 on upstream 500');
    assert.ok(elapsed < 2000, 'Elapsed ' + elapsed + 'ms < 2000ms');

    const meeting = await getMeeting(mid);
    assert.ok(meeting);
    assert.equal(meeting.status, 'ended');
    assert.equal(meeting.duration, 35);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('QoS-NET-CRASH', 'Simulated Network Crash (fetch throws ECONNREFUSED/TypeError): Webhook returns HTTP 200 and Redis intact', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/') || url.includes('/past_meetings/')) {
      throw new TypeError('fetch failed: connect ECONNREFUSED 170.114.10.15:443');
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_netcrash_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'Net Crash Test', host_email: 'teacher@crash.com', start_time: '2026-09-16T19:00:00Z' } }
    });
    const { res: rEnd, elapsed } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T19:30:00Z', duration: 30 } }
    });

    assert.equal(rEnd.statusCode, 200, 'Must catch network exceptions and return 200');
    assert.ok(elapsed < 2000);
    const meeting = await getMeeting(mid);
    assert.equal(meeting.status, 'ended');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('QoS-SUCCESS', 'Successful QoS enrichment: Primary 200 enriches device and QoS metrics into participant record', async () => {
  clearZoomTokenCache();
  mockOAuthFetch(async (url) => {
    if (url.includes('/metrics/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          participants: [
            {
              user_id: 'std_qos_win',
              user_name: 'Super Student',
              email: 'super@student.ua',
              device: 'Windows 11 PC',
              ip_address: '194.44.12.34',
              network_type: 'Wifi',
              qos_metrics: {
                audio_quality: 'good',
                video_quality: 'good',
                screen_share_quality: 'good'
              }
            }
          ]
        })
      };
    }
    return originalFetch(url);
  });

  try {
    const mid = 'mid_qos_win_' + Date.now();
    await callWebhook({
      event: 'meeting.started',
      payload: { object: { id: mid, topic: 'QoS Enrichment Win', host_email: 'teacher@win.com', start_time: '2026-09-16T20:00:00Z' } }
    });
    await callWebhook({
      event: 'meeting.participant_joined',
      payload: { object: { id: mid, participant: { user_id: 'std_qos_win', email: 'super@student.ua', join_time: '2026-09-16T20:01:00Z' } } }
    });
    const { res: rEnd } = await callWebhook({
      event: 'meeting.ended',
      payload: { object: { id: mid, end_time: '2026-09-16T20:45:00Z', duration: 45 } }
    });

    assert.equal(rEnd.statusCode, 200);
    const meeting = await getMeeting(mid);
    assert.equal(meeting.qos_enriched, true, 'Meeting must be marked qos_enriched: true');
    const p = meeting.participants['super@student.ua'] || Object.values(meeting.participants)[0];
    assert.ok(p, 'Participant must exist');
    assert.equal(p.device, 'Windows 11 PC', 'Device must be enriched');
    assert.equal(p.ip_address, '194.44.12.34', 'IP must be enriched');
    assert.equal(p.qos_metrics.audio_quality, 'good', 'QoS audio quality enriched');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// SECTION 3: CONCURRENCY & RACE CONDITION STRESS-TEST
// ============================================================================
console.log('\n--- SECTION 3: Concurrency & Race Condition Stress-Tests ---');

await test('CONCUR-1-BUG', 'BUG PROBE: Concurrent participant joins serialize without data loss in Redis', async () => {
  const mid = 'mid_concur_' + Date.now();
  await callWebhook({
    event: 'meeting.started',
    payload: { object: { id: mid, topic: 'Concurrent Stress', start_time: '2026-09-16T21:00:00Z' } }
  });

  const students = Array.from({ length: 10 }, (_, i) => ({
    user_id: 'user_c_' + i,
    email: 'student_' + i + '@concur.ua',
    name: 'Student ' + i
  }));

  // Fire 10 simultaneous joined webhooks
  const joinPromises = students.map(s =>
    callWebhook({
      event: 'meeting.participant_joined',
      payload: {
        object: {
          id: mid,
          participant: { user_id: s.user_id, email: s.email, user_name: s.name, join_time: '2026-09-16T21:05:00Z' }
        }
      }
    })
  );

  const joinResults = await Promise.all(joinPromises);
  for (const { res } of joinResults) {
    assert.equal(res.statusCode, 200);
  }

  const meetingAfterJoin = await getMeeting(mid);
  const pCount = Object.keys(meetingAfterJoin.participants || {}).length;
  console.log('    [Empirical observation] Participants stored after 10 concurrent joins: ' + pCount + ' / 10');
  assert.equal(pCount, 10, 'BUG: Data loss during concurrent joins. Stored only ' + pCount + ' of 10 participants');
});

console.log('\n================================================================');
console.log('                 CHALLENGER 2 SUMMARY                           ');
console.log('================================================================');
console.log('  Passed: ' + suite.passed + ' / ' + suite.total);
console.log('  Failed: ' + suite.failed + ' / ' + suite.total);
console.log('================================================================');

if (suite.failed > 0) {
  console.log('\n❌ FAILED TESTS (Empirically Proven Bugs):');
  for (const r of suite.results.filter(x => x.status === 'FAIL')) {
    console.log('  • [' + r.id + '] ' + r.title);
    console.log('    ' + r.error);
  }
}
