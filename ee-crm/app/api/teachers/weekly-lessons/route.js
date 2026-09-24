// ee-crm/app/api/teachers/weekly-lessons/route.js
// Batch retrieves weekly planned lessons for teachers using fast calendar aggregation and 24-hour Redis caching

import { NextResponse } from 'next/server';
import { SchoolmateClient } from '@/lib/schoolmate.js';
import { getWeeklyLessonsCache, setMultipleWeeklyLessonsCache, getTeachers } from '@/lib/db.js';

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

function normalize(s) {
  return (s || '').toLowerCase().replace(/['`’]/g, "'").replace(/\s+/g, ' ').trim();
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

    const validIds = teacherIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

    // 1. Check 24-hour DB/Redis cache
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

    // 2. If all requested teachers are cached, return immediately (<5ms)
    if (uncachedIds.length === 0) {
      return NextResponse.json({
        results,
        weekRange: { fromDate, toDate, weekKey }
      });
    }

    // 3. Fast Weekly Calendar Event Aggregation from Schoolmate
    // A single call to Schoolmate scheduler returns all lessons for the entire school in ~400ms
    const client = new SchoolmateClient();
    let [dbTeachers, schedulerData] = await Promise.all([
      getTeachers(),
      client.getSchedulerEvents({ date: fromDate })
    ]);

    if (!dbTeachers || dbTeachers.length === 0) {
      try {
        dbTeachers = await client.fetchTeachersList({ pageSize: 300 });
      } catch {
        dbTeachers = [];
      }
    }

    // Build teacher lookup dictionaries
    const byName = new Map();
    const byLastName = new Map();

    for (const t of dbTeachers) {
      const full = normalize(t.fullName);
      const lastFirst = normalize(`${t.lastName} ${t.firstName}`);
      const firstLast = normalize(`${t.firstName} ${t.lastName}`);
      if (full) byName.set(full, t);
      if (lastFirst) byName.set(lastFirst, t);
      if (firstLast) byName.set(firstLast, t);
      if (t.lastName) {
        const ln = normalize(t.lastName);
        if (!byLastName.has(ln)) byLastName.set(ln, []);
        byLastName.get(ln).push(t);
      }
    }

    // Initialize all known teachers with 0 lessons
    const computedSummaries = new Map();
    const nowIso = new Date().toISOString();
    for (const t of dbTeachers) {
      const smId = Number(t.schoolmateTeacherId);
      if (smId) {
        computedSummaries.set(smId, {
          totalLessons: 0,
          totalMinutes: 0,
          totalWage: '0 ₴',
          cachedAt: nowIso
        });
      }
    }

    // Aggregate lessons from scheduler events
    const seenLessonIds = new Set();
    for (const ev of (schedulerData.events || [])) {
      for (const l of (ev.SchedulerLessons || [])) {
        if (l.GroupLessonId && seenLessonIds.has(l.GroupLessonId)) continue;
        if (l.GroupLessonId) seenLessonIds.add(l.GroupLessonId);

        const rawName = normalize(l.Teacher);
        if (!rawName) continue;

        let found = byName.get(rawName);
        if (!found) {
          const parts = rawName.split(/\s+/).filter(Boolean);
          for (const part of parts) {
            const candidates = byLastName.get(part);
            if (candidates && candidates.length === 1) {
              found = candidates[0];
              break;
            }
          }
        }

        if (found && found.schoolmateTeacherId) {
          const id = Number(found.schoolmateTeacherId);
          const cur = computedSummaries.get(id) || {
            totalLessons: 0,
            totalMinutes: 0,
            totalWage: '0 ₴',
            cachedAt: nowIso
          };
          cur.totalLessons += 1;
          cur.totalMinutes += (Number(l.DefaultLessonLength) || 60);
          computedSummaries.set(id, cur);
        }
      }
    }

    // Save all computed teacher summaries to Redis cache (24h TTL)
    await setMultipleWeeklyLessonsCache(weekKey, computedSummaries, 86400);

    // Populate response for requested teachers without overwriting cached ones
    for (const id of validIds) {
      if (!results[id]) {
        if (computedSummaries.has(id)) {
          results[id] = {
            ...computedSummaries.get(id),
            cached: false
          };
        } else {
          results[id] = {
            totalLessons: 0,
            totalMinutes: 0,
            totalWage: '0 ₴',
            cached: false
          };
        }
      }
    }

    return NextResponse.json({
      results,
      weekRange: { fromDate, toDate, weekKey }
    });
  } catch (err) {
    console.error('[WEEKLY_LESSONS] Error computing weekly lessons:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
