// ee-crm/scripts/crm-013/backfill-zoom-raw-events.js
// Standalone idempotent migration script to ingest missing Zoom raw webhook events
// from the 26-29 September 2026 fixture into Redis, restoring authoritative meeting occurrences.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  normalizeWebhookEventToFacts,
  reduceOccurrenceFacts,
  validateOccurrenceInvariants,
  toSafeOccurrenceId
} from '../../lib/domain/zoom-occurrence.js';
import {
  getRedisClient,
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection,
  isMockClient
} from '../../lib/infrastructure/redis.js';

// Load environment configuration
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const HOST_MAPPINGS = {
  '9258799407': 'helhakushnirchuk@gmail.com',
  '5558680499': 'zhur.zhur.irene@gmail.com',
  '7-WlHk2wSomxqSVrH_gIHA': 'helhakushnirchuk@gmail.com',
  'gYfCkJl0SkSzhXNurZQtWg': 'zhur.zhur.irene@gmail.com'
};

export const DEFAULT_START_DATE = '2026-09-26T00:00:00.000Z';
export const DEFAULT_END_DATE = '2026-09-29T23:59:59.999Z';
export const DEFAULT_FIXTURE_PATH = path.resolve(process.cwd(), 'verification/fixtures/zoom_raw_events_2026-09-29.json');

/**
 * Resolve host email from meeting metadata or deterministic bindings
 */
export function resolveHostEmail(item, payloadObj) {
  const obj = payloadObj?.payload?.object || payloadObj?.object || {};
  if (obj.host_email && typeof obj.host_email === 'string' && obj.host_email.trim()) {
    return obj.host_email.trim().toLowerCase();
  }

  const meetingId = String(item?.meeting_id || obj.id || obj.meeting_id || '').trim();
  if (meetingId && HOST_MAPPINGS[meetingId]) {
    return HOST_MAPPINGS[meetingId];
  }

  const hostId = String(obj.host_id || '').trim();
  if (hostId && HOST_MAPPINGS[hostId]) {
    return HOST_MAPPINGS[hostId];
  }

  const topic = String(item?.topic || obj.topic || '');
  if (topic.includes('Olha Kushnirchuk')) {
    return 'helhakushnirchuk@gmail.com';
  }
  if (topic.includes('Irina Zhuravleva') || topic.includes('Zhuravlova')) {
    return 'zhur.zhur.irene@gmail.com';
  }

  return null;
}

/**
 * Executes backfill of raw Zoom webhook events into Redis.
 * @param {object} options
 * @param {string} [options.fixturePath]
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {boolean} [options.dryRun=false]
 * @param {object} [options.redisClient=null]
 * @returns {Promise<object>} Summary of the backfill execution
 */
export async function backfillZoomRawEvents({
  fixturePath = DEFAULT_FIXTURE_PATH,
  startDate = DEFAULT_START_DATE,
  endDate = DEFAULT_END_DATE,
  dryRun = false,
  redisClient = null
} = {}) {
  const resolvedPath = path.resolve(fixturePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Fixture file not found at: ${resolvedPath}`);
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  const allEvents = JSON.parse(rawContent);

  const filteredEvents = allEvents.filter(e => {
    const ts = e.timestamp || (e.details && e.details.start_time);
    if (!ts) return false;
    return ts >= startDate && ts <= endDate;
  });

  const redis = redisClient || getRedisClient();
  const occurrencesMap = new Map(); // safeId -> { uuid, facts: [] }

  for (const item of filteredEvents) {
    let payloadObj = null;
    if (item.payload_raw) {
      try {
        payloadObj = typeof item.payload_raw === 'string' ? JSON.parse(item.payload_raw) : item.payload_raw;
      } catch {}
    }

    const eventName = item.event || payloadObj?.event;
    const payload = payloadObj?.payload || payloadObj || {};
    if (!payload.object) payload.object = {};

    const hostEmail = resolveHostEmail(item, payloadObj);
    if (hostEmail && !payload.object.host_email) {
      payload.object.host_email = hostEmail;
    }

    const facts = normalizeWebhookEventToFacts(eventName, payload);
    for (const fact of facts) {
      if (hostEmail && !fact.host_email) {
        fact.host_email = hostEmail;
      }

      const uuid = fact.uuid || fact.occurrence_id;
      const safeId = toSafeOccurrenceId(uuid);

      if (!occurrencesMap.has(safeId)) {
        occurrencesMap.set(safeId, { uuid, facts: [] });
      }
      occurrencesMap.get(safeId).facts.push(fact);

      if (!dryRun) {
        await saveOccurrenceFact(safeId, fact, redis);
      }
    }
  }

  const projections = [];
  const errors = [];
  const hostBreakdown = {};

  for (const [safeId, { uuid }] of occurrencesMap.entries()) {
    let facts = [];
    if (!dryRun) {
      facts = await getOccurrenceFacts(safeId, redis);
    } else {
      facts = occurrencesMap.get(safeId).facts;
    }

    const projection = reduceOccurrenceFacts(uuid, facts);
    const validation = validateOccurrenceInvariants(projection);

    if (!validation.valid) {
      errors.push({ safeId, uuid, validationErrors: validation.errors });
    }

    if (!dryRun) {
      const score = projection.start_time ? Date.parse(projection.start_time) : Date.now();
      await publishOccurrenceProjection(safeId, projection, projection.host_email, score, redis);
    }

    projections.push(projection);

    const host = projection.host_email || 'unknown';
    hostBreakdown[host] = (hostBreakdown[host] || 0) + 1;
  }

  return {
    success: errors.length === 0,
    totalEventsInFixture: allEvents.length,
    filteredEventsCount: filteredEvents.length,
    occurrencesRestoredCount: projections.length,
    hostBreakdown,
    dryRun,
    projections,
    errors
  };
}

// CLI Execution Support
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute') || args.includes('--yes');
  const hasUpstashCreds = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);

  console.log('🚀 Starting CRM-013 Zoom Raw Events Backfill Migration...');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE'}`);
  console.log(`Target: ${hasUpstashCreds ? '🌐 Upstash Cloud (Production)' : '💻 In-Memory Mock (Local Ephemeral — Not Production)'}`);

  if (!hasUpstashCreds && !dryRun) {
    console.log('\n⚠️ WARNING: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not configured in your environment or .env.local.');
    console.log('Data will be processed into local memory and NOT saved to production Upstash Redis.');
    console.log('To write to production, add your Upstash credentials to .env.local or pass them in the environment.\n');
  }

  backfillZoomRawEvents({ dryRun: dryRun && !execute })
    .then(result => {
      console.log('\n📊 Migration Results Summary:');
      console.log(`- Total events in fixture: ${result.totalEventsInFixture}`);
      console.log(`- Filtered events (26-29 Sep): ${result.filteredEventsCount}`);
      console.log(`- Occurrences reconstructed: ${result.occurrencesRestoredCount}`);
      console.log(`- Host Breakdown:`, JSON.stringify(result.hostBreakdown, null, 2));

      if (result.errors.length > 0) {
        console.error('❌ Validation Errors encountered:', result.errors);
        process.exit(1);
      } else {
        if (!hasUpstashCreds && !dryRun) {
          console.log('\n⚠️ In-memory backfill complete. (Did not persist to production Upstash)');
        } else {
          console.log('\n✅ CRM-013 Zoom Raw Events Backfill Completed Successfully!');
        }
        process.exit(0);
      }
    })
    .catch(err => {
      console.error('\n❌ Fatal error during backfill:', err);
      process.exit(1);
    });
}
