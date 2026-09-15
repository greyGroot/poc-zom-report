// Vercel Serverless Function: api/report.js
// Dead-simple, robust Zoom telemetry endpoint for Vercel

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
  // Cache token, expiring 5 minutes before actual expiry (TTL in seconds)
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

export default async function handler(req, res) {
  // Support both CORS & OPTIONS
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

      // 5. For each meeting, fetch participants
      for (const meeting of teacherMeetings) {
        let participantsList = [];
        const meetingKey = meeting.uuid ? encodeURIComponent(encodeURIComponent(meeting.uuid)) : meeting.id;

        try {
          const pRes = await fetch(`https://api.zoom.us/v2/report/meetings/${meetingKey}/participants?page_size=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (pRes.ok) {
            const pData = await pRes.json();
            const rawParts = pData.participants || [];
            // Deduplicate participant names
            const names = rawParts
              .map(p => (p.name || p.user_email || '').trim())
              .filter(Boolean);
            participantsList = [...new Set(names)];
          } else {
            console.warn(`Participant request for meeting ${meeting.id} returned status ${pRes.status}`);
          }
        } catch (err) {
          console.warn(`Failed to fetch participants for meeting ${meeting.id}:`, err.message);
        }

        const teacherName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.email;
        const count = participantsList.length > 0 ? participantsList.length : (meeting.participants_count || 0);
        const startTimeKyiv = formatKyivTime(meeting.start_time);

        allMeetings.push({
          teacher: teacherName,
          teacherEmail: teacher.email,
          topic: meeting.topic || 'Без назви',
          meetingId: meeting.id,
          startTime: meeting.start_time,
          startTimeKyiv: startTimeKyiv,
          duration: meeting.duration || 0,
          participantsCount: count,
          participants: participantsList
        });
      }
    }

    // 6. Return response
    if (res && typeof res.status === 'function') {
      return res.status(200).json(allMeetings);
    }

    return new Response(JSON.stringify(allMeetings), {
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
