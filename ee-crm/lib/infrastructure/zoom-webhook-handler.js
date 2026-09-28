// ee-crm/lib/zoom-webhook-handler.js
// Pure ESM Zoom Webhook Ingestion & Security Handler
// Supports Vercel Serverless (Node req, res) and Web Fetch API (request)

import crypto from 'crypto';
import {
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection
} from './redis.js';
import { logger } from './logger.js';
import { getHeader, verifyZoomWebhookSignature } from './zoom-signature.js';
import { toSafeOccurrenceId, normalizeWebhookEventToFacts, reduceOccurrenceFacts } from '../domain/zoom-occurrence.js';
import { normalizeInvitationAcceptedEvent } from '../domain/zoom-membership.js';
import { upsertMembershipActivation } from './zoom-membership-store.js';

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
 * Ingest an incoming webhook event into the authoritative EE-CRM occurrence store.
 * @param {string} event
 * @param {object} payload
 * @returns {Promise<{ disposition: string, safeId?: string, revision?: number }>}
 */
async function ingestOccurrenceEvent(event, payload) {
  const object = (payload && typeof payload.object === 'object' && payload.object !== null)
    ? payload.object
    : {};

  const uuid = object.uuid ? String(object.uuid).trim() : null;
  if (!uuid) {
    return { disposition: 'legacy_only_missing_uuid' };
  }

  const safeId = toSafeOccurrenceId(uuid);
  const facts = normalizeWebhookEventToFacts(event, payload);
  for (const fact of facts) {
    await saveOccurrenceFact(safeId, fact);
  }

  if (facts.length > 0) {
    const allFacts = await getOccurrenceFacts(safeId);
    const projection = reduceOccurrenceFacts(uuid, allFacts);
    await publishOccurrenceProjection(safeId, projection);
    return { disposition: 'projected', safeId, revision: projection.revision };
  }

  return { disposition: 'accepted', safeId };
}

export async function ingestMembershipEvent(body, options = {}) {
  const normalized = normalizeInvitationAcceptedEvent(body, options.nowMs ?? Date.now());
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const activation = {
    ...normalized.value,
    receivedAt: new Date(options.nowMs ?? Date.now()).toISOString()
  };
  const result = await upsertMembershipActivation(
    activation,
    options.redisClient || null
  );
  return {
    ok: true,
    disposition: result.disposition,
    activation: result.activation
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
  let rawBody = '';

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

      if (req.rawBody) {
        rawBody = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf-8');
      }

      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === 'object') {
          body = req.body;
          if (!rawBody) rawBody = JSON.stringify(req.body);
        } else if (typeof req.body === 'string') {
          rawBody = req.body;
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
          rawBody = raw;
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
        rawBody = await request.text();
        if (rawBody && rawBody.trim().length > 0) {
          body = JSON.parse(rawBody);
        }
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
      const secret = (process.env.ZOOM_WEBHOOK_SECRET_TOKEN || (process.env.NODE_ENV === 'test' ? 'test_webhook_secret_token_12345' : '')).trim();

      if (!secret) {
        return responder.send(500, { error: 'ZOOM_WEBHOOK_SECRET_TOKEN not configured' });
      }

      const encryptedToken = crypto
        .createHmac('sha256', secret)
        .update(plainToken)
        .digest('hex');

      // Best effort audit log to ee:app:logs
      logger.info('ZOOM_CRC', 'CRC challenge-response verified successfully', { plainToken }).catch(err => {
        console.error('[Zoom Webhook] Audit log error on CRC:', err.message);
      });

      return responder.send(200, { plainToken, encryptedToken });
    }

    if (!event) {
      return responder.send(400, { error: 'Missing event field in request body' });
    }

    // Verify HMAC-SHA256 signature for non-CRC events
    const hasSignature = Boolean(getHeader(reqOrRequest, 'x-zm-signature'));
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction || hasSignature) {
      const secret = (process.env.ZOOM_WEBHOOK_SECRET_TOKEN || (process.env.NODE_ENV === 'test' ? 'test_webhook_secret_token_12345' : '')).trim();
      const sigResult = verifyZoomWebhookSignature({
        req: reqOrRequest,
        rawBody,
        secret
      });

      if (!sigResult.valid) {
        return responder.send(401, { error: 'Unauthorized: Invalid or missing Zoom webhook signature', reason: sigResult.reason });
      }
    }

    if (event === 'user.invitation_accepted') {
      let result;
      try {
        result = await ingestMembershipEvent(body);
      } catch (membershipError) {
        console.error('[Zoom Webhook] Membership persistence failed:', membershipError);
        logger.error('ZOOM_MEMBERSHIP_PERSISTENCE_FAILED', 'Zoom membership activation persistence failed', membershipError, {
          event
        }).catch(() => {});
        return responder.send(500, {
          error: 'ZOOM_MEMBERSHIP_PERSISTENCE_FAILED',
          message: 'Membership activation persistence failed'
        });
      }

      if (!result.ok) {
        logger.warn('ZOOM_MEMBERSHIP_EVENT_INVALID', 'Rejected malformed Zoom membership event', {
          event,
          reason: result.reason
        }).catch(() => {});
        return responder.send(400, {
          error: 'INVALID_ZOOM_MEMBERSHIP_EVENT',
          reason: result.reason
        });
      }

      logger.info('ZOOM_MEMBERSHIP_ACTIVATED', 'Zoom organization membership activation persisted', {
        event,
        disposition: result.disposition,
        account_id: result.activation.accountId,
        zoom_user_id: result.activation.zoomUserId,
        accepted_at: result.activation.acceptedAt
      }).catch(() => {});
      return responder.send(200, {
        success: true,
        event,
        disposition: result.disposition
      });
    }

    const object = (payload && typeof payload.object === 'object' && payload.object !== null)
      ? payload.object
      : {};

    const rawMeetingId = object.id || object.meeting_id || object.uuid;
    const meetingId = rawMeetingId !== undefined && rawMeetingId !== null ? String(rawMeetingId) : null;

    const isKnownEvent = [
      'meeting.started',
      'meeting.ended',
      'meeting.participant_joined',
      'meeting.participant_left',
      'meeting.participant_admitted',
      'meeting.participant_joined_waiting_room',
      'meeting.participant_left_waiting_room',
      'meeting.participant_data_connection_established',
      'meeting.participant_connection_established',
      'meeting.participant_jbh_waiting',
      'meeting.participant_jbh_joined'
    ].includes(event);

    // Ingest authoritative occurrence if uuid is present
    let occResult = null;
    try {
      occResult = await ingestOccurrenceEvent(event, payload);
      if (occResult.disposition === 'legacy_only_missing_uuid' && isKnownEvent) {
        logger.warn('ZOOM_WEBHOOK', `Event ${event} has no object.uuid`, {
          event: 'metric.legacy_only_missing_uuid',
          meeting_id: meetingId
        }).catch(err => {
          console.error('[Zoom Webhook] Audit log error on missing uuid:', err.message);
        });
      }
    } catch (occErr) {
      console.error('[Zoom Webhook] Occurrence ingestion failed:', occErr);
      logger.error('ZOOM_WEBHOOK', 'Occurrence ingestion failed', occErr, {
        event,
        meeting_id: meetingId
      }).catch(() => {});
      return responder.send(500, {
        error: 'ZOOM_PERSISTENCE_FAILED',
        message: 'Occurrence persistence failed'
      });
    }

    // Secondary audit logging to ee:app:logs via standard logger (best-effort)
    try {
      await logger.info('ZOOM_WEBHOOK', `Zoom webhook event: ${event}`, {
        event,
        status: isKnownEvent ? 'success' : 'unexpected_event',
        meeting_id: meetingId,
        topic: object.topic || (meetingId ? `Meeting ${meetingId}` : 'Zoom Event'),
        host_email: object.host_email || undefined,
        host_name: object.host_name || undefined,
        participant_name: object.participant?.user_name || object.participant?.name || undefined,
        participant_email: object.participant?.email || object.participant?.user_email || undefined,
        participant_user_id: object.participant?.user_id !== undefined ? String(object.participant.user_id) : undefined,
        details: {
          action: object.action || undefined,
          ip_address: object.participant?.public_ip || object.participant?.ip_address || undefined,
          join_time: object.participant?.join_time || undefined,
          leave_time: object.participant?.leave_time || undefined,
          duration: object.duration !== undefined ? object.duration : undefined,
          start_time: object.start_time || undefined,
          end_time: object.end_time || undefined
        }
      });
    } catch (logErr) {
      console.error('[Zoom Webhook] Secondary audit log error:', logErr.message);
    }

    return responder.send(200, {
      success: true,
      message: 'Event processed successfully',
      event,
      disposition: occResult?.disposition || 'accepted'
    });

  } catch (err) {
    console.error('[Zoom Webhook] Unhandled exception in webhook handler:', err);
    return responder.send(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    });
  }
}

export { handler };
