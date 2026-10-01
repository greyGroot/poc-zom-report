import { NextResponse } from 'next/server';
import { SchoolmateClient, isLessonInFuture } from '@/lib/infrastructure/schoolmate.js';
import { getLessonAttendanceCache } from '@/lib/infrastructure/db.js';

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const lessonId = resolvedParams?.id;

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    const date = searchParams.get('date') || searchParams.get('fromDate');
    const startTime = searchParams.get('startTime');

    if (!groupId || !date) {
      return NextResponse.json(
        { error: 'Missing required parameters: groupId and date are required' },
        { status: 400 }
      );
    }

    // Guard: Never query Schoolmate for future lessons
    if (isLessonInFuture(date, startTime)) {
      return NextResponse.json({
        success: true,
        isFuture: true,
        attendance: {},
        attendedCount: 0,
        message: 'Future lesson attendance query skipped'
      }, {
        headers: { 'Cache-Control': 'no-store, private' }
      });
    }

    // 1. Check cache first
    let cached = null;
    try {
      cached = await getLessonAttendanceCache(groupId, date, date);
    } catch {}

    if (cached) {
      const lessonAtt = (cached.lessons && lessonId && cached.lessons[Number(lessonId)]) || cached;
      return NextResponse.json({
        success: true,
        isCached: true,
        lessonId,
        groupId,
        date,
        attendance: lessonAtt.studentMap || {},
        attendedCount: lessonAtt.attendedCount || 0
      }, {
        headers: { 'Cache-Control': 'no-store, private' }
      });
    }

    // 2. Fetch from Schoolmate API proxy
    const client = new SchoolmateClient();
    const result = await client.getLessonAttendanceData({
      groupId,
      fromDate: date,
      toDate: date,
      groupLessonId: lessonId,
      startTime
    });

    const lessonAtt = (result?.lessons && lessonId && result.lessons[Number(lessonId)]) || result;

    return NextResponse.json({
      success: true,
      isCached: false,
      lessonId,
      groupId,
      date,
      attendance: lessonAtt?.studentMap || {},
      attendedCount: lessonAtt?.attendedCount || 0
    }, {
      headers: { 'Cache-Control': 'no-store, private' }
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Failed to proxy lesson attendance' },
      { status: 500, headers: { 'Cache-Control': 'no-store, private' } }
    );
  }
}
