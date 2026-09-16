// Vercel Serverless Function: api/report.js
// Enhanced Zoom telemetry report: Range filter (from/to), Day-by-Day grouping, When, How Long, With Whom & Student IDs

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain Zoom Server-to-Server OAuth Access Token with in-memory caching
 */
async function getZoomAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Missing ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET in environment.');
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Cache token, expiring 5 minutes before actual expiry
  const ttlMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = now + ttlMs - (5 * 60 * 1000);

  return cachedToken;
}

/**
 * Get current date in Europe/Kyiv timezone (YYYY-MM-DD)
 */
function getKyivDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Format ISO datetime string to Kyiv date YYYY-MM-DD
 */
function formatKyivDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch {
    return (isoString || '').split('T')[0];
  }
}

/**
 * Format ISO datetime string to Kyiv local time HH:mm
 */
function formatKyivTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Format meeting duration (given in minutes) into human readable format (e.g. 70 -> "1 год 10 хв")
 */
function formatMinutesDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m < 60) return `${m} хв`;
  const hours = Math.floor(m / 60);
  const remainingMinutes = m % 60;
  return remainingMinutes > 0 ? `${hours} год ${remainingMinutes} хв` : `${hours} год`;
}

/**
 * Format participant duration (Zoom returns participants duration in SECONDS)
 * e.g. 201s -> "3 хв 21 с", 3537s -> "58 хв 57 с"
 */
function formatSecondsDuration(totalSeconds) {
  const s = Math.round(Number(totalSeconds) || 0);
  if (s < 60) return `${s} с`;
  const totalMinutes = Math.floor(s / 60);
  const remainingSeconds = s % 60;
  if (totalMinutes < 60) {
    return remainingSeconds > 0 ? `${totalMinutes} хв ${remainingSeconds} с` : `${totalMinutes} хв`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} год ${mins} хв` : `${hours} год`;
}

/**
 * Safe fetch for meeting participants with automatic Retry on 429 Rate Limit
 */
async function fetchParticipantsSafe(meetingKey, token, maxRetries = 3) {
  const url = `https://api.zoom.us/v2/report/meetings/${meetingKey}/participants?page_size=100`;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 1;
      const waitMs = Math.max(retryAfter * 1000, 1000 * Math.pow(1.5, attempt));
      console.warn(`Zoom 429 Rate Limit for meeting ${meetingKey}, retrying in ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  return fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (res?.status) return res.status(200).end();
    return new Response(null, { status: 200 });
  }

  try {
    // 1. Resolve date range parameters (supports ?from=...&to=... or ?date=...)
    let fromDate, toDate;
    if (req.query) {
      fromDate = req.query.from || req.query.date;
      toDate = req.query.to || req.query.date;
    }
    if (!fromDate && req.url) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      fromDate = parsedUrl.searchParams.get('from') || parsedUrl.searchParams.get('date');
      toDate = parsedUrl.searchParams.get('to') || parsedUrl.searchParams.get('date');
    }

    const todayKyiv = getKyivDateString();
    if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      fromDate = todayKyiv;
    }
    if (!toDate || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      toDate = fromDate;
    }

    // Ensure fromDate <= toDate
    if (fromDate > toDate) {
      const temp = fromDate;
      fromDate = toDate;
      toDate = temp;
    }

    const isOverview = (req.query && req.query.overview === 'true') ||
      (Boolean(req.url) && new URL(req.url, 'http://localhost').searchParams.get('overview') === 'true');

    // 2. Authenticate with Zoom
    const token = await getZoomAccessToken();

    // 3. Fetch active teachers
    const usersRes = await fetch('https://api.zoom.us/v2/users?status=active&page_size=50', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!usersRes.ok) {
      const errText = await usersRes.text();
      throw new Error(`Failed to fetch Zoom users (${usersRes.status}): ${errText}`);
    }

    const usersData = await usersRes.json();
    const teachers = usersData.users || [];

    // 4. For each teacher, fetch past meetings for specified date range
    const rawMeetingsToProcess = [];
    let participantsScopeEnabled = true;

    for (const teacher of teachers) {
      const meetingsUrl = `https://api.zoom.us/v2/report/users/${encodeURIComponent(teacher.id)}/meetings?from=${fromDate}&to=${toDate}&type=past&page_size=100`;
      
      let teacherMeetings = [];
      try {
        const mRes = await fetch(meetingsUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (mRes.ok) {
          const mData = await mRes.json();
          teacherMeetings = mData.meetings || [];
        } else {
          console.warn(`Report request for teacher ${teacher.id} returned status ${mRes.status}`);
        }
      } catch (err) {
        console.warn(`Failed to fetch meetings for teacher ${teacher.id}:`, err.message);
      }

      for (const m of teacherMeetings) {
        rawMeetingsToProcess.push({ meeting: m, teacher });
      }
    }

    // Fast-path: Overview mode (returns meeting metadata instantly without per-meeting participant calls)
    if (isOverview) {
      const processedMeetings = rawMeetingsToProcess.map(({ meeting, teacher }) => {
        const durationMin = meeting.duration || 0;
        const startTimeKyiv = formatKyivTime(meeting.start_time);
        const endTimeKyiv = formatKyivTime(meeting.end_time);
        const meetingDateKyiv = formatKyivDate(meeting.start_time);
        const count = meeting.participants_count || 0;

        let status = 'SHORT_CALL';
        let statusLabel = 'Короткий дзвінок (< 15 хв)';
        if (durationMin >= 30 && count >= 2) {
          status = 'VERIFIED';
          statusLabel = 'Верифікований урок (≥ 30 хв)';
        } else if (durationMin >= 15 && count <= 1) {
          status = 'ONLY_HOST';
          statusLabel = 'Тільки викладач (No-Show)';
        }

        const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email;

        return {
          teacher: teacherName,
          teacherEmail: teacher.email,
          topic: meeting.topic || 'Без назви',
          meetingId: meeting.id,
          date: meetingDateKyiv,
          startTime: meeting.start_time,
          endTime: meeting.end_time,
          startTimeKyiv: startTimeKyiv,
          endTimeKyiv: endTimeKyiv,
          timeRangeKyiv: startTimeKyiv && endTimeKyiv ? `${startTimeKyiv} – ${endTimeKyiv}` : startTimeKyiv,
          durationMinutes: durationMin,
          durationFormatted: formatMinutesDuration(durationMin),
          totalMinutes: meeting.total_minutes || 0,
          participantsCount: count,
          participants: [],
          students: [],
          status: status,
          statusLabel: statusLabel,
          isOverview: true
        };
      });

      processedMeetings.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

      // Group by Date for day-by-day presentation
      const groupedDaysMap = new Map();
      for (const m of processedMeetings) {
        const d = m.date;
        if (!groupedDaysMap.has(d)) {
          groupedDaysMap.set(d, {
            date: d,
            meetings: [],
            totalMeetings: 0,
            verifiedCount: 0,
            onlyHostCount: 0,
            shortCallCount: 0,
            totalDurationMinutes: 0
          });
        }
        const dayObj = groupedDaysMap.get(d);
        dayObj.meetings.push(m);
        dayObj.totalMeetings += 1;
        dayObj.totalDurationMinutes += m.durationMinutes;
        if (m.status === 'VERIFIED') dayObj.verifiedCount += 1;
        else if (m.status === 'ONLY_HOST') dayObj.onlyHostCount += 1;
        else dayObj.shortCallCount += 1;
      }

      const days = Array.from(groupedDaysMap.values()).map(d => ({
        ...d,
        totalDurationFormatted: formatMinutesDuration(d.totalDurationMinutes)
      }));

      const totalMeetings = processedMeetings.length;
      const verifiedMeetings = processedMeetings.filter(m => m.status === 'VERIFIED').length;
      const onlyHostMeetings = processedMeetings.filter(m => m.status === 'ONLY_HOST').length;
      const shortCallMeetings = processedMeetings.filter(m => m.status === 'SHORT_CALL').length;
      const totalDurationMinutes = processedMeetings.reduce((sum, m) => sum + (m.durationMinutes || 0), 0);

      const overviewPayload = {
        from: fromDate,
        to: toDate,
        totalMeetings: totalMeetings,
        totalDays: days.length,
        summary: {
          totalMeetings,
          verifiedMeetings,
          onlyHostMeetings,
          shortCallMeetings,
          totalDurationMinutes,
          totalDurationFormatted: formatMinutesDuration(totalDurationMinutes)
        },
        participantsScopeEnabled: participantsScopeEnabled,
        days: days,
        meetings: processedMeetings,
        isOverview: true
      };

      if (res && typeof res.status === 'function') {
        return res.status(200).json(overviewPayload);
      }
      return new Response(JSON.stringify(overviewPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. Fetch participants telemetry in rate-safe chunks of 2 with small delay to avoid Zoom 429 limits
    const processedMeetings = [];
    const chunkSize = 2;

    for (let i = 0; i < rawMeetingsToProcess.length; i += chunkSize) {
      const chunk = rawMeetingsToProcess.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(async ({ meeting, teacher }) => {
        let participantsDetails = [];
        const meetingKey = meeting.uuid ? encodeURIComponent(encodeURIComponent(meeting.uuid)) : meeting.id;
        const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email;

        try {
          const pRes = await fetchParticipantsSafe(meetingKey, token);
          
          if (pRes.ok) {
            const pData = await pRes.json();
            const rawParts = pData.participants || [];

            // Aggregate multiple connections for the same person (reconnects)
            const aggregated = new Map();
            for (const p of rawParts) {
              const name = (p.name || p.user_email || 'Учасник').trim();
              const email = (p.user_email || '').trim().toLowerCase();
              const key = email || name.toLowerCase();
              const duration = Number(p.duration) || 0;
              
              // Host detection:
              // 1. Zoom session user_id for meeting host is always '16778240'
              // 2. Or matching teacher account email/name or 'Empire'
              // 3. Or if only 1 participant joined, they are the teacher waiting
              const isHost = (String(p.user_id) === '16778240') ||
                             (email && email === teacher.email.toLowerCase()) ||
                             (name.toLowerCase() === teacherName.toLowerCase()) ||
                             (name.toLowerCase().includes('empire')) ||
                             (rawParts.length === 1);

              // Identifier: email, phone, or Zoom user ID
              const identifier = email || (p.id ? `ID: ${p.id}` : (p.customer_key || 'Гість (без пошти)'));

              if (aggregated.has(key)) {
                const existing = aggregated.get(key);
                existing.durationSeconds += duration;
                if (!existing.joinTime && p.join_time) existing.joinTime = formatKyivTime(p.join_time);
                if (p.leave_time) existing.leaveTime = formatKyivTime(p.leave_time);
                if (isHost) existing.isHost = true;
              } else {
                aggregated.set(key, {
                  name: name,
                  email: p.user_email || '',
                  identifier: identifier,
                  zoomUserId: p.id || '',
                  sessionId: p.user_id || '',
                  customerKey: p.customer_key || '',
                  durationSeconds: duration,
                  joinTime: formatKyivTime(p.join_time),
                  leaveTime: formatKyivTime(p.leave_time),
                  isHost: isHost
                });
              }
            }

            participantsDetails = Array.from(aggregated.values()).map(p => ({
              ...p,
              durationMinutes: Math.round(p.durationSeconds / 60),
              durationFormatted: formatSecondsDuration(p.durationSeconds)
            }));
          } else {
            console.warn(`Participant request for meeting ${meeting.id} returned status ${pRes.status}`);
          }
        } catch (err) {
          console.warn(`Failed to fetch participants for meeting ${meeting.id}:`, err.message);
        }

        // Determine actual teacher display name if the host participant has a specific personal name
        const hostParticipant = participantsDetails.find(p => p.isHost);
        const actualTeacherName = (hostParticipant && hostParticipant.name && !hostParticipant.name.toLowerCase().includes('empire'))
          ? hostParticipant.name
          : teacherName;

        const count = participantsDetails.length > 0 ? participantsDetails.length : (meeting.participants_count || 0);
        const durationMin = meeting.duration || 0;
        const startTimeKyiv = formatKyivTime(meeting.start_time);
        const endTimeKyiv = formatKyivTime(meeting.end_time);
        const meetingDateKyiv = formatKyivDate(meeting.start_time);

        // Separate students from host
        const students = participantsDetails.filter(p => !p.isHost);

        // Validation status
        let status = 'SHORT_CALL';
        let statusLabel = 'Короткий дзвінок (< 15 хв)';
        if (durationMin >= 30 && count >= 2 && students.length >= 1) {
          status = 'VERIFIED';
          statusLabel = 'Верифікований урок (≥ 30 хв)';
        } else if (durationMin >= 15 && (count <= 1 || students.length === 0)) {
          status = 'ONLY_HOST';
          statusLabel = 'Тільки викладач (No-Show)';
        }

        return {
          teacher: actualTeacherName,
          teacherAccount: teacherName,
          teacherEmail: teacher.email,
          topic: meeting.topic || 'Без назви',
          meetingId: meeting.id,
          // КОЛИ:
          date: meetingDateKyiv,
          startTime: meeting.start_time,
          endTime: meeting.end_time,
          startTimeKyiv: startTimeKyiv,
          endTimeKyiv: endTimeKyiv,
          timeRangeKyiv: startTimeKyiv && endTimeKyiv ? `${startTimeKyiv} – ${endTimeKyiv}` : startTimeKyiv,
          // ЯК ДОВГО:
          durationMinutes: durationMin,
          durationFormatted: formatMinutesDuration(durationMin),
          totalMinutes: meeting.total_minutes || 0,
          // З КИМ:
          participantsCount: count,
          participants: participantsDetails,
          students: students,
          // СТАТУС:
          status: status,
          statusLabel: statusLabel,
          isOverview: false
        };
      }));

      processedMeetings.push(...chunkResults);

      // Delay 200ms between chunks to stay strictly within Zoom's 3 req/sec rate limit
      if (i + chunkSize < rawMeetingsToProcess.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Sort meetings descending by start time
    processedMeetings.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    // Group by Date for day-by-day presentation
    const groupedDaysMap = new Map();
    for (const m of processedMeetings) {
      const d = m.date;
      if (!groupedDaysMap.has(d)) {
        groupedDaysMap.set(d, {
          date: d,
          meetings: [],
          totalMeetings: 0,
          verifiedCount: 0,
          onlyHostCount: 0,
          shortCallCount: 0,
          totalDurationMinutes: 0
        });
      }
      const dayObj = groupedDaysMap.get(d);
      dayObj.meetings.push(m);
      dayObj.totalMeetings += 1;
      dayObj.totalDurationMinutes += m.durationMinutes;
      if (m.status === 'VERIFIED') dayObj.verifiedCount += 1;
      else if (m.status === 'ONLY_HOST') dayObj.onlyHostCount += 1;
      else dayObj.shortCallCount += 1;
    }

    const days = Array.from(groupedDaysMap.values()).map(d => ({
      ...d,
      totalDurationFormatted: formatMinutesDuration(d.totalDurationMinutes)
    }));

    // Overall summary
    const totalMeetings = processedMeetings.length;
    const verifiedMeetings = processedMeetings.filter(m => m.status === 'VERIFIED').length;
    const onlyHostMeetings = processedMeetings.filter(m => m.status === 'ONLY_HOST').length;
    const shortCallMeetings = processedMeetings.filter(m => m.status === 'SHORT_CALL').length;
    const totalDurationMinutes = processedMeetings.reduce((sum, m) => sum + (m.durationMinutes || 0), 0);

    const responsePayload = {
      from: fromDate,
      to: toDate,
      totalMeetings: totalMeetings,
      totalDays: days.length,
      summary: {
        totalMeetings,
        verifiedMeetings,
        onlyHostMeetings,
        shortCallMeetings,
        totalDurationMinutes,
        totalDurationFormatted: formatMinutesDuration(totalDurationMinutes)
      },
      participantsScopeEnabled: participantsScopeEnabled,
      days: days,
      meetings: processedMeetings
    };

    if (res && typeof res.status === 'function') {
      return res.status(200).json(responsePayload);
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error:', error);
    const errPayload = { error: error.message || 'Internal Server Error' };
    
    if (res && typeof res.status === 'function') {
      return res.status(500).json(errPayload);
    }
    return new Response(JSON.stringify(errPayload), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
