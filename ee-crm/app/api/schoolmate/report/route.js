// ee-crm/app/api/schoolmate/report/route.js
// Schoolmate Schedule Report API: Fast native JSON calendar retrieval with fallback to PDF parser

import { NextResponse } from 'next/server';
import { getTeachers, getCachedReport, saveCachedReport } from '@/lib/db.js';
import { SchoolmateClient } from '@/lib/schoolmate.js';
import { parseTeacherSchedulePdf } from '@/lib/pdf-parser.js';
import { logger } from '@/lib/logger.js';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { teacherId, fromDate, toDate } = body || {};
  let teacherName = body?.teacherName?.trim() || '';

  // Validate teacherId, fromDate, and toDate
  const numericId = Number(teacherId);
  if (teacherId === undefined || teacherId === null || isNaN(numericId) || numericId <= 0) {
    return NextResponse.json(
      { error: 'teacherId is required and must be a valid positive number' },
      { status: 400 }
    );
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!fromDate || typeof fromDate !== 'string' || !dateRegex.test(fromDate.trim())) {
    return NextResponse.json(
      { error: 'fromDate is required (format YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  if (!toDate || typeof toDate !== 'string' || !dateRegex.test(toDate.trim())) {
    return NextResponse.json(
      { error: 'toDate is required (format YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  const numericTeacherId = Number(teacherId);
  const normalizedFromDate = fromDate.trim();
  const normalizedToDate = toDate.trim();
  const periodKey = `${normalizedFromDate}_${normalizedToDate}`;

  try {
    // 1. Check cache first
    const cacheStart = Date.now();
    const cachedData = await getCachedReport(numericTeacherId, periodKey);
    if (cachedData) {
      const durationMs = Date.now() - cacheStart;
      return NextResponse.json({
        teacherName: cachedData.teacherName,
        periodFrom: cachedData.periodFrom,
        periodTo: cachedData.periodTo,
        totalMinutesReported: cachedData.totalMinutesReported,
        totalMinutesCalculated: cachedData.totalMinutesCalculated,
        totalLessonsCount: cachedData.totalLessonsCount,
        isMinutesMatching: cachedData.isMinutesMatching,
        days: cachedData.days,
        lessons: cachedData.lessons,
        cached: true,
        durationMs
      });
    }

    // Resolve teacher name if not provided in body
    if (!teacherName) {
      try {
        const teachers = await getTeachers();
        const found = teachers.find(
          t => t.id === teacherId || Number(t.schoolmateTeacherId) === numericTeacherId
        );
        if (found?.fullName) {
          teacherName = found.fullName;
        }
      } catch (err) {
        console.warn('Could not lookup teacher from DB:', err.message);
      }
    }

    // 2. Cache miss: Fetch via Schoolmate client
    const overallStart = Date.now();
    const parsedData = await logger.timed(
      'schoolmate:fetch_and_parse',
      `Fetch schedule for teacher ${teacherName || numericTeacherId} (${periodKey})`,
      async () => {
        const client = new SchoolmateClient();

        // Preferred fast method: Direct native JSON scheduler API (~350ms)
        if (teacherName) {
          try {
            const schedule = await client.getTeacherWeeklySchedule({
              teacherName,
              date: normalizedFromDate
            });

            if (schedule && schedule.totalLessonsCount > 0) {
              await saveCachedReport(numericTeacherId, periodKey, schedule);
              return schedule;
            }
          } catch (jsonErr) {
            console.warn('Native JSON scheduler error, falling back to PDF:', jsonErr.message);
          }
        }

        // Secondary fallback: PDF generator and parser (~3.5s)
        const { buffer } = await client.getTeacherSchedulePdf({
          teacherId: numericTeacherId,
          fromDate: normalizedFromDate,
          toDate: normalizedToDate
        });

        const parsed = await parseTeacherSchedulePdf(buffer);
        await saveCachedReport(numericTeacherId, periodKey, parsed);
        return parsed;
      }
    );

    const durationMs = Date.now() - overallStart;

    return NextResponse.json({
      teacherName: parsedData.teacherName || teacherName,
      periodFrom: parsedData.periodFrom,
      periodTo: parsedData.periodTo,
      totalMinutesReported: parsedData.totalMinutesReported,
      totalMinutesCalculated: parsedData.totalMinutesCalculated,
      totalLessonsCount: parsedData.totalLessonsCount,
      isMinutesMatching: parsedData.isMinutesMatching,
      days: parsedData.days,
      lessons: parsedData.lessons,
      cached: false,
      durationMs
    });
  } catch (err) {
    await logger.error(
      'schoolmate:report_error',
      `Failed to fetch or parse report for teacher ${numericTeacherId}: ${err.message}`,
      err,
      { teacherId: numericTeacherId, periodKey }
    );

    const isBadRequest =
      err.message.toLowerCase().includes('required') ||
      err.message.toLowerCase().includes('invalid date');
    const status = isBadRequest ? 400 : 500;

    return NextResponse.json({ error: err.message }, { status });
  }
}
