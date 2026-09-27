// ee-crm/test-crm-004.js
// Unit & Integration Test Suite for CRM-004:
// Compare Schoolmate and Zoom activity for a teacher-day
//
// 1. Interval Union and Geometric Overlap Calculations
// 2. Exact 300s Qualification Threshold (299s fails, 300s passes)
// 3. Teacher Companion Endpoint Exclusion
// 4. Conducted Lesson vs Cancellation/Other Classification
// 5. Day Comparison Engine Scenarios:
//    - Scenario 1: Positive preliminary match (3 conducted, 3 qualifying)
//    - Scenario 2: Fewer qualifying meetings (3 conducted, 2 qualifying -> +1)
//    - Scenario 3: More qualifying meetings (2 conducted, 3 qualifying -> -1)
//    - Scenario 4: Cancellations excluded from conducted count
//    - Scenario 5: No conducted activity (0 conducted, 0 qualifying)
//    - Scenario 6: Source unavailable / error / unmapped
//    - Scenario 7: Current / future day in progress
//    - Scenario 8: Provisional state for stale Zoom data
// 6. Participant Display Deduplication in formatOccurrenceForDisplay
// 7. Full getTeacherDayData integration & diagnostics payload

import assert from 'node:assert/strict';
import {
  QUALIFICATION_THRESHOLD_SECONDS,
  calculateIntervalUnionSeconds,
  calculateSessionOverlapSeconds,
  isCompanionEndpoint,
  evaluateMeetingQualification,
  isConductedLesson,
  computeTeacherDayComparison
} from './lib/comparison-engine.js';
import {
  formatOccurrenceForDisplay,
  resetOccurrenceMemoryStore,
  saveZoomOccurrence
} from './lib/zoom-occurrences.js';
import { createTeacher, saveCachedReport } from './lib/db.js';
import { getTeacherDayData } from './lib/teacher-day.js';

let passedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAll() {
  console.log('====================================================');
  console.log('CRM-004: Teacher-Day Activity Comparison Engine Test');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // 1. Interval Union Calculation
  // --------------------------------------------------------------------------
  await test('calculateIntervalUnionSeconds correctly merges overlapping and disjoint intervals', () => {
    // Disjoint: 100s + 100s = 200s
    assert.equal(calculateIntervalUnionSeconds([[0, 100000], [200000, 300000]]), 200);

    // Overlapping: [0, 100s] and [50s, 150s] -> [0, 150s] = 150s
    assert.equal(calculateIntervalUnionSeconds([[0, 100000], [50000, 150000]]), 150);

    // Fully nested: [0, 300s] and [50s, 100s] -> [0, 300s] = 300s
    assert.equal(calculateIntervalUnionSeconds([[0, 300000], [50000, 100000]]), 300);

    // Touching: [0, 100s] and [100s, 200s] -> [0, 200s] = 200s
    assert.equal(calculateIntervalUnionSeconds([[0, 100000], [100000, 200000]]), 200);

    // Empty / invalid input handling
    assert.equal(calculateIntervalUnionSeconds([]), 0);
    assert.equal(calculateIntervalUnionSeconds(null), 0);
    assert.equal(calculateIntervalUnionSeconds([[100, 50]]), 0); // end < start
  });

  // --------------------------------------------------------------------------
  // 2. Session Overlap Calculation
  // --------------------------------------------------------------------------
  await test('calculateSessionOverlapSeconds calculates exact teacher-participant intersection', () => {
    const teacherSessions = [
      { join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }
    ];
    const participantSessions = [
      { join_time: '2026-09-25T10:05:00Z', leave_time: '2026-09-25T10:55:00Z' } // 50 min = 3000s
    ];

    const result = calculateSessionOverlapSeconds(teacherSessions, participantSessions);
    assert.equal(result.overlapSeconds, 3000);
    assert.equal(result.overlapState, 'complete');

    // Disjoint sessions (participant before teacher)
    const earlyParticipant = [
      { join_time: '2026-09-25T09:00:00Z', leave_time: '2026-09-25T09:50:00Z' }
    ];
    const disjointResult = calculateSessionOverlapSeconds(teacherSessions, earlyParticipant);
    assert.equal(disjointResult.overlapSeconds, 0);

    // Multi-session teacher reconnection intersection
    const multiTeacher = [
      { join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T10:20:00Z' }, // 20m
      { join_time: '2026-09-25T10:25:00Z', leave_time: '2026-09-25T11:00:00Z' }  // 35m
    ];
    const continuousParticipant = [
      { join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }
    ];
    const multiResult = calculateSessionOverlapSeconds(multiTeacher, continuousParticipant);
    // Overlap = 20m (1200s) + 35m (2100s) = 3300s (55m)
    assert.equal(multiResult.overlapSeconds, 3300);
  });

  // --------------------------------------------------------------------------
  // 3. Teacher Companion Endpoint Exclusion
  // --------------------------------------------------------------------------
  await test('isCompanionEndpoint correctly identifies host and companion devices', () => {
    const hostEmail = 'olha.teacher@example.com';

    // Primary host participant
    assert.equal(isCompanionEndpoint({ is_host: true, email: 'random@test.com' }, hostEmail), true);
    assert.equal(isCompanionEndpoint({ role: 'Host', email: 'random@test.com' }, hostEmail), true);

    // Companion device logged in with teacher email
    assert.equal(isCompanionEndpoint({ is_host: false, email: 'olha.teacher@example.com' }, hostEmail), true);
    assert.equal(isCompanionEndpoint({ is_host: false, email: 'OLHA.TEACHER@EXAMPLE.COM ' }, hostEmail), true);

    // Genuine student participant
    assert.equal(isCompanionEndpoint({ is_host: false, email: 'student1@example.com' }, hostEmail), false);
    assert.equal(isCompanionEndpoint({ is_host: false, name: 'Student Without Email' }, hostEmail), false);
  });

  // --------------------------------------------------------------------------
  // 4. Exact 300s Qualification Threshold (Scenario 8 & Scenario 9)
  // --------------------------------------------------------------------------
  await test('evaluateMeetingQualification enforces exact 300-second threshold (299s fails, 300s passes)', () => {
    const teacherEmail = 'olha.teacher@example.com';

    // 299 seconds overlap (Scenario 8)
    const occ299 = {
      id: 'occ-299',
      topic: 'Math Lesson',
      participants: [
        {
          is_host: true,
          email: teacherEmail,
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }]
        },
        {
          is_host: false,
          user_name: 'Short Stay Student',
          email: 'student@example.com',
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T10:04:59Z' }] // 299s
        }
      ]
    };

    const eval299 = evaluateMeetingQualification(occ299, teacherEmail, QUALIFICATION_THRESHOLD_SECONDS);
    assert.equal(eval299.maxOverlapSeconds, 299);
    assert.equal(eval299.qualifies, false, '299s overlap must NOT qualify');

    // Exactly 300 seconds overlap
    const occ300 = {
      id: 'occ-300',
      topic: 'Math Lesson',
      participants: [
        {
          is_host: true,
          email: teacherEmail,
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }]
        },
        {
          is_host: false,
          user_name: 'Exact Stay Student',
          email: 'student@example.com',
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T10:05:00Z' }] // 300s
        }
      ]
    };

    const eval300 = evaluateMeetingQualification(occ300, teacherEmail, QUALIFICATION_THRESHOLD_SECONDS);
    assert.equal(eval300.maxOverlapSeconds, 300);
    assert.equal(eval300.qualifies, true, '300s overlap MUST qualify');

    // Companion device only (no student) does not qualify
    const occCompanionOnly = {
      id: 'occ-companion-only',
      topic: 'Solo Prep',
      participants: [
        {
          is_host: true,
          email: teacherEmail,
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }]
        },
        {
          is_host: false,
          email: teacherEmail, // Phone companion
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }]
        }
      ]
    };

    const evalCompanion = evaluateMeetingQualification(occCompanionOnly, teacherEmail, QUALIFICATION_THRESHOLD_SECONDS);
    assert.equal(evalCompanion.qualifies, false, 'Companion-only meeting must not qualify');
    assert.equal(evalCompanion.eligibleParticipantsCount, 0);

    // Scenario 9: Incomplete meeting with >= 300s lower bound qualifies
    const occIncomplete = {
      id: 'occ-incomplete',
      topic: 'Ongoing Lesson',
      startTime: '2026-09-25T10:00:00Z',
      endTime: '2026-09-25T10:45:00Z',
      participants: [
        {
          is_host: true,
          email: teacherEmail,
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: null }] // Missing leave time, meeting end provides 45m
        },
        {
          is_host: false,
          user_name: 'Present Student',
          email: 'student@example.com',
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T10:10:00Z' }] // 600s
        }
      ]
    };

    const evalIncomplete = evaluateMeetingQualification(occIncomplete, teacherEmail, QUALIFICATION_THRESHOLD_SECONDS);
    assert.equal(evalIncomplete.qualifies, true);
  });

  // --------------------------------------------------------------------------
  // 5. Conducted Lesson vs Cancellation Classification
  // --------------------------------------------------------------------------
  await test('isConductedLesson classifies lessons according to Schoolmate rules', () => {
    // Completed / null status
    assert.deepEqual(isConductedLesson({ lessonStatusName: null }), { isConducted: true, statusCategory: 'completed' });
    assert.deepEqual(isConductedLesson({ lessonStatusName: '' }), { isConducted: true, statusCategory: 'completed' });

    // Trial Success
    assert.deepEqual(isConductedLesson({ lessonStatusName: 'Trial Success' }), { isConducted: true, statusCategory: 'completed' });

    // Cancelled in advance
    const cancelAdv = isConductedLesson({ lessonStatusName: 'Cancelled in Advance' });
    assert.equal(cancelAdv.isConducted, false);
    assert.equal(cancelAdv.statusCategory, 'cancelled_advance');

    // Last-minute cancellation
    const cancelLast = isConductedLesson({ lessonStatusName: 'Last-Minute Cancellation' });
    assert.equal(cancelLast.isConducted, false);
    assert.equal(cancelLast.statusCategory, 'last_minute');
  });

  // --------------------------------------------------------------------------
  // 6. Day Comparison Engine Scenarios
  // --------------------------------------------------------------------------
  const pastDate = '2026-09-21'; // guaranteed in the past
  const teacherProfile = {
    id: 18305,
    fullName: 'Olha Kushnirchuk',
    zoomHostEmail: 'olha.teacher@example.com'
  };

  const createMockQualifyingMeeting = (id, startHour) => ({
    id: `occ-${id}`,
    topic: `Meeting ${id}`,
    startTime: `${pastDate}T${String(startHour).padStart(2, '0')}:00:00Z`,
    endTime: `${pastDate}T${String(startHour + 1).padStart(2, '0')}:00:00Z`,
    participants: [
      {
        is_host: true,
        email: 'olha.teacher@example.com',
        sessions: [{ join_time: `${pastDate}T${String(startHour).padStart(2, '0')}:00:00Z`, leave_time: `${pastDate}T${String(startHour + 1).padStart(2, '0')}:00:00Z` }]
      },
      {
        is_host: false,
        email: `student${id}@example.com`,
        sessions: [{ join_time: `${pastDate}T${String(startHour).padStart(2, '0')}:05:00Z`, leave_time: `${pastDate}T${String(startHour + 1).padStart(2, '0')}:00:00Z` }] // 55 min
      }
    ]
  });

  // Scenario 1: Positive preliminary match (3 conducted, 3 qualifying)
  await test('Scenario 1: Positive preliminary count match', () => {
    const schoolmate = {
      state: 'available',
      lessons: [
        { id: 1, lessonStatusName: null },
        { id: 2, lessonStatusName: null },
        { id: 3, lessonStatusName: 'Trial Success' }
      ]
    };
    const zoom = {
      state: 'available',
      meetings: [
        createMockQualifyingMeeting(1, 10),
        createMockQualifyingMeeting(2, 11),
        createMockQualifyingMeeting(3, 12)
      ]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'match');
    assert.equal(res.conductedLessonsCount, 3);
    assert.equal(res.qualifyingMeetingsCount, 3);
    assert.equal(res.difference, 0);
    assert.equal(res.differenceFormatted, '0');
  });

  // Scenario 2: Fewer qualifying meetings (3 conducted, 2 qualifying -> Difference: +1)
  await test('Scenario 2: Fewer qualifying meetings returns +1 difference', () => {
    const schoolmate = {
      state: 'available',
      lessons: [
        { id: 1, lessonStatusName: null },
        { id: 2, lessonStatusName: null },
        { id: 3, lessonStatusName: null }
      ]
    };
    const zoom = {
      state: 'available',
      meetings: [
        createMockQualifyingMeeting(1, 10),
        createMockQualifyingMeeting(2, 11)
      ]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'difference');
    assert.equal(res.conductedLessonsCount, 3);
    assert.equal(res.qualifyingMeetingsCount, 2);
    assert.equal(res.difference, 1);
    assert.equal(res.differenceFormatted, '+1');
  });

  // Scenario 3: More qualifying meetings (2 conducted, 3 qualifying -> Difference: -1)
  await test('Scenario 3: More qualifying meetings returns -1 difference without concluding error', () => {
    const schoolmate = {
      state: 'available',
      lessons: [
        { id: 1, lessonStatusName: null },
        { id: 2, lessonStatusName: null }
      ]
    };
    const zoom = {
      state: 'available',
      meetings: [
        createMockQualifyingMeeting(1, 10),
        createMockQualifyingMeeting(2, 11),
        createMockQualifyingMeeting(3, 12)
      ]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'difference');
    assert.equal(res.conductedLessonsCount, 2);
    assert.equal(res.qualifyingMeetingsCount, 3);
    assert.equal(res.difference, -1);
    assert.equal(res.differenceFormatted, '-1');
  });

  // Scenario 4: Cancellations remain separate and excluded from conducted count
  await test('Scenario 4: Cancellation is excluded from conducted count (2 conducted, 1 cancelled, 2 qualifying -> match)', () => {
    const schoolmate = {
      state: 'available',
      lessons: [
        { id: 1, lessonStatusName: null },
        { id: 2, lessonStatusName: null },
        { id: 3, lessonStatusName: 'Cancelled in Advance' }
      ]
    };
    const zoom = {
      state: 'available',
      meetings: [
        createMockQualifyingMeeting(1, 10),
        createMockQualifyingMeeting(2, 11)
      ]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'match');
    assert.equal(res.conductedLessonsCount, 2);
    assert.equal(res.cancellationsCount, 1);
    assert.equal(res.qualifyingMeetingsCount, 2);
    assert.equal(res.difference, 0);
  });

  // Scenario 5: No conducted activity (0 conducted, 0 qualifying)
  await test('Scenario 5: No conducted activity produces no_conducted_activity status instead of positive match', () => {
    const schoolmate = { state: 'empty', lessons: [] };
    const zoom = { state: 'empty', meetings: [] };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'no_conducted_activity');
    assert.equal(res.conductedLessonsCount, 0);
    assert.equal(res.qualifyingMeetingsCount, 0);
    assert.equal(res.difference, 0);
  });

  // Scenario 6: Source unavailable (Zoom unmapped or error)
  await test('Scenario 6: Unavailable source sets status to unavailable without zero-inference', () => {
    const schoolmate = {
      state: 'available',
      lessons: [{ id: 1, lessonStatusName: null }]
    };
    const zoomUnmapped = { state: 'unmapped', meetings: [] };

    const resUnmapped = computeTeacherDayComparison({ schoolmate, zoom: zoomUnmapped, date: pastDate, teacher: teacherProfile });
    assert.equal(resUnmapped.status, 'unavailable');
    assert.equal(resUnmapped.difference, null);
    assert.equal(resUnmapped.differenceFormatted, null);

    const zoomError = { state: 'error', error: 'Zoom network timeout', meetings: [] };
    const resError = computeTeacherDayComparison({ schoolmate, zoom: zoomError, date: pastDate, teacher: teacherProfile });
    assert.equal(resError.status, 'unavailable');
    assert.equal(resError.difference, null);
  });

  // Scenario 7: Current or future day is in_progress
  await test('Scenario 7: Current/future day sets status to in_progress and suppresses final difference', () => {
    const futureDate = '2099-12-31';
    const schoolmate = {
      state: 'available',
      lessons: [{ id: 1, lessonStatusName: null }]
    };
    const zoom = {
      state: 'available',
      meetings: [createMockQualifyingMeeting(1, 10)]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom, date: futureDate, teacher: teacherProfile });
    assert.equal(res.status, 'in_progress');
    assert.equal(res.isSchoolDayFinished, false);
    assert.equal(res.difference, null);
  });

  // Scenario 8: Provisional status when Zoom is stale
  await test('Scenario 8: Stale Zoom data sets status to provisional', () => {
    const schoolmate = {
      state: 'available',
      lessons: [{ id: 1, lessonStatusName: null }]
    };
    const zoomStale = {
      state: 'stale',
      meetings: [createMockQualifyingMeeting(1, 10)]
    };

    const res = computeTeacherDayComparison({ schoolmate, zoom: zoomStale, date: pastDate, teacher: teacherProfile });
    assert.equal(res.status, 'provisional');
  });

  // --------------------------------------------------------------------------
  // 7. Participant Display Deduplication
  // --------------------------------------------------------------------------
  await test('formatOccurrenceForDisplay groups and deduplicates split participant facts', () => {
    const rawOccurrence = {
      id: 'occ-dedup-1',
      topic: 'Grammar Discussion',
      startTime: '2026-09-25T12:00:00Z',
      endTime: '2026-09-25T13:00:00Z',
      durationSeconds: 3600,
      participants: [
        {
          id: 'anon_part_1',
          user_name: 'Dmytro Dushkevych',
          email: '',
          is_host: false,
          sessions: [{ join_time: '2026-09-25T12:02:00Z', leave_time: '2026-09-25T12:30:00Z' }] // 28m
        },
        {
          id: 'anon_part_2',
          user_name: 'Dmytro Dushkevych',
          email: '',
          is_host: false,
          sessions: [{ join_time: '2026-09-25T12:31:00Z', leave_time: '2026-09-25T12:59:00Z' }] // 28m
        },
        {
          id: 'host_part_1',
          user_name: 'Olha Kushnirchuk',
          email: 'olha.teacher@example.com',
          is_host: true,
          sessions: [{ join_time: '2026-09-25T12:00:00Z', leave_time: '2026-09-25T13:00:00Z' }]
        }
      ]
    };

    const formatted = formatOccurrenceForDisplay(rawOccurrence);
    assert.equal(formatted.participantsCount, 2, 'Should deduplicate Dmytro into a single display participant');
    
    const dmytro = formatted.participants.find(p => p.name === 'Dmytro Dushkevych');
    assert.ok(dmytro, 'Dmytro should exist in formatted participants');
    // Total connected minutes should be 28 + 28 = 56 min
    assert.equal(dmytro.durationMinutes, 56);
    assert.equal(dmytro.sessionsCount, 2);
  });

  // --------------------------------------------------------------------------
  // 8. Full getTeacherDayData integration & diagnostics payload
  // --------------------------------------------------------------------------
  await test('getTeacherDayData returns comparison and structured technical diagnostics', async () => {
    resetOccurrenceMemoryStore();

    const teacher = await createTeacher({
      firstName: 'Olha',
      lastName: 'Kushnirchuk',
      email: 'olha.teacher@example.com',
      schoolmateTeacherId: 18305,
      zoomHostEmail: 'olha.teacher@example.com'
    });

    const mockSchedule = {
      days: [
        {
          date: '2026-09-25',
          dayName: 'Friday 25th September',
          subtotalMinutes: 120,
          lessons: [
            {
              id: 'sm_l_1',
              strLessonDate: '2026-09-25',
              date: '2026-09-25',
              groupName: 'General English B1',
              groupOrStudent: 'General English B1',
              durationMinutes: 60,
              lessonStatusName: null,
              attendanceChecked: true,
              classDetailsAdded: true,
              teacherRate: '400 ₴',
              className: 'General English',
              enrolledStudents: 3,
              attendedCount: 3
            },
            {
              id: 'sm_l_2',
              strLessonDate: '2026-09-25',
              date: '2026-09-25',
              groupName: 'Business English B2',
              groupOrStudent: 'Business English B2',
              durationMinutes: 60,
              lessonStatusName: null,
              attendanceChecked: true,
              classDetailsAdded: false,
              teacherRate: '400 ₴',
              className: 'Business English',
              enrolledStudents: 1,
              attendedCount: 1
            }
          ]
        }
      ]
    };

    await saveCachedReport(teacher.schoolmateTeacherId, '2026-09-25_2026-09-25', mockSchedule);

    await saveZoomOccurrence({
      uuid: 'zoom-uuid-diag-001',
      numeric_meeting_id: '9258799407',
      topic: 'Olha Kushnirchuk Personal Room',
      host_email: 'olha.teacher@example.com',
      start_time: '2026-09-25T10:00:00Z',
      end_time: '2026-09-25T11:00:00Z',
      duration_seconds: 3600,
      participants: {
        host: {
          name: 'Olha Kushnirchuk',
          email: 'olha.teacher@example.com',
          is_host: true,
          sessions: [{ join_time: '2026-09-25T10:00:00Z', leave_time: '2026-09-25T11:00:00Z' }]
        },
        student: {
          name: 'Dmytro Dushkevych',
          email: 'dmytro@example.com',
          is_host: false,
          sessions: [{ join_time: '2026-09-25T10:05:00Z', leave_time: '2026-09-25T10:55:00Z' }]
        }
      }
    });

    const data = await getTeacherDayData(teacher.id, '2026-09-25');
    assert.ok(data, 'Should return data payload');
    assert.ok(data.teacher, 'Should include teacher profile');
    assert.equal(data.teacher.schoolmateTeacherId, 18305);
    assert.ok(data.schoolmate, 'Should include schoolmate response');
    assert.equal(data.schoolmate.state, 'available');
    assert.ok(data.zoom, 'Should include zoom response');
    assert.equal(data.zoom.state, 'available');
    assert.ok(data.comparison, 'Should include comparison result');
    assert.equal(data.comparison.conductedLessonsCount, 2);
    assert.equal(data.comparison.qualifyingMeetingsCount, 1);
    assert.ok(data.diagnostics, 'Should include diagnostics bundle');

    // Verify diagnostics tab payloads
    assert.ok(data.diagnostics.schoolmateRaw !== undefined, 'Diagnostics must include schoolmateRaw');
    assert.ok(data.diagnostics.zoomRaw !== undefined, 'Diagnostics must include zoomRaw');
    assert.ok(data.diagnostics.comparisonEngine !== undefined, 'Diagnostics must include comparisonEngine');
    assert.equal(data.diagnostics.comparisonEngine.calculationVersion, '1.0.0');
  });

  console.log(`\n====================================================`);
  console.log(`🎉 ALL ${passedCount} CRM-004 UNIT & INTEGRATION TESTS PASSED!`);
  console.log(`====================================================\n`);
}

runAll().catch(err => {
  console.error('\n❌ CRM-004 Test Suite Failed:', err);
  process.exit(1);
});
