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
console.log('   Zoom API & Extended Telemetry Test');
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
    const testDate = '2026-09-10';
    console.log(`\nTesting api/report handler for date: ${testDate}...`);

    let statusCode = 200;
    let jsonResult = null;

    const mockReq = {
      method: 'GET',
      url: `/api/report?date=${testDate}`,
      query: { date: testDate }
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

    if (statusCode !== 200 || !jsonResult || !jsonResult.meetings) {
      throw new Error(`Handler failed: HTTP ${statusCode}: ${JSON.stringify(jsonResult)}`);
    }

    console.log(`✅ Handler responded HTTP ${statusCode} OK.`);
    console.log(`   Total meetings found: ${jsonResult.totalMeetings}`);
    console.log(`   Participants scope enabled: ${jsonResult.participantsScopeEnabled}`);

    if (jsonResult.meetings.length > 0) {
      console.log('\nSample Extended Telemetry:');
      const sample = jsonResult.meetings[0];
      console.log(`• Викладач: ${sample.teacher} (${sample.teacherEmail})`);
      console.log(`• Тема: ${sample.topic} (ID: ${sample.meetingId})`);
      console.log(`• КОЛИ (Київ): ${sample.timeRangeKyiv}`);
      console.log(`• ЯК ДОВГО: ${sample.durationFormatted} (${sample.durationMinutes} хв)`);
      console.log(`• З КИМ (к-сть): ${sample.participantsCount} учасник(ів)`);
      console.log(`• СТАТУС: [${sample.status}] ${sample.statusLabel}`);
    }

    console.log('\n========================================');
    console.log('🎉 ALL TESTS PASSED! TELEMETRY READY.');
    console.log('========================================');

  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exit(1);
  }
}

runTests();
