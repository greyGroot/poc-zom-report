// ee-crm/app/api/migrations/zoom/route.js
// Migration API route to execute CRM-003 historical Zoom meeting backfill.

import { NextResponse } from 'next/server';
import { runMigration, getRedactedFingerprint } from '@/scripts/migrate-poc-zoom-occurrences.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('inspect') === 'true') {
      const url = process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
      const token = process.env.EE_CRM_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
      const { Redis } = await import('@upstash/redis');
      const client = new Redis({ url, token });
      const allKeys = await client.keys('*');
      return NextResponse.json({ success: true, allKeys });
    }

    const report = await runMigration({
      cliArgs: {
        isDryRun: true,
        isExecute: false,
        batchSize: 50,
        reportFile: './crm-003-migration-dry-run.json'
      }
    });
    return NextResponse.json({ success: true, mode: 'dry-run', report });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const url = process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
    const fingerprint = getRedactedFingerprint(url);

    const report = await runMigration({
      cliArgs: {
        isDryRun: false,
        isExecute: true,
        confirmTarget: fingerprint,
        batchSize: 50,
        reportFile: './crm-003-migration-live.json'
      }
    });
    return NextResponse.json({ success: true, mode: 'execute', report });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
