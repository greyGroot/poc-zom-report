// ee-crm/lib/comparison-engine.js
// Authoritative Teacher-Day Factual Activity Comparison Engine
// Compares conducted Schoolmate lessons with qualifying Zoom meeting occurrences (>= 300s teacher-participant overlap).
// Strictly factual: No inferred lesson-to-meeting matching, flags, risk scores, or payroll/validity conclusions.

import { getKyivDateString, TIMEZONE } from './timezone.js';

export const QUALIFICATION_THRESHOLD_SECONDS = 300; // 5 minutes exact threshold

/**
 * Computes non-overlapping union duration in seconds across timestamp intervals.
 * @param {Array<[number, number]>} intervals - Array of [startMs, endMs]
 * @returns {number} Union duration in seconds
 */
export function calculateIntervalUnionSeconds(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0;

  const valid = [];
  for (const item of intervals) {
    if (!item) continue;
    if (Array.isArray(item) && item.length >= 2) {
      const start = Number(item[0]);
      const end = Number(item[1]);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        valid.push([start, end]);
      }
    } else if (typeof item === 'object' && item.join_time) {
      const startMs = Date.parse(item.join_time);
      const endMs = item.leave_time ? Date.parse(item.leave_time) : null;
      if (!Number.isNaN(startMs) && endMs !== null && !Number.isNaN(endMs) && endMs >= startMs) {
        valid.push([startMs, endMs]);
      }
    }
  }

  if (valid.length === 0) return 0;

  valid.sort((a, b) => a[0] - b[0]);

  const merged = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const prev = merged[merged.length - 1];
    if (current[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  let totalMs = 0;
  for (const [start, end] of merged) {
    totalMs += (end - start);
  }

  return Math.round(totalMs / 1000);
}

/**
 * Parses session objects into timestamp intervals [startMs, endMs].
 * @param {Array<{ join_time?: string, leave_time?: string }>} sessions
 * @param {object} [fallbackBounds] - { start_time?: string, end_time?: string }
 * @returns {{ intervals: Array<[number, number]>, hasOpenSession: boolean, hasUnknown: boolean }}
 */
function parseSessionIntervals(sessions, fallbackBounds) {
  const intervals = [];
  let hasOpenSession = false;
  let hasUnknown = false;

  if (Array.isArray(sessions) && sessions.length > 0) {
    for (const s of sessions) {
      if (!s) continue;
      if (!s.join_time) {
        hasUnknown = true;
        continue;
      }
      const startMs = Date.parse(s.join_time);
      if (Number.isNaN(startMs)) {
        hasUnknown = true;
        continue;
      }

      if (s.leave_time) {
        const endMs = Date.parse(s.leave_time);
        if (!Number.isNaN(endMs) && endMs >= startMs) {
          intervals.push([startMs, endMs]);
        } else {
          hasOpenSession = true;
        }
      } else {
        hasOpenSession = true;
        // If fallback meeting end boundary is present, use it for lower bound
        if (fallbackBounds?.end_time) {
          const mEndMs = Date.parse(fallbackBounds.end_time);
          if (!Number.isNaN(mEndMs) && mEndMs >= startMs) {
            intervals.push([startMs, mEndMs]);
          }
        }
      }
    }
  } else if (fallbackBounds?.start_time) {
    const startMs = Date.parse(fallbackBounds.start_time);
    const endMs = fallbackBounds.end_time ? Date.parse(fallbackBounds.end_time) : null;
    if (!Number.isNaN(startMs)) {
      if (endMs !== null && !Number.isNaN(endMs) && endMs >= startMs) {
        intervals.push([startMs, endMs]);
      } else if (typeof fallbackBounds.duration_seconds === 'number' && fallbackBounds.duration_seconds > 0) {
        intervals.push([startMs, startMs + fallbackBounds.duration_seconds * 1000]);
      } else {
        hasOpenSession = true;
      }
    }
  }

  return { intervals, hasOpenSession, hasUnknown };
}

/**
 * Computes exact session overlap seconds between teacher host intervals and participant intervals.
 * Returns overlap seconds and state ('complete' | 'supported_lower_bound' | 'unknown').
 * @param {Array<{ join_time?: string, leave_time?: string }>} teacherSessions
 * @param {Array<{ join_time?: string, leave_time?: string }>} participantSessions
 * @param {object} [meetingBounds]
 * @returns {{ overlapSeconds: number, overlapState: string }}
 */
export function calculateSessionOverlapSeconds(teacherSessions, participantSessions, meetingBounds = {}) {
  const teacherData = parseSessionIntervals(teacherSessions, meetingBounds);
  const participantData = parseSessionIntervals(participantSessions, null);

  if (participantData.hasUnknown && participantData.intervals.length === 0) {
    return { overlapSeconds: 0, overlapState: 'unknown' };
  }

  if (teacherData.intervals.length === 0 || participantData.intervals.length === 0) {
    const isUnknown = teacherData.hasUnknown || participantData.hasUnknown;
    return {
      overlapSeconds: 0,
      overlapState: isUnknown ? 'unknown' : (teacherData.hasOpenSession || participantData.hasOpenSession ? 'supported_lower_bound' : 'complete')
    };
  }

  // Intersect all teacher intervals with all participant intervals
  const intersectionIntervals = [];
  for (const t of teacherData.intervals) {
    for (const p of participantData.intervals) {
      const intStart = Math.max(t[0], p[0]);
      const intEnd = Math.min(t[1], p[1]);
      if (intEnd > intStart) {
        intersectionIntervals.push([intStart, intEnd]);
      }
    }
  }

  const overlapSeconds = calculateIntervalUnionSeconds(intersectionIntervals);

  let overlapState = 'complete';
  if (teacherData.hasOpenSession || participantData.hasOpenSession) {
    overlapState = overlapSeconds >= QUALIFICATION_THRESHOLD_SECONDS ? 'supported_lower_bound' : 'incomplete';
  } else if (teacherData.hasUnknown || participantData.hasUnknown) {
    overlapState = 'unknown';
  }

  return { overlapSeconds, overlapState };
}

/**
 * Check if a participant is a teacher companion device or host.
 * @param {object} participant
 * @param {string} teacherHostEmail
 * @returns {boolean}
 */
export function isCompanionEndpoint(participant, teacherHostEmail) {
  if (!participant) return false;
  if (participant.is_host || participant.role === 'Host') return true;

  if (participant.email && teacherHostEmail) {
    const pEmail = participant.email.trim().toLowerCase();
    const tEmail = teacherHostEmail.trim().toLowerCase();
    if (pEmail && tEmail && pEmail === tEmail) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a Zoom meeting occurrence qualifies (>= 300 supported seconds of non-host overlap).
 * @param {object} occurrence
 * @param {string} [teacherHostEmail]
 * @param {number} [thresholdSeconds=300]
 * @returns {object}
 */
export function evaluateMeetingQualification(occurrence, teacherHostEmail = '', thresholdSeconds = QUALIFICATION_THRESHOLD_SECONDS) {
  if (!occurrence) {
    return {
      occurrenceId: '',
      topic: '',
      startTime: null,
      endTime: null,
      maxOverlapSeconds: 0,
      qualifies: false,
      overlapState: 'unavailable',
      eligibleParticipantsCount: 0
    };
  }

  const occId = occurrence.id || occurrence.occurrenceId || occurrence.occurrence_id || occurrence.uuid || '';
  const topic = occurrence.topic || 'Untitled Zoom meeting';
  const startTime = occurrence.startTime || occurrence.start_time || null;
  const endTime = occurrence.endTime || occurrence.end_time || null;
  const effectiveHostEmail = (teacherHostEmail || occurrence.hostEmail || occurrence.host_email || '').trim().toLowerCase();

  const meetingBounds = {
    start_time: startTime,
    end_time: endTime,
    duration_seconds: occurrence.durationSeconds || occurrence.duration_seconds || null
  };

  // 1. Find teacher sessions
  let teacherSessions = [];
  const rawParticipants = occurrence.participants || [];
  const participantsArray = Array.isArray(rawParticipants)
    ? rawParticipants
    : Object.entries(rawParticipants).map(([k, p]) => ({ id: k, ...p }));

  for (const p of participantsArray) {
    if (isCompanionEndpoint(p, effectiveHostEmail)) {
      if (Array.isArray(p.sessions) && p.sessions.length > 0) {
        teacherSessions.push(...p.sessions);
      } else if (p.firstJoinTime || p.first_join_time) {
        teacherSessions.push({
          join_time: p.firstJoinTime || p.first_join_time,
          leave_time: p.lastLeaveTime || p.last_leave_time || null
        });
      }
    }
  }

  // 2. Identify eligible non-host participants
  const eligibleParticipants = participantsArray.filter(p => !isCompanionEndpoint(p, effectiveHostEmail));

  let maxOverlapSeconds = 0;
  let overallOverlapState = 'complete';
  let hasAnyUnknown = false;
  let hasAnyLowerBound = false;

  for (const p of eligibleParticipants) {
    let pSessions = [];
    if (Array.isArray(p.sessions) && p.sessions.length > 0) {
      pSessions = p.sessions;
    } else if (p.firstJoinTime || p.first_join_time) {
      pSessions = [{
        join_time: p.firstJoinTime || p.first_join_time,
        leave_time: p.lastLeaveTime || p.last_leave_time || null
      }];
    }

    const { overlapSeconds, overlapState } = calculateSessionOverlapSeconds(teacherSessions, pSessions, meetingBounds);

    if (overlapSeconds > maxOverlapSeconds) {
      maxOverlapSeconds = overlapSeconds;
    }

    if (overlapState === 'unknown') {
      hasAnyUnknown = true;
    } else if (overlapState === 'supported_lower_bound') {
      hasAnyLowerBound = true;
    }
  }

  const qualifies = maxOverlapSeconds >= thresholdSeconds;

  if (qualifies) {
    overallOverlapState = hasAnyLowerBound ? 'supported_lower_bound' : 'complete';
  } else if (hasAnyUnknown && eligibleParticipants.length > 0 && maxOverlapSeconds === 0) {
    overallOverlapState = 'unknown';
  } else if (hasAnyLowerBound) {
    overallOverlapState = 'supported_lower_bound';
  } else {
    overallOverlapState = eligibleParticipants.length === 0 ? 'no_participants' : 'complete';
  }

  return {
    occurrenceId: occId,
    uuid: occurrence.uuid || null,
    topic,
    startTime,
    endTime,
    maxOverlapSeconds,
    qualifies,
    overlapState: overallOverlapState,
    eligibleParticipantsCount: eligibleParticipants.length
  };
}

/**
 * Classifies a Schoolmate lesson into conducted vs cancellation/other status.
 * @param {object} lesson
 * @returns {{ isConducted: boolean, statusCategory: string }}
 */
export function isConductedLesson(lesson) {
  if (!lesson) return { isConducted: false, statusCategory: 'unknown' };

  const status = (lesson.lessonStatusName || '').trim().toLowerCase();

  // Completed or default status (null / empty) is conducted
  if (!status || status === '') {
    return { isConducted: true, statusCategory: 'completed' };
  }

  if (status.includes('trial success')) {
    return { isConducted: true, statusCategory: 'completed' };
  }

  if (status.includes('advance')) {
    return { isConducted: false, statusCategory: 'cancelled_advance' };
  }

  if (status.includes('last')) {
    return { isConducted: false, statusCategory: 'last_minute' };
  }

  if (status.includes('late')) {
    return { isConducted: false, statusCategory: 'late_cancellation' };
  }

  return { isConducted: false, statusCategory: 'other' };
}

/**
 * Computes the complete teacher-day factual comparison.
 * @param {object} params
 * @param {object} params.schoolmate - Schoolmate result { state, lessons, ... }
 * @param {object} params.zoom - Zoom result { state, meetings, ... }
 * @param {string} params.date - YYYY-MM-DD
 * @param {object} [params.teacher] - Teacher profile
 * @param {string} [params.timezone='Europe/Kyiv']
 * @returns {object} Comparison result object
 */
export function computeTeacherDayComparison({ schoolmate, zoom, date, teacher = null, timezone = TIMEZONE }) {
  const normalizedDate = (date || '').trim();
  const kyivToday = getKyivDateString(new Date()) || '';
  const isSchoolDayFinished = normalizedDate < kyivToday;

  const schoolmateState = schoolmate?.state || 'empty';
  const zoomState = zoom?.state || 'empty';

  // Check source availability
  const isSchoolmateUnavailable = schoolmateState === 'error';
  const isZoomUnavailable = zoomState === 'error' || zoomState === 'unmapped';
  const isZoomStale = zoomState === 'stale';

  const allLessons = Array.isArray(schoolmate?.lessons) ? schoolmate.lessons : [];
  const allMeetings = Array.isArray(zoom?.meetings) ? zoom.meetings : [];

  // Conducted Schoolmate lessons
  const conductedLessons = allLessons.filter(l => isConductedLesson(l).isConducted);
  const conductedLessonsCount = isSchoolmateUnavailable ? 0 : conductedLessons.length;
  const cancellationsCount = isSchoolmateUnavailable ? 0 : allLessons.filter(l => !isConductedLesson(l).isConducted).length;

  // Zoom Meetings Qualification
  const teacherHostEmail = teacher?.zoomHostEmail || teacher?.email || '';
  const meetingBreakdown = allMeetings.map(m => evaluateMeetingQualification(m, teacherHostEmail, QUALIFICATION_THRESHOLD_SECONDS));
  const qualifyingMeetings = meetingBreakdown.filter(m => m.qualifies);
  const qualifyingMeetingsCount = isZoomUnavailable ? 0 : qualifyingMeetings.length;
  const trackedMeetingsCount = isZoomUnavailable ? 0 : allMeetings.length;

  // Difference calculation
  const difference = conductedLessonsCount - qualifyingMeetingsCount;
  const differenceFormatted = difference > 0 ? `+${difference}` : `${difference}`;

  // Categorize status
  let status = 'match';
  if (isSchoolmateUnavailable || isZoomUnavailable) {
    status = 'unavailable';
  } else if (isZoomStale) {
    status = 'provisional';
  } else if (!isSchoolDayFinished) {
    status = 'in_progress';
  } else if (conductedLessonsCount === 0 && qualifyingMeetingsCount === 0) {
    status = 'no_conducted_activity';
  } else if (conductedLessonsCount === qualifyingMeetingsCount) {
    status = 'match';
  } else {
    status = 'difference';
  }

  return {
    status,
    conductedLessonsCount,
    trackedMeetingsCount,
    qualifyingMeetingsCount,
    cancellationsCount,
    difference: (status === 'unavailable' || status === 'in_progress') ? null : difference,
    differenceFormatted: (status === 'unavailable' || status === 'in_progress') ? null : differenceFormatted,
    thresholdSeconds: QUALIFICATION_THRESHOLD_SECONDS,
    isSchoolDayFinished,
    calculationVersion: '1.0.0',
    meetingBreakdown
  };
}
