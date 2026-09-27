// ee-crm/verification/fixtures/crm-001-zoom-fixtures.mjs
// Test fixtures for CRM-001: Display tracked Zoom meetings on teacher page

export const FIXTURE_TEACHER_YULIIA = {
  firstName: 'Yuliia',
  lastName: 'Savchuk',
  email: 'yuliasavchuk03@gmail.com',
  schoolmateTeacherId: 17251,
  zoomHostEmail: 'yuliasavchuk03@gmail.com',
  schoolmateLogin: 'savchuk.y'
};

export const FIXTURE_TEACHER_UNMAPPED = {
  firstName: 'Unmapped',
  lastName: 'Teacher',
  email: '',
  zoomHostEmail: '',
  schoolmateTeacherId: 99999,
  schoolmateLogin: 'unmapped.t'
};

export const SHARED_ROOM_NUMERIC_ID = '89411204451';

export const FIXTURE_OCCURRENCES = [
  // 1. First occurrence sharing numeric ID 89411204451 (Week 1, Mon Sep 14)
  {
    uuid: 'zoom_uuid_occ_001_kyiv_sep14',
    numeric_meeting_id: SHARED_ROOM_NUMERIC_ID,
    topic: 'Alena Medvedieva Sushi Icons [GE, English]',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-14T05:00:00Z',
    end_time: '2026-09-14T06:00:00Z',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: 'yuliasavchuk03@gmail.com',
        is_host: true,
        first_join_time: '2026-09-14T04:58:00Z',
        last_leave_time: '2026-09-14T06:01:00Z',
        sessions: [
          { join_time: '2026-09-14T04:58:00Z', leave_time: '2026-09-14T06:01:00Z' }
        ]
      },
      student1: {
        name: 'Alena Medvedieva',
        email: 'alena@example.com',
        is_host: false,
        first_join_time: '2026-09-14T05:01:00Z',
        last_leave_time: '2026-09-14T05:58:00Z',
        sessions: [
          { join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }
        ]
      }
    }
  },

  // 2. Second occurrence sharing same numeric ID 89411204451 (Week 1, Tue Sep 15)
  {
    uuid: 'zoom_uuid_occ_002_kyiv_sep15',
    numeric_meeting_id: SHARED_ROOM_NUMERIC_ID,
    topic: 'Dasha Pasichna NovaPay [GE, English]',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-15T10:00:00Z',
    end_time: '2026-09-15T11:00:00Z',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: 'yuliasavchuk03@gmail.com',
        is_host: true,
        first_join_time: '2026-09-15T09:59:00Z',
        last_leave_time: '2026-09-15T11:00:00Z',
        sessions: [
          { join_time: '2026-09-15T09:59:00Z', leave_time: '2026-09-15T11:00:00Z' }
        ]
      },
      student2: {
        name: 'Dasha Pasichna',
        email: 'dasha@example.com',
        is_host: false,
        first_join_time: '2026-09-15T10:02:00Z',
        last_leave_time: '2026-09-15T10:59:00Z',
        sessions: [
          { join_time: '2026-09-15T10:02:00Z', leave_time: '2026-09-15T10:59:00Z' }
        ]
      }
    }
  },

  // 3. Incomplete meeting without end boundary (Wed Sep 16)
  {
    uuid: 'zoom_uuid_occ_003_incomplete',
    numeric_meeting_id: '555666777',
    topic: 'In-progress Lesson Without End Webhook',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-16T12:00:00Z',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: 'yuliasavchuk03@gmail.com',
        is_host: true,
        first_join_time: '2026-09-16T12:00:00Z',
        sessions: [{ join_time: '2026-09-16T12:00:00Z' }]
      }
    }
  },

  // 4. URL-sensitive UUID containing +, /, = (Thu Sep 17)
  {
    uuid: 'zoom_uuid_tricky+/=123',
    numeric_meeting_id: '888777666',
    topic: 'URL Sensitive Meeting',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-17T09:00:00Z',
    end_time: '2026-09-17T10:00:00Z',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: 'yuliasavchuk03@gmail.com',
        is_host: true,
        duration_seconds: 3600
      }
    }
  },

  // 5. Future occurrence in Week 2 (Fri Sep 25)
  {
    uuid: 'zoom_uuid_occ_004_next_week',
    numeric_meeting_id: '111222333',
    topic: 'Next Week Lesson',
    host_email: 'yuliasavchuk03@gmail.com',
    start_time: '2026-09-25T08:00:00Z',
    end_time: '2026-09-25T09:00:00Z',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: 'yuliasavchuk03@gmail.com',
        is_host: true,
        duration_seconds: 3600
      }
    }
  },

  // 6. Another teacher's meeting to test host isolation (Mon Sep 14)
  {
    uuid: 'zoom_uuid_occ_005_iryna',
    numeric_meeting_id: '999000111',
    topic: 'Pavlo Simonenko DTEK',
    host_email: 'zhur.zhur.irene@gmail.com',
    start_time: '2026-09-14T05:00:00Z',
    end_time: '2026-09-14T06:00:00Z',
    participants: {
      host: {
        name: 'Zhuravlova Iryna',
        email: 'zhur.zhur.irene@gmail.com',
        is_host: true,
        duration_seconds: 3600
      }
    }
  }
];
