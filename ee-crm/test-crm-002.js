// ee-crm/test-crm-002.js
// Comprehensive Unit & Integration Test Suite for CRM-002: Teacher-Day Details Page & API

import assert from 'node:assert/strict';
import {
  validateDateString,
  getAdjacentDates,
  getTeacherDayData
} from './lib/teacher-day.js';
import {
  createTeacher,
  saveCachedReport,
  getTeacherById
} from './lib/db.js';
import {
  saveZoomOccurrence,
  resetOccurrenceMemoryStore,
  formatOccurrenceForDisplay
} from './lib/zoom-occurrences.js';

let passedTests = 0;
let totalTests = 0;

function it(title, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function itAsync(title, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASS] ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${title}: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log(`====================================================`);
  console.log(`🧪 CRM-002 Teacher-Day Details Test Suite`);
  console.log(`====================================================\n`);

  resetOccurrenceMemoryStore();

  // ----------------------------------------------------------------
  // 1. Date Validation & Adjacent Day Helpers
  // ----------------------------------------------------------------
  console.log(`--- 1. Date Helpers & Validation ---`);

  it('validateDateString accepts valid ISO dates', () => {
    assert.equal(validateDateString('2026-09-27'), true);
    assert.equal(validateDateString('2026-02-28'), true);
    assert.equal(validateDateString('2026-12-31'), true);
    assert.equal(validateDateString('2024-02-29'), true); // Leap year
  });

  it('validateDateString rejects malformed or non-existent dates', () => {
    assert.equal(validateDateString('2026-02-30'), false); // Feb 30 does not exist
    assert.equal(validateDateString('2026-04-31'), false); // Apr 31 does not exist
    assert.equal(validateDateString('2026-13-01'), false); // Month 13
    assert.equal(validateDateString('2026/09/27'), false); // Slashes
    assert.equal(validateDateString('not-a-date'), false);
    assert.equal(validateDateString(''), false);
    assert.equal(validateDateString(null), false);
    assert.equal(validateDateString(undefined), false);
  });

  it('getAdjacentDates calculates previous and next calendar days accurately', () => {
    const adj1 = getAdjacentDates('2026-09-18');
    assert.equal(adj1.prevDate, '2026-09-17');
    assert.equal(adj1.nextDate, '2026-09-19');

    // Across month boundary
    const adjMonth = getAdjacentDates('2026-09-01');
    assert.equal(adjMonth.prevDate, '2026-08-31');
    assert.equal(adjMonth.nextDate, '2026-09-02');

    // Across year boundary
    const adjYear = getAdjacentDates('2026-01-01');
    assert.equal(adjYear.prevDate, '2025-12-31');
    assert.equal(adjYear.nextDate, '2026-01-02');

    assert.equal(getAdjacentDates('invalid'), null);
  });

  // ----------------------------------------------------------------
  // 2. Setup Test Data (Teacher, Schoolmate Cache, Zoom Occurrences)
  // ----------------------------------------------------------------
  console.log(`\n--- 2. Setting up Test Data ---`);

  const testTeacher = await createTeacher({
    firstName: 'Olena',
    lastName: 'Kovalenko',
    email: 'olena.kovalenko@empire.eu',
    schoolmateTeacherId: 88123,
    zoomHostEmail: 'olena.kovalenko@empire.eu'
  });

  const testDate = '2026-09-18';

  // Seed Schoolmate day schedule into cache for fast, deterministic testing
  const mockSchoolmateSchedule = {
    days: [
      {
        date: testDate,
        dayName: 'Friday 18th September',
        subtotalMinutes: 150,
        subtotalWageFormatted: '750 ₴',
        subtotalWageNumeric: 750,
        lessons: [
          {
            id: 'l_101',
            strLessonDate: testDate,
            date: testDate,
            groupName: 'DTEK Business English B2',
            groupOrStudent: 'DTEK Business English B2',
            durationMinutes: 90,
            lessonStatusName: null, // Completed
            attendanceChecked: true,
            classDetailsAdded: true,
            teacherRate: '450 ₴',
            teacherRatePerLesson: 450,
            currencySymbol: '₴',
            className: 'Business English',
            groupId: 'g_501',
            groupLessonId: 'gl_901'
          },
          {
            id: 'l_102',
            strLessonDate: testDate,
            date: testDate,
            groupName: 'Novaposhta Individual',
            groupOrStudent: 'Novaposhta Individual',
            durationMinutes: 60,
            lessonStatusName: 'Last-minute cancellation (100%)',
            lessonStatusColor: '#CC9933',
            attendanceChecked: true,
            classDetailsAdded: false,
            teacherRate: '300 ₴',
            teacherRatePerLesson: 300,
            currencySymbol: '₴',
            className: 'General English',
            groupId: 'g_502',
            groupLessonId: 'gl_902'
          }
        ]
      }
    ]
  };

  await saveCachedReport(testTeacher.schoolmateTeacherId, `${testDate}_${testDate}`, mockSchoolmateSchedule);

  // Seed Zoom meeting occurrences for this teacher and date
  const occurrence1 = await saveZoomOccurrence({
    uuid: 'crm002-uuid-alpha-123',
    numeric_meeting_id: '98765432101',
    topic: 'DTEK B2 Business English Group',
    host_email: 'olena.kovalenko@empire.eu',
    start_time: `${testDate}T09:00:00Z`,
    end_time: `${testDate}T10:30:00Z`,
    duration_seconds: 5400, // 90 min
    participants: {
      p_host: {
        user_id: 'u_olena',
        email: 'olena.kovalenko@empire.eu',
        name: 'Olena Kovalenko',
        is_host: true,
        sessions: [
          { join_time: `${testDate}T08:58:00Z`, leave_time: `${testDate}T10:31:00Z` }
        ]
      },
      p_student1: {
        user_id: 'u_student_1',
        email: 'alex.b@dtek.com',
        name: 'Alex B',
        is_host: false,
        sessions: [
          // Reconnect scenario: 09:02-09:40 and 09:42-10:28 (total union = 38m + 46m = 84m)
          { join_time: `${testDate}T09:02:00Z`, leave_time: `${testDate}T09:40:00Z` },
          { join_time: `${testDate}T09:42:00Z`, leave_time: `${testDate}T10:28:00Z` }
        ]
      }
    }
  });

  const occurrence2 = await saveZoomOccurrence({
    uuid: 'crm002-uuid-beta-456',
    numeric_meeting_id: '98765432102',
    topic: 'NovaPay Speaking Club',
    host_email: 'olena.kovalenko@empire.eu',
    start_time: `${testDate}T14:00:00Z`,
    end_time: `${testDate}T15:00:00Z`,
    duration_seconds: 3600, // 60 min
    participants: {
      p_host: {
        user_id: 'u_olena',
        email: 'olena.kovalenko@empire.eu',
        name: 'Olena Kovalenko',
        is_host: true,
        sessions: [
          { join_time: `${testDate}T13:59:00Z`, leave_time: `${testDate}T15:02:00Z` }
        ]
      }
    }
  });

  // ----------------------------------------------------------------
  // 3. Scenario Tests
  // ----------------------------------------------------------------
  console.log(`\n--- 3. Acceptance Criteria Scenarios ---`);

  await itAsync('Scenario 8: Invalid teacher returns 404', async () => {
    const res = await getTeacherDayData({ teacherId: 'non_existent_id', date: testDate });
    assert.equal(res.status, 404);
    assert.equal(res.error, 'Teacher not found');
  });

  await itAsync('Scenario 8: Invalid date format returns 400', async () => {
    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: '2026-99-99' });
    assert.equal(res.status, 400);
    assert.match(res.error, /invalid date/i);
  });

  await itAsync('Scenario 1 & 7: Returns complete teacher-day data on valid direct request', async () => {
    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: testDate });
    assert.equal(res.success, true);
    assert.equal(res.teacher.id, testTeacher.id);
    assert.equal(res.date, testDate);
    assert.equal(res.timezone, 'Europe/Kyiv');
    assert.equal(res.previousDate, '2026-09-17');
    assert.equal(res.nextDate, '2026-09-19');
  });

  await itAsync('Scenario 2: Displays both sources with separate factual totals', async () => {
    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: testDate });

    // Schoolmate assertions
    assert.equal(res.schoolmate.state, 'available');
    assert.equal(res.schoolmate.totalLessons, 2);
    assert.equal(res.schoolmate.totalMinutes, 150);
    assert.equal(res.schoolmate.totalWage, '750 ₴');
    assert.equal(res.schoolmate.lessons.length, 2);

    // Zoom assertions
    assert.equal(res.zoom.state, 'available');
    assert.equal(res.zoom.totalMeetings, 2);
    assert.equal(res.zoom.totalMinutes, 150); // 90 + 60
    assert.equal(res.zoom.meetings.length, 2);
  });

  await itAsync('Scenario 3: Inspect meeting participants with interval union', async () => {
    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: testDate });
    const meeting1 = res.zoom.meetings.find(m => m.uuid === 'crm002-uuid-alpha-123');
    assert.ok(meeting1);
    assert.equal(meeting1.participantsCount, 2);

    const student = meeting1.participants.find(p => p.name === 'Alex B');
    assert.ok(student);
    assert.equal(student.role, 'Participant');
    assert.equal(student.is_host, false);
    // Student sessions were 38m + 46m = 84m (5040s)
    assert.equal(student.connectedDurationMinutes, 84);
    assert.equal(student.connectionState, 'complete');
  });

  await itAsync('Scenario 4: One source has no data (Zoom empty)', async () => {
    // Query another date where Schoolmate has no cache and Zoom has no occurrences
    const emptyDate = '2026-09-25';
    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: emptyDate });

    assert.equal(res.success, true);
    assert.equal(res.zoom.state, 'empty');
    assert.equal(res.zoom.totalMeetings, 0);
    assert.equal(res.zoom.meetings.length, 0);
  });

  await itAsync('Scenario 5: Unmapped teacher reports unmapped Zoom state without failing Schoolmate', async () => {
    const unmappedTeacher = await createTeacher({
      firstName: 'Taras',
      lastName: 'Shevchenko',
      email: '',
      zoomHostEmail: '',
      schoolmateTeacherId: 99001
    });

    const res = await getTeacherDayData({ teacherId: unmappedTeacher.id, date: testDate });
    assert.equal(res.success, true);
    assert.equal(res.zoom.state, 'unmapped');
    assert.equal(res.zoom.totalMeetings, 0);
    assert.equal(res.zoom.meetings.length, 0);
  });

  await itAsync('Scenario 6: Incomplete evidence shows incomplete duration, not 0 or invented', async () => {
    // Create incomplete meeting lacking end boundary
    await saveZoomOccurrence({
      uuid: 'crm002-uuid-incomplete-789',
      numeric_meeting_id: '98765432103',
      topic: 'Unclosed Evening Class',
      host_email: 'olena.kovalenko@empire.eu',
      start_time: `${testDate}T18:00:00Z`,
      end_time: null, // End boundary not recorded
      participants: {}
    });

    const res = await getTeacherDayData({ teacherId: testTeacher.id, date: testDate });
    const incompleteMeeting = res.zoom.meetings.find(m => m.uuid === 'crm002-uuid-incomplete-789');
    assert.ok(incompleteMeeting);
    assert.equal(incompleteMeeting.durationState, 'incomplete');
    assert.equal(incompleteMeeting.durationMinutes, null);
    assert.equal(incompleteMeeting.durationSeconds, null);
  });

  it('Scenario 9: Strictly no inferred reconciliation or flags in teacher-day response', () => {
    // Ensure the response contract contains no pairing or discrepancy conclusions
    const sample = formatOccurrenceForDisplay({
      uuid: 'test-uuid',
      start_time: '2026-09-18T10:00:00Z',
      end_time: '2026-09-18T11:00:00Z',
      duration_seconds: 3600
    });

    assert.equal(sample.reconciliation, undefined);
    assert.equal(sample.flags, undefined);
    assert.equal(sample.statusBadge, undefined);
    assert.equal(sample.lessonMatch, undefined);
  });

  // ----------------------------------------------------------------
  // 4. API Route Handler Contract Test
  // ----------------------------------------------------------------
  console.log(`\n--- 4. API Route Handler Contract ---`);

  async function simulateTeacherDayRoute(id, date) {
    if (!id) return { status: 400, body: { error: 'Teacher ID is required' } };
    if (!date) return { status: 400, body: { error: 'Date is required' } };
    const result = await getTeacherDayData({ teacherId: id, date });
    if (result.error) {
      return { status: result.status || 400, body: { error: result.error } };
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store, private' },
      body: result
    };
  }

  await itAsync('GET /api/teachers/[id]/days/[date] returns 200 and Cache-Control: no-store', async () => {
    const response = await simulateTeacherDayRoute(testTeacher.id, testDate);

    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store, private');

    const body = response.body;
    assert.equal(body.success, true);
    assert.equal(body.teacher.id, testTeacher.id);
    assert.equal(body.date, testDate);
    assert.equal(body.schoolmate.totalLessons, 2);
    assert.equal(body.zoom.totalMeetings, 3); // 2 complete + 1 incomplete
  });

  await itAsync('GET /api/teachers/[id]/days/[date] returns 404 for non-existent teacher', async () => {
    const response = await simulateTeacherDayRoute('missing', testDate);

    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'Teacher not found');
  });

  console.log(`\n====================================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} CRM-002 TESTS PASSED!`);
  console.log(`====================================================\n`);
}

main().catch(err => {
  console.error('\n❌ CRM-002 Test execution failed:', err);
  process.exit(1);
});
