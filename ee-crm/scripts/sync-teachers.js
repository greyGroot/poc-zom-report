// ee-crm/scripts/sync-teachers.js
// Standalone script to sync teachers from Schoolmate directly from terminal

import { SchoolmateClient } from '../lib/schoolmate.js';
import { bulkUpsertTeachers, getTeachers } from '../lib/db.js';

async function main() {
  console.log('--- Syncing Teachers from Schoolmate EU ---');
  const startTime = Date.now();

  try {
    const client = new SchoolmateClient();
    console.log('[1] Authenticating with Schoolmate...');
    await client.ensureAuthenticated();
    console.log('✅ Authenticated! Session:', client.sessionId?.substring(0, 10) + '...');

    console.log('[2] Fetching teacher list from Schoolmate...');
    const list = await client.fetchTeachersList({ pageSize: 300 });
    console.log(`✅ Retrieved ${list.length} teachers from Schoolmate.`);

    console.log('[3] Performing deduplication & bulk upsert into CRM database...');
    const stats = await bulkUpsertTeachers(list);
    console.log('✅ Sync Completed Successfully!');
    console.log('--- Statistics ---');
    console.log(`- Total fetched from Schoolmate: ${stats.totalFetched}`);
    console.log(`- Newly Created in CRM:         ${stats.created}`);
    console.log(`- Updated / Deduplicated:        ${stats.updated}`);
    console.log(`- Total Teachers now in CRM:     ${stats.totalTeachers}`);
    console.log(`- Duration:                      ${Date.now() - startTime}ms`);

    const allTeachers = await getTeachers();
    console.log(`\nSample first 3 teachers in DB:`);
    allTeachers.slice(0, 3).forEach((t, i) => {
      console.log(`  ${i + 1}. [#${t.schoolmateTeacherId}] ${t.fullName} (${t.email || 'no email'})`);
    });

  } catch (err) {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  }
}

main();
