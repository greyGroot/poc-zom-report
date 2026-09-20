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
}
