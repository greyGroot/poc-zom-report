// ee-crm/app/api/health/route.js
// Health check endpoint verifying Upstash Redis and Schoolmate configuration

import { NextResponse } from 'next/server';
import { getTeachers, addAppLog } from '@/lib/db.js';

export async function GET() {
  const isRedisConfigured = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );

  const isSchoolmateConfigured = Boolean(
    process.env.SCHOOLMATE_USERNAME && process.env.SCHOOLMATE_PASSWORD
  );

  let redisLive = false;
  try {
    // Attempt quick read/write verification
    await addAppLog({
      level: 'INFO',
      action: 'HEALTH_CHECK',
      message: 'Health check probe executed'
    });
    redisLive = true;
  } catch (err) {
    console.error('Health check Redis probe error:', err.message);
  }

  return NextResponse.json({
    status: 'ok',
    service: 'Empire English CRM (EE CRM)',
    timestamp: new Date().toISOString(),
    integrations: {
      redis: {
        configured: isRedisConfigured,
        connected: redisLive,
        mode: isRedisConfigured ? 'upstash_cloud' : 'in_memory_fallback'
      },
      schoolmate: {
        configured: isSchoolmateConfigured,
        baseUrl: process.env.SCHOOLMATE_BASE_URL || 'https://empireenglish.schoolmate.eu',
        username: process.env.SCHOOLMATE_USERNAME ? '✓ configured' : 'missing'
      }
    }
  });
}
