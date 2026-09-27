// ee-crm/lib/services/weekly-schedule-service.js
// Weekly lessons aggregation, teacher name matching, and Redis caching service

import { SchoolmateClient } from '../infrastructure/schoolmate.js';
import { getWeeklyLessonsCache, setMultipleWeeklyLessonsCache, getTeachers } from '../infrastructure/db.js';

/**
 * Compute week date range (Monday - Sunday) in 'YYYY-MM-DD'
 * @param {Date} [now=new Date()]
 * @returns {{ fromDate: string, toDate: string, weekKey: string }}
 */
export function getCurrentWeekRange(now = new Date()) {
  const currentDate = now instanceof Date ? now : new Date(now);
  const day = currentDate.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(currentDate);
  monday.setDate(currentDate.getDate() + diffToMonday);

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

/**
 * Normalize teacher name for comparison (lowercased, uniform quotes, single whitespace)
 * @param {string} s
 * @returns {string}
 */
export function normalizeTeacherName(s) {
  return (s || '').toLowerCase().replace(/['`’]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Build teacher lookup maps from list of DB teacher records
 * @param {Array<object>} dbTeachers
 * @returns {{ byName: Map<string, object>, byLastName: Map<string, Array<object>> }}
 */
export function buildTeacherLookups(dbTeachers = []) {
  const byName = new Map();
  const byLastName = new Map();

  for (const t of dbTeachers) {
    const full = normalizeTeacherName(t.fullName);
    const lastFirst = normalizeTeacherName(`${t.lastName} ${t.firstName}`);
    const firstLast = normalizeTeacherName(`${t.firstName} ${t.lastName}`);
    if (full) byName.set(full, t);
    if (lastFirst) byName.set(lastFirst, t);
    if (firstLast) byName.set(firstLast, t);
    if (t.lastName) {
      const ln = normalizeTeacherName(t.lastName);
      if (!byLastName.has(ln)) byLastName.set(ln, []);
      byLastName.get(ln).push(t);
    }
  }

  return { byName, byLastName };
}

/**
 * Resolve teacher record from raw teacher string using exact full/order match or unique surname
 * @param {string} rawTeacherName
 * @param {{ byName: Map<string, object>, byLastName: Map<string, Array<object>> }} lookups
 * @returns {object|null}
 */
export function resolveTeacher(rawTeacherName, { byName, byLastName }) {
  const rawName = normalizeTeacherName(rawTeacherName);
  if (!rawName) return null;

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

  return found || null;
}

/**
 * Aggregate scheduler lessons into teacher summary statistics
 * @param {Array<object>} events
 * @param {Array<object>} dbTeachers
 * @param {{ nowIso?: string }} [options]
 * @returns {Map<number, { totalLessons: number, totalMinutes: number, totalWage: string, cachedAt: string }>}
 */
export function aggregateSchedulerLessons(events = [], dbTeachers = [], { nowIso = new Date().toISOString() } = {}) {
  const { byName, byLastName } = buildTeacherLookups(dbTeachers);

  // Initialize all known teachers with 0 lessons
  const computedSummaries = new Map();
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
  for (const ev of events) {
    for (const l of (ev.SchedulerLessons || [])) {
      if (l.GroupLessonId && seenLessonIds.has(l.GroupLessonId)) continue;
      if (l.GroupLessonId) seenLessonIds.add(l.GroupLessonId);

      const found = resolveTeacher(l.Teacher, { byName, byLastName });
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

  return computedSummaries;
}

/**
 * Application service entry point for retrieving weekly lesson summaries
 * @param {object} params
 * @param {Array<number|string>} [params.teacherIds]
 * @param {string} [params.fromDate]
 * @param {string} [params.toDate]
 * @param {Date} [params.now]
 * @param {object} [params.schoolmateClient]
 * @param {object} [params.db]
 * @returns {Promise<{ results: object, weekRange?: { fromDate: string, toDate: string, weekKey: string } }>}
 */
export async function getWeeklyLessonSummaries({
  teacherIds = [],
  fromDate: customFrom,
  toDate: customTo,
  now = new Date(),
  schoolmateClient = new SchoolmateClient(),
  db = { getWeeklyLessonsCache, setMultipleWeeklyLessonsCache, getTeachers }
} = {}) {
  if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
    return { results: {} };
  }

  const { fromDate, toDate, weekKey } = (!customFrom || !customTo)
    ? getCurrentWeekRange(now)
    : { fromDate: customFrom, toDate: customTo, weekKey: customFrom };

  const validIds = teacherIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

  // 1. Check 24-hour DB/Redis cache
  const cachedMap = await db.getWeeklyLessonsCache(weekKey, validIds);

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

  // 2. If all requested teachers are cached, return immediately
  if (uncachedIds.length === 0) {
    return {
      results,
      weekRange: { fromDate, toDate, weekKey }
    };
  }

  // 3. Fast Weekly Calendar Event Aggregation from Schoolmate
  let [dbTeachers, schedulerData] = await Promise.all([
    db.getTeachers(),
    schoolmateClient.getSchedulerEvents({ date: fromDate })
  ]);

  if (!dbTeachers || dbTeachers.length === 0) {
    try {
      dbTeachers = await schoolmateClient.fetchTeachersList({ pageSize: 300 });
    } catch {
      dbTeachers = [];
    }
  }

  const nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString();
  const computedSummaries = aggregateSchedulerLessons(schedulerData?.events || [], dbTeachers, { nowIso });

  // Save all computed teacher summaries to Redis cache (24h TTL)
  await db.setMultipleWeeklyLessonsCache(weekKey, computedSummaries, 86400);

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

  return {
    results,
    weekRange: { fromDate, toDate, weekKey }
  };
}
