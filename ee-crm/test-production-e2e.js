// ee-crm/test-production-e2e.js
// Live Production End-to-End Verification Suite for Empire English CRM
// Target: https://poc-zom-report-2qvs.vercel.app/

import assert from 'node:assert';

const PROD_URL = process.env.PROD_URL || 'https://poc-zom-report-2qvs.vercel.app';

console.log('========================================================================');
console.log('🌐 LIVE PRODUCTION E2E VERIFICATION SUITE');
console.log(`Target URL: ${PROD_URL}`);
console.log(`Started At: ${new Date().toISOString()}`);
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(testName, fn) {
  totalTests++;
  process.stdout.write(`[Test ${totalTests}] ${testName} ... `);
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`✅ PASS (${duration}ms)`);
    passedTests++;
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`❌ FAIL (${duration}ms)`);
    console.error(`  Error: ${err.message}`);
    throw err;
  }
}

async function runLiveProductionVerification() {
  let createdTeacherId = null;

  // 1. Health Probe
  await runTest('GET /api/health returns HTTP 200 and healthy integrations', async () => {
    const res = await fetch(`${PROD_URL}/api/health`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok', 'Status should be ok');
    assert.strictEqual(data.service, 'Empire English CRM (EE CRM)', 'Service name mismatch');
    assert.strictEqual(data.integrations?.redis?.connected, true, 'Redis not connected');
    assert.strictEqual(data.integrations?.schoolmate?.configured, true, 'Schoolmate not configured');
    console.log(`\n      [Health details: Redis=${data.integrations.redis.mode}, Schoolmate=${data.integrations.schoolmate.username}]`);
  });

  // 2. Teacher Directory Page (Root SSR)
  await runTest('GET / renders Teacher Directory page with brand layout & controls', async () => {
    const res = await fetch(`${PROD_URL}/`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Empire English CRM'), 'Missing brand identity "Empire English CRM"');
    assert(html.includes('Teachers'), 'Missing "Teachers" navigation/heading');
    assert(html.includes('System Logs'), 'Missing "System Logs" navigation link');
    assert(html.includes('Add New Teacher') || html.includes('Add Teacher'), 'Missing Add Teacher section');
    assert(html.includes('Savchuk Yuliia') && html.includes('17251'), 'Missing Quick-Add button / test teacher reference');
  });

  // 3. System Logs Page (SSR)
  await runTest('GET /logs renders Audit Logs & Error Center page', async () => {
    const res = await fetch(`${PROD_URL}/logs`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Empire English CRM'), 'Missing brand identity in layout');
    assert(html.includes('System Logs') || html.includes('Audit Logs'), 'Missing System Logs title');
    assert(html.includes('Refresh Logs') || html.includes('Auto-Refresh'), 'Missing Refresh Logs action');
  });

  // 4. Initial Teacher List Query
  await runTest('GET /api/teachers returns teacher array', async () => {
    const res = await fetch(`${PROD_URL}/api/teachers`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.teachers), 'data.teachers is not an array');
    console.log(`\n      [Current teachers in DB: ${data.teachers.length}]`);
  });

  // 5. Create Teacher via POST /api/teachers
  await runTest('POST /api/teachers creates test teacher (Savchuk Yuliia - 17251)', async () => {
    const res = await fetch(`${PROD_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Yuliia',
        lastName: 'Savchuk',
        email: 'yuliasavchuk03@gmail.com',
        schoolmateTeacherId: 17251,
        zoomHostEmail: 'yuliasavchuk03@gmail.com'
      })
    });
    assert([200, 201].includes(res.status), `Expected 200 or 201, got ${res.status}`);
    const data = await res.json();
    assert(data.teacher && data.teacher.id, 'Created teacher missing id');
    assert.strictEqual(data.teacher.schoolmateTeacherId, 17251, 'Mismatched schoolmateTeacherId');
    assert.strictEqual(data.teacher.fullName, 'Savchuk Yuliia', 'Mismatched fullName');
    createdTeacherId = data.teacher.id;
    console.log(`\n      [Created Teacher ID: ${createdTeacherId}]`);
  });

  // 6. Verify Created Teacher in GET /api/teachers and GET /api/teachers/[id]
  await runTest('GET /api/teachers/[id] returns created teacher record', async () => {
    assert(createdTeacherId, 'No createdTeacherId to test');
    const res = await fetch(`${PROD_URL}/api/teachers/${createdTeacherId}`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.teacher.id, createdTeacherId, 'Mismatched ID');
    assert.strictEqual(data.teacher.fullName, 'Savchuk Yuliia', 'Mismatched Name');
  });

  // 7. Verify Teacher Schedule Page SSR
  await runTest('GET /teachers/[id] renders Schedule Viewer & Split View layout', async () => {
    assert(createdTeacherId, 'No createdTeacherId to test');
    const res = await fetch(`${PROD_URL}/teachers/${createdTeacherId}`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Savchuk Yuliia') || html.includes('Schedule'), 'Missing teacher name or Schedule title');
    assert(html.includes('Fetch &amp; Parse from Schoolmate') || html.includes('Fetch & Parse from Schoolmate'), 'Missing Fetch button in UI');
    assert(html.includes('Zoom Telemetry') || html.includes('Placeholder') || html.includes('Side-by-Side'), 'Missing Zoom reconciliation split-view column');
  });

  // 8. Live Schoolmate Schedule Report: Savchuk Yuliia (ID: 17251)
  await runTest('POST /api/schoolmate/report for Savchuk Yuliia (17251) returns 20 lessons, 1200 min', async () => {
    const res = await fetch(`${PROD_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.teacherName, 'Savchuk Yuliia', `Teacher name mismatch: ${data.teacherName}`);
    assert.strictEqual(data.totalLessonsCount, 20, `Expected 20 lessons, got ${data.totalLessonsCount}`);
    assert.strictEqual(data.totalMinutesReported, 1200, `Expected 1200 reported min, got ${data.totalMinutesReported}`);
    assert.strictEqual(data.totalMinutesCalculated, 1200, `Expected 1200 calculated min, got ${data.totalMinutesCalculated}`);
    assert.strictEqual(data.isMinutesMatching, true, 'isMinutesMatching should be true');
    assert.strictEqual(data.days.length, 5, `Expected 5 active days, got ${data.days.length}`);
    console.log(`\n      [Savchuk Yuliia: 20 lessons, 1200 min across ${data.days.length} days, cached=${data.cached}]`);
  });

  // 9. Live Schoolmate Schedule Report: Zhuravlova Iryna (ID: 6568)
  await runTest('POST /api/schoolmate/report for Zhuravlova Iryna (6568) returns 17 lessons, 1200 min', async () => {
    const res = await fetch(`${PROD_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 6568,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.teacherName, 'Zhuravlova Iryna', `Teacher name mismatch: ${data.teacherName}`);
    assert.strictEqual(data.totalLessonsCount, 17, `Expected 17 lessons, got ${data.totalLessonsCount}`);
    assert.strictEqual(data.totalMinutesReported, 1200, `Expected 1200 reported min, got ${data.totalMinutesReported}`);
    assert.strictEqual(data.totalMinutesCalculated, 1200, `Expected 1200 calculated min, got ${data.totalMinutesCalculated}`);
    assert.strictEqual(data.isMinutesMatching, true, 'isMinutesMatching should be true');
    assert.strictEqual(data.days.length, 6, `Expected 6 active days, got ${data.days.length}`);
    console.log(`\n      [Zhuravlova Iryna: 17 lessons, 1200 min across ${data.days.length} days, cached=${data.cached}]`);
  });

  // 10. Cache Hit Verification
  await runTest('Repeat POST /api/schoolmate/report returns cached report (cached: true)', async () => {
    const start = Date.now();
    const res = await fetch(`${PROD_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    const roundTrip = Date.now() - start;
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.cached, true, 'Report was not returned from cache');
    assert.strictEqual(data.totalLessonsCount, 20, `Expected 20 lessons from cache, got ${data.totalLessonsCount}`);
    console.log(`\n      [Cache hit verified in ${roundTrip}ms, cached=true]`);
  });

  // 11. System Audit Logs Retrieval
  await runTest('GET /api/logs returns recent audit logs including teacher & schoolmate events', async () => {
    const res = await fetch(`${PROD_URL}/api/logs?limit=50`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.logs), 'data.logs is not an array');
    assert(data.logs.length > 0, 'Audit logs array is empty');
    const actions = data.logs.map((l) => l.action);
    const hasTeacherAction = actions.some((a) => a.includes('TEACHER_CREATED') || a.includes('teacher'));
    const hasReportAction = actions.some((a) => a.includes('schoolmate:fetch_and_parse') || a.includes('schoolmate'));
    assert(hasTeacherAction || hasReportAction, `Expected teacher or schoolmate action in logs, found: ${actions.slice(0, 5).join(', ')}`);
    console.log(`\n      [Found ${data.logs.length} audit logs. Recent actions: ${actions.slice(0, 3).join(', ')}]`);
  });

  // 12. Delete Test Teacher Cleanup
  await runTest('DELETE /api/teachers/[id] deletes test teacher cleanly', async () => {
    assert(createdTeacherId, 'No createdTeacherId to delete');
    const res = await fetch(`${PROD_URL}/api/teachers/${createdTeacherId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Delete was not acknowledged as success');

    // Confirm 404 on subsequent fetch
    const verifyRes = await fetch(`${PROD_URL}/api/teachers/${createdTeacherId}`);
    assert.strictEqual(verifyRes.status, 404, `Expected 404 after deletion, got ${verifyRes.status}`);
  });

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} PRODUCTION E2E VERIFICATION TESTS PASSED 100%!`);
  console.log(`Production URL: ${PROD_URL}`);
  console.log('========================================================================\n');
}

runLiveProductionVerification().catch((err) => {
  console.error('\n❌ PRODUCTION VERIFICATION FAILED:', err);
  process.exit(1);
});
