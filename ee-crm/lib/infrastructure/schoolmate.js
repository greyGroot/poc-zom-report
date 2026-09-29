// ee-crm/lib/schoolmate.js
// High-performance direct HTTP client for Empire English Schoolmate EU with network reliability,
// bounded timeouts, exponential backoff retries, session recovery, and typed errors.

import { getGroupRosterCache, setGroupRosterCache } from './db.js';

export class SchoolmateTimeoutError extends Error {
  constructor(message, { pathname = '', timeoutMs = 0, cause = null } = {}) {
    super(message);
    this.name = 'SchoolmateTimeoutError';
    this.code = 'SCHOOLMATE_TIMEOUT';
    this.pathname = pathname;
    this.timeoutMs = timeoutMs;
    if (cause) this.cause = cause;
  }
}

export class SchoolmateHttpError extends Error {
  constructor(message, { status = 0, statusText = '', pathname = '', cause = null } = {}) {
    super(message);
    this.name = 'SchoolmateHttpError';
    this.code = 'SCHOOLMATE_HTTP_ERROR';
    this.status = status;
    this.statusText = statusText;
    this.pathname = pathname;
    if (cause) this.cause = cause;
  }
}

export class SchoolmateUnavailableError extends Error {
  constructor(message, { attempts = 0, lastError = null, cause = null } = {}) {
    super(message);
    this.name = 'SchoolmateUnavailableError';
    this.code = 'SCHOOLMATE_UNAVAILABLE';
    this.attempts = attempts;
    this.lastError = lastError;
    if (cause) this.cause = cause;
  }
}

export function isSchoolmateUnavailableError(err) {
  if (!err) return false;
  if (err instanceof SchoolmateUnavailableError || err instanceof SchoolmateTimeoutError) return true;
  if (err.name === 'SchoolmateUnavailableError' || err.name === 'SchoolmateTimeoutError') return true;
  if (err.code === 'SCHOOLMATE_UNAVAILABLE' || err.code === 'SCHOOLMATE_TIMEOUT') return true;
  if (err.cause && isSchoolmateUnavailableError(err.cause)) return true;
  return false;
}

export function toPublicSchoolmateError(err) {
  if (isSchoolmateUnavailableError(err)) {
    return {
      status: 503,
      body: {
        error: 'External service unavailable',
        code: 'SCHOOLMATE_UNAVAILABLE'
      }
    };
  }
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  };
}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EPIPE'
]);

function isTransientError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err instanceof SchoolmateTimeoutError) {
    return true;
  }
  if (err.code && TRANSIENT_NETWORK_CODES.has(err.code)) {
    return true;
  }
  if (err.cause) {
    if (err.cause.code && TRANSIENT_NETWORK_CODES.has(err.cause.code)) {
      return true;
    }
    if (err.cause.name === 'AbortError' || err.cause.name === 'TimeoutError' || err.cause instanceof SchoolmateTimeoutError) {
      return true;
    }
  }
  return false;
}

function isTransientStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function extractPathname(urlStr) {
  try {
    const parsed = new URL(urlStr, 'https://empireenglish.schoolmate.eu');
    return parsed.pathname;
  } catch {
    return String(urlStr);
  }
}

export class SchoolmateClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.SCHOOLMATE_BASE_URL || 'https://empireenglish.schoolmate.eu';
    this.schoolPrefix = config.schoolPrefix || process.env.SCHOOLMATE_PREFIX || 'empireenglish';
    this.userName = config.userName || process.env.SCHOOLMATE_USERNAME || 'IzaiI1498';
    this.password = config.password || process.env.SCHOOLMATE_PASSWORD || '';
    this.requestUserId = config.requestUserId || Number(process.env.SCHOOLMATE_ADMIN_USER_ID || 743140);

    // Injected dependencies for testing / observability
    this.fetch = config.fetch || globalThis.fetch;
    this.sleep = config.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
    this.random = config.random || Math.random;
    this.logger = config.logger || console;

    // Reliability configuration
    this.defaultTimeoutMs = config.defaultTimeoutMs || 10000; // 10s
    this.pdfTimeoutMs = config.pdfTimeoutMs || 25000; // 25s
    this.maxAttempts = config.maxAttempts || 3; // 3 total attempts
    this.baseDelayMs = config.baseDelayMs || 250; // 250ms
    this.jitterRatio = config.jitterRatio !== undefined ? config.jitterRatio : 0.25;

    this.sessionId = null;
    this.sessionExpiresAt = null;
  }

  /**
   * Central HTTP request executor with timeout, exponential backoff retry, and safe diagnostics.
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {object} [policy]
   * @param {number} [policy.timeoutMs]
   * @param {number} [policy.maxAttempts]
   * @param {(response: Response) => Promise<unknown>} [policy.consume]
   * @returns {Promise<unknown>}
   */
  async _request(url, init = {}, policy = {}) {
    const maxAttempts = policy.maxAttempts || this.maxAttempts || 3;
    const timeoutMs = policy.timeoutMs || this.defaultTimeoutMs || 10000;
    const pathname = extractPathname(url);
    const requestStart = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const res = await this.fetch(url, {
          ...init,
          signal: controller.signal,
          cache: 'no-store'
        });

        if (isTransientStatus(res.status)) {
          await res.text().catch(() => {});
          const httpErr = new SchoolmateHttpError(`Schoolmate HTTP ${res.status} ${res.statusText}`, {
            status: res.status,
            statusText: res.statusText,
            pathname
          });

          if (attempt < maxAttempts) {
            const baseDelay = this.baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = baseDelay * this.random() * this.jitterRatio;
            const delayMs = Math.round(baseDelay + jitter);
            const elapsedMs = Date.now() - requestStart;
            this.logger.warn(`[Schoolmate] Retry ${attempt}/${maxAttempts} for ${pathname} after HTTP ${res.status} (delay: ${delayMs}ms, elapsed: ${elapsedMs}ms)`);
            await this.sleep(delayMs);
            continue;
          } else {
            throw new SchoolmateUnavailableError(`Schoolmate service unavailable after ${maxAttempts} attempts (HTTP ${res.status})`, {
              attempts: maxAttempts,
              lastError: httpErr,
              cause: httpErr
            });
          }
        }

        if (!res.ok) {
          throw new SchoolmateHttpError(`Schoolmate HTTP ${res.status} ${res.statusText}`, {
            status: res.status,
            statusText: res.statusText,
            pathname
          });
        }

        // Consume the response before clearing the timeout. This keeps slow or
        // disconnected response bodies inside the same bounded retry policy as
        // the initial fetch instead of treating received headers as success.
        if (typeof policy.consume === 'function') {
          return await policy.consume(res);
        }

        return res;
      } catch (err) {
        let effectiveErr = err;
        if (timedOut || err.name === 'AbortError') {
          effectiveErr = new SchoolmateTimeoutError(`Request to Schoolmate ${pathname} timed out after ${timeoutMs}ms`, {
            pathname,
            timeoutMs,
            cause: err
          });
        }

        if (isTransientError(effectiveErr)) {
          if (attempt < maxAttempts) {
            const baseDelay = this.baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = baseDelay * this.random() * this.jitterRatio;
            const delayMs = Math.round(baseDelay + jitter);
            const elapsedMs = Date.now() - requestStart;
            const errCode = effectiveErr.code || effectiveErr.name || 'TRANSIENT_ERROR';
            this.logger.warn(`[Schoolmate] Retry ${attempt}/${maxAttempts} for ${pathname} after ${errCode} (delay: ${delayMs}ms, elapsed: ${elapsedMs}ms)`);
            await this.sleep(delayMs);
            continue;
          } else {
            throw new SchoolmateUnavailableError(`Schoolmate service unavailable after ${maxAttempts} attempts`, {
              attempts: maxAttempts,
              lastError: effectiveErr,
              cause: effectiveErr
            });
          }
        }

        throw effectiveErr;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Executes an authenticated request, renewing session once on 401/302.
   */
  async _requestAuthenticated(url, initOrFactory, policy = {}, isReplay = false) {
    await this.ensureAuthenticated();
    const init = typeof initOrFactory === 'function' ? initOrFactory(this.sessionId) : {
      ...initOrFactory,
      headers: {
        ...(initOrFactory?.headers || {}),
        'Cookie': `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`
      }
    };

    try {
      return await this._request(url, init, policy);
    } catch (err) {
      const isAuthError = (err instanceof SchoolmateHttpError && (err.status === 401 || err.status === 302)) || err.status === 401 || err.status === 302;
      if (isAuthError && !isReplay) {
        this.sessionId = null;
        this.sessionExpiresAt = null;
        await this.login();
        return this._requestAuthenticated(url, initOrFactory, policy, true);
      }
      throw err;
    }
  }

  /**
   * Ensure the client has an active authenticated session.
   * Logs in automatically if sessionId is missing or expired.
   */
  async ensureAuthenticated() {
    if (this.sessionId && this.sessionExpiresAt && Date.now() < this.sessionExpiresAt) {
      return this.sessionId;
    }
    return this.login();
  }

  /**
   * Authenticate against Schoolmate
   * Step 1: GET /admin to initialize ASP.NET_SessionId cookie
   * Step 2: POST /security/index to authenticate the session
   */
  async login(userName = this.userName, password = this.password) {
    if (!userName || !password) {
      throw new Error('Schoolmate credentials missing. Please set SCHOOLMATE_USERNAME and SCHOOLMATE_PASSWORD.');
    }

    const startTime = Date.now();

    // 1. Acquire initial ASP.NET_SessionId from /admin
    const initCookieHeader = await this._request(
      `${this.baseUrl}/admin`,
      { method: 'GET' },
      {
        consume: async (response) => {
          let cookieHeader = response.headers.get('set-cookie') || '';
          if (typeof response.headers.getSetCookie === 'function') {
            cookieHeader = response.headers.getSetCookie().join('; ');
          }
          await response.text();
          return cookieHeader;
        }
      }
    );

    const match = initCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
    if (!match) {
      throw new Error('Could not obtain ASP.NET_SessionId from Schoolmate login page.');
    }

    const sessionId = match[1];
    const cookieHeader = `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`;

    // 2. Authenticate session via POST /security/index
    const loginUrl = `${this.baseUrl}/security/index`;
    const loginData = await this._request(
      loginUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          UserName: userName,
          Password: password,
          SchoolPrefix: this.schoolPrefix,
          IsRemember: false,
          requestUserId: 0,
          roleId: 0
        })
      },
      { consume: (response) => response.json() }
    );
    if (!loginData.IsSuccess) {
      throw new Error(`Schoolmate login failed: ${loginData.Message || 'Invalid credentials'}`);
    }

    this.sessionId = sessionId;
    // Keep session active for 25 minutes
    this.sessionExpiresAt = Date.now() + 25 * 60 * 1000;

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      sessionId: this.sessionId,
      requestUserId: this.requestUserId,
      durationMs
    };
  }

  /**
   * Request Schoolmate to generate a teacher's schedule PDF and download the file.
   * @param {object} params
   * @param {number|string} params.teacherId - Internal Schoolmate Teacher ID
   * @param {string} params.fromDate - Date in 'YYYY-M-D' or 'YYYY-MM-DD'
   * @param {string} params.toDate - Date in 'YYYY-M-D' or 'YYYY-MM-DD'
   * @returns {Promise<{ buffer: Buffer, fileName: string, durationMs: number }>}
   */
  async getTeacherSchedulePdf({ teacherId, fromDate, toDate }) {
    if (!teacherId) throw new Error('teacherId is required to fetch teacher schedule');
    if (!fromDate || !toDate) throw new Error('fromDate and toDate are required (format YYYY-MM-DD)');

    const overallStartTime = Date.now();

    // 1. Request report generation
    const genUrl = `${this.baseUrl}/teacher/printemployeeschedule`;
    const genData = await this._requestAuthenticated(
      genUrl,
      (sessionId) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          teacherId: Number(teacherId),
          lessonSearchModel: {
            FromDate: fromDate,
            ToDate: toDate
          },
          requestUserId: this.requestUserId,
          roleId: 2
        })
      }),
      { timeoutMs: this.pdfTimeoutMs, consume: (response) => response.json() }
    );
    if (!genData.IsSuccess || !genData.Data || !genData.Data.AbsolutePath) {
      throw new Error(`Schoolmate schedule generation rejected: ${genData.Message || 'Unknown error'}`);
    }

    const { AbsolutePath, FileName } = genData.Data;

    // 2. Download the generated PDF binary
    // Note: AbsolutePath is already URL-encoded or contains encoded slashes (%5c)
    const downloadUrl = `${this.baseUrl}/common/download?fpath=${AbsolutePath}&fname=${FileName}&d=true`;

    const arrayBuffer = await this._requestAuthenticated(
      downloadUrl,
      (sessionId) => ({
        method: 'GET',
        headers: {
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`
        }
      }),
      { timeoutMs: this.pdfTimeoutMs, consume: (response) => response.arrayBuffer() }
    );
    const buffer = Buffer.from(arrayBuffer);
    const durationMs = Date.now() - overallStartTime;

    return {
      buffer,
      fileName: `${FileName}.pdf`,
      absolutePath: AbsolutePath,
      durationMs
    };
  }

  /**
   * Fetch raw weekly scheduler events directly from Schoolmate calendar.
   * @param {object} params
   * @param {string} params.date - Any date within target week (format YYYY-MM-DD)
   * @returns {Promise<{ calendarDays: Array, events: Array, durationMs: number }>}
   */
  async getSchedulerEvents({ date }) {
    const startTime = Date.now();
    const url = `${this.baseUrl}/calendar/getschedulerevents`;
    const json = await this._requestAuthenticated(
      url,
      (sessionId) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          serchModel: {
            GroupId: 0,
            GroupType: 0,
            Date: date,
            IsNext: false,
            IsPrevious: false
          }
        })
      }),
      { consume: (response) => response.json() }
    );
    if (!json.IsSuccess) {
      throw new Error(`Schoolmate scheduler error: ${json.Message || 'Unknown error'}`);
    }

    const durationMs = Date.now() - startTime;
    return {
      calendarDays: json.Data?.CalendarDays || [],
      events: json.Data?.SchedulerEvents || [],
      durationMs
    };
  }

  /**
   * Fetch and filter teacher lessons for a weekly period via direct JSON API.
   * Converts into the standardized EE CRM schedule payload (days, lessons, minutes).
   * @param {object} params
   * @param {string} params.teacherName - Teacher name to filter (e.g. "Zhuravlova Iryna")
   * @param {string} params.date - Any date within target week (format YYYY-MM-DD)
   * @returns {Promise<object>}
   */
  async getTeacherWeeklySchedule({ teacherName, date }) {
    const { calendarDays, events, durationMs } = await this.getSchedulerEvents({ date });

    const dayMap = new Map();
    for (const d of calendarDays) {
      let isoDate = d.StrDate;
      if (d.StrDate && d.StrDate.includes('/')) {
        const [day, month, year] = d.StrDate.split('/');
        isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      dayMap.set(d.DayId, {
        date: isoDate,
        dayName: `${d.DayName} ${d.StrDate}`,
        dayNameShort: d.DayName,
        subtotalMinutes: 0,
        lessons: []
      });
    }

    const normalizedTarget = (teacherName || '').toLowerCase().trim();
    const nameParts = normalizedTarget.split(/\s+/).filter(Boolean);
    const lastName = nameParts[0] || '';
    const firstName = nameParts[1] || '';

    const lessons = [];
    for (const ev of events) {
      for (const l of (ev.SchedulerLessons || [])) {
        const tName = (l.Teacher || '').toLowerCase().trim();
        const matches = (
          tName === normalizedTarget ||
          (lastName.length >= 3 && tName.includes(lastName) && (!firstName || tName.includes(firstName))) ||
          (lastName.length >= 4 && tName.includes(lastName))
        );
        if (matches) {
          const dayInfo = dayMap.get(l.DayId);
          const isoDate = dayInfo?.date || date;

          let startTime = '00:00';
          let endTime = '00:00';
          if (l.LessonTime && l.LessonTime.includes('-')) {
            const [s, e] = l.LessonTime.split('-');
            startTime = s.trim();
            endTime = e.trim();
          }

          const durationMinutes = Number(l.DefaultLessonLength) || 60;

          const lessonItem = {
            id: `lesson_${l.GroupLessonId || Math.random().toString(36).substring(2, 8)}`,
            groupLessonId: l.GroupLessonId,
            date: isoDate,
            dayName: dayInfo?.dayName || '',
            startTime,
            endTime,
            durationMinutes,
            groupOrStudent: l.GroupName || 'Individual Lesson',
            lessonType: 'GE',
            language: 'English',
            enrolledStudents: l.EnrolledStudents || 1,
            groupId: l.GroupId,
            teacherRate: '0.00 ₴',
            teacherRatePerLesson: '0.00',
            currencySymbol: '₴',
            attendanceChecked: false,
            classDetailsAdded: false,
            lessonStatusName: null
          };

          lessons.push(lessonItem);
          if (dayInfo) {
            dayInfo.lessons.push(lessonItem);
            dayInfo.subtotalMinutes += durationMinutes;
            dayInfo.subtotalWage = 0;
            dayInfo.subtotalWageFormatted = '0.00 ₴';
          }
        }
      }
    }

    for (const day of dayMap.values()) {
      day.lessons.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    const days = Array.from(dayMap.values()).filter(d => d.lessons.length > 0);
    days.sort((a, b) => a.date.localeCompare(b.date));

    const totalMinutesCalculated = lessons.reduce((sum, l) => sum + l.durationMinutes, 0);

    return {
      teacherName,
      periodFrom: days[0]?.date || date,
      periodTo: days[days.length - 1]?.date || date,
      totalMinutesReported: totalMinutesCalculated,
      totalMinutesCalculated,
      totalLessonsCount: lessons.length,
      totalWage: '0.00 ₴',
      totalWageNumeric: 0,
      currencySymbol: '₴',
      isMinutesMatching: true,
      source: 'schoolmate_json_api',
      days,
      lessons,
      durationMs
    };
  }

  /**
   * Helper to normalize date to Schoolmate format YYYY-M-D
   */
  normalizeDateForSchoolmate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.trim().split('-');
    if (parts.length === 3) {
      return `${parts[0]}-${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
    }
    return dateStr;
  }

  /**
   * Fetch assigned group classes for a teacher in a date range.
   * Calls POST /teacher/getteachergroupclasslist
   * @param {object} params
   * @param {number|string} params.teacherId
   * @param {string} params.fromDate - format YYYY-MM-DD or YYYY-M-D
   * @param {string} params.toDate - format YYYY-MM-DD or YYYY-M-D
   * @returns {Promise<Array<{ GroupId: number, GroupName: string }>>}
   */
  async getTeacherGroupClassList({ teacherId, fromDate, toDate }) {
    const url = `${this.baseUrl}/teacher/getteachergroupclasslist`;
    const formattedFrom = this.normalizeDateForSchoolmate(fromDate);
    const formattedTo = this.normalizeDateForSchoolmate(toDate);

    const payload = {
      teacherId: Number(teacherId),
      lessonSearchModel: {
        FromDate: formattedFrom,
        ToDate: formattedTo
      },
      requestuserId: this.requestUserId,
      roleId: 2
    };

    const json = await this._requestAuthenticated(
      url,
      (sessionId) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify(payload)
      }),
      { consume: (response) => response.json() }
    );
    if (!json.IsSuccess) {
      throw new Error(`Schoolmate getteachergroupclasslist error: ${json.Message || 'Unknown error'}`);
    }

    return json.Data?.TeacherGroupList || [];
  }

  /**
   * Fetch lessons and financial details for a specific group of a teacher.
   * Calls POST /teacher/getteachergroupclassdetail
   * @param {object} params
   * @param {number|string} params.groupId
   * @param {number|string} params.teacherId
   * @param {string} params.fromDate
   * @param {string} params.toDate
   * @returns {Promise<{ lessons: Array, wageSum: string, totalWage: string, currencySymbol: string }>}
   */
  async getTeacherGroupClassDetail({ groupId, teacherId, fromDate, toDate }) {
    const url = `${this.baseUrl}/teacher/getteachergroupclassdetail`;
    const formattedFrom = this.normalizeDateForSchoolmate(fromDate);
    const formattedTo = this.normalizeDateForSchoolmate(toDate);

    const payload = {
      groupId: Number(groupId),
      teacherId: Number(teacherId),
      lessonSearchModel: {
        FromDate: formattedFrom,
        ToDate: formattedTo
      },
      requestuserId: this.requestUserId,
      roleId: 2
    };

    const json = await this._requestAuthenticated(
      url,
      (sessionId) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify(payload)
      }),
      { consume: (response) => response.json() }
    );
    if (!json.IsSuccess) {
      throw new Error(`Schoolmate getteachergroupclassdetail error: ${json.Message || 'Unknown error'}`);
    }

    const data = json.Data || {};
    return {
      lessons: data.LessonClasseList || [],
      wageSum: data.WageSum || '0.00',
      totalWage: data.TotalWage || '0.00 ₴',
      currencySymbol: data.CurrencySymbol || '₴'
    };
  }

  /**
   * Fetch group student roster from Schoolmate and cache in Redis / memory.
   * @param {object} params
   * @param {number|string} params.groupId
   * @param {number|string} [params.groupLessonId]
   * @param {string} [params.date] - YYYY-MM-DD
   * @returns {Promise<Array<{ id: number, fullName: string, firstName?: string, lastName?: string }>>}
   */
  async getGroupStudentRoster({ groupId, groupLessonId = 0, date = '' }) {
    if (!groupId) return [];

    // 1. Check cache first
    try {
      const cached = await getGroupRosterCache(groupId);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    } catch (err) {
      this.logger.warn(`[Schoolmate] Group roster cache read failed for group ${groupId}: ${err.message}`);
    }

    // 2. Fetch from Schoolmate API
    const dateObj = date || new Date().toISOString().split('T')[0];
    const payload = {
      type: 1,
      schoolId: 221,
      userId: this.requestUserId,
      groupId: Number(groupId),
      dateObj,
      dateMoveType: 0,
      isGroupLesson: Boolean(groupLessonId),
      groupLessonId: Number(groupLessonId) || 0,
      requestuserId: this.requestUserId,
      roleId: 2
    };

    try {
      const url = `${this.baseUrl}/group/getgroupattendancedetails`;
      const json = await this._requestAuthenticated(
        url,
        (sessionId) => ({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
            'Accept': 'application/json, text/plain, */*'
          },
          body: JSON.stringify(payload)
        }),
        { consume: (r) => r.json() }
      );

      const rawStudents = json?.Data?.AttendanceList || json?.Data?.AttendanceStudentList || (json?.Data?.GroupLessonList && json.Data.GroupLessonList[0]?.AttendanceStudentList) || [];
      const roster = rawStudents.map(s => {
        const studentId = Number(s.StudentId || s.PrimaryKeyId || s.id || 0);
        const fullName = (s.Name || s.fullName || `${s.FirstName || ''} ${s.LastName || ''}`).trim();
        const parts = fullName.split(/\s+/);
        const lastName = parts[0] || '';
        const firstName = parts.slice(1).join(' ') || '';
        return {
          id: studentId,
          fullName,
          firstName,
          lastName
        };
      }).filter(s => s.fullName.length > 0);

      if (roster.length > 0) {
        try {
          await setGroupRosterCache(groupId, roster, 86400); // 24h TTL
        } catch (cacheErr) {
          this.logger.warn(`[Schoolmate] Group roster cache write failed for group ${groupId}: ${cacheErr.message}`);
        }
      }

      return roster;
    } catch (err) {
      this.logger.warn(`[Schoolmate] Failed to fetch group student roster for group ${groupId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch complete schedule for all groups of a teacher in batches of 2-3.
   * Aggregates lessons into a Daily Timeline with status markings and wage calculations.
   * @param {object} params
   * @param {number|string} params.teacherId
   * @param {string} params.fromDate - YYYY-MM-DD
   * @param {string} params.toDate - YYYY-MM-DD
   * @param {string} [params.teacherName]
   * @param {number} [params.batchSize=3]
   * @returns {Promise<object>}
   */
  async getTeacherClassesSchedule({ teacherId, fromDate, toDate, teacherName = '', batchSize = 3 }) {
    const overallStart = Date.now();

    // 1. Fetch group list and scheduler events in parallel
    const [groups, schedulerRes] = await Promise.all([
      this.getTeacherGroupClassList({ teacherId, fromDate, toDate }),
      this.getSchedulerEvents({ date: fromDate }).catch((err) => {
        this.logger.warn(`[Schoolmate] Warning: scheduler enrichment failed: ${err.message}`);
        return { events: [] };
      })
    ]);

    const timeMap = new Map();
    for (const ev of (schedulerRes.events || [])) {
      for (const l of (ev.SchedulerLessons || [])) {
        if (l.GroupLessonId) {
          let s = null;
          let e = null;
          if (l.LessonTime && l.LessonTime.includes('-')) {
            const parts = l.LessonTime.split('-');
            s = parts[0].trim();
            e = parts[1].trim();
          }
          timeMap.set(l.GroupLessonId, {
            startTime: s,
            endTime: e,
            enrolledStudents: l.EnrolledStudents,
            groupName: l.GroupName
          });
        }
      }
    }

    // 2. Fetch class details in batches (2-3 groups per batch)
    const allGroupResults = [];
    for (let i = 0; i < groups.length; i += batchSize) {
      const batch = groups.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (group) => {
          try {
            const detail = await this.getTeacherGroupClassDetail({
              groupId: group.GroupId,
              teacherId,
              fromDate,
              toDate
            });
            return { group, detail, succeeded: true };
          } catch (err) {
            this.logger.warn(`[Schoolmate] Warning: group ${group.GroupId} (${group.GroupName}) failed: ${err.message}`);
            return {
              group,
              error: err,
              succeeded: false
            };
          }
        })
      );
      allGroupResults.push(...batchResults);
    }

    const successfulGroupResults = allGroupResults.filter(result => result.succeeded);
    if (groups.length > 0 && successfulGroupResults.length === 0) {
      const firstError = allGroupResults.find(result => result.error)?.error;
      throw new SchoolmateUnavailableError('All Schoolmate group-detail requests failed', {
        attempts: groups.length,
        lastError: firstError,
        cause: firstError
      });
    }

    // 3. Flatten and standardize all lessons
    const dayMap = new Map();
    const allLessons = [];
    let totalWageNumeric = 0;
    let currencySymbol = '₴';

    for (const { group, detail } of successfulGroupResults) {
      if (detail.currencySymbol) {
        currencySymbol = detail.currencySymbol;
      }

      for (const item of (detail.lessons || [])) {
        // Convert StrLessonDate "DD/MM/YYYY" to ISO "YYYY-MM-DD"
        let isoDate = fromDate;
        if (item.StrLessonDate && item.StrLessonDate.includes('/')) {
          const [d, m, y] = item.StrLessonDate.split('/');
          isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        // Strict date filtering: skip if outside requested date range
        if (isoDate < fromDate || isoDate > toDate) {
          continue;
        }

        const enriched = timeMap.get(item.GroupLessonId);

        let startTime = enriched?.startTime || null;
        let endTime = enriched?.endTime || null;
        if (!startTime) {
          if (item.LessonTime && item.LessonTime.includes('-')) {
            const [s, e] = item.LessonTime.split('-');
            startTime = s.trim();
            endTime = e.trim();
          } else if (item.StrLessonFromTime || item.StrLessonToTime) {
            startTime = item.StrLessonFromTime || null;
            endTime = item.StrLessonToTime || null;
          }
        }

        const enrolledStudents = Number(enriched?.enrolledStudents || item.EnrolledStudents) || 1;
        const attendanceChecked = Boolean(item.AttendanceChecked);
        const classDetailsAdded = Boolean(item.ClassDetailsAdded);
        const statusName = item.LessonStatusName || null;
        const statusLower = (statusName || '').trim().toLowerCase();
        
        let isConducted = true;
        let statusCategory = 'completed';
        if (statusLower.includes('advance')) {
          isConducted = false;
          statusCategory = 'cancelled_advance';
        } else if (statusLower.includes('last')) {
          isConducted = false;
          statusCategory = 'last_minute';
        } else if (statusLower.includes('late')) {
          isConducted = false;
          statusCategory = 'late_cancellation';
        } else if (statusLower && !statusLower.includes('trial success')) {
          isConducted = false;
          statusCategory = 'other';
        }

        const durationMinutes = Number(item.LengthOfLesson || item.DurationMinutes || item.DefaultLessonLength) || 60;
        const attendedCount = attendanceChecked ? enrolledStudents : 0;

        const rateNumeric = parseFloat(String(item.TeacherRatePerLesson || item.TeacherRate || detail.wageSum || '0').replace(/[^0-9.]/g, '')) || 0;
        totalWageNumeric += rateNumeric;

        const lessonObj = {
          id: `lesson_${item.GroupLessonId}`,
          groupLessonId: item.GroupLessonId,
          groupId: group.GroupId,
          groupName: group.GroupName || group.CalendarHeadName || 'Group Class',
          className: item.ClassName || 'GE',
          date: isoDate,
          strLessonDate: item.StrLessonDate,
          startTime,
          endTime,
          durationMinutes,
          enrolledStudents,
          attendedCount,
          isConducted,
          statusCategory,
          attendanceChecked,
          classDetailsAdded,
          lessonStatusName: statusName,
          lessonStatusColor: item.LessonStatusColor || null,
          lessonFunctionId: item.LessonFunctionId || 0,
          teacherRatePerLesson: item.TeacherRatePerLesson || (rateNumeric > 0 ? rateNumeric.toFixed(2) : '0.00'),
          teacherRate: item.TeacherRate || (rateNumeric > 0 ? `${rateNumeric.toFixed(2)} ${currencySymbol}` : `0.00 ${currencySymbol}`),
          currencySymbol: item.CurrencySymbol || currencySymbol
        };

        allLessons.push(lessonObj);

        if (!dayMap.has(isoDate)) {
          const dateObj = new Date(`${isoDate}T12:00:00Z`);
          const dayName = dateObj.toLocaleDateString('uk-UA', { weekday: 'long' });
          const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          dayMap.set(isoDate, {
            date: isoDate,
            strDate: item.StrLessonDate,
            dayName: `${capitalizedDayName} (${item.StrLessonDate})`,
            subtotalMinutes: 0,
            subtotalWage: 0,
            lessons: []
          });
        }

        const dayInfo = dayMap.get(isoDate);
        dayInfo.lessons.push(lessonObj);
        dayInfo.subtotalMinutes += durationMinutes;
        dayInfo.subtotalWage += rateNumeric;
      }
    }

    // 3.5 Enrich lessons with authoritative group student rosters from Schoolmate
    const groupRosterPromises = new Map();
    for (const lesson of allLessons) {
      if (lesson.groupId && !groupRosterPromises.has(lesson.groupId)) {
        groupRosterPromises.set(
          lesson.groupId,
          this.getGroupStudentRoster({
            groupId: lesson.groupId,
            groupLessonId: lesson.groupLessonId,
            date: lesson.date
          }).catch(() => [])
        );
      }
    }

    const groupRosters = new Map();
    for (const [groupId, promise] of groupRosterPromises.entries()) {
      const roster = await promise;
      groupRosters.set(groupId, roster);
    }

    for (const lesson of allLessons) {
      const roster = groupRosters.get(lesson.groupId) || [];
      if (roster.length > 0) {
        lesson.students = roster;
        lesson.enrolledStudents = roster.length;
        lesson.isIndividual = roster.length <= 1;
      } else {
        lesson.students = [];
        lesson.isIndividual = (lesson.enrolledStudents || 1) <= 1;
      }
      if (lesson.attendanceChecked) {
        lesson.attendedCount = lesson.enrolledStudents;
      }
    }

    // Sort days chronologically
    const sortedDays = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Sort lessons inside each day chronologically by startTime, then groupName
    for (const day of sortedDays) {
      day.lessons.sort((a, b) => {
        const timeA = a.startTime || '99:99';
        const timeB = b.startTime || '99:99';
        const timeComp = timeA.localeCompare(timeB);
        if (timeComp !== 0) return timeComp;
        return (a.groupName || '').localeCompare(b.groupName || '');
      });
      day.subtotalWageFormatted = `${day.subtotalWage.toFixed(2)} ${currencySymbol}`;
    }

    const totalMinutesCalculated = allLessons.reduce((sum, l) => sum + l.durationMinutes, 0);
    const durationMs = Date.now() - overallStart;

    return {
      teacherName,
      teacherId,
      periodFrom: fromDate,
      periodTo: toDate,
      totalGroupsCount: groups.length,
      totalLessonsCount: allLessons.length,
      totalMinutesCalculated,
      totalWageNumeric,
      totalWage: `${totalWageNumeric.toFixed(2)} ${currencySymbol}`,
      currencySymbol,
      source: 'schoolmate_group_class_detail',
      days: sortedDays,
      lessons: allLessons,
      groups: successfulGroupResults.map(({ group }) => ({
        groupId: group.GroupId,
        groupName: group.GroupName
      })),
      durationMs
    };
  }

  /**
   * Fetch full list of teachers from Schoolmate portal
   * @param {object} [options]
   * @param {number} [options.pageSize=300]
   * @param {number} [options.pageIndex=1]
   * @returns {Promise<Array<object>>} List of mapped teacher objects
   */
  async fetchTeachersList(options = {}) {
    const pageSize = options.pageSize || 300;
    const pageIndex = options.pageIndex || 1;
    const url = `${this.baseUrl}/teacher/teacherlist`;

    const data = await this._requestAuthenticated(
      url,
      (sessionId) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          searchParams: {
            LastWorkingRecordId: '',
            RecordType: 'undefined',
            MasterSearch: ''
          },
          sortIndex: 'LastName',
          sortDirection: 'ASC',
          oldSortIndex: 'LastName',
          oldsortDirection: 'ASC',
          pageSize,
          pageIndex,
          requestuserId: this.requestUserId,
          roleId: 2
        })
      }),
      { consume: (response) => response.json() }
    );
    if (!data.IsSuccess) {
      throw new Error(`Schoolmate teacherlist returned error: ${data.Message || 'Unknown error'}`);
    }

    const rawList = data.Data?.ListItems || [];
    return rawList.map(item => {
      const teacherId = Number(item.TeacherId || item.PrimaryKeyId);
      const firstName = (item.FirstName || '').trim();
      const lastName = (item.LastName || '').trim();
      const fullName = (item.CalendarHeadName || `${lastName} ${firstName}`).trim() || 'Teacher';
      const email = (item.Email || '').trim().toLowerCase();
      const phone = (item.Phone || item.Mobile || '').trim();
      const telegramId = (item.TelegramId || '').trim();
      const schoolmateLogin = (item.UserName || '').trim();
      const isArchived = Boolean(item.IsArchived);
      const city = (item.City || '').trim();
      const nationality = (item.Nationality || '').trim();
      const contractType = (item.StrContractType || '').trim();

      return {
        schoolmateTeacherId: teacherId,
        firstName,
        lastName,
        fullName,
        email,
        phone,
        telegramId,
        schoolmateLogin,
        isArchived,
        city,
        nationality,
        contractType,
        createdDate: item.StrCreatedDate || ''
      };
    });
  }
}
