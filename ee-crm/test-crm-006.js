// ee-crm/test-crm-006.js
// Unit & Integration Test Suite for CRM-006: Remove Silent In-Memory Persistence Fallbacks
// 1. Persistence Mode Resolution & Invariant Policy
// 2. Production Fail-Fast (No In-Memory Mock in Production)
// 3. Command Failure Propagation across Database Repositories
// 4. Command Failure Propagation across Zoom Occurrence Repositories
// 5. Webhook Ingestion Persistence Failure Returns HTTP 500 (Sanitized)
// 6. Authoritative Write Acknowledgement vs Best-Effort Audit Logging
// 7. Webhook Audit Logging Redirected to ee:app:logs (Deprecate zoom:webhook:logs)
// 8. Health Endpoint Connectivity Probe (HTTP 200 vs 503) & No-Store Header
// 9. Health Endpoint Does Not Pollute ee:app:logs
// 10. Codebase Decoupling: No ../api Imports in Active Suites & Pruned Dead APIs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
  publishOccurrenceProjection,
  getZoomOccurrence as getZoomOccurrenceRedis
} from './lib/redis.js';

import * as redisModule from './lib/redis.js';

import {
  getTeachers,
  getTeacherById,
  createTeacher,
  deleteTeacher,
  bulkUpsertTeachers,
  getWeeklyLessonsCache,
  setWeeklyLessonsCache,
  setMultipleWeeklyLessonsCache,
  saveCachedReport,
  getCachedReport,
  addAppLog,
  getAppLogs,
  cleanOldAppLogs,
  resetDbMemoryStore
} from './lib/db.js';

import {
  getZoomOccurrence,
  saveZoomOccurrence,
  getZoomOccurrencesForTeacher,
  setOccurrenceRedisClient,
  resetOccurrenceMemoryStore,
  toSafeOccurrenceId
} from './lib/zoom-occurrences.js';

import webhookHandler from './lib/zoom-webhook-handler.js';
import { GET as healthHandler } from './app/api/health/route.js';

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

// Create a failing fake Redis client that throws on every command
function createFailingRedisClient() {
  return {
    async ping() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async get() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async set() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async del() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async mget() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async hget() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async hgetall() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async hset() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async hdel() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async lpush() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async rpush() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async lrange() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async ltrim() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async zadd() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async zrange() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async zrangebyscore() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    async keys() { throw new Error('Redis connection refused: ECONNREFUSED'); },
    pipeline() {
      return {
        set() { return this; },
        exec: async () => { throw new Error('Redis connection refused: ECONNREFUSED'); }
      };
    }
  };
}

console.log('====================================================');
console.log('🧪 CRM-006 Remove Silent In-Memory Persistence Fallbacks');
console.log('====================================================\n');

// ----------------------------------------------------------------------------
// 1. Persistence Mode Resolution & Invariant Policy (AC-1, AC-3)
// ----------------------------------------------------------------------------
console.log('--- 1. Persistence Mode Resolution & Invariant Policy ---');

await test('Scenario 1: resolvePersistenceMode correctly evaluates environment matrix', () => {
  // Production without credentials throws
  assert.throws(
    () => resolvePersistenceMode({ NODE_ENV: 'production' }),
    /Production environment requires valid Upstash\/Vercel KV Redis credentials/
  );

  // Production with USE_IN_MEMORY_REDIS throws (forbidden in production)
  assert.throws(
    () => resolvePersistenceMode({
      NODE_ENV: 'production',
      USE_IN_MEMORY_REDIS: 'true',
      UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'valid_token'
    }),
    /USE_IN_MEMORY_REDIS is forbidden in production/
  );

  // Production with partial credentials throws
  assert.throws(
    () => resolvePersistenceMode({
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io'
    }),
    /Partial Redis configuration: both URL and Token must be provided/
  );

  // Production with complete credentials succeeds
  const prodMode = resolvePersistenceMode({
    NODE_ENV: 'production',
    UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'valid_token'
  });
  assert.equal(prodMode, 'upstash_cloud');

  // Test mode defaults to in_memory
  const testMode = resolvePersistenceMode({ NODE_ENV: 'test' });
  assert.equal(testMode, 'in_memory');

  // Test mode with explicit flag returns in_memory
  const testFlagMode = resolvePersistenceMode({ NODE_ENV: 'test', USE_IN_MEMORY_REDIS: 'true' });
  assert.equal(testFlagMode, 'in_memory');

  // Development mode without credentials defaults to in_memory
  const devNoCreds = resolvePersistenceMode({ NODE_ENV: 'development' });
  assert.equal(devNoCreds, 'in_memory');

  // Development mode with credentials returns upstash_cloud
  const devCreds = resolvePersistenceMode({
    NODE_ENV: 'development',
    UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'valid_token'
  });
  assert.equal(devCreds, 'upstash_cloud');

  // Development mode with credentials AND USE_IN_MEMORY_REDIS=true returns in_memory
  const devOverride = resolvePersistenceMode({
    NODE_ENV: 'development',
    USE_IN_MEMORY_REDIS: 'true',
    UPSTASH_REDIS_REST_URL: 'https://valid.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'valid_token'
  });
  assert.equal(devOverride, 'in_memory');

  // Partial credentials in development throws
  assert.throws(
    () => resolvePersistenceMode({
      NODE_ENV: 'development',
      UPSTASH_REDIS_REST_TOKEN: 'token_only'
    }),
    /Partial Redis configuration: both URL and Token must be provided/
  );
});

// ----------------------------------------------------------------------------
// 2. Production Fail-Fast (AC-1)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Production Fail-Fast ---');

await test('Scenario 2: Production environment blocks forceMock and missing credentials', () => {
  const origEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.USE_IN_MEMORY_REDIS;
    resetRedisClient();

    // forceMock in production throws
    assert.throws(
      () => getRedisClient({ forceMock: true }),
      /forceMock is forbidden in production/
    );

    // Missing credentials in production throws and does not return in-memory client
    assert.throws(
      () => getRedisClient(),
      /Production environment requires valid Upstash\/Vercel KV Redis credentials/
    );
  } finally {
    process.env = origEnv;
    resetRedisClient();
  }
});

// ----------------------------------------------------------------------------
// 3. Command Failure Propagation across Database Repositories (AC-1, FR3)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Command Failure Propagation in Database Repositories ---');

await test('Scenario 3: Repository operations propagate Redis command errors instead of falling back to memory', async () => {
  const failingClient = createFailingRedisClient();
  setRedisClient(failingClient);

  // 1. getTeachers must propagate error
  await assert.rejects(
    async () => { await getTeachers(); },
    /ECONNREFUSED/
  );

  // 2. getTeacherById must propagate error
  await assert.rejects(
    async () => { await getTeacherById('t_test_123'); },
    /ECONNREFUSED/
  );

  // 3. createTeacher must propagate error
  await assert.rejects(
    async () => {
      await createTeacher({ firstName: 'Test', lastName: 'Teacher', email: 'test@example.com' });
    },
    /ECONNREFUSED/
  );

  // 4. deleteTeacher must propagate error
  await assert.rejects(
    async () => { await deleteTeacher('t_test_123'); },
    /ECONNREFUSED/
  );

  // 5. addAppLog must propagate error
  await assert.rejects(
    async () => { await addAppLog({ level: 'INFO', action: 'TEST', message: 'test' }); },
    /ECONNREFUSED/
  );

  // 6. getAppLogs must propagate error
  await assert.rejects(
    async () => { await getAppLogs(10); },
    /ECONNREFUSED/
  );

  // 7. getWeeklyLessonsCache must propagate error
  await assert.rejects(
    async () => { await getWeeklyLessonsCache('2026-09-21', [123]); },
    /ECONNREFUSED/
  );

  // 8. setWeeklyLessonsCache must propagate error
  await assert.rejects(
    async () => { await setWeeklyLessonsCache('2026-09-21', 123, { totalLessons: 5 }); },
    /ECONNREFUSED/
  );

  // 9. saveCachedReport must propagate error
  await assert.rejects(
    async () => { await saveCachedReport('123', '2026-09', { sample: true }); },
    /ECONNREFUSED/
  );

  // 10. getCachedReport must propagate error
  await assert.rejects(
    async () => { await getCachedReport('123', '2026-09'); },
    /ECONNREFUSED/
  );

  resetRedisClient();
});

// ----------------------------------------------------------------------------
// 4. Command Failure Propagation in Zoom Occurrence Repositories (FR3)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Command Failure Propagation in Zoom Occurrences ---');

await test('Scenario 4: Occurrence repository operations propagate Redis errors in durable mode', async () => {
  const failingClient = createFailingRedisClient();
  setRedisClient(failingClient);
  setOccurrenceRedisClient(failingClient);

  // 1. saveZoomOccurrence must propagate error
  await assert.rejects(
    async () => {
      await saveZoomOccurrence({
        uuid: 'UUID-FAIL-1',
        topic: 'Test Failure',
        host_email: 'test@example.com',
        start_time: '2026-09-27T10:00:00Z'
      });
    },
    /ECONNREFUSED/
  );

  // 2. getZoomOccurrence must propagate error
  await assert.rejects(
    async () => { await getZoomOccurrence('UUID-FAIL-1'); },
    /ECONNREFUSED/
  );

  // 3. getZoomOccurrencesForTeacher must propagate error
  await assert.rejects(
    async () => {
      await getZoomOccurrencesForTeacher({
        teacherEmail: 'test@example.com',
        fromDate: '2026-09-21',
        toDate: '2026-09-27'
      });
    },
    /ECONNREFUSED/
  );

  // 4. saveOccurrenceFact in redis.js must propagate error
  await assert.rejects(
    async () => {
      await saveOccurrenceFact(toSafeOccurrenceId('UUID-FAIL-1'), {
        type: 'meeting.started',
        uuid: 'UUID-FAIL-1'
      });
    },
    /ECONNREFUSED/
  );

  // 5. getOccurrenceFacts in redis.js must propagate error
  await assert.rejects(
    async () => {
      await getOccurrenceFacts(toSafeOccurrenceId('UUID-FAIL-1'));
    },
    /ECONNREFUSED/
  );

  // 6. publishOccurrenceProjection in redis.js must propagate error
  await assert.rejects(
    async () => {
      await publishOccurrenceProjection(toSafeOccurrenceId('UUID-FAIL-1'), {
        uuid: 'UUID-FAIL-1',
        revision: 1
      });
    },
    /ECONNREFUSED/
  );

  resetRedisClient();
  setOccurrenceRedisClient(null);
});

// ----------------------------------------------------------------------------
// 5. Webhook Ingestion Persistence Failure Returns HTTP 500 (AC-2, FR4)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Webhook Ingestion Failure Returns HTTP 500 ---');

await test('Scenario 5: Webhook returns HTTP 500 sanitized response when occurrence persistence fails', async () => {
  const failingClient = createFailingRedisClient();
  setRedisClient(failingClient);

  const req = createMockReq({
    body: {
      event: 'meeting.started',
      payload: {
        object: {
          id: '123456789',
          uuid: 'UUID-WEBHOOK-FAIL',
          topic: 'Persistence Failure Test',
          host_email: 'teacher@example.com',
          start_time: '2026-09-27T10:00:00Z'
        }
      }
    }
  });

  const res = createMockRes();
  await webhookHandler(req, res);

  assert.equal(res.statusCode, 500, 'Webhook must return 500 when persistence fails');
  assert.equal(res.body?.error, 'ZOOM_PERSISTENCE_FAILED');
  assert.equal(res.body?.message, 'Occurrence persistence failed');
  // Confirm sensitive Redis connection string / credentials / stack trace are NOT leaked in response body
  assert.equal(res.body?.stack, undefined);
  assert.ok(!JSON.stringify(res.body).includes('ECONNREFUSED'));

  resetRedisClient();
});

// ----------------------------------------------------------------------------
// 6. Authoritative Write Acknowledgement vs Secondary Audit Failure (AC-2)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Authoritative Write vs Best-Effort Audit Logging ---');

await test('Scenario 6: Webhook returns HTTP 200 after authoritative occurrence persistence even if secondary log fails', async () => {
  const memRedis = new InMemoryRedis();
  setRedisClient(memRedis);
  setOccurrenceRedisClient(memRedis);

  // Override lpush on the in-memory client to throw (simulating log list failure)
  const origLpush = memRedis.lpush.bind(memRedis);
  let lpushCalls = 0;
  memRedis.lpush = async (key, ...args) => {
    if (key === 'ee:app:logs') {
      lpushCalls++;
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
          uuid: 'UUID-AUTH-SUCCESS-LOG-FAIL',
          topic: 'Authoritative Persistence Test',
          host_email: 'yuliasavchuk03@gmail.com',
          start_time: '2026-09-27T12:00:00Z'
        }
      }
    }
  });

  const res = createMockRes();
  await webhookHandler(req, res);

  // Occurrence was persisted successfully, so webhook must be acknowledged with 200 OK
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.event, 'meeting.started');

  // Verify occurrence actually exists in Redis store
  const occ = await getZoomOccurrence('UUID-AUTH-SUCCESS-LOG-FAIL');
  assert.ok(occ, 'Occurrence must be persisted');
  assert.equal(occ.uuid, 'UUID-AUTH-SUCCESS-LOG-FAIL');

  resetRedisClient();
  setOccurrenceRedisClient(null);
});

// ----------------------------------------------------------------------------
// 7. Webhook Audit Logging Redirected to ee:app:logs (AC-5, FR6)
// ----------------------------------------------------------------------------
console.log('\n--- 7. Webhook Audit Logging Targets ee:app:logs ---');

await test('Scenario 7: Webhook audit logs are recorded into ee:app:logs and not zoom:webhook:logs', async () => {
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
          uuid: 'UUID-AUDIT-TARGET-TEST',
          topic: 'Audit Target Test',
          host_email: 'zhur.zhur.irene@gmail.com',
          start_time: '2026-09-27T14:00:00Z'
        }
      }
    }
  });

  const res = createMockRes();
  await webhookHandler(req, res);
  assert.equal(res.statusCode, 200);

  // 1. Check ee:app:logs
  const appLogs = await getAppLogs(10);
  const webhookLog = appLogs.find(l => l.action === 'ZOOM_WEBHOOK');
  assert.ok(webhookLog, 'Audit entry must exist in ee:app:logs');
  assert.ok(webhookLog.message.includes('meeting.started'));

  // 2. Check that zoom:webhook:logs was NOT written
  const legacyLogs = await memRedis.lrange('zoom:webhook:logs', 0, -1);
  assert.equal(legacyLogs.length, 0, 'No records must be written to legacy zoom:webhook:logs');

  resetRedisClient();
  setOccurrenceRedisClient(null);
  resetDbMemoryStore();
});

// ----------------------------------------------------------------------------
// 8. Health Endpoint Connectivity Probe (FR-Health, AC-1)
// ----------------------------------------------------------------------------
console.log('\n--- 8. Health Endpoint Connectivity Probe ---');

await test('Scenario 8: /api/health performs read-only ping and returns 200 or 503 with no-store', async () => {
  // Test A: Working Upstash Redis client returns 200 with mode: upstash_cloud
  const healthyClient = new InMemoryRedis();
  setRedisClient(healthyClient);

  const healthyRes = await healthHandler();
  assert.equal(healthyRes.status, 200);
  assert.equal(healthyRes.headers.get('cache-control'), 'no-store, max-age=0');
  const healthyData = await healthyRes.json();
  assert.equal(healthyData.status, 'ok');
  assert.equal(healthyData.integrations.redis.connected, true);
  assert.equal(healthyData.integrations.redis.mode, 'in_memory');

  // Test B: Failing Redis client returns 503 with status: degraded
  const failingClient = createFailingRedisClient();
  setRedisClient(failingClient);

  const failingRes = await healthHandler();
  assert.equal(failingRes.status, 503);
  assert.equal(failingRes.headers.get('cache-control'), 'no-store, max-age=0');
  const failingData = await failingRes.json();
  assert.equal(failingData.status, 'degraded');
  assert.equal(failingData.integrations.redis.connected, false);
  assert.equal(failingData.integrations.redis.mode, 'unavailable');

  resetRedisClient();
});

// ----------------------------------------------------------------------------
// 9. Health Endpoint Does Not Pollute ee:app:logs
// ----------------------------------------------------------------------------
console.log('\n--- 9. Health Endpoint Does Not Pollute ee:app:logs ---');

await test('Scenario 9: /api/health probe does not write log entries to ee:app:logs', async () => {
  const memRedis = new InMemoryRedis();
  setRedisClient(memRedis);
  resetDbMemoryStore();

  const logsBefore = await getAppLogs(50);
  const initialCount = logsBefore.length;

  const res = await healthHandler();
  assert.equal(res.status, 200);

  const logsAfter = await getAppLogs(50);
  assert.equal(logsAfter.length, initialCount, 'Health check must not insert entries into ee:app:logs');

  resetRedisClient();
  resetDbMemoryStore();
});

// ----------------------------------------------------------------------------
// 10. Codebase Decoupling & Dead API Pruning (HIGH-1, LOW-3, AC-4)
// ----------------------------------------------------------------------------
console.log('\n--- 10. Codebase Decoupling & Dead API Pruning ---');

await test('Scenario 10: test-all.js does not run CRM-003, no ../api imports in active tests, dead APIs pruned', () => {
  // 1. Verify test-all.js does not contain test-crm-003.js
  const testAllContent = fs.readFileSync(path.resolve(process.cwd(), 'test-all.js'), 'utf-8');
  assert.ok(!testAllContent.includes('test-crm-003.js'), 'test-all.js must not include test-crm-003.js');

  // 2. Verify dead legacy methods are not exported from lib/redis.js
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
    assert.equal(
      redisModule[method],
      undefined,
      `Dead method/constant '${method}' must be pruned from lib/redis.js`
    );
  }

  // 3. Verify active test files do not import ../api/...
  const activeTestFiles = [
    'test-all.js',
    'test-parser.js',
    'test-db.js',
    'test-zoom-occurrences.js',
    'test-crm-002.js',
    'test-crm-004.js',
    'test-crm-005.js',
    'test-crm-006.js',
    'test-schoolmate.js'
  ];

  for (const file of activeTestFiles) {
    const filePath = path.resolve(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasParentPocImport = /(?:from\s+['"][^'"]*\.\.\/api|import\s+['"][^'"]*\.\.\/api)/.test(content);
      assert.ok(!hasParentPocImport, `Active test file ${file} must not import from parent ../api/`);
    }
  }
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedCount} CRM-006 TESTS PASSED!`);
console.log('====================================================\n');
