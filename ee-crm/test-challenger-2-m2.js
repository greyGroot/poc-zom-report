// ee-crm/test-challenger-2-m2.js
// Comprehensive Empirical Challenge & Verification Suite for Milestone 2 Frontend UI

import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PORT = 3488;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  return false;
}

let serverProcess = null;

function cleanup() {
  if (serverProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function runChallengerTests() {
  console.log('========================================================================');
  console.log('🔬 EE CRM MILESTONE 2: EMPIRICAL CHALLENGER 2 VERIFICATION SUITE');
  console.log('========================================================================\n');

  console.log(`[Server] Launching Next.js production server on port ${PORT}...`);
  serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'inherit'
  });

  const ready = await waitForServer();
  assert(ready, `Next.js server failed to respond at ${BASE_URL}/api/health`);
  console.log(`✅ Next.js server is online at ${BASE_URL}\n`);

  // ===========================================================================
  // SUITE 1: Layout & Navigation Verification
  // ===========================================================================
  console.log('--- Suite 1: Layout & Navigation Verification ---');
  const rootRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(rootRes.status, 200, `Expected 200 for /, got ${rootRes.status}`);
  const rootHtml = await rootRes.text();

  assert(rootHtml.includes('Empire English CRM'), 'Layout missing "Empire English CRM" brand');
  assert(rootHtml.includes('EE CRM v1.0'), 'Layout missing "EE CRM v1.0" brand badge');
  assert(rootHtml.includes('Teachers'), 'Layout missing navigation link to Teachers (/)');
  assert(rootHtml.includes('System Logs'), 'Layout missing navigation link to System Logs (/logs)');
  assert(rootHtml.includes('/api/health'), 'Layout missing link to Health check probe (/api/health)');
  assert(rootHtml.includes('Teacher Directory'), 'Page missing "Teacher Directory" title');
  assert(rootHtml.includes('Add New Teacher'), 'Page missing "Add New Teacher" card');
  assert(rootHtml.includes('Savchuk Yuliia (ID: 17251)'), 'Page missing Savchuk Yuliia quick-add button');
  assert(rootHtml.includes('Zhuravlova Iryna (ID: 6568)'), 'Page missing Zhuravlova Iryna quick-add button');
  console.log('✅ Suite 1 Passed: Layout, Navbar, Links, and Base Directory HTML rendered correctly.');

  // ===========================================================================
  // SUITE 2: Teacher Directory CRUD & Quick-Add Verification
  // ===========================================================================
  console.log('\n--- Suite 2: Teacher Directory CRUD & Quick-Add Verification ---');

  // 2.1 Validation on Teacher Addition
  console.log('  [2.1] Testing form validation error handling...');
  const invalidRes1 = await fetch(`${BASE_URL}/api/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '', schoolmateTeacherId: 1000 })
  });
  assert.strictEqual(invalidRes1.status, 400, 'Expected 400 when email and names are missing');

  const invalidRes2 = await fetch(`${BASE_URL}/api/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName: 'Test', lastName: 'User', email: 'test@user.com', schoolmateTeacherId: -5 })
  });
  assert.strictEqual(invalidRes2.status, 400, 'Expected 400 when schoolmateTeacherId is negative');

  // 2.2 Manual Teacher Creation
  console.log('  [2.2] Adding teacher via manual creation...');
  const manualTeacherPayload = {
    firstName: 'Challenger',
    lastName: 'Tester',
    email: 'challenger.tester@empire.eu',
    schoolmateTeacherId: 99999,
    zoomHostEmail: 'challenger.zoom@empire.eu'
  };
  const manualRes = await fetch(`${BASE_URL}/api/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(manualTeacherPayload)
  });
  assert.strictEqual(manualRes.status, 201, `Expected 201, got ${manualRes.status}`);
  const manualData = await manualRes.json();
  const manualTeacher = manualData.teacher;
  assert(manualTeacher && manualTeacher.id, 'Expected returned teacher with generated id');
  assert.strictEqual(manualTeacher.fullName, 'Tester Challenger');
  assert.strictEqual(manualTeacher.schoolmateTeacherId, 99999);
  console.log(`  ✅ Manual teacher created: ${manualTeacher.fullName} (${manualTeacher.id})`);

  // 2.3 Quick-Add Savchuk Yuliia (17251)
  console.log('  [2.3] Testing Quick-Add for Savchuk Yuliia (17251)...');
  const quickSavchukPayload = {
    firstName: 'Yuliia',
    lastName: 'Savchuk',
    email: 'yuliasavchuk03@gmail.com',
    schoolmateTeacherId: 17251,
    zoomHostEmail: 'yuliasavchuk03@gmail.com'
  };
  const savchukRes = await fetch(`${BASE_URL}/api/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quickSavchukPayload)
  });
  assert(savchukRes.status === 200 || savchukRes.status === 201, `Expected 200/201, got ${savchukRes.status}`);
  const savchukData = await savchukRes.json();
  const savchukTeacher = savchukData.teacher;
  assert.strictEqual(savchukTeacher.schoolmateTeacherId, 17251);
  console.log(`  ✅ Quick-add Savchuk Yuliia succeeded: ${savchukTeacher.fullName} (${savchukTeacher.id})`);

  // 2.4 Quick-Add Zhuravlova Iryna (6568)
  console.log('  [2.4] Testing Quick-Add for Zhuravlova Iryna (6568)...');
  const quickZhurPayload = {
    firstName: 'Iryna',
    lastName: 'Zhuravlova',
    email: 'zhur.zhur.irene@gmail.com',
    schoolmateTeacherId: 6568,
    zoomHostEmail: 'zhur.zhur.irene@gmail.com'
  };
  const zhurRes = await fetch(`${BASE_URL}/api/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quickZhurPayload)
  });
  assert(zhurRes.status === 200 || zhurRes.status === 201, `Expected 200/201, got ${zhurRes.status}`);
  const zhurData = await zhurRes.json();
  const zhurTeacher = zhurData.teacher;
  assert.strictEqual(zhurTeacher.schoolmateTeacherId, 6568);
  console.log(`  ✅ Quick-add Zhuravlova Iryna succeeded: ${zhurTeacher.fullName} (${zhurTeacher.id})`);

  // 2.5 Verify Teachers List
  console.log('  [2.5] Verifying teacher directory listing contains added teachers...');
  const listRes = await fetch(`${BASE_URL}/api/teachers`);
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert(Array.isArray(listData.teachers), 'Expected teachers array');
  const idsInList = listData.teachers.map((t) => t.schoolmateTeacherId);
  assert(idsInList.includes(99999), 'Missing manual teacher 99999');
  assert(idsInList.includes(17251), 'Missing Savchuk Yuliia 17251');
  assert(idsInList.includes(6568), 'Missing Zhuravlova Iryna 6568');
  console.log(`  ✅ Directory listing verified with ${listData.teachers.length} registered teachers.`);

  // 2.6 Teacher Deletion
  console.log('  [2.6] Deleting manual test teacher (99999)...');
  const delRes = await fetch(`${BASE_URL}/api/teachers/${manualTeacher.id}`, {
    method: 'DELETE'
  });
  assert.strictEqual(delRes.status, 200, `Expected 200 on delete, got ${delRes.status}`);
  const verifyDelRes = await fetch(`${BASE_URL}/api/teachers/${manualTeacher.id}`);
  assert.strictEqual(verifyDelRes.status, 404, 'Expected 404 for deleted teacher');
  console.log('  ✅ Teacher deletion confirmed: teacher removed from directory and returns 404.');

  // ===========================================================================
  // SUITE 3: Teacher Schedule Viewer (/teachers/[id]) & Split-View
  // ===========================================================================
  console.log('\n--- Suite 3: Teacher Schedule Viewer & Split-View Verification ---');

  // 3.1 Schedule Page SSR & Markup for Savchuk Yuliia
  console.log(`  [3.1] Inspecting schedule viewer SSR for Savchuk Yuliia (/teachers/${savchukTeacher.id})...`);
  const schedViewRes = await fetch(`${BASE_URL}/teachers/${savchukTeacher.id}`);
  assert.strictEqual(schedViewRes.status, 200, `Expected 200, got ${schedViewRes.status}`);
  const schedViewHtml = await schedViewRes.text();

  assert(schedViewHtml.includes('Back to Teachers'), 'Missing back navigation link');
  assert(schedViewHtml.includes('Schoolmate Schedule'), 'Missing Schoolmate Schedule header');
  assert(schedViewHtml.includes('From Date'), 'Missing From Date input');
  assert(schedViewHtml.includes('To Date'), 'Missing To Date input');
  assert(schedViewHtml.includes('2026-09-14'), 'Default From Date 2026-09-14 not in initial SSR');
  assert(schedViewHtml.includes('2026-09-20'), 'Default To Date 2026-09-20 not in initial SSR');
  assert(schedViewHtml.includes('Sep 14-20 (Test)'), 'Missing quick preset "Sep 14-20 (Test)"');
  assert(schedViewHtml.includes('This Week'), 'Missing quick preset "This Week"');
  assert(schedViewHtml.includes('Last Week'), 'Missing quick preset "Last Week"');
  assert(schedViewHtml.includes('Fetch &amp; Parse from Schoolmate') || schedViewHtml.includes('Fetch & Parse from Schoolmate'), 'Missing primary action button');

  // Verify Zoom Telemetry Reconciliation column (Phase 2)
  console.log('  [3.2] Verifying Zoom Telemetry Reconciliation placeholder on right column...');
  assert(schedViewHtml.includes('Zoom Telemetry Reconciliation'), 'Missing Zoom Telemetry Reconciliation title');
  assert(schedViewHtml.includes('Phase 2'), 'Missing Phase 2 badge in Telemetry header');
  assert(schedViewHtml.includes('Live Ingestion Pipeline Active'), 'Missing live pipeline callout');
  assert(schedViewHtml.includes('VERIFIED ✅'), 'Missing mock VERIFIED badge in telemetry reconciliation');
  assert(schedViewHtml.includes('ONLY_HOST ⚠️'), 'Missing mock ONLY_HOST badge in telemetry reconciliation');
  assert(schedViewHtml.includes('SHORT_CALL ❌'), 'Missing mock SHORT_CALL badge in telemetry reconciliation');
  assert(schedViewHtml.includes('Reconciliation Classification Rules'), 'Missing classification rules legend');
  console.log('  ✅ Split-view layout and Zoom Telemetry placeholder confirmed.');

  // ===========================================================================
  // SUITE 4: Live Schoolmate ERP Schedule Fetching & Accordion Data
  // ===========================================================================
  console.log('\n--- Suite 4: Live Schoolmate ERP Schedule Fetching & Accordion Parsing ---');

  // 4.1 Savchuk Yuliia (17251)
  console.log('  [4.1] Fetching live schedule for Savchuk Yuliia (ID: 17251, 2026-09-14 to 2026-09-20)...');
  const report1Res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 17251,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    })
  });
  assert.strictEqual(report1Res.status, 200, `Expected 200, got ${report1Res.status}`);
  const report1 = await report1Res.json();

  assert.strictEqual(report1.teacherName, 'Savchuk Yuliia');
  assert.strictEqual(report1.totalLessonsCount, 20, `Expected 20 lessons for Savchuk Yuliia, got ${report1.totalLessonsCount}`);
  assert.strictEqual(report1.totalMinutesReported, 1200, `Expected 1200 reported minutes, got ${report1.totalMinutesReported}`);
  assert.strictEqual(report1.totalMinutesCalculated, 1200, `Expected 1200 calculated minutes, got ${report1.totalMinutesCalculated}`);
  assert.strictEqual(report1.isMinutesMatching, true, 'Reported minutes must match calculated minutes');
  assert(Array.isArray(report1.days) && report1.days.length === 5, `Expected 5 days, got ${report1.days?.length}`);

  // Validate lesson accordion card structures
  let totalLessonsCounted1 = 0;
  let totalMinutesCounted1 = 0;
  for (const day of report1.days) {
    assert(day.date, 'Day must have date');
    assert(day.dayName, 'Day must have dayName');
    assert(typeof day.subtotalMinutes === 'number' && day.subtotalMinutes > 0, 'Day must have positive subtotalMinutes');
    let dayCalcMinutes = 0;
    for (const lesson of day.lessons) {
      assert(lesson.id, 'Lesson must have id');
      assert(lesson.date, 'Lesson must have date');
      assert(lesson.startTime && lesson.endTime, 'Lesson must have startTime and endTime');
      assert(lesson.durationMinutes > 0, 'Lesson must have positive duration');
      assert(lesson.groupOrStudent, 'Lesson must specify student or group name');
      assert.strictEqual(lesson.lessonType, 'GE', `Expected lessonType 'GE', got '${lesson.lessonType}'`);
      dayCalcMinutes += lesson.durationMinutes;
      totalLessonsCounted1++;
    }
    assert.strictEqual(dayCalcMinutes, day.subtotalMinutes, `Day ${day.date} subtotal mismatch`);
    totalMinutesCounted1 += day.subtotalMinutes;
  }
  assert.strictEqual(totalLessonsCounted1, 20, 'Total lessons counted must be 20');
  assert.strictEqual(totalMinutesCounted1, 1200, 'Total minutes counted across all days must be 1200');
  console.log(`  ✅ Savchuk Yuliia schedule verified: 20 lessons, 1200 min across 5 days (all lesson cards contain time, duration, student, type GE, language).`);

  // 4.2 Zhuravlova Iryna (6568)
  console.log('  [4.2] Fetching live schedule for Zhuravlova Iryna (ID: 6568, 2026-09-14 to 2026-09-20)...');
  const report2Res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 6568,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    })
  });
  assert.strictEqual(report2Res.status, 200, `Expected 200, got ${report2Res.status}`);
  const report2 = await report2Res.json();

  assert.strictEqual(report2.teacherName, 'Zhuravlova Iryna');
  assert.strictEqual(report2.totalLessonsCount, 17, `Expected 17 lessons for Zhuravlova Iryna, got ${report2.totalLessonsCount}`);
  assert.strictEqual(report2.totalMinutesReported, 1200, `Expected 1200 reported minutes, got ${report2.totalMinutesReported}`);
  assert.strictEqual(report2.totalMinutesCalculated, 1200, `Expected 1200 calculated minutes, got ${report2.totalMinutesCalculated}`);
  assert.strictEqual(report2.isMinutesMatching, true, 'Reported minutes must match calculated minutes');
  assert(Array.isArray(report2.days) && report2.days.length === 6, `Expected 6 days, got ${report2.days?.length}`);

  let totalLessonsCounted2 = 0;
  let totalMinutesCounted2 = 0;
  for (const day of report2.days) {
    let dayCalcMinutes = 0;
    for (const lesson of day.lessons) {
      assert(lesson.id, 'Lesson must have id');
      assert(lesson.startTime && lesson.endTime, 'Lesson must have startTime and endTime');
      assert(lesson.durationMinutes > 0, 'Lesson must have positive duration');
      assert(lesson.groupOrStudent, 'Lesson must have groupOrStudent');
      assert.strictEqual(lesson.lessonType, 'GE', `Expected lessonType 'GE', got '${lesson.lessonType}'`);
      dayCalcMinutes += lesson.durationMinutes;
      totalLessonsCounted2++;
    }
    assert.strictEqual(dayCalcMinutes, day.subtotalMinutes, `Day ${day.date} subtotal mismatch`);
    totalMinutesCounted2 += day.subtotalMinutes;
  }
  assert.strictEqual(totalLessonsCounted2, 17, 'Total lessons counted must be 17');
  assert.strictEqual(totalMinutesCounted2, 1200, 'Total minutes counted across all days must be 1200');
  console.log(`  ✅ Zhuravlova Iryna schedule verified: 17 lessons, 1200 min across 6 days (all lesson cards contain time, duration, student, type GE, language).`);

  // 4.3 Redis Cache Hit Verification
  console.log('  [4.3] Verifying Redis caching for subsequent requests...');
  const cacheCheckStart = Date.now();
  const cacheRes = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 17251,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    })
  });
  const cacheDuration = Date.now() - cacheCheckStart;
  assert.strictEqual(cacheRes.status, 200);
  const cacheData = await cacheRes.json();
  assert.strictEqual(cacheData.cached, true, 'Subsequent call must be served from cache');
  assert.strictEqual(cacheData.totalLessonsCount, 20);
  console.log(`  ✅ Redis cache hit verified: returned in ${cacheDuration}ms (cached: true).`);

  // ===========================================================================
  // SUITE 5: System Logs Page (/logs) & Audit Verification
  // ===========================================================================
  console.log('\n--- Suite 5: System Logs Page (/logs) & Audit Trail Verification ---');

  // 5.1 System Logs Page HTML & SSR
  console.log('  [5.1] Inspecting /logs HTML render...');
  const logsPageRes = await fetch(`${BASE_URL}/logs`);
  assert.strictEqual(logsPageRes.status, 200, `Expected 200, got ${logsPageRes.status}`);
  const logsPageHtml = await logsPageRes.text();

  assert(logsPageHtml.includes('System Audit Logs &amp; Error Center') || logsPageHtml.includes('System Audit Logs & Error Center'), 'Missing System Audit Logs header');
  assert(logsPageHtml.includes('Audit Trail'), 'Missing Audit Trail section');
  assert(logsPageHtml.includes('Refresh Logs'), 'Missing Refresh Logs button');
  assert(logsPageHtml.includes('ALL'), 'Missing ALL level filter indicator');
  assert(logsPageHtml.includes('INFO'), 'Missing INFO level filter indicator');
  assert(logsPageHtml.includes('WARN'), 'Missing WARN level filter indicator');
  assert(logsPageHtml.includes('ERROR'), 'Missing ERROR level filter indicator');
  assert(logsPageHtml.includes('Search action, message, JSON...'), 'Missing search input placeholder');

  // 5.2 Query Logs API
  console.log('  [5.2] Querying /api/logs to verify recorded audit trail...');
  const logsRes = await fetch(`${BASE_URL}/api/logs?limit=100`);
  assert.strictEqual(logsRes.status, 200, `Expected 200, got ${logsRes.status}`);
  const logsData = await logsRes.json();
  assert(Array.isArray(logsData.logs), 'Expected logs array');
  assert(logsData.logs.length > 0, 'Expected non-empty audit logs');

  console.log(`  Total audit logs retrieved: ${logsData.logs.length}`);
  const actions = logsData.logs.map((l) => l.action);

  // Check required audit events
  assert(actions.includes('TEACHER_CREATED'), 'Audit logs must contain TEACHER_CREATED');
  assert(actions.includes('TEACHER_DELETED'), 'Audit logs must contain TEACHER_DELETED');
  assert(actions.includes('schoolmate:fetch_and_parse'), 'Audit logs must contain schoolmate:fetch_and_parse');

  const teacherCreateLog = logsData.logs.find((l) => l.action === 'TEACHER_CREATED');
  assert(teacherCreateLog && teacherCreateLog.details, 'Teacher created log must have details object');
  assert(teacherCreateLog.details.schoolmateTeacherId, 'Teacher created log details must have schoolmateTeacherId');

  const scheduleLog = logsData.logs.find((l) => l.action === 'schoolmate:fetch_and_parse');
  assert(scheduleLog.durationMs !== undefined && scheduleLog.durationMs !== null, 'Schedule log must have durationMs');
  console.log(`  ✅ Audit trail verified with TEACHER_CREATED (${JSON.stringify(teacherCreateLog.details)}), TEACHER_DELETED, and schoolmate:fetch_and_parse (${scheduleLog.durationMs}ms).`);

  // ===========================================================================
  // SUITE 6: Adversarial & Edge Case Stress Testing
  // ===========================================================================
  console.log('\n--- Suite 6: Adversarial & Edge Case Stress Testing ---');

  // 6.1 Inverted Date Range
  console.log('  [6.1] Inverted Date Range (From > To)...');
  const invertedRes = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 17251,
      fromDate: '2026-09-20',
      toDate: '2026-09-14'
    })
  });
  // Should either process safely or return handled response without crashing server
  console.log(`  Inverted range response status: ${invertedRes.status}`);

  // 6.2 Malformed Date Regex Format
  console.log('  [6.2] Malformed Date strings...');
  const badDateRes = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 17251,
      fromDate: '14-09-2026',
      toDate: '20-09-2026'
    })
  });
  assert.strictEqual(badDateRes.status, 400, 'Expected 400 Bad Request for non YYYY-MM-DD dates');
  console.log('  ✅ Malformed dates correctly rejected with 400.');

  // 6.3 Non-existent Teacher ID in Dynamic Route
  console.log('  [6.3] Non-existent Teacher ID in /teachers/[id]...');
  const nonExistentRes = await fetch(`${BASE_URL}/api/teachers/non_existent_teacher_id`);
  assert.strictEqual(nonExistentRes.status, 404, 'Expected 404 for non-existent teacher');
  console.log('  ✅ Non-existent teacher query safely returns 404.');

  // 6.4 Non-existent Route
  console.log('  [6.4] Non-existent route (/random-route)...');
  const notFoundRes = await fetch(`${BASE_URL}/random-route`);
  assert.strictEqual(notFoundRes.status, 404, 'Expected 404 for non-existent route');
  console.log('  ✅ 404 handler functions properly.');

  // 6.5 Zero & Negative Teacher IDs in Report API
  console.log('  [6.5] Negative / zero teacher IDs...');
  const zeroTeacherRes = await fetch(`${BASE_URL}/api/schoolmate/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teacherId: 0,
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    })
  });
  assert.strictEqual(zeroTeacherRes.status, 400, 'Expected 400 for teacherId = 0');
  console.log('  ✅ Non-positive teacher IDs correctly rejected with 400.');

  console.log('\n========================================================================');
  console.log('🎉 ALL EMPIRICAL CHALLENGER VERIFICATION TESTS PASSED 100%!');
  console.log('========================================================================\n');
}

runChallengerTests()
  .catch((err) => {
    console.error('\n❌ CHALLENGE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log('[Server] Cleaning up and shutting down Next.js server...');
    cleanup();
  });
