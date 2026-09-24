// ee-crm/app/api/teachers/weekly-lessons/route.js
// Batch retrieves weekly planned lessons for teachers with a strict 2-second per-teacher timeout and 24-hour Redis caching

import { NextResponse } from 'next/server';
import { SchoolmateClient } from '@/lib/schoolmate.js';
import { getWeeklyLessonsCache, setWeeklyLessonsCache } from '@/lib/db.js';

/**
 * Compute current week date range (Monday - Sunday) in 'YYYY-MM-DD'
 */
function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  const fromDate = formatDate(monday);
  const toDate = formatDate(sunday);

  return {
    fromDate,
    toDate,
    weekKey: fromDate
  };
}

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { teacherIds = [], fromDate: customFrom, toDate: customTo } = body || {};

    if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
      return NextResponse.json({ results: {} });
    }

    const { fromDate, toDate, weekKey } = (!customFrom || !customTo)
      ? getCurrentWeekRange()
      : { fromDate: customFrom, toDate: customTo, weekKey: customFrom };

    // 1. Check 24-hour DB/Redis cache
    const validIds = teacherIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
    const cachedMap = await getWeeklyLessonsCache(weekKey, validIds);

    const results = {};
    const uncachedIds = [];

    for (const id of validIds) {
      if (cachedMap.has(id)) {
        results[id] = {
          ...cachedMap.get(id),
          cached: true
        };
      } else {
        uncachedIds.push(id);
      }
    }

    // 2. If all are cached, return immediately (<5ms)
    if (uncachedIds.length === 0) {
      return NextResponse.json({
        results,
        weekRange: { fromDate, toDate, weekKey }
      });
    }

    // 3. Fetch missing teachers with strict 2-second timeout per teacher
    const client = new SchoolmateClient();
    try {
      await client.ensureAuthenticated();
    } catch (authErr) {
      console.warn('[WEEKLY_LESSONS] Schoolmate auth error:', authErr.message);
    }

    // Run parallel fetches for uncached teachers (max 5 concurrent)
    const fetchTeacherWeekly = async (teacherId) => {
      const timeoutMs = 6000; // 6-second timeout to allow teachers with multiple groups to finish
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      );

      try {
        const report = await Promise.race([
          client.getTeacherClassesSchedule({
            teacherId,
            fromDate,
            toDate,
            batchSize: 5
          }),
          timeoutPromise
        ]);

        const lessonSummary = {
          totalLessons: report.totalLessonsCount || 0,
          totalMinutes: report.totalMinutesCalculated || 0,
          totalWage: report.totalWage || '0 ₴',
          cachedAt: new Date().toISOString()
        };

        // Cache in Redis/DB for 24 hours (86400s)
        await setWeeklyLessonsCache(weekKey, teacherId, lessonSummary, 86400);

        return {
          teacherId,
          data: {
            ...lessonSummary,
            cached: false
          }
        };
      } catch (err) {
        return {
          teacherId,
          data: {
            totalLessons: null,
            totalMinutes: 0,
            error: err.message === 'TIMEOUT' ? 'timeout' : err.message,
            cached: false
          }
        };
      }
    };

    // Execute batch
    const fetchPromises = uncachedIds.map(id => fetchTeacherWeekly(id));
    const settleResults = await Promise.allSettled(fetchPromises);

    settleResults.forEach(res => {
      if (res.status === 'fulfilled' && res.value) {
        results[res.value.teacherId] = res.value.data;
      }
    });

    return NextResponse.json({
      results,
      weekRange: { fromDate, toDate, weekKey }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
