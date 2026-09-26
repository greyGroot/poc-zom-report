// ee-crm/test-qa-e2e.mjs
// Comprehensive End-to-End Local QA Test for EE-CRM (CRM-001)

import assert from 'node:assert/strict';
import fs from 'node:fs';
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
} from './lib/zoom-occurrences.js';
import { createTeacher, deleteTeacher } from './lib/db.js';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://localhost:3000';
const SECRET = process.env.NEXTAUTH_SECRET;

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function run() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CRM-001 LOCAL END-TO-END QA TEST SUITE');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // Generate Admin JWT session token for authenticated requests
  const testUserToken = {
    name: 'QA Lead Admin',
    email: 'qa.admin@empire.eu',
    sub: 'qa-admin-uuid-001',
    id: 'qa-admin-uuid-001'
  };
  const sessionToken = await encode({ token: testUserToken, secret: SECRET });
  const authHeaders = {
    Cookie: `next-auth.session-token=${sessionToken}`,
    'Content-Type': 'application/json'
  };

  // ------------------------------------------------------------------------
  // 1. Health Probe
  // ------------------------------------------------------------------------
  console.log('\n--- Group 1: Service Availability & Health Probe ---');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'Empire English CRM (EE CRM)');
    recordResult('HEALTH-01', 'GET /api/health returns 200 and healthy service info', 'PASS', `Mode: ${data.integrations?.redis?.mode}`);
  } catch (err) {
    recordResult('HEALTH-01', 'GET /api/health returns 200 and healthy service info', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 2. Authentication Protection & Bypass Verification (AC-10, AC-11)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Authentication Protection & Bypass (AC-10, AC-11) ---');
  try {
    const unauthRes = await fetch(`${BASE_URL}/api/teachers`, { redirect: 'manual' });
    const location = unauthRes.headers.get('location');
    assert.equal(unauthRes.status, 307);
    assert.ok(location?.includes('/login'), `Expected redirect to /login, got: ${location}`);
    recordResult('AC-11', 'Authentication restored: Protected routes redirect unauthenticated clients to /login', 'PASS', `Redirected with HTTP ${unauthRes.status} to ${location}`);
  } catch (err) {
    recordResult('AC-11', 'Authentication restored: Protected routes redirect unauthenticated clients to /login', 'FAIL', err.message);
  }

  try {
    const middlewareContent = fs.readFileSync('middleware.js', 'utf-8');
    const hasBypassCode = middlewareContent.includes('NEXT_PUBLIC_EE_CRM_AUTH_BYPASS');
    if (!hasBypassCode) {
      recordResult('AC-10', 'Authentication bypass supports deployed E2E (NEXT_PUBLIC_EE_CRM_AUTH_BYPASS)', 'FAIL', 'middleware.js does not check or implement NEXT_PUBLIC_EE_CRM_AUTH_BYPASS (FR-13, Scenario 10)');
    } else {
      recordResult('AC-10', 'Authentication bypass supports deployed E2E (NEXT_PUBLIC_EE_CRM_AUTH_BYPASS)', 'PASS', 'Bypass flag handled in middleware');
    }
  } catch (err) {
    recordResult('AC-10', 'Authentication bypass supports deployed E2E (NEXT_PUBLIC_EE_CRM_AUTH_BYPASS)', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 3. HTTP Teacher Setup via API
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: HTTP Teacher Management via API ---');
  let teacherYulia = null;
  let teacherIryna = null;

  try {
    const resCreate = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        firstName: 'Yuliia',
        lastName: 'Savchuk',
        email: 'yuliasavchuk03@gmail.com',
        schoolmateTeacherId: 17251,
        zoomHostEmail: 'yuliasavchuk03@gmail.com',
        schoolmateLogin: 'savchuk.y'
      })
    });
    assert.equal(resCreate.status, 201);
    const bodyCreate = await resCreate.json();
    teacherYulia = bodyCreate.teacher;
    assert.ok(teacherYulia?.id);
    recordResult('TEACHER-01', 'POST /api/teachers creates teacher in server store', 'PASS', `Created ID: ${teacherYulia.id}`);
  } catch (err) {
    recordResult('TEACHER-01', 'POST /api/teachers creates teacher in server store', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 4. HTTP API Route Validation (/api/teachers/[id]/zoom-meetings)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: HTTP API Route Validation & Error Handling (AC-7, AC-8) ---');
  if (teacherYulia) {
    // 4.1 Valid query on existing teacher (Empty result)
    try {
      const res = await fetch(`${BASE_URL}/api/teachers/${teacherYulia.id}/zoom-meetings?from=2026-09-14&to=2026-09-20`, {
        headers: authHeaders
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.teacherId, teacherYulia.id);
      assert.equal(data.totalMeetings, 0);
      assert.deepEqual(data.meetings, []);
      recordResult('AC-7', 'Scenario 7: Neutral empty result returned with HTTP 200', 'PASS', 'totalMeetings=0, meetings=[]');
    } catch (err) {
      recordResult('AC-7', 'Scenario 7: Neutral empty result returned with HTTP 200', 'FAIL', err.message);
    }

    // 4.2 Non-existent teacher ID (404)
    try {
      const res404 = await fetch(`${BASE_URL}/api/teachers/t_invalid_9999/zoom-meetings?from=2026-09-14&to=2026-09-20`, {
        headers: authHeaders
      });
      assert.equal(res404.status, 404);
      const body404 = await res404.json();
      assert.equal(body404.error, 'Teacher not found');
      recordResult('AC-8a', 'Scenario 8: Non-existent teacher returns HTTP 404', 'PASS');
    } catch (err) {
      recordResult('AC-8a', 'Scenario 8: Non-existent teacher returns HTTP 404', 'FAIL', err.message);
    }

    // 4.3 Missing date parameters (400)
    try {
      const resNoDates = await fetch(`${BASE_URL}/api/teachers/${teacherYulia.id}/zoom-meetings`, {
        headers: authHeaders
      });
      assert.equal(resNoDates.status, 400);
      recordResult('AC-8b', 'Scenario 8: Missing date parameters returns HTTP 400', 'PASS');
    } catch (err) {
      recordResult('AC-8b', 'Scenario 8: Missing date parameters returns HTTP 400', 'FAIL', err.message);
    }

    // 4.4 Inverted date range (400)
    try {
      const resInverted = await fetch(`${BASE_URL}/api/teachers/${teacherYulia.id}/zoom-meetings?from=2026-09-20&to=2026-09-14`, {
        headers: authHeaders
      });
      assert.equal(resInverted.status, 400);
      const bodyInverted = await resInverted.json();
      assert.equal(bodyInverted.error, 'To Date cannot be earlier than From Date');
      recordResult('AC-8c', 'Scenario 8: Inverted date range returns HTTP 400', 'PASS');
    } catch (err) {
      recordResult('AC-8c', 'Scenario 8: Inverted date range returns HTTP 400', 'FAIL', err.message);
    }
  }

  // ------------------------------------------------------------------------
  // 5. Core Occurrence Logic & Scenarios (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 5: Occurrence Logic & Acceptance Criteria (In-depth) ---');
  resetOccurrenceMemoryStore();

  const sharedRoomId = '89411204451';
  const uuid1 = 'zoom_uuid_occ_001_kyiv_sep14';
  const uuid2 = 'zoom_uuid_occ_002_kyiv_sep15';
  const uuidIncomplete = 'zoom_uuid_occ_003_incomplete';
  const uuidNextWeek = 'zoom_uuid_occ_004_next_week';
  const uuidIryna = 'zoom_uuid_occ_005_iryna';
  const uuidTricky = 'zoom_uuid_tricky+/=123';

  // Seed occurrences
  await saveZoomOccurrence({
    uuid: uuid1,
    numeric_meeting_id: sharedRoomId,
    topic: 'Alena Medvedieva Sushi Icons [GE, English]',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-14T05:00:00Z',
    end_time: '2026-09-14T06:00:00Z',
    participants: {
      host: { name: 'Savchuk Yuliia', email: 'yuliasavchuk03@gmail.com', is_host: true, first_join_time: '2026-09-14T04:58:00Z', last_leave_time: '2026-09-14T06:01:00Z', sessions: [{ join_time: '2026-09-14T04:58:00Z', leave_time: '2026-09-14T06:01:00Z' }] },
      student1: { name: 'Alena Medvedieva', email: 'alena@example.com', is_host: false, first_join_time: '2026-09-14T05:01:00Z', last_leave_time: '2026-09-14T05:58:00Z', sessions: [{ join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }] }
    }
  });

  await saveZoomOccurrence({
    uuid: uuid2,
    numeric_meeting_id: sharedRoomId,
    topic: 'Dasha Pasichna NovaPay [GE, English]',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-15T10:00:00Z',
    end_time: '2026-09-15T11:00:00Z',
    participants: {
      host: { name: 'Savchuk Yuliia', email: 'yuliasavchuk03@gmail.com', is_host: true, first_join_time: '2026-09-15T09:59:00Z', last_leave_time: '2026-09-15T11:00:00Z', sessions: [{ join_time: '2026-09-15T09:59:00Z', leave_time: '2026-09-15T11:00:00Z' }] },
      student2: { name: 'Dasha Pasichna', email: 'dasha@example.com', is_host: false, first_join_time: '2026-09-15T10:02:00Z', last_leave_time: '2026-09-15T10:59:00Z', sessions: [{ join_time: '2026-09-15T10:02:00Z', leave_time: '2026-09-15T10:59:00Z' }] }
    }
  });

  await saveZoomOccurrence({
    uuid: uuidIncomplete,
    numeric_meeting_id: '555666777',
    topic: 'In-progress Lesson Without End Webhook',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-16T12:00:00Z',
    participants: {
      host: { name: 'Savchuk Yuliia', email: 'yuliasavchuk03@gmail.com', is_host: true, first_join_time: '2026-09-16T12:00:00Z', sessions: [{ join_time: '2026-09-16T12:00:00Z' }] }
    }
  });

  await saveZoomOccurrence({
    uuid: uuidNextWeek,
    numeric_meeting_id: '111222333',
    topic: 'Next Week Lesson',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-25T08:00:00Z',
    end_time: '2026-09-25T09:00:00Z'
  });

  await saveZoomOccurrence({
    uuid: uuidIryna,
    numeric_meeting_id: '999000111',
    topic: 'Pavlo Simonenko DTEK',
    host_email: 'zhur.zhur.irene@gmail.com',
    start_time: '2026-09-14T05:00:00Z',
    end_time: '2026-09-14T06:00:00Z',
    participants: {
      host: { name: 'Zhuravlova Iryna', email: 'zhur.zhur.irene@gmail.com', is_host: true, duration_seconds: 3600 }
    }
  });

  await saveZoomOccurrence({
    uuid: uuidTricky,
    numeric_meeting_id: '888777666',
    topic: 'URL Sensitive Meeting',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-17T09:00:00Z',
    end_time: '2026-09-17T10:00:00Z'
  });

  // AC-1 & Period query
  try {
    const list = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'yuliasavchuk03@gmail.com',
      teacherEmail: 'yuliasavchuk03@gmail.com',
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });
    const formatted = list.map(formatOccurrenceForDisplay);
    assert.equal(formatted.length, 4);
    assert.ok(formatted.every(m => !m.flags && !m.reconciliationTag && !m.business_status));
    recordResult('AC-1', 'Scenario 1: Display meetings for selected period without tags', 'PASS', `Retrieved ${formatted.length} meetings without reconciliation tags`);
  } catch (err) {
    recordResult('AC-1', 'Scenario 1: Display meetings for selected period without tags', 'FAIL', err.message);
  }

  // AC-2: Change period
  try {
    const list = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'yuliasavchuk03@gmail.com',
      fromDate: '2026-09-21',
      toDate: '2026-09-27'
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].uuid, uuidNextWeek);
    recordResult('AC-2', 'Scenario 2: Change period refreshes Zoom meetings for that inclusive period', 'PASS', `Found 1 occurrence (${uuidNextWeek})`);
  } catch (err) {
    recordResult('AC-2', 'Scenario 2: Change period refreshes Zoom meetings for that inclusive period', 'FAIL', err.message);
  }

  // AC-3: Reused numeric meeting ID
  try {
    const o1 = await getZoomOccurrence(uuid1);
    const o2 = await getZoomOccurrence(uuid2);
    assert.equal(o1.numeric_meeting_id, o2.numeric_meeting_id);
    assert.notEqual(o1.uuid, o2.uuid);
    assert.ok(o1.participants.student1 && !o1.participants.student2);
    assert.ok(o2.participants.student2 && !o2.participants.student1);
    recordResult('AC-3', 'Scenario 3: Separate occurrences sharing numeric ID are not merged', 'PASS');
  } catch (err) {
    recordResult('AC-3', 'Scenario 3: Separate occurrences sharing numeric ID are not merged', 'FAIL', err.message);
  }

  // AC-4: Duplicate events / replay idempotency
  try {
    const before = await getZoomOccurrence(uuid1);
    await saveZoomOccurrence({
      uuid: uuid1,
      numeric_meeting_id: sharedRoomId,
      topic: 'Alena Medvedieva Sushi Icons [GE, English]',
      host_email: 'yuliasavchuk03@gmail.com',
      participants: {
        student1: { name: 'Alena Medvedieva', email: 'alena@example.com', sessions: [{ join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }] }
      }
    }, { merge: true });
    const after = await getZoomOccurrence(uuid1);
    assert.equal(after.participants.student1.sessions.length, before.participants.student1.sessions.length);
    recordResult('AC-4', 'Scenario 4: Replayed event does not inflate sessions or duration', 'PASS');
  } catch (err) {
    recordResult('AC-4', 'Scenario 4: Replayed event does not inflate sessions or duration', 'FAIL', err.message);
  }

  // AC-5: Participant connected time (reconnects & overlap union)
  try {
    // 3 distinct reconnect intervals: 10m + 15m + 20m = 45m (2700s)
    const reconnectSessions = [
      { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:10:00Z' },
      { join_time: '2026-09-14T08:15:00Z', leave_time: '2026-09-14T08:30:00Z' },
      { join_time: '2026-09-14T08:35:00Z', leave_time: '2026-09-14T08:55:00Z' }
    ];
    assert.equal(calculateIntervalUnionSeconds(reconnectSessions), 2700);

    // Overlapping PC + Phone (08:00 - 08:50 = 3000s)
    const overlapSessions = [
      { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:50:00Z' },
      { join_time: '2026-09-14T08:20:00Z', leave_time: '2026-09-14T08:40:00Z' }
    ];
    assert.equal(calculateIntervalUnionSeconds(overlapSessions), 3000);
    recordResult('AC-5', 'Scenario 5: Participant connected time includes reconnects without double-counting overlap', 'PASS');
  } catch (err) {
    recordResult('AC-5', 'Scenario 5: Participant connected time includes reconnects without double-counting overlap', 'FAIL', err.message);
  }

  // AC-9: URL-sensitive UUID
  try {
    const safeId = toSafeOccurrenceId(uuidTricky);
    assert.ok(!safeId.includes('/') && !safeId.includes('+') && !safeId.includes('='));
    const restored = fromSafeOccurrenceId(safeId);
    assert.equal(restored, uuidTricky);
    recordResult('AC-9', 'Scenario 9: URL-sensitive UUID safely encoded and restored losslessly', 'PASS');
  } catch (err) {
    recordResult('AC-9', 'Scenario 9: URL-sensitive UUID safely encoded and restored losslessly', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 6. Defect Verifications (BUG-01, BUG-02, BUG-03, BUG-04)
  // ------------------------------------------------------------------------
  console.log('\n--- Group 6: Detailed Defect Findings ---');

  // BUG-02: Unmapped Teacher Host Privacy Leak
  try {
    const leaked = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: '',
      teacherEmail: '',
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });
    if (leaked.length > 0) {
      recordResult(
        'BUG-02',
        'Data Leak: Unmapped teacher returns Zoom meetings of other teachers',
        'FAIL',
        `Returned ${leaked.length} meetings belonging to other hosts! targetHosts.size check fails to prevent query.`
      );
    } else {
      recordResult('BUG-02', 'Unmapped teacher returns 0 meetings', 'PASS');
    }
  } catch (err) {
    recordResult('BUG-02', 'Unmapped teacher check error', 'FAIL', err.message);
  }

  // BUG-03: Incomplete Duration Wall-Clock Calculation
  try {
    const oInc = await getZoomOccurrence(uuidIncomplete);
    const formatted = formatOccurrenceForDisplay(oInc);
    assert.equal(formatted.durationState, 'incomplete');
    if (formatted.durationMinutes > 1440) {
      recordResult(
        'BUG-03',
        'Fictitious Duration: Incomplete meeting duration calculated via Date.now() - startMs',
        'FAIL',
        `Calculated durationMinutes=${formatted.durationMinutes} min (~${Math.round(formatted.durationMinutes / 1440)} days elapsed since 2026-09-16). Violates Scenario 6: "not invented or zero".`
      );
    } else {
      recordResult('BUG-03', 'Incomplete duration handled cleanly without wall-clock inflation', 'PASS');
    }
  } catch (err) {
    recordResult('BUG-03', 'Incomplete duration check error', 'FAIL', err.message);
  }

  // BUG-04: Participant Merging on Display Name Alone
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
    if (pCount === 1) {
      recordResult(
        'BUG-04',
        'Business Rule Violation: Participants merged solely because display names match',
        'FAIL',
        `2 distinct participants named "Anna" were collapsed into 1 participant in mergeParticipants (violates Business Rule: "Display names are not verified identities; do not merge participants solely because names match").`
      );
    } else {
      recordResult('BUG-04', 'Participants with identical names kept distinct', 'PASS');
    }
  } catch (err) {
    recordResult('BUG-04', 'Name collision check error', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // 7. SSR Page Rendering Check
  // ------------------------------------------------------------------------
  console.log('\n--- Group 7: Teacher Schedule Page SSR HTML Check ---');
  if (teacherYulia) {
    try {
      const pageRes = await fetch(`${BASE_URL}/teachers/${teacherYulia.id}?from=2026-09-14&to=2026-09-20`, {
        headers: authHeaders
      });
      assert.equal(pageRes.status, 200);
      const html = await pageRes.text();
      assert.ok(html.includes('telemetry-column') || html.includes('Tracked Zoom Meetings'), 'Must contain Tracked Zoom Meetings column');
      assert.ok(html.includes('refreshZoomBtn') || html.includes('Refresh Zoom') || html.includes('🔄'), 'Must contain Refresh Zoom button');
      recordResult('PAGE-01', 'Teacher schedule page loads with HTTP 200 and renders Zoom column layout', 'PASS');
    } catch (err) {
      recordResult('PAGE-01', 'Teacher schedule page loads with HTTP 200 and renders Zoom column layout', 'FAIL', err.message);
    }
  }

  // ------------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------------
  console.log('\n--- Test Cleanup ---');
  if (teacherYulia) {
    await fetch(`${BASE_URL}/api/teachers/${teacherYulia.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
  }
  console.log('🧹 Cleaned up test teacher via API.');

  console.log('\n========================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${results.length} checks`);
  console.log('========================================================================\n');
}

run().catch(err => {
  console.error('Fatal error in local QA suite:', err);
  process.exit(1);
});
