/**
 * CRM-005 Pre-Migration Backup
 *
 * Creates a complete local backup of ALL zoom-related data in EE-CRM Redis
 * before running the migration. The backup file can be used to restore
 * the exact previous state if anything goes wrong.
 *
 * Usage:
 *   node --env-file=.env.vercel scripts/crm-005/backup-ee-crm-zoom.js
 *
 * Output:
 *   scripts/crm-005/backups/ee-crm-zoom-backup-<timestamp>.json
 */

import { getRedisClient } from '../../lib/infrastructure/redis.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function scanAllKeys(redis, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { match: pattern, count: 200 });
    cursor = String(result[0]);
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys.sort();
}

async function main() {
  const redis = getRedisClient();

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  if (!url || url.includes('placeholder') || url.includes('your-')) {
    console.error('❌ No valid Redis credentials found. Run with --env-file=.env.vercel');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🔒 CRM-005 Pre-Migration Backup');
  console.log('====================================================');
  console.log(`Target: ${url.replace(/^(https?:\/\/[^.]+).*/, '$1...')}`);
  console.log('');

  // Collect ALL zoom-related keys
  const patterns = [
    'zoom:occurrence:*',
    'zoom:host:*',
    'zoom:meeting:*',
    'zoom:meetings:*',
    'zoom:webhook:*',
    'zoom:migrations:*',
  ];

  const allKeys = new Set();
  for (const pattern of patterns) {
    const keys = await scanAllKeys(redis, pattern);
    keys.forEach(k => allKeys.add(k));
    console.log(`  ${pattern} → ${keys.length} keys`);
  }

  console.log(`\nTotal keys to backup: ${allKeys.size}`);

  // Read all key values
  const backup = {
    created_at: new Date().toISOString(),
    source_url_fingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
    total_keys: allKeys.size,
    keys: {}
  };

  let i = 0;
  for (const key of allKeys) {
    i++;
    if (i % 20 === 0) process.stdout.write(`  Reading ${i}/${allKeys.size}...\r`);

    // Determine key type and read accordingly
    const keyType = await redis.type(key);

    switch (keyType) {
      case 'string': {
        const val = await redis.get(key);
        backup.keys[key] = { type: 'string', value: val };
        break;
      }
      case 'hash': {
        const val = await redis.hgetall(key);
        backup.keys[key] = { type: 'hash', value: val };
        break;
      }
      case 'list': {
        const val = await redis.lrange(key, 0, -1);
        backup.keys[key] = { type: 'list', value: val };
        break;
      }
      case 'zset': {
        // Get members with scores
        const members = await redis.zrange(key, 0, -1, { withScores: true });
        backup.keys[key] = { type: 'zset', value: members };
        break;
      }
      case 'set': {
        const val = await redis.smembers(key);
        backup.keys[key] = { type: 'set', value: val };
        break;
      }
      default: {
        backup.keys[key] = { type: keyType, value: null, note: 'unsupported type' };
      }
    }
  }

  console.log(`  Reading ${allKeys.size}/${allKeys.size}... done`);

  // Compute content hash
  const contentHash = createHash('sha256')
    .update(JSON.stringify(backup.keys))
    .digest('hex');
  backup.content_sha256 = contentHash;

  // Write to file
  const backupDir = join(__dirname, 'backups');
  mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ee-crm-zoom-backup-${timestamp}.json`;
  const filepath = join(backupDir, filename);

  writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');

  const fileSizeKB = (Buffer.byteLength(JSON.stringify(backup, null, 2)) / 1024).toFixed(1);

  console.log('');
  console.log('====================================================');
  console.log('✅ BACKUP COMPLETE');
  console.log('====================================================');
  console.log(`  File:    ${filepath}`);
  console.log(`  Keys:    ${allKeys.size}`);
  console.log(`  Size:    ${fileSizeKB} KB`);
  console.log(`  SHA-256: ${contentHash.slice(0, 16)}...`);
  console.log('');
  console.log('⚠️  Keep this file safe. It can restore EE-CRM zoom state.');
  console.log('');
}

main().catch(err => {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
});
