// api/telemetry.js
// Pure ESM Telemetry Query API for poc-zoom-report
// Supports Vercel Serverless (Node req, res) and Web Fetch API (request)

import { getMeetingsByIndex, getWebhookLogs, clearWebhookLogs, isMockClient } from './lib/redis.js';

/**
 * Universal responder abstraction supporting Node.js (req, res) and Web Fetch API (request).
 */
function createResponder(reqOrRequest, optionalRes) {
  const isNode = Boolean(
    optionalRes &&
    (typeof optionalRes.status === 'function' ||
     typeof optionalRes.json === 'function' ||
     typeof optionalRes.setHeader === 'function' ||
     typeof optionalRes.send === 'function' ||
     typeof optionalRes.end === 'function')
  );

  return {
    isNode,
    send(statusCode, data, customHeaders = {}) {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        ...customHeaders
      };

      if (isNode) {
        for (const [k, v] of Object.entries(headers)) {
          if (typeof optionalRes.setHeader === 'function') {
            optionalRes.setHeader(k, v);
          }
        }
        if (typeof optionalRes.status === 'function') {
          optionalRes.status(statusCode);
        } else {
          optionalRes.statusCode = statusCode;
        }
        if (typeof optionalRes.json === 'function') {
          return optionalRes.json(data);
        }
        if (typeof optionalRes.send === 'function') {
          return optionalRes.send(data);
        }
        if (typeof optionalRes.end === 'function') {
          return optionalRes.end(typeof data === 'string' ? data : JSON.stringify(data));
        }
        return optionalRes;
      }

      // Web Fetch API: standard Response
      return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
        status: statusCode,
        headers
      });
    }
  };
}

/**
 * Get current date string formatted as YYYY-MM-DD in Europe/Kyiv timezone.
 */
function getCurrentKyivDate() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Normalize participants from Redis representation (object map or array) into an Array
 * and classify host vs student roles according to business rules.
 *
 * A participant is host if:
 * p.is_host === true || p.user_id === '16778240' || p.email === meeting.host_email || p.user_id === meeting.host_id
 * Students are participants where is_host !== true.
 *
 * @param {object|Array} rawParticipants
 * @param {{ host_email?: string, host_id?: string, host_name?: string }} meetingHostInfo
 * @returns {Array<object>}
 */
export function normalizeParticipants(rawParticipants, meetingHostInfo = {}) {
  if (!rawParticipants) return [];

  const list = Array.isArray(rawParticipants)
    ? rawParticipants
    : (typeof rawParticipants === 'object' ? Object.values(rawParticipants) : []);

  const hostEmail = (meetingHostInfo.host_email || '').toLowerCase().trim();
  const hostId = String(meetingHostInfo.host_id || '').trim();
  const hostName = (meetingHostInfo.host_name || '').toLowerCase().trim();

  const participantMap = new Map();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;

    const email = (item.email || '').trim();
    const userId = item.user_id !== undefined && item.user_id !== null ? String(item.user_id).trim() : '';
    const phone = (item.phone || item.phone_number || '').trim();
    const name = (item.name || item.user_name || '').trim();

    const isHost = Boolean(
      item.is_host === true ||
      userId === '16778240' ||
      (hostEmail && email && email.toLowerCase() === hostEmail) ||
      (hostId && userId && userId === hostId) ||
      (hostName && name && name.toLowerCase() === hostName)
    );

    const dedupKey = email ? `email:${email.toLowerCase()}`
      : (userId ? `user:${userId}`
      : (phone ? `phone:${phone}`
      : (name ? `name:${name.toLowerCase()}` : `id:${participantMap.size}`)));

    const displayName = name || item.user_name || email || (phone || (userId ? `User ${userId}` : 'Гість'));

    if (!participantMap.has(dedupKey)) {
      participantMap.set(dedupKey, {
        ...item,
        name: displayName,
        user_name: displayName,
        email,
        phone,
        user_id: userId,
        is_host: isHost,
        duration_seconds: item.duration_seconds || 0,
        sessions: Array.isArray(item.sessions) ? item.sessions : []
      });
    } else {
      const existing = participantMap.get(dedupKey);
      const combinedDuration = Math.max(
        (existing.duration_seconds || 0) + (item.duration_seconds || 0),
        existing.duration_seconds || 0,
        item.duration_seconds || 0
      );
      const combinedSessions = [
        ...(Array.isArray(existing.sessions) ? existing.sessions : []),
        ...(Array.isArray(item.sessions) ? item.sessions : [])
      ];

      participantMap.set(dedupKey, {
        ...existing,
        ...item,
        name: existing.name || displayName,
        user_name: existing.user_name || displayName,
        email: existing.email || email,
        user_id: existing.user_id || userId,
        phone: existing.phone || phone,
        is_host: existing.is_host || isHost,
        duration_seconds: combinedDuration,
        sessions: combinedSessions
      });
    }
  }

  return Array.from(participantMap.values());
}

/**
 * Calculate meeting duration in minutes from meeting metadata and participant presence.
 *
 * @param {object} meeting
 * @param {Array<object>} participants
 * @returns {number}
 */
export function calculateDurationMinutes(meeting, participants = []) {
  if (meeting.end_time && meeting.start_time) {
    const startMs = Date.parse(meeting.start_time);
    const endMs = Date.parse(meeting.end_time);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      const diffMin = Math.round((endMs - startMs) / 60000);
      if (diffMin > 0) return diffMin;
      if (meeting.duration !== undefined && meeting.duration !== null && !Number.isNaN(Number(meeting.duration)) && Number(meeting.duration) > 0) {
        return Number(meeting.duration);
      }
      return 0;
    }
  }

  if (meeting.duration !== undefined && meeting.duration !== null && !Number.isNaN(Number(meeting.duration)) && Number(meeting.duration) > 0) {
    return Number(meeting.duration);
  }

  if (Array.isArray(participants) && participants.length > 0) {
    let maxSec = 0;
    for (const p of participants) {
      const sec = p.duration_seconds || (p.duration ? p.duration * 60 : 0);
      if (sec > maxSec) maxSec = sec;
    }
    if (maxSec > 0) {
      return Math.round(maxSec / 60);
    }
  }

  if (meeting.status !== 'ended' && !meeting.end_time && meeting.start_time) {
    const startMs = Date.parse(meeting.start_time);
    if (!Number.isNaN(startMs) && Date.now() >= startMs) {
      return Math.round((Date.now() - startMs) / 60000);
    }
  }

  return 0;
}

/**
 * Calculate business status for a meeting based on duration and student presence.
 *
 * Rules:
 * - If studentCount >= 1:
 *   - durationMinutes >= 30: VERIFIED
 *   - else: SHORT_CALL
 * - If studentCount === 0:
 *   - durationMinutes >= 15: ONLY_HOST
 *   - else: SHORT_CALL
 * - If total participants_count === 0 and durationMinutes < 15: SHORT_CALL
 *
 * @param {number} durationMinutes
 * @param {number} studentCount
 * @returns {'VERIFIED'|'ONLY_HOST'|'SHORT_CALL'}
 */
export function calculateBusinessStatus(durationMinutes, studentCount) {
  if (studentCount >= 1) {
    return durationMinutes >= 30 ? 'VERIFIED' : 'SHORT_CALL';
  }
  return durationMinutes >= 15 ? 'ONLY_HOST' : 'SHORT_CALL';
}

/**
 * Format a single meeting record with normalized participants and business status.
 *
 * @param {object} meeting
 * @returns {object}
 */
export function formatMeeting(meeting) {
  if (!meeting || typeof meeting !== 'object') {
    return meeting;
  }

  const meetingId = String(meeting.meeting_id || meeting.meetingId || '');
  const topic = meeting.topic || 'Zoom Meeting';
  const hostId = String(meeting.host_id || meeting.hostId || '');
  const hostName = meeting.host_name || meeting.hostName || '';
  const hostEmail = meeting.host_email || meeting.hostEmail || '';
  const startTime = meeting.start_time || meeting.startTime || null;
  const endTime = meeting.end_time || meeting.endTime || null;
  const status = meeting.status || (endTime ? 'ended' : 'live');

  const normalizedParticipants = normalizeParticipants(meeting.participants, {
    host_email: hostEmail,
    host_id: hostId,
    host_name: hostName
  });

  const durationMinutes = calculateDurationMinutes(meeting, normalizedParticipants);

  const students = normalizedParticipants.filter(p => !p.is_host);
  const studentCount = students.length;

  const businessStatus = calculateBusinessStatus(durationMinutes, studentCount);

  let durationSeconds = 0;
  if (startTime && endTime) {
    const s = Date.parse(startTime);
    const e = Date.parse(endTime);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      durationSeconds = Math.round((e - s) / 1000);
    }
  } else if (startTime) {
    const s = Date.parse(startTime);
    if (!Number.isNaN(s) && Date.now() >= s) {
      durationSeconds = Math.round((Date.now() - s) / 1000);
    }
  }

  return {
    ...meeting,
    meeting_id: meetingId,
    meetingId: meetingId,
    topic,
    host_id: hostId,
    host_name: hostName,
    host_email: hostEmail,
    start_time: startTime,
    end_time: endTime,
    timezone: meeting.timezone || 'Europe/Kyiv',
    status,
    duration: durationMinutes,
    duration_seconds: durationSeconds,
    business_status: businessStatus,
    participants_count: normalizedParticipants.length,
    participants: normalizedParticipants
  };
}

/**
 * Telemetry Query API Handler
 *
 * @param {object|Request} reqOrRequest
 * @param {object} [optionalRes]
 */
export default async function handler(reqOrRequest, optionalRes) {
  const responder = createResponder(reqOrRequest, optionalRes);

  let method = 'GET';
  let query = {};

  if (responder.isNode) {
    const req = reqOrRequest;
    method = (req.method || 'GET').toUpperCase();

    if (req.query && typeof req.query === 'object') {
      query = { ...req.query };
    }

    if (req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        for (const [k, v] of parsedUrl.searchParams.entries()) {
          if (query[k] === undefined) {
            query[k] = v;
          }
        }
      } catch {
        // ignore malformed url
      }
    }
  } else {
    const request = reqOrRequest;
    method = (request.method || 'GET').toUpperCase();
    try {
      const parsedUrl = new URL(request.url, 'http://localhost');
      query = Object.fromEntries(parsedUrl.searchParams.entries());
    } catch {
      query = {};
    }
  }

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return responder.send(200, { success: true, message: 'CORS OK' });
  }

  // Reject non-GET/non-DELETE requests with 405 Method Not Allowed
  if (method !== 'GET' && method !== 'DELETE') {
    return responder.send(405, { success: false, error: 'Method Not Allowed' }, { 'Allow': 'GET, DELETE, OPTIONS' });
  }

  // Handle clearing logs
  if (query.action === 'clear_logs' || method === 'DELETE') {
    await clearWebhookLogs();
    return responder.send(200, { success: true, message: 'Logs cleared successfully' });
  }

  // Handle raw event logs export
  if (query.format === 'raw') {
    const limit = query.limit !== undefined ? Number(query.limit) : 10000;
    const events = await getWebhookLogs(limit);
    return responder.send(200, events);
  }

  try {
    const date = query.date ? String(query.date).trim() : undefined;
    const host = query.host ? String(query.host).trim() : undefined;
    const limit = query.limit !== undefined ? Number(query.limit) : 500;
    const offset = query.offset !== undefined ? Number(query.offset) : 0;

    const meetings = await getMeetingsByIndex({
      date,
      host,
      limit,
      offset,
      rev: true
    });

    const formattedMeetings = (meetings || []).map(formatMeeting);
    const responseDate = date || getCurrentKyivDate();

    const events = await getWebhookLogs(100);
    const errors = events.filter(e => e.status === 'error' || e.event?.startsWith('error') || e.status === 'unexpected_event');

    return responder.send(200, {
      success: true,
      date: responseDate,
      total_meetings: formattedMeetings.length,
      meetings: formattedMeetings,
      total_events: events.length,
      total_errors: errors.length,
      errors,
      events,
      redis_provider: process.env.KV_REST_API_URL ? 'Vercel KV' : (process.env.UPSTASH_REDIS_REST_URL ? 'Upstash Redis' : (isMockClient() ? 'In-Memory Mock' : 'Remote Redis'))
    });
  } catch (err) {
    console.error('[Telemetry API] Error handling request:', err);
    return responder.send(500, {
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
}
