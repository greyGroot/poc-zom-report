// ee-crm/verification/fixtures/crm-004-comparison-fixtures.mjs
// Comprehensive Test Fixtures for CRM-004: Compare Schoolmate and Zoom Activity

export const FIXTURE_TEACHER_OLHA = {
  id: 't_qa_olha_kushnirchuk',
  firstName: 'Olha',
  lastName: 'Kushnirchuk',
  fullName: 'Kushnirchuk Olha',
  email: 'helhakushnirchuk@gmail.com',
  schoolmateTeacherId: 18305,
  zoomHostEmail: 'helhakushnirchuk@gmail.com',
  phone: '+380501234567',
  schoolmateLogin: 't18305'
};

export const FIXTURE_TEACHER_UNMAPPED = {
  id: 't_qa_unmapped_teacher',
  firstName: 'Taras',
  lastName: 'Shevchenko',
  fullName: 'Shevchenko Taras',
  email: '',
  schoolmateTeacherId: 99001,
  zoomHostEmail: '',
  phone: '+380509998877',
  schoolmateLogin: 'shevchenko.t'
};

export const PROD_TEACHER_ID = 't_5e3f31e6';
export const PROD_DATE_FRIDAY = '2026-09-25';
export const PROD_DATE_SATURDAY = '2026-09-26';
export const PROD_DATE_FROM = '2026-09-25';
export const PROD_DATE_TO = '2026-09-27';

// Multi-day Schoolmate Schedule Fixture mirroring screenshot 1 & 2
export const FIXTURE_SCHOOLMATE_MULTIDAY = {
  days: [
    {
      date: '2026-09-25',
      dayName: "П'ятниця (25/09/2026)",
      subtotalMinutes: 270,
      subtotalWageFormatted: '1400.00 ₴',
      subtotalWageNumeric: 1400,
      lessons: [
        {
          id: 'sm_l_fri_1',
          strLessonDate: '2026-09-25',
          date: '2026-09-25',
          groupName: '1. TA Group B1',
          groupOrStudent: '1. TA Group B1',
          startTime: '09:00',
          endTime: '10:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '400.00 ₴',
          teacherRatePerLesson: 400,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 5,
          attendedCount: 5,
          isConducted: true
        },
        {
          id: 'sm_l_fri_2',
          strLessonDate: '2026-09-25',
          date: '2026-09-25',
          groupName: '2. ArcelorMittal A1',
          groupOrStudent: '2. ArcelorMittal A1',
          startTime: '12:00',
          endTime: '13:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: false,
          classDetailsAdded: false,
          teacherRate: '0.00 ₴',
          teacherRatePerLesson: 0,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 4,
          attendedCount: 0,
          isConducted: true
        },
        {
          id: 'sm_l_fri_3',
          strLessonDate: '2026-09-25',
          date: '2026-09-25',
          groupName: '3. Alice Saliienko NovaPay',
          groupOrStudent: '3. Alice Saliienko NovaPay',
          startTime: '13:00',
          endTime: '14:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '400.00 ₴',
          teacherRatePerLesson: 400,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 1,
          attendedCount: 1,
          isConducted: true
        },
        {
          id: 'sm_l_fri_4',
          strLessonDate: '2026-09-25',
          date: '2026-09-25',
          groupName: '4. GIZ Group 6 English Empire',
          groupOrStudent: '4. GIZ Group 6 English Empire',
          startTime: '16:00',
          endTime: '17:30',
          durationMinutes: 90,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '600.00 ₴',
          teacherRatePerLesson: 600,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 9,
          attendedCount: 9,
          isConducted: true
        }
      ]
    },
    {
      date: '2026-09-26',
      dayName: 'Субота (26/09/2026)',
      subtotalMinutes: 180,
      subtotalWageFormatted: '800.00 ₴',
      subtotalWageNumeric: 800,
      lessons: [
        {
          id: 'sm_l_sat_1',
          strLessonDate: '2026-09-26',
          date: '2026-09-26',
          groupName: '1. Oksana Novakh NovaPay',
          groupOrStudent: '1. Oksana Novakh NovaPay',
          startTime: '11:00',
          endTime: '12:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '400.00 ₴',
          teacherRatePerLesson: 400,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 1,
          attendedCount: 1,
          isConducted: true
        },
        {
          id: 'sm_l_sat_2',
          strLessonDate: '2026-09-26',
          date: '2026-09-26',
          groupName: '2. Dmytro Melnyk NovaPay',
          groupOrStudent: '2. Dmytro Melnyk NovaPay',
          startTime: '12:00',
          endTime: '13:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '400.00 ₴',
          teacherRatePerLesson: 400,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 1,
          attendedCount: 1,
          isConducted: true
        },
        {
          id: 'sm_l_sat_3',
          strLessonDate: '2026-09-26',
          date: '2026-09-26',
          groupName: '3. Mykola Dovban Veleton',
          groupOrStudent: '3. Mykola Dovban Veleton',
          startTime: '14:00',
          endTime: '15:00',
          durationMinutes: 60,
          lessonStatusName: 'Trial Success',
          attendanceChecked: true,
          classDetailsAdded: true,
          teacherRate: '0.00 ₴',
          teacherRatePerLesson: 0,
          currencySymbol: '₴',
          className: 'General English',
          enrolledStudents: 1,
          attendedCount: 1,
          isConducted: true
        }
      ]
    }
  ]
};

// Zoom Occurrences Fixtures for Saturday 2026-09-26
export const FIXTURE_ZOOM_OCCURRENCES_SATURDAY = [
  {
    uuid: 'crm004-occ-sat-1',
    numeric_meeting_id: '9258799407',
    topic: "Olha Kushnirchuk's Personal Meeting Room",
    host_email: 'helhakushnirchuk@gmail.com',
    start_time: '2026-09-26T07:59:19Z',
    end_time: '2026-09-26T08:59:49Z',
    duration_seconds: 3630,
    participants: {
      p_host: {
        user_id: 'u_olha_1',
        email: 'helhakushnirchuk@gmail.com',
        name: 'Olha Kushnirchuk',
        is_host: true,
        sessions: [
          { join_time: '2026-09-26T07:59:19Z', leave_time: '2026-09-26T08:59:49Z' }
        ]
      },
      p_student_oksana: {
        user_id: 'u_oksana',
        email: 'oksana@novapay.ua',
        name: 'Оксана',
        is_host: false,
        sessions: [
          { join_time: '2026-09-26T07:59:40Z', leave_time: '2026-09-26T08:59:48Z' } // ~3608s overlap
        ]
      },
      p_student_dmytro: {
        user_id: 'u_dmytro_early',
        email: null,
        name: 'Dmytro',
        is_host: false,
        sessions: [] // connection time unavailable
      }
    }
  },
  {
    uuid: 'crm004-occ-sat-2',
    numeric_meeting_id: '9258799407',
    topic: "Olha Kushnirchuk's Personal Meeting Room",
    host_email: 'helhakushnirchuk@gmail.com',
    start_time: '2026-09-26T08:59:57Z',
    end_time: '2026-09-26T09:59:04Z',
    duration_seconds: 3547,
    participants: {
      p_host: {
        user_id: 'u_olha_2',
        email: 'helhakushnirchuk@gmail.com',
        name: 'Olha Kushnirchuk',
        is_host: true,
        sessions: [
          { join_time: '2026-09-26T08:59:57Z', leave_time: '2026-09-26T09:59:04Z' }
        ]
      },
      p_student_dmytro_melnyk: {
        user_id: 'u_dmytro_m',
        email: null,
        name: 'Dmytro',
        is_host: false,
        sessions: [
          { join_time: '2026-09-26T09:00:27Z', leave_time: '2026-09-26T09:59:03Z' } // 3516s overlap
        ]
      }
    }
  },
  {
    uuid: 'crm004-occ-sat-3',
    numeric_meeting_id: '9258799407',
    topic: "Olha Kushnirchuk's Personal Meeting Room",
    host_email: 'helhakushnirchuk@gmail.com',
    start_time: '2026-09-26T10:59:58Z',
    end_time: '2026-09-26T12:00:45Z',
    duration_seconds: 3647,
    participants: {
      p_host: {
        user_id: 'u_olha_3',
        email: 'helhakushnirchuk@gmail.com',
        name: 'Olha Kushnirchuk',
        is_host: true,
        sessions: [
          { join_time: '2026-09-26T10:59:58Z', leave_time: '2026-09-26T12:00:44Z' }
        ]
      },
      p_student_mykola: {
        user_id: 'u_mykola',
        email: null,
        name: 'Довбань Николай',
        is_host: false,
        sessions: [
          { join_time: '2026-09-26T11:00:00Z', leave_time: '2026-09-26T12:00:45Z' } // 3644s overlap
        ]
      }
    }
  },
  {
    uuid: 'crm004-occ-sat-4-incomplete',
    numeric_meeting_id: '9258799407',
    topic: "Olha Kushnirchuk's Personal Meeting Room",
    host_email: 'helhakushnirchuk@gmail.com',
    start_time: '2026-09-26T10:59:58Z',
    end_time: null,
    duration_seconds: null,
    participants: {
      p_host: {
        user_id: 'u_olha_4',
        email: 'helhakushnirchuk@gmail.com',
        name: 'Olha Kushnirchuk',
        is_host: true,
        sessions: [
          { join_time: '2026-09-26T10:59:58Z', leave_time: null }
        ]
      }
    }
  }
];
