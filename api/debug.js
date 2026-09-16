// api/debug.js
// Live Webhook Event Monitor & Redis Debugging API
import { getRedisClient, getWebhookLogs, clearWebhookLogs, getMeeting, MEETINGS_INDEX_KEY, isMockClient } from './lib/redis.js';

export default async function handler(reqOrRequest, optionalRes) {
  const isNode = Boolean(
    optionalRes &&
    (typeof optionalRes.status === 'function' ||
     typeof optionalRes.json === 'function' ||
     typeof optionalRes.setHeader === 'function')
  );

  const send = (code, data) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (isNode) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof optionalRes.setHeader === 'function') optionalRes.setHeader(k, v);
      }
      if (typeof optionalRes.status === 'function') optionalRes.status(code);
      if (typeof optionalRes.json === 'function') return optionalRes.json(data);
      return optionalRes.end(JSON.stringify(data));
    }

    return new Response(JSON.stringify(data), { status: code, headers });
  };

  const req = reqOrRequest;
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return send(200, { success: true });
  }

  let query = {};
  if (isNode && req.query) {
    query = req.query;
  } else if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      query = Object.fromEntries(url.searchParams.entries());
    } catch {}
  }

  // Handle clearing logs
  if (method === 'DELETE' || query.action === 'clear') {
    await clearWebhookLogs();
    return send(200, { success: true, message: 'All webhook event logs cleared successfully' });
  }

  try {
    const redis = getRedisClient();
    const logs = await getWebhookLogs(100);
    const errors = logs.filter(l => l.status === 'error' || l.event?.startsWith('error') || l.status === 'unexpected_event');

    // Get all meeting IDs in index
    let meetingIds = [];
    try {
      meetingIds = await redis.zrange(MEETINGS_INDEX_KEY, 0, -1, { rev: true }) || [];
    } catch {
      meetingIds = [];
    }

    // Fetch raw meeting data
    const rawMeetings = await Promise.all(
      meetingIds.map(async id => {
        const data = await getMeeting(id);
        return { meeting_id: id, data };
      })
    );

    return send(200, {
      success: true,
      timestamp: new Date().toISOString(),
      total_webhook_events_logged: logs.length,
      total_errors: errors.length,
      errors,
      webhook_events: logs,
      redis_status: {
        is_mock: isMockClient(),
        provider: process.env.KV_REST_API_URL ? 'Vercel KV' : (process.env.UPSTASH_REDIS_REST_URL ? 'Upstash Redis' : 'In-Memory Mock')
      },
      env_variables_detected: {
        KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
        KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
        UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        ZOOM_WEBHOOK_SECRET_TOKEN: Boolean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN),
        ZOOM_CLIENT_ID: Boolean(process.env.ZOOM_CLIENT_ID),
        ZOOM_CLIENT_SECRET: Boolean(process.env.ZOOM_CLIENT_SECRET),
        ZOOM_ACCOUNT_ID: Boolean(process.env.ZOOM_ACCOUNT_ID)
      },
      total_webhook_events_logged: logs.length,
      webhook_events: logs,
      total_meetings_in_index: meetingIds.length,
      meetings: rawMeetings
    });
  } catch (err) {
    return send(500, {
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
}
