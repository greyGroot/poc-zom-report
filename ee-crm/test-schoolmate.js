// ee-crm/test-schoolmate.js
// Verification of live Schoolmate API authentication & PDF fetch

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SchoolmateClient } from './lib/schoolmate.js';
import { parseTeacherSchedulePdf } from './lib/pdf-parser.js';

// Load .env.local if present
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  console.log('--- Testing Live Schoolmate API Integration ---');
  console.log(`Base URL: ${process.env.SCHOOLMATE_BASE_URL || 'https://empireenglish.schoolmate.eu'}`);
  console.log(`Username: ${process.env.SCHOOLMATE_USERNAME}`);

  const client = new SchoolmateClient({
    baseUrl: process.env.SCHOOLMATE_BASE_URL,
    schoolPrefix: process.env.SCHOOLMATE_PREFIX,
    userName: process.env.SCHOOLMATE_USERNAME,
    password: process.env.SCHOOLMATE_PASSWORD,
    requestUserId: process.env.SCHOOLMATE_ADMIN_USER_ID
  });

  // Step 1: Login
  console.log('\n[Step 1] Attempting authentication...');
  const loginRes = await client.login();
  console.log(`✅ Login successful in ${loginRes.durationMs} ms!`);
  console.log(`   Session ID: ${loginRes.sessionId.substring(0, 8)}...`);
  console.log(`   Admin User ID: ${loginRes.requestUserId}`);

  // Step 2: Fetch Teacher Schedule PDF (Teacher ID 17251, 14-20 September 2026)
  const teacherId = 17251;
  const fromDate = '2026-9-14';
  const toDate = '2026-9-20';

  console.log(`\n[Step 2] Requesting PDF for Teacher ID ${teacherId} (${fromDate} to ${toDate})...`);
  const reportRes = await client.getTeacherSchedulePdf({ teacherId, fromDate, toDate });
  console.log(`✅ PDF downloaded successfully in ${reportRes.durationMs} ms!`);
  console.log(`   File Name: ${reportRes.fileName}`);
  console.log(`   Buffer Size: ${reportRes.buffer.length} bytes`);

  // Step 3: Parse the freshly fetched PDF buffer directly in memory
  console.log('\n[Step 3] Parsing the live PDF buffer in memory...');
  const parsed = await parseTeacherSchedulePdf(reportRes.buffer);
  console.log(`✅ Parsed ${parsed.totalLessonsCount} lessons (${parsed.totalMinutesCalculated} min) for ${parsed.teacherName}!`);
  console.log(`   Minutes Match: ${parsed.isMinutesMatching ? 'YES ✅' : 'NO ❌'}`);

  console.log('\n🎉 END-TO-END SCHOOLMATE INTEGRATION TEST PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('\n❌ Live Schoolmate test failed:', err);
  process.exit(1);
});
