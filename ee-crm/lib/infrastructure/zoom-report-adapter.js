// ee-crm/lib/infrastructure/zoom-report-adapter.js
// Pure domain adapter transforming Zoom Report API payloads into authoritative EE-CRM occurrences.

import {
  toSafeOccurrenceId,
  calculateIntervalUnionSeconds,
  validateOccurrenceInvariants
} from '../domain/zoom-occurrence.js';

/**
 * Adapts raw Zoom Report API meeting and participant records into the standard EE-CRM occurrence model.
 * 
 * @param {object} rawMeeting - Raw meeting record from GET /v2/report/users/{userId}/meetings
 * @param {Array<object>} [rawParticipants=[]] - Participant records from GET /v2/report/meetings/{meetingId}/participants
 * @param {string} hostEmail - Canonical host email address
 * @returns {object} Validated authoritative occurrence object
 */
export function adaptZoomReportToOccurrence(rawMeeting, rawParticipants = [], hostEmail = '') {
  if (!rawMeeting || typeof rawMeeting !== 'object') {
    throw new Error('rawMeeting object is required');
  }
  if (!rawMeeting.uuid) {
    throw new Error('rawMeeting must contain a uuid');
  }

  const normHostEmail = String(hostEmail || rawMeeting.host_email || '').toLowerCase().trim();
  const uuid = String(rawMeeting.uuid).trim();
  const numericMeetingId = rawMeeting.id !== undefined && rawMeeting.id !== null ? String(rawMeeting.id).trim() : null;

  const participantsMap = {};

  const findParticipantKey = (userId, email, name) => {
    const normUserId = userId ? String(userId).trim() : null;
    const normEmail = email ? String(email).toLowerCase().trim() : null;

    for (const [key, p] of Object.entries(participantsMap)) {
      if (normEmail && p.email && p.email.toLowerCase().trim() === normEmail) {
        return key;
      }
      if (normUserId && p.user_id && String(p.user_id).trim() === normUserId) {
        return key;
      }
    }

    if (!normEmail && !normUserId && name) {
      const normName = name.toLowerCase().trim();
      for (const [key, p] of Object.entries(participantsMap)) {
        if (!p.email && !p.user_id && p.name && p.name.toLowerCase().trim() === normName) {
          return key;
        }
      }
    }

    return null;
  };

  const participantsList = Array.isArray(rawParticipants) ? rawParticipants : [];

  for (let idx = 0; idx < participantsList.length; idx++) {
    const rawP = participantsList[idx];
    if (!rawP || typeof rawP !== 'object') continue;

    const email = (rawP.email || rawP.user_email || '').toLowerCase().trim() || null;
    const userId = rawP.user_id !== undefined && rawP.user_id !== null && String(rawP.user_id).trim()
      ? String(rawP.user_id).trim()
      : (rawP.id !== undefined && rawP.id !== null && String(rawP.id).trim() ? String(rawP.id).trim() : null);
    const name = (rawP.name || rawP.user_name || '').trim() || (email || (userId ? `User ${userId}` : 'Guest'));
    const status = rawP.status || 'in_meeting';

    const isHost = userId === '16778240' ||
      (Boolean(normHostEmail) && email === normHostEmail) ||
      (rawMeeting.host_id && (userId === String(rawMeeting.host_id) || (rawP.id && String(rawP.id) === String(rawMeeting.host_id)))) ||
      Boolean(rawP.is_host);

    let key = findParticipantKey(userId, email, name);
    if (!key) {
      if (email) {
        key = `email_${email}`;
      } else if (userId) {
        key = `user_${userId}`;
      } else {
        key = `p_${idx + 1}`;
      }
      participantsMap[key] = {
        user_id: userId,
        email,
        name,
        is_host: Boolean(isHost),
        status,
        sessions: [],
        duration_seconds: 0,
        duration_state: 'complete'
      };
    }

    const p = participantsMap[key];
    if (!p.email && email) p.email = email;
    if (!p.user_id && userId) p.user_id = userId;
    if ((!p.name || p.name === 'Guest') && name) p.name = name;
    if (isHost) p.is_host = true;
    if (status === 'in_meeting') {
      p.status = 'in_meeting';
    }

    if (rawP.join_time) {
      const session = {
        join_time: rawP.join_time,
        leave_time: rawP.leave_time || null
      };
      const exists = p.sessions.some(
        s => s.join_time === session.join_time && (s.leave_time === session.leave_time || (!s.leave_time && !session.leave_time))
      );
      if (!exists) {
        p.sessions.push(session);
      }
    }
  }

  for (const p of Object.values(participantsMap)) {
    p.sessions.sort((a, b) => (Date.parse(a.join_time) || 0) - (Date.parse(b.join_time) || 0));
    p.duration_seconds = calculateIntervalUnionSeconds(p.sessions);
  }

  let durationSeconds = 0;
  if (rawMeeting.duration !== undefined && rawMeeting.duration !== null) {
    durationSeconds = Number(rawMeeting.duration) * 60;
  } else if (rawMeeting.start_time && rawMeeting.end_time) {
    const sMs = Date.parse(rawMeeting.start_time);
    const eMs = Date.parse(rawMeeting.end_time);
    if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs >= sMs) {
      durationSeconds = Math.round((eMs - sMs) / 1000);
    }
  }

  const occurrence = {
    occurrence_id: uuid,
    uuid,
    identity_kind: 'exact_uuid',
    numeric_meeting_id: numericMeetingId,
    topic: rawMeeting.topic || 'Zoom Meeting',
    host_id: rawMeeting.host_id || null,
    host_email: normHostEmail,
    start_time: rawMeeting.start_time,
    end_time: rawMeeting.end_time || null,
    duration_seconds: durationSeconds,
    duration_state: 'complete',
    participants: participantsMap,
    revision: 1,
    source_updated_at: rawMeeting.end_time || rawMeeting.start_time || new Date().toISOString()
  };

  const validation = validateOccurrenceInvariants(occurrence);
  if (!validation.valid) {
    throw new Error(`Occurrence invariant validation failed: ${validation.errors.join(', ')}`);
  }

  return occurrence;
}
