// ee-crm/scripts/crm-005/rollback-zoom-migration.js
// Scoped rollback executor for CRM-005.
// Restores before-images, strips only imported migration facts, preserves concurrent live facts,
// re-reduces retained live facts, and sets CRM-005 migration state to 'rolled_back'.

import fs from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import {
  MIGRATION_ID
} from './schema.js';
import {
  toSafeOccurrenceId,
  reduceOccurrenceFacts
} from '../../lib/zoom-occurrence.js';
import {
  InMemoryRedis,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  OCCURRENCE_EVENTS_KEY_PREFIX,
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection,
  getCrm005MigrationState,
  setCrm005MigrationState
} from '../../lib/redis.js';

export async function rollbackMigration({
  manifest = null,
  manifestPath = '',
  beforeImages = null,
  beforeImagePath = '',
  targetClient = null,
  targetUrl = '',
  targetToken = '',
  confirmRollback = '',
  force = false,
  reason = 'Operator rollback'
} = {}) {
  let manifestObj = manifest;
  if (!manifestObj && manifestPath) {
    const raw = fs.readFileSync(path.resolve(manifestPath), 'utf-8');
    manifestObj = JSON.parse(raw);
  }

  let beforeImagesMap = beforeImages;
  if (!beforeImagesMap && beforeImagePath) {
    if (fs.existsSync(path.resolve(beforeImagePath))) {
      const raw = fs.readFileSync(path.resolve(beforeImagePath), 'utf-8');
      beforeImagesMap = JSON.parse(raw);
    }
  }
  if (!beforeImagesMap) {
    beforeImagesMap = {};
  }

  const url = targetUrl || process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = targetToken || process.env.EE_CRM_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  const isProduction = process.env.NODE_ENV === 'production';

  let tgt = targetClient;
  if (!tgt) {
    if (url && token && !url.includes('test') && !isProduction) {
      tgt = new Redis({ url, token });
    } else if (isProduction) {
      tgt = new Redis({ url, token });
    } else {
      tgt = new InMemoryRedis();
    }
  }

  const currentState = await getCrm005MigrationState(tgt);
  if (!currentState) {
    throw new Error('No CRM-005 migration state found in target. Nothing to roll back.');
  }

  if (currentState.status === 'complete' && !force && confirmRollback !== 'complete') {
    throw new Error('Migration CRM-005 is marked complete. Rollback requires explicit authorization (--confirm-rollback complete).');
  }

  const occurrences = manifestObj?.occurrences || [];
  let rolledBackOccurrences = 0;
  let restoredBeforeImages = 0;
  let reReducedLiveOccurrences = 0;

  for (const item of occurrences) {
    const safeId = item.safeId || toSafeOccurrenceId(item.occurrence_id);
    const hostEmail = (item.host_email || '').toLowerCase().trim();
    const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;
    const occKey = `${OCCURRENCE_KEY_PREFIX}${safeId}`;

    const existingFacts = await getOccurrenceFacts(safeId, tgt);
    const liveFacts = existingFacts.filter(f => f.migration_id !== MIGRATION_ID && (!manifestObj || f.snapshot_sha256 !== manifestObj.snapshot_sha256));

    if (liveFacts.length > 0) {
      // Re-reduce with preserved live facts
      await tgt.del(factKey);
      for (const lf of liveFacts) {
        await saveOccurrenceFact(safeId, lf, tgt);
      }
      const identityObj = {
        occurrence_id: item.occurrence_id,
        uuid: item.uuid,
        identity_kind: item.identity_kind,
        identity_provenance: item.identity_provenance || null
      };
      const freshProjection = reduceOccurrenceFacts(identityObj, liveFacts);
      await publishOccurrenceProjection(safeId, freshProjection, hostEmail, item.score, tgt);
      reReducedLiveOccurrences++;
    } else {
      // No live facts: check if before-image exists
      await tgt.del(factKey);
      if (beforeImagesMap[safeId]?.projection) {
        await tgt.set(occKey, beforeImagesMap[safeId].projection);
        restoredBeforeImages++;
      } else {
        await tgt.del(occKey);
        if (hostEmail) {
          const hostKey = `${HOST_OCCURRENCES_KEY_PREFIX}${hostEmail}`;
          await tgt.zrem(hostKey, safeId);
        }
      }
    }
    rolledBackOccurrences++;
  }

  const rolledBackState = {
    status: 'rolled_back',
    run_id: currentState.run_id,
    rolled_back_at: new Date().toISOString(),
    previous_status: currentState.status,
    reason,
    total_reverted: rolledBackOccurrences,
    restored_before_images: restoredBeforeImages,
    re_reduced_live_occurrences: reReducedLiveOccurrences
  };

  await setCrm005MigrationState(rolledBackState, tgt);

  return {
    success: true,
    rolledBackState
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('rollback-zoom-migration.js')) {
  const args = process.argv.slice(2);
  let manifestPath = '';
  let beforeImagePath = '';
  let confirmRollback = '';
  let reason = 'Operator manual rollback';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    } else if (args[i] === '--before-images' && i + 1 < args.length) {
      beforeImagePath = args[++i];
    } else if (args[i] === '--confirm-rollback' && i + 1 < args.length) {
      confirmRollback = args[++i];
    } else if (args[i] === '--reason' && i + 1 < args.length) {
      reason = args[++i];
    }
  }

  if (!manifestPath) {
    console.error('Usage: node rollback-zoom-migration.js --manifest <manifest.json> [--before-images <images.json>] [--confirm-rollback complete] [--reason <text>]');
    process.exit(1);
  }

  rollbackMigration({
    manifestPath,
    beforeImagePath,
    confirmRollback,
    reason
  })
    .then(result => {
      console.log('====================================================');
      console.log('⏪ CRM-005 Migration Rolled Back Successfully');
      console.log(`   Reverted: ${result.rolledBackState.total_reverted}`);
      console.log(`   Restored: ${result.rolledBackState.restored_before_images}`);
      console.log(`   Live Retained: ${result.rolledBackState.re_reduced_live_occurrences}`);
      console.log('====================================================');
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ Rollback failed: ${err.message}`);
      process.exit(1);
    });
}
