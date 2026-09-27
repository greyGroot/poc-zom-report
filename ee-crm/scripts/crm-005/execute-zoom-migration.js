// ee-crm/scripts/crm-005/execute-zoom-migration.js
// Guarded, one-time target import and reconciliation executor for CRM-005.
// Prohibits auto/mock in production, enforces once-only execution, repairs contaminated records,
// advances checkpoints atomically, and marks complete only after read-back reconciliation.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import {
  MIGRATION_ID,
  validateManifest
} from './schema.js';
import {
  toSafeOccurrenceId,
  deriveFactFingerprint,
  reduceOccurrenceFacts
} from '../../lib/domain/zoom-occurrence.js';
import {
  InMemoryRedis,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  OCCURRENCE_EVENTS_KEY_PREFIX,
  CRM_005_MIGRATION_STATE_KEY,
  saveOccurrenceFact,
  getOccurrenceFacts,
  publishOccurrenceProjection,
  getCrm005MigrationState,
  setCrm005MigrationState
} from '../../lib/infrastructure/redis.js';
import { verifyMigration } from './verify-zoom-migration.js';

export function getRedactedFingerprint(url) {
  if (!url) return 'in-memory-mock';
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8);
  const clean = url.replace(/^https?:\/\//, '');
  const prefix = clean.slice(0, 8);
  return `${prefix}...${hash}`;
}

export async function executeMigration({
  manifest = null,
  manifestPath = '',
  targetClient = null,
  targetUrl = '',
  targetToken = '',
  confirmTarget = null,
  confirmManifest = null,
  beforeImageDir = '',
  batchSize = 50,
  resume = false
} = {}) {
  let manifestObj = manifest;
  if (!manifestObj && manifestPath) {
    const raw = fs.readFileSync(path.resolve(manifestPath), 'utf-8');
    manifestObj = JSON.parse(raw);
  }

  if (!manifestObj) {
    throw new Error('Manifest is required for execution');
  }

  const manifestValidation = validateManifest(manifestObj);
  if (!manifestValidation.valid) {
    throw new Error(`Invalid manifest: ${manifestValidation.errors.join('; ')}`);
  }

  if (manifestObj.blocking_errors && manifestObj.blocking_errors.length > 0) {
    throw new Error(`Execution blocked: Manifest contains blocking errors: ${manifestObj.blocking_errors.join('; ')}`);
  }

  const url = targetUrl || process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = targetToken || process.env.EE_CRM_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  const tgtFingerprint = getRedactedFingerprint(url);
  const isProduction = process.env.NODE_ENV === 'production';

  // Preflight target validation
  if (isProduction) {
    if (!confirmTarget) {
      throw new Error(`Production execution blocked: Missing --confirm-target. Expected: "${tgtFingerprint}"`);
    }
    if (confirmTarget !== tgtFingerprint) {
      throw new Error(`Production execution blocked: Target fingerprint mismatch. Provided: "${confirmTarget}", Expected: "${tgtFingerprint}"`);
    }
    if (!confirmManifest) {
      throw new Error(`Production execution blocked: Missing --confirm-manifest. Expected: "${manifestObj.manifest_sha256}"`);
    }
    if (confirmManifest !== manifestObj.manifest_sha256) {
      throw new Error(`Production execution blocked: Manifest hash mismatch. Provided: "${confirmManifest}", Expected: "${manifestObj.manifest_sha256}"`);
    }
    if (manifestObj.source?.fingerprint && manifestObj.source.fingerprint === tgtFingerprint) {
      throw new Error('Production execution blocked: Source and target fingerprints are identical');
    }
    if (!url || !token) {
      throw new Error('Production execution blocked: Missing target credentials');
    }
  }

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

  // 1. One-Time Execution Guard (Checked BEFORE any target write!)
  const currentState = await getCrm005MigrationState(tgt);
  if (currentState && currentState.status === 'complete') {
    throw new Error('Migration CRM-005 has already completed successfully. Re-running is prohibited.');
  }

  if (currentState && currentState.status === 'running') {
    if (!resume) {
      throw new Error('Migration CRM-005 is already in progress. Use --resume to resume from checkpoint.');
    }
    // Verify snapshot and manifest hashes match original run
    if (currentState.snapshot_sha256 !== manifestObj.snapshot_sha256) {
      throw new Error(`Resume rejected: Snapshot hash mismatch. Recorded: "${currentState.snapshot_sha256}", Current: "${manifestObj.snapshot_sha256}"`);
    }
    if (currentState.manifest_sha256 !== manifestObj.manifest_sha256) {
      throw new Error(`Resume rejected: Manifest hash mismatch. Recorded: "${currentState.manifest_sha256}", Current: "${manifestObj.manifest_sha256}"`);
    }
  }

  const runId = currentState?.run_id || `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const plannedOccurrences = manifestObj.occurrences || [];

  // Capture before-images for affected occurrences to support rollback
  const beforeImages = {};
  for (const item of plannedOccurrences) {
    const safeId = item.safeId || toSafeOccurrenceId(item.occurrence_id);
    const existing = await tgt.get(`${OCCURRENCE_KEY_PREFIX}${safeId}`);
    if (existing) {
      beforeImages[safeId] = {
        projection: typeof existing === 'string' ? JSON.parse(existing) : existing
      };
    }
  }

  if (beforeImageDir) {
    try {
      const resolvedDir = path.resolve(beforeImageDir);
      if (!fs.existsSync(resolvedDir)) fs.mkdirSync(resolvedDir, { recursive: true });
      fs.writeFileSync(
        path.join(resolvedDir, `before-images-${runId}.json`),
        JSON.stringify(beforeImages, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.warn(`[CRM-005] Failed to save before-image artifact: ${e.message}`);
    }
  }

  let startIndex = 0;
  if (resume && currentState?.checkpoint?.lastProcessedIndex) {
    startIndex = currentState.checkpoint.lastProcessedIndex;
  }

  // Set running state
  await setCrm005MigrationState({
    status: 'running',
    run_id: runId,
    started_at: currentState?.started_at || new Date().toISOString(),
    snapshot_sha256: manifestObj.snapshot_sha256,
    manifest_sha256: manifestObj.manifest_sha256,
    source_fingerprint: manifestObj.source?.fingerprint || '',
    target_fingerprint: tgtFingerprint,
    total_planned: plannedOccurrences.length,
    checkpoint: { lastProcessedIndex: startIndex }
  }, tgt);

  // 2. Process occurrences in bounded batches
  const importedFactFingerprints = currentState?.imported_fact_fingerprints || [];

  for (let i = startIndex; i < plannedOccurrences.length; i += batchSize) {
    const batch = plannedOccurrences.slice(i, i + batchSize);

    for (const item of batch) {
      const safeId = item.safeId || toSafeOccurrenceId(item.occurrence_id);
      const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;

      // Read and retain only valid live facts, then rebuild the hash. This
      // removes malformed Upstash hash fields and stale historical migration
      // facts without discarding post-cutover live evidence.
      const existingFacts = await getOccurrenceFacts(safeId, tgt);
      const retainedLiveFacts = existingFacts.filter(fact =>
        fact.migration_id !== MIGRATION_ID &&
        fact.type !== 'migration.historical'
      );
      await tgt.del(factKey);

      for (const liveFact of retainedLiveFacts) {
        await saveOccurrenceFact(safeId, liveFact, tgt);
      }

      // Save imported facts tagged with migration metadata
      for (const f of item.facts || []) {
        const taggedFact = {
          ...f,
          migration_id: MIGRATION_ID,
          snapshot_sha256: manifestObj.snapshot_sha256
        };
        const fp = await saveOccurrenceFact(safeId, taggedFact, tgt);
        importedFactFingerprints.push(fp);
      }

      // Read all repaired facts for this safeId (migration + retained live facts)
      const allFacts = await getOccurrenceFacts(safeId, tgt);

      // Reduce fresh projection to overwrite any contaminated legacy projection
      const identityObj = {
        occurrence_id: item.occurrence_id,
        uuid: item.uuid,
        identity_kind: item.identity_kind,
        identity_provenance: item.identity_provenance || null
      };

      const freshProjection = reduceOccurrenceFacts(identityObj, allFacts);

      // Publish projection and update host index
      await publishOccurrenceProjection(
        safeId,
        freshProjection,
        item.host_email,
        item.score,
        tgt
      );
    }

    const currentIdx = Math.min(i + batchSize, plannedOccurrences.length);
    await setCrm005MigrationState({
      status: 'running',
      run_id: runId,
      snapshot_sha256: manifestObj.snapshot_sha256,
      manifest_sha256: manifestObj.manifest_sha256,
      checkpoint: { lastProcessedIndex: currentIdx },
      imported_fact_fingerprints: importedFactFingerprints,
      updated_at: new Date().toISOString()
    }, tgt);
  }

  // 3. Target Read-Back Reconciliation
  await setCrm005MigrationState({
    status: 'verifying',
    run_id: runId,
    verifying_at: new Date().toISOString()
  }, tgt);

  const verification = await verifyMigration({
    manifest: manifestObj,
    targetClient: tgt
  });

  if (!verification.success) {
    await setCrm005MigrationState({
      status: 'failed',
      run_id: runId,
      failed_at: new Date().toISOString(),
      errors: verification.errors
    }, tgt);
    throw new Error(`Target reconciliation failed with ${verification.errors.length} errors: ${verification.errors.slice(0, 3).join('; ')}`);
  }

  // 4. Mark Complete permanently
  const completionState = {
    status: 'complete',
    run_id: runId,
    completed_at: new Date().toISOString(),
    snapshot_sha256: manifestObj.snapshot_sha256,
    manifest_sha256: manifestObj.manifest_sha256,
    source_fingerprint: manifestObj.source?.fingerprint || '',
    target_fingerprint: tgtFingerprint,
    total_migrated: plannedOccurrences.length,
    reconciliation: {
      verified_at: new Date().toISOString(),
      matched_count: verification.matchedCount,
      yuliia_regression_passed: verification.yuliiaRegressionPassed
    }
  };

  await setCrm005MigrationState(completionState, tgt);

  return {
    success: true,
    runId,
    migrated: plannedOccurrences.length,
    verification,
    completionState
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('execute-zoom-migration.js')) {
  const args = process.argv.slice(2);
  let manifestPath = '';
  let confirmTarget = null;
  let confirmManifest = null;
  let resume = false;
  let batchSize = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    } else if (args[i] === '--confirm-target' && i + 1 < args.length) {
      confirmTarget = args[++i];
    } else if (args[i] === '--confirm-manifest' && i + 1 < args.length) {
      confirmManifest = args[++i];
    } else if (args[i] === '--resume') {
      resume = true;
    } else if (args[i] === '--batch-size' && i + 1 < args.length) {
      batchSize = parseInt(args[++i], 10) || 50;
    }
  }

  if (!manifestPath) {
    console.error('Usage: node execute-zoom-migration.js --manifest <manifest.json> [--confirm-target <fp>] [--confirm-manifest <hash>] [--resume]');
    process.exit(1);
  }

  executeMigration({
    manifestPath,
    confirmTarget,
    confirmManifest,
    resume,
    batchSize
  })
    .then(result => {
      console.log('====================================================');
      console.log('🎉 CRM-005 Migration Successfully Executed & Reconciled!');
      console.log(`   Run ID:           ${result.runId}`);
      console.log(`   Occurrences:      ${result.migrated}`);
      console.log(`   Reconciliation:   ✅ PASSED`);
      console.log('====================================================');
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ Execution failed: ${err.message}`);
      process.exit(1);
    });
}
