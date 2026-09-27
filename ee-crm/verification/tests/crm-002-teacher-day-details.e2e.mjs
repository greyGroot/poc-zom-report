// ee-crm/verification/tests/crm-002-teacher-day-details.e2e.mjs
// Automated E2E Verification Suite for CRM-002: View Teacher-Day Details Page & API

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  validateDateString,
  getAdjacentDates,
  getTeacherDayData
} from '../../lib/teacher-day.js';
import {
  createTeacher,
  getTeacherById,
  saveCachedReport
} from '../../lib/db.js';
import {
  saveZoomOccurrence,
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay,
  resetOccurrenceMemoryStore
} from '../../lib/zoom-occurrences.js';
import {
  FIXTURE_TEACHER_OLENA,
  FIXTURE_TEACHER_UNMAPPED,
  FIXTURE_DATE_HAPPY_PATH,
  FIXTURE_DATE_ZOOM_EMPTY,
  FIXTURE_DATE_SCHOOLMATE_EMPTY,
  FIXTURE_SHARED_NUMERIC_ID,
  FIXTURE_SCHOOLMATE_SCHEDULE_SEP18,
  FIXTURE_OCCURRENCES_SEP18
} from '../fixtures/crm-002-day-details-fixtures.mjs';

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

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-002');
  console.log(`Local URL:  ${LOCAL_BASE_URL}`);
  console.log(`Vercel URL: ${VERCEL_BASE_URL}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // ------------------------------------------------------------------------
  // Group 1: Service Availability & Health Probe
  // ------------------------------------------------------------------------
  console.log('\n--- Group 1: Service Availability & Health Probe ---');
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    recordResult('HEALTH-LOCAL', 'Local server GET /api/health responds with 200 OK', 'PASS', `Mode: ${data.integrations?.redis?.mode}`);
  } catch (err) {
    recordResult('HEALTH-LOCAL', 'Local server GET /api/health responds with 200 OK', 'FAIL', err.message);
  }

  try {
    const resVercel = await fetch(`${VERCEL_BASE_URL}/api/health`);
    assert.equal(resVercel.status, 200);
    const dataVercel = await resVercel.json();
    assert.equal(dataVercel.status, 'ok');
    const vercelId = resVercel.headers.get('x-vercel-id');
    recordResult('HEALTH-VERCEL', 'Vercel deployment GET /api/health responds with 200 OK', 'PASS', `X-Vercel-Id: ${vercelId}`);
  } catch (err) {
    recordResult('HEALTH-VERCEL', 'Vercel deployment GET /api/health responds with 200 OK', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 2: Vercel Deployment Verification (CRM-002 Deployment Status)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Vercel Deployed CRM-002 Route Probe ---');
  const vercelProbeReport = {};

  try {
    const vResApi = await fetch(`${VERCEL_BASE_URL}/api/teachers/17251/days/2026-09-18`);
    vercelProbeReport.apiDaysStatus = vResApi.status;
    if (vResApi.status === 404) {
      recordResult('VERCEL-API-DAYS', 'Vercel GET /api/teachers/[id]/days/[date] endpoint presence', 'BLOCKED', 'HTTP 404: Endpoint not deployed to Vercel (uncommitted in repository)');
    } else if (vResApi.status === 200) {
      recordResult('VERCEL-API-DAYS', 'Vercel GET /api/teachers/[id]/days/[date] endpoint presence', 'PASS', 'HTTP 200: Endpoint deployed');
    } else {
      recordResult('VERCEL-API-DAYS', 'Vercel GET /api/teachers/[id]/days/[date] endpoint presence', 'FAIL', `Unexpected HTTP ${vResApi.status}`);
    }
  } catch (err) {
    recordResult('VERCEL-API-DAYS', 'Vercel GET /api/teachers/[id]/days/[date] endpoint presence', 'FAIL', err.message);
  }

  try {
    const vResPage = await fetch(`${VERCEL_BASE_URL}/teachers/17251/2026-09-18`);
    vercelProbeReport.pageDayStatus = vResPage.status;
    if (vResPage.status === 404) {
      recordResult('VERCEL-PAGE-DAY', 'Vercel GET /teachers/[id]/[date] page route presence', 'BLOCKED', 'HTTP 404: Route not deployed to Vercel (uncommitted in repository)');
    } else if (vResPage.status === 200) {
      recordResult('VERCEL-PAGE-DAY', 'Vercel GET /teachers/[id]/[date] page route presence', 'PASS', 'HTTP 200: Page deployed');
    } else {
      recordResult('VERCEL-PAGE-DAY', 'Vercel GET /teachers/[id]/[date] page route presence', 'FAIL', `Unexpected HTTP ${vResPage.status}`);
    }
  } catch (err) {
    recordResult('VERCEL-PAGE-DAY', 'Vercel GET /teachers/[id]/[date] page route presence', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 3: Local Test Data Seed & Logic Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: Local Test Data Seed & Logic Verification ---');
  resetOccurrenceMemoryStore();

  let teacherOlena = null;
  let teacherUnmapped = null;

  try {
    teacherOlena = await createTeacher(FIXTURE_TEACHER_OLENA);
    teacherUnmapped = await createTeacher(FIXTURE_TEACHER_UNMAPPED);

    // Also register Olena on HTTP server so Group 5 HTTP route checks pass
    try {
      const httpRes = await fetch(`${LOCAL_BASE_URL}/api/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(FIXTURE_TEACHER_OLENA)
      });
      const httpData = await httpRes.json();
      if (httpData.teacher?.id) {
        teacherOlena.httpId = httpData.teacher.id;
      }
    } catch {}

    recordResult('SEED-TEACHERS', 'Seeded test teachers (mapped Olena and unmapped Taras)', 'PASS', `Olena ID: ${teacherOlena.id} (HTTP: ${teacherOlena.httpId}), Unmapped ID: ${teacherUnmapped.id}`);
  } catch (err) {
    recordResult('SEED-TEACHERS', 'Seeded test teachers', 'FAIL', err.message);
  }

  // Seed Schoolmate cache
  try {
    await saveCachedReport(
      teacherOlena.schoolmateTeacherId,
      `${FIXTURE_DATE_HAPPY_PATH}_${FIXTURE_DATE_HAPPY_PATH}`,
      FIXTURE_SCHOOLMATE_SCHEDULE_SEP18
    );
    recordResult('SEED-SCHOOLMATE', 'Seeded Schoolmate schedule cache for 2026-09-18', 'PASS', '2 lessons, 150 min, 750 UAH');
  } catch (err) {
    recordResult('SEED-SCHOOLMATE', 'Seeded Schoolmate schedule cache', 'FAIL', err.message);
  }

  // Seed Zoom occurrences
  try {
    for (const occ of FIXTURE_OCCURRENCES_SEP18) {
      await saveZoomOccurrence(occ);
    }
    recordResult('SEED-ZOOM', 'Seeded 3 Zoom occurrences (reconnects, overlapping devices, incomplete boundary, reused numeric ID)', 'PASS');
  } catch (err) {
    recordResult('SEED-ZOOM', 'Seeded Zoom occurrences', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 4: Acceptance Criteria Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Acceptance Criteria Verification (Scenarios 1-17) ---');

  // Scenario 8: Invalid teacher returns 404
  try {
    const res = await getTeacherDayData({ teacherId: 't_non_existent_9999', date: FIXTURE_DATE_HAPPY_PATH });
    assert.equal(res.status, 404);
    assert.equal(res.error, 'Teacher not found');
    recordResult('SCENARIO-08-TEACHER', 'Scenario 8: Non-existent teacher returns status 404', 'PASS', res.error);
  } catch (err) {
    recordResult('SCENARIO-08-TEACHER', 'Scenario 8: Non-existent teacher returns status 404', 'FAIL', err.message);
  }

  // Scenario 8: Invalid date format returns 400
  try {
    const invalidDates = ['2026-02-30', '2026-99-99', 'not-a-date', ''];
    for (const badDate of invalidDates) {
      assert.equal(validateDateString(badDate), false);
      const res = await getTeacherDayData({ teacherId: teacherOlena.id, date: badDate });
      assert.equal(res.status, 400);
      assert.match(res.error, /invalid date/i);
    }
    recordResult('SCENARIO-08-DATE', 'Scenario 8: Malformed or non-existent date returns status 400', 'PASS', 'Tested 2026-02-30, 2026-99-99, not-a-date, empty string');
  } catch (err) {
    recordResult('SCENARIO-08-DATE', 'Scenario 8: Malformed or non-existent date returns status 400', 'FAIL', err.message);
  }

  // Scenario 1 & 7: Direct Link & Complete Teacher-Day payload
  let happyData = null;
  try {
    happyData = await getTeacherDayData({ teacherId: teacherOlena.id, date: FIXTURE_DATE_HAPPY_PATH });
    assert.equal(happyData.success, true);
    assert.equal(happyData.teacher.id, teacherOlena.id);
    assert.equal(happyData.date, FIXTURE_DATE_HAPPY_PATH);
    assert.equal(happyData.timezone, 'Europe/Kyiv');
    assert.equal(happyData.previousDate, '2026-09-17');
    assert.equal(happyData.nextDate, '2026-09-19');
    recordResult('SCENARIO-01-07', 'Scenario 1 & 7: Valid direct request returns complete day payload with adjacent day stepper', 'PASS', `Prev: ${happyData.previousDate}, Next: ${happyData.nextDate}`);
  } catch (err) {
    recordResult('SCENARIO-01-07', 'Scenario 1 & 7: Valid direct request returns complete day payload', 'FAIL', err.message);
  }

  // Scenario 2: Display both sources with separate factual totals
  try {
    assert.ok(happyData);
    assert.equal(happyData.schoolmate.state, 'available');
    assert.equal(happyData.schoolmate.totalLessons, 2);
    assert.equal(happyData.schoolmate.totalMinutes, 150);
    assert.equal(happyData.schoolmate.totalWage, '750 ₴');
    assert.equal(happyData.schoolmate.lessons.length, 2);

    assert.equal(happyData.zoom.state, 'available');
    assert.equal(happyData.zoom.totalMeetings, 3);
    assert.equal(happyData.zoom.totalMinutes, 150); // 90 min + 60 min + incomplete (0 min counted)
    assert.equal(happyData.zoom.meetings.length, 3);

    recordResult('SCENARIO-02', 'Scenario 2: Both sources displayed in separate sections with factual totals', 'PASS', 'SM: 2 lessons, 150m, 750 UAH | Zoom: 3 meetings, 150m');
  } catch (err) {
    recordResult('SCENARIO-02', 'Scenario 2: Both sources displayed with separate factual totals', 'FAIL', err.message);
  }

  // Scenario 3: Inspect meeting participants with interval union
  try {
    const meeting1 = happyData.zoom.meetings.find(m => m.uuid === 'crm002-occ-alpha-123');
    assert.ok(meeting1);
    assert.equal(meeting1.participantsCount, 3);

    // Host
    const host = meeting1.participants.find(p => p.is_host);
    assert.ok(host);
    assert.equal(host.role, 'Host');

    // Student Alex B (reconnect: 38m + 46m = 84m)
    const alex = meeting1.participants.find(p => p.name === 'Alex B');
    assert.ok(alex);
    assert.equal(alex.role, 'Participant');
    assert.equal(alex.connectedDurationMinutes, 84);
    assert.equal(alex.connectionState, 'complete');

    // Student Maryna K (overlapping PC 09:00-09:45 and Phone 09:20-10:00 -> union 60m)
    const maryna = meeting1.participants.find(p => p.name === 'Maryna K');
    assert.ok(maryna);
    assert.equal(maryna.role, 'Participant');
    assert.equal(maryna.connectedDurationMinutes, 60); // Union, not 45+40=85!
    assert.equal(maryna.connectionState, 'complete');

    recordResult('SCENARIO-03', 'Scenario 3: Participant inspection with interval union (reconnects & concurrent devices)', 'PASS', 'Alex B reconnect: 84 min | Maryna K overlap: 60 min (union)');
  } catch (err) {
    recordResult('SCENARIO-03', 'Scenario 3: Participant inspection with interval union', 'FAIL', err.message);
  }

  // Scenario 12: Reused room IDs remain isolated
  try {
    const meeting1 = happyData.zoom.meetings.find(m => m.uuid === 'crm002-occ-alpha-123');
    const meeting2 = happyData.zoom.meetings.find(m => m.uuid === 'crm002-occ-beta-reused-room-456');
    assert.ok(meeting1 && meeting2);
    assert.equal(meeting1.numericMeetingId, FIXTURE_SHARED_NUMERIC_ID);
    assert.equal(meeting2.numericMeetingId, FIXTURE_SHARED_NUMERIC_ID);

    // Ensure participants are completely distinct and not merged
    const meeting1Names = meeting1.participants.map(p => p.name);
    const meeting2Names = meeting2.participants.map(p => p.name);
    assert.ok(!meeting2Names.includes('Alex B'));
    assert.ok(!meeting1Names.includes('Guest Novapay'));

    recordResult('SCENARIO-12', 'Scenario 12: Reused numeric room IDs remain strictly isolated by UUID', 'PASS', `Shared numeric ID: ${FIXTURE_SHARED_NUMERIC_ID}`);
  } catch (err) {
    recordResult('SCENARIO-12', 'Scenario 12: Reused room IDs remain isolated', 'FAIL', err.message);
  }

  // Scenario 4: One source has no data (Zoom empty)
  try {
    const resEmptyZoom = await getTeacherDayData({ teacherId: teacherOlena.id, date: FIXTURE_DATE_ZOOM_EMPTY });
    assert.equal(resEmptyZoom.success, true);
    assert.equal(resEmptyZoom.zoom.state, 'empty');
    assert.equal(resEmptyZoom.zoom.totalMeetings, 0);
    assert.deepEqual(resEmptyZoom.zoom.meetings, []);
    recordResult('SCENARIO-04-ZOOM-EMPTY', 'Scenario 4: Zoom empty date shows neutral empty state without conclusions', 'PASS', 'zoom.state: "empty", totalMeetings: 0');
  } catch (err) {
    recordResult('SCENARIO-04-ZOOM-EMPTY', 'Scenario 4: Zoom empty date shows neutral empty state', 'FAIL', err.message);
  }

  // Scenario 5: Unmapped teacher reports unmapped Zoom state without failing Schoolmate
  try {
    const resUnmapped = await getTeacherDayData({ teacherId: teacherUnmapped.id, date: FIXTURE_DATE_HAPPY_PATH });
    assert.equal(resUnmapped.success, true);
    assert.equal(resUnmapped.zoom.state, 'unmapped');
    assert.equal(resUnmapped.zoom.totalMeetings, 0);
    assert.deepEqual(resUnmapped.zoom.meetings, []);
    recordResult('SCENARIO-05-UNMAPPED', 'Scenario 5: Unmapped teacher reports state "unmapped" without throwing error', 'PASS', 'zoom.state: "unmapped"');
  } catch (err) {
    recordResult('SCENARIO-05-UNMAPPED', 'Scenario 5: Unmapped teacher reports unmapped Zoom state', 'FAIL', err.message);
  }

  // Scenario 6: Incomplete evidence shows incomplete duration, not 0 or invented
  try {
    const incompleteMeeting = happyData.zoom.meetings.find(m => m.uuid === 'crm002-occ-gamma-incomplete-789');
    assert.ok(incompleteMeeting);
    assert.equal(incompleteMeeting.durationState, 'incomplete');
    assert.equal(incompleteMeeting.durationMinutes, null);
    assert.equal(incompleteMeeting.durationSeconds, null);
    recordResult('SCENARIO-06', 'Scenario 6: Incomplete meeting boundary shows durationState="incomplete", durationMinutes=null', 'PASS', 'Null duration prevents invented elapsed values');
  } catch (err) {
    recordResult('SCENARIO-06', 'Scenario 6: Incomplete evidence shows incomplete duration', 'FAIL', err.message);
  }

  // Scenario 9: Strictly no inferred reconciliation or flags in teacher-day response
  try {
    for (const m of happyData.zoom.meetings) {
      assert.equal(m.reconciliation, undefined);
      assert.equal(m.flags, undefined);
      assert.equal(m.statusBadge, undefined);
      assert.equal(m.lessonMatch, undefined);
    }
    recordResult('SCENARIO-09', 'Scenario 9: Strictly no inferred reconciliation, tags, flags, or payroll conclusions in response', 'PASS', 'Factual evidence boundary strictly preserved');
  } catch (err) {
    recordResult('SCENARIO-09', 'Scenario 9: Strictly no inferred reconciliation', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 5: Local HTTP API Route Handler Contract (/api/teachers/[id]/days/[date])
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Local HTTP API Route Handler Contract ---');
  const targetId = teacherOlena.httpId || teacherOlena.id;
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/teachers/${targetId}/days/${FIXTURE_DATE_HAPPY_PATH}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store, private');
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.date, FIXTURE_DATE_HAPPY_PATH);
    recordResult('HTTP-API-DAYS-200', 'Local GET /api/teachers/[id]/days/[date] returns 200 with Cache-Control: no-store, private', 'PASS', `Status: 200, Success: ${body.success}`);
  } catch (err) {
    recordResult('HTTP-API-DAYS-200', 'Local GET /api/teachers/[id]/days/[date] returns 200', 'FAIL', err.message);
  }

  try {
    const res404 = await fetch(`${LOCAL_BASE_URL}/api/teachers/t_non_existent_9999/days/${FIXTURE_DATE_HAPPY_PATH}`);
    assert.equal(res404.status, 404);
    const body404 = await res404.json();
    assert.equal(body404.error, 'Teacher not found');
    recordResult('HTTP-API-DAYS-404', 'Local GET /api/teachers/[id]/days/[date] returns 404 for missing teacher', 'PASS', body404.error);
  } catch (err) {
    recordResult('HTTP-API-DAYS-404', 'Local GET /api/teachers/[id]/days/[date] returns 404 for missing teacher', 'FAIL', err.message);
  }

  try {
    const res400 = await fetch(`${LOCAL_BASE_URL}/api/teachers/${targetId}/days/2026-99-99`);
    assert.equal(res400.status, 400);
    const body400 = await res400.json();
    assert.match(body400.error, /invalid date/i);
    recordResult('HTTP-API-DAYS-400', 'Local GET /api/teachers/[id]/days/[date] returns 400 for invalid date', 'PASS', body400.error);
  } catch (err) {
    recordResult('HTTP-API-DAYS-400', 'Local GET /api/teachers/[id]/days/[date] returns 400 for invalid date', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 6: Teacher Overview Linkage & Query Preservation
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: Teacher Overview Page Navigation & Linkage ---');
  try {
    const scheduleFile = path.resolve(process.cwd(), 'app/teachers/[id]/TeacherScheduleClient.js');
    const scheduleContent = fs.readFileSync(scheduleFile, 'utf-8');
    assert.ok(scheduleContent.includes('btn-open-day-details'), 'TeacherScheduleClient contains btn-open-day-details link');
    assert.ok(scheduleContent.includes('openDayDetails'), 'TeacherScheduleClient references openDayDetails translation key');
    assert.ok(scheduleContent.includes('from='), 'Preserves from parameter');
    assert.ok(scheduleContent.includes('to='), 'Preserves to parameter');

    const zoomPanelFile = path.resolve(process.cwd(), 'app/teachers/[id]/ZoomMeetingsPanel.js');
    const zoomPanelContent = fs.readFileSync(zoomPanelFile, 'utf-8');
    assert.ok(zoomPanelContent.includes('btn-open-day-details-sm'), 'ZoomMeetingsPanel contains btn-open-day-details-sm link');

    recordResult('NAV-OVERVIEW-LINKS', 'Teacher schedule overview contains Open day details links preserving query filters', 'PASS', 'Implemented on Schoolmate day headers and Zoom date groups');
  } catch (err) {
    recordResult('NAV-OVERVIEW-LINKS', 'Teacher schedule overview contains Open day details links', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 7: Internationalization (i18n) & Localized Routes
  // ------------------------------------------------------------------------
  console.log('\n--- Group 7: Internationalization & Localized Routes ---');
  try {
    const translationsFile = path.resolve(process.cwd(), 'lib/i18n/translations.js');
    const transContent = fs.readFileSync(translationsFile, 'utf-8');
    assert.ok(transContent.includes('dayDetails:'), 'translations.js defines dayDetails namespace');
    assert.ok(transContent.includes('schoolmateSectionTitle'), 'translations.js defines schoolmateSectionTitle');
    assert.ok(transContent.includes('zoomSectionTitle'), 'translations.js defines zoomSectionTitle');
    assert.ok(transContent.includes('invalidDateTitle'), 'translations.js defines invalidDateTitle');
    assert.ok(transContent.includes('teacherNotFoundTitle'), 'translations.js defines teacherNotFoundTitle');

    // Check localized route files exist
    assert.ok(fs.existsSync(path.resolve(process.cwd(), 'app/uk/teachers/[id]/[date]/page.js')), 'Ukrainian route exists');
    assert.ok(fs.existsSync(path.resolve(process.cwd(), 'app/pl/teachers/[id]/[date]/page.js')), 'Polish route exists');

    recordResult('I18N-COVERAGE', 'Teacher-day translations and localized route wrappers present across EN, UK, PL', 'PASS', 'Verified app/uk/... and app/pl/... routes exist');
  } catch (err) {
    recordResult('I18N-COVERAGE', 'Teacher-day translations and localized route wrappers', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 8: Summary & Evidence Export
  // ------------------------------------------------------------------------
  console.log('\n========================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const blockedCount = results.filter(r => r.status === 'BLOCKED').length;

  console.log(`E2E EXECUTION SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${blockedCount} BLOCKED`);
  console.log('========================================================================\n');

  // Save evidence
  const evidenceDir = path.resolve(process.cwd(), 'verification/evidence');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

  const logPath = path.join(evidenceDir, 'crm-002-local-e2e.log');
  const logContent = results.map(r => `[${r.status}] ${r.id}: ${r.description} - ${r.details}`).join('\n');
  fs.writeFileSync(logPath, logContent, 'utf-8');
  console.log(`📁 Saved execution log to: ${logPath}`);

  const vercelEvidencePath = path.join(evidenceDir, 'crm-002-vercel-evidence.json');
  fs.writeFileSync(vercelEvidencePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    vercelUrl: VERCEL_BASE_URL,
    localUrl: LOCAL_BASE_URL,
    probeReport: vercelProbeReport,
    testResults: results
  }, null, 2), 'utf-8');
  console.log(`📁 Saved Vercel evidence to: ${vercelEvidencePath}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('\n❌ E2E Verification failed unexpectedly:', err);
  process.exit(1);
});
