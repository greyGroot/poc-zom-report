// ee-crm/test-challenger-m1.js
// Independent Empirical Challenge Test Suite for Milestone 1: Backend API Routes

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3460;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // server starting
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

async function runEmpiricalChallenge() {
  console.log('================================================================');
  console.log('⚔️  CHALLENGER 2: EMPIRICAL VERIFICATION OF MILESTONE 1 API ROUTES');
  console.log('================================================================\n');

  console.log(`[Launch] Starting Next.js production server on port ${TEST_PORT}...`);
  const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(TEST_PORT)], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stderr.on('data', data => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Warning')) {
      console.warn(`[Server stderr]: ${msg}`);
    }
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Server live at ${BASE_URL}\n`);

    // =========================================================================
    // SECTION 1: Health Endpoint Probe
    // =========================================================================
    console.log('--- [SECTION 1] Health Endpoint Integrity ---');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200, `Health returned ${healthRes.status}, expected 200`);
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', `Health status: ${healthData.status}`);
    assert(healthData.service === 'Empire English CRM (EE CRM)', `Service name: ${healthData.service}`);
    console.log('✅ Health probe verified (200 OK, service name accurate)');

    // =========================================================================
    // SECTION 2: Teacher CRUD Lifecycle & Edge Cases
    // =========================================================================
    console.log('\n--- [SECTION 2] Teacher CRUD Lifecycle & Edge Cases ---');

    // 2.1 Missing body
    const badReq1 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json'
    });
    assert(badReq1.status === 400, `Invalid JSON body should return 400, got ${badReq1.status}`);
    console.log('✅ Rejected malformed JSON with 400');

    // 2.2 Missing schoolmateTeacherId
    const badReq2 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Test', lastName: 'User', email: 'test@example.com' })
    });
    assert(badReq2.status === 400, `Missing schoolmateTeacherId should return 400, got ${badReq2.status}`);
    console.log('✅ Rejected missing schoolmateTeacherId with 400');

    // 2.3 Non-numeric schoolmateTeacherId
    const badReq3 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Test', schoolmateTeacherId: 'not-a-number' })
    });
    assert(badReq3.status === 400, `Non-numeric schoolmateTeacherId should return 400, got ${badReq3.status}`);
    console.log('✅ Rejected non-numeric schoolmateTeacherId with 400');

    // 2.4 Missing both email and name
    const badReq4 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolmateTeacherId: 12345 })
    });
    assert(badReq4.status === 400, `Missing both email and name should return 400, got ${badReq4.status}`);
    console.log('✅ Rejected missing name/email with 400');

    // 2.5 Create Teacher 1 (Savchuk Yuliia)
    const create1 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Yuliia',
        lastName: 'Savchuk',
        email: 'yuliasavchuk03@gmail.com',
        schoolmateTeacherId: 17251,
        zoomHostEmail: 'yuliasavchuk03@gmail.com',
        schoolmateLogin: 'savchuk.y'
      })
    });
    assert(create1.status === 201, `Create Teacher 1 should return 201, got ${create1.status}`);
    const t1 = (await create1.json()).teacher;
    assert(t1 && t1.id && t1.id.startsWith('t_'), `Expected id starting with t_, got ${t1?.id}`);
    assert(t1.schoolmateTeacherId === 17251, `Expected 17251, got ${t1.schoolmateTeacherId}`);
    assert(t1.fullName === 'Savchuk Yuliia', `Expected 'Savchuk Yuliia', got '${t1.fullName}'`);
    assert(t1.email === 'yuliasavchuk03@gmail.com', `Email mismatch: ${t1.email}`);
    console.log(`✅ Created Teacher 1: ${t1.fullName} (${t1.id})`);

    // 2.6 Create Teacher 2 (Zhuravlova Iryna)
    const create2 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Iryna',
        lastName: 'Zhuravlova',
        email: 'zhur.zhur.irene@gmail.com',
        schoolmateTeacherId: 6568,
        zoomHostEmail: 'zhur.zhur.irene@gmail.com',
        schoolmateLogin: 'zhuravlova.i'
      })
    });
    assert(create2.status === 201, `Create Teacher 2 should return 201, got ${create2.status}`);
    const t2 = (await create2.json()).teacher;
    assert(t2 && t2.id && t2.id.startsWith('t_'), `Expected id starting with t_, got ${t2?.id}`);
    assert(t2.schoolmateTeacherId === 6568, `Expected 6568, got ${t2.schoolmateTeacherId}`);
    assert(t2.fullName === 'Zhuravlova Iryna', `Expected 'Zhuravlova Iryna', got '${t2.fullName}'`);
    console.log(`✅ Created Teacher 2: ${t2.fullName} (${t2.id})`);

    // 2.7 List Teachers
    const listRes = await fetch(`${BASE_URL}/api/teachers`);
    assert(listRes.status === 200, `List should return 200, got ${listRes.status}`);
    const { teachers } = await listRes.json();
    assert(Array.isArray(teachers), 'Expected teachers array');
    assert(teachers.some(t => t.id === t1.id), `Teacher 1 (${t1.id}) not in list`);
    assert(teachers.some(t => t.id === t2.id), `Teacher 2 (${t2.id}) not in list`);
    console.log(`✅ Teachers list contains both created teachers (total: ${teachers.length})`);

    // 2.8 Get Teacher by ID
    const get1 = await fetch(`${BASE_URL}/api/teachers/${t1.id}`);
    assert(get1.status === 200, `Get by ID should return 200, got ${get1.status}`);
    const get1Data = await get1.json();
    assert(get1Data.teacher?.id === t1.id, `ID mismatch on GET: expected ${t1.id}, got ${get1Data.teacher?.id}`);
    console.log(`✅ Retrieved Teacher 1 by ID: ${get1Data.teacher.fullName}`);

    // 2.9 Get Non-Existent Teacher ID
    const getNonExistent = await fetch(`${BASE_URL}/api/teachers/non_existent_id_99999`);
    assert(getNonExistent.status === 404, `Non-existent ID should return 404, got ${getNonExistent.status}`);
    console.log('✅ Confirmed 404 for non-existent teacher ID');

    // 2.10 Delete Teacher 1
    const del1 = await fetch(`${BASE_URL}/api/teachers/${t1.id}`, { method: 'DELETE' });
    assert(del1.status === 200, `Delete should return 200, got ${del1.status}`);
    const del1Data = await del1.json();
    assert(del1Data.success === true && del1Data.id === t1.id, `Delete response mismatch: ${JSON.stringify(del1Data)}`);
    console.log(`✅ Deleted Teacher 1: ${t1.id}`);

    // 2.11 Confirm 404 on GET after deletion
    const getDeleted = await fetch(`${BASE_URL}/api/teachers/${t1.id}`);
    assert(getDeleted.status === 404, `Deleted teacher GET should return 404, got ${getDeleted.status}`);
    console.log('✅ Confirmed 404 on GET after deletion');

    // 2.12 Double Delete on already deleted teacher
    const doubleDel = await fetch(`${BASE_URL}/api/teachers/${t1.id}`, { method: 'DELETE' });
    assert(doubleDel.status === 404, `Double delete should return 404, got ${doubleDel.status}`);
    console.log('✅ Confirmed 404 on double DELETE');

    // 2.13 Delete Teacher 2 to keep state clean
    const del2 = await fetch(`${BASE_URL}/api/teachers/${t2.id}`, { method: 'DELETE' });
    assert(del2.status === 200, `Delete Teacher 2 should return 200, got ${del2.status}`);
    console.log(`✅ Deleted Teacher 2: ${t2.id}`);

    // =========================================================================
    // SECTION 3: Live Schoolmate Integration & Exact Data Contract Fidelity
    // =========================================================================
    console.log('\n--- [SECTION 3] Live Schoolmate Integration & Data Contract Fidelity ---');

    // 3.1 Teacher Savchuk Yuliia (ID: 17251) - Period: 2026-09-14 to 2026-09-20
    console.log('\n[Live Test 1] Requesting report for Savchuk Yuliia (17251) for 2026-09-14 to 2026-09-20...');
    const tStart1 = Date.now();
    const repRes1 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const tDur1 = Date.now() - tStart1;
    assert(repRes1.status === 200, `Live report for 17251 returned HTTP ${repRes1.status}`);
    const rep1 = await repRes1.json();

    console.log(`-> Received response in ${tDur1}ms (cached: ${rep1.cached})`);
    assert(rep1.cached === false, `Initial call must be cached: false, got ${rep1.cached}`);
    assert(typeof rep1.teacherName === 'string' && rep1.teacherName.includes('Savchuk'), `Teacher name must contain Savchuk, got '${rep1.teacherName}'`);
    assert(rep1.periodFrom === '2026-09-14', `periodFrom mismatch: ${rep1.periodFrom}`);
    assert(rep1.periodTo === '2026-09-20', `periodTo mismatch: ${rep1.periodTo}`);
    assert(rep1.totalLessonsCount === 20, `Savchuk lessons count must be exactly 20, got ${rep1.totalLessonsCount}`);
    assert(rep1.totalMinutesReported === 1200, `Reported minutes must be 1200, got ${rep1.totalMinutesReported}`);
    assert(rep1.totalMinutesCalculated === 1200, `Calculated minutes must be 1200, got ${rep1.totalMinutesCalculated}`);
    assert(rep1.isMinutesMatching === true, 'isMinutesMatching must be true');

    // Verify day groupings for Savchuk
    assert(Array.isArray(rep1.days), 'days must be an array');
    assert(rep1.days.length === 5, `Expected 5 teaching days for Savchuk, got ${rep1.days.length}`);
    let sumSavchukMinutes = 0;
    let sumSavchukLessons = 0;
    for (const day of rep1.days) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(day.date), `Invalid day date format: ${day.date}`);
      assert(day.subtotalMinutes > 0, `Day subtotalMinutes must be > 0, got ${day.subtotalMinutes}`);
      assert(Array.isArray(day.lessons) && day.lessons.length > 0, `Day must contain lessons`);
      const dayCalcMin = day.lessons.reduce((s, l) => s + l.durationMinutes, 0);
      assert(dayCalcMin === day.subtotalMinutes, `Day subtotal mismatch on ${day.date}: ${dayCalcMin} vs ${day.subtotalMinutes}`);
      sumSavchukMinutes += day.subtotalMinutes;
      sumSavchukLessons += day.lessons.length;
    }
    assert(sumSavchukMinutes === 1200, `Sum of day minutes must be 1200, got ${sumSavchukMinutes}`);
    assert(sumSavchukLessons === 20, `Sum of day lessons must be 20, got ${sumSavchukLessons}`);
    assert(Array.isArray(rep1.lessons) && rep1.lessons.length === 20, `rep.lessons must contain 20 lessons`);
    console.log(`✅ Savchuk Yuliia (17251) Verified: Exactly 20 lessons, 1,200 min, 5 days, 100% minutes match!`);

    // 3.2 Teacher Zhuravlova Iryna (ID: 6568) - Period: 2026-09-14 to 2026-09-20
    console.log('\n[Live Test 2] Requesting report for Zhuravlova Iryna (6568) for 2026-09-14 to 2026-09-20...');
    const tStart2 = Date.now();
    const repRes2 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 6568,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const tDur2 = Date.now() - tStart2;
    assert(repRes2.status === 200, `Live report for 6568 returned HTTP ${repRes2.status}`);
    const rep2 = await repRes2.json();

    console.log(`-> Received response in ${tDur2}ms (cached: ${rep2.cached})`);
    assert(rep2.cached === false, `Initial call must be cached: false, got ${rep2.cached}`);
    assert(typeof rep2.teacherName === 'string' && rep2.teacherName.includes('Zhuravlova'), `Teacher name must contain Zhuravlova, got '${rep2.teacherName}'`);
    assert(rep2.periodFrom === '2026-09-14', `periodFrom mismatch: ${rep2.periodFrom}`);
    assert(rep2.periodTo === '2026-09-20', `periodTo mismatch: ${rep2.periodTo}`);
    assert(rep2.totalLessonsCount === 17, `Zhuravlova lessons count must be exactly 17, got ${rep2.totalLessonsCount}`);
    assert(rep2.totalMinutesReported === 1200, `Reported minutes must be 1200, got ${rep2.totalMinutesReported}`);
    assert(rep2.totalMinutesCalculated === 1200, `Calculated minutes must be 1200, got ${rep2.totalMinutesCalculated}`);
    assert(rep2.isMinutesMatching === true, 'isMinutesMatching must be true');

    // Verify day groupings for Zhuravlova
    assert(Array.isArray(rep2.days), 'days must be an array');
    assert(rep2.days.length === 6, `Expected 6 teaching days for Zhuravlova, got ${rep2.days.length}`);
    const expectedDaysZhur = [
      { date: '2026-09-14', lessons: 2, min: 120 },
      { date: '2026-09-15', lessons: 3, min: 180 },
      { date: '2026-09-16', lessons: 4, min: 270 },
      { date: '2026-09-17', lessons: 4, min: 300 },
      { date: '2026-09-18', lessons: 3, min: 210 },
      { date: '2026-09-20', lessons: 1, min: 120 },
    ];
    for (let i = 0; i < expectedDaysZhur.length; i++) {
      const exp = expectedDaysZhur[i];
      const actual = rep2.days[i];
      assert(actual.date === exp.date, `Day index ${i} date mismatch: expected ${exp.date}, got ${actual.date}`);
      assert(actual.lessons.length === exp.lessons, `Day ${exp.date} lesson count mismatch: expected ${exp.lessons}, got ${actual.lessons.length}`);
      assert(actual.subtotalMinutes === exp.min, `Day ${exp.date} minutes mismatch: expected ${exp.min}, got ${actual.subtotalMinutes}`);
    }
    assert(Array.isArray(rep2.lessons) && rep2.lessons.length === 17, `rep.lessons must contain 17 lessons`);
    console.log(`✅ Zhuravlova Iryna (6568) Verified: Exactly 17 lessons, 1,200 min, 6 days, 100% breakdown match!`);

    // =========================================================================
    // SECTION 4: Caching Performance & Verification (<50ms, cached: true)
    // =========================================================================
    console.log('\n--- [SECTION 4] Caching Performance Benchmark (<50ms) ---');

    // Test caching latency over multiple iterations for Savchuk Yuliia
    console.log('Testing cache retrieval for Savchuk Yuliia (17251)...');
    const savchukCacheLatencies = [];
    for (let i = 1; i <= 5; i++) {
      const t0 = Date.now();
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 17251, fromDate: '2026-09-14', toDate: '2026-09-20' })
      });
      const dur = Date.now() - t0;
      assert(res.status === 200, `Cache request returned ${res.status}`);
      const data = await res.json();
      assert(data.cached === true, `Expected cached: true, got ${data.cached}`);
      assert(data.totalLessonsCount === 20, `Cached lessons count must be 20, got ${data.totalLessonsCount}`);
      assert(data.totalMinutesReported === 1200, `Cached minutes must be 1200, got ${data.totalMinutesReported}`);
      savchukCacheLatencies.push(dur);
      console.log(`   Iteration ${i}: ${dur}ms (cached: ${data.cached}, server durationMs: ${data.durationMs}ms)`);
      assert(dur < 50, `Cache roundtrip ${dur}ms exceeded 50ms threshold`);
    }

    // Test caching latency over multiple iterations for Zhuravlova Iryna
    console.log('Testing cache retrieval for Zhuravlova Iryna (6568)...');
    const zhurCacheLatencies = [];
    for (let i = 1; i <= 5; i++) {
      const t0 = Date.now();
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 6568, fromDate: '2026-09-14', toDate: '2026-09-20' })
      });
      const dur = Date.now() - t0;
      assert(res.status === 200, `Cache request returned ${res.status}`);
      const data = await res.json();
      assert(data.cached === true, `Expected cached: true, got ${data.cached}`);
      assert(data.totalLessonsCount === 17, `Cached lessons count must be 17, got ${data.totalLessonsCount}`);
      assert(data.totalMinutesReported === 1200, `Cached minutes must be 1200, got ${data.totalMinutesReported}`);
      zhurCacheLatencies.push(dur);
      console.log(`   Iteration ${i}: ${dur}ms (cached: ${data.cached}, server durationMs: ${data.durationMs}ms)`);
      assert(dur < 50, `Cache roundtrip ${dur}ms exceeded 50ms threshold`);
    }

    const avgSavchuk = (savchukCacheLatencies.reduce((a, b) => a + b, 0) / savchukCacheLatencies.length).toFixed(1);
    const avgZhur = (zhurCacheLatencies.reduce((a, b) => a + b, 0) / zhurCacheLatencies.length).toFixed(1);
    console.log(`✅ Caching Verified: Savchuk avg ${avgSavchuk}ms, Zhuravlova avg ${avgZhur}ms (both well below 50ms threshold)`);

    // =========================================================================
    // SECTION 5: Audit Logs Audit & Telemetry
    // =========================================================================
    console.log('\n--- [SECTION 5] Audit Logs Telemetry ---');
    const logsRes = await fetch(`${BASE_URL}/api/logs?limit=50`);
    assert(logsRes.status === 200, `Logs endpoint returned ${logsRes.status}`);
    const { logs } = await logsRes.json();
    assert(Array.isArray(logs), 'Expected logs array');
    assert(logs.length >= 4, `Expected at least 4 logs, got ${logs.length}`);

    // Verify schema of each log entry
    for (const log of logs) {
      assert(log.id && typeof log.id === 'string', `Log must have id, got ${log.id}`);
      assert(log.timestamp && !isNaN(Date.parse(log.timestamp)), `Invalid timestamp in log: ${log.timestamp}`);
      assert(['INFO', 'WARN', 'ERROR'].includes(log.level), `Invalid log level: ${log.level}`);
      assert(typeof log.action === 'string' && log.action.length > 0, `Log action missing or empty`);
      assert(typeof log.message === 'string' && log.message.length > 0, `Log message missing or empty`);
      if (log.durationMs !== null) {
        assert(typeof log.durationMs === 'number' && log.durationMs >= 0, `durationMs must be non-negative number`);
      }
    }

    // Verify key actions are present
    const actions = logs.map(l => l.action);
    assert(actions.includes('TEACHER_CREATED'), 'Audit trail missing TEACHER_CREATED');
    assert(actions.includes('TEACHER_DELETED'), 'Audit trail missing TEACHER_DELETED');
    assert(actions.includes('schoolmate:fetch_and_parse'), 'Audit trail missing schoolmate:fetch_and_parse');

    // Verify timed logs recorded duration
    const parseLogs = logs.filter(l => l.action === 'schoolmate:fetch_and_parse');
    for (const pl of parseLogs) {
      assert(typeof pl.durationMs === 'number' && pl.durationMs > 1000, `schoolmate:fetch_and_parse duration must be >1000ms, got ${pl.durationMs}`);
      console.log(`   - Verified timed log: [${pl.level}] [${pl.action}] ${pl.durationMs}ms - "${pl.message}"`);
    }

    // Verify limit parameter functionality
    const limitRes = await fetch(`${BASE_URL}/api/logs?limit=2`);
    const limitData = await limitRes.json();
    assert(limitData.logs.length === 2, `Expected exactly 2 logs with limit=2, got ${limitData.logs.length}`);
    console.log('✅ Audit logs verified: Schema compliant, required events present, timed durations accurate, ?limit= supported.');

    // =========================================================================
    // SECTION 6: Report API Input Validation & Edge Cases
    // =========================================================================
    console.log('\n--- [SECTION 6] Schoolmate Report API Input Validation ---');

    // 6.1 Missing teacherId
    const repBad1 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDate: '2026-09-14', toDate: '2026-09-20' })
    });
    assert(repBad1.status === 400, `Missing teacherId should return 400, got ${repBad1.status}`);
    console.log('✅ Missing teacherId rejected with 400');

    // 6.2 Missing fromDate
    const repBad2 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 17251, toDate: '2026-09-20' })
    });
    assert(repBad2.status === 400, `Missing fromDate should return 400, got ${repBad2.status}`);
    console.log('✅ Missing fromDate rejected with 400');

    // 6.3 Missing toDate
    const repBad3 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 17251, fromDate: '2026-09-14' })
    });
    assert(repBad3.status === 400, `Missing toDate should return 400, got ${repBad3.status}`);
    console.log('✅ Missing toDate rejected with 400');

    // 6.4 Non-numeric teacherId
    const repBad4 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 'abc', fromDate: '2026-09-14', toDate: '2026-09-20' })
    });
    assert(repBad4.status === 400, `Non-numeric teacherId should return 400, got ${repBad4.status}`);
    console.log('✅ Non-numeric teacherId rejected with 400');

    console.log('\n================================================================');
    console.log('🎉 ALL EMPIRICAL CHALLENGE SUITES PASSED WITH 100% FIDELITY!');
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Shutting down Next.js test server...');
    serverProcess.kill('SIGINT');
    serverProcess.kill('SIGTERM');
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { stdio: 'ignore' });
      }
    } catch {
      // clean up
    }
  }
}

runEmpiricalChallenge().catch(err => {
  console.error('\n❌ EMPIRICAL CHALLENGE FAILED:', err);
  process.exit(1);
});
