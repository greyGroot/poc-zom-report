// ee-crm/app/api/logs/route.js
// Audit Logs API: Retrieve recent application and integration logs

import { NextResponse } from 'next/server';
import { getAppLogs } from '@/lib/db.js';
import { logger } from '@/lib/logger.js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 100) : 100;

    const logs = await getAppLogs(limit);
    return NextResponse.json({ logs });
  } catch (err) {
    await logger.error('LOGS_FETCH_ERROR', 'Failed to retrieve application logs', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
