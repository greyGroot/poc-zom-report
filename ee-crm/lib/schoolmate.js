// ee-crm/lib/schoolmate.js
// High-performance direct HTTP client for Empire English Schoolmate EU

export class SchoolmateClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.SCHOOLMATE_BASE_URL || 'https://empireenglish.schoolmate.eu';
    this.schoolPrefix = config.schoolPrefix || process.env.SCHOOLMATE_PREFIX || 'empireenglish';
    this.userName = config.userName || process.env.SCHOOLMATE_USERNAME || 'IzaiI1498';
    this.password = config.password || process.env.SCHOOLMATE_PASSWORD || '';
    this.requestUserId = config.requestUserId || Number(process.env.SCHOOLMATE_ADMIN_USER_ID || 743140);
    
    this.sessionId = null;
    this.sessionExpiresAt = null;
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
    const initRes = await fetch(`${this.baseUrl}/admin`);
    let initCookieHeader = initRes.headers.get('set-cookie') || '';
    if (typeof initRes.headers.getSetCookie === 'function') {
      initCookieHeader = initRes.headers.getSetCookie().join('; ');
    }

    const match = initCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
    if (!match) {
      throw new Error('Could not obtain ASP.NET_SessionId from Schoolmate login page.');
    }

    const sessionId = match[1];
    const cookieHeader = `ASP.NET_SessionId=${sessionId}; SelectedCulture=en-GB;`;

    // 2. Authenticate session via POST /security/index
    const loginUrl = `${this.baseUrl}/security/index`;
    const res = await fetch(loginUrl, {
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
    });

    if (!res.ok) {
      throw new Error(`Schoolmate login HTTP error: ${res.status} ${res.statusText}`);
    }

    const loginData = await res.json();
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

    await this.ensureAuthenticated();
    const overallStartTime = Date.now();

    const cookieHeader = `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`;

    // 1. Request report generation
    const genUrl = `${this.baseUrl}/teacher/printemployeeschedule`;
    const genRes = await fetch(genUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
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
    });

    if (!genRes.ok) {
      if (genRes.status === 401 || genRes.status === 302) {
        this.sessionId = null;
        await this.login();
        return this.getTeacherSchedulePdf({ teacherId, fromDate, toDate });
      }
      throw new Error(`Failed to generate schedule: HTTP ${genRes.status} ${genRes.statusText}`);
    }

    const genData = await genRes.json();
    if (!genData.IsSuccess || !genData.Data || !genData.Data.AbsolutePath) {
      throw new Error(`Schoolmate schedule generation rejected: ${genData.Message || 'Unknown error'}`);
    }

    const { AbsolutePath, FileName } = genData.Data;

    // 2. Download the generated PDF binary
    // Note: AbsolutePath is already URL-encoded or contains encoded slashes (%5c)
    const downloadUrl = `${this.baseUrl}/common/download?fpath=${AbsolutePath}&fname=${FileName}&d=true`;

    const downloadRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader
      }
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download generated schedule PDF: HTTP ${downloadRes.status} ${downloadRes.statusText}`);
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
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
    await this.ensureAuthenticated();
    const startTime = Date.now();
    const cookieHeader = `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`;

    const url = `${this.baseUrl}/calendar/getschedulerevents`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
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
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 302) {
        this.sessionId = null;
        await this.login();
        return this.getSchedulerEvents({ date });
      }
      throw new Error(`Failed to fetch scheduler events: HTTP ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
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
            groupId: l.GroupId
          };

          lessons.push(lessonItem);
          if (dayInfo) {
            dayInfo.lessons.push(lessonItem);
            dayInfo.subtotalMinutes += durationMinutes;
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
      isMinutesMatching: true,
      source: 'schoolmate_json_api',
      days,
      lessons,
      durationMs
    };
  }
}
