// ee-crm/verification/fixtures/crm-003-zoom-fixtures.mjs
// Test fixtures for CRM-003: Migrate legacy Zoom meetings and connect live webhook ingestion

export const FIXTURE_HOST_EMAIL = 'yuliasavchuk03@gmail.com';
export const FIXTURE_TEACHER_ID = 't_crm003_yuliia';
export const FIXTURE_SHARED_ROOM_ID = '98765432101';

export const FIXTURE_HISTORICAL_DATE = '2026-09-25';
export const FIXTURE_SAVCHUK_HISTORY_UUID = 'uuid_hist_savchuk_personal_room_sep25';
export const FIXTURE_SAVCHUK_HISTORY_ROOM_ID = '5445746456';

// Legacy meetings in Redis (zoom:meeting:{numericId} schema)
export const FIXTURE_LEGACY_MEETINGS = {
  // Screenshot regression: Savchuk's 25 September personal-room lesson with two students.
  [FIXTURE_SAVCHUK_HISTORY_ROOM_ID]: {
    meeting_id: FIXTURE_SAVCHUK_HISTORY_ROOM_ID,
    meetingId: FIXTURE_SAVCHUK_HISTORY_ROOM_ID,
    uuid: FIXTURE_SAVCHUK_HISTORY_UUID,
    topic: "Юлія Савчук's Personal Meeting Room",
    host_id: 'zoom_host_yuliia_01',
    host_email: FIXTURE_HOST_EMAIL,
    host_name: 'Юлія Савчук',
    start_time: '2026-09-25T10:02:00Z',
    end_time: '2026-09-25T11:08:00Z',
    duration: 66,
    status: 'ended',
    participants: {
      host: {
        user_id: 'zoom_host_yuliia_01',
        name: 'Юлія Савчук',
        email: FIXTURE_HOST_EMAIL,
        is_host: true,
        sessions: [
          { join_time: '2026-09-25T10:02:00Z', leave_time: '2026-09-25T11:08:00Z' }
        ]
      },
      studentBevz: {
        user_id: '16782336',
        name: 'bevz.s',
        is_host: false,
        sessions: [
          { join_time: '2026-09-25T10:02:00Z', leave_time: '2026-09-25T10:14:08Z' }
        ]
      },
      studentAnna: {
        user_id: '16783360',
        name: 'Анна Козачук',
        is_host: false,
        sessions: [
          { join_time: '2026-09-25T10:03:00Z', leave_time: '2026-09-25T11:08:00Z' }
        ]
      }
    }
  },

  // 1. Valid historical meeting for 2026-09-25 (Scenario 4 & 5)
  '98765432101': {
    meeting_id: '98765432101',
    meetingId: '98765432101',
    uuid: 'uuid_hist_sep25_lesson_01',
    topic: 'Historical Class Sep 25 [General English]',
    host_id: 'zoom_host_yuliia_01',
    host_email: FIXTURE_HOST_EMAIL,
    host_name: 'Savchuk Yuliia',
    start_time: '2026-09-25T08:00:00Z',
    end_time: '2026-09-25T08:50:00Z',
    duration: 50,
    status: 'ended',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: FIXTURE_HOST_EMAIL,
        is_host: true,
        sessions: [
          { join_time: '2026-09-25T07:58:00Z', leave_time: '2026-09-25T08:52:00Z' }
        ]
      },
      student1: {
        name: 'Student Olena',
        email: 'olena.student@example.com',
        is_host: false,
        sessions: [
          // Reconnecting student: 15m + 30m = 45m (2700s)
          { join_time: '2026-09-25T08:00:00Z', leave_time: '2026-09-25T08:15:00Z' },
          { join_time: '2026-09-25T08:18:00Z', leave_time: '2026-09-25T08:48:00Z' }
        ]
      }
    }
  },

  // 2. Second historical meeting with tricky UUID containing +, /, =
  '88811122233': {
    meeting_id: '88811122233',
    meetingId: '88811122233',
    uuid: 'uuid_hist_tricky+/=sep25_02',
    topic: 'Tricky UUID Historical Class',
    host_id: 'zoom_host_yuliia_01',
    host_email: FIXTURE_HOST_EMAIL,
    host_name: 'Savchuk Yuliia',
    start_time: '2026-09-25T11:00:00Z',
    end_time: '2026-09-25T12:00:00Z',
    duration: 60,
    status: 'ended',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: FIXTURE_HOST_EMAIL,
        is_host: true,
        sessions: [
          { join_time: '2026-09-25T11:00:00Z', leave_time: '2026-09-25T12:00:00Z' }
        ]
      }
    }
  },

  // 3. Historical meeting with incomplete duration (missing end boundary)
  '77733344455': {
    meeting_id: '77733344455',
    meetingId: '77733344455',
    uuid: 'uuid_hist_incomplete_sep25',
    topic: 'Incomplete Historical Meeting',
    host_email: FIXTURE_HOST_EMAIL,
    start_time: '2026-09-25T14:00:00Z',
    status: 'started',
    participants: {
      host: {
        name: 'Savchuk Yuliia',
        email: FIXTURE_HOST_EMAIL,
        is_host: true,
        sessions: [
          { join_time: '2026-09-25T14:00:00Z' }
        ]
      }
    }
  },

  // 4. Invalid meeting: Missing UUID (should be audited and skipped)
  '66655544433': {
    meeting_id: '66655544433',
    meetingId: '66655544433',
    uuid: '',
    topic: 'Legacy Call Without UUID',
    host_email: FIXTURE_HOST_EMAIL,
    start_time: '2026-09-25T16:00:00Z',
    status: 'ended'
  },

  // 5. Invalid meeting: Missing Host Email (should be audited and skipped)
  '55544433322': {
    meeting_id: '55544433322',
    meetingId: '55544433322',
    uuid: 'uuid_no_host_email',
    topic: 'Legacy Call Without Host',
    host_email: '',
    start_time: '2026-09-25T17:00:00Z',
    status: 'ended'
  }
};

// Webhook payloads for live ingestion
export const FIXTURE_WEBHOOK_CRC = {
  event: 'endpoint.url_validation',
  payload: {
    plainToken: 'test_token_crm003_crc_validation'
  }
};

export const FIXTURE_LIVE_UUID_1 = 'live_uuid_crm003_meeting_01';
export const FIXTURE_LIVE_UUID_2 = 'live_uuid_crm003_meeting_02_reused_room';

export const FIXTURE_WEBHOOK_STARTED_1 = {
  event: 'meeting.started',
  payload: {
    account_id: 'act_123',
    object: {
      id: FIXTURE_SHARED_ROOM_ID,
      uuid: FIXTURE_LIVE_UUID_1,
      topic: 'Live Ingested Class 1',
      host_id: 'host_crm003',
      host_email: FIXTURE_HOST_EMAIL,
      start_time: '2026-09-26T10:00:00Z',
      timezone: 'Europe/Kyiv'
    }
  }
};

export const FIXTURE_WEBHOOK_JOINED_HOST_1 = {
  event: 'meeting.participant_joined',
  payload: {
    account_id: 'act_123',
    object: {
      id: FIXTURE_SHARED_ROOM_ID,
      uuid: FIXTURE_LIVE_UUID_1,
      host_email: FIXTURE_HOST_EMAIL,
      participant: {
        user_id: 'u_host_01',
        user_name: 'Savchuk Yuliia',
        email: FIXTURE_HOST_EMAIL,
        join_time: '2026-09-26T09:58:00Z'
      }
    }
  }
};

export const FIXTURE_WEBHOOK_JOINED_STUDENT_1 = {
  event: 'meeting.participant_joined',
  payload: {
    account_id: 'act_123',
    object: {
      id: FIXTURE_SHARED_ROOM_ID,
      uuid: FIXTURE_LIVE_UUID_1,
      host_email: FIXTURE_HOST_EMAIL,
      participant: {
        user_id: 'u_student_99',
        user_name: 'Live Student Alex',
        email: 'alex@example.com',
        join_time: '2026-09-26T10:00:00Z'
      }
    }
  }
};

export const FIXTURE_WEBHOOK_ENDED_1 = {
  event: 'meeting.ended',
  payload: {
    account_id: 'act_123',
    object: {
      id: FIXTURE_SHARED_ROOM_ID,
      uuid: FIXTURE_LIVE_UUID_1,
      host_email: FIXTURE_HOST_EMAIL,
      start_time: '2026-09-26T10:00:00Z',
      end_time: '2026-09-26T10:45:00Z',
      duration: 45
    }
  }
};

export const FIXTURE_WEBHOOK_REUSED_ROOM_2 = {
  event: 'meeting.started',
  payload: {
    account_id: 'act_123',
    object: {
      id: FIXTURE_SHARED_ROOM_ID,
      uuid: FIXTURE_LIVE_UUID_2,
      topic: 'Live Ingested Class 2 (Reused Numeric Room)',
      host_id: 'host_crm003',
      host_email: FIXTURE_HOST_EMAIL,
      start_time: '2026-09-26T12:00:00Z',
      timezone: 'Europe/Kyiv'
    }
  }
};
