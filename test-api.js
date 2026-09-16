import fs from 'fs';
import path from 'path';

// Read local .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

console.log('========================================');
console.log('   Zoom API & Day-by-Day Telemetry Test');
console.log('========================================');

const accountId = process.env.ZOOM_ACCOUNT_ID;
const clientId = process.env.ZOOM_CLIENT_ID;
const clientSecret = process.env.ZOOM_CLIENT_SECRET;

if (!accountId || !clientId || !clientSecret) {
  console.error('❌ Error: Missing ZOOM credentials in .env');
  process.exit(1);
}

import handler from './api/report.js';

async function runTests() {
  try {
    const fromDate = '2026-09-08';
    const toDate = '2026-09-15';
    console.log(`\nTesting api/report handler for range: ${fromDate} – ${toDate}...`);

    let statusCode = 200;
    let jsonResult = null;

    const mockReq = {
      method: 'GET',
      url: `/api/report?from=${fromDate}&to=${toDate}`,
      query: { from: fromDate, to: toDate }
    };
    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      }
    };

    await handler(mockReq, mockRes);

    if (statusCode !== 200 || !jsonResult || !Array.isArray(jsonResult.days)) {
      throw new Error(`Handler failed: HTTP ${statusCode}: ${JSON.stringify(jsonResult)}`);
    }

    console.log(`✅ Handler responded HTTP ${statusCode} OK.`);
    console.log(`   Period: ${jsonResult.from} – ${jsonResult.to}`);
    console.log(`   Total Days with meetings: ${jsonResult.totalDays}`);
    console.log(`   Total Meetings: ${jsonResult.totalMeetings}`);
    console.log(`   Summary:`, jsonResult.summary);

    if (jsonResult.days.length > 0) {
      const firstDay = jsonResult.days[0];
      console.log(`\nSample Day Block (${firstDay.date}):`);
      console.log(`• Meetings on this day: ${firstDay.totalMeetings}`);
      console.log(`• Day duration: ${firstDay.totalDurationFormatted}`);
      if (firstDay.meetings.length > 0) {
        const m = firstDay.meetings[0];
        console.log(`• Sample Meeting: ${m.topic} (${m.timeRangeKyiv})`);
        console.log(`• Teacher: ${m.teacher}`);
        console.log(`• Participants: ${m.participants.length}`);
        if (m.participants.length > 0) {
          const p = m.participants[0];
          console.log(`• Sample Participant: ${p.name} | ID/Email: ${p.identifier} | Duration: ${p.durationFormatted}`);
        }
      }
    }

    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED! DAY-BY-DAY TELEMETRY READY.');
    console.log('========================================');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exit(1);
  }
}

runTests();
