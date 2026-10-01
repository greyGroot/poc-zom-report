// ee-crm/verification/fixtures/crm-013-roster-fixtures.mjs
// Comprehensive Test Fixtures and Golden Datasets for CRM-013: Display Group Students Roster

export const PROD_VERIFICATION_BASE_URL = 'https://poc-zom-report-2qvs.vercel.app';
export const LOCAL_VERIFICATION_BASE_URL = 'http://localhost:3000';

// Target 1: Teacher t_0fa2ff7f (Zhuravlova Iryna) on Monday 2026-09-28
export const TARGET_TEACHER_1 = {
  id: 't_0fa2ff7f',
  fullName: 'Zhuravlova Iryna',
  date: '2026-09-28',
  scheduleQueryUrl: '/teachers/t_0fa2ff7f?from=2026-09-28&to=2026-10-04&preset=thisWeek',
  dayDetailsUrl: '/teachers/t_0fa2ff7f/2026-09-28',
  apiDayUrl: '/api/teachers/t_0fa2ff7f/days/2026-09-28',
  groupLesson: {
    groupLessonId: 8669771,
    groupId: 154734,
    groupName: 'GIZ Group 8 English Empire',
    startTime: '15:00',
    endTime: '16:30',
    durationMinutes: 90,
    expectedStudentCount: 6,
    expectedStudents: [
      { id: 357155, fullName: 'Goncharov Andrii', firstName: 'Andrii', lastName: 'Goncharov' },
      { id: 357156, fullName: 'Khyzhniak Valentyna', firstName: 'Valentyna', lastName: 'Khyzhniak' },
      { id: 357157, fullName: 'Pynzaru Anastasiia', firstName: 'Anastasiia', lastName: 'Pynzaru' },
      { id: 357158, fullName: 'Sytiuk Antonina', firstName: 'Antonina', lastName: 'Sytiuk' },
      { id: 357159, fullName: 'Tsyberman Anastasiia', firstName: 'Anastasiia', lastName: 'Tsyberman' },
      { id: 357160, fullName: 'Zahorodniuk Vira', firstName: 'Vira', lastName: 'Zahorodniuk' }
    ],
    expectedStudentNames: [
      'Goncharov Andrii',
      'Khyzhniak Valentyna',
      'Pynzaru Anastasiia',
      'Sytiuk Antonina',
      'Tsyberman Anastasiia',
      'Zahorodniuk Vira'
    ],
    forbiddenStrings: [
      'Planned: 9',
      '9 students planned',
      '9/9 Attended',
      'Attended: 9/9'
    ]
  },
  individualLesson: {
    groupLessonId: 9832204,
    groupId: 143755,
    groupName: 'Natalya Nosanenko GSK Eng',
    expectedStudentName: 'Natalya Nosanenko',
    expectedStudentCount: 1,
    isIndividual: true
  }
};

// Target 2: Teacher t_759a0536 (Savchuk Yuliia) on Monday 2026-09-28
export const TARGET_TEACHER_2 = {
  id: 't_759a0536',
  fullName: 'Savchuk Yuliia',
  date: '2026-09-28',
  scheduleQueryUrl: '/teachers/t_759a0536?from=2026-09-28&to=2026-09-28',
  dayDetailsUrl: '/teachers/t_759a0536/2026-09-28',
  apiDayUrl: '/api/teachers/t_759a0536/days/2026-09-28',
  groupLesson: {
    groupLessonId: 8648498,
    groupId: 154643,
    groupName: 'NovaPay A2+/2',
    startTime: '13:00',
    endTime: '14:00',
    durationMinutes: 60,
    expectedStudentCount: 4,
    expectedStudents: [
      { id: 356101, fullName: 'Bevz Serhii', firstName: 'Serhii', lastName: 'Bevz' },
      { id: 356102, fullName: 'Kozachuk Anna', firstName: 'Anna', lastName: 'Kozachuk' },
      { id: 356103, fullName: 'Riabokon Tetiana', firstName: 'Tetiana', lastName: 'Riabokon' },
      { id: 356104, fullName: 'Yerunova Nataliia', firstName: 'Nataliia', lastName: 'Yerunova' }
    ],
    expectedStudentNames: [
      'Bevz Serhii',
      'Kozachuk Anna',
      'Riabokon Tetiana',
      'Yerunova Nataliia'
    ],
    forbiddenStrings: [
      'Planned: 5',
      '5 students planned',
      '5/5 Attended',
      'Attended: 5/5'
    ]
  },
  individualLesson: {
    groupLessonId: 8733688,
    groupId: 154897,
    groupName: 'Artem Nepotachev Knauf',
    expectedStudentName: 'Artem Nepotachev',
    expectedStudentCount: 1,
    isIndividual: true
  }
};

// Target Zoom Backfill Expectations for 26-29 Sep 2026
export const TARGET_ZOOM_BACKFILL = {
  olha: {
    id: 't_5e3f31e6',
    email: 'helhakushnirchuk@gmail.com',
    fullName: 'Olha Kushnirchuk',
    expectedOccurrences: {
      '2026-09-26': 3,
      '2026-09-28': 2,
      '2026-09-29': 5
    }
  },
  irina: {
    id: 't_0fa2ff7f',
    email: 'zhur.zhur.irene@gmail.com',
    fullName: 'Zhuravlova Iryna',
    expectedOccurrences: {
      '2026-09-27': 1,
      '2026-09-29': 1
    }
  }
};

