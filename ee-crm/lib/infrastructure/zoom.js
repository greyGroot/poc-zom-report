import { normalizeUsersSnapshot } from '../domain/zoom-membership.js';

let cachedToken = null;
let cachedTokenAccountId = null;
let tokenExpiresAt = 0;
let cachedUsersSnapshot = null;
let cachedUsersAccountId = null;
let usersSnapshotExpiresAt = 0;

export const ZOOM_USERS_CACHE_TTL_MS = 60 * 1000;

export class ZoomSourceError extends Error {
  constructor(message, category = 'transport', details = {}) {
    super(message);
    this.name = 'ZoomSourceError';
    this.category = category;
    this.details = details;
  }
}

function credentials(options = {}) {
  return {
    accountId: options.accountId || process.env.ZOOM_ACCOUNT_ID || '',
    clientId: options.clientId || process.env.ZOOM_CLIENT_ID || '',
    clientSecret: options.clientSecret || process.env.ZOOM_CLIENT_SECRET || ''
  };
}

export function isZoomConfigured(options = {}) {
  const value = credentials(options);
  return Boolean(value.accountId && value.clientId && value.clientSecret);
}

export function clearZoomTokenCache() {
  cachedToken = null;
  cachedTokenAccountId = null;
  tokenExpiresAt = 0;
}

export function clearZoomUsersCache() {
  cachedUsersSnapshot = null;
  cachedUsersAccountId = null;
  usersSnapshotExpiresAt = 0;
}

export async function getZoomAccessToken(options = {}) {
  const now = options.nowMs ?? Date.now();
  const value = credentials(options);
  if (!value.accountId || !value.clientId || !value.clientSecret) {
    throw new ZoomSourceError('Missing Zoom credentials', 'configuration');
  }

  if (!options.forceRefresh && cachedToken && cachedTokenAccountId === value.accountId && now < tokenExpiresAt) {
    return cachedToken;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const authHeader = Buffer.from(`${value.clientId}:${value.clientSecret}`).toString('base64');
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(value.accountId)}`;
  let response;
  try {
    response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  } catch (error) {
    throw new ZoomSourceError(`Zoom OAuth transport failed: ${error.message}`, 'transport');
  }

  if (!response.ok) {
    const category = response.status === 401 || response.status === 403 ? 'authentication' :
      response.status === 429 ? 'rate_limit' : 'transport';
    throw new ZoomSourceError(`Zoom OAuth failed (${response.status})`, category, { status: response.status });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ZoomSourceError('Zoom OAuth returned malformed JSON', 'malformed');
  }
  if (!data?.access_token) {
    throw new ZoomSourceError('Zoom OAuth response omitted access_token', 'malformed');
  }

  cachedToken = data.access_token;
  cachedTokenAccountId = value.accountId;
  const ttlMs = Math.max(60, Number(data.expires_in) || 3600) * 1000;
  tokenExpiresAt = now + Math.max(1000, ttlMs - (5 * 60 * 1000));
  return cachedToken;
}

export async function fetchUsersByStatus(token, status, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const users = [];
  const seenTokens = new Set();
  let nextPageToken = '';
  let page = 0;

  do {
    if (page >= 100) {
      throw new ZoomSourceError(`Zoom ${status} pagination exceeded safety limit`, 'partial_page');
    }
    if (nextPageToken && seenTokens.has(nextPageToken)) {
      throw new ZoomSourceError(`Zoom ${status} pagination token loop`, 'partial_page');
    }
    if (nextPageToken) seenTokens.add(nextPageToken);

    const url = new URL('https://api.zoom.us/v2/users');
    url.searchParams.set('status', status);
    url.searchParams.set('page_size', '300');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    let response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      throw new ZoomSourceError(`Zoom ${status} users transport failed: ${error.message}`, page > 0 ? 'partial_page' : 'transport');
    }

    if (!response.ok) {
      const category = page > 0 ? 'partial_page' :
        response.status === 401 || response.status === 403 ? 'authentication' :
          response.status === 429 ? 'rate_limit' : 'transport';
      throw new ZoomSourceError(`Zoom ${status} users failed (${response.status})`, category, {
        status: response.status,
        page
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ZoomSourceError(`Zoom ${status} users returned malformed JSON`, page > 0 ? 'partial_page' : 'malformed');
    }
    if (!Array.isArray(data?.users)) {
      throw new ZoomSourceError(`Zoom ${status} users response omitted users`, page > 0 ? 'partial_page' : 'malformed');
    }

    users.push(...data.users);
    nextPageToken = typeof data.next_page_token === 'string' ? data.next_page_token.trim() : '';
    page += 1;
  } while (nextPageToken);

  return users;
}

export async function getZoomUsersSnapshot(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const value = credentials(options);
  if (!isZoomConfigured(options)) {
    throw new ZoomSourceError('Zoom user lookup is not configured', 'configuration');
  }
  if (
    !options.forceRefresh &&
    cachedUsersSnapshot &&
    cachedUsersAccountId === value.accountId &&
    nowMs < usersSnapshotExpiresAt
  ) {
    return cachedUsersSnapshot;
  }

  const token = await getZoomAccessToken(options);
  const [activeUsers, pendingUsers] = await Promise.all([
    fetchUsersByStatus(token, 'active', options),
    fetchUsersByStatus(token, 'pending', options)
  ]);

  const snapshot = normalizeUsersSnapshot({
    accountId: value.accountId,
    activeUsers,
    pendingUsers,
    checkedAt: new Date(nowMs).toISOString()
  });
  cachedUsersSnapshot = snapshot;
  cachedUsersAccountId = value.accountId;
  usersSnapshotExpiresAt = nowMs + ZOOM_USERS_CACHE_TTL_MS;
  return snapshot;
}

export async function getZoomUsersStatusMap(options = {}) {
  const snapshot = await getZoomUsersSnapshot(options);
  const statusMap = new Map();
  for (const user of snapshot.users) {
    if (user.status === 'active') {
      statusMap.set(user.email, 'member');
    } else if (!statusMap.has(user.email)) {
      statusMap.set(user.email, 'pending');
    }
  }
  return statusMap;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchTeacherPastMeetings({ token, userId, fromDate, toDate, fetchImpl = fetch, pageSize = 100 } = {}) {
  if (!userId) {
    throw new ZoomSourceError('Missing userId for teacher past meetings report', 'configuration');
  }
  if (!token) {
    token = await getZoomAccessToken({ fetchImpl });
  }

  const meetings = [];
  let nextPageToken = '';
  let page = 0;

  do {
    if (page >= 100) {
      throw new ZoomSourceError('Zoom report meetings pagination exceeded safety limit', 'partial_page');
    }

    const url = new URL(`https://api.zoom.us/v2/report/users/${encodeURIComponent(userId)}/meetings`);
    url.searchParams.set('type', 'past');
    url.searchParams.set('page_size', String(pageSize));
    if (fromDate) url.searchParams.set('from', fromDate);
    if (toDate) url.searchParams.set('to', toDate);
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    let response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      throw new ZoomSourceError(`Zoom report meetings transport failed: ${error.message}`, 'transport');
    }

    if (!response.ok) {
      const category = response.status === 401 || response.status === 403 ? 'authentication' :
        response.status === 429 ? 'rate_limit' : 'transport';
      throw new ZoomSourceError(`Zoom report meetings failed (${response.status})`, category, {
        status: response.status,
        userId,
        page
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ZoomSourceError('Zoom report meetings returned malformed JSON', 'malformed');
    }

    if (Array.isArray(data?.meetings)) {
      meetings.push(...data.meetings);
    }

    nextPageToken = typeof data?.next_page_token === 'string' ? data.next_page_token.trim() : '';
    page += 1;
  } while (nextPageToken);

  return meetings;
}

export async function fetchMeetingParticipantsSafe({
  token,
  meetingKey,
  maxRetries = 3,
  fetchImpl = fetch,
  pacingDelayMs = 200,
  pageSize = 100
} = {}) {
  if (!meetingKey) {
    throw new ZoomSourceError('Missing meetingKey for participants report', 'configuration');
  }
  if (!token) {
    token = await getZoomAccessToken({ fetchImpl });
  }

  const participants = [];
  let nextPageToken = '';
  let page = 0;
  const encodedKey = encodeURIComponent(encodeURIComponent(meetingKey));

  do {
    if (page >= 100) {
      throw new ZoomSourceError('Zoom report participants pagination exceeded safety limit', 'partial_page');
    }

    if (pacingDelayMs > 0) {
      await delay(pacingDelayMs);
    }

    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encodedKey}/participants`);
    url.searchParams.set('page_size', String(pageSize));
    if (nextPageToken) {
      url.searchParams.set('next_page_token', nextPageToken);
    }

    let response;
    let attempt = 0;

    while (true) {
      try {
        response = await fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        throw new ZoomSourceError(`Zoom report participants transport failed: ${error.message}`, 'transport');
      }

      if (response.status === 429) {
        attempt++;
        if (attempt > maxRetries) {
          throw new ZoomSourceError('Zoom report participants rate limit exceeded (429)', 'rate_limit', {
            status: 429,
            meetingKey,
            retriesExhausted: true
          });
        }
        const retryAfterHeader = response.headers?.get ? response.headers.get('retry-after') : null;
        let waitMs = 0;
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!Number.isNaN(parsedSec) && parsedSec > 0) {
            waitMs = parsedSec * 1000;
          }
        }
        if (!waitMs) {
          waitMs = Math.pow(2, attempt) * 1000;
        }
        await delay(waitMs);
        continue;
      }
      break;
    }

    if (!response.ok) {
      const category = response.status === 401 || response.status === 403 ? 'authentication' :
        response.status === 404 ? 'not_found' : 'transport';
      throw new ZoomSourceError(`Zoom report participants failed (${response.status})`, category, {
        status: response.status,
        meetingKey
      });
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ZoomSourceError('Zoom report participants returned malformed JSON', 'malformed');
    }

    if (Array.isArray(data?.participants)) {
      participants.push(...data.participants);
    }

    nextPageToken = typeof data?.next_page_token === 'string' ? data.next_page_token.trim() : '';
    page += 1;
  } while (nextPageToken);

  return participants;
}

