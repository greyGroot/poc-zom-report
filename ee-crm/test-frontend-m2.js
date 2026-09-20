// ee-crm/test-frontend-m2.js
// Automated verification of Milestone 2 Frontend UI Layout & Pages

import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PORT = 3470;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(maxAttempts = 30) {
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

async function runFrontendTests() {
  console.log('====================================================');
  console.log('🚀 EE CRM Milestone 2 - Frontend UI Pages Verification');
  console.log('====================================================\n');

  console.log(`[Server] Launching Next.js server on port ${PORT}...`);
  const serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'inherit'
  });

  const cleanup = () => {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t']);
      } else {
        serverProcess.kill();
      }
    } catch {
      // ignore
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    const ready = await waitForServer();
    assert(ready, 'Next.js server failed to start within timeout');
    console.log(`✅ Next.js server is online and serving at ${BASE_URL}\n`);

    // -------------------------------------------------------------
    // 1. Root Layout & Teacher Directory (GET /)
    // -------------------------------------------------------------
    console.log('--- Test 1: Root Layout & Teacher Directory Page (GET /) ---');
    const rootRes = await fetch(`${BASE_URL}/`);
    assert.strictEqual(rootRes.status, 200, `Expected 200 for /, got ${rootRes.status}`);
    const rootHtml = await rootRes.text();

    assert(rootHtml.includes('Empire English CRM'), 'Missing brand name "Empire English CRM" in layout');
    assert(rootHtml.includes('Teacher Directory'), 'Missing "Teacher Directory" heading on /');
    assert(rootHtml.includes('Add New Teacher'), 'Missing "Add New Teacher" form on /');
    assert(rootHtml.includes('Savchuk Yuliia'), 'Missing quick-add preset for Savchuk Yuliia');
    assert(rootHtml.includes('Zhuravlova Iryna'), 'Missing quick-add preset for Zhuravlova Iryna');
    assert(rootHtml.includes('Registered Teachers'), 'Missing Registered Teachers section');
    console.log('✅ Root layout and Teacher Directory HTML render validated successfully.');

    // -------------------------------------------------------------
    // 2. System Logs Page (GET /logs)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: System Logs Page (GET /logs) ---');
    const logsRes = await fetch(`${BASE_URL}/logs`);
    assert.strictEqual(logsRes.status, 200, `Expected 200 for /logs, got ${logsRes.status}`);
    const logsHtml = await logsRes.text();

    assert(logsHtml.includes('System Audit Logs'), 'Missing "System Audit Logs" title');
    assert(logsHtml.includes('Audit Trail'), 'Missing Audit Trail section');
    assert(logsHtml.includes('Refresh Logs'), 'Missing "Refresh Logs" button');
    assert(logsHtml.includes('ALL') && logsHtml.includes('ERROR'), 'Missing level filter indicators');
    console.log('✅ System Logs & Error Center HTML render validated successfully.');

    // -------------------------------------------------------------
    // 3. Teacher Creation & Schedule Viewer Route (GET /teachers/[id])
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Teacher Schedule Viewer (GET /teachers/[id]) ---');
    // First register Savchuk Yuliia to test schedule page
    const teacherCreateRes = await fetch(`${BASE_URL}/api/teachers`, {
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
    assert.strictEqual(teacherCreateRes.status, 201, `Failed to create teacher for schedule test: ${teacherCreateRes.status}`);
    const { teacher } = await teacherCreateRes.json();
    assert(teacher && teacher.id, 'Expected created teacher with id');
    console.log(`Created teacher for test: ${teacher.fullName} (${teacher.id})`);

    // Fetch the dynamic route page /teachers/[id]
    const schedRes = await fetch(`${BASE_URL}/teachers/${teacher.id}`);
    assert.strictEqual(schedRes.status, 200, `Expected 200 for /teachers/${teacher.id}, got ${schedRes.status}`);
    const schedHtml = await schedRes.text();
    assert(
      schedHtml.includes('Parse from Schoolmate') || schedHtml.includes('Fetch &amp; Parse from Schoolmate'),
      'Missing primary action button'
    );
    assert(schedHtml.includes('Schoolmate Schedule'), 'Missing Schoolmate Schedule section');
    assert(schedHtml.includes('Zoom Telemetry Reconciliation'), 'Missing Zoom Telemetry column');
    assert(schedHtml.includes('Phase 2'), 'Missing Phase 2 badge in Telemetry column');
    assert(schedHtml.includes('Back to Teachers'), 'Missing back navigation button');
    console.log('✅ Teacher Schedule Viewer & Split-View HTML render validated successfully.');

    // -------------------------------------------------------------
    // 4. End-to-End Schedule Data Fetching (Schoolmate API)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: End-to-End Schedule Fetching (2026-09-14 to 2026-09-20) ---');
    const reportRes = await fetch(`${BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: 17251,
        fromDate: '2026-09-14',
        toDate: '2026-09-20'
      })
    });
    assert.strictEqual(reportRes.status, 200, `Expected 200 from report API, got ${reportRes.status}`);
    const reportData = await reportRes.json();

    assert.strictEqual(reportData.teacherName, 'Savchuk Yuliia');
    assert.strictEqual(reportData.totalLessonsCount, 20, `Expected 20 lessons, got ${reportData.totalLessonsCount}`);
    assert.strictEqual(reportData.totalMinutesReported, 1200);
    assert.strictEqual(reportData.isMinutesMatching, true);
    assert(Array.isArray(reportData.days) && reportData.days.length > 0, 'Expected populated days array');
    console.log(`✅ Schedule report verified: ${reportData.totalLessonsCount} lessons, ${reportData.totalMinutesReported} min across ${reportData.days.length} days`);

    // -------------------------------------------------------------
    // 5. Cleanup: Delete test teacher
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Teacher Deletion Cleanup ---');
    const delRes = await fetch(`${BASE_URL}/api/teachers/${teacher.id}`, {
      method: 'DELETE'
    });
    assert.strictEqual(delRes.status, 200, `Expected 200 for teacher deletion, got ${delRes.status}`);
    console.log(`✅ Successfully cleaned up test teacher ${teacher.id}`);

    console.log('\n====================================================');
    console.log('🎉 ALL MILESTONE 2 FRONTEND VERIFICATION TESTS PASSED!');
    console.log('====================================================\n');
  } finally {
    console.log('[Server] Terminating Next.js server...');
    cleanup();
    await sleep(1000);
  }
}

runFrontendTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
