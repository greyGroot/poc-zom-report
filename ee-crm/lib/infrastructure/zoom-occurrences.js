// ee-crm/lib/zoom-occurrences.js
// Authoritative Zoom Meeting Occurrence Store & Factual Data Transformer
// Stores and retrieves every meeting occurrence by its exact Zoom UUID.
// Does NOT compute derived reconciliation flags, risk labels, or fraud conclusions.

import { getKyivDateString } from '../utils/timezone.js';
import {
  getRedisClient,
  isMockClient,
  InMemoryRedis,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX
} from './redis.js';

const OCCURRENCE_PREFIX = OCCURRENCE_KEY_PREFIX;
const HOST_OCCURRENCES_PREFIX = HOST_OCCURRENCES_KEY_PREFIX;

// In-Memory store for tests and fallback when explicitly in memory mode
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

let customRedisClient = null;

export function setOccurrenceRedisClient(client) {
  customRedisClient = client;
}

function resolveClient() {
  if (customRedisClient) {
    return customRedisClient;
  }
  return getRedisClient();
}

function isMemoryMode() {
  if (customRedisClient) {
    return customRedisClient instanceof InMemoryRedis;
  }
  return isMockClient();
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

  if (isMemoryMode()) {
    // Check exact UUID or canonical occurrence ID in memory
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
  }

  const redis = resolveClient();
  const safeId = toSafeOccurrenceId(uuidOrSafeId);
  let raw = await redis.get(`${OCCURRENCE_KEY_PREFIX}${safeId}`);
  if (!raw && safeId !== uuidOrSafeId) {
    raw = await redis.get(`${OCCURRENCE_KEY_PREFIX}${uuidOrSafeId}`);
  }
  if (raw) {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  return null;
}

/**
 * Save or update a Zoom meeting occurrence.
 * Authoritative key is the canonical occurrence ID (or exact Zoom UUID).
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
  const rawId = occurrence?.occurrence_id || occurrence?.uuid;
  if (!rawId) {
    throw new Error('Occurrence ID or UUID is required');
  }

  const occId = String(rawId).trim();
  const isLegacy = occurrence.identity_kind === 'legacy_derived' || !occurrence.uuid;
  const uuid = isLegacy ? null : String(occurrence.uuid || occId).trim();
  const identityKind = isLegacy ? 'legacy_derived' : 'exact_uuid';

  const existing = await getZoomOccurrence(occId);

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
      occurrence_id: occId,
      uuid,
      identity_kind: identityKind,
      participants: mergedParticipants,
      updated_at: new Date().toISOString()
    };
  } else {
    recordToSave = {
      ...occurrence,
      occurrence_id: occId,
      uuid,
      identity_kind: identityKind,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  if (isMemoryMode()) {
    memoryStore.occurrences.set(occId, recordToSave);
  }

  // Persist to Redis (errors propagate)
  const redis = resolveClient();
  const safeId = toSafeOccurrenceId(occId);
  await redis.set(`${OCCURRENCE_PREFIX}${safeId}`, JSON.stringify(recordToSave));
  if (recordToSave.host_email) {
    const hostKey = `${HOST_OCCURRENCES_PREFIX}${recordToSave.host_email.toLowerCase().trim()}`;
    const score = recordToSave.start_time ? Date.parse(recordToSave.start_time) : Date.now();
    await redis.zadd(hostKey, { score, member: safeId });
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

  // BUG-02: If no host identity is mapped, return empty array immediately
  if (targetHosts.size === 0) {
    return [];
  }

  const allOccurrences = [];
  const seenIds = new Set();

  if (isMemoryMode()) {
    for (const occ of memoryStore.occurrences.values()) {
      if (!occ) continue;
      const occId = occ.occurrence_id || occ.uuid;
      if (!occId || seenIds.has(occId)) continue;
      allOccurrences.push(occ);
      seenIds.add(occId);
    }
  }

  // Gather occurrences from Redis
  const redis = resolveClient();
  let minScore = '-inf';
  let maxScore = '+inf';

  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    minScore = new Date(`${fromDate}T00:00:00.000Z`).getTime() - 4 * 3600 * 1000;
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    maxScore = new Date(`${toDate}T23:59:59.999Z`).getTime() + 4 * 3600 * 1000;
  }

  for (const host of targetHosts) {
    const hostKey = `${HOST_OCCURRENCES_PREFIX}${host}`;
    let safeIds = [];

    if (minScore !== '-inf' || maxScore !== '+inf') {
      if (typeof redis.zrangebyscore === 'function') {
        safeIds = await redis.zrangebyscore(hostKey, minScore, maxScore);
      } else {
        safeIds = await redis.zrange(hostKey, minScore, maxScore, { byScore: true });
      }
    } else {
      safeIds = await redis.zrange(hostKey, 0, -1);
    }

    if (Array.isArray(safeIds) && safeIds.length > 0) {
      const keys = safeIds.map(sId => `${OCCURRENCE_PREFIX}${sId}`);
      let rawList = [];
      if (typeof redis.mget === 'function') {
        rawList = await redis.mget(...keys);
      } else {
        rawList = await Promise.all(keys.map(k => redis.get(k)));
      }

      for (const raw of rawList) {
        if (raw) {
          const occ = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const occId = occ?.occurrence_id || occ?.uuid;
          if (occ && occId && !seenIds.has(occId)) {
            allOccurrences.push(occ);
            seenIds.add(occId);
          }
        }
      }
    }
  }

  // Filter strictly by host identity and inclusive date range
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

  // Sort chronologically ascending
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

  const rawId = occ.occurrence_id || occ.uuid;
  const occId = rawId ? String(rawId).trim() : '';
  const safeId = toSafeOccurrenceId(occId);
  const isLegacy = occ.identity_kind === 'legacy_derived' || !occ.uuid;
  const identityKind = isLegacy ? 'legacy_derived' : 'exact_uuid';
  const uuid = isLegacy ? null : (occ.uuid || null);

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

  // Group participants by canonical identity (user_id -> email -> normalized display name)
  const groupedMap = new Map();

  for (const p of participantsArray) {
    if (!p) continue;
    const userId = p.user_id ? String(p.user_id).trim() : null;
    const email = p.email ? p.email.toLowerCase().trim() : null;
    const rawName = (p.name || p.user_name || 'Unnamed participant').trim();
    const normalizedName = rawName.toLowerCase();

    let groupKey = '';
    if (email) {
      groupKey = `email_${email}`;
    } else if (normalizedName && normalizedName !== 'unnamed participant') {
      groupKey = `name_${normalizedName}`;
    } else if (userId) {
      groupKey = `user_${userId}`;
    } else {
      groupKey = `anon_${p.key || Math.random().toString(36).substring(2, 7)}`;
    }

    if (!groupedMap.has(groupKey)) {
      groupedMap.set(groupKey, {
        id: p.key || userId || email || groupKey,
        name: rawName,
        email: email || null,
        is_host: Boolean(p.is_host),
        sessions: [],
        rawDurations: [],
        firstJoinTimes: [],
        lastLeaveTimes: []
      });
    }

    const group = groupedMap.get(groupKey);
    if (p.is_host) group.is_host = true;
    if (p.email && !group.email) group.email = p.email;
    if (rawName && (!group.name || group.name === 'Unnamed participant')) group.name = rawName;

    if (Array.isArray(p.sessions) && p.sessions.length > 0) {
      for (const s of p.sessions) {
        if (!s || !s.join_time) continue;
        const exists = group.sessions.some(
          es => es.join_time === s.join_time && (es.leave_time === s.leave_time || (!es.leave_time && !s.leave_time))
        );
        if (!exists) {
          group.sessions.push(s);
        }
      }
    } else {
      if (p.first_join_time || p.join_time) {
        const jt = p.first_join_time || p.join_time;
        const lt = p.last_leave_time || p.leave_time || null;
        const exists = group.sessions.some(
          es => es.join_time === jt && (es.leave_time === lt || (!es.leave_time && !lt))
        );
        if (!exists) {
          group.sessions.push({ join_time: jt, leave_time: lt });
        }
      }
      if (typeof p.duration_seconds === 'number' && p.duration_seconds > 0) {
        group.rawDurations.push(p.duration_seconds);
      }
    }

    if (p.first_join_time) group.firstJoinTimes.push(p.first_join_time);
    if (p.last_leave_time) group.lastLeaveTimes.push(p.last_leave_time);
  }

  const formattedParticipants = Array.from(groupedMap.values()).map(g => {
    let pDurationSeconds = 0;
    let pState = 'unavailable';

    if (g.sessions.length > 0) {
      pDurationSeconds = calculateIntervalUnionSeconds(g.sessions);
      const hasOpenSession = g.sessions.some(s => s.join_time && !s.leave_time);
      pState = hasOpenSession ? 'incomplete' : 'complete';
    } else if (g.rawDurations.length > 0) {
      pDurationSeconds = Math.max(...g.rawDurations);
      pState = 'complete';
    }

    // Determine earliest join time and latest leave time
    const allJoins = [...g.firstJoinTimes, ...g.sessions.map(s => s.join_time)].filter(Boolean);
    const allLeaves = [...g.lastLeaveTimes, ...g.sessions.map(s => s.leave_time)].filter(Boolean);

    allJoins.sort((a, b) => Date.parse(a) - Date.parse(b));
    allLeaves.sort((a, b) => Date.parse(a) - Date.parse(b));

    const firstJoinTime = allJoins[0] || null;
    const lastLeaveTime = allLeaves[allLeaves.length - 1] || null;

    if (pDurationSeconds === 0 && firstJoinTime && lastLeaveTime) {
      const j = Date.parse(firstJoinTime);
      const l = Date.parse(lastLeaveTime);
      if (!Number.isNaN(j) && !Number.isNaN(l) && l >= j) {
        pDurationSeconds = Math.round((l - j) / 1000);
        pState = 'complete';
      }
    }

    return {
      id: g.id,
      name: g.name || 'Unnamed participant',
      email: g.email || null,
      is_host: Boolean(g.is_host),
      role: g.is_host ? 'Host' : 'Participant',
      firstJoinTime,
      lastLeaveTime,
      connectedDurationSeconds: pDurationSeconds,
      connectedDurationMinutes: Math.round(pDurationSeconds / 60),
      durationMinutes: Math.round(pDurationSeconds / 60),
      sessionsCount: g.sessions.length,
      connectionState: pState,
      sessions: g.sessions
    };
  });

  return {
    id: safeId,
    occurrenceId: occId,
    uuid,
    identityKind,
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
