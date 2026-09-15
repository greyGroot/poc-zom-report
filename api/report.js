// Vercel Serverless Function: api/report.js
// Enhanced Zoom telemetry report: When, How Long, With Whom

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
function getKyivDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (res?.status) return res.status(200).end();
    return new Response(null, { status: 200 });
  }

  try {
    // 1. Resolve date parameter
    let date;
    if (req.query && req.query.date) {
      date = req.query.date;
    } else if (req.url) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      date = parsedUrl.searchParams.get('date');
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = getKyivDateString();
    }

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

    // 4. For each teacher, fetch past meetings for specified date
    const allMeetings = [];
    let participantsScopeEnabled = true;

    for (const teacher of teachers) {
      const meetingsUrl = `https://api.zoom.us/v2/report/users/${encodeURIComponent(teacher.id)}/meetings?from=${date}&to=${date}&type=past&page_size=100`;
      
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

      const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email;

      // 5. For each meeting, fetch participant telemetry (With Whom & How Long)
      for (const meeting of teacherMeetings) {
        let participantsDetails = [];
        const meetingKey = meeting.uuid ? encodeURIComponent(encodeURIComponent(meeting.uuid)) : meeting.id;

        try {
          const pRes = await fetch(`https://api.zoom.us/v2/report/meetings/${meetingKey}/participants?page_size=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (pRes.ok) {
            const pData = await pRes.json();
            const rawParts = pData.participants || [];

            // Aggregate multiple connections for the same person (reconnects)
            const aggregated = new Map();
            for (const p of rawParts) {
              const name = (p.name || p.user_email || 'Учасник').trim();
              const key = (p.user_email || name).toLowerCase();
              const duration = p.duration || 0;
              const isHost = (p.user_email && p.user_email.toLowerCase() === teacher.email.toLowerCase()) ||
                             (name.toLowerCase() === teacherName.toLowerCase());

              if (aggregated.has(key)) {
                const existing = aggregated.get(key);
                existing.durationSeconds += duration;
                if (!existing.joinTime && p.join_time) existing.joinTime = formatKyivTime(p.join_time);
                if (p.leave_time) existing.leaveTime = formatKyivTime(p.leave_time);
              } else {
                aggregated.set(key, {
                  name: name,
                  email: p.user_email || '',
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
            participantsScopeEnabled = false;
          }
        } catch (err) {
          console.warn(`Failed to fetch participants for meeting ${meeting.id}:`, err.message);
        }

        const count = participantsDetails.length > 0 ? participantsDetails.length : (meeting.participants_count || 0);
        const durationMin = meeting.duration || 0;
        const startTimeKyiv = formatKyivTime(meeting.start_time);
        const endTimeKyiv = formatKyivTime(meeting.end_time);

        // Separate students from host
        const students = participantsDetails.filter(p => !p.isHost);

        // Calculate lesson validation status
        let status = 'SHORT_CALL';
        let statusLabel = 'Короткий дзвінок (< 15 хв)';
        if (durationMin >= 30 && count >= 2) {
          status = 'VERIFIED';
          statusLabel = 'Верифікований урок (≥ 30 хв)';
        } else if (durationMin >= 15 && count <= 1) {
          status = 'ONLY_HOST';
          statusLabel = 'Тільки викладач (No-Show)';
        }

        allMeetings.push({
          teacher: teacherName,
          teacherEmail: teacher.email,
          topic: meeting.topic || 'Без назви',
          meetingId: meeting.id,
          // 1. КОЛИ:
          date: date,
          startTime: meeting.start_time,
          endTime: meeting.end_time,
          timeRangeKyiv: startTimeKyiv && endTimeKyiv ? `${startTimeKyiv} – ${endTimeKyiv}` : startTimeKyiv,
          // 2. ЯК ДОВГО:
          durationMinutes: durationMin,
          durationFormatted: formatMinutesDuration(durationMin),
          totalMinutes: meeting.total_minutes || 0,
          // 3. З КИМ:
          participantsCount: count,
          participants: participantsDetails,
          students: students,
          // Статус
          status: status,
          statusLabel: statusLabel
        });
      }
    }

    const responsePayload = {
      date: date,
      totalMeetings: allMeetings.length,
      participantsScopeEnabled: participantsScopeEnabled,
      meetings: allMeetings
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
