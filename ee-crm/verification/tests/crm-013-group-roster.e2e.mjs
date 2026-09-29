// ee-crm/verification/tests/crm-013-group-roster.e2e.mjs
// Automated E2E Verification Suite for CRM-013: Display Group Students Roster on Teacher and Day Pages
// Verifies Schoolmate group student roster extraction, removal of duration-based headcount conflations,
// flow-style student chips, 1-on-1 lesson preservation, and side-by-side Zoom alignment.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  PROD_VERIFICATION_BASE_URL,
  LOCAL_VERIFICATION_BASE_URL,
  TARGET_TEACHER_1,
  TARGET_TEACHER_2
} from '../fixtures/crm-013-roster-fixtures.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TARGET_BASE_URL = (process.env.CRM_013_BASE_URL || PROD_VERIFICATION_BASE_URL).replace(/\/$/, '');
const isProduction = TARGET_BASE_URL.includes('vercel.app');

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function fetchJson(urlPath) {
  const url = `${TARGET_BASE_URL}${urlPath}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache'
    }
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${url} (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return { response, json, status: response.status, headers: response.headers };
}

async function fetchHtml(urlPath) {
  const url = `${TARGET_BASE_URL}${urlPath}`;
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache'
    }
  });
  const html = await response.text();
  return { response, html, status: response.status, headers: response.headers };
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-013');
  console.log(`Target URL:  ${TARGET_BASE_URL} (${isProduction ? 'Vercel Production' : 'Local Environment'})`);
  console.log(`Timestamp:   ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // ------------------------------------------------------------------------
  // Group 1: Service Availability & Health Probe
  // ------------------------------------------------------------------------
  console.log('\n--- Group 1: Service Availability & Health Probe ---');
  try {
    const { status, json } = await fetchJson('/api/health');
    assert.equal(status, 200, `/api/health responded with HTTP ${status}`);
    assert.equal(json.status, 'ok', 'Health status is ok');
    recordResult('HEALTH-PROBE', `GET /api/health responds with 200 OK (${json.mode || 'upstash'})`, 'PASS', `Status: ${json.status}`);
  } catch (err) {
    recordResult('HEALTH-PROBE', 'GET /api/health responds with 200 OK', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 2: Target 1 Verification — Teacher t_0fa2ff7f (GIZ Group 8 English Empire)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Target 1 Verification — Teacher t_0fa2ff7f (GIZ Group 8 English Empire) ---');
  const t1 = TARGET_TEACHER_1;
  let t1DayData = null;

  // 2.1 API Endpoint Probe for Teacher 1 Day Data
  try {
    const { status, json, headers } = await fetchJson(t1.apiDayUrl);
    assert.equal(status, 200, `${t1.apiDayUrl} returned HTTP ${status}`);
    assert.equal(json.success, true, 'Day data success is true');
    t1DayData = json;
    recordResult('T1-API-DAY-DATA', `GET ${t1.apiDayUrl} returns 200 OK`, 'PASS', `Total lessons: ${json.schoolmate?.totalLessons || 0}`);
  } catch (err) {
    recordResult('T1-API-DAY-DATA', `GET ${t1.apiDayUrl} returns 200 OK`, 'FAIL', err.message);
  }

  // 2.2 Verify Absence of Misleading Duration-as-Attendance Counters (GIZ Group 8)
  try {
    assert.ok(t1DayData, 't1DayData is required');
    const gizLesson = t1DayData.schoolmate?.lessons?.find(l => l.groupId === t1.groupLesson.groupId || l.groupLessonId === t1.groupLesson.groupLessonId);
    assert.ok(gizLesson, `Lesson for group ${t1.groupLesson.groupName} found`);

    // Invariant: enrolledStudents must NOT be 9 (which was 90 min / 10)
    assert.notEqual(gizLesson.enrolledStudents, 9, `enrolledStudents is still duration-derived (9) instead of true headcount (6)`);
    assert.notEqual(gizLesson.attendedCount, 9, `attendedCount is falsely claiming 9 without per-student attendance checks`);
    recordResult('T1-NO-MISLEADING-BADGES-API', `GIZ Group 8 does NOT return duration-derived enrolledStudents (9)`, 'PASS', `enrolledStudents: ${gizLesson.enrolledStudents}`);
  } catch (err) {
    recordResult('T1-NO-MISLEADING-BADGES-API', `GIZ Group 8 does NOT return duration-derived enrolledStudents (9)`, 'FAIL', err.message);
  }

  // 2.3 Verify Accurate Headcount (6 students) in API
  try {
    assert.ok(t1DayData, 't1DayData is required');
    const gizLesson = t1DayData.schoolmate?.lessons?.find(l => l.groupId === t1.groupLesson.groupId || l.groupLessonId === t1.groupLesson.groupLessonId);
    assert.ok(gizLesson, `Lesson for group ${t1.groupLesson.groupName} found`);
    assert.equal(gizLesson.enrolledStudents, t1.groupLesson.expectedStudentCount, `enrolledStudents expected ${t1.groupLesson.expectedStudentCount}, got ${gizLesson.enrolledStudents}`);
    recordResult('T1-ENROLLED-COUNT-API', `GIZ Group 8 exposes true enrolledStudents count (${t1.groupLesson.expectedStudentCount}) in API`, 'PASS', `enrolledStudents: ${gizLesson.enrolledStudents}`);
  } catch (err) {
    recordResult('T1-ENROLLED-COUNT-API', `GIZ Group 8 exposes true enrolledStudents count (${t1.groupLesson.expectedStudentCount}) in API`, 'FAIL', err.message);
  }

  // 2.4 Verify Student Roster Array and 6 Student Names in API
  try {
    assert.ok(t1DayData, 't1DayData is required');
    const gizLesson = t1DayData.schoolmate?.lessons?.find(l => l.groupId === t1.groupLesson.groupId || l.groupLessonId === t1.groupLesson.groupLessonId);
    assert.ok(gizLesson, `Lesson for group ${t1.groupLesson.groupName} found`);
    assert.ok(Array.isArray(gizLesson.students), `gizLesson.students is not an array (got ${typeof gizLesson.students})`);
    assert.equal(gizLesson.students.length, 6, `gizLesson.students length expected 6, got ${gizLesson.students.length}`);

    const returnedNames = gizLesson.students.map(s => (typeof s === 'string' ? s : s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim()));
    for (const expectedName of t1.groupLesson.expectedStudentNames) {
      assert.ok(
        returnedNames.some(n => n.toLowerCase().includes(expectedName.toLowerCase()) || expectedName.toLowerCase().includes(n.toLowerCase())),
        `Missing expected student "${expectedName}" in students array: ${JSON.stringify(returnedNames)}`
      );
    }
    recordResult('T1-STUDENT-ROSTER-API', `GIZ Group 8 returns all 6 student names in students array`, 'PASS', `Students: ${returnedNames.join(', ')}`);
  } catch (err) {
    recordResult('T1-STUDENT-ROSTER-API', `GIZ Group 8 returns all 6 student names in students array`, 'FAIL', err.message);
  }

  // 2.5 Verify Schedule Page HTML does NOT render misleading badges
  try {
    const { status, html } = await fetchHtml(t1.scheduleQueryUrl);
    assert.equal(status, 200, `${t1.scheduleQueryUrl} returned HTTP ${status}`);

    for (const forbidden of t1.groupLesson.forbiddenStrings) {
      assert.ok(
        !html.includes(forbidden),
        `HTML contains forbidden misleading attendance string: "${forbidden}"`
      );
    }
    recordResult('T1-NO-MISLEADING-BADGES-HTML', `Schedule view HTML does NOT contain misleading duration/attendance chips`, 'PASS', 'Cleaned summary badges');
  } catch (err) {
    recordResult('T1-NO-MISLEADING-BADGES-HTML', `Schedule view HTML does NOT contain misleading duration/attendance chips`, 'FAIL', err.message);
  }

  // 2.6 Verify Day Details Page HTML renders student count and student roster names
  try {
    const { status, html } = await fetchHtml(t1.dayDetailsUrl);
    assert.equal(status, 200, `${t1.dayDetailsUrl} returned HTTP ${status}`);

    // Should contain count badge: 6 students / 6 учнів
    const hasCountBadge = html.includes('6 students') || html.includes('6 учнів') || html.includes('6 student');
    assert.ok(hasCountBadge, 'Day Details HTML does not contain "6 students" or "6 учнів" badge');

    // Should contain all 6 student names in the rendered HTML / payload
    for (const studentName of t1.groupLesson.expectedStudentNames) {
      assert.ok(
        html.includes(studentName),
        `Day Details HTML does not contain student name "${studentName}"`
      );
    }

    recordResult('T1-STUDENT-ROSTER-HTML', `Day Details view HTML renders 6 student names and count badge`, 'PASS', 'Rendered in lesson drawer payload and summary bar');
  } catch (err) {
    recordResult('T1-STUDENT-ROSTER-HTML', `Day Details view HTML renders 6 student names and count badge`, 'FAIL', err.message);
  }

  // 2.7 Verify Weekly Schedule Report API exposes enriched roster
  try {
    const reportRes = await fetch(`${TARGET_BASE_URL}/api/schoolmate/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: 6568, fromDate: '2026-09-28', toDate: '2026-10-04' })
    });
    assert.equal(reportRes.status, 200, `/api/schoolmate/report returned ${reportRes.status}`);
    const reportData = await reportRes.json();
    const gizLessonWeekly = reportData.days?.flatMap(d => d.lessons || []).find(l => l.groupId === t1.groupLesson.groupId);
    assert.ok(gizLessonWeekly, 'GIZ Group 8 found in weekly report');
    assert.equal(gizLessonWeekly.enrolledStudents, 6, `Weekly report enrolledStudents expected 6, got ${gizLessonWeekly.enrolledStudents}`);
    assert.equal(gizLessonWeekly.students?.length, 6, `Weekly report students array expected 6, got ${gizLessonWeekly.students?.length}`);
    recordResult('T1-WEEKLY-REPORT-API', `POST /api/schoolmate/report returns enriched 6-student roster for weekly view`, 'PASS', `Enriched ${gizLessonWeekly.students.length} students`);
  } catch (err) {
    recordResult('T1-WEEKLY-REPORT-API', `POST /api/schoolmate/report returns enriched 6-student roster for weekly view`, 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 3: Target 2 Verification — Teacher t_759a0536 (NovaPay A2+/2)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: Target 2 Verification — Teacher t_759a0536 (NovaPay A2+/2) ---');
  const t2 = TARGET_TEACHER_2;
  let t2DayData = null;

  // 3.1 API Endpoint Probe for Teacher 2 Day Data
  try {
    const { status, json } = await fetchJson(t2.apiDayUrl);
    assert.equal(status, 200, `${t2.apiDayUrl} returned HTTP ${status}`);
    assert.equal(json.success, true, 'Day data success is true');
    t2DayData = json;
    recordResult('T2-API-DAY-DATA', `GET ${t2.apiDayUrl} returns 200 OK`, 'PASS', `Total lessons: ${json.schoolmate?.totalLessons || 0}`);
  } catch (err) {
    recordResult('T2-API-DAY-DATA', `GET ${t2.apiDayUrl} returns 200 OK`, 'FAIL', err.message);
  }

  // 3.2 Verify Absence of Misleading Badges (NovaPay A2+/2)
  try {
    assert.ok(t2DayData, 't2DayData is required');
    const novaLesson = t2DayData.schoolmate?.lessons?.find(l => l.groupId === t2.groupLesson.groupId || l.groupLessonId === t2.groupLesson.groupLessonId);
    assert.ok(novaLesson, `Lesson for group ${t2.groupLesson.groupName} found`);

    // Invariant: enrolledStudents must NOT be 5
    assert.notEqual(novaLesson.enrolledStudents, 5, `enrolledStudents is 5 instead of true headcount (4)`);
    assert.notEqual(novaLesson.attendedCount, 5, `attendedCount is claiming 5 without individual verification`);
    recordResult('T2-NO-MISLEADING-BADGES-API', `NovaPay A2+/2 does NOT return misleading enrolledStudents (5)`, 'PASS', `enrolledStudents: ${novaLesson.enrolledStudents}`);
  } catch (err) {
    recordResult('T2-NO-MISLEADING-BADGES-API', `NovaPay A2+/2 does NOT return misleading enrolledStudents (5)`, 'FAIL', err.message);
  }

  // 3.3 Verify Accurate Headcount (4 students) in API
  try {
    assert.ok(t2DayData, 't2DayData is required');
    const novaLesson = t2DayData.schoolmate?.lessons?.find(l => l.groupId === t2.groupLesson.groupId || l.groupLessonId === t2.groupLesson.groupLessonId);
    assert.ok(novaLesson, `Lesson for group ${t2.groupLesson.groupName} found`);
    assert.equal(novaLesson.enrolledStudents, t2.groupLesson.expectedStudentCount, `enrolledStudents expected ${t2.groupLesson.expectedStudentCount}, got ${novaLesson.enrolledStudents}`);
    recordResult('T2-ENROLLED-COUNT-API', `NovaPay A2+/2 exposes true enrolledStudents count (${t2.groupLesson.expectedStudentCount}) in API`, 'PASS', `enrolledStudents: ${novaLesson.enrolledStudents}`);
  } catch (err) {
    recordResult('T2-ENROLLED-COUNT-API', `NovaPay A2+/2 exposes true enrolledStudents count (${t2.groupLesson.expectedStudentCount}) in API`, 'FAIL', err.message);
  }

  // 3.4 Verify Student Roster Array and 4 Student Names in API
  try {
    assert.ok(t2DayData, 't2DayData is required');
    const novaLesson = t2DayData.schoolmate?.lessons?.find(l => l.groupId === t2.groupLesson.groupId || l.groupLessonId === t2.groupLesson.groupLessonId);
    assert.ok(novaLesson, `Lesson for group ${t2.groupLesson.groupName} found`);
    assert.ok(Array.isArray(novaLesson.students), `novaLesson.students is not an array (got ${typeof novaLesson.students})`);
    assert.equal(novaLesson.students.length, 4, `novaLesson.students length expected 4, got ${novaLesson.students.length}`);

    const returnedNames = novaLesson.students.map(s => (typeof s === 'string' ? s : s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim()));
    for (const expectedName of t2.groupLesson.expectedStudentNames) {
      assert.ok(
        returnedNames.some(n => n.toLowerCase().includes(expectedName.toLowerCase()) || expectedName.toLowerCase().includes(n.toLowerCase())),
        `Missing expected student "${expectedName}" in students array: ${JSON.stringify(returnedNames)}`
      );
    }
    recordResult('T2-STUDENT-ROSTER-API', `NovaPay A2+/2 returns all 4 student names in students array`, 'PASS', `Students: ${returnedNames.join(', ')}`);
  } catch (err) {
    recordResult('T2-STUDENT-ROSTER-API', `NovaPay A2+/2 returns all 4 student names in students array`, 'FAIL', err.message);
  }

  // 3.5 Verify HTML renders 4 student names
  try {
    const { status, html } = await fetchHtml(t2.dayDetailsUrl);
    assert.equal(status, 200, `${t2.dayDetailsUrl} returned HTTP ${status}`);

    for (const studentName of t2.groupLesson.expectedStudentNames) {
      assert.ok(
        html.includes(studentName),
        `Day Details HTML does not contain student name "${studentName}"`
      );
    }
    recordResult('T2-STUDENT-ROSTER-HTML', `NovaPay A2+/2 Day Details HTML renders 4 student names`, 'PASS', 'Rendered in lesson drawer');
  } catch (err) {
    recordResult('T2-STUDENT-ROSTER-HTML', `NovaPay A2+/2 Day Details HTML renders 4 student names`, 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 4: Target 3 Verification — Individual Lessons Preservation
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Target 3 Verification — Individual Lessons Preservation ---');
  try {
    assert.ok(t1DayData, 't1DayData is required');
    const indLesson1 = t1DayData.schoolmate?.lessons?.find(l => l.groupId === t1.individualLesson.groupId || l.groupLessonId === t1.individualLesson.groupLessonId);
    assert.ok(indLesson1, `Individual lesson ${t1.individualLesson.groupName} found`);
    assert.equal(indLesson1.enrolledStudents, 1, `Individual lesson enrolledStudents expected 1, got ${indLesson1.enrolledStudents}`);
    assert.equal(indLesson1.isIndividual, true, `Individual lesson isIndividual expected true, got ${indLesson1.isIndividual}`);

    recordResult('T3-INDIVIDUAL-LESSONS', `1-on-1 lessons preserve enrolledStudents: 1 and isIndividual: true`, 'PASS', `${t1.individualLesson.groupName} marked as individual`);
  } catch (err) {
    recordResult('T3-INDIVIDUAL-LESSONS', `1-on-1 lessons preserve enrolledStudents: 1 and isIndividual: true`, 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 5: Target 4 Verification — Side-by-Side Day Details View & Comparison Parity
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Target 4 Verification — Side-by-Side Day Details View & Comparison Parity ---');
  try {
    assert.ok(t1DayData, 't1DayData is required');
    assert.ok(t1DayData.schoolmate, 'Schoolmate section present in day data');
    assert.ok(t1DayData.zoom, 'Zoom section present in day data');
    assert.ok(Array.isArray(t1DayData.schoolmate.lessons), 'Schoolmate lessons is an array');
    assert.ok(Array.isArray(t1DayData.zoom.meetings), 'Zoom meetings is an array');

    // Also check cross-source parity for teacher t_759a0536 on 2026-09-25
    const { json: day25Data } = await fetchJson('/api/teachers/t_759a0536/days/2026-09-25');
    assert.equal(day25Data.success, true);
    assert.ok(day25Data.schoolmate?.lessons?.length > 0, 'Schoolmate lessons present on 2026-09-25');
    assert.ok(day25Data.zoom?.meetings?.length > 0, 'Zoom meetings present on 2026-09-25');

    recordResult('T4-SIDE-BY-SIDE-PARITY', `Day Details API returns dual Schoolmate and Zoom structures for side-by-side verification`, 'PASS', `SM Lessons: ${t1DayData.schoolmate.lessons.length}, Zoom State: ${t1DayData.zoom.state} (Verified 2026-09-25 with ${day25Data.zoom.meetings.length} live Zoom meetings)`);
  } catch (err) {
    recordResult('T4-SIDE-BY-SIDE-PARITY', `Day Details API returns dual Schoolmate and Zoom structures for side-by-side verification`, 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 6: API Contract & Cache Headers
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: API Contract & Cache Headers ---');
  try {
    const { headers } = await fetchJson(t1.apiDayUrl);
    const cacheControl = headers.get('cache-control') || '';
    assert.match(cacheControl, /no-store/, `Cache-Control header should include no-store (got "${cacheControl}")`);
    recordResult('API-CACHE-HEADERS', `Teacher day API returns Cache-Control: no-store, private`, 'PASS', cacheControl);
  } catch (err) {
    recordResult('API-CACHE-HEADERS', `Teacher day API returns Cache-Control: no-store, private`, 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Summary & Evidence Export
  // ------------------------------------------------------------------------
  console.log('\n========================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const blockedCount = results.filter(r => r.status === 'BLOCKED').length;

  console.log(`E2E EXECUTION SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${blockedCount} BLOCKED`);
  console.log('========================================================================\n');

  const evidenceDir = path.resolve(process.cwd(), 'verification/evidence');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

  const evidenceFileName = isProduction ? 'crm-013-vercel-evidence.json' : 'crm-013-local-evidence.json';
  const evidenceFilePath = path.join(evidenceDir, evidenceFileName);

  const evidencePayload = {
    story: 'CRM-013',
    targetUrl: TARGET_BASE_URL,
    environment: isProduction ? 'Vercel Production' : 'Local Environment',
    testedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: passCount,
      failed: failCount,
      blocked: blockedCount
    },
    results
  };

  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidencePayload, null, 2), 'utf-8');
  console.log(`📁 Saved verification evidence to: ${evidenceFilePath}\n`);

  if (failCount > 0) {
    console.error(`❌ Verification suite failed with ${failCount} failing checks.`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('\n❌ E2E Verification failed with fatal error:', err);
  process.exit(1);
});
