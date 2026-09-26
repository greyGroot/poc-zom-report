// ee-crm/lib/zoom-occurrences.js
// Authoritative Zoom Meeting Occurrence Store & Factual Data Transformer
// Stores and retrieves every meeting occurrence by its exact Zoom UUID.
// Does NOT compute derived reconciliation flags, risk labels, or fraud conclusions.

import { Redis } from '@upstash/redis';
import { getKyivDateString } from './timezone.js';

const OCCURRENCE_PREFIX = 'zoom:occurrence:';
const HOST_OCCURRENCES_PREFIX = 'zoom:host:occurrences:';

// In-Memory store for tests and fallback when Redis credentials are not present
class OccurrenceMemoryStore {
  constructor() {
    this.occurrences = new Map();
  }

  reset() {
    this.occurrences.clear();
  }
}

const memoryStore = new OccurrenceMemoryStore();

export function resetOccurrenceMemoryStore() {
  memoryStore.reset();
}

/**
 * Returns active Upstash Redis client if credentials are configured, otherwise null
 */
function getRedisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return new Redis({ url, token });
    } catch (err) {
      console.warn('[ZoomOccurrences] Redis init error, fallback to memory:', err.message);
    }
  }
  return null;
}

/**
 * Encodes an exact Zoom UUID into a base64url string safe for URLs, DOM IDs, and keys.
 * Does not contain '/', '+', or '=' characters.
 * @param {string} uuid
 * @returns {string}
 */
export function toSafeOccurrenceId(uuid) {
  if (!uuid) return '';
  return Buffer.from(String(uuid), 'utf-8')
    .toString('base64url')
    .replace(/=/g, '');
}

/**
 * Decodes a safe occurrence ID back to the exact original Zoom UUID.
 * @param {string} safeId
 * @returns {string}
 */
export function fromSafeOccurrenceId(safeId) {
  if (!safeId) return '';
  return Buffer.from(String(safeId), 'base64url').toString('utf-8');
}

/**
 * Computes union duration in seconds across session intervals,
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
 * Retrieve occurrence by exact UUID or safe ID
 * @param {string} uuidOrSafeId
 * @returns {Promise<object|null>}
 */
export async function getZoomOccurrence(uuidOrSafeId) {
  if (!uuidOrSafeId) return null;

  // Check exact UUID in memory
  if (memoryStore.occurrences.has(uuidOrSafeId)) {
    return memoryStore.occurrences.get(uuidOrSafeId);
  }

  // Check decoded safeId in memory
  try {
    const restored = fromSafeOccurrenceId(uuidOrSafeId);
    if (restored && memoryStore.occurrences.has(restored)) {
      return memoryStore.occurrences.get(restored);
    }
  } catch {}

  const redis = getRedisClient();
  if (redis) {
    try {
      const safeId = toSafeOccurrenceId(uuidOrSafeId);
      const raw = await redis.get(`${OCCURRENCE_PREFIX}${safeId}`);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.warn('[ZoomOccurrences] Redis getZoomOccurrence error:', err.message);
    }
  }

  return null;
}

/**
 * Save or update a Zoom meeting occurrence.
 * Authoritative key is the exact occurrence UUID.
 * Replay idempotency: Merges participant sessions without duplicate sessions or inflating durations.
 * BUG-04 fix: Does NOT merge participants solely by display name. Requires user_id or email match.
 * BUG-03 fix: Missing end_time does not calculate wall-clock elapsed duration.
 * @param {object} occurrence
 * @param {object} [options]
 * @param {boolean} [options.merge=false]
 * @returns {Promise<object>}
 */
export async function saveZoomOccurrence(occurrence, options = {}) {
  const { merge = false } = options;
  if (!occurrence || !occurrence.uuid) {
    throw new Error('Occurrence UUID is required');
  }

  const uuid = String(occurrence.uuid).trim();
  const existing = await getZoomOccurrence(uuid);

  let recordToSave;
  if (existing && merge) {
    const mergedParticipants = { ...(existing.participants || {}) };
    const incomingParticipants = occurrence.participants || {};

    const incomingEntries = Array.isArray(incomingParticipants)
      ? incomingParticipants.map((p, idx) => [`p_${idx}`, p])
      : Object.entries(incomingParticipants);

    for (const [inKey, inP] of incomingEntries) {
      if (!inP) continue;

      // Find matching participant ONLY by strong identity (user_id or email)
      // Never match solely by display name (BUG-04)
      let matchedKey = null;
      const inUserId = inP.user_id ? String(inP.user_id).trim() : null;
      const inEmail = inP.email ? inP.email.toLowerCase().trim() : null;

      if (inUserId || inEmail) {
        for (const [exKey, exP] of Object.entries(mergedParticipants)) {
          const exUserId = exP.user_id ? String(exP.user_id).trim() : null;
          const exEmail = exP.email ? exP.email.toLowerCase().trim() : null;

          if (inUserId && exUserId && inUserId === exUserId) {
            matchedKey = exKey;
            break;
          }
          if (inEmail && exEmail && inEmail === exEmail) {
            matchedKey = exKey;
            break;
          }
        }
      }

      if (matchedKey) {
        const exP = mergedParticipants[matchedKey];
        const existingSessions = Array.isArray(exP.sessions) ? [...exP.sessions] : [];
        const newSessions = Array.isArray(inP.sessions) ? inP.sessions : [];

        // Deduplicate sessions by exact join_time and leave_time
        for (const s of newSessions) {
          if (!s || !s.join_time) continue;
          const alreadyExists = existingSessions.some(
            es => es.join_time === s.join_time && (es.leave_time === s.leave_time || (!es.leave_time && !s.leave_time))
          );
          if (!alreadyExists) {
            existingSessions.push(s);
          }
        }

        mergedParticipants[matchedKey] = {
          ...exP,
          ...inP,
          sessions: existingSessions
        };
      } else {
        const safeKey = inKey || `p_${Object.keys(mergedParticipants).length + 1}`;
        mergedParticipants[safeKey] = inP;
      }
    }

    recordToSave = {
      ...existing,
      ...occurrence,
      uuid,
      participants: mergedParticipants,
      updated_at: new Date().toISOString()
    };
  } else {
    recordToSave = {
      ...occurrence,
      uuid,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  // Persist to memory
  memoryStore.occurrences.set(uuid, recordToSave);

  // Persist to Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      const safeId = toSafeOccurrenceId(uuid);
      await redis.set(`${OCCURRENCE_PREFIX}${safeId}`, JSON.stringify(recordToSave));
      if (recordToSave.host_email) {
        const hostKey = `${HOST_OCCURRENCES_PREFIX}${recordToSave.host_email.toLowerCase().trim()}`;
        const score = recordToSave.start_time ? Date.parse(recordToSave.start_time) : Date.now();
        await redis.zadd(hostKey, { score, member: safeId });
      }
    } catch (err) {
      console.warn('[ZoomOccurrences] Redis save error:', err.message);
    }
  }

  return recordToSave;
}

/**
 * Load occurrences for a teacher within an inclusive date range [fromDate, toDate].
 * BUG-02 fix: If teacher is not mapped to any host email, returns empty array immediately.
 * @param {object} params
 * @param {string} [params.teacherZoomEmail]
 * @param {string} [params.teacherEmail]
 * @param {string} params.fromDate - YYYY-MM-DD
 * @param {string} params.toDate - YYYY-MM-DD
 * @returns {Promise<Array<object>>}
 */
export async function getZoomOccurrencesForTeacher({
  teacherZoomEmail,
  teacherEmail,
  fromDate,
  toDate
}) {
  const targetHosts = new Set();
  if (teacherZoomEmail && typeof teacherZoomEmail === 'string' && teacherZoomEmail.trim()) {
    targetHosts.add(teacherZoomEmail.trim().toLowerCase());
  }
  if (teacherEmail && typeof teacherEmail === 'string' && teacherEmail.trim()) {
    targetHosts.add(teacherEmail.trim().toLowerCase());
  }

  // BUG-02: If no host identity is mapped, return empty array immediately (prevent leaking other teachers' data)
  if (targetHosts.size === 0) {
    return [];
  }

  const allOccurrences = [];
  const seenUuids = new Set();

  // 1. Gather occurrences from memoryStore
  for (const occ of memoryStore.occurrences.values()) {
    if (!occ || !occ.uuid) continue;
    allOccurrences.push(occ);
    seenUuids.add(occ.uuid);
  }

  // 2. Gather occurrences from Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      for (const host of targetHosts) {
        const hostKey = `${HOST_OCCURRENCES_PREFIX}${host}`;
        const safeIds = await redis.zrange(hostKey, 0, -1);
        if (Array.isArray(safeIds) && safeIds.length > 0) {
          for (const sId of safeIds) {
            const raw = await redis.get(`${OCCURRENCE_PREFIX}${sId}`);
            if (raw) {
              const occ = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (occ && occ.uuid && !seenUuids.has(occ.uuid)) {
                allOccurrences.push(occ);
                seenUuids.add(occ.uuid);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[ZoomOccurrences] Redis getZoomOccurrencesForTeacher error:', err.message);
    }
  }

  // 3. Filter strictly by host identity and inclusive date range
  const filtered = [];
  for (const occ of allOccurrences) {
    const occHost = (occ.host_email || '').trim().toLowerCase();
    if (!targetHosts.has(occHost)) {
      continue;
    }

    if (fromDate && toDate && occ.start_time) {
      const kyivDate = getKyivDateString(occ.start_time);
      if (!kyivDate || kyivDate < fromDate || kyivDate > toDate) {
        continue;
      }
    }

    filtered.push(occ);
  }

  // 4. Sort chronologically ascending
  filtered.sort((a, b) => {
    const tA = a.start_time ? Date.parse(a.start_time) : 0;
    const tB = b.start_time ? Date.parse(b.start_time) : 0;
    return tA - tB;
  });

  return filtered;
}

/**
 * Formats a raw occurrence into a clean, factual display object.
 * Strictly avoids reconciliation, verification, attendance, or risk tags.
 * BUG-03 fix: For past or incomplete meetings lacking end boundaries, duration is null and incomplete, NOT invented.
 * @param {object} occ
 * @returns {object}
 */
export function formatOccurrenceForDisplay(occ) {
  if (!occ) return null;

  let durationSeconds = null;
  let durationMinutes = null;
  let durationState = 'unavailable';

  if (typeof occ.duration_seconds === 'number' && occ.duration_seconds > 0) {
    durationSeconds = occ.duration_seconds;
    durationMinutes = Math.round(durationSeconds / 60);
    durationState = 'complete';
  } else if (occ.start_time && occ.end_time) {
    const startMs = Date.parse(occ.start_time);
    const endMs = Date.parse(occ.end_time);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      durationSeconds = Math.round((endMs - startMs) / 1000);
      durationMinutes = Math.round(durationSeconds / 60);
      durationState = 'complete';
    }
  } else if (occ.start_time && !occ.end_time) {
    // BUG-03: End boundary not recorded -> duration is incomplete, not wall-clock elapsed!
    durationSeconds = null;
    durationMinutes = null;
    durationState = 'incomplete';
  }

  const rawParticipants = occ.participants || {};
  const participantsArray = Array.isArray(rawParticipants)
    ? rawParticipants
    : Object.entries(rawParticipants).map(([key, p]) => ({ key, ...p }));

  const formattedParticipants = participantsArray.map(p => {
    let pDurationSeconds = 0;
    let pState = 'unavailable';

    if (Array.isArray(p.sessions) && p.sessions.length > 0) {
      pDurationSeconds = calculateIntervalUnionSeconds(p.sessions);
      const hasOpenSession = p.sessions.some(s => s.join_time && !s.leave_time);
      pState = hasOpenSession ? 'incomplete' : 'complete';
    } else if (typeof p.duration_seconds === 'number' && p.duration_seconds > 0) {
      pDurationSeconds = p.duration_seconds;
      pState = 'complete';
    } else if (p.first_join_time && p.last_leave_time) {
      const j = Date.parse(p.first_join_time);
      const l = Date.parse(p.last_leave_time);
      if (!Number.isNaN(j) && !Number.isNaN(l) && l >= j) {
        pDurationSeconds = Math.round((l - j) / 1000);
        pState = 'complete';
      }
    } else if (p.first_join_time && !p.last_leave_time) {
      pState = 'incomplete';
    }

    return {
      id: p.key || p.user_id || p.email || 'p',
      name: p.name || 'Unnamed participant',
      email: p.email || null,
      is_host: Boolean(p.is_host),
      role: p.is_host ? 'Host' : 'Participant',
      firstJoinTime: p.first_join_time || (p.sessions?.[0]?.join_time) || null,
      lastLeaveTime: p.last_leave_time || (p.sessions?.[p.sessions.length - 1]?.leave_time) || null,
      connectedDurationSeconds: pDurationSeconds,
      connectedDurationMinutes: Math.round(pDurationSeconds / 60),
      connectionState: pState,
      sessions: Array.isArray(p.sessions) ? p.sessions : []
    };
  });

  return {
    id: toSafeOccurrenceId(occ.uuid),
    uuid: occ.uuid,
    numericMeetingId: occ.numeric_meeting_id || occ.numericMeetingId || null,
    topic: occ.topic || 'Untitled Zoom meeting',
    hostEmail: occ.host_email || null,
    startTime: occ.start_time,
    endTime: occ.end_time || null,
    durationSeconds,
    durationMinutes,
    durationState,
    participantsCount: formattedParticipants.length,
    participants: formattedParticipants
  };
}
