// ee-crm/scripts/crm-016/cleanup-duplicate-teachers.js
// Cleanup utility to detect and purge redundant duplicate teacher keys from Redis.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getRedisClient, isMockClient } from '../../lib/infrastructure/redis.js';
import { deduplicateTeachers } from '../../lib/infrastructure/db.js';

const candidateDirs = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '../..'),
  path.resolve(process.cwd(), '../../..')
];
for (const dir of candidateDirs) {
  dotenv.config({ path: path.resolve(dir, '.env.local'), quiet: true });
  dotenv.config({ path: path.resolve(dir, '.env'), quiet: true });
}

const TEACHERS_KEY = 'ee:teachers:map';

export async function cleanupDuplicateTeachers({ dryRun = true } = {}) {
  const redis = getRedisClient();
  if (isMockClient()) {
    console.log('Using in-memory mock client. No persistent Redis keys to clean up.');
    return { duplicatesRemoved: 0, retainedTeachers: 0 };
  }

  const all = await redis.hgetall(TEACHERS_KEY);
  if (!all || Object.keys(all).length === 0) {
    console.log('No teachers found in Redis map.');
    return { duplicatesRemoved: 0, retainedTeachers: 0 };
  }

  const rawTeachers = Object.values(all).map(t => (typeof t === 'string' ? JSON.parse(t) : t));
  const deduplicated = deduplicateTeachers(rawTeachers);

  const retainedIds = new Set(deduplicated.map(t => t.id));
  const duplicateIds = rawTeachers
    .filter(t => !retainedIds.has(t.id))
    .map(t => ({ id: t.id, name: t.fullName, email: t.email, smId: t.schoolmateTeacherId }));

  console.log(`Total teachers in store: ${rawTeachers.length}`);
  console.log(`Unique teachers retained: ${deduplicated.length}`);
  console.log(`Duplicate entries found:  ${duplicateIds.length}`);

  if (duplicateIds.length > 0) {
    console.log('\nDuplicates identified for removal:');
    for (const d of duplicateIds) {
      console.log(`  - [${d.id}] ${d.name} (${d.email}, SM ID: ${d.smId})`);
    }
  }

  if (!dryRun && duplicateIds.length > 0) {
    const idsToDelete = duplicateIds.map(d => d.id);
    await redis.hdel(TEACHERS_KEY, ...idsToDelete);
    console.log(`\n✅ Successfully removed ${idsToDelete.length} duplicate teacher keys from Redis.`);
  } else if (dryRun && duplicateIds.length > 0) {
    console.log('\nℹ️ Dry-run mode: no keys were deleted. Run with --execute to perform deletion.');
  } else {
    console.log('\n✅ No duplicates exist in the database.');
  }

  return {
    totalRaw: rawTeachers.length,
    retainedTeachers: deduplicated.length,
    duplicatesRemoved: dryRun ? 0 : duplicateIds.length,
    duplicatesFound: duplicateIds.length,
    duplicateIds
  };
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute') && !args.includes('--yes');

  console.log('====================================================');
  console.log('🧹 CRM-016: Cleanup Duplicate Teachers in Redis');
  console.log('====================================================');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE (Deleting from Redis)'}`);
  console.log('----------------------------------------------------');

  await cleanupDuplicateTeachers({ dryRun });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    console.error('Fatal cleanup error:', err.message);
    process.exit(1);
  });
}
