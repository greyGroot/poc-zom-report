// ee-crm/app/api/health/route.js
// Health check endpoint verifying Upstash Redis and Schoolmate configuration

import { checkRedisHealth } from '../../../lib/redis.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isSchoolmateConfigured = Boolean(
    process.env.SCHOOLMATE_USERNAME && process.env.SCHOOLMATE_PASSWORD
  );

  const redisHealth = await checkRedisHealth();
  const isHealthy = redisHealth.ok && redisHealth.connected;
  const statusCode = isHealthy ? 200 : 503;
  const status = isHealthy ? 'ok' : 'degraded';

  return Response.json(
    {
      status,
      service: 'Empire English CRM (EE CRM)',
      timestamp: new Date().toISOString(),
      integrations: {
        redis: {
          configured: redisHealth.configured,
          connected: redisHealth.connected,
          mode: redisHealth.mode,
          ...(redisHealth.error ? { error: redisHealth.error } : {})
        },
        schoolmate: {
          configured: isSchoolmateConfigured,
          baseUrl: process.env.SCHOOLMATE_BASE_URL || 'https://empireenglish.schoolmate.eu',
          username: process.env.SCHOOLMATE_USERNAME ? '✓ configured' : 'missing'
        }
      }
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  );
}
