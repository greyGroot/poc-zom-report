// ee-crm/app/api/schoolmate/sync-teachers/route.js
// Synchronizes all teachers from Schoolmate EU into CRM database with deduplication

import { NextResponse } from 'next/server';
import { SchoolmateClient } from '@/lib/schoolmate.js';
import { bulkUpsertTeachers, getTeachers } from '@/lib/db.js';
import { getZoomUsersStatusMap } from '@/lib/zoom.js';
import { logger } from '@/lib/logger.js';

export async function POST() {
  const startTime = Date.now();
  try {
    const client = new SchoolmateClient();
    
    // 1. Fetch all teachers from Schoolmate
    const schoolmateTeachers = await client.fetchTeachersList({ pageSize: 300 });

    // 2. Bulk upsert with deduplication
    const stats = await bulkUpsertTeachers(schoolmateTeachers);

    // 3. Fetch full enriched list with Zoom statuses
    const teachers = await getTeachers();
    let zoomMap = new Map();
    try {
      zoomMap = await getZoomUsersStatusMap();
    } catch {
      // ignore
    }

    const enrichedTeachers = teachers.map(t => {
      const emailToCheck = (t.zoomHostEmail || t.email || '').trim().toLowerCase();
      const zoomStatus = zoomMap.get(emailToCheck) || 'not_invited';
      return {
        ...t,
        zoomStatus
      };
    });

    const durationMs = Date.now() - startTime;

    await logger.info('TEACHERS_SYNC_SUCCESS', `Synced ${stats.totalFetched} teachers from Schoolmate (${stats.created} added, ${stats.updated} updated) in ${durationMs}ms`, {
      ...stats,
      durationMs
    });

    return NextResponse.json({
      success: true,
      stats,
      teachers: enrichedTeachers,
      durationMs
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logger.error('TEACHERS_SYNC_ERROR', `Failed to sync teachers from Schoolmate: ${err.message}`, {
      error: err.message,
      durationMs
    });

    return NextResponse.json(
      { error: err.message || 'Failed to sync teachers from Schoolmate' },
      { status: 500 }
    );
  }
}
