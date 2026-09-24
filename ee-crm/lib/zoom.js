// ee-crm/lib/zoom.js
// Zoom Server-to-Server OAuth and User Organization Status Integration

let cachedToken = null;
let tokenExpiresAt = 0;

// In-memory cache for user status map
let cachedUsersMap = null;
let usersMapExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Check if Zoom credentials are provided in environment
 */
export function isZoomConfigured() {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET
  );
}

/**
 * Obtain Zoom Server-to-Server OAuth Access Token with in-memory caching
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
    throw new Error('Missing Zoom credentials (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET).');
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
  const ttlMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = now + ttlMs - (5 * 60 * 1000); // 5 min buffer

  return cachedToken;
}

/**
 * Helper to fetch all users with a specific status from Zoom API, handling pagination
 */
async function fetchUsersByStatus(token, status) {
  const users = [];
  let nextPageToken = '';

  do {
    const url = new URL('https://api.zoom.us/v2/users');
    url.searchParams.set('status', status);
    url.searchParams.set('page_size', '300');
    if (nextPageToken) {
      url.searchParams.set('next_page_token', nextPageToken);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[ZOOM] Error fetching users with status ${status} (${res.status}): ${errText}`);
      break;
    }

    const data = await res.json();
    if (Array.isArray(data.users)) {
      users.push(...data.users);
    }

    nextPageToken = data.next_page_token || '';
  } while (nextPageToken);

  return users;
}

/**
 * Returns a map of lowercase email -> 'member' | 'pending'
 * Cached for 60 seconds to avoid Zoom rate-limits
 */
export async function getZoomUsersStatusMap(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && cachedUsersMap && now < usersMapExpiresAt) {
    return cachedUsersMap;
  }

  if (!isZoomConfigured()) {
    console.warn('[ZOOM] Zoom credentials not configured, returning empty status map');
    return new Map();
  }

  try {
    const token = await getZoomAccessToken(options);

    // Fetch active and pending users in parallel
    const [activeUsers, pendingUsers] = await Promise.all([
      fetchUsersByStatus(token, 'active'),
      fetchUsersByStatus(token, 'pending')
    ]);

    const statusMap = new Map();

    // Active members in organization
    for (const u of activeUsers) {
      if (u.email) {
        statusMap.set(u.email.trim().toLowerCase(), 'member');
      }
    }

    // Pending invites (if user is also in active for some reason, active takes precedence)
    for (const u of pendingUsers) {
      if (u.email) {
        const email = u.email.trim().toLowerCase();
        if (!statusMap.has(email)) {
          statusMap.set(email, 'pending');
        }
      }
    }

    cachedUsersMap = statusMap;
    usersMapExpiresAt = now + CACHE_TTL_MS;

    return statusMap;
  } catch (err) {
    console.error('[ZOOM] Failed to retrieve Zoom users status map:', err.message);
    // If cache exists even if expired, return it as fallback
    if (cachedUsersMap) return cachedUsersMap;
    return new Map();
  }
}
