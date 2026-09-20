// ee-crm/test-api-routes.js
// Automated verification suite for Milestone 1 Backend API Routes

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3458;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Next.js server failed to become ready within ${timeoutMs}ms`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 EE CRM Milestone 1 - Backend API Routes Verification');
  console.log('====================================================');

  console.log(`\n[Server] Launching Next.js production server on port ${TEST_PORT}...`);
  const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(TEST_PORT)], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', data => {
    // console.log(`[Next.js stdout]: ${data.toString().trim()}`);
  });
  serverProcess.stderr.on('data', data => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Warning')) {
      console.warn(`[Next.js stderr]: ${msg}`);
    }
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Next.js server is ready and accepting requests at ${BASE_URL}`);

    // ----------------------------------------------------
    // Test 1: GET /api/health
    // ----------------------------------------------------
    console.log('\n--- Test 1: GET /api/health ---');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200, `Expected 200, got ${healthRes.status}`);
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', `Expected status ok, got ${healthData.status}`);
    console.log('✅ Health probe passed:', healthData.service);

    // ----------------------------------------------------
    // Test 2: Teachers API - Validation on POST /api/teachers
    // ----------------------------------------------------
    console.log('\n--- Test 2: POST /api/teachers (Validation Error Handling) ---');
    const invalidPost1 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'NoTeacherId' })
    });
    assert(invalidPost1.status === 400, `Expected 400 for missing schoolmateTeacherId, got ${invalidPost1.status}`);
    const err1 = await invalidPost1.json();
    console.log('✅ Missing schoolmateTeacherId rejected with 400:', err1.error);

    const invalidPost2 = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolmateTeacherId: 12345 })
    });
    assert(invalidPost2.status === 400, `Expected 400 for missing name/email, got ${invalidPost2.status}`);
    const err2 = await invalidPost2.json();
    console.log('✅ Missing email & name rejected with 400:', err2.error);

    // ----------------------------------------------------
    // Test 3: Teachers API - Create teacher (POST /api/teachers)
    // ----------------------------------------------------
    console.log('\n--- Test 3: POST /api/teachers (Create Teacher) ---');
    const createRes = await fetch(`${BASE_URL}/api/teachers`, {
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
    assert(createRes.status === 201, `Expected 201, got ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.teacher && createData.teacher.id, 'Expected teacher object with id');
    assert(createData.teacher.schoolmateTeacherId === 17251, 'Expected schoolmateTeacherId 17251');
    assert(createData.teacher.fullName === 'Savchuk Yuliia', `Expected 'Savchuk Yuliia', got '${createData.teacher.fullName}'`);
    const createdTeacherId = createData.teacher.id;
    console.log(`✅ Teacher created: ${createData.teacher.fullName} (ID: ${createdTeacherId})`);

    // ----------------------------------------------------
    // Test 4: Teachers API - List teachers (GET /api/teachers)
    // ----------------------------------------------------
    console.log('\n--- Test 4: GET /api/teachers (List Teachers) ---');
    const listRes = await fetch(`${BASE_URL}/api/teachers`);
    assert(listRes.status === 200, `Expected 200, got ${listRes.status}`);
    const listData = await listRes.json();
    assert(Array.isArray(listData.teachers), 'Expected teachers array');
    const foundCreated = listData.teachers.find(t => t.id === createdTeacherId);
    assert(foundCreated, 'Newly created teacher not found in list');
    console.log(`✅ Found ${listData.teachers.length} teachers in directory`);

    // ----------------------------------------------------
    // Test 5: Teachers API - Get by ID (GET /api/teachers/[id])
    // ----------------------------------------------------
    console.log('\n--- Test 5: GET /api/teachers/[id] ---');
    const getByIdRes = await fetch(`${BASE_URL}/api/teachers/${createdTeacherId}`);
    assert(getByIdRes.status === 200, `Expected 200, got ${getByIdRes.status}`);
    const getByIdData = await getByIdRes.json();
    assert(getByIdData.teacher?.id === createdTeacherId, 'Retrieved teacher ID mismatch');
    console.log(`✅ Teacher retrieved by ID: ${getByIdData.teacher.fullName}`);

    // ----------------------------------------------------
    // Test 6: Teachers API - Delete teacher (DELETE /api/teachers/[id])
    // ----------------------------------------------------
    console.log('\n--- Test 6: DELETE /api/teachers/[id] ---');
    const deleteRes = await fetch(`${BASE_URL}/api/teachers/${createdTeacherId}`, {
      method: 'DELETE'
    });
    assert(deleteRes.status === 200, `Expected 200, got ${deleteRes.status}`);
    const deleteData = await deleteRes.json();
    assert(deleteData.success === true, 'Expected success: true');
    assert(deleteData.id === createdTeacherId, 'Expected id match in delete response');
    console.log(`✅ Teacher deleted successfully: ${deleteData.id}`);

    // Confirm 404 after deletion
    const verifyDeleted = await fetch(`${BASE_URL}/api/teachers/${createdTeacherId}`);
    assert(verifyDeleted.status === 404, `Expected 404 after deletion, got ${verifyDeleted.status}`);
    console.log('✅ Confirmed 404 on deleted teacher');

    // ----------------------------------------------------
    // Test 7: Schoolmate Report API - Validation
    // ----------------------------------------------------
    console.log('\n--- Test 7: POST /api/schoolmate/report (Validation) ---');
    const missingTeacher = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDate: '2026-09-14', toDate: '2026-09-20' })
    });
    assert(missingTeacher.status === 400, `Expected 400, got ${missingTeacher.status}`);
    console.log('✅ Missing teacherId rejected with 400');

    const missingDates = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 17251 })
    });
    assert(missingDates.status === 400, `Expected 400, got ${missingDates.status}`);
    console.log('✅ Missing dates rejected with 400');

    // ----------------------------------------------------
    // Test 8: Schoolmate Report API - Live Call for Savchuk Yuliia (17251)
    // ----------------------------------------------------
    console.log('\n--- Test 8: POST /api/schoolmate/report (Savchuk Yuliia - 17251) ---');
    console.log('Fetching live report from Schoolmate EU for 2026-09-14 to 2026-09-20...');
    const reportRes1 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    assert(reportRes1.status === 200, `Expected 200, got ${reportRes1.status}`);
    const report1 = await reportRes1.json();
    console.log(`Response received in ${report1.durationMs}ms (cached: ${report1.cached})`);
    assert(report1.cached === false, 'First call must be a cache miss (cached: false)');
    assert(report1.teacherName.includes('Savchuk'), `Expected teacherName 'Savchuk', got '${report1.teacherName}'`);
    assert(report1.totalLessonsCount === 20, `Expected 20 lessons for Savchuk Yuliia, got ${report1.totalLessonsCount}`);
    assert(report1.totalMinutesReported === 1200, `Expected 1200 reported minutes, got ${report1.totalMinutesReported}`);
    assert(report1.totalMinutesCalculated === 1200, `Expected 1200 calculated minutes, got ${report1.totalMinutesCalculated}`);
    assert(report1.isMinutesMatching === true, 'Expected isMinutesMatching to be true');
    assert(Array.isArray(report1.days) && report1.days.length === 5, `Expected 5 active days, got ${report1.days?.length}`);
    assert(Array.isArray(report1.lessons) && report1.lessons.length === 20, `Expected 20 lessons array items, got ${report1.lessons?.length}`);
    console.log(`✅ Savchuk Yuliia report verified: 20 lessons, 1,200 minutes (100% match) across 5 days`);

    // ----------------------------------------------------
    // Test 9: Schoolmate Report API - Cache Hit Verification (17251)
    // ----------------------------------------------------
    console.log('\n--- Test 9: POST /api/schoolmate/report (Cache Hit Verification - 17251) ---');
    const cacheHitStart = Date.now();
    const reportRes1Cache = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const cacheHitDuration = Date.now() - cacheHitStart;
    assert(reportRes1Cache.status === 200, `Expected 200, got ${reportRes1Cache.status}`);
    const report1Cache = await reportRes1Cache.json();
    assert(report1Cache.cached === true, `Expected cached: true on second call, got ${report1Cache.cached}`);
    assert(report1Cache.totalLessonsCount === 20, 'Expected cached lesson count to be 20');
    assert(report1Cache.totalMinutesReported === 1200, 'Expected cached minutes to be 1200');
    console.log(`✅ Cache hit verified for Savchuk Yuliia! Returned in ${cacheHitDuration}ms (cached: true)`);

    // ----------------------------------------------------
    // Test 10: Schoolmate Report API - Live Call for Zhuravlova Iryna (6568)
    // ----------------------------------------------------
    console.log('\n--- Test 10: POST /api/schoolmate/report (Zhuravlova Iryna - 6568) ---');
    console.log('Fetching live report from Schoolmate EU for 2026-09-14 to 2026-09-20...');
    const reportRes2 = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 6568,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    assert(reportRes2.status === 200, `Expected 200, got ${reportRes2.status}`);
    const report2 = await reportRes2.json();
    console.log(`Response received in ${report2.durationMs}ms (cached: ${report2.cached})`);
    assert(report2.cached === false, 'First call must be a cache miss (cached: false)');
    assert(report2.teacherName.includes('Zhuravlova'), `Expected teacherName 'Zhuravlova', got '${report2.teacherName}'`);
    assert(report2.totalLessonsCount === 17, `Expected 17 lessons for Zhuravlova Iryna, got ${report2.totalLessonsCount}`);
    assert(report2.totalMinutesReported === 1200, `Expected 1200 reported minutes, got ${report2.totalMinutesReported}`);
    assert(report2.totalMinutesCalculated === 1200, `Expected 1200 calculated minutes, got ${report2.totalMinutesCalculated}`);
    assert(report2.isMinutesMatching === true, 'Expected isMinutesMatching to be true');
    assert(Array.isArray(report2.days) && report2.days.length === 6, `Expected 6 active days, got ${report2.days?.length}`);
    assert(Array.isArray(report2.lessons) && report2.lessons.length === 17, `Expected 17 lessons array items, got ${report2.lessons?.length}`);
    console.log(`✅ Zhuravlova Iryna report verified: 17 lessons, 1,200 minutes (100% match) across 6 days`);

    // ----------------------------------------------------
    // Test 11: Schoolmate Report API - Cache Hit Verification (6568)
    // ----------------------------------------------------
    console.log('\n--- Test 11: POST /api/schoolmate/report (Cache Hit Verification - 6568) ---');
    const cacheHit2Start = Date.now();
    const reportRes2Cache = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 6568,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const cacheHit2Duration = Date.now() - cacheHit2Start;
    assert(reportRes2Cache.status === 200, `Expected 200, got ${reportRes2Cache.status}`);
    const report2Cache = await reportRes2Cache.json();
    assert(report2Cache.cached === true, `Expected cached: true on second call, got ${report2Cache.cached}`);
    assert(report2Cache.totalLessonsCount === 17, 'Expected cached lesson count to be 17');
    console.log(`✅ Cache hit verified for Zhuravlova Iryna! Returned in ${cacheHit2Duration}ms (cached: true)`);

    // ----------------------------------------------------
    // Test 12: Logs API (GET /api/logs)
    // ----------------------------------------------------
    console.log('\n--- Test 12: GET /api/logs ---');
    const logsRes = await fetch(`${BASE_URL}/api/logs?limit=20`);
    assert(logsRes.status === 200, `Expected 200, got ${logsRes.status}`);
    const logsData = await logsRes.json();
    assert(Array.isArray(logsData.logs), 'Expected logs array');
    assert(logsData.logs.length > 0, 'Expected at least one log entry');
    console.log(`✅ Retrieved ${logsData.logs.length} audit logs. Recent actions:`);
    logsData.logs.slice(0, 5).forEach(l => {
      console.log(`   - [${l.level}] [${l.action}] ${l.message}`);
    });

    const hasTeacherCreateLog = logsData.logs.some(l => l.action === 'TEACHER_CREATED');
    const hasSchoolmateLog = logsData.logs.some(l => l.action === 'schoolmate:fetch_and_parse');
    assert(hasTeacherCreateLog, 'Expected TEACHER_CREATED in logs');
    assert(hasSchoolmateLog, 'Expected schoolmate:fetch_and_parse in logs');
    console.log('✅ Verified audit trail contains TEACHER_CREATED and schoolmate:fetch_and_parse events');

    console.log('\n====================================================');
    console.log('🎉 ALL 12 API ROUTE VERIFICATION TESTS PASSED 100%!');
    console.log('====================================================\n');
  } finally {
    console.log('[Server] Terminating Next.js test server...');
    serverProcess.kill('SIGINT');
    serverProcess.kill('SIGTERM');
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { stdio: 'ignore' });
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
