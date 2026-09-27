// ee-crm/app/api/teachers/[id]/days/[date]/route.js
// Authoritative Teacher-Day API: Returns factual Schoolmate and Zoom evidence for one day.
// Protected by NextAuth with temporary auth bypass support.
// Responses are private and uncached (no-store).

import { NextResponse } from 'next/server';
import { getTeacherDayData } from '@/lib/services/teacher-day.js';
import { logger } from '@/lib/infrastructure/logger.js';

export async function GET(req, { params }) {
  try {
    const resolvedParams = await params;
    const { id, date } = resolvedParams || {};

    if (!id) {
      return NextResponse.json(
        { error: 'Teacher ID is required' },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      );
    }

    const result = await getTeacherDayData({ teacherId: id, date });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, private'
      }
    });
  } catch (err) {
    await logger.error('TEACHER_DAY_ROUTE_ERROR', 'Unexpected error handling teacher-day route', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
