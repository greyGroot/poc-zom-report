// ee-crm/verification/tests/crm-007-network-reliability.e2e.mjs
// Automated Cumulative E2E Verification Suite for CRM-007:
// Add Network Reliability Abstractions to Schoolmate Client
// Validates timeout bounds, exponential backoff retries, session recovery,
// privacy sanitization, HTTP 503 mapping, live Vercel deployment, and partial degradation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

import {
  SchoolmateClient,
  SchoolmateTimeoutError,
  SchoolmateHttpError,
  SchoolmateUnavailableError,
  isSchoolmateUnavailableError,
  toPublicSchoolmateError
} from '../../lib/infrastructure/schoolmate.js';

import { getTeacherDayData } from '../../lib/services/teacher-day.js';

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

function mockJsonResponse(data, status = 200, statusText = 'OK', headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function mockTextResponse(text, status = 200, statusText = 'OK', headers = {}) {
  return new Response(text, {
    status,
    statusText,
    headers: {
      'Content-Type': 'text/plain',
      ...headers
    }
  });
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-007');
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
      data.integrations?.schoolmate?.configured === true &&
      cacheControl?.includes('no-store')
    ) {
      recordResult(
        'E2E-PROD-HEALTH',
        'Vercel /api/health returns 200 OK with upstash_cloud mode, Schoolmate configured, and no-store header',
        'PASS',
        `Status: ${res.status}, Redis Mode: ${data.integrations?.redis?.mode}, SM Configured: ${data.integrations?.schoolmate?.configured}`
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

  // Test 1.2: Production Report API Validation
  try {
    const resEmpty = await fetch(`${VERCEL_BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const dataEmpty = await resEmpty.json();

    const resNoDate = await fetch(`${VERCEL_BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 17251 })
    });
    const dataNoDate = await resNoDate.json();

    if (
      resEmpty.status === 400 &&
      dataEmpty.error?.includes('teacherId is required') &&
      resNoDate.status === 400 &&
      dataNoDate.error?.includes('fromDate is required')
    ) {
      recordResult(
        'E2E-PROD-REPORT-VALIDATION',
        'Vercel /api/schoolmate/report validates request body and returns HTTP 400 for missing fields',
        'PASS',
        'Empty body -> 400, Missing fromDate -> 400 verified'
      );
    } else {
      recordResult(
        'E2E-PROD-REPORT-VALIDATION',
        'Vercel report validation did not return expected 400 status codes',
        'FAIL',
        `resEmpty: ${resEmpty.status}, resNoDate: ${resNoDate.status}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-REPORT-VALIDATION', 'Failed to probe Vercel report validation', 'FAIL', err.message);
  }

  // Test 1.3: Production Weekly Lessons API Contract
  try {
    const resEmptyList = await fetch(`${VERCEL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherIds: [] })
    });
    const dataEmptyList = await resEmptyList.json();

    const resTeacher = await fetch(`${VERCEL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherIds: [17251],
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const dataTeacher = await resTeacher.json();

    if (
      resEmptyList.status === 200 &&
      dataEmptyList.results &&
      Object.keys(dataEmptyList.results).length === 0 &&
      resTeacher.status === 200 &&
      dataTeacher.results?.['17251']?.totalLessons === 20 &&
      dataTeacher.results?.['17251']?.totalMinutes === 1200
    ) {
      recordResult(
        'E2E-PROD-WEEKLY-LESSONS',
        'Vercel /api/teachers/weekly-lessons returns 200 OK and aggregates weekly summary for teacher 17251',
        'PASS',
        `Teacher 17251 lessons: ${dataTeacher.results['17251'].totalLessons}, minutes: ${dataTeacher.results['17251'].totalMinutes}`
      );
    } else {
      recordResult(
        'E2E-PROD-WEEKLY-LESSONS',
        'Vercel weekly lessons returned unexpected response',
        'FAIL',
        `Status: ${resTeacher.status}, Data: ${JSON.stringify(dataTeacher)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-WEEKLY-LESSONS', 'Failed to test weekly lessons on Vercel', 'FAIL', err.message);
  }

  // Test 1.4: Production Live Report Query (Savchuk Yuliia 2026-09-14 to 2026-09-20)
  try {
    const startTime = Date.now();
    const res = await fetch(`${VERCEL_BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        teacherName: 'Savchuk Yuliia',
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const durationMs = Date.now() - startTime;
    const data = await res.json();

    if (
      res.status === 200 &&
      data.totalLessonsCount === 20 &&
      data.totalMinutesCalculated === 1200 &&
      data.source === 'schoolmate_group_class_detail'
    ) {
      recordResult(
        'E2E-PROD-LIVE-REPORT',
        'Vercel live Schoolmate report query executes successfully via group class detail pipeline with real data',
        'PASS',
        `Lessons: ${data.totalLessonsCount}, Minutes: ${data.totalMinutesCalculated}, Wage: ${data.totalWage}, Duration: ${durationMs}ms`
      );
    } else {
      recordResult(
        'E2E-PROD-LIVE-REPORT',
        'Vercel live report returned unexpected data',
        'FAIL',
        `Status: ${res.status}, Lessons: ${data.totalLessonsCount}, Minutes: ${data.totalMinutesCalculated}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-LIVE-REPORT', 'Failed to fetch live report from Vercel', 'FAIL', err.message);
  }

  // Test 1.5: Production Teacher Day Endpoint
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/teachers/17251/days/2026-09-18`);
    const data = await res.json();

    if (
      res.status === 200 &&
      data.success === true &&
      data.schoolmate?.state === 'available' &&
      data.schoolmate?.totalLessons === 5 &&
      data.zoom?.state === 'available'
    ) {
      recordResult(
        'E2E-PROD-TEACHER-DAY',
        'Vercel /api/teachers/17251/days/2026-09-18 returns 200 OK with both Schoolmate and Zoom evidence available',
        'PASS',
        `Schoolmate: ${data.schoolmate.totalLessons} lessons (${data.schoolmate.totalMinutes}m), Zoom: ${data.zoom.totalMeetings} meetings`
      );
    } else {
      recordResult(
        'E2E-PROD-TEACHER-DAY',
        'Vercel teacher day returned unexpected response',
        'FAIL',
        `Status: ${res.status}, SM State: ${data.schoolmate?.state}, Zoom State: ${data.zoom?.state}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-TEACHER-DAY', 'Failed to test teacher day on Vercel', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 2: Timeout & AbortController Bounds (Story AC-1, FR2)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Timeout & AbortController Bounds ---');

  try {
    const client = new SchoolmateClient({
      defaultTimeoutMs: 35,
      maxAttempts: 1,
      fetch: (url, init) => {
        return new Promise((resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      }
    });

    await assert.rejects(
      async () => {
        await client._request('https://empireenglish.schoolmate.eu/admin');
      },
      (err) => {
        assert(err instanceof SchoolmateUnavailableError, 'Must throw SchoolmateUnavailableError');
        assert.equal(err.name, 'SchoolmateUnavailableError');
        assert.equal(err.cause?.name, 'SchoolmateTimeoutError');
        assert.equal(err.cause?.timeoutMs, 35);
        assert.equal(err.cause?.pathname, '/admin');
        return true;
      }
    );

    recordResult(
      'AC-1/FR2-TIMEOUT-ABORT',
      'Hanging Schoolmate request is aborted by AbortController and wrapped in SchoolmateTimeoutError',
      'PASS',
      'Timeout duration: 35ms, Cause: SchoolmateTimeoutError with pathname /admin'
    );
  } catch (err) {
    recordResult('AC-1/FR2-TIMEOUT-ABORT', 'Hanging fetch timeout test failed', 'FAIL', err.message);
  }

  // Test 2.2: PDF Generation & Download 25s Policy
  try {
    const recordedPolicies = [];
    const client = new SchoolmateClient({
      userName: 'test-user',
      password: 'test-password',
      fetch: async (url) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/admin')) {
          return mockTextResponse('OK', 200, 'OK', { 'set-cookie': 'ASP.NET_SessionId=sess_pdf; path=/' });
        }
        if (urlStr.endsWith('/security/index')) {
          return mockJsonResponse({ IsSuccess: true });
        }
        if (urlStr.endsWith('/teacher/printemployeeschedule')) {
          return mockJsonResponse({
            IsSuccess: true,
            Data: { AbsolutePath: 'temp%5cSchedule.pdf', FileName: 'Schedule' }
          });
        }
        if (urlStr.includes('/common/download')) {
          return new Response(new Uint8Array([37, 80, 68, 70]), {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' }
          });
        }
        throw new Error(`Unhandled: ${urlStr}`);
      }
    });

    const origReqAuth = client._requestAuthenticated.bind(client);
    client._requestAuthenticated = async (url, init, policy, isReplay) => {
      recordedPolicies.push(policy?.timeoutMs);
      return origReqAuth(url, init, policy, isReplay);
    };

    const pdfRes = await client.getTeacherSchedulePdf({
      teacherId: 17251,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });

    assert.ok(pdfRes.buffer);
    assert.deepEqual(recordedPolicies, [25000, 25000]);

    recordResult(
      'FR2-PDF-TIMEOUT-POLICY',
      'PDF generation and download endpoints enforce dedicated 25-second timeout policy',
      'PASS',
      'Print request: 25000ms, Download request: 25000ms'
    );
  } catch (err) {
    recordResult('FR2-PDF-TIMEOUT-POLICY', 'PDF timeout policy test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 3: Transient 502/503/504 Retry with Exponential Backoff (Story AC-2, FR3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: Transient HTTP 502/503/504 Retry with Backoff ---');

  try {
    let callCount = 0;
    const sleeps = [];
    const client = new SchoolmateClient({
      defaultTimeoutMs: 5000,
      maxAttempts: 3,
      baseDelayMs: 200,
      jitterRatio: 0,
      random: () => 0,
      sleep: async (ms) => sleeps.push(ms),
      fetch: async (url, init) => {
        callCount++;
        assert.equal(init.cache, 'no-store', 'Every fetch must declare cache: no-store');
        if (callCount < 3) {
          return mockTextResponse('Bad Gateway', 502, 'Bad Gateway');
        }
        return mockJsonResponse({ IsSuccess: true, Data: { message: 'recovered' } }, 200);
      }
    });

    const res = await client._request('https://empireenglish.schoolmate.eu/test-502');
    assert.equal(res.status, 200);
    assert.equal(callCount, 3);
    assert.deepEqual(sleeps, [200, 400]);

    recordResult(
      'AC-2/FR3-502-RETRY-SUCCESS',
      'Transient HTTP 502 automatically retries with exponential backoff (200ms -> 400ms) and recovers on attempt 3',
      'PASS',
      '3 attempts executed, delays [200ms, 400ms] verified'
    );
  } catch (err) {
    recordResult('AC-2/FR3-502-RETRY-SUCCESS', 'Transient 502 retry test failed', 'FAIL', err.message);
  }

  // Test 3.2: Exhausted 503 throws SchoolmateUnavailableError
  try {
    let callCount = 0;
    const sleeps = [];
    const client = new SchoolmateClient({
      maxAttempts: 3,
      baseDelayMs: 150,
      jitterRatio: 0,
      sleep: async (ms) => sleeps.push(ms),
      fetch: async () => {
        callCount++;
        return mockTextResponse('Service Unavailable', 503, 'Service Unavailable');
      }
    });

    await assert.rejects(
      async () => {
        await client._request('https://empireenglish.schoolmate.eu/test-503');
      },
      (err) => {
        assert(err instanceof SchoolmateUnavailableError);
        assert.equal(err.code, 'SCHOOLMATE_UNAVAILABLE');
        assert.equal(err.attempts, 3);
        assert.equal(err.cause?.status, 503);
        return true;
      }
    );

    assert.equal(callCount, 3);
    assert.deepEqual(sleeps, [150, 300]);

    recordResult(
      'AC-2-EXHAUSTED-503',
      'Exhausted HTTP 503 across all 3 attempts throws SchoolmateUnavailableError with HTTP cause',
      'PASS',
      'Attempts: 3, Error code: SCHOOLMATE_UNAVAILABLE, Cause status: 503'
    );
  } catch (err) {
    recordResult('AC-2-EXHAUSTED-503', 'Exhausted 503 test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 4: Allow-Listed vs Non-Allow-Listed Network Errors (FR3, FR4)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Allow-Listed Network Errors vs Unexpected Errors ---');

  try {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE'];
    for (const code of retryableCodes) {
      let attempts = 0;
      const sleeps = [];
      const client = new SchoolmateClient({
        maxAttempts: 3,
        baseDelayMs: 50,
        jitterRatio: 0,
        sleep: async (ms) => sleeps.push(ms),
        fetch: async () => {
          attempts++;
          if (attempts < 2) {
            const err = new Error(`Socket failure ${code}`);
            err.code = code;
            throw err;
          }
          return mockJsonResponse({ IsSuccess: true });
        }
      });

      const res = await client._request('https://empireenglish.schoolmate.eu/test-network');
      assert.equal(res.status, 200);
      assert.equal(attempts, 2, `Code ${code} must trigger retry`);
      assert.equal(sleeps.length, 1);
    }

    recordResult(
      'FR3-ALLOWLISTED-NETWORK-ERRORS',
      'All 7 transient network error codes (ECONNRESET, ETIMEDOUT, EAI_AGAIN, UND_ERR_SOCKET, ECONNREFUSED, ENOTFOUND, EPIPE) trigger retry',
      'PASS',
      'Verified retry behavior across all 7 codes'
    );
  } catch (err) {
    recordResult('FR3-ALLOWLISTED-NETWORK-ERRORS', 'Allow-listed network error test failed', 'FAIL', err.message);
  }

  // Test 4.2: Non-allow-listed TypeError fails fast
  try {
    let attempts = 0;
    const client = new SchoolmateClient({
      maxAttempts: 3,
      fetch: async () => {
        attempts++;
        throw new TypeError('Failed to fetch: invalid URL scheme');
      }
    });

    await assert.rejects(
      async () => {
        await client._request('https://empireenglish.schoolmate.eu/test-type-error');
      },
      (err) => {
        assert(err instanceof TypeError);
        return true;
      }
    );
    assert.equal(attempts, 1, 'TypeError must not be retried');

    recordResult(
      'FR4-NON-ALLOWLISTED-FAIL-FAST',
      'Non-allow-listed unexpected exceptions (TypeError, SyntaxError) fail immediately without retry',
      'PASS',
      '1 attempt executed, zero retries'
    );
  } catch (err) {
    recordResult('FR4-NON-ALLOWLISTED-FAIL-FAST', 'Non-allow-listed fail-fast test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 5: Non-Retryable Client Errors (400, 403, 404) (Story AC-3, FR4)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Non-Retryable Client Errors (400, 403, 404) ---');

  try {
    for (const status of [400, 403, 404]) {
      let attempts = 0;
      const sleeps = [];
      const client = new SchoolmateClient({
        maxAttempts: 3,
        sleep: async (ms) => sleeps.push(ms),
        fetch: async () => {
          attempts++;
          return mockTextResponse('Client Error', status, 'Client Error');
        }
      });

      await assert.rejects(
        async () => {
          await client._request('https://empireenglish.schoolmate.eu/test-client-err');
        },
        (err) => {
          assert(err instanceof SchoolmateHttpError);
          assert.equal(err.status, status);
          return true;
        }
      );
      assert.equal(attempts, 1, `HTTP ${status} must not be retried`);
      assert.equal(sleeps.length, 0, `HTTP ${status} must not trigger sleep`);
    }

    recordResult(
      'AC-3/FR4-CLIENT-ERRORS-NO-RETRY',
      'HTTP 400, 403, and 404 client errors terminate immediately on attempt 1 without exponential backoff',
      'PASS',
      'Tested 400, 403, 404 -> each executed exactly 1 attempt'
    );
  } catch (err) {
    recordResult('AC-3/FR4-CLIENT-ERRORS-NO-RETRY', 'Client error no-retry test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 6: Session Expiration & Re-Authentication (Story AC-3)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: Session Expiration & Re-Authentication ---');

  try {
    let loginCount = 0;
    let endpointAttempts = 0;
    const sleeps = [];

    const client = new SchoolmateClient({
      userName: 'test-user',
      password: 'test-password',
      sleep: async (ms) => sleeps.push(ms),
      fetch: async (url) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/admin')) {
          loginCount++;
          return mockTextResponse('OK', 200, 'OK', {
            'set-cookie': `ASP.NET_SessionId=session_${loginCount}; path=/`
          });
        }
        if (urlStr.endsWith('/security/index')) {
          return mockJsonResponse({ IsSuccess: true, Message: 'Logged in' });
        }
        if (urlStr.endsWith('/calendar/getschedulerevents')) {
          endpointAttempts++;
          if (endpointAttempts === 1) {
            return mockTextResponse('Unauthorized', 401, 'Unauthorized');
          }
          return mockJsonResponse({
            IsSuccess: true,
            Data: { CalendarDays: [], SchedulerEvents: [] }
          });
        }
        throw new Error(`Unhandled: ${urlStr}`);
      }
    });

    client.sessionId = 'stale_session_123';
    client.sessionExpiresAt = Date.now() + 10000;

    const res = await client.getSchedulerEvents({ date: '2026-09-27' });
    assert.ok(res);
    assert.equal(endpointAttempts, 2, 'Initial 401 + 1 replay');
    assert.equal(loginCount, 1, 'Login executed once');
    assert.equal(sleeps.length, 0, 'No backoff delay for 401 re-auth');
    assert.equal(client.sessionId, 'session_1');

    recordResult(
      'AC-3-SESSION-REAUTHENTICATION',
      'HTTP 401 triggers one-time session invalidation, re-login, and replay without backoff sleep',
      'PASS',
      '1 login, 2 endpoint attempts, 0 backoff sleeps'
    );
  } catch (err) {
    recordResult('AC-3-SESSION-REAUTHENTICATION', 'Session re-authentication test failed', 'FAIL', err.message);
  }

  // Test 6.2: Repeated 401 is bounded
  try {
    let loginCount = 0;
    let endpointAttempts = 0;

    const client = new SchoolmateClient({
      userName: 'test-user',
      password: 'test-password',
      fetch: async (url) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/admin')) {
          loginCount++;
          return mockTextResponse('OK', 200, 'OK', { 'set-cookie': `ASP.NET_SessionId=sess_${loginCount}; path=/` });
        }
        if (urlStr.endsWith('/security/index')) {
          return mockJsonResponse({ IsSuccess: true });
        }
        if (urlStr.endsWith('/calendar/getschedulerevents')) {
          endpointAttempts++;
          return mockTextResponse('Unauthorized', 401, 'Unauthorized');
        }
        throw new Error(`Unhandled: ${urlStr}`);
      }
    });

    client.sessionId = 'stale_session';
    client.sessionExpiresAt = Date.now() + 10000;

    await assert.rejects(
      async () => {
        await client.getSchedulerEvents({ date: '2026-09-27' });
      },
      (err) => {
        assert(err instanceof SchoolmateHttpError);
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(loginCount, 1);
    assert.equal(endpointAttempts, 2);

    recordResult(
      'AC-3-BOUNDED-REPEATED-401',
      'Repeated HTTP 401 halts after exactly 1 re-login replay and throws SchoolmateHttpError(401)',
      'PASS',
      'Bounded to 1 login and 2 attempts'
    );
  } catch (err) {
    recordResult('AC-3-BOUNDED-REPEATED-401', 'Repeated 401 bound test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 7: Safe Logging & Privacy / Security Invariants
  // ------------------------------------------------------------------------
  console.log('\n--- Group 7: Safe Logging & Privacy / Security Invariants ---');

  try {
    const warnings = [];
    const client = new SchoolmateClient({
      maxAttempts: 2,
      baseDelayMs: 10,
      jitterRatio: 0,
      logger: {
        warn: (msg) => warnings.push(msg),
        info: () => {},
        error: () => {}
      },
      fetch: async () => {
        return mockTextResponse('Gateway Timeout', 504, 'Gateway Timeout');
      }
    });

    await assert.rejects(async () => {
      await client._request('https://empireenglish.schoolmate.eu/common/download?fpath=secret%2Fpath.pdf&fname=private_sched.pdf&d=true');
    });

    assert.equal(warnings.length, 1);
    const warn = warnings[0];
    assert(warn.includes('/common/download'), 'Must include pathname');
    assert(warn.includes('504'), 'Must include HTTP status');
    assert(!warn.includes('secret'), 'Must NOT log query path');
    assert(!warn.includes('private_sched'), 'Must NOT log file name query');
    assert(!warn.includes('ASP.NET_SessionId'), 'Must NOT log session IDs');

    recordResult(
      'SEC-SAFE-DIAGNOSTICS',
      'Retry warning diagnostics redact query strings, file paths, credentials, and session cookies',
      'PASS',
      'Safe warning logged: pathname and status preserved, query parameters stripped'
    );
  } catch (err) {
    recordResult('SEC-SAFE-DIAGNOSTICS', 'Safe diagnostics test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 8: Error Mapping & Clean Service-Unavailable Contract
  // ------------------------------------------------------------------------
  console.log('\n--- Group 8: Error Mapping & Clean Service-Unavailable Contract ---');

  try {
    const timeoutErr = new SchoolmateTimeoutError('Timeout on /admin', { pathname: '/admin', timeoutMs: 10000 });
    const unavailableErr = new SchoolmateUnavailableError('Outage', { attempts: 3, lastError: timeoutErr, cause: timeoutErr });

    assert.equal(isSchoolmateUnavailableError(unavailableErr), true);
    assert.equal(isSchoolmateUnavailableError(timeoutErr), true);
    assert.equal(isSchoolmateUnavailableError(new Error('Unknown')), false);

    const pubOutage = toPublicSchoolmateError(unavailableErr);
    assert.equal(pubOutage.status, 503);
    assert.deepEqual(pubOutage.body, {
      error: 'External service unavailable',
      code: 'SCHOOLMATE_UNAVAILABLE'
    });

    recordResult(
      'CONTRACT-503-MAPPING',
      'toPublicSchoolmateError correctly maps SchoolmateUnavailableError & TimeoutError to HTTP 503 and safe copy',
      'PASS',
      'Status: 503, error: External service unavailable, code: SCHOOLMATE_UNAVAILABLE'
    );
  } catch (err) {
    recordResult('CONTRACT-503-MAPPING', 'Error mapping test failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 9: Partial Schedule Degradation Observability
  // ------------------------------------------------------------------------
  console.log('\n--- Group 9: Partial Schedule Degradation Observability ---');

  try {
    const warnings = [];
    const client = new SchoolmateClient({
      userName: 'test-user',
      password: 'test-password',
      logger: {
        warn: (msg) => warnings.push(msg),
        info: () => {},
        error: () => {}
      },
      fetch: async (url, init) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/admin')) {
          return mockTextResponse('OK', 200, 'OK', { 'set-cookie': 'ASP.NET_SessionId=sess_degrade; path=/' });
        }
        if (urlStr.endsWith('/security/index')) {
          return mockJsonResponse({ IsSuccess: true });
        }
        if (urlStr.endsWith('/teacher/getteachergroupclasslist')) {
          return mockJsonResponse({
            IsSuccess: true,
            Data: {
              TeacherGroupList: [
                { GroupId: 201, GroupName: 'Healthy Group' },
                { GroupId: 202, GroupName: 'Failing Group' }
              ]
            }
          });
        }
        if (urlStr.endsWith('/calendar/getschedulerevents')) {
          return mockJsonResponse({ IsSuccess: true, Data: { SchedulerEvents: [] } });
        }
        if (urlStr.endsWith('/teacher/getteachergroupclassdetail')) {
          const body = JSON.parse(init.body);
          if (body.groupId === 202) {
            return mockTextResponse('Group Detail Internal Error', 500, 'Internal Error');
          }
          return mockJsonResponse({
            IsSuccess: true,
            Data: {
              LessonClasseList: [
                {
                  GroupLessonId: 8001,
                  ClassName: 'Healthy Group',
                  StrLessonDate: '16/09/2026',
                  DurationMinutes: 60,
                  EnrolledStudents: 3,
                  AttendanceChecked: true,
                  TeacherRatePerLesson: '300.00',
                  CurrencySymbol: '₴'
                }
              ],
              WageSum: '300.00',
              TotalWage: '300.00 ₴',
              CurrencySymbol: '₴'
            }
          });
        }
        throw new Error(`Unhandled: ${urlStr}`);
      }
    });

    const res = await client.getTeacherClassesSchedule({
      teacherId: 17251,
      fromDate: '2026-09-14',
      toDate: '2026-09-20',
      teacherName: 'Savchuk Yuliia'
    });

    assert.equal(res.totalLessonsCount, 1);
    assert.equal(res.totalGroupsCount, 2);
    assert.ok(warnings.some(w => w.includes('group 202 (Failing Group) failed')));

    recordResult(
      'OBSERVABILITY-PARTIAL-DEGRADATION',
      'getTeacherClassesSchedule handles individual group failure with warning log and returns aggregate of healthy groups',
      'PASS',
      'Healthy group lessons: 1, Failing group logged with warning'
    );
  } catch (err) {
    recordResult('OBSERVABILITY-PARTIAL-DEGRADATION', 'Partial degradation test failed', 'FAIL', err.message);
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
  const evidencePath = path.resolve(process.cwd(), 'verification/evidence/crm-007-vercel-evidence.json');
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        suite: 'CRM-007 Network Reliability Abstractions E2E Verification',
        timestamp: new Date().toISOString(),
        vercelBaseUrl: VERCEL_BASE_URL,
        totalScenarios: results.length,
        passed: passCount,
        failed: failCount,
        results
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
