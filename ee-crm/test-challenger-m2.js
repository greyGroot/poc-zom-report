// ee-crm/test-challenger-m2.js
// Independent Empirical Challenge Test Suite for Milestone 2: Frontend UI Layout & Pages
// Adversarial verification of SSR rendering, edge case IDs, dynamic HTML markup,
// empty states, malformed date validation, and concurrency resilience.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3480;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        return true;
      }
    } catch {
      // server starting up
    }
    await sleep(400);
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

async function runMilestone2Challenges() {
  console.log('================================================================');
  console.log('⚔️  CHALLENGER 1: EMPIRICAL VERIFICATION OF MILESTONE 2 FRONTEND');
  console.log('================================================================\n');

  console.log(`[Launch] Starting Next.js production server on port ${TEST_PORT}...`);
  const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(TEST_PORT)], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const serverErrors = [];
  serverProcess.stderr.on('data', data => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Warning') && !msg.includes('inferred your workspace root')) {
      serverErrors.push(msg);
      console.warn(`[Server stderr]: ${msg}`);
    }
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

  let totalTests = 0;
  let passedTests = 0;

  const runTest = async (name, testFn) => {
    totalTests++;
    try {
      process.stdout.write(`  [Test ${totalTests}] ${name} ... `);
      await testFn();
      passedTests++;
      console.log('✅ PASS');
    } catch (err) {
      console.log('❌ FAIL');
      console.error(`      Reason: ${err.message}`);
      throw err;
    }
  };

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Production server online at ${BASE_URL}\n`);

    // =========================================================================
    // SUITE 1: Next.js Production SSR & Core Route Rendering
    // =========================================================================
    console.log('--- SUITE 1: Production SSR & Core Route Rendering ---');

    await runTest('GET / renders with HTTP 200 and standard HTML doctype', async () => {
      const res = await fetch(`${BASE_URL}/`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.includes('<!DOCTYPE html>') || text.includes('<html'), 'Missing HTML doctype or tag');
      assert(text.includes('Empire English CRM'), 'Missing brand name in SSR HTML');
    });

    await runTest('GET /logs renders with HTTP 200 and standard HTML doctype', async () => {
      const res = await fetch(`${BASE_URL}/logs`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.includes('System Audit Logs &amp; Error Center') || text.includes('System Audit Logs & Error Center'), 'Missing title');
      assert(text.includes('Audit Trail'), 'Missing Audit Trail section');
    });

    await runTest('GET /api/health responds with HTTP 200 and status: ok', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.status === 'ok', `Expected status ok, got ${data.status}`);
    });

    // =========================================================================
    // SUITE 2: Dynamic Route SSR with Adversarial & Edge Case IDs
    // =========================================================================
    console.log('\n--- SUITE 2: Dynamic Route SSR with Adversarial & Edge Case IDs ---');

    await runTest('GET /teachers/[id] with non-existent ID renders SSR safely without 500', async () => {
      const res = await fetch(`${BASE_URL}/teachers/non-existent-teacher-99999`);
      assert(res.status === 200, `Expected 200 (SSR shell), got ${res.status}`);
      const text = await res.text();
      assert(text.includes('Teacher Schedule'), 'Missing schedule shell in SSR');
      assert(text.includes('Schoolmate Schedule'), 'Missing Schoolmate Schedule section');
      assert(text.includes('Zoom Telemetry Reconciliation'), 'Missing Telemetry column');
    });

    await runTest('GET /teachers/[id] with XSS payload ID renders escaped without executing script', async () => {
      const xssId = encodeURIComponent('<script>alert("xss")</script>');
      const res = await fetch(`${BASE_URL}/teachers/${xssId}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      // Ensure raw unescaped script tag is not present
      assert(!text.includes('<script>alert("xss")</script>'), 'Unescaped script tag found in HTML!');
    });

    await runTest('GET /teachers/[id] with special symbols (!@#$%^&*()) does not crash server', async () => {
      const specialId = encodeURIComponent('!@#$%^&*()_+');
      const res = await fetch(`${BASE_URL}/teachers/${specialId}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.includes('Teacher Schedule'), 'Expected valid page render');
    });

    await runTest('GET /teachers/[id] with unicode characters (Ukrainian: "Ірина") does not crash', async () => {
      const unicodeId = encodeURIComponent('Ірина');
      const res = await fetch(`${BASE_URL}/teachers/${unicodeId}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const text = await res.text();
      assert(text.includes('Teacher Schedule'), 'Expected valid page render');
    });

    await runTest('GET /api/teachers/[id] with non-existent ID returns HTTP 404', async () => {
      const res = await fetch(`${BASE_URL}/api/teachers/non-existent-99999`);
      assert(res.status === 404, `Expected 404, got ${res.status}`);
      const data = await res.json();
      assert(data.error === 'Teacher not found', `Unexpected error: ${data.error}`);
    });

    await runTest('DELETE /api/teachers/[id] with non-existent ID returns HTTP 404', async () => {
      const res = await fetch(`${BASE_URL}/api/teachers/non-existent-99999`, { method: 'DELETE' });
      assert(res.status === 404, `Expected 404, got ${res.status}`);
      const data = await res.json();
      assert(data.error === 'Teacher not found', `Unexpected error: ${data.error}`);
    });

    // =========================================================================
    // SUITE 3: Dynamic HTML Markup Inspection & Design System Verification
    // =========================================================================
    console.log('\n--- SUITE 3: Dynamic HTML Markup Inspection & Design System ---');

    await runTest('Root layout DOM inspection: Brand identity, navigation links, and health probe', async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();

      // Brand Identity
      assert(html.includes('Empire English CRM'), 'Missing "Empire English CRM" text');
      assert(html.includes('EE CRM v1.0'), 'Missing "EE CRM v1.0" badge');
      assert(html.includes('🎓'), 'Missing graduation cap brand icon');

      // Navigation links
      assert(html.includes('href="/"'), 'Missing link to /');
      assert(html.includes('href="/logs"'), 'Missing link to /logs');
      assert(html.includes('href="/api/health"'), 'Missing link to /api/health');
      assert(html.includes('Teachers'), 'Missing Teachers nav link text');
      assert(html.includes('System Logs'), 'Missing System Logs nav link text');
      assert(html.includes('Health'), 'Missing Health nav link text');

      // CSS Design Tokens linked
      assert(html.includes('globals.css') || html.includes('<style') || html.includes('main-content'), 'Missing global styling');
    });

    await runTest('Teacher Directory (/) DOM inspection: Add Teacher form, quick-add buttons, table', async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();

      assert(html.includes('Teacher Directory'), 'Missing "Teacher Directory" header');
      assert(html.includes('Add New Teacher'), 'Missing "Add New Teacher" title');

      // Form inputs
      assert(html.includes('First Name *'), 'Missing First Name input label');
      assert(html.includes('Last Name *'), 'Missing Last Name input label');
      assert(html.includes('Email Address *'), 'Missing Email Address input label');
      assert(html.includes('Schoolmate Teacher ID *'), 'Missing Schoolmate Teacher ID label');
      assert(html.includes('Add Teacher'), 'Missing Add Teacher submit button');

      // Quick-add buttons
      assert(html.includes('quick-add-btn') || html.includes('quick-add-container'), 'Missing quick-add container class');
      assert(html.includes('Savchuk Yuliia (ID: 17251)'), 'Missing Savchuk quick-add button');
      assert(html.includes('Zhuravlova Iryna (ID: 6568)'), 'Missing Zhuravlova quick-add button');
    });

    await runTest('Teacher Schedule Viewer (/teachers/[id]) DOM inspection: Controls, presets, split-view', async () => {
      const res = await fetch(`${BASE_URL}/teachers/17251`);
      const html = await res.text();

      // Back navigation
      assert(html.includes('Back to Teachers'), 'Missing "Back to Teachers" link');

      // Date Inputs
      assert(html.includes('From Date'), 'Missing From Date label');
      assert(html.includes('To Date'), 'Missing To Date label');
      assert(html.includes('type="date"'), 'Missing date input fields');
      assert(html.includes('2026-09-14'), 'Missing default From Date 2026-09-14');
      assert(html.includes('2026-09-20'), 'Missing default To Date 2026-09-20');

      // Quick presets
      assert(html.includes('Sep 14-20 (Test)'), 'Missing Sep 14-20 (Test) preset button');
      assert(html.includes('This Week'), 'Missing This Week preset button');
      assert(html.includes('Last Week'), 'Missing Last Week preset button');

      // Primary Action button
      assert(html.includes('Parse from Schoolmate') || html.includes('Fetch &amp; Parse from Schoolmate'), 'Missing primary action button');

      // Split-view layout structure
      assert(html.includes('split-view-container'), 'Missing split-view-container CSS class');
      assert(html.includes('schedule-column'), 'Missing schedule-column CSS class');
      assert(html.includes('telemetry-column'), 'Missing telemetry-column CSS class');

      // Telemetry Column Details
      assert(html.includes('Zoom Telemetry Reconciliation'), 'Missing Zoom Telemetry title');
      assert(html.includes('Phase 2'), 'Missing Phase 2 badge');
      assert(html.includes('VERIFIED ✅'), 'Missing VERIFIED badge');
      assert(html.includes('ONLY_HOST ⚠️'), 'Missing ONLY_HOST badge');
      assert(html.includes('SHORT_CALL ❌'), 'Missing SHORT_CALL badge');
      assert(html.includes('Reconciliation Classification Rules'), 'Missing rules legend');
    });

    await runTest('System Logs (/logs) DOM inspection: Filters, search input, controls, empty state', async () => {
      const res = await fetch(`${BASE_URL}/logs`);
      const html = await res.text();

      assert(html.includes('System Audit Logs &amp; Error Center') || html.includes('System Audit Logs & Error Center'), 'Missing page title');
      assert(html.includes('Refresh Logs'), 'Missing Refresh Logs button');

      // Filter pills
      assert(html.includes('filter-pills') || html.includes('filter-pill'), 'Missing filter-pills class');
      assert(html.includes('>ALL<'), 'Missing ALL filter pill');
      assert(html.includes('>INFO<'), 'Missing INFO filter pill');
      assert(html.includes('>WARN<'), 'Missing WARN filter pill');
      assert(html.includes('>ERROR<'), 'Missing ERROR filter pill');

      // Search input
      assert(html.includes('Search action, message, JSON...'), 'Missing search placeholder');

      // SSR Empty state
      assert(html.includes('No Logs Found'), 'Missing No Logs Found empty state in initial SSR');
    });

    await runTest('Verify table header columns defined in frontend component markup', async () => {
      // Teachers Directory table headers
      const pageJs = fs.readFileSync(path.join(__dirname, 'app', 'page.js'), 'utf8');
      assert(pageJs.includes('<th>Teacher Name</th>'), 'Missing Teacher Name table header');
      assert(pageJs.includes('<th>Email Address</th>'), 'Missing Email Address table header');
      assert(pageJs.includes('<th>Schoolmate ID</th>'), 'Missing Schoolmate ID table header');
      assert(pageJs.includes('<th>Added On</th>'), 'Missing Added On table header');
      assert(pageJs.includes('Actions</th>'), 'Missing Actions table header');

      // Logs table headers
      const logsJs = fs.readFileSync(path.join(__dirname, 'app', 'logs', 'page.js'), 'utf8');
      assert(logsJs.includes('<th>Timestamp</th>'), 'Missing Timestamp table header');
      assert(logsJs.includes('<th>Level</th>'), 'Missing Level table header');
      assert(logsJs.includes('<th>Action</th>'), 'Missing Action table header');
      assert(logsJs.includes('<th>Duration</th>'), 'Missing Duration table header');
      assert(logsJs.includes('<th>Message</th>'), 'Missing Message table header');
      assert(logsJs.includes('Details</th>'), 'Missing Details table header');
    });

    // =========================================================================
    // SUITE 4: Empty State Handling & Zero-Lesson Resilience
    // =========================================================================
    console.log('\n--- SUITE 4: Empty State Handling & Zero-Lesson Resilience ---');

    await runTest('SSR renders "No Teachers Registered Yet" empty state markup on /', async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();
      assert(html.includes('No Teachers Registered Yet'), 'Missing empty teacher state title');
      assert(html.includes('Use the form above or click one of the quick-add buttons'), 'Missing empty teacher instructions');
    });

    await runTest('SSR renders "No Logs Found" empty state markup on /logs', async () => {
      const res = await fetch(`${BASE_URL}/logs`);
      const html = await res.text();
      assert(html.includes('No Logs Found'), 'Missing "No Logs Found" empty state heading');
      assert(html.includes('The system log store is currently empty.') || html.includes('No logs match your filter criteria.'), 'Missing empty logs message');
    });

    await runTest('SSR renders "No Schedule Data Loaded" initial empty state on /teachers/[id]', async () => {
      const res = await fetch(`${BASE_URL}/teachers/17251`);
      const html = await res.text();
      assert(html.includes('No Schedule Data Loaded'), 'Missing "No Schedule Data Loaded" message');
      assert(html.includes('Click &quot;Fetch &amp; Parse from Schoolmate&quot;') || html.includes('Click &quot;Fetch & Parse from Schoolmate&quot;') || html.includes('Fetch &amp; Parse from Schoolmate'), 'Missing action hint');
    });

    await runTest('Resilience on zero-lesson report (live 2024-01-01 week for teacher 6568)', async () => {
      // Fetch live schedule for teacher 6568 (Zhuravlova Iryna) during 2024 New Year break
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 6568,
          fromDate: '2024-01-01',
          toDate: '2024-01-07'
        })
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.teacherName === 'Zhuravlova Iryna', `Expected Zhuravlova Iryna, got: ${data.teacherName}`);
      assert(data.totalLessonsCount === 0, `Expected 0 lessons, got ${data.totalLessonsCount}`);
      assert(Array.isArray(data.days) && data.days.length === 0, 'Expected 0 days');
      assert(data.totalMinutesReported === 0, 'Expected 0 reported minutes');
      assert(data.isMinutesMatching === true, 'Expected minutes matching true');

      // Verify teacher schedule page handles zero lessons gracefully
      const schedJs = fs.readFileSync(path.join(__dirname, 'app', 'teachers', '[id]', 'page.js'), 'utf8');
      assert(schedJs.includes('No Lessons Scheduled'), 'Missing zero-lessons empty state heading in UI');
      assert(schedJs.includes('Teacher has 0 scheduled lessons for the period'), 'Missing zero-lessons UI explanation');
    });

    // =========================================================================
    // SUITE 5: Adversarial Inputs to Schedule Report Fetch API
    // =========================================================================
    console.log('\n--- SUITE 5: Adversarial Validation of POST /api/schoolmate/report ---');

    await runTest('Reject empty JSON body with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error && data.error.includes('teacherId'), `Expected teacherId error, got: ${data.error}`);
    });

    await runTest('Reject negative teacherId with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: -99, fromDate: '2026-09-14', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes('positive number'), `Unexpected error: ${data.error}`);
    });

    await runTest('Reject zero teacherId with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 0, fromDate: '2026-09-14', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes('positive number'), `Unexpected error: ${data.error}`);
    });

    await runTest('Reject non-numeric teacherId with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 'not-a-number', fromDate: '2026-09-14', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await runTest('Reject malformed fromDate (slashes: "2026/09/14") with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 17251, fromDate: '2026/09/14', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes('fromDate is required (format YYYY-MM-DD)'), `Unexpected error: ${data.error}`);
    });

    await runTest('Reject malformed fromDate (DD-MM-YYYY: "14-09-2026") with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 17251, fromDate: '14-09-2026', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await runTest('Reject XSS payload in fromDate with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 17251, fromDate: '<script>alert(1)</script>', toDate: '2026-09-20' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await runTest('Reject missing toDate with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: 17251, fromDate: '2026-09-14' })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes('toDate is required (format YYYY-MM-DD)'), `Unexpected error: ${data.error}`);
    });

    await runTest('Reject malformed JSON syntax with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed_json: true '
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const data = await res.json();
      assert(data.error.includes('Invalid JSON body'), `Unexpected error: ${data.error}`);
    });

    await runTest('Reject SQL injection attempt in fromDate with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 17251,
          fromDate: "2026-09-14' OR '1'='1",
          toDate: '2026-09-20'
        })
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await runTest('Verify adversarial query parameters on GET /api/logs do not crash', async () => {
      const limits = ['0', '-99', 'notanumber', '99999'];
      for (const lim of limits) {
        const res = await fetch(`${BASE_URL}/api/logs?limit=${lim}`);
        assert(res.status === 200, `Expected 200 for limit=${lim}, got ${res.status}`);
        const data = await res.json();
        assert(Array.isArray(data.logs), `Expected logs array for limit=${lim}`);
      }
    });

    // =========================================================================
    // SUITE 6: End-to-End Teacher Workflow & Live Schoolmate Integration
    // =========================================================================
    console.log('\n--- SUITE 6: End-to-End Teacher Workflow & Live Integration ---');

    let createdTeacherId = null;

    await runTest('Create teacher (Savchuk Yuliia, 17251) via POST /api/teachers', async () => {
      const res = await fetch(`${BASE_URL}/api/teachers`, {
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
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      assert(data.teacher && data.teacher.id, 'Expected created teacher with id');
      assert(data.teacher.fullName === 'Savchuk Yuliia', `Unexpected name: ${data.teacher.fullName}`);
      createdTeacherId = data.teacher.id;
    });

    await runTest('Fetch teacher list via GET /api/teachers includes newly created teacher', async () => {
      const res = await fetch(`${BASE_URL}/api/teachers`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(Array.isArray(data.teachers), 'Expected teachers array');
      const found = data.teachers.find(t => t.id === createdTeacherId);
      assert(found, `Teacher ${createdTeacherId} not found in list`);
      assert(found.schoolmateTeacherId === 17251, 'Schoolmate ID mismatch');
    });

    await runTest('Fetch live schedule report for Savchuk Yuliia (20 lessons, 1200 min)', async () => {
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 17251,
          fromDate: '2026-09-14',
          toDate: '2026-09-20'
        })
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const report = await res.json();
      assert(report.teacherName === 'Savchuk Yuliia', `Expected Savchuk Yuliia, got: ${report.teacherName}`);
      assert(report.totalLessonsCount === 20, `Expected 20 lessons, got: ${report.totalLessonsCount}`);
      assert(report.totalMinutesReported === 1200, `Expected 1200 min, got: ${report.totalMinutesReported}`);
      assert(report.isMinutesMatching === true, 'Expected minutes to match 100%');
      assert(Array.isArray(report.days) && report.days.length === 5, `Expected 5 active days, got: ${report.days.length}`);
    });

    await runTest('Subsequent schedule report fetch is served from Redis cache (cached: true)', async () => {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/schoolmate/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: 17251,
          fromDate: '2026-09-14',
          toDate: '2026-09-20'
        })
      });
      const duration = Date.now() - start;
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const report = await res.json();
      assert(report.cached === true, 'Expected cached: true');
      assert(duration < 200, `Expected fast cache response (<200ms), took ${duration}ms`);
    });

    await runTest('Audit log is recorded in GET /api/logs', async () => {
      const res = await fetch(`${BASE_URL}/api/logs?limit=20`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(Array.isArray(data.logs) && data.logs.length > 0, 'Expected non-empty logs array');
      const parseLog = data.logs.find(l => l.action && l.action.includes('schoolmate'));
      assert(parseLog, 'Expected to find schoolmate execution log entry');
    });

    await runTest('Delete teacher via DELETE /api/teachers/[id]', async () => {
      assert(createdTeacherId, 'Missing createdTeacherId');
      const res = await fetch(`${BASE_URL}/api/teachers/${createdTeacherId}`, {
        method: 'DELETE'
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert(data.success === true, 'Expected success: true');

      // Verify deletion from directory
      const listRes = await fetch(`${BASE_URL}/api/teachers`);
      const listData = await listRes.json();
      const found = listData.teachers.find(t => t.id === createdTeacherId);
      assert(!found, 'Teacher still exists in directory after deletion!');
    });

    // =========================================================================
    // SUITE 7: Concurrency & Stress Burst Resilience
    // =========================================================================
    console.log('\n--- SUITE 7: Concurrency & Stress Burst Resilience ---');

    await runTest('Burst 50 concurrent requests across pages & APIs without drops or 500s', async () => {
      const endpoints = [
        '/',
        '/logs',
        '/teachers/17251',
        '/teachers/non-existent',
        '/api/health',
        '/api/teachers',
        '/api/logs'
      ];

      const requests = [];
      for (let i = 0; i < 50; i++) {
        const ep = endpoints[i % endpoints.length];
        requests.push(fetch(`${BASE_URL}${ep}`));
      }

      const results = await Promise.all(requests);
      const statuses = results.map(r => r.status);
      const failed = statuses.filter(s => s >= 500);

      assert(failed.length === 0, `Detected ${failed.length} server errors (5xx) during concurrency burst: ${statuses.join(', ')}`);
      assert(results.length === 50, 'Not all requests resolved');
    });

    await runTest('Verify zero uncaught exceptions or React hydration errors in server stderr', async () => {
      assert(serverErrors.length === 0, `Unexpected server errors logged to stderr: ${serverErrors.join(' | ')}`);
    });

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ADVERSARIAL CHALLENGE TESTS PASSED SUCCESSFULLY!`);
    console.log('================================================================\n');

  } finally {
    console.log('[Cleanup] Stopping Next.js test server...');
    cleanup();
    await sleep(1000);
  }
}

runMilestone2Challenges().catch(err => {
  console.error('\n❌ EMPIRICAL CHALLENGE SUITE ENCOUNTERED A FAILURE:');
  console.error(err);
  process.exit(1);
});
