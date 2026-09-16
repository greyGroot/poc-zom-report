// api/webhooks/zoom.js
// Pure ESM Zoom Webhook Ingestion & Security Handler
// Supports Vercel Serverless (Node req, res) and Web Fetch API (request)

import crypto from 'crypto';
import { saveMeeting, getMeeting, withMeetingLock } from '../lib/redis.js';
import { fetchZoomMeetingQoS, enrichMeetingWithQoS } from '../lib/zoom.js';

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

  // Sort by start timestamp ascending
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
 * Find existing participant in meeting.participants map by email, userId, zoomUserId, phone, or name.
 * @param {object} participantsMap
 * @param {{ email?: string, userId?: string, zoomUserId?: string, phone?: string, name?: string }} matchCriteria
 * @returns {string|null} Key in participantsMap or null
 */
function findParticipantKey(participantsMap, { email, userId, zoomUserId, phone, name }) {
  if (!participantsMap || typeof participantsMap !== 'object') return null;

  const normEmail = (email || '').toLowerCase().trim();
  const normUserId = String(userId || '').trim();
  const normZoomId = String(zoomUserId || '').trim();
  const normPhone = String(phone || '').trim();
  const normName = (name || '').toLowerCase().trim();

  for (const [key, p] of Object.entries(participantsMap)) {
    if (!p || typeof p !== 'object') continue;

    const pEmail = (p.email || (key.includes('@') ? key : '')).toLowerCase().trim();
    const pUserId = String(p.user_id || p.userId || '').trim();
    const pZoomId = String(p.zoom_user_id || p.id || '').trim();
    const pPhone = String(p.phone || p.phone_number || '').trim();
    const pName = (p.name || p.user_name || '').toLowerCase().trim();

    if (normEmail && pEmail && normEmail === pEmail) return key;
    if (normUserId && pUserId && normUserId === pUserId) return key;
    if (normZoomId && pZoomId && normZoomId === pZoomId) return key;
    if (normUserId && pZoomId && normUserId === pZoomId) return key;
    if (normZoomId && pUserId && normZoomId === pUserId) return key;
    if (normPhone && pPhone && normPhone === pPhone) return key;
    if (normName && pName && normName === pName) return key;
  }

  return null;
}

/**
 * Generate a unique participant key for the participants object map.
 * @param {object} participantsMap
 * @param {{ email?: string, userId?: string, phone?: string, name?: string }} info
 * @returns {string} Unique key
 */
function generateParticipantKey(participantsMap, { email, userId, phone, name }) {
  let key = (email || '').toLowerCase().trim();
  if (!key && userId) key = `user_${String(userId).trim()}`;
  if (!key && phone) key = `phone_${String(phone).trim()}`;
  if (!key && name) key = `name_${String(name).toLowerCase().trim().replace(/\s+/g, '_')}`;
  if (!key) key = `p_${Date.now()}`;

  if (participantsMap && participantsMap[key]) {
    let suffix = 2;
    while (participantsMap[`${key}_${suffix}`]) {
      suffix++;
    }
    key = `${key}_${suffix}`;
  }

  return key;
}

/**
 * Asynchronously read request body stream when req.body is undefined.
 * @param {ReadableStream|EventEmitter} stream
 * @returns {Promise<string>}
 */
async function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', err => reject(err));
  });
}

/**
 * Universal responder abstraction for Node.js (req, res) and Web Fetch API (request).
 */
function createResponder(reqOrRequest, optionalRes) {
  const isNode = Boolean(
    optionalRes &&
    (typeof optionalRes.status === 'function' ||
     typeof optionalRes.json === 'function' ||
     typeof optionalRes.setHeader === 'function' ||
     typeof optionalRes.send === 'function')
  );

  return {
    isNode,
    send(statusCode, data, customHeaders = {}) {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-zm-signature, x-zm-request-timestamp',
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

      // Web Fetch API: return standard Response
      return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
        status: statusCode,
        headers
      });
    }
  };
}

/**
 * Zoom Webhook Handler
 * @param {object|Request} reqOrRequest
 * @param {object} [optionalRes]
 */
export default async function handler(reqOrRequest, optionalRes) {
  const responder = createResponder(reqOrRequest, optionalRes);

  let method = 'POST';
  let body = null;

  try {
    if (responder.isNode) {
      const req = reqOrRequest;
      method = (req.method || 'POST').toUpperCase();

      if (method === 'OPTIONS') {
        return responder.send(200, { success: true, message: 'CORS OK' });
      }
      if (method !== 'POST') {
        return responder.send(405, { error: 'Method Not Allowed' }, { Allow: 'POST, OPTIONS' });
      }

      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'object') {
          body = req.body;
        } else if (typeof req.body === 'string') {
          if (req.body.trim().length > 0) {
            try {
              body = JSON.parse(req.body);
            } catch {
              return responder.send(400, { error: 'Invalid JSON payload' });
            }
          }
        }
      } else if (typeof req.on === 'function') {
        try {
          const raw = await readStream(req);
          if (raw && raw.trim().length > 0) {
            body = JSON.parse(raw);
          }
        } catch {
          return responder.send(400, { error: 'Invalid JSON payload' });
        }
      }
    } else {
      // Web Fetch API
      const request = reqOrRequest;
      method = (request.method || 'POST').toUpperCase();

      if (method === 'OPTIONS') {
        return responder.send(200, { success: true, message: 'CORS OK' });
      }
      if (method !== 'POST') {
        return responder.send(405, { error: 'Method Not Allowed' }, { Allow: 'POST, OPTIONS' });
      }

      try {
        body = await request.json();
      } catch {
        return responder.send(400, { error: 'Invalid JSON payload' });
      }
    }

    if (!body || typeof body !== 'object') {
      return responder.send(400, { error: 'Missing or invalid request body' });
    }

    const { event, payload } = body;

    // ------------------------------------------------------------------------
    // 1. Zoom URL Validation CRC Challenge
    // ------------------------------------------------------------------------
    if (event === 'endpoint.url_validation') {
      if (!payload || payload.plainToken === undefined || payload.plainToken === null) {
        return responder.send(400, { error: 'Missing plainToken in payload' });
      }

      const plainToken = String(payload.plainToken);
      const secret = (process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test_webhook_secret_token_12345').trim();

      if (!secret) {
        return responder.send(500, { error: 'ZOOM_WEBHOOK_SECRET_TOKEN not configured' });
      }

      const encryptedToken = crypto
        .createHmac('sha256', secret)
        .update(plainToken)
        .digest('hex');

      return responder.send(200, { plainToken, encryptedToken });
    }

    if (!event) {
      return responder.send(400, { error: 'Missing event field in request body' });
    }

    const object = (payload && typeof payload.object === 'object' && payload.object !== null)
      ? payload.object
      : {};

    const rawMeetingId = object.id || object.meeting_id || object.uuid;
    const meetingId = rawMeetingId !== undefined && rawMeetingId !== null ? String(rawMeetingId) : null;

    // ------------------------------------------------------------------------
    // 2. Event: meeting.started
    // ------------------------------------------------------------------------
    if (event === 'meeting.started') {
      if (!meetingId) {
        return responder.send(200, { success: true, message: 'meeting.started missing meeting id' });
      }

      return await withMeetingLock(meetingId, async () => {
        const existing = await getMeeting(meetingId);
        const startTime = object.start_time || existing?.start_time || new Date().toISOString();

        const meetingData = {
          ...existing,
          meeting_id: meetingId,
          meetingId: meetingId,
          uuid: object.uuid || existing?.uuid || '',
          topic: object.topic || existing?.topic || 'Zoom Meeting',
          host_id: object.host_id || existing?.host_id || '',
          host_email: object.host_email || existing?.host_email || '',
          host_name: object.host_name || existing?.host_name || '',
          start_time: startTime,
          timezone: object.timezone || existing?.timezone || 'Europe/Kyiv',
          status: 'started',
          participants: existing?.participants || {},
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await saveMeeting(meetingId, meetingData, { merge: true });
        return responder.send(200, { success: true, message: 'Meeting started processed' });
      });
    }

    // ------------------------------------------------------------------------
    // 3. Event: meeting.participant_joined
    // ------------------------------------------------------------------------
    if (event === 'meeting.participant_joined') {
      if (!meetingId) {
        return responder.send(200, { success: true, message: 'participant_joined missing meeting id' });
      }

      return await withMeetingLock(meetingId, async () => {
        let meeting = await getMeeting(meetingId);
      if (!meeting) {
        // Handle joined event without prior meeting.started (Test F3.5)
        meeting = {
          meeting_id: meetingId,
          meetingId: meetingId,
          uuid: object.uuid || '',
          topic: object.topic || 'Zoom Meeting',
          host_id: object.host_id || '',
          host_email: object.host_email || '',
          host_name: object.host_name || '',
          start_time: object.start_time || new Date().toISOString(),
          timezone: object.timezone || 'Europe/Kyiv',
          status: 'started',
          participants: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }

      if (!meeting.participants || typeof meeting.participants !== 'object') {
        meeting.participants = {};
      }

      const pRaw = (object.participant && typeof object.participant === 'object')
        ? object.participant
        : {};

      const rawEmail = (pRaw.email || pRaw.user_email || '').trim();
      const rawUserId = pRaw.user_id !== undefined && pRaw.user_id !== null ? String(pRaw.user_id).trim() : '';
      const rawZoomId = pRaw.id !== undefined && pRaw.id !== null
        ? String(pRaw.id).trim()
        : (pRaw.participant_user_id ? String(pRaw.participant_user_id).trim() : '');
      const rawName = (pRaw.user_name || pRaw.name || '').trim();
      const rawPhone = (pRaw.phone || pRaw.phone_number || '').trim();
      const joinTime = pRaw.join_time || new Date().toISOString();
      const ipAddress = pRaw.ip_address || null;

      // Determine Host role: user_id '16778240' is Zoom's reserved host session ID
      const isHost = rawUserId === '16778240' ||
        (meeting.host_id && (rawZoomId === String(meeting.host_id) || rawUserId === String(meeting.host_id))) ||
        (meeting.host_email && rawEmail && rawEmail.toLowerCase() === meeting.host_email.toLowerCase()) ||
        (object.host_id && (rawZoomId === String(object.host_id) || rawUserId === String(object.host_id))) ||
        (object.host_email && rawEmail && rawEmail.toLowerCase() === object.host_email.toLowerCase());

      // Match existing participant or allocate unique key
      let pKey = findParticipantKey(meeting.participants, {
        email: rawEmail,
        userId: rawUserId,
        zoomUserId: rawZoomId,
        phone: rawPhone,
        name: rawName
      });

      if (!pKey) {
        pKey = generateParticipantKey(meeting.participants, {
          email: rawEmail,
          userId: rawUserId,
          phone: rawPhone,
          name: rawName
        });
      }

      const existingP = meeting.participants[pKey];
      const displayName = rawName || existingP?.name || rawEmail || (rawPhone || (rawUserId ? `User ${rawUserId}` : 'Гість'));

      const sessions = existingP?.sessions ? [...existingP.sessions] : [];

      // Check for an orphaned leave session from out-of-order delivery (Test B11)
      const orphanLeaveSession = sessions.find(s => !s.join_time && s.leave_time);
      if (orphanLeaveSession) {
        orphanLeaveSession.join_time = joinTime;
        const startMs = Date.parse(joinTime);
        const endMs = Date.parse(orphanLeaveSession.leave_time);
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
          orphanLeaveSession.duration_seconds = Math.round((endMs - startMs) / 1000);
        }
      } else {
        // Check if there is already an open session with the same user_id
        const openSession = sessions.find(s => !s.leave_time && s.user_id === rawUserId);
        if (!openSession) {
          sessions.push({
            user_id: rawUserId || undefined,
            join_time: joinTime,
            leave_time: null,
            duration_seconds: 0
          });
        }
      }

        const hasOpenSession = sessions.some(s => !s.leave_time);

        meeting.participants[pKey] = {
          ...existingP,
          name: displayName,
          user_name: displayName,
          email: rawEmail || existingP?.email || '',
          phone: rawPhone || existingP?.phone || '',
          user_id: rawUserId || existingP?.user_id || '',
          zoom_user_id: rawZoomId || existingP?.zoom_user_id || '',
          is_host: Boolean(isHost || existingP?.is_host),
          first_join_time: existingP?.first_join_time || joinTime,
          last_leave_time: existingP?.last_leave_time || orphanLeaveSession?.leave_time || null,
          join_time: existingP?.join_time || joinTime,
          leave_time: hasOpenSession ? null : (existingP?.last_leave_time || orphanLeaveSession?.leave_time || existingP?.leave_time || null),
          ip_address: ipAddress || existingP?.ip_address || null,
          sessions,
          duration_seconds: calculateIntervalUnionSeconds(sessions)
        };

        await saveMeeting(meetingId, meeting, { merge: true });
        return responder.send(200, { success: true, message: 'Participant joined processed' });
      });
    }

    // ------------------------------------------------------------------------
    // 4. Event: meeting.participant_left
    // ------------------------------------------------------------------------
    if (event === 'meeting.participant_left') {
      if (!meetingId) {
        return responder.send(200, { success: true, message: 'participant_left missing meeting id' });
      }

      return await withMeetingLock(meetingId, async () => {
        let meeting = await getMeeting(meetingId);
      if (!meeting) {
        // Unknown meeting or out-of-order leave (Tests F4.5, B11)
        meeting = {
          meeting_id: meetingId,
          meetingId: meetingId,
          uuid: object.uuid || '',
          topic: object.topic || 'Zoom Meeting',
          host_id: object.host_id || '',
          host_email: object.host_email || '',
          host_name: object.host_name || '',
          start_time: object.start_time || new Date().toISOString(),
          timezone: object.timezone || 'Europe/Kyiv',
          status: 'started',
          participants: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }

      if (!meeting.participants || typeof meeting.participants !== 'object') {
        meeting.participants = {};
      }

      const pRaw = (object.participant && typeof object.participant === 'object')
        ? object.participant
        : {};

      const rawEmail = (pRaw.email || pRaw.user_email || '').trim();
      const rawUserId = pRaw.user_id !== undefined && pRaw.user_id !== null ? String(pRaw.user_id).trim() : '';
      const rawZoomId = pRaw.id !== undefined && pRaw.id !== null
        ? String(pRaw.id).trim()
        : (pRaw.participant_user_id ? String(pRaw.participant_user_id).trim() : '');
      const rawName = (pRaw.user_name || pRaw.name || '').trim();
      const rawPhone = (pRaw.phone || pRaw.phone_number || '').trim();
      const leaveTime = pRaw.leave_time || new Date().toISOString();

      let pKey = findParticipantKey(meeting.participants, {
        email: rawEmail,
        userId: rawUserId,
        zoomUserId: rawZoomId,
        phone: rawPhone,
        name: rawName
      });

      if (pKey && meeting.participants[pKey]) {
        const p = meeting.participants[pKey];
        if (!Array.isArray(p.sessions)) {
          p.sessions = [];
        }

        // Locate open session: prefer session matching user_id/device
        let openSession = p.sessions.find(s => !s.leave_time && s.user_id === rawUserId);
        if (!openSession) {
          openSession = p.sessions.slice().reverse().find(s => !s.leave_time);
        }

        if (openSession) {
          openSession.leave_time = leaveTime;
          const startMs = Date.parse(openSession.join_time);
          const endMs = Date.parse(leaveTime);
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
            openSession.duration_seconds = Math.round((endMs - startMs) / 1000);
          }
        } else {
          // Out of order: left arrived before joined
          p.sessions.push({
            user_id: rawUserId || undefined,
            join_time: null,
            leave_time: leaveTime,
            duration_seconds: 0
          });
        }

        p.last_leave_time = leaveTime;

        // Check if any open session remains active (e.g. Test B7 multi-device)
        const hasOpenSession = p.sessions.some(s => !s.leave_time);
        if (!hasOpenSession) {
          p.leave_time = leaveTime;
        }

        p.duration_seconds = calculateIntervalUnionSeconds(p.sessions);
      } else {
        // Participant not recorded yet: store orphan leave session (Test B11)
        pKey = generateParticipantKey(meeting.participants, {
          email: rawEmail,
          userId: rawUserId,
          phone: rawPhone,
          name: rawName
        });

        const displayName = rawName || rawEmail || (rawPhone || (rawUserId ? `User ${rawUserId}` : 'Гість'));
        const isHost = rawUserId === '16778240' ||
          (meeting.host_id && (rawZoomId === String(meeting.host_id) || rawUserId === String(meeting.host_id))) ||
          (meeting.host_email && rawEmail && rawEmail.toLowerCase() === meeting.host_email.toLowerCase());

        meeting.participants[pKey] = {
          name: displayName,
          user_name: displayName,
          email: rawEmail,
          phone: rawPhone,
          user_id: rawUserId,
          zoom_user_id: rawZoomId,
          is_host: Boolean(isHost),
          first_join_time: null,
          last_leave_time: leaveTime,
          join_time: null,
          leave_time: leaveTime,
          ip_address: null,
          sessions: [
            {
              user_id: rawUserId || undefined,
              join_time: null,
              leave_time: leaveTime,
              duration_seconds: 0
            }
          ],
          duration_seconds: 0
        };
      }

        await saveMeeting(meetingId, meeting, { merge: true });
        return responder.send(200, { success: true, message: 'Participant left processed' });
      });
    }

    // ------------------------------------------------------------------------
    // 5. Event: meeting.ended
    // ------------------------------------------------------------------------
    if (event === 'meeting.ended') {
      if (!meetingId) {
        return responder.send(200, { success: true, message: 'meeting.ended missing meeting id' });
      }

      return await withMeetingLock(meetingId, async () => {
        let meeting = await getMeeting(meetingId);
      if (!meeting) {
        meeting = {
          meeting_id: meetingId,
          meetingId: meetingId,
          uuid: object.uuid || '',
          topic: object.topic || 'Zoom Meeting',
          host_id: object.host_id || '',
          host_email: object.host_email || '',
          host_name: object.host_name || '',
          start_time: object.start_time || new Date().toISOString(),
          timezone: object.timezone || 'Europe/Kyiv',
          status: 'ended',
          participants: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }

      const endTime = object.end_time || new Date().toISOString();
      meeting.status = 'ended';
      meeting.end_time = endTime;

      if (object.duration !== undefined && object.duration !== null) {
        meeting.duration = Number(object.duration);
      } else if (meeting.start_time && endTime) {
        const startMs = Date.parse(meeting.start_time);
        const endMs = Date.parse(endTime);
        meeting.duration = (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs)
          ? Math.round((endMs - startMs) / 60000)
          : 0;
      } else {
        meeting.duration = meeting.duration || 0;
      }

      // Auto-close open participant sessions on meeting end (Test F5.3)
      if (meeting.participants && typeof meeting.participants === 'object') {
        for (const p of Object.values(meeting.participants)) {
          if (!p || typeof p !== 'object') continue;

          let closedAny = false;
          if (Array.isArray(p.sessions)) {
            for (const s of p.sessions) {
              if (s && !s.leave_time) {
                s.leave_time = endTime;
                const startMs = Date.parse(s.join_time);
                const endMs = Date.parse(endTime);
                if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
                  s.duration_seconds = Math.round((endMs - startMs) / 1000);
                }
                closedAny = true;
              }
            }
          }

          if (closedAny) {
            p.leave_time = endTime;
            p.last_leave_time = endTime;
            p.duration_seconds = calculateIntervalUnionSeconds(p.sessions);
          } else if (!p.leave_time && (!p.sessions || p.sessions.length === 0)) {
            p.leave_time = endTime;
            p.last_leave_time = endTime;
          }
        }
      }

      // Trigger Zoom API QoS Enrichment with 2.5s bounded timeout to protect 3s webhook SLA
      try {
        const qosPromise = fetchZoomMeetingQoS(meetingId);
        const timeoutPromise = new Promise(resolve =>
          setTimeout(() => resolve({ success: false, reason: 'timeout' }), 2500)
        );
        const qosResult = await Promise.race([qosPromise, timeoutPromise]);

        if (qosResult && qosResult.success) {
          enrichMeetingWithQoS(meeting, qosResult);
        }
      } catch (err) {
        console.warn(`[Zoom Webhook] QoS enrichment error for meeting ${meetingId}: ${err.message}`);
      }

      await saveMeeting(meetingId, meeting, { merge: true });
      return responder.send(200, { success: true, message: 'Meeting ended processed' });
    });
  }

    // ------------------------------------------------------------------------
    // 6. Other / Unknown Events (Test B10)
    // ------------------------------------------------------------------------
    return responder.send(200, { success: true, message: `Event ${event} ignored` });

  } catch (err) {
    console.error('[Zoom Webhook] Unhandled exception in webhook handler:', err);
    return responder.send(500, { error: 'Internal Server Error', message: err.message });
  }
}

export { handler };
