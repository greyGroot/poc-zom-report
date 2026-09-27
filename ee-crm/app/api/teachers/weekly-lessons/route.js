// ee-crm/app/api/teachers/weekly-lessons/route.js
// Thin transport adapter for weekly lesson summaries

import { NextResponse } from 'next/server';
import { isSchoolmateUnavailableError, toPublicSchoolmateError } from '@/lib/infrastructure/schoolmate.js';
import { getWeeklyLessonSummaries } from '@/lib/services/weekly-schedule-service.js';

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { teacherIds = [], fromDate, toDate } = body || {};

    if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
      return NextResponse.json({ results: {} });
    }

    const validIds = teacherIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

    const data = await getWeeklyLessonSummaries({
      teacherIds: validIds,
      fromDate,
      toDate
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('[WEEKLY_LESSONS] Error computing weekly lessons:', err);
    if (isSchoolmateUnavailableError(err)) {
      const pub = toPublicSchoolmateError(err);
      return NextResponse.json(pub.body, { status: pub.status });
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
