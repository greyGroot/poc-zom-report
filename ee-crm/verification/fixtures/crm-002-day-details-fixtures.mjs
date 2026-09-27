// ee-crm/verification/fixtures/crm-002-day-details-fixtures.mjs
// Test Fixtures for CRM-002: Teacher-Day Details Page & API Verification

export const FIXTURE_TEACHER_OLENA = {
  id: 't_qa_olena_kovalenko',
  firstName: 'Olena',
  lastName: 'Kovalenko',
  fullName: 'Kovalenko Olena',
  email: 'olena.kovalenko@empire.eu',
  schoolmateTeacherId: 88123,
  zoomHostEmail: 'olena.kovalenko@empire.eu',
  phone: '+380501112233',
  schoolmateLogin: 'kovalenko.o'
};

export const FIXTURE_TEACHER_UNMAPPED = {
  id: 't_qa_unmapped_taras',
  firstName: 'Taras',
  lastName: 'Shevchenko',
  fullName: 'Shevchenko Taras',
  email: '',
  schoolmateTeacherId: 99001,
  zoomHostEmail: '',
  phone: '+380509998877',
  schoolmateLogin: 'shevchenko.t'
};

export const FIXTURE_DATE_HAPPY_PATH = '2026-09-18';
export const FIXTURE_DATE_ZOOM_EMPTY = '2026-09-19';
export const FIXTURE_DATE_SCHOOLMATE_EMPTY = '2026-09-20';
export const FIXTURE_SHARED_NUMERIC_ID = '98765432101';

export const FIXTURE_SCHOOLMATE_SCHEDULE_SEP18 = {
  days: [
    {
      date: '2026-09-18',
      dayName: 'Friday 18th September',
      subtotalMinutes: 150,
      subtotalWageFormatted: '750 ₴',
      subtotalWageNumeric: 750,
      lessons: [
        {
          id: 'l_sm_101',
          strLessonDate: '2026-09-18',
          date: '2026-09-18',
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
          id: 'l_sm_102',
          strLessonDate: '2026-09-18',
          date: '2026-09-18',
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

export const FIXTURE_OCCURRENCES_SEP18 = [
  {
    uuid: 'crm002-occ-alpha-123',
    numeric_meeting_id: FIXTURE_SHARED_NUMERIC_ID,
    topic: 'DTEK B2 Business English Group',
    host_email: 'olena.kovalenko@empire.eu',
    start_time: '2026-09-18T09:00:00Z',
    end_time: '2026-09-18T10:30:00Z',
    duration_seconds: 5400, // 90 min
    participants: {
      p_host: {
        user_id: 'u_olena',
        email: 'olena.kovalenko@empire.eu',
        name: 'Olena Kovalenko',
        is_host: true,
        sessions: [
          { join_time: '2026-09-18T08:58:00Z', leave_time: '2026-09-18T10:31:00Z' }
        ]
      },
      p_student1: {
        user_id: 'u_student_alex',
        email: 'alex.b@dtek.com',
        name: 'Alex B',
        is_host: false,
        sessions: [
          // Reconnect scenario: 09:02-09:40 (38m) + 09:42-10:28 (46m) = 84m (5040s)
          { join_time: '2026-09-18T09:02:00Z', leave_time: '2026-09-18T09:40:00Z' },
          { join_time: '2026-09-18T09:42:00Z', leave_time: '2026-09-18T10:28:00Z' }
        ]
      },
      p_student2: {
        user_id: 'u_student_maryna',
        email: 'maryna.k@dtek.com',
        name: 'Maryna K',
        is_host: false,
        sessions: [
          // Overlapping devices scenario: PC 09:00-09:45 (45m) and Phone 09:20-10:00 (40m)
          // Union: 09:00 - 10:00 = 60m (3600s)
          { join_time: '2026-09-18T09:00:00Z', leave_time: '2026-09-18T09:45:00Z' },
          { join_time: '2026-09-18T09:20:00Z', leave_time: '2026-09-18T10:00:00Z' }
        ]
      }
    }
  },
  {
    uuid: 'crm002-occ-beta-reused-room-456',
    numeric_meeting_id: FIXTURE_SHARED_NUMERIC_ID, // Reused room ID
    topic: 'NovaPay Speaking Club',
    host_email: 'olena.kovalenko@empire.eu',
    start_time: '2026-09-18T14:00:00Z',
    end_time: '2026-09-18T15:00:00Z',
    duration_seconds: 3600, // 60 min
    participants: {
      p_host: {
        user_id: 'u_olena',
        email: 'olena.kovalenko@empire.eu',
        name: 'Olena Kovalenko',
        is_host: true,
        sessions: [
          { join_time: '2026-09-18T13:59:00Z', leave_time: '2026-09-18T15:02:00Z' }
        ]
      },
      p_guest: {
        user_id: 'u_guest_novapay',
        email: 'guest@novapay.ua',
        name: 'Guest Novapay',
        is_host: false,
        sessions: [
          { join_time: '2026-09-18T14:05:00Z', leave_time: '2026-09-18T14:55:00Z' }
        ]
      }
    }
  },
  {
    uuid: 'crm002-occ-gamma-incomplete-789',
    numeric_meeting_id: '98765432103',
    topic: 'Unclosed Evening Individual Lesson',
    host_email: 'olena.kovalenko@empire.eu',
    start_time: '2026-09-18T18:00:00Z',
    end_time: null, // Incomplete boundary
    duration_seconds: null,
    participants: {
      p_host: {
        user_id: 'u_olena',
        email: 'olena.kovalenko@empire.eu',
        name: 'Olena Kovalenko',
        is_host: true,
        sessions: [
          { join_time: '2026-09-18T18:00:00Z', leave_time: null }
        ]
      }
    }
  }
];
