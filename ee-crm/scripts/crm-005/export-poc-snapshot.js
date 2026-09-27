// ee-crm/scripts/crm-005/export-poc-snapshot.js
// Direct, read-only, complete historical source export tool for CRM-005.
// Exports every legacy meeting record, the entire index, and all retained webhook logs without truncation.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import {
  SCHEMA_VERSION,
  canonicalizeJson,
  computeSha256,
  validateSnapshot,
  MEETING_KEY_PREFIX,
  MEETINGS_INDEX_KEY,
  WEBHOOK_LOGS_KEY
} from './schema.js';
import {
  InMemoryRedis
} from '../../lib/redis.js';

export function getRedactedFingerprint(url) {
  if (!url) return 'in-memory-mock';
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
  const clean = url.replace(/^https?:\/\//, '');
  const prefix = clean.slice(0, 8);
  return `${prefix}...${hash}`;
}

export async function exportSnapshot({
  client = null,
  sourceUrl = '',
  sourceToken = '',
  outputPath = '',
  requireReal = false
} = {}) {
  const url = sourceUrl || process.env.POC_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = sourceToken || process.env.POC_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

  let src = client;
  if (!src) {
    if (requireReal || process.env.NODE_ENV === 'production') {
      if (!url || !token) {
        throw new Error('Production / requireReal export blocked: Missing POC Redis credentials (POC_REDIS_REST_URL / POC_REDIS_REST_TOKEN)');
      }
      src = new Redis({ url, token });
    } else if (url && token) {
      src = new Redis({ url, token });
    } else {
      src = new InMemoryRedis();
    }
  }

  const fingerprint = getRedactedFingerprint(url);
  const capturedAt = new Date().toISOString();

  // 1. Export entire meetings index
  let meetingIndexMembers = [];
  if (typeof src.zrange === 'function') {
    const raw = await src.zrange(MEETINGS_INDEX_KEY, 0, -1, { withScores: true });
    if (Array.isArray(raw)) {
      meetingIndexMembers = raw.map(item => {
        if (typeof item === 'object' && item !== null) {
          return { member: String(item.member), score: Number(item.score) };
        }
        return { member: String(item), score: null };
      });
    }
  }

  // 2. Discover all zoom:meeting:* keys via SCAN cursor pagination
  const meetingKeySet = new Set();
  if (typeof src.scan === 'function') {
    let cursor = 0;
    do {
      const res = await src.scan(cursor, { match: `${MEETING_KEY_PREFIX}*`, count: 100 });
      const nextCursor = res[0];
      const keys = res[1] || [];
      for (const k of keys) {
        if (k && k.startsWith(MEETING_KEY_PREFIX)) {
          meetingKeySet.add(k);
        }
      }
      cursor = Number(nextCursor);
    } while (cursor !== 0 && !Number.isNaN(cursor));
  } else if (typeof src.keys === 'function') {
    const keys = await src.keys(`${MEETING_KEY_PREFIX}*`);
    for (const k of keys) meetingKeySet.add(k);
  }

  // Also include any members from the index that might not have been returned by scan
  for (const m of meetingIndexMembers) {
    meetingKeySet.add(`${MEETING_KEY_PREFIX}${m.member}`);
  }

  const sortedMeetingKeys = Array.from(meetingKeySet).sort();
  const meetingRecords = [];

  for (const key of sortedMeetingKeys) {
    const raw = await src.get(key);
    if (raw !== null && raw !== undefined) {
      const meetingId = key.slice(MEETING_KEY_PREFIX.length);
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      meetingRecords.push({
        key,
        meeting_id: meetingId,
        data
      });
    }
  }

  // 3. Export ALL webhook logs via LRANGE pagination (NO 100/1000 truncation!)
  const webhookLogEntries = [];
  if (typeof src.lrange === 'function') {
    const pageSize = 500;
    let start = 0;
    let keepPaging = true;

    while (keepPaging) {
      const page = await src.lrange(WEBHOOK_LOGS_KEY, start, start + pageSize - 1);
      if (!Array.isArray(page) || page.length === 0) {
        keepPaging = false;
        break;
      }

      for (const item of page) {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;
        webhookLogEntries.push(parsed);
      }

      if (page.length < pageSize) {
        keepPaging = false;
      } else {
        start += pageSize;
      }
    }
  }

  // Sort logs deterministically by timestamp/id if present
  webhookLogEntries.sort((a, b) => {
    const tA = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tB = b.timestamp ? Date.parse(b.timestamp) : 0;
    if (tA !== tB) return tA - tB;
    return (a.id || '').localeCompare(b.id || '');
  });

  // Determine cutoff: latest webhook timestamp or latest record update
  let cutoffAt = capturedAt;
  for (const log of webhookLogEntries) {
    if (log.timestamp && log.timestamp > cutoffAt) {
      cutoffAt = log.timestamp;
    }
  }

  const inventory = {
    meeting_index_members: meetingIndexMembers,
    meeting_records: meetingRecords,
    webhook_log_entries: webhookLogEntries
  };

  const contentSha256 = computeSha256(inventory);

  const snapshot = {
    schema_version: SCHEMA_VERSION,
    source: {
      fingerprint,
      cutoff_at: cutoffAt,
      captured_at: capturedAt
    },
    counts: {
      meeting_index_count: meetingIndexMembers.length,
      meeting_records_count: meetingRecords.length,
      webhook_log_entries_count: webhookLogEntries.length
    },
    content_sha256: contentSha256,
    inventory
  };

  const validation = validateSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(`Snapshot validation failed: ${validation.errors.join('; ')}`);
  }

  if (outputPath) {
    const resolvedPath = path.resolve(outputPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${resolvedPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, resolvedPath);
  }

  return snapshot;
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('export-poc-snapshot.js')) {
  const args = process.argv.slice(2);
  let outputPath = '';
  let requireReal = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (args[i] === '--require-real') {
      requireReal = true;
    }
  }

  if (!outputPath) {
    console.error('Usage: node export-poc-snapshot.js --output <snapshot-file.json> [--require-real]');
    process.exit(1);
  }

  exportSnapshot({ outputPath, requireReal })
    .then(snap => {
      console.log(`✅ Snapshot successfully created: ${outputPath}`);
      console.log(`   SHA-256: ${snap.content_sha256}`);
      console.log(`   Meetings indexed: ${snap.counts.meeting_index_count}`);
      console.log(`   Meeting records:  ${snap.counts.meeting_records_count}`);
      console.log(`   Webhook logs:     ${snap.counts.webhook_log_entries_count}`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ Export failed: ${err.message}`);
      process.exit(1);
    });
}
