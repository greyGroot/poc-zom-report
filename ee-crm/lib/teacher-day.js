// ee-crm/lib/teacher-day.js
// Authoritative Teacher-Day evidence provider
// Gathers Schoolmate lessons and Zoom meeting occurrences for one teacher on one school-local calendar day.
// Strictly factual: No inferred matching, flags, tags, or payroll conclusions.

import { getTeacherById, getCachedReport, saveCachedReport } from './db.js';
import { SchoolmateClient } from './schoolmate.js';
import { getZoomOccurrencesForTeacher, formatOccurrenceForDisplay } from './zoom-occurrences.js';
import { computeTeacherDayComparison, isConductedLesson } from './comparison-engine.js';
import { logger } from './logger.js';
import { TIMEZONE } from './timezone.js';

/**
 * Validates whether a given string is a valid ISO calendar date (YYYY-MM-DD).
 * @param {string} dateStr
 * @returns {boolean}
 */
export function validateDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;

  const [year, month, day] = dateStr.trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Calculates previous and next calendar dates in ISO YYYY-MM-DD format.
 * @param {string} dateStr
 * @returns {{ prevDate: string, nextDate: string }|null}
 */
export function getAdjacentDates(dateStr) {
  if (!validateDateString(dateStr)) return null;

  const [year, month, day] = dateStr.trim().split('-').map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day - 1));
  const next = new Date(Date.UTC(year, month - 1, day + 1));

  return {
    prevDate: prev.toISOString().slice(0, 10),
    nextDate: next.toISOString().slice(0, 10)
  };
}

/**
 * Fetches and composes factual evidence for one teacher on one school-local day.
 * Sources (Schoolmate and Zoom) are queried independently so partial failures
 * or empty states do not cascade.
 *
 * @param {object} params
 * @param {string} params.teacherId
 * @param {string} params.date - YYYY-MM-DD
 * @returns {Promise<object>} Factual teacher-day payload
 */
export async function getTeacherDayData(paramsOrTeacherId, dateParam) {
  let teacherId;
  let date;

  if (paramsOrTeacherId && typeof paramsOrTeacherId === 'object' && !Array.isArray(paramsOrTeacherId)) {
    teacherId = paramsOrTeacherId.teacherId;
    date = paramsOrTeacherId.date;
  } else {
    teacherId = paramsOrTeacherId;
    date = dateParam;
  }

  if (teacherId === undefined || teacherId === null || teacherId === '') {
    return { error: 'Teacher ID is required', status: 400 };
  }
  teacherId = String(teacherId).trim();

  const normalizedDate = (date || '').trim();
  if (!validateDateString(normalizedDate)) {
    return { error: 'Invalid date format (expected YYYY-MM-DD)', status: 400 };
  }

  // 1. Resolve teacher identity
  let teacher = null;
  try {
    teacher = await getTeacherById(teacherId);
  } catch (err) {
    await logger.error('TEACHER_DAY_DB_ERROR', `Failed to load teacher ${teacherId}`, err);
    return { error: 'Internal database error', status: 500 };
  }

  if (!teacher) {
    return { error: 'Teacher not found', status: 404 };
  }

  const teacherProfile = {
    id: teacher.id,
    fullName: teacher.fullName || `${teacher.lastName || ''} ${teacher.firstName || ''}`.trim() || 'Teacher',
    firstName: teacher.firstName || '',
    lastName: teacher.lastName || '',
    email: teacher.email || '',
    schoolmateTeacherId: teacher.schoolmateTeacherId || null,
    zoomHostEmail: teacher.zoomHostEmail || teacher.email || '',
    phone: teacher.phone || '',
    telegramId: teacher.telegramId || '',
    city: teacher.city || '',
    nationality: teacher.nationality || ''
  };

  // 2. Query Schoolmate lessons independently
  let schoolmateResult = {
    state: 'loading',
    totalLessons: 0,
    totalMinutes: 0,
    totalWage: null,
    totalWageNumeric: 0,
    lessons: [],
    error: null
  };

  try {
    const smTeacherId = Number(teacher.schoolmateTeacherId);
    let dayLessons = [];
    let subtotalMinutes = 0;
    let subtotalWage = null;
    let subtotalWageNumeric = 0;

    if (smTeacherId && smTeacherId > 0) {
      // Check cache first for exact day or weekly cache
      let cachedSchedule = null;
      try {
        let cached = await getCachedReport(smTeacherId, `${normalizedDate}_${normalizedDate}`);
        if (!cached && teacher.id) {
          cached = await getCachedReport(teacher.id, `${normalizedDate}_${normalizedDate}`);
        }
        if (cached?.days) {
          cachedSchedule = cached;
        } else if (cached?.data?.days) {
          cachedSchedule = cached.data;
        }
      } catch {}

      if (!cachedSchedule) {
        // Query Schoolmate directly
        const client = new SchoolmateClient();
        try {
          const schedule = await client.getTeacherClassesSchedule({
            teacherId: smTeacherId,
            fromDate: normalizedDate,
            toDate: normalizedDate,
            teacherName: teacherProfile.fullName,
            batchSize: 3
          });

          if (schedule && Array.isArray(schedule.days)) {
            cachedSchedule = schedule;
            await saveCachedReport(smTeacherId, `${normalizedDate}_${normalizedDate}`, schedule).catch(() => {});
          }
        } catch (fetchErr) {
          // If classes schedule fails, try direct scheduler
          try {
            const fallbackSchedule = await client.getTeacherWeeklySchedule({
              teacherName: teacherProfile.fullName,
              date: normalizedDate
            });
            if (fallbackSchedule && Array.isArray(fallbackSchedule.days)) {
              cachedSchedule = fallbackSchedule;
            } else {
              throw fetchErr;
            }
          } catch {
            throw fetchErr;
          }
        }
      }

      if (cachedSchedule && Array.isArray(cachedSchedule.days)) {
        const targetDay = cachedSchedule.days.find(d => d.date === normalizedDate);
        if (targetDay && Array.isArray(targetDay.lessons)) {
          dayLessons = targetDay.lessons.map(l => {
            const conductedInfo = isConductedLesson(l);
            const enrolled = Number(l.enrolledStudents) || 1;
            const attended = l.attendedCount !== undefined ? Number(l.attendedCount) : (Boolean(l.attendanceChecked) ? enrolled : 0);
            return {
              ...l,
              startTime: l.startTime || null,
              endTime: l.endTime || null,
              enrolledStudents: enrolled,
              attendedCount: attended,
              isConducted: l.isConducted !== undefined ? Boolean(l.isConducted) : conductedInfo.isConducted,
              statusCategory: l.statusCategory || conductedInfo.statusCategory
            };
          });
          subtotalMinutes = targetDay.subtotalMinutes || 0;
          subtotalWage = targetDay.subtotalWageFormatted || null;
          subtotalWageNumeric = targetDay.subtotalWageNumeric || 0;
        }
      }
    }

    schoolmateResult = {
      state: dayLessons.length > 0 ? 'available' : 'empty',
      totalLessons: dayLessons.length,
      totalMinutes: subtotalMinutes || dayLessons.reduce((acc, l) => acc + (Number(l.durationMinutes) || 0), 0),
      totalWage: subtotalWage,
      totalWageNumeric: subtotalWageNumeric,
      lessons: dayLessons,
      error: null
    };
  } catch (smErr) {
    await logger.warn('TEACHER_DAY_SCHOOLMATE_ERROR', `Schoolmate fetch failed for ${teacherId} on ${normalizedDate}: ${smErr.message}`);
    schoolmateResult = {
      state: 'error',
      totalLessons: 0,
      totalMinutes: 0,
      totalWage: null,
      totalWageNumeric: 0,
      lessons: [],
      error: smErr.message || 'Failed to retrieve Schoolmate lessons'
    };
  }

  // 3. Query Zoom occurrences independently
  let zoomResult = {
    state: 'loading',
    totalMeetings: 0,
    totalMinutes: 0,
    meetings: [],
    error: null
  };

  const hasHostMapping = Boolean(
    (teacher.zoomHostEmail && teacher.zoomHostEmail.trim()) ||
    (teacher.email && teacher.email.trim())
  );

  if (!hasHostMapping) {
    zoomResult = {
      state: 'unmapped',
      totalMeetings: 0,
      totalMinutes: 0,
      meetings: [],
      error: null
    };
  } else {
    try {
      const occurrences = await getZoomOccurrencesForTeacher({
        teacherZoomEmail: teacher.zoomHostEmail,
        teacherEmail: teacher.email,
        fromDate: normalizedDate,
        toDate: normalizedDate
      });

      const formatted = (occurrences || []).map(occ =>
        formatOccurrenceForDisplay(occ, {
          teacherHostEmail: teacher.zoomHostEmail || teacher.email
        })
      );

      const totalMinutes = formatted.reduce((acc, m) => {
        if (typeof m.durationMinutes === 'number' && m.durationMinutes > 0) {
          return acc + m.durationMinutes;
        }
        return acc;
      }, 0);

      zoomResult = {
        state: formatted.length > 0 ? 'available' : 'empty',
        totalMeetings: formatted.length,
        totalMinutes,
        meetings: formatted,
        error: null
      };
    } catch (zmErr) {
      await logger.error('TEACHER_DAY_ZOOM_ERROR', `Zoom query failed for ${teacherId} on ${normalizedDate}`, zmErr);
      zoomResult = {
        state: 'error',
        totalMeetings: 0,
        totalMinutes: 0,
        meetings: [],
        error: zmErr.message || 'Failed to retrieve Zoom occurrences'
      };
    }
  }

  // 4. Compute Factual Comparison
  const comparison = computeTeacherDayComparison({
    schoolmate: schoolmateResult,
    zoom: zoomResult,
    date: normalizedDate,
    teacher: teacherProfile,
    timezone: TIMEZONE
  });

  // 5. Build Collapsible Diagnostics Payload
  const diagnostics = {
    teacherId: teacherProfile.id,
    date: normalizedDate,
    schoolmateRaw: {
      state: schoolmateResult.state,
      totalLessons: schoolmateResult.totalLessons,
      totalMinutes: schoolmateResult.totalMinutes,
      totalWage: schoolmateResult.totalWage,
      totalWageNumeric: schoolmateResult.totalWageNumeric,
      lessons: schoolmateResult.lessons
    },
    zoomRaw: {
      state: zoomResult.state,
      totalMeetings: zoomResult.totalMeetings,
      totalMinutes: zoomResult.totalMinutes,
      meetings: zoomResult.meetings
    },
    comparisonEngine: comparison
  };

  const adjacent = getAdjacentDates(normalizedDate);

  return {
    success: true,
    teacher: teacherProfile,
    date: normalizedDate,
    previousDate: adjacent?.prevDate || null,
    nextDate: adjacent?.nextDate || null,
    timezone: TIMEZONE,
    comparison,
    schoolmate: schoolmateResult,
    zoom: zoomResult,
    diagnostics
  };
}
