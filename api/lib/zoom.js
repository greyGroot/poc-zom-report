// api/lib/zoom.js
// Pure ESM Zoom OAuth & QoS Telemetry Enrichment with graceful 400/403 fallback

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Check if Zoom Server-to-Server OAuth credentials are configured.
 */
export function isZoomConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}

/**
 * Clear cached Zoom OAuth access token.
 */
export function clearZoomTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * Obtain Zoom Server-to-Server OAuth Access Token with in-memory caching (5-minute buffer).
 * @param {{
 *   accountId?: string,
 *   clientId?: string,
 *   clientSecret?: string,
 *   forceRefresh?: boolean
 * }} [options]
 * @returns {Promise<string>} Bearer Access Token
 */
export async function getZoomAccessToken(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const accountId = options.accountId || process.env.ZOOM_ACCOUNT_ID;
  const clientId = options.clientId || process.env.ZOOM_CLIENT_ID;
  const clientSecret = options.clientSecret || process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Missing ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET in environment.');
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Cache token, expiring 5 minutes before actual expiry (default 1h)
  const ttlMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = now + ttlMs - (5 * 60 * 1000);

  return cachedToken;
}

/**
 * Fetch meeting QoS and participant metrics with graceful fallback on 400 / 403 Forbidden.
 * Attempts /v2/metrics/meetings/{meetingId}/participants/qos first, then /v2/past_meetings/{meetingId}/participants.
 *
 * @param {string|number} meetingId
 * @param {string|{ token?: string }} [tokenOrOptions]
 * @returns {Promise<{
 *   success: boolean,
 *   endpoint?: string,
 *   status?: number,
 *   data?: object,
 *   error?: string,
 *   reason?: string
 * }>}
 */
export async function fetchZoomMeetingQoS(meetingId, tokenOrOptions = {}) {
  if (!meetingId) {
    return { success: false, reason: 'missing_meeting_id', status: 400 };
  }

  let token = typeof tokenOrOptions === 'string' ? tokenOrOptions : tokenOrOptions.token;
  if (!token) {
    try {
      if (!isZoomConfigured()) {
        return { success: false, reason: 'zoom_credentials_not_configured', status: 401 };
      }
      token = await getZoomAccessToken();
    } catch (err) {
      console.warn(`[Zoom QoS] Failed to obtain access token: ${err.message}`);
      return { success: false, reason: 'auth_failed', error: err.message, status: 401 };
    }
  }

  const encodedId = encodeURIComponent(String(meetingId));
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };

  // 1. Attempt Primary QoS Endpoint: /v2/metrics/meetings/{meetingId}/participants/qos
  const primaryUrl = `https://api.zoom.us/v2/metrics/meetings/${encodedId}/participants/qos`;
  try {
    const res = await fetch(primaryUrl, { method: 'GET', headers });
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        endpoint: 'metrics/qos',
        status: res.status,
        data
      };
    }

    // If 403 (Forbidden) or 400 (Bad Request / non-dashboard account), attempt fallback
    if (res.status === 403 || res.status === 400 || res.status === 404) {
      console.info(`[Zoom QoS] Primary QoS endpoint returned HTTP ${res.status}. Attempting past_meetings fallback.`);
    } else {
      console.warn(`[Zoom QoS] Primary QoS endpoint returned unexpected status HTTP ${res.status}.`);
    }
  } catch (err) {
    console.warn(`[Zoom QoS] Primary QoS request failed (${err.message}). Attempting fallback.`);
  }

  // 2. Attempt Fallback Endpoint: /v2/past_meetings/{meetingId}/participants
  const fallbackUrl = `https://api.zoom.us/v2/past_meetings/${encodedId}/participants`;
  try {
    const fallbackRes = await fetch(fallbackUrl, { method: 'GET', headers });
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      return {
        success: true,
        endpoint: 'past_meetings/participants',
        status: fallbackRes.status,
        data
      };
    }

    // Gracefully handle 400 / 403 / 404 without throwing
    const errText = await fallbackRes.text().catch(() => '');
    console.warn(`[Zoom QoS] Fallback endpoint returned HTTP ${fallbackRes.status}: ${errText}`);
    return {
      success: false,
      endpoint: 'past_meetings/participants',
      status: fallbackRes.status,
      reason: fallbackRes.status === 403 ? 'forbidden' : 'unavailable',
      error: errText
    };
  } catch (fallbackErr) {
    console.warn(`[Zoom QoS] Fallback request failed: ${fallbackErr.message}`);
    return {
      success: false,
      endpoint: 'past_meetings/participants',
      error: fallbackErr.message,
      reason: 'network_error'
    };
  }
}

/**
 * Merge QoS metrics or participant details into a meeting record's participants.
 * @param {object} meetingRecord
 * @param {object} qosResult - Result from fetchZoomMeetingQoS
 * @returns {object} The mutated meetingRecord
 */
export function enrichMeetingWithQoS(meetingRecord, qosResult) {
  if (!meetingRecord || !qosResult || !qosResult.success || !qosResult.data) {
    return meetingRecord;
  }

  const rawParticipants = qosResult.data.participants || [];
  if (!Array.isArray(rawParticipants) || rawParticipants.length === 0) {
    return meetingRecord;
  }

  // Mark meeting as QoS enriched
  meetingRecord.qos_enriched = true;
  meetingRecord.qosEnriched = true;

  // Handle participants stored as Array or Object map
  if (Array.isArray(meetingRecord.participants)) {
    for (const qp of rawParticipants) {
      const qpEmail = (qp.user_email || qp.email || '').toLowerCase().trim();
      const qpName = (qp.name || qp.user_name || '').toLowerCase().trim();
      const qpId = String(qp.user_id || qp.id || '');

      const target = meetingRecord.participants.find(p => {
        if (!p || typeof p !== 'object') return false;
        const pEmail = (p.email || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const pId = String(p.user_id || p.userId || '');
        return (qpEmail && pEmail && qpEmail === pEmail) ||
               (qpId && pId && qpId === pId) ||
               (qpName && pName && qpName === pName);
      });

      if (target) {
        if (qp.device) target.device = qp.device;
        if (qp.ip_address || qp.ip) target.ip_address = qp.ip_address || qp.ip;
        if (qp.network_type) target.network_type = qp.network_type;
        if (qp.location) target.location = qp.location;
        if (qp.qos_metrics || qp.audio_quality) {
          target.qos_metrics = qp.qos_metrics || {
            audio_quality: qp.audio_quality,
            video_quality: qp.video_quality,
            screen_share_quality: qp.screen_share_quality
          };
        }
      }
    }
  } else if (meetingRecord.participants && typeof meetingRecord.participants === 'object') {
    // Map of participant keys
    for (const qp of rawParticipants) {
      const qpEmail = (qp.user_email || qp.email || '').toLowerCase().trim();
      const qpName = (qp.name || qp.user_name || '').toLowerCase().trim();
      const qpId = String(qp.user_id || qp.id || '');

      for (const [key, p] of Object.entries(meetingRecord.participants)) {
        if (!p || typeof p !== 'object') continue;
        const pEmail = (p.email || key || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const pId = String(p.user_id || p.userId || '');

        if ((qpEmail && pEmail && qpEmail === pEmail) ||
            (qpId && pId && qpId === pId) ||
            (qpName && pName && qpName === pName)) {
          if (qp.device) p.device = qp.device;
          if (qp.ip_address || qp.ip) p.ip_address = qp.ip_address || qp.ip;
          if (qp.network_type) p.network_type = qp.network_type;
          if (qp.location) p.location = qp.location;
          if (qp.qos_metrics || qp.audio_quality) {
            p.qos_metrics = qp.qos_metrics || {
              audio_quality: qp.audio_quality,
              video_quality: qp.video_quality,
              screen_share_quality: qp.screen_share_quality
            };
          }
          break;
        }
      }
    }
  }

  return meetingRecord;
}
