#!/usr/bin/env node
// ee-crm/scripts/migrate-poc-zoom-occurrences.js
// Idempotent, deterministic one-time historical Zoom meeting migration CLI for CRM-003.
// Backfills historical records from legacy POC keys (zoom:meeting:*) into authoritative
// EE-CRM occurrence store (zoom:occurrence:* and zoom:host:occurrences:*).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';
import {
  transformLegacyMeetingToOccurrence,
  deriveFactFingerprint
} from '../lib/zoom-occurrence.js';
import {
  InMemoryRedis,
  MEETING_KEY_PREFIX,
  MEETINGS_INDEX_KEY,
  WEBHOOK_LOGS_KEY,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  OCCURRENCE_EVENTS_KEY_PREFIX,
  MIGRATION_STATE_KEY
} from '../lib/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Generate a redacted fingerprint of a Redis connection URL for safe logging/confirmation.
 * @param {string} url
 * @returns {string}
 */
export function getRedactedFingerprint(url) {
  if (!url) return 'in-memory-mock';
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
  const clean = url.replace(/^https?:\/\//, '');
  const prefix = clean.slice(0, 8);
  return `${prefix}...${hash}`;
}

/**
 * Helper to initialize Redis client for source or target.
 * @param {string} url
 * @param {string} token
 * @returns {object} Redis or InMemoryRedis client
 */
export function createRedisClient(url, token) {
  if (url && token && !url.includes('test') && process.env.NODE_ENV !== 'test') {
    return new Redis({ url, token });
  }
  return new InMemoryRedis();
}

/**
 * Parse CLI command-line arguments.
 * @param {Array<string>} argv
 * @returns {object}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    isDryRun: true,
    isExecute: false,
    confirmTarget: null,
    isYes: false,
    resume: false,
    batchSize: 50,
    reportFile: './crm-003-migration-report.json'
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') {
      args.isDryRun = true;
      args.isExecute = false;
    } else if (a === '--execute') {
      args.isExecute = true;
      args.isDryRun = false;
    } else if (a === '--yes' || a === '-y') {
      args.isYes = true;
    } else if (a === '--confirm-target' && i + 1 < argv.length) {
      args.confirmTarget = argv[++i];
    } else if (a === '--resume') {
      args.resume = true;
    } else if (a === '--batch-size' && i + 1 < argv.length) {
      args.batchSize = parseInt(argv[++i], 10) || 50;
    } else if (a === '--report-file' && i + 1 < argv.length) {
      args.reportFile = argv[++i];
    }
  }

  return args;
}

/**
 * Run historical migration with full dry-run audit or guarded live execution.
 * @param {object} options
 * @param {object} [options.sourceClient]
 * @param {object} [options.targetClient]
 * @param {object} [options.cliArgs]
 * @returns {Promise<object>} Report object
 */
export async function runMigration({
  sourceClient = null,
  targetClient = null,
  cliArgs = null
} = {}) {
  const args = cliArgs || parseArgs();

  // Resolve source credentials
  const sourceUrl = process.env.POC_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const sourceToken = process.env.POC_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  const src = sourceClient || createRedisClient(sourceUrl, sourceToken);
  const srcFingerprint = getRedactedFingerprint(sourceUrl);

  // Resolve target credentials
  const targetUrl = process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || sourceUrl;
  const targetToken = process.env.EE_CRM_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || sourceToken;
  const tgt = targetClient || createRedisClient(targetUrl, targetToken);
  const tgtFingerprint = getRedactedFingerprint(targetUrl);

  const isLive = args.isExecute;

  console.log('====================================================');
  console.log(`🚀 CRM-003 Zoom Occurrence Migration CLI`);
  console.log(`   Mode:             ${isLive ? '🔴 LIVE EXECUTION' : '🟡 DRY-RUN AUDIT'}`);
  console.log(`   Source Endpoint:  ${srcFingerprint}`);
  console.log(`   Target Endpoint:  ${tgtFingerprint}`);
  console.log(`   Batch Size:       ${args.batchSize}`);
  console.log(`   Report File:      ${args.reportFile}`);
  console.log('====================================================\n');

  // Guard: Live execution requires --confirm-target matching target fingerprint
  if (isLive) {
    const isAutoConfirmed = args.confirmTarget === 'auto' || args.isYes;
    if (!args.confirmTarget && !args.isYes) {
      throw new Error(`Live execution blocked: Missing --confirm-target <fingerprint>. Expected: "${tgtFingerprint}"`);
    }
    if (!isAutoConfirmed && args.confirmTarget !== tgtFingerprint) {
      throw new Error(`Live execution blocked: Target fingerprint mismatch. Provided: "${args.confirmTarget}", Expected: "${tgtFingerprint}"`);
    }
  }

  // Guard: Check if migration has already completed
  const rawState = await tgt.get(MIGRATION_STATE_KEY);
  const existingState = rawState
    ? (typeof rawState === 'string' ? JSON.parse(rawState) : rawState)
    : null;

  if (existingState && existingState.status === 'complete' && isLive) {
    throw new Error('Migration CRM-003 has already completed successfully. Re-running is prohibited.');
  }

  // 1. Discover historical records from Source Redis
  console.log('[Phase 1] Discovering historical records from source...');
  const discoveredMeetingIds = new Set();

  // A. Read from zoom:meetings:index
  if (typeof src.zrange === 'function') {
    const indexMembers = await src.zrange(MEETINGS_INDEX_KEY, 0, -1);
    if (Array.isArray(indexMembers)) {
      for (const m of indexMembers) {
        if (m) discoveredMeetingIds.add(String(m).trim());
      }
    }
  }

  // B. Scan zoom:meeting:* keys
  let scanKeys = [];
  if (typeof src.keys === 'function') {
    try {
      const found = await src.keys(`${MEETING_KEY_PREFIX}*`);
      if (Array.isArray(found)) scanKeys = found;
    } catch (e) {
      console.warn('keys() failed, falling back to scan:', e.message);
    }
  }

  if (scanKeys.length === 0 && typeof src.scan === 'function') {
    let cursor = 0;
    do {
      const [nextCursor, keys] = await src.scan(cursor, { match: `${MEETING_KEY_PREFIX}*`, count: 100 });
      if (Array.isArray(keys)) scanKeys.push(...keys);
      cursor = Number(nextCursor);
    } while (cursor !== 0 && !Number.isNaN(cursor));
  }

  for (const k of scanKeys) {
    if (k && k.startsWith(MEETING_KEY_PREFIX)) {
      const id = k.slice(MEETING_KEY_PREFIX.length).trim();
      if (id) discoveredMeetingIds.add(id);
    }
  }

  const legacyRecordCache = new Map();

  // If source Redis has 0 legacy meetings, fetch from remote legacy POC debug endpoint fallback
  if (discoveredMeetingIds.size === 0) {
    const legacyUrl = process.env.LEGACY_POC_URL || 'https://poc-zom-report.vercel.app';
    try {
      console.log(`[Phase 1] No meetings in source Redis. Querying legacy POC at ${legacyUrl}/api/debug ...`);
      const res = await fetch(`${legacyUrl}/api/debug`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.meetings)) {
          console.log(`   Fetched ${json.meetings.length} legacy meetings from ${legacyUrl}`);
          for (const m of json.meetings) {
            if (m && m.meeting_id && m.data) {
              const mid = String(m.meeting_id);
              discoveredMeetingIds.add(mid);
              legacyRecordCache.set(mid, m.data);
            }
          }
        }
        if (Array.isArray(json.webhook_events)) {
          webhookLogs = json.webhook_events;
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch legacy meetings from ${legacyUrl}:`, e.message);
    }
  }

  console.log(`   Discovered ${discoveredMeetingIds.size} legacy meeting entries.`);

  // C. Fetch supplementary logs for UUID recovery
  let webhookLogs = [];
  if (typeof src.lrange === 'function') {
    const rawLogs = await src.lrange(WEBHOOK_LOGS_KEY, 0, 999);
    const parsedLogs = (rawLogs || []).map(r => (typeof r === 'string' ? JSON.parse(r) : r));
    if (parsedLogs.length > 0) webhookLogs = parsedLogs;
  }

  // 2. Fetch and transform legacy records
  console.log('\n[Phase 2] Auditing and transforming legacy records...');
  const allMeetingIds = Array.from(discoveredMeetingIds);

  const report = {
    mode: isLive ? 'execute' : 'dry-run',
    timestamp: new Date().toISOString(),
    sourceFingerprint: srcFingerprint,
    targetFingerprint: tgtFingerprint,
    totalScanned: allMeetingIds.length,
    candidates: 0,
    alreadyCurrent: 0,
    readyToMigrate: 0,
    migrated: 0,
    skippedMissingUuid: 0,
    skippedAmbiguousUuid: 0,
    skippedMissingHost: 0,
    skippedMissingStart: 0,
    errors: [],
    skippedDetails: []
  };

  const transformationResults = [];

  for (const mid of allMeetingIds) {
    const key = `${MEETING_KEY_PREFIX}${mid}`;
    let raw = legacyRecordCache.get(mid);
    if (!raw) {
      raw = await src.get(key);
    }
    if (!raw) continue;
    const meeting = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const res = transformLegacyMeetingToOccurrence(meeting, webhookLogs);
    if (!res.success) {
      if (res.reason === 'missing_uuid') report.skippedMissingUuid++;
      else if (res.reason === 'ambiguous_uuid') report.skippedAmbiguousUuid++;
      else if (res.reason === 'missing_host') report.skippedMissingHost++;
      else if (res.reason === 'missing_start') report.skippedMissingStart++;

      report.skippedDetails.push({
        meetingId: mid,
        reason: res.reason
      });
      continue;
    }

    report.candidates++;
    transformationResults.push(res);
  }

  // Check which occurrences already exist in target
  for (const item of transformationResults) {
    const existingRaw = await tgt.get(`${OCCURRENCE_KEY_PREFIX}${item.safeId}`);
    if (existingRaw) {
      report.alreadyCurrent++;
    } else {
      report.readyToMigrate++;
    }
  }

  console.log(`   Total Scanned:          ${report.totalScanned}`);
  console.log(`   Valid Candidates:       ${report.candidates}`);
  console.log(`   - Ready to Migrate:     ${report.readyToMigrate}`);
  console.log(`   - Already in Target:    ${report.alreadyCurrent}`);
  console.log(`   Skipped:`);
  console.log(`   - Missing UUID:         ${report.skippedMissingUuid}`);
  console.log(`   - Ambiguous UUID:       ${report.skippedAmbiguousUuid}`);
  console.log(`   - Missing Host Email:   ${report.skippedMissingHost}`);
  console.log(`   - Missing Start Time:   ${report.skippedMissingStart}`);

  // 3. Execution Phase (only if live mode)
  if (isLive) {
    console.log('\n[Phase 3] Executing live migration writes in batches...');

    let startIndex = 0;
    if (args.resume && existingState && existingState.checkpoint) {
      startIndex = existingState.checkpoint.lastProcessedIndex || 0;
      console.log(`   Resuming migration from checkpoint index: ${startIndex}`);
    }

    // Set initial migration state
    await tgt.set(MIGRATION_STATE_KEY, {
      status: 'running',
      startedAt: new Date().toISOString(),
      sourceFingerprint: srcFingerprint,
      targetFingerprint: tgtFingerprint,
      checkpoint: { lastProcessedIndex: startIndex }
    });

    const batchSize = args.batchSize;
    for (let i = startIndex; i < transformationResults.length; i += batchSize) {
      const batch = transformationResults.slice(i, i + batchSize);

      for (const item of batch) {
        const { safeId, occurrence, hostEmail, score } = item;

        // 1. Store synthetic migration fact
        const fact = {
          type: 'migration.historical',
          uuid: occurrence.uuid,
          numeric_meeting_id: occurrence.numeric_meeting_id,
          topic: occurrence.topic,
          host_email: hostEmail,
          start_time: occurrence.start_time,
          end_time: occurrence.end_time,
          source_timestamp: occurrence.source_updated_at
        };
        const fingerprint = deriveFactFingerprint(fact);
        const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;

        if (typeof tgt.hset === 'function') {
          await tgt.hset(factKey, fingerprint, JSON.stringify(fact));
        } else {
          await tgt.set(factKey, { [fingerprint]: fact });
        }

        // 2. Publish occurrence projection
        await tgt.set(`${OCCURRENCE_KEY_PREFIX}${safeId}`, occurrence);

        // 3. Update host index sorted set
        if (hostEmail) {
          const hostKey = `${HOST_OCCURRENCES_KEY_PREFIX}${hostEmail}`;
          await tgt.zadd(hostKey, { score, member: safeId });
        }

        // 4. Mirror legacy meeting to target Redis for backwards compatibility
        const legacyId = occurrence.numeric_meeting_id;
        const legacyMeetingData = legacyId ? legacyRecordCache.get(legacyId) : null;
        if (legacyId && legacyMeetingData) {
          const legacyKey = `${MEETING_KEY_PREFIX}${legacyId}`;
          const existingLegacy = await tgt.get(legacyKey);
          if (!existingLegacy) {
            await tgt.set(legacyKey, typeof legacyMeetingData === 'string' ? legacyMeetingData : JSON.stringify(legacyMeetingData));
          }
          if (typeof tgt.zadd === 'function') {
            await tgt.zadd(MEETINGS_INDEX_KEY, { score, member: legacyId });
          }
        }

        report.migrated++;
      }

      // Checkpoint progress
      const currentIdx = Math.min(i + batchSize, transformationResults.length);
      await tgt.set(MIGRATION_STATE_KEY, {
        status: 'running',
        checkpoint: { lastProcessedIndex: currentIdx },
        updatedAt: new Date().toISOString()
      });
      console.log(`   Processed batch: ${currentIdx} / ${transformationResults.length}`);
    }

    // Mark completed
    await tgt.set(MIGRATION_STATE_KEY, {
      status: 'complete',
      completedAt: new Date().toISOString(),
      sourceFingerprint: srcFingerprint,
      targetFingerprint: tgtFingerprint,
      totalMigrated: report.migrated,
      totalCandidates: report.candidates
    });

    console.log(`\n🎉 Live migration complete! Total occurrences migrated: ${report.migrated}`);
  } else {
    console.log('\n🟡 DRY-RUN COMPLETE. No target writes or mutations were performed.');
  }

  // 4. Write report file
  try {
    const reportPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), args.reportFile);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📄 Migration report saved to: ${reportPath}`);
  } catch (err) {
    console.warn(`[Migration] Failed to write report file: ${err.message}`);
  }

  return report;
}

// Auto-run if executed directly as a script - DEPRECATED in CRM-005
if (process.argv[1] && process.argv[1].endsWith('migrate-poc-zoom-occurrences.js')) {
  console.error('\n❌ DEPRECATED: Direct CLI execution of migrate-poc-zoom-occurrences.js is deprecated.');
  console.error('   Please use the CRM-005 migration tooling under scripts/crm-005/:');
  console.error('   - scripts/crm-005/export-poc-snapshot.js');
  console.error('   - scripts/crm-005/plan-zoom-migration.js');
  console.error('   - scripts/crm-005/execute-zoom-migration.js');
  console.error('   - scripts/crm-005/verify-zoom-migration.js\n');
  process.exit(1);
}

