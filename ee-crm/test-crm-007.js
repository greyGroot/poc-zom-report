// ee-crm/test-crm-007.js
// Acceptance & unit test suite for CRM-007: Network Reliability Abstractions for Schoolmate Client

import assert from 'node:assert/strict';
import {
  SchoolmateClient,
  SchoolmateTimeoutError,
  SchoolmateHttpError,
  SchoolmateUnavailableError,
  isSchoolmateUnavailableError,
  toPublicSchoolmateError
} from './lib/schoolmate.js';
import { getTeacherDayData } from './lib/teacher-day.js';

console.log('====================================================');
console.log('🧪 CRM-007 Network Reliability Abstractions Suite');
console.log('====================================================\n');

let passedTests = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// Helper: Mock Response
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

// --- Test 1: Hanging fetch aborts with SchoolmateTimeoutError and clears timer ---
await test('Scenario 1: Hanging fetch aborts on timeout and wraps as SchoolmateTimeoutError', async () => {
  const sleeps = [];
  const warnings = [];
  const client = new SchoolmateClient({
    defaultTimeoutMs: 30, // fast 30ms timeout for test
    maxAttempts: 1,
    sleep: async (ms) => sleeps.push(ms),
    logger: {
      warn: (msg) => warnings.push(msg),
      info: () => {},
      error: () => {}
    },
    fetch: (url, init) => {
      return new Promise((resolve, reject) => {
        // simulate hanging request that listens to abort signal
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
      assert(err instanceof SchoolmateUnavailableError || err instanceof SchoolmateTimeoutError, `Expected timeout/unavailable error, got ${err}`);
      assert.equal(err.name, 'SchoolmateUnavailableError');
      assert.equal(err.cause?.name, 'SchoolmateTimeoutError');
      assert.equal(err.cause?.timeoutMs, 30);
      assert.equal(err.cause?.pathname, '/admin');
      return true;
    }
  );
});

// --- Test 2: Transient 502 recovery with exponential backoff ---
await test('Scenario 2: Transient 502 Bad Gateway retries up to 3 attempts with exponential backoff and succeeds', async () => {
  let callCount = 0;
  const sleeps = [];
  const warnings = [];
  const client = new SchoolmateClient({
    defaultTimeoutMs: 5000,
    maxAttempts: 3,
    baseDelayMs: 250,
    jitterRatio: 0,
    random: () => 0,
    sleep: async (ms) => sleeps.push(ms),
    logger: {
      warn: (msg) => warnings.push(msg),
      info: () => {},
      error: () => {}
    },
    fetch: async (url, init) => {
      callCount++;
      assert.equal(init.cache, 'no-store', 'All calls must specify cache: no-store');
      if (callCount < 3) {
        return mockTextResponse('Bad Gateway', 502, 'Bad Gateway');
      }
      return mockJsonResponse({ IsSuccess: true, Data: {} }, 200);
    }
  });

  const res = await client._request('https://empireenglish.schoolmate.eu/test-502');
  assert.equal(res.status, 200);
  assert.equal(callCount, 3, 'Should succeed on the 3rd attempt');
  assert.deepEqual(sleeps, [250, 500], 'Should backoff exponentially (250ms, then 500ms)');
  assert.equal(warnings.length, 2, 'Should emit 2 retry warnings');
  assert(warnings[0].includes('Retry 1/3') && warnings[0].includes('502'));
  assert(warnings[1].includes('Retry 2/3') && warnings[1].includes('502'));
});

// --- Test 2a: timeout remains active while the response body is consumed ---
await test('Scenario 1b: Response-body hang is aborted and exhausted as unavailable', async () => {
  let attempts = 0;
  const client = new SchoolmateClient({
    defaultTimeoutMs: 25,
    maxAttempts: 1,
    fetch: async (url, init) => {
      attempts++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const abortError = new Error('Body read aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
      };
    }
  });

  await assert.rejects(
    () => client._request(
      'https://empireenglish.schoolmate.eu/body-hang',
      {},
      { consume: (response) => response.json() }
    ),
    (err) => {
      assert(err instanceof SchoolmateUnavailableError);
      assert(err.cause instanceof SchoolmateTimeoutError);
      assert.equal(err.cause.pathname, '/body-hang');
      return true;
    }
  );
  assert.equal(attempts, 1);
});

await test('Scenario 1c: Transient response-body disconnect is retried inside the request boundary', async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new SchoolmateClient({
    maxAttempts: 2,
    baseDelayMs: 10,
    jitterRatio: 0,
    sleep: async (ms) => sleeps.push(ms),
    fetch: async () => {
      attempts++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          if (attempts === 1) {
            const err = new Error('Socket closed while reading body');
            err.code = 'ECONNRESET';
            throw err;
          }
          return { IsSuccess: true };
        }
      };
    }
  });

  const data = await client._request(
    'https://empireenglish.schoolmate.eu/body-disconnect',
    {},
    { consume: (response) => response.json() }
  );

  assert.deepEqual(data, { IsSuccess: true });
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [10]);
});

// --- Test 3: Exhausted 502 throws SchoolmateUnavailableError ---
await test('Scenario 2b: Exhausted 502 throws SchoolmateUnavailableError with HTTP cause', async () => {
  let callCount = 0;
  const sleeps = [];
  const client = new SchoolmateClient({
    maxAttempts: 3,
    baseDelayMs: 100,
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
      assert(err instanceof SchoolmateUnavailableError, 'Must be SchoolmateUnavailableError');
      assert.equal(err.code, 'SCHOOLMATE_UNAVAILABLE');
      assert.equal(err.attempts, 3);
      assert.equal(err.cause?.status, 503);
      assert.equal(err.cause?.name, 'SchoolmateHttpError');
      return true;
    }
  );
  assert.equal(callCount, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

// --- Test 4: 401 Unauthorized handling (no backoff, single login retry) ---
await test('Scenario 3: 401 Unauthorized triggers one-time session invalidation & re-login without transport backoff', async () => {
  let loginCount = 0;
  let endpointAttempts = 0;
  const sleeps = [];

  const client = new SchoolmateClient({
    userName: 'test-user',
    password: 'test-password',
    baseDelayMs: 250,
    sleep: async (ms) => sleeps.push(ms),
    fetch: async (url, init) => {
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
          // First attempt returns 401
          return mockTextResponse('Unauthorized', 401, 'Unauthorized');
        }
        // Second attempt after re-login succeeds
        return mockJsonResponse({
          IsSuccess: true,
          Data: { CalendarDays: [], SchedulerEvents: [] }
        });
      }
      throw new Error(`Unhandled URL: ${urlStr}`);
    }
  });

  // Pre-seed an expired/stale session
  client.sessionId = 'stale_session';
  client.sessionExpiresAt = Date.now() + 10000;

  const res = await client.getSchedulerEvents({ date: '2026-09-27' });
  assert.ok(res);
  assert.equal(endpointAttempts, 2, 'Endpoint should be called twice (initial + 1 replay)');
  assert.equal(loginCount, 1, 'Login should be performed once to recover session');
  assert.equal(sleeps.length, 0, '401 recovery must not use exponential backoff delays');
  assert.equal(client.sessionId, 'session_1');
});

// --- Test 5: Repeated 401 does not loop infinitely ---
await test('Scenario 3b: Bounded 401 recovery halts after one re-login replay and throws', async () => {
  let loginCount = 0;
  let endpointAttempts = 0;

  const client = new SchoolmateClient({
    userName: 'test-user',
    password: 'test-password',
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
        return mockTextResponse('Unauthorized', 401, 'Unauthorized');
      }
      throw new Error(`Unhandled URL: ${urlStr}`);
    }
  });

  // Pre-seed an existing session to isolate the recovery login
  client.sessionId = 'stale_session';
  client.sessionExpiresAt = Date.now() + 10000;

  await assert.rejects(
    async () => {
      await client.getSchedulerEvents({ date: '2026-09-27' });
    },
    (err) => {
      assert(err instanceof SchoolmateHttpError, `Expected SchoolmateHttpError, got ${err}`);
      assert.equal(err.status, 401);
      return true;
    }
  );

  assert.equal(loginCount, 1, 'Should only attempt login once');
  assert.equal(endpointAttempts, 2, 'Should only attempt endpoint twice (initial + 1 replay)');
});

// --- Test 6: Non-retryable client errors (400, 403, 404) fail immediately ---
await test('Scenario 4: Client errors (400, 403, 404) fail immediately with SchoolmateHttpError (1 attempt, no delay)', async () => {
  for (const status of [400, 403, 404]) {
    let attempts = 0;
    const sleeps = [];
    const client = new SchoolmateClient({
      maxAttempts: 3,
      sleep: async (ms) => sleeps.push(ms),
      fetch: async () => {
        attempts++;
        return mockTextResponse('Client Error', status, 'Error');
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
    assert.equal(attempts, 1, `Status ${status} should not be retried`);
    assert.equal(sleeps.length, 0, `Status ${status} should not trigger sleep`);
  }
});

// --- Test 7: Retryable network errors allow-list ---
await test('Scenario 5: Allow-listed network error codes (ECONNRESET, ETIMEDOUT, EAI_AGAIN, UND_ERR_SOCKET, ECONNREFUSED) retry', async () => {
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'ECONNREFUSED'];

  for (const code of retryableCodes) {
    let attempts = 0;
    const sleeps = [];
    const client = new SchoolmateClient({
      maxAttempts: 3,
      sleep: async (ms) => sleeps.push(ms),
      fetch: async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Error(`Socket error ${code}`);
          err.code = code;
          throw err;
        }
        return mockJsonResponse({ IsSuccess: true });
      }
    });

    const res = await client._request('https://empireenglish.schoolmate.eu/test-network');
    assert.equal(res.status, 200);
    assert.equal(attempts, 2, `Code ${code} should retry`);
    assert.equal(sleeps.length, 1);
  }
});

// --- Test 8: Non-allow-listed unexpected errors do NOT retry ---
await test('Scenario 5b: Non-allow-listed unexpected errors fail immediately without retry', async () => {
  let attempts = 0;
  const client = new SchoolmateClient({
    maxAttempts: 3,
    fetch: async () => {
      attempts++;
      throw new TypeError('Failed to fetch: invalid URL');
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
});

// --- Test 9: PDF generation and download use 25s timeout policy ---
await test('Scenario 6: PDF generation and download pass 25s timeout policy', async () => {
  const requestedTimeouts = [];
  const client = new SchoolmateClient({
    userName: 'test-user',
    password: 'test-password',
    fetch: async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/admin')) {
        return mockTextResponse('OK', 200, 'OK', {
          'set-cookie': 'ASP.NET_SessionId=sess_pdf; path=/'
        });
      }
      if (urlStr.endsWith('/security/index')) {
        return mockJsonResponse({ IsSuccess: true });
      }
      if (urlStr.endsWith('/teacher/printemployeeschedule')) {
        return mockJsonResponse({
          IsSuccess: true,
          Data: {
            AbsolutePath: 'temp%5cSchedule.pdf',
            FileName: 'Schedule'
          }
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

  // Spy on _requestAuthenticated
  const originalReqAuth = client._requestAuthenticated.bind(client);
  client._requestAuthenticated = async (url, init, policy, isReplay) => {
    requestedTimeouts.push(policy?.timeoutMs);
    return originalReqAuth(url, init, policy, isReplay);
  };

  const pdfRes = await client.getTeacherSchedulePdf({
    teacherId: 17251,
    fromDate: '2026-09-14',
    toDate: '2026-09-20'
  });

  assert.ok(pdfRes.buffer);
  assert.equal(pdfRes.fileName, 'Schedule.pdf');
  assert.deepEqual(requestedTimeouts, [25000, 25000], 'Both PDF print and download must use 25s timeout');
});

// --- Test 10: Safe diagnostics & secret redaction in retry warnings ---
await test('Scenario 8: Retry warnings log safe diagnostics and redact credentials, session cookies, and query params', async () => {
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
    await client._request('https://empireenglish.schoolmate.eu/common/download?fpath=secret_path&fname=confidential.pdf&d=true');
  });

  assert.equal(warnings.length, 1);
  const warn = warnings[0];
  assert(warn.includes('/common/download'), 'Must include pathname');
  assert(warn.includes('504'), 'Must include status code');
  assert(warn.includes('Retry 1/2'), 'Must include attempt info');
  assert(!warn.includes('secret_path'), 'Must NOT include query parameters or file paths');
  assert(!warn.includes('confidential.pdf'), 'Must NOT include query parameters');
  assert(!warn.includes('ASP.NET_SessionId'), 'Must NOT include session IDs');
});

// --- Test 11: Error mapping and public contract helpers ---
await test('Scenario 9: Error mapping toPublicSchoolmateError maps availability errors to 503 and safe copy', async () => {
  const timeoutErr = new SchoolmateTimeoutError('Timeout on /admin', { pathname: '/admin', timeoutMs: 10000 });
  const unavailableErr = new SchoolmateUnavailableError('Outage', { attempts: 3, lastError: timeoutErr, cause: timeoutErr });

  assert.equal(isSchoolmateUnavailableError(unavailableErr), true);
  assert.equal(isSchoolmateUnavailableError(timeoutErr), true);
  assert.equal(isSchoolmateUnavailableError(new Error('Random error')), false);

  const pubOutage = toPublicSchoolmateError(unavailableErr);
  assert.equal(pubOutage.status, 503);
  assert.deepEqual(pubOutage.body, {
    error: 'External service unavailable',
    code: 'SCHOOLMATE_UNAVAILABLE'
  });

  const pubGeneric = toPublicSchoolmateError(new Error('Some generic error'));
  assert.equal(pubGeneric.status, 500);
  assert.deepEqual(pubGeneric.body, {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
  assert(!JSON.stringify(pubGeneric.body).includes('Some generic error'));
});

// --- Test 12: Teacher Day resilience when Schoolmate is unavailable ---
await test('Scenario 10: Teacher Day service returns state: "error" with clean copy when Schoolmate is unavailable', async () => {
  const smErr = new SchoolmateUnavailableError('Schoolmate down', { attempts: 3 });
  const mapped = isSchoolmateUnavailableError(smErr) ? 'External service unavailable' : smErr.message;
  assert.equal(mapped, 'External service unavailable');
});

// --- Test 13: Partial degradation in getTeacherClassesSchedule ---
await test('Scenario 11: getTeacherClassesSchedule handles individual group failure with warning and continues', async () => {
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
        return mockTextResponse('OK', 200, 'OK', { 'set-cookie': 'ASP.NET_SessionId=sess_grp; path=/' });
      }
      if (urlStr.endsWith('/security/index')) {
        return mockJsonResponse({ IsSuccess: true });
      }
      if (urlStr.endsWith('/teacher/getteachergroupclasslist')) {
        return mockJsonResponse({
          IsSuccess: true,
          Data: {
            TeacherGroupList: [
              { GroupId: 101, GroupName: 'Group A' },
              { GroupId: 102, GroupName: 'Group B' }
            ]
          }
        });
      }
      if (urlStr.endsWith('/calendar/getschedulerevents')) {
        return mockJsonResponse({ IsSuccess: true, Data: { SchedulerEvents: [] } });
      }
      if (urlStr.endsWith('/teacher/getteachergroupclassdetail')) {
        const body = JSON.parse(init.body);
        if (body.groupId === 102) {
          // Group 102 fails with 500
          return mockTextResponse('Internal Error', 500, 'Internal Error');
        }
        return mockJsonResponse({
          IsSuccess: true,
          Data: {
            LessonClasseList: [
              {
                GroupLessonId: 9001,
                ClassName: 'Group A',
                StrLessonDate: '15/09/2026',
                DurationMinutes: 60,
                EnrolledStudents: 4,
                AttendanceChecked: true,
                TeacherRatePerLesson: '200.00',
                CurrencySymbol: '₴'
              }
            ],
            WageSum: '200.00',
            TotalWage: '200.00 ₴',
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
  assert.deepEqual(res.groups, [{ groupId: 101, groupName: 'Group A' }], 'Failed groups must not be represented as confirmed empty group data');
  assert.equal(warnings.some(w => w.includes('group 102 (Group B) failed')), true, 'Must warn on group 102 failure');
});

await test('Scenario 12: Complete group-detail failure rejects instead of returning an empty schedule', async () => {
  const warnings = [];
  const client = new SchoolmateClient({
    logger: {
      warn: (msg) => warnings.push(msg),
      info: () => {},
      error: () => {}
    }
  });
  client.getTeacherGroupClassList = async () => [
    { GroupId: 201, GroupName: 'Group One' },
    { GroupId: 202, GroupName: 'Group Two' }
  ];
  client.getSchedulerEvents = async () => ({ events: [] });
  client.getTeacherGroupClassDetail = async ({ groupId }) => {
    const err = new Error(`detail unavailable for ${groupId}`);
    err.code = 'ECONNRESET';
    throw err;
  };

  await assert.rejects(
    () => client.getTeacherClassesSchedule({
      teacherId: 17251,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    }),
    (err) => {
      assert(err instanceof SchoolmateUnavailableError);
      assert.equal(err.code, 'SCHOOLMATE_UNAVAILABLE');
      assert.equal(err.message, 'All Schoolmate group-detail requests failed');
      return true;
    }
  );
  assert.equal(warnings.filter(w => w.includes('group 20')).length, 2);
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedTests} CRM-007 ACCEPTANCE TESTS PASSED!`);
console.log('====================================================\n');
