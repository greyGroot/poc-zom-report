// ee-crm/verification/tests/crm-006-persistence-fallbacks.e2e.mjs
// Automated E2E Verification Suite for CRM-006:
// Remove Silent In-Memory Persistence Fallbacks
// Validates fail-fast production invariants, error propagation, webhook 500 error sanitization,
// audit log redirection to ee:app:logs, health ping contract (200/503), and root POC decoupling.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

import {
  resolvePersistenceMode,
  getRedisClient,
  setRedisClient,
  resetRedisClient,
  isMockClient,
  checkRedisHealth,
  InMemoryRedis,
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection
} from '../../lib/redis.js';

import * as redisModule from '../../lib/redis.js';

import {
  getTeachers,
  getTeacherById,
  createTeacher,
  deleteTeacher,
  addAppLog,
  getAppLogs,
  getWeeklyLessonsCache,
  setWeeklyLessonsCache,
  saveCachedReport,
  getCachedReport,
  resetDbMemoryStore
} from '../../lib/db.js';

import {
  getZoomOccurrence,
  saveZoomOccurrence,
  getZoomOccurrencesForTeacher,
  setOccurrenceRedisClient,
  resetOccurrenceMemoryStore,
  toSafeOccurrenceId
} from '../../lib/zoom-occurrences.js';

import webhookHandler from '../../lib/zoom-webhook-handler.js';
import { GET as healthHandler } from '../../app/api/health/route.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const LOCAL_BASE_URL = 'http://localhost:3000';
const VERCEL_BASE_URL = 'https://poc-zom-report-2qvs.vercel.app';

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

function createFailingRedisClient() {
  const err = () => { throw new Error('Redis connection refused: ECONNREFUSED'); };
  return {
    ping: async () => err(),
    get: async () => err(),
    set: async () => err(),
    del: async () => err(),
    mget: async () => err(),
    hget: async () => err(),
    hgetall: async () => err(),
    hset: async () => err(),
    hdel: async () => err(),
    lpush: async () => err(),
    rpush: async () => err(),
    lrange: async () => err(),
    ltrim: async () => err(),
    zadd: async () => err(),
    zrange: async () => err(),
    zrangebyscore: async () => err(),
    keys: async () => err(),
    pipeline() {
      return {
        set() { return this; },
        exec: async () => err()
      };
    }
  };
}

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

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-006');
  console.log(`Local Base URL:  ${LOCAL_BASE_URL}`);
  console.log(`Vercel Base URL: ${VERCEL_BASE_URL}`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // ------------------------------------------------------------------------
  // Group 1: Live Deployment Verification (Vercel Production)
  // ------------------------------------------------------------------------
  console.log('--- Group 1: Live Deployment Verification (Vercel Production) ---');

  // Test 1.1: Production Health Endpoint
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/health`);
    const data = await res.json();
    const cacheControl = res.headers.get('cache-control');

    if (
      res.status === 200 &&
      data.status === 'ok' &&
      data.integrations?.redis?.connected === true &&
      data.integrations?.redis?.mode === 'upstash_cloud' &&
      cacheControl?.includes('no-store')
    ) {
      recordResult(
        'E2E-PROD-HEALTH',
        'Vercel /api/health returns 200 OK with upstash_cloud mode, connected: true, and no-store header',
        'PASS',
        `Status: ${res.status}, Mode: ${data.integrations?.redis?.mode}, Cache-Control: ${cacheControl}`
      );
    } else {
      recordResult(
        'E2E-PROD-HEALTH',
        'Vercel /api/health returned unexpected payload or status',
        'FAIL',
        `Status: ${res.status}, Body: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-HEALTH', 'Failed to reach Vercel /api/health', 'FAIL', err.message);
  }

  // Test 1.2: Production Zoom CRC Challenge
  try {
    const crcPayload = {
      event: 'endpoint.url_validation',
      payload: { plainToken: 'qa_crm006_verification_token' }
    };
    const res = await fetch(`${VERCEL_BASE_URL}/api/webhooks/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crcPayload)
    });
    const data = await res.json();

    if (res.status === 200 && data.plainToken === 'qa_crm006_verification_token' && data.encryptedToken) {
      recordResult(
        'E2E-PROD-CRC',
        'Vercel /api/webhooks/zoom responds to CRC validation with 200 OK and encrypted token',
        'PASS',
        `Encrypted Token: ${data.encryptedToken.substring(0, 16)}...`
      );
    } else {
      recordResult('E2E-PROD-CRC', 'Vercel CRC validation failed', 'FAIL', `Status: ${res.status}, Body: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    recordResult('E2E-PROD-CRC', 'Failed to call Vercel webhook CRC', 'FAIL', err.message);
  }

  // Test 1.3: Production Webhook Unauthorized Check
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/webhooks/zoom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'meeting.started', payload: { object: { id: '999999' } } })
    });
    const data = await res.json();

    if (res.status === 401 && data.error?.includes('Unauthorized')) {
      recordResult(
        'E2E-PROD-AUTH-REJECT',
        'Vercel /api/webhooks/zoom rejects unsigned webhook requests with 401 Unauthorized',
        'PASS',
        `Status: ${res.status}, Error: ${data.error}`
      );
    } else {
      recordResult('E2E-PROD-AUTH-REJECT', 'Vercel unsigned webhook rejection failed', 'FAIL', `Status: ${res.status}`);
    }
  } catch (err) {
    recordResult('E2E-PROD-AUTH-REJECT', 'Failed to test unsigned webhook on Vercel', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 2: Persistence Mode Resolution & Invariant Policy (AC-1, AC-3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Persistence Mode Resolution & Invariant Policy ---');

  try {
    // 2.1 Production without credentials throws
    assert.throws(
      () => resolvePersistenceMode({ NODE_ENV: 'production' }),
      /Production environment requires valid Upstash\/Vercel KV Redis credentials/
    );

    // 2.2 Production with USE_IN_MEMORY_REDIS throws
    assert.throws(
      () => resolvePersistenceMode({
        NODE_ENV: 'production',
        USE_IN_MEMORY_REDIS: 'true',
        UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'valid_token'
      }),
      /USE_IN_MEMORY_REDIS is forbidden in production/
    );

    // 2.3 Partial credentials throw
    assert.throws(
      () => resolvePersistenceMode({
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io'
      }),
      /Partial Redis configuration: both URL and Token must be provided/
    );

    // 2.4 Production with credentials resolves to upstash_cloud
    const prodMode = resolvePersistenceMode({
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'valid_token'
    });
    assert.equal(prodMode, 'upstash_cloud');

    // 2.5 Development without credentials resolves to in_memory
    const devNoCreds = resolvePersistenceMode({ NODE_ENV: 'development' });
    assert.equal(devNoCreds, 'in_memory');

    // 2.6 Development with USE_IN_MEMORY_REDIS resolves to in_memory
    const devOverride = resolvePersistenceMode({
      NODE_ENV: 'development',
      USE_IN_MEMORY_REDIS: 'true',
      UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'valid_token'
    });
    assert.equal(devOverride, 'in_memory');

    recordResult(
      'AC-1/AC-3-MODE-RESOLUTION',
      'resolvePersistenceMode correctly enforces production invariants and development fallback rules',
      'PASS',
      'Production rejects missing creds & mock flag; dev allows opt-in in_memory'
    );
  } catch (err) {
    recordResult('AC-1/AC-3-MODE-RESOLUTION', 'Mode resolution validation failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 3: Command Failure Propagation across Database Repositories (AC-1, FR3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: Command Failure Propagation in Database Repositories ---');

  try {
    const failingClient = createFailingRedisClient();
    setRedisClient(failingClient);

    await assert.rejects(async () => { await getTeachers(); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await getTeacherById('t_test'); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await createTeacher({ firstName: 'QA', lastName: 'Tester' }); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await deleteTeacher('t_test'); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await addAppLog({ level: 'INFO', action: 'QA', message: 'test' }); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await getAppLogs(10); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await getWeeklyLessonsCache('2026-09-21', [123]); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await setWeeklyLessonsCache('2026-09-21', 123, { lessons: 5 }); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await saveCachedReport('123', '2026-09', {}); }, /ECONNREFUSED/);
    await assert.rejects(async () => { await getCachedReport('123', '2026-09'); }, /ECONNREFUSED/);

    resetRedisClient();
    recordResult(
      'FR3-DB-PROPAGATION',
      'Database repositories (teachers, logs, weekly cache, reports) propagate Redis command failures without silent memory fallback',
      'PASS',
      'All 10 DB operations rejected with ECONNREFUSED'
    );
  } catch (err) {
    resetRedisClient();
    recordResult('FR3-DB-PROPAGATION', 'Database command failure propagation failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 4: Command Failure Propagation in Zoom Occurrence Repositories (FR3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Command Failure Propagation in Zoom Occurrences ---');

  try {
    const failingClient = createFailingRedisClient();
    setRedisClient(failingClient);
    setOccurrenceRedisClient(failingClient);

    await assert.rejects(
      async () => {
        await saveZoomOccurrence({
          uuid: 'UUID-FAIL-QA',
          topic: 'QA Failure Test',
          host_email: 'qa@example.com',
          start_time: '2026-09-27T10:00:00Z'
        });
      },
      /ECONNREFUSED/
    );

    await assert.rejects(async () => { await getZoomOccurrence('UUID-FAIL-QA'); }, /ECONNREFUSED/);
    await assert.rejects(async () => {
      await getZoomOccurrencesForTeacher({ teacherEmail: 'qa@example.com', fromDate: '2026-09-21', toDate: '2026-09-27' });
    }, /ECONNREFUSED/);
    await assert.rejects(async () => {
      await saveOccurrenceFact(toSafeOccurrenceId('UUID-FAIL-QA'), { type: 'meeting.started', uuid: 'UUID-FAIL-QA' });
    }, /ECONNREFUSED/);
    await assert.rejects(async () => {
      await getOccurrenceFacts(toSafeOccurrenceId('UUID-FAIL-QA'));
    }, /ECONNREFUSED/);
    await assert.rejects(async () => {
      await publishOccurrenceProjection(toSafeOccurrenceId('UUID-FAIL-QA'), { uuid: 'UUID-FAIL-QA', revision: 1 });
    }, /ECONNREFUSED/);

    resetRedisClient();
    setOccurrenceRedisClient(null);
    recordResult(
      'FR3-OCCURRENCE-PROPAGATION',
      'Zoom occurrence repositories propagate Redis errors without silent dual-write fallback',
      'PASS',
      'All 6 occurrence operations rejected with ECONNREFUSED'
    );
  } catch (err) {
    resetRedisClient();
    setOccurrenceRedisClient(null);
    recordResult('FR3-OCCURRENCE-PROPAGATION', 'Occurrence error propagation failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 5: Webhook Persistence Failure Returns HTTP 500 (AC-2, FR4)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Webhook Ingestion Failure Returns HTTP 500 ---');

  try {
    const failingClient = createFailingRedisClient();
    setRedisClient(failingClient);

    const req = createMockReq({
      body: {
        event: 'meeting.started',
        payload: {
          object: {
            id: '123456789',
            uuid: 'UUID-WEBHOOK-FAIL-E2E',
            topic: 'Persistence Failure Test',
            host_email: 'teacher@example.com',
            start_time: '2026-09-27T10:00:00Z'
          }
        }
      }
    });

    const res = createMockRes();
    await webhookHandler(req, res);

    assert.equal(res.statusCode, 500, 'Must return 500 when persistence fails');
    assert.equal(res.body?.error, 'ZOOM_PERSISTENCE_FAILED');
    assert.equal(res.body?.message, 'Occurrence persistence failed');
    assert.equal(res.body?.stack, undefined, 'Stack trace must not leak');
    assert.ok(!JSON.stringify(res.body).includes('ECONNREFUSED'), 'Internal error details must not leak');

    resetRedisClient();
    recordResult(
      'AC-2/FR4-WEBHOOK-500',
      'Zoom webhook returns HTTP 500 with sanitized response when occurrence persistence fails',
      'PASS',
      'Status: 500, error: ZOOM_PERSISTENCE_FAILED, sanitized payload without leaked details'
    );
  } catch (err) {
    resetRedisClient();
    recordResult('AC-2/FR4-WEBHOOK-500', 'Webhook 500 failure check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 6: Authoritative Occurrence Acknowledgement vs Secondary Audit Failure
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: Authoritative Persistence vs Best-Effort Audit Logging ---');

  try {
    const memRedis = new InMemoryRedis();
    setRedisClient(memRedis);
    setOccurrenceRedisClient(memRedis);

    const origLpush = memRedis.lpush.bind(memRedis);
    memRedis.lpush = async (key, ...args) => {
      if (key === 'ee:app:logs') {
        throw new Error('Audit log list write error: DISKFULL');
      }
      return origLpush(key, ...args);
    };

    const req = createMockReq({
      body: {
        event: 'meeting.started',
        payload: {
          object: {
            id: '9988776655',
            uuid: 'UUID-AUTH-SUCCESS-LOG-FAIL-E2E',
            topic: 'Authoritative Persistence Test',
            host_email: 'yuliasavchuk03@gmail.com',
            start_time: '2026-09-27T12:00:00Z'
          }
        }
      }
    });

    const res = createMockRes();
    await webhookHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.event, 'meeting.started');

    const occ = await getZoomOccurrence('UUID-AUTH-SUCCESS-LOG-FAIL-E2E');
    assert.ok(occ, 'Occurrence must be persisted');
    assert.equal(occ.uuid, 'UUID-AUTH-SUCCESS-LOG-FAIL-E2E');

    resetRedisClient();
    setOccurrenceRedisClient(null);
    recordResult(
      'AC-2-AUTHORITATIVE-WRITE',
      'Webhook acknowledges 200 OK after authoritative occurrence persistence even if secondary audit logging fails',
      'PASS',
      'Status: 200, occurrence saved in durable store'
    );
  } catch (err) {
    resetRedisClient();
    setOccurrenceRedisClient(null);
    recordResult('AC-2-AUTHORITATIVE-WRITE', 'Authoritative acknowledgement check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 7: Webhook Audit Logging Redirected to ee:app:logs (AC-5, FR6)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 7: Webhook Audit Logging Targets ee:app:logs ---');

  try {
    const memRedis = new InMemoryRedis();
    setRedisClient(memRedis);
    setOccurrenceRedisClient(memRedis);
    resetDbMemoryStore();

    const req = createMockReq({
      body: {
        event: 'meeting.started',
        payload: {
          object: {
            id: '1122334455',
            uuid: 'UUID-AUDIT-TARGET-E2E',
            topic: 'Audit Target E2E Test',
            host_email: 'zhur.zhur.irene@gmail.com',
            start_time: '2026-09-27T14:00:00Z'
          }
        }
      }
    });

    const res = createMockRes();
    await webhookHandler(req, res);
    assert.equal(res.statusCode, 200);

    const appLogs = await getAppLogs(10);
    const webhookLog = appLogs.find(l => l.action === 'ZOOM_WEBHOOK');
    assert.ok(webhookLog, 'Audit entry must exist in ee:app:logs');
    assert.ok(webhookLog.message.includes('meeting.started'));

    const legacyLogs = await memRedis.lrange('zoom:webhook:logs', 0, -1);
    assert.equal(legacyLogs.length, 0, 'No records written to legacy zoom:webhook:logs');

    resetRedisClient();
    setOccurrenceRedisClient(null);
    resetDbMemoryStore();
    recordResult(
      'AC-5/FR6-AUDIT-LOG-TARGET',
      'Webhook audit logging correctly writes to ee:app:logs and writes zero records to legacy zoom:webhook:logs',
      'PASS',
      'Target: ee:app:logs verified, zoom:webhook:logs count: 0'
    );
  } catch (err) {
    resetRedisClient();
    setOccurrenceRedisClient(null);
    resetDbMemoryStore();
    recordResult('AC-5/FR6-AUDIT-LOG-TARGET', 'Audit log target check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 8: Health Endpoint Connectivity Probe (200 / 503 & No-Store Header)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 8: Health Endpoint Connectivity Probe ---');

  try {
    // 8.1 Healthy probe
    const healthyClient = new InMemoryRedis();
    setRedisClient(healthyClient);

    const healthyRes = await healthHandler();
    assert.equal(healthyRes.status, 200);
    assert.equal(healthyRes.headers.get('cache-control'), 'no-store, max-age=0');
    const healthyData = await healthyRes.json();
    assert.equal(healthyData.status, 'ok');
    assert.equal(healthyData.integrations.redis.connected, true);

    // 8.2 Degraded / failing probe
    const failingClient = createFailingRedisClient();
    setRedisClient(failingClient);

    const failingRes = await healthHandler();
    assert.equal(failingRes.status, 503);
    assert.equal(failingRes.headers.get('cache-control'), 'no-store, max-age=0');
    const failingData = await failingRes.json();
    assert.equal(failingData.status, 'degraded');
    assert.equal(failingData.integrations.redis.connected, false);
    assert.equal(failingData.integrations.redis.mode, 'unavailable');

    // 8.3 Probe does not pollute ee:app:logs
    resetDbMemoryStore();
    setRedisClient(healthyClient);
    const logsBefore = await getAppLogs(50);
    await healthHandler();
    const logsAfter = await getAppLogs(50);
    assert.equal(logsAfter.length, logsBefore.length, 'Health check must not write to logs');

    resetRedisClient();
    resetDbMemoryStore();
    recordResult(
      'FR-HEALTH-PROBE',
      '/api/health performs read-only PING, returns 200 or 503 with Cache-Control: no-store, and does not pollute ee:app:logs',
      'PASS',
      '200 (ok) / 503 (degraded) status and headers verified'
    );
  } catch (err) {
    resetRedisClient();
    resetDbMemoryStore();
    recordResult('FR-HEALTH-PROBE', 'Health endpoint probe check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 9: Codebase Decoupling & Dead API Pruning (AC-4, HIGH-1, LOW-3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 9: Codebase Decoupling & Dead API Pruning ---');

  try {
    // 9.1 test-all.js does not contain test-crm-003.js
    const testAllContent = fs.readFileSync(path.resolve(process.cwd(), 'test-all.js'), 'utf-8');
    assert.ok(!testAllContent.includes('test-crm-003.js'), 'test-all.js must not include test-crm-003.js');

    // 9.2 Pruned methods are undefined
    const prunedMethods = [
      'saveMeeting',
      'getMeeting',
      'getMeetingsByIndex',
      'deleteMeeting',
      'clearWebhookLogs',
      'recordWebhookLog',
      'getWebhookLogs',
      'MEETING_KEY_PREFIX',
      'MEETINGS_INDEX_KEY',
      'WEBHOOK_LOGS_KEY'
    ];
    for (const method of prunedMethods) {
      assert.equal(redisModule[method], undefined, `Dead symbol '${method}' must be pruned`);
    }

    // 9.3 Discover every developer test and QA verification suite so newly
    // added runnable files cannot escape the parent-POC import boundary.
    const rootTestFiles = fs.readdirSync(process.cwd(), { withFileTypes: true })
      .filter(entry => entry.isFile() && /^test.*\.(?:js|mjs|cjs)$/.test(entry.name))
      .map(entry => entry.name);
    const verificationTestsDirectory = path.resolve(process.cwd(), 'verification', 'tests');
    const verificationTestFiles = fs.existsSync(verificationTestsDirectory)
      ? fs.readdirSync(verificationTestsDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name))
        .map(entry => path.join('verification', 'tests', entry.name))
      : [];
    const runnableTestFiles = [...new Set([...rootTestFiles, ...verificationTestFiles])].sort();
    assert.ok(runnableTestFiles.length > 0, 'Expected to discover runnable EE-CRM test files');

    const parentPocImportPattern = /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:\.\.\/)+api(?:\/|['"])/;
    const violatingFiles = runnableTestFiles.filter(file => {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      return parentPocImportPattern.test(content);
    });
    assert.deepEqual(
      violatingFiles,
      [],
      `Runnable EE-CRM tests must not import parent POC modules: ${violatingFiles.join(', ')}`
    );

    recordResult(
      'AC-4/HIGH-1/LOW-3-DECOUPLING',
      'All runnable test suites decoupled from root POC and dead APIs pruned from lib/redis.js',
      'PASS',
      `Scanned ${runnableTestFiles.length} runnable files; all 10 dead symbols pruned`
    );
  } catch (err) {
    recordResult('AC-4/HIGH-1/LOW-3-DECOUPLING', 'Decoupling and pruning check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Final Summary & Evidence Output
  // ------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('📊 VERIFICATION RESULTS SUMMARY');
  console.log('========================================================================');
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
    else failCount++;
  }
  console.log(`Total Scenarios: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);

  // Write evidence json
  const evidencePath = path.resolve(process.cwd(), 'verification/evidence/crm-006-vercel-evidence.json');
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        suite: 'CRM-006 Persistence Fallbacks & Reliability E2E Verification',
        timestamp: new Date().toISOString(),
        vercelBaseUrl: VERCEL_BASE_URL,
        totalScenarios: results.length,
        passed: passCount,
        failed: failCount,
        productionFailureModeCoverage: 'not_executed_requires_isolated_preview_with_invalid_redis_configuration',
        results: results.map(result => ({
          executionScope: result.id.startsWith('E2E-PROD-')
            ? 'vercel_production'
            : 'local_or_repository',
          ...result
        }))
      },
      null,
      2
    )
  );
  console.log(`Evidence written to: ${evidencePath}`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification();
