// ee-crm/verification/tests/crm-001-zoom-meetings.e2e.mjs
// Automated E2E Verification Suite for CRM-001: Display tracked Zoom meetings on teacher page

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { encode } from 'next-auth/jwt';
import {
  saveZoomOccurrence,
  getZoomOccurrence,
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay,
  calculateIntervalUnionSeconds,
  toSafeOccurrenceId,
  fromSafeOccurrenceId,
  resetOccurrenceMemoryStore
} from '../../lib/infrastructure/zoom-occurrences.js';
import {
  FIXTURE_TEACHER_YULIIA,
  FIXTURE_TEACHER_UNMAPPED,
  SHARED_ROOM_NUMERIC_ID,
  FIXTURE_OCCURRENCES
} from '../fixtures/crm-001-zoom-fixtures.mjs';
import { createTeacher, deleteTeacher } from '../../lib/infrastructure/db.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const LOCAL_BASE_URL = 'http://localhost:3000';
const VERCEL_BASE_URL = 'https://poc-zom-report-2qvs.vercel.app';
const SECRET = process.env.NEXTAUTH_SECRET || 'secret';

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-001');
  console.log(`Local URL:  ${LOCAL_BASE_URL}`);
  console.log(`Vercel URL: ${VERCEL_BASE_URL}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // Authenticated test token
  const testUserToken = {
    name: 'QA Automation Lead',
    email: 'qa.lead@empire.eu',
    sub: 'qa-user-crm-001',
    id: 'qa-user-crm-001'
  };
  const sessionToken = await encode({ token: testUserToken, secret: SECRET });
  const authHeaders = {
    Cookie: `next-auth.session-token=${sessionToken}`,
    'Content-Type': 'application/json'
  };

  // ------------------------------------------------------------------------
  // 1. Service Availability & Health Probe
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
  // 2. Authentication Protection & Bypass (AC-10, AC-11)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Authentication Protection & Bypass Verification (AC-10, AC-11) ---');
  try {
    const unauthRes = await fetch(`${LOCAL_BASE_URL}/api/teachers`, { redirect: 'manual' });
    const location = unauthRes.headers.get('location');
    assert.equal(unauthRes.status, 307);
    assert.ok(location?.includes('/login'));
    recordResult('AC-11-LOCAL', 'Authentication active: unauthenticated requests redirect to /login', 'PASS', `HTTP ${unauthRes.status} -> ${location}`);
  } catch (err) {
    recordResult('AC-11-LOCAL', 'Authentication active: unauthenticated requests redirect to /login', 'FAIL', err.message);
  }

  try {
    const unauthVercel = await fetch(`${VERCEL_BASE_URL}/api/teachers`, { redirect: 'manual' });
    const locVercel = unauthVercel.headers.get('location');
    assert.equal(unauthVercel.status, 307);
    assert.ok(locVercel?.includes('/login'));
    recordResult('AC-11-VERCEL', 'Vercel production enforces NextAuth protection redirect to /login', 'PASS', `HTTP ${unauthVercel.status} -> ${locVercel}`);
  } catch (err) {
    recordResult('AC-11-VERCEL', 'Vercel production enforces NextAuth protection redirect to /login', 'FAIL', err.message);
  }

  try {
    const proxyPath = path.resolve(process.cwd(), 'proxy.js');
    const middlewarePath = path.resolve(process.cwd(), 'middleware.js');
    const authFilePath = fs.existsSync(proxyPath) ? proxyPath : middlewarePath;
    const middlewareSrc = fs.readFileSync(authFilePath, 'utf-8');
    const hasBypass = middlewareSrc.includes('process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS');
    assert.ok(hasBypass, 'Proxy/Middleware must handle NEXT_PUBLIC_EE_CRM_AUTH_BYPASS');
    recordResult('AC-10', 'Authentication bypass logic implemented in middleware for automated E2E', 'PASS', 'process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS checked in authorized callback');
  } catch (err) {
    recordResult('AC-10', 'Authentication bypass logic implemented in middleware for automated E2E', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 3. HTTP Teacher Setup via API
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: HTTP Teacher & API Route Contracts ---');
  let teacherYuliia = null;
  let teacherUnmapped = null;

  try {
    const resCreate = await fetch(`${LOCAL_BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(FIXTURE_TEACHER_YULIIA)
    });
    assert.equal(resCreate.status, 201);
    const body = await resCreate.json();
    teacherYuliia = body.teacher;
    assert.ok(teacherYuliia?.id);
    recordResult('TEACHER-SETUP-01', 'POST /api/teachers creates mapped teacher', 'PASS', `ID: ${teacherYuliia.id}`);
  } catch (err) {
    recordResult('TEACHER-SETUP-01', 'POST /api/teachers creates mapped teacher', 'FAIL', err.message);
  }

  // AC-8 and API route validation
  if (teacherYuliia) {
    try {
      const res404 = await fetch(`${LOCAL_BASE_URL}/api/teachers/non_existent_teacher_999/zoom-meetings?from=2026-09-14&to=2026-09-20`, {
        headers: authHeaders
      });
      assert.equal(res404.status, 404);
      recordResult('AC-8-404', 'Non-existent teacher returns HTTP 404', 'PASS');
    } catch (err) {
      recordResult('AC-8-404', 'Non-existent teacher returns HTTP 404', 'FAIL', err.message);
    }

    try {
      const resNoDates = await fetch(`${LOCAL_BASE_URL}/api/teachers/${teacherYuliia.id}/zoom-meetings`, {
        headers: authHeaders
      });
      assert.equal(resNoDates.status, 400);
      recordResult('AC-8-MISSING-DATES', 'Missing date parameters returns HTTP 400', 'PASS');
    } catch (err) {
      recordResult('AC-8-MISSING-DATES', 'Missing date parameters returns HTTP 400', 'FAIL', err.message);
    }

    try {
      const resInverted = await fetch(`${LOCAL_BASE_URL}/api/teachers/${teacherYuliia.id}/zoom-meetings?from=2026-09-20&to=2026-09-14`, {
        headers: authHeaders
      });
      assert.equal(resInverted.status, 400);
      recordResult('AC-8-INVERTED-DATES', 'Inverted date range returns HTTP 400', 'PASS');
    } catch (err) {
      recordResult('AC-8-INVERTED-DATES', 'Inverted date range returns HTTP 400', 'FAIL', err.message);
    }

    try {
      const resEmpty = await fetch(`${LOCAL_BASE_URL}/api/teachers/${teacherYuliia.id}/zoom-meetings?from=2025-01-01&to=2025-01-07`, {
        headers: authHeaders
      });
      assert.equal(resEmpty.status, 200);
      const data = await resEmpty.json();
      assert.equal(data.totalMeetings, 0);
      assert.deepEqual(data.meetings, []);
      recordResult('AC-7', 'Neutral empty result returned with HTTP 200 when no meetings in period', 'PASS', 'totalMeetings=0, meetings=[]');
    } catch (err) {
      recordResult('AC-7', 'Neutral empty result returned with HTTP 200 when no meetings in period', 'FAIL', err.message);
    }
  }

  // ------------------------------------------------------------------------
  // 4. Core Occurrence Logic & Acceptance Criteria (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Authoritative Occurrence Storage & Business Rules ---');
  resetOccurrenceMemoryStore();

  // Ingest test fixtures
  for (const occ of FIXTURE_OCCURRENCES) {
    await saveZoomOccurrence(occ);
  }

  // AC-1: Display meetings for the selected period without tags
  try {
    const list = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'yuliasavchuk03@gmail.com',
      teacherEmail: 'yuliasavchuk03@gmail.com',
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });
    const formatted = list.map(formatOccurrenceForDisplay);
    assert.equal(formatted.length, 4);
    assert.ok(formatted.every(m => !m.flags && !m.reconciliationTag && !m.business_status && !m.riskLabel));
    recordResult('AC-1', 'Scenario 1: Display meetings for selected period without reconciliation tags', 'PASS', `${formatted.length} occurrences returned cleanly`);
  } catch (err) {
    recordResult('AC-1', 'Scenario 1: Display meetings for selected period without tags', 'FAIL', err.message);
  }

  // BUG-02 Fix: Unmapped Teacher Host Privacy Isolation
  try {
    const leaked = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: '',
      teacherEmail: '',
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });
    assert.equal(leaked.length, 0, 'Must return 0 meetings for unmapped teacher');
    recordResult('BUG-02-FIX', 'Unmapped teacher returns 0 meetings without leaking other teachers (BUG-02 resolved)', 'PASS');
  } catch (err) {
    recordResult('BUG-02-FIX', 'Unmapped teacher returns 0 meetings without leaking other teachers', 'FAIL', err.message);
  }

  // AC-2: Change the period
  try {
    const listWeek2 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'yuliasavchuk03@gmail.com',
      fromDate: '2026-09-21',
      toDate: '2026-09-27'
    });
    assert.equal(listWeek2.length, 1);
    assert.equal(listWeek2[0].uuid, 'zoom_uuid_occ_004_next_week');
    recordResult('AC-2', 'Scenario 2: Period change filters meetings strictly by selected inclusive range', 'PASS', 'Found 1 occurrence in Week 2');
  } catch (err) {
    recordResult('AC-2', 'Scenario 2: Period change filters meetings strictly by selected inclusive range', 'FAIL', err.message);
  }

  // AC-3: Reused numeric meeting ID
  try {
    const o1 = await getZoomOccurrence('zoom_uuid_occ_001_kyiv_sep14');
    const o2 = await getZoomOccurrence('zoom_uuid_occ_002_kyiv_sep15');
    assert.equal(o1.numeric_meeting_id, o2.numeric_meeting_id);
    assert.notEqual(o1.uuid, o2.uuid);
    assert.ok(o1.participants.student1 && !o1.participants.student2);
    assert.ok(o2.participants.student2 && !o2.participants.student1);
    recordResult('AC-3', 'Scenario 3: Separate occurrences sharing numeric meeting ID are not merged', 'PASS', `Shared numeric ID: ${o1.numeric_meeting_id}`);
  } catch (err) {
    recordResult('AC-3', 'Scenario 3: Separate occurrences sharing numeric meeting ID are not merged', 'FAIL', err.message);
  }

  // AC-4: Duplicate events / idempotency
  try {
    const before = await getZoomOccurrence('zoom_uuid_occ_001_kyiv_sep14');
    await saveZoomOccurrence({
      uuid: 'zoom_uuid_occ_001_kyiv_sep14',
      numeric_meeting_id: SHARED_ROOM_NUMERIC_ID,
      topic: 'Alena Medvedieva Sushi Icons [GE, English]',
      host_email: 'yuliasavchuk03@gmail.com',
      participants: {
        student1: {
          name: 'Alena Medvedieva',
          email: 'alena@example.com',
          sessions: [{ join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }]
        }
      }
    }, { merge: true });
    const after = await getZoomOccurrence('zoom_uuid_occ_001_kyiv_sep14');
    assert.equal(after.participants.student1.sessions.length, before.participants.student1.sessions.length);
    recordResult('AC-4', 'Scenario 4: Replayed event does not duplicate sessions or inflate duration', 'PASS');
  } catch (err) {
    recordResult('AC-4', 'Scenario 4: Replayed event does not duplicate sessions or inflate duration', 'FAIL', err.message);
  }

  // AC-5: Participant connected time (reconnects & overlap union)
  try {
    const reconnectSessions = [
      { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:10:00Z' },
      { join_time: '2026-09-14T08:15:00Z', leave_time: '2026-09-14T08:30:00Z' },
      { join_time: '2026-09-14T08:35:00Z', leave_time: '2026-09-14T08:55:00Z' }
    ];
    assert.equal(calculateIntervalUnionSeconds(reconnectSessions), 2700);

    const overlapSessions = [
      { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:50:00Z' },
      { join_time: '2026-09-14T08:20:00Z', leave_time: '2026-09-14T08:40:00Z' }
    ];
    assert.equal(calculateIntervalUnionSeconds(overlapSessions), 3000);
    recordResult('AC-5', 'Scenario 5: Participant connected time accurately unions reconnects and overlaps', 'PASS', '2700s reconnect union, 3000s overlap union');
  } catch (err) {
    recordResult('AC-5', 'Scenario 5: Participant connected time accurately unions reconnects and overlaps', 'FAIL', err.message);
  }

  // AC-6 & BUG-03: Incomplete duration
  try {
    const oInc = await getZoomOccurrence('zoom_uuid_occ_003_incomplete');
    const formatted = formatOccurrenceForDisplay(oInc);
    assert.equal(formatted.durationState, 'incomplete');
    assert.equal(formatted.durationMinutes, null);
    assert.equal(formatted.durationSeconds, null);
    recordResult('AC-6-BUG-03', 'Scenario 6: Incomplete duration is null/incomplete, not wall-clock elapsed or zero', 'PASS', 'durationState=incomplete, durationMinutes=null');
  } catch (err) {
    recordResult('AC-6-BUG-03', 'Scenario 6: Incomplete duration is null/incomplete, not wall-clock elapsed or zero', 'FAIL', err.message);
  }

  // BUG-04: Participants with identical display names
  try {
    resetOccurrenceMemoryStore();
    await saveZoomOccurrence({
      uuid: 'uuid-name-collision',
      start_time: '2026-09-14T10:00:00Z',
      end_time: '2026-09-14T11:00:00Z',
      participants: {
        p1: { name: 'Anna', sessions: [{ join_time: '2026-09-14T10:00:00Z', leave_time: '2026-09-14T10:30:00Z' }] },
        p2: { name: 'Anna', sessions: [{ join_time: '2026-09-14T10:30:00Z', leave_time: '2026-09-14T11:00:00Z' }] }
      }
    });
    const occ = await getZoomOccurrence('uuid-name-collision');
    const pCount = Object.keys(occ.participants).length;
    assert.equal(pCount, 2, '2 distinct participants named Anna must not be collapsed');
    recordResult('BUG-04-FIX', 'Participants with identical names are kept distinct (Business Rule 3)', 'PASS', '2 participants preserved');
  } catch (err) {
    recordResult('BUG-04-FIX', 'Participants with identical names are kept distinct (Business Rule 3)', 'FAIL', err.message);
  }

  // AC-9: URL-sensitive UUID
  try {
    const trickyUuid = 'zoom_uuid_tricky+/=123';
    const safeId = toSafeOccurrenceId(trickyUuid);
    assert.ok(!safeId.includes('/') && !safeId.includes('+') && !safeId.includes('='));
    const restored = fromSafeOccurrenceId(safeId);
    assert.equal(restored, trickyUuid);
    recordResult('AC-9', 'Scenario 9: URL-sensitive UUID safely base64url encoded and restored losslessly', 'PASS', `Encoded: ${safeId}`);
  } catch (err) {
    recordResult('AC-9', 'Scenario 9: URL-sensitive UUID safely base64url encoded and restored losslessly', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 5. Teacher Page SSR & UI Semantics
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Teacher Schedule Page SSR HTML Check ---');
  if (teacherYuliia) {
    try {
      const pageRes = await fetch(`${LOCAL_BASE_URL}/teachers/${teacherYuliia.id}?from=2026-09-14&to=2026-09-20`, {
        headers: authHeaders
      });
      assert.equal(pageRes.status, 200);
      const html = await pageRes.text();
      assert.ok(html.includes('telemetry-column'), 'Must contain .telemetry-column');
      assert.ok(html.includes('refreshZoomBtn') || html.includes('Refresh Zoom') || html.includes('🔄'), 'Must contain Refresh Zoom button');
      assert.ok(!html.includes('VERIFIED'), 'Must not contain VERIFIED tags');
      assert.ok(!html.includes('ATTENTION'), 'Must not contain ATTENTION tags');
      recordResult('PAGE-SSR-01', 'Teacher schedule page loads with HTTP 200 and renders Zoom telemetry column layout', 'PASS');
    } catch (err) {
      recordResult('PAGE-SSR-01', 'Teacher schedule page loads with HTTP 200 and renders Zoom telemetry column layout', 'FAIL', err.message);
    }
  }

  // ------------------------------------------------------------------------
  // 6. Vercel Deployed Flow Check
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: Vercel Deployed Flow Check (AC-12) ---');
  try {
    const vercelPageRes = await fetch(`${VERCEL_BASE_URL}/teachers/17251?from=2026-09-14&to=2026-09-20`, {
      redirect: 'manual'
    });
    if (vercelPageRes.status === 307) {
      recordResult(
        'VERCEL-E2E-FLOW',
        'Vercel teacher page redirected to /login by NextAuth middleware',
        'BLOCKED',
        'NEXT_PUBLIC_EE_CRM_AUTH_BYPASS is not active on Vercel deployment; Google OAuth intercepts request.'
      );
    } else if (vercelPageRes.status === 200) {
      recordResult('VERCEL-E2E-FLOW', 'Vercel teacher page loaded with HTTP 200', 'PASS');
    } else {
      recordResult('VERCEL-E2E-FLOW', `Vercel teacher page returned HTTP ${vercelPageRes.status}`, 'FAIL');
    }
  } catch (err) {
    recordResult('VERCEL-E2E-FLOW', 'Vercel teacher page probe failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------------
  console.log('\n--- Test Cleanup ---');
  if (teacherYuliia) {
    await fetch(`${LOCAL_BASE_URL}/api/teachers/${teacherYuliia.id}`, { method: 'DELETE', headers: authHeaders });
  }
  console.log('🧹 Cleaned up test teachers via API.');

  console.log('\n========================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const blockedCount = results.filter(r => r.status === 'BLOCKED').length;
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${blockedCount} BLOCKED out of ${results.length} checks`);
  console.log('========================================================================\n');

  return { results, passCount, failCount, blockedCount };
}

runVerification().catch(err => {
  console.error('Fatal error running verification suite:', err);
  process.exit(1);
});
