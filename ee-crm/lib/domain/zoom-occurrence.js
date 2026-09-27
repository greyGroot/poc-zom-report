// api/lib/zoom-occurrence.js
// Pure domain logic for Zoom Meeting Occurrence facts, deterministic reduction,
// schema projections, and legacy POC meeting transformations.

import crypto from 'node:crypto';

/**
 * Encodes an exact Zoom UUID or canonical occurrence ID into a base64url string safe for URLs, DOM IDs, and Redis keys.
 * Omits any '=', '/', or '+' characters.
 * @param {string} uuidOrId
 * @returns {string}
 */
export function toSafeOccurrenceId(uuidOrId) {
  if (!uuidOrId) return '';
  return Buffer.from(String(uuidOrId), 'utf-8')
    .toString('base64url')
    .replace(/=/g, '');
}

/**
 * Decodes a safe occurrence ID back to the exact Zoom UUID or canonical occurrence ID.
 * @param {string} safeId
 * @returns {string}
 */
export function fromSafeOccurrenceId(safeId) {
  if (!safeId) return '';
  return Buffer.from(String(safeId), 'base64url').toString('utf-8');
}

/**
 * Derives a deterministic canonical occurrence ID for historical Zoom evidence lacking a recoverable UUID.
 * @param {string|number} numericMeetingId
 * @param {string} startTime
 * @returns {string} e.g. "legacy:poc:v1:<sha256>"
 */
export function deriveLegacyDerivedId(numericMeetingId, startTime) {
  const normMeetingId = String(numericMeetingId || '').trim();
  const normStartTime = String(startTime || '').trim();
  const input = `${normMeetingId}|${normStartTime}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `legacy:poc:v1:${hash}`;
}

/**
 * Parses and normalizes occurrence identity representation.
 * @param {string|object} identity
 * @returns {{ occurrence_id: string, uuid: string|null, identity_kind: 'exact_uuid'|'legacy_derived', identity_provenance: object|null }}
 */
export function parseOccurrenceIdentity(identity) {
  if (!identity) {
    throw new Error('Occurrence identity is required');
  }
  if (typeof identity === 'object') {
    const occurrenceId = identity.occurrence_id || identity.occurrenceId || identity.uuid;
    const isLegacy = identity.identity_kind === 'legacy_derived' || identity.identityKind === 'legacy_derived' || !identity.uuid;
    return {
      occurrence_id: occurrenceId,
      uuid: isLegacy ? null : (identity.uuid || occurrenceId),
      identity_kind: isLegacy ? 'legacy_derived' : 'exact_uuid',
      identity_provenance: identity.identity_provenance || identity.identityProvenance || null
    };
  }

  const idStr = String(identity).trim();
  if (idStr.startsWith('legacy:poc:v1:')) {
    return {
      occurrence_id: idStr,
      uuid: null,
      identity_kind: 'legacy_derived',
      identity_provenance: null
    };
  }

  return {
    occurrence_id: idStr,
    uuid: idStr,
    identity_kind: 'exact_uuid',
    identity_provenance: null
  };
}

/**
 * Calculate the union duration in seconds across session intervals,
 * preventing double-counting of overlapping sessions (e.g. PC + Phone).
 * @param {Array<{ join_time?: string, leave_time?: string }>} sessions
 * @returns {number} Duration in seconds
 */
export function calculateIntervalUnionSeconds(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0;

  const intervals = [];
  for (const s of sessions) {
    if (!s || !s.join_time) continue;
    const start = Date.parse(s.join_time);
    const end = s.leave_time ? Date.parse(s.leave_time) : null;
    if (Number.isNaN(start)) continue;
    if (end !== null && !Number.isNaN(end) && end >= start) {
      intervals.push([start, end]);
    }
  }

  if (intervals.length === 0) return 0;

  // Sort intervals by start timestamp ascending
  intervals.sort((a, b) => a[0] - b[0]);

  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i];
    const prev = merged[merged.length - 1];
    if (current[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  let totalMs = 0;
  for (const [start, end] of merged) {
    totalMs += (end - start);
  }

  return Math.round(totalMs / 1000);
}

/**
 * Deterministic SHA-256 fingerprint for an event fact.
 * @param {object} fact
 * @returns {string} Hex string (first 16 chars)
 */
export function deriveFactFingerprint(fact) {
  const norm = {
    type: fact.type,
    uuid: fact.uuid || fact.occurrence_id || '',
    occurrence_id: fact.occurrence_id || fact.uuid || '',
    source_timestamp: fact.source_timestamp || '',
    user_id: fact.user_id || '',
    email: (fact.email || '').toLowerCase().trim(),
    join_time: fact.join_time || '',
    leave_time: fact.leave_time || '',
    action: fact.action || '',
    boundary: fact.boundary || ''
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(norm))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Normalize an incoming Zoom webhook event into one or more immutable facts.
 * @param {string} event
 * @param {object} payload
 * @returns {Array<object>} Normalized facts
 */
export function normalizeWebhookEventToFacts(event, payload) {
  const object = (payload && typeof payload.object === 'object' && payload.object !== null)
    ? payload.object
    : {};

  const uuid = object.uuid ? String(object.uuid).trim() : null;
  if (!uuid) return [];

  const numericMeetingId = object.id || object.meeting_id ? String(object.id || object.meeting_id).trim() : null;
  const sourceTimestamp = payload.event_ts ? new Date(payload.event_ts).toISOString() : null;
  const commonMeetingEvidence = {
    occurrence_id: uuid,
    uuid,
    identity_kind: 'exact_uuid',
    numeric_meeting_id: numericMeetingId,
    topic: object.topic || 'Zoom Meeting',
    host_id: object.host_id || null,
    host_email: object.host_email ? object.host_email.toLowerCase().trim() : null,
    start_time: object.start_time || null,
    timezone: object.timezone || 'Europe/Kyiv'
  };

  if (event === 'meeting.started') {
    return [
      {
        ...commonMeetingEvidence,
        type: 'meeting.started',
        host_name: object.host_name || null,
        source_timestamp: sourceTimestamp || object.start_time || null
      }
    ];
  }

  if (event === 'meeting.ended') {
    return [
      {
        ...commonMeetingEvidence,
        type: 'meeting.ended',
        end_time: object.end_time || null,
        duration: object.duration !== undefined ? Number(object.duration) : null,
        source_timestamp: sourceTimestamp || object.end_time || null
      }
    ];
  }

  if (
    event === 'meeting.participant_joined' ||
    event === 'meeting.participant_admitted' ||
    event === 'meeting.participant_data_connection_established'
  ) {
    const p = object.participant || {};
    const rawUserId = p.user_id !== undefined && p.user_id !== null ? String(p.user_id).trim() : null;
    const rawZoomId = p.id !== undefined && p.id !== null ? String(p.id).trim() : null;
    const rawEmail = p.email || p.user_email ? String(p.email || p.user_email).toLowerCase().trim() : null;
    const rawName = p.user_name || p.name ? String(p.user_name || p.name).trim() : null;
    const joinTime = p.join_time || null;

    const isHost = rawUserId === '16778240' ||
      (object.host_id && (rawZoomId === String(object.host_id) || rawUserId === String(object.host_id))) ||
      (object.host_email && rawEmail && rawEmail === object.host_email.toLowerCase().trim());

    return [
      {
        ...commonMeetingEvidence,
        type: 'participant.joined',
        user_id: rawUserId,
        zoom_user_id: rawZoomId,
        email: rawEmail,
        name: rawName,
        is_host: Boolean(isHost),
        join_time: joinTime,
        source_timestamp: sourceTimestamp || joinTime || null
      }
    ];
  }

  if (
    event === 'meeting.participant_left' ||
    event === 'meeting.participant_left_waiting_room'
  ) {
    const p = object.participant || {};
    const rawUserId = p.user_id !== undefined && p.user_id !== null ? String(p.user_id).trim() : null;
    const rawZoomId = p.id !== undefined && p.id !== null ? String(p.id).trim() : null;
    const rawEmail = p.email || p.user_email ? String(p.email || p.user_email).toLowerCase().trim() : null;
    const rawName = p.user_name || p.name ? String(p.user_name || p.name).trim() : null;
    const leaveTime = p.leave_time || null;

    return [
      {
        ...commonMeetingEvidence,
        type: 'participant.left',
        user_id: rawUserId,
        zoom_user_id: rawZoomId,
        email: rawEmail,
        name: rawName,
        leave_time: leaveTime,
        source_timestamp: sourceTimestamp || leaveTime || null
      }
    ];
  }

  // Some retained Zoom evidence (for example waiting-room events) is not a
  // participant attendance fact, but still carries exact occurrence identity,
  // room, host and meeting boundaries. Preserve that factual anchor without
  // treating the waiting-room participant as an attendee.
  return [
    {
      ...commonMeetingEvidence,
      type: 'meeting.observed',
      source_event: event,
      source_timestamp: sourceTimestamp || object.start_time || null
    }
  ];
}

/**
 * Reduce a collection of occurrence facts into the authoritative occurrence projection.
 * Guaranteed to be deterministic regardless of fact input order.
 * @param {string|object} occurrenceIdentity - Exact Zoom UUID, derived ID string, or identity object
 * @param {Array<object>} facts
 * @param {object} [options]
 * @returns {object} Authoritative occurrence projection
 */
export function reduceOccurrenceFacts(occurrenceIdentity, facts, options = {}) {
  const parsedIdentity = parseOccurrenceIdentity(occurrenceIdentity);

  let numericMeetingId = null;
  let topic = 'Zoom Meeting';
  let hostId = null;
  let hostEmail = null;
  let startTime = null;
  let endTime = null;
  let explicitDuration = null;
  let latestSourceTime = null;

  // Track participants by stable presentation key
  // Participants without user_id or email get a unique key based on their first appearance fact
  const participants = {};

  const findParticipantKey = (userId, email) => {
    const normId = userId ? String(userId).trim() : null;
    const normEmail = email ? String(email).toLowerCase().trim() : null;

    if (!normId && !normEmail) return null;

    for (const [key, p] of Object.entries(participants)) {
      if (normId && p.user_id && String(p.user_id).trim() === normId) return key;
      if (normEmail && p.email && String(p.email).toLowerCase().trim() === normEmail) return key;
    }
    return null;
  };

  // Sort facts chronologically by source_timestamp, tie-break by fact type
  const sortedFacts = [...(facts || [])].sort((a, b) => {
    const tA = a.source_timestamp ? Date.parse(a.source_timestamp) : 0;
    const tB = b.source_timestamp ? Date.parse(b.source_timestamp) : 0;
    if (tA !== tB) return tA - tB;
    return (a.type || '').localeCompare(b.type || '');
  });

  for (const fact of sortedFacts) {
    if (fact.source_timestamp) {
      if (!latestSourceTime || Date.parse(fact.source_timestamp) > Date.parse(latestSourceTime)) {
        latestSourceTime = fact.source_timestamp;
      }
    }

    if (fact.numeric_meeting_id && !numericMeetingId) {
      numericMeetingId = fact.numeric_meeting_id;
    }

    // Zoom repeats occurrence metadata on many event types. Retain it even
    // when meeting.started was not present in the capped historical log.
    if (fact.topic && topic === 'Zoom Meeting') topic = fact.topic;
    if (fact.host_id && !hostId) hostId = fact.host_id;
    if (fact.host_email && !hostEmail) hostEmail = fact.host_email.toLowerCase().trim();
    if (fact.start_time && !startTime) startTime = fact.start_time;

    if (fact.type === 'meeting.started') {
      topic = fact.topic || topic;
      hostId = fact.host_id || hostId;
      if (fact.host_email) hostEmail = fact.host_email.toLowerCase().trim();
      if (fact.start_time && !startTime) startTime = fact.start_time;
    }

    if (fact.type === 'meeting.ended') {
      if (fact.end_time) endTime = fact.end_time;
      if (fact.duration !== null && fact.duration !== undefined) {
        explicitDuration = fact.duration;
      }
    }

    if (fact.type === 'participant.joined') {
      const uId = fact.user_id || null;
      const em = fact.email || null;
      let pKey = findParticipantKey(uId, em);

      if (!pKey) {
        // Strong stable key if ID or email present, else unique key
        // Prefer Zoom's stable user ID when both ID and email are present.
        // This keeps the canonical key independent of Redis hash iteration
        // order when duplicate facts alternately include/omit email.
        if (uId) pKey = `user_${uId}`;
        else if (em) pKey = `email_${em}`;
        else pKey = `anon_${deriveFactFingerprint(fact)}`;
      }

      if (!participants[pKey]) {
        participants[pKey] = {
          user_id: uId,
          zoom_user_id: fact.zoom_user_id || null,
          email: em,
          name: fact.name || null,
          is_host: Boolean(fact.is_host),
          sessions: []
        };
      }

      const p = participants[pKey];
      if (em && (!p.email || em.localeCompare(p.email) < 0)) p.email = em;
      if (fact.name && (!p.name || fact.name.localeCompare(p.name) < 0)) p.name = fact.name;
      if (fact.is_host) p.is_host = true;

      if (fact.join_time) {
        // Check for matching open session
        const hasOpen = p.sessions.some(s => s.join_time === fact.join_time);
        if (!hasOpen) {
          // Check for orphan leave session with no join_time
          const orphanLeave = p.sessions.find(s => !s.join_time && s.leave_time);
          if (orphanLeave) {
            orphanLeave.join_time = fact.join_time;
          } else {
            p.sessions.push({ join_time: fact.join_time, leave_time: null });
          }
        }
      }
    }

    if (fact.type === 'participant.left') {
      const uId = fact.user_id || null;
      const em = fact.email || null;
      let pKey = findParticipantKey(uId, em);

      if (!pKey) {
        if (uId) pKey = `user_${uId}`;
        else if (em) pKey = `email_${em}`;
        else pKey = `anon_${deriveFactFingerprint(fact)}`;
      }

      if (!participants[pKey]) {
        participants[pKey] = {
          user_id: uId,
          zoom_user_id: fact.zoom_user_id || null,
          email: em,
          name: fact.name || null,
          is_host: Boolean(fact.is_host),
          sessions: []
        };
      }

      const p = participants[pKey];
      if (em && (!p.email || em.localeCompare(p.email) < 0)) p.email = em;
      if (fact.name && (!p.name || fact.name.localeCompare(p.name) < 0)) p.name = fact.name;
      if (fact.is_host) p.is_host = true;
      if (fact.leave_time) {
        // Find most recent session with open leave_time
        const openSession = p.sessions.slice().reverse().find(s => !s.leave_time);
        if (openSession) {
          openSession.leave_time = fact.leave_time;
        } else {
          // Out of order: left arrived before joined
          const alreadyOrphan = p.sessions.some(s => !s.join_time && s.leave_time === fact.leave_time);
          if (!alreadyOrphan) {
            p.sessions.push({ join_time: null, leave_time: fact.leave_time });
          }
        }
      }
    }
  }

  // Auto-close open sessions on meeting.ended
  if (endTime) {
    for (const p of Object.values(participants)) {
      for (const s of p.sessions) {
        if (s.join_time && !s.leave_time) {
          s.leave_time = endTime;
        }
      }
    }
  }

  // Process participant durations and states
  const canonicalParticipants = {};
  const sortedPKeys = Object.keys(participants).sort();

  for (const k of sortedPKeys) {
    const p = participants[k];
    // Sort sessions chronologically
    p.sessions.sort((a, b) => {
      const tA = a.join_time ? Date.parse(a.join_time) : (a.leave_time ? Date.parse(a.leave_time) : 0);
      const tB = b.join_time ? Date.parse(b.join_time) : (b.leave_time ? Date.parse(b.leave_time) : 0);
      return tA - tB;
    });

    const durationSec = calculateIntervalUnionSeconds(p.sessions);
    const hasOpen = p.sessions.some(s => s.join_time && !s.leave_time);
    const hasOrphan = p.sessions.some(s => !s.join_time && s.leave_time);

    canonicalParticipants[k] = {
      user_id: p.user_id,
      email: p.email,
      name: p.name || p.email || (p.user_id ? `User ${p.user_id}` : 'Guest'),
      is_host: p.is_host,
      sessions: p.sessions,
      duration_seconds: durationSec,
      duration_state: hasOpen || hasOrphan ? 'incomplete' : 'complete'
    };
  }

  // Calculate meeting-level duration
  let durationSeconds = null;
  let durationState = 'unavailable';

  if (startTime && endTime) {
    const sMs = Date.parse(startTime);
    const eMs = Date.parse(endTime);
    if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs >= sMs) {
      durationSeconds = Math.round((eMs - sMs) / 1000);
      durationState = 'complete';
    }
  } else if (startTime && !endTime) {
    durationSeconds = null;
    durationState = 'incomplete';
  } else if (explicitDuration !== null && explicitDuration > 0) {
    durationSeconds = explicitDuration * 60;
    durationState = 'complete';
  }

  return {
    occurrence_id: parsedIdentity.occurrence_id,
    uuid: parsedIdentity.uuid,
    identity_kind: parsedIdentity.identity_kind,
    ...(parsedIdentity.identity_provenance ? { identity_provenance: parsedIdentity.identity_provenance } : {}),
    numeric_meeting_id: numericMeetingId,
    topic,
    host_id: hostId,
    host_email: hostEmail,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    duration_state: durationState,
    participants: canonicalParticipants,
    revision: sortedFacts.length,
    source_updated_at: latestSourceTime || startTime || new Date().toISOString()
  };
}

/**
 * Computes deterministic SHA-256 hash of canonicalized projection fields.
 * @param {object} projection
 * @returns {string} Hex SHA-256
 */
export function computeProjectionHash(projection) {
  if (!projection) return '';
  const canonical = {
    occurrence_id: projection.occurrence_id || projection.uuid || '',
    uuid: projection.uuid || null,
    identity_kind: projection.identity_kind || (projection.uuid ? 'exact_uuid' : 'legacy_derived'),
    numeric_meeting_id: projection.numeric_meeting_id ? String(projection.numeric_meeting_id).trim() : null,
    topic: projection.topic || '',
    host_email: projection.host_email ? projection.host_email.toLowerCase().trim() : '',
    start_time: projection.start_time || '',
    end_time: projection.end_time || '',
    duration_seconds: projection.duration_seconds !== undefined ? projection.duration_seconds : null,
    duration_state: projection.duration_state || '',
    participants: Object.keys(projection.participants || {}).sort().reduce((acc, k) => {
      const p = projection.participants[k];
      acc[k] = {
        name: p.name || '',
        email: p.email ? p.email.toLowerCase().trim() : '',
        user_id: p.user_id ? String(p.user_id).trim() : '',
        is_host: Boolean(p.is_host),
        duration_seconds: p.duration_seconds || 0,
        sessions: (p.sessions || []).map(s => ({
          join_time: s.join_time || '',
          leave_time: s.leave_time || ''
        }))
      };
      return acc;
    }, {})
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

/**
 * Validates domain invariants for an authoritative occurrence projection.
 * @param {object} occurrence
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateOccurrenceInvariants(occurrence) {
  const errors = [];
  if (!occurrence) {
    return { valid: false, errors: ['Occurrence is null or undefined'] };
  }
  const occId = occurrence.occurrence_id || occurrence.uuid;
  if (!occId) {
    errors.push('Missing occurrence_id or uuid');
  }

  const kind = occurrence.identity_kind || (occurrence.uuid ? 'exact_uuid' : 'legacy_derived');
  if (kind === 'exact_uuid') {
    if (!occurrence.uuid) {
      errors.push('Exact occurrence must have non-null uuid');
    } else if (occurrence.occurrence_id && occurrence.occurrence_id !== occurrence.uuid) {
      errors.push('Exact occurrence must have occurrence_id equal to uuid');
    }
  } else if (kind === 'legacy_derived') {
    if (occurrence.uuid !== null && occurrence.uuid !== undefined) {
      errors.push('Legacy-derived occurrence must have null uuid');
    }
    if (!occId || !String(occId).startsWith('legacy:poc:v1:')) {
      errors.push('Legacy-derived occurrence must have canonical id starting with legacy:poc:v1:');
    }
  } else {
    errors.push(`Unknown identity_kind: ${kind}`);
  }

  if (!occurrence.host_email) {
    errors.push('Missing host_email');
  }

  if (!occurrence.start_time || Number.isNaN(Date.parse(occurrence.start_time))) {
    errors.push('Missing or invalid start_time');
  }

  if (occurrence.end_time) {
    const sMs = Date.parse(occurrence.start_time);
    const eMs = Date.parse(occurrence.end_time);
    if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs < sMs) {
      errors.push('end_time is earlier than start_time');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Transform a legacy POC Zoom meeting record into an authoritative occurrence.
 * @param {object} legacyMeeting - JSON record from zoom:meeting:{id}
 * @param {Array<object>} [webhookLogs=[]] - Supplementary logs from zoom:webhook:logs
 * @returns {{ success: boolean, reason?: string, occurrence?: object, safeId?: string, hostEmail?: string, score?: number }}
 */
export function transformLegacyMeetingToOccurrence(legacyMeeting, webhookLogs = []) {
  if (!legacyMeeting || typeof legacyMeeting !== 'object') {
    return { success: false, reason: 'invalid_record' };
  }

  const numericMeetingId = legacyMeeting.meeting_id || legacyMeeting.meetingId || legacyMeeting.id
    ? String(legacyMeeting.meeting_id || legacyMeeting.meetingId || legacyMeeting.id).trim()
    : null;

  // 1. Resolve exact UUID
  let uuid = legacyMeeting.uuid ? String(legacyMeeting.uuid).trim() : null;

  if (!uuid && numericMeetingId && Array.isArray(webhookLogs) && webhookLogs.length > 0) {
    // Attempt conservative recovery from raw webhook logs
    const matchingUuids = new Set();
    for (const log of webhookLogs) {
      if (log.meeting_id && String(log.meeting_id).trim() === numericMeetingId) {
        if (log.payload_raw) {
          try {
            const rawObj = JSON.parse(log.payload_raw);
            const foundUuid = rawObj.payload?.object?.uuid;
            if (foundUuid) matchingUuids.add(String(foundUuid).trim());
          } catch {}
        }
      }
    }

    if (matchingUuids.size === 1) {
      uuid = Array.from(matchingUuids)[0];
    } else if (matchingUuids.size > 1) {
      return { success: false, reason: 'ambiguous_uuid' };
    }
  }

  if (!uuid) {
    return { success: false, reason: 'missing_uuid' };
  }

  // 2. Validate host email
  const hostEmail = (legacyMeeting.host_email || legacyMeeting.hostEmail || '').trim().toLowerCase();
  if (!hostEmail) {
    return { success: false, reason: 'missing_host' };
  }

  // 3. Validate start time
  const startTime = legacyMeeting.start_time || legacyMeeting.startTime || null;
  if (!startTime || Number.isNaN(Date.parse(startTime))) {
    return { success: false, reason: 'missing_start' };
  }

  const endTime = legacyMeeting.end_time || legacyMeeting.endTime || null;

  // 4. Process participants preserving entities without display-name-only merging
  const participants = {};
  const rawParticipants = legacyMeeting.participants || {};

  const entries = Array.isArray(rawParticipants)
    ? rawParticipants.map((p, idx) => [`p_${idx}`, p])
    : Object.entries(rawParticipants);

  for (const [key, p] of entries) {
    if (!p || typeof p !== 'object') continue;

    const uId = p.user_id ? String(p.user_id).trim() : (p.userId ? String(p.userId).trim() : null);
    const em = p.email ? String(p.email).toLowerCase().trim() : null;
    const name = p.name || p.user_name || (uId ? `User ${uId}` : (em || 'Guest'));

    // Construct a safe, collision-resistant presentation key
    let pKey = key;
    if (em) pKey = `email_${em}`;
    else if (uId) pKey = `user_${uId}`;
    else pKey = `legacy_${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    // Clean session intervals
    const cleanSessions = [];
    if (Array.isArray(p.sessions)) {
      for (const s of p.sessions) {
        if (!s) continue;
        const jTime = s.join_time || null;
        const lTime = s.leave_time || null;
        if (jTime && lTime) {
          const jMs = Date.parse(jTime);
          const lMs = Date.parse(lTime);
          // Drop invalid negative intervals
          if (!Number.isNaN(jMs) && !Number.isNaN(lMs) && lMs >= jMs) {
            cleanSessions.push({ join_time: jTime, leave_time: lTime });
          }
        } else if (jTime || lTime) {
          cleanSessions.push({ join_time: jTime, leave_time: lTime });
        }
      }
    } else if (p.first_join_time || p.last_leave_time || p.join_time || p.leave_time) {
      const jTime = p.first_join_time || p.join_time || null;
      const lTime = p.last_leave_time || p.leave_time || null;
      cleanSessions.push({ join_time: jTime, leave_time: lTime });
    }

    const durationSec = calculateIntervalUnionSeconds(cleanSessions);
    const hasOpen = cleanSessions.some(s => s.join_time && !s.leave_time);

    participants[pKey] = {
      user_id: uId,
      email: em,
      name,
      is_host: Boolean(p.is_host),
      sessions: cleanSessions,
      duration_seconds: durationSec,
      duration_state: hasOpen ? 'incomplete' : 'complete'
    };
  }

  // 5. Calculate meeting duration
  let durationSeconds = null;
  let durationState = 'unavailable';

  if (startTime && endTime) {
    const sMs = Date.parse(startTime);
    const eMs = Date.parse(endTime);
    if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs >= sMs) {
      durationSeconds = Math.round((eMs - sMs) / 1000);
      durationState = 'complete';
    }
  } else if (startTime && !endTime) {
    // Missing end boundary -> duration is incomplete/null, NOT calculated using current wall-clock!
    durationSeconds = null;
    durationState = 'incomplete';
  }

  const safeId = toSafeOccurrenceId(uuid);
  const score = Date.parse(startTime);

  const occurrence = {
    uuid,
    numeric_meeting_id: numericMeetingId,
    topic: legacyMeeting.topic || 'Zoom Meeting',
    host_id: legacyMeeting.host_id || null,
    host_email: hostEmail,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    duration_state: durationState,
    participants,
    revision: 1,
    source_updated_at: legacyMeeting.updated_at || startTime
  };

  return {
    success: true,
    safeId,
    occurrence,
    hostEmail,
    score
  };
}
