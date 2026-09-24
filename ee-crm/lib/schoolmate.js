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
    await this.ensureAuthenticated();
    const cookieHeader = `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`;
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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 302) {
        this.sessionId = null;
        await this.login();
        return this.getTeacherGroupClassList({ teacherId, fromDate, toDate });
      }
      throw new Error(`Failed to fetch teacher groups: HTTP ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
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
    await this.ensureAuthenticated();
    const cookieHeader = `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`;
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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 302) {
        this.sessionId = null;
        await this.login();
        return this.getTeacherGroupClassDetail({ groupId, teacherId, fromDate, toDate });
      }
      throw new Error(`Failed to fetch group class detail: HTTP ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
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

    // 1. Fetch group list
    const groups = await this.getTeacherGroupClassList({ teacherId, fromDate, toDate });

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
            return { group, detail };
          } catch (err) {
            console.warn(`[Schoolmate] Warning: group ${group.GroupId} (${group.GroupName}) failed:`, err.message);
            return {
              group,
              detail: { lessons: [], wageSum: '0.00', totalWage: '0.00 ₴', currencySymbol: '₴' }
            };
          }
        })
      );
      allGroupResults.push(...batchResults);
    }

    // 3. Flatten and standardize all lessons
    const dayMap = new Map();
    const allLessons = [];
    let totalWageNumeric = 0;
    let currencySymbol = '₴';

    for (const { group, detail } of allGroupResults) {
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

        const durationMinutes = parseInt(item.LengthOfLesson, 10) || 60;
        const rateNumeric = parseFloat(String(item.TeacherRatePerLesson || '0').replace(/[^0-9.]/g, '')) || 0;
        totalWageNumeric += rateNumeric;

        const lessonObj = {
          id: `lesson_${item.GroupLessonId}`,
          groupLessonId: item.GroupLessonId,
          groupId: group.GroupId,
          groupName: group.GroupName || group.CalendarHeadName || 'Group Class',
          className: item.ClassName || 'GE',
          date: isoDate,
          strLessonDate: item.StrLessonDate,
          durationMinutes,
          attendanceChecked: Boolean(item.AttendanceChecked),
          classDetailsAdded: Boolean(item.ClassDetailsAdded),
          lessonStatusName: item.LessonStatusName || null,
          lessonStatusColor: item.LessonStatusColor || null,
          lessonFunctionId: item.LessonFunctionId || 0,
          teacherRatePerLesson: item.TeacherRatePerLesson || '0.00',
          teacherRate: item.TeacherRate || `${rateNumeric.toFixed(2)} ${currencySymbol}`,
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

    // Sort days chronologically
    const sortedDays = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Sort lessons inside each day (by groupName then groupLessonId)
    for (const day of sortedDays) {
      day.lessons.sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''));
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
      groups: groups.map(g => ({ groupId: g.GroupId, groupName: g.GroupName })),
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
    await this.ensureAuthenticated();

    const pageSize = options.pageSize || 300;
    const pageIndex = options.pageIndex || 1;
    const cookieHeader = `ASP.NET_SessionId=${this.sessionId}; SelectedCulture=en-GB;`;
    const url = `${this.baseUrl}/teacher/teacherlist`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
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
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Schoolmate teacherlist error (${res.status}): ${errText}`);
    }

    const data = await res.json();
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
        createdDate: item.StrCreatedDate || ''
      };
    });
  }
}

