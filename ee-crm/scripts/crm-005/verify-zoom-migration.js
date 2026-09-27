// ee-crm/scripts/crm-005/verify-zoom-migration.js
// Read-only target reconciliation verifier for CRM-005.
// Validates projections, field hashes, fact fingerprints, and host index memberships against approved manifest.

import fs from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import {
  MANDATORY_TEACHERS,
  validateManifest
} from './schema.js';
import {
  toSafeOccurrenceId,
  computeProjectionHash
} from '../../lib/zoom-occurrence.js';
import {
  InMemoryRedis,
  OCCURRENCE_KEY_PREFIX,
  HOST_OCCURRENCES_KEY_PREFIX,
  OCCURRENCE_EVENTS_KEY_PREFIX,
  CRM_005_MIGRATION_STATE_KEY
} from '../../lib/redis.js';
import { getKyivDateString } from '../../lib/timezone.js';

export async function verifyMigration({
  manifest = null,
  manifestPath = '',
  targetClient = null,
  targetUrl = '',
  targetToken = ''
} = {}) {
  let manifestObj = manifest;
  if (!manifestObj && manifestPath) {
    const raw = fs.readFileSync(path.resolve(manifestPath), 'utf-8');
    manifestObj = JSON.parse(raw);
  }

  if (!manifestObj) {
    throw new Error('Manifest is required for verification');
  }

  const manifestValidation = validateManifest(manifestObj);
  if (!manifestValidation.valid) {
    throw new Error(`Invalid manifest: ${manifestValidation.errors.join('; ')}`);
  }

  const url = targetUrl || process.env.EE_CRM_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = targetToken || process.env.EE_CRM_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

  let tgt = targetClient;
  if (!tgt) {
    if (url && token && !url.includes('test') && process.env.NODE_ENV !== 'test') {
      tgt = new Redis({ url, token });
    } else {
      tgt = new InMemoryRedis();
    }
  }

  const plannedOccurrences = manifestObj.occurrences || [];
  const errors = [];
  let matchedCount = 0;

  const targetOccsByHost = {};

  // 1. Verify each planned occurrence
  for (const planned of plannedOccurrences) {
    const safeId = planned.safeId || toSafeOccurrenceId(planned.occurrence_id);
    const occKey = `${OCCURRENCE_KEY_PREFIX}${safeId}`;

    const rawOcc = await tgt.get(occKey);
    if (!rawOcc) {
      errors.push(`Occurrence missing in target: ${planned.occurrence_id} (${occKey})`);
      continue;
    }

    const actual = typeof rawOcc === 'string' ? JSON.parse(rawOcc) : rawOcc;

    // Check identity properties
    if (actual.occurrence_id !== planned.occurrence_id) {
      errors.push(`Occurrence ID mismatch for ${safeId}: expected ${planned.occurrence_id}, got ${actual.occurrence_id}`);
    }

    if (planned.identity_kind === 'exact_uuid') {
      if (!actual.uuid || actual.uuid !== planned.uuid) {
        errors.push(`UUID mismatch for ${safeId}: expected ${planned.uuid}, got ${actual.uuid}`);
      }
    } else if (planned.identity_kind === 'legacy_derived') {
      if (actual.uuid !== null && actual.uuid !== undefined) {
        errors.push(`Legacy-derived occurrence ${safeId} must have null uuid, got ${actual.uuid}`);
      }
    }

    if (actual.identity_kind !== planned.identity_kind) {
      errors.push(`Identity kind mismatch for ${safeId}: expected ${planned.identity_kind}, got ${actual.identity_kind}`);
    }

    // Check projection hash
    const actualHash = computeProjectionHash(actual);
    if (actualHash !== planned.projection_sha256) {
      errors.push(`Projection hash mismatch for ${planned.occurrence_id}: expected ${planned.projection_sha256}, got ${actualHash}`);
    }

    // Check host index
    const hostEmail = (planned.host_email || '').trim().toLowerCase();
    if (hostEmail && typeof tgt.zrange === 'function') {
      const hostKey = `${HOST_OCCURRENCES_KEY_PREFIX}${hostEmail}`;
      const members = await tgt.zrange(hostKey, 0, -1);
      const memberList = (members || []).map(m => (typeof m === 'object' && m !== null ? String(m.member) : String(m)));

      if (!memberList.includes(safeId)) {
        errors.push(`Occurrence ${safeId} missing from host index ${hostKey}`);
      }
    }

    // Check facts existence
    if (typeof tgt.hgetall === 'function' && Array.isArray(planned.fact_fingerprints)) {
      const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;
      const factsMap = await tgt.hgetall(factKey);
      if (factsMap && typeof factsMap === 'object') {
        for (const fp of planned.fact_fingerprints) {
          if (!factsMap[fp]) {
            errors.push(`Occurrence ${safeId} missing fact fingerprint ${fp}`);
          }
        }
      }
    }

    matchedCount++;

    if (!targetOccsByHost[hostEmail]) targetOccsByHost[hostEmail] = [];
    targetOccsByHost[hostEmail].push(actual);
  }

  // 2. Verify Mandatory Teachers
  const teacherResults = {};
  for (const t of MANDATORY_TEACHERS) {
    const email = t.email.toLowerCase();
    const plannedInfo = manifestObj.teacher_reconciliation?.[email] || {};
    const plannedCount = plannedInfo.planned_target_count || 0;
    const actualList = targetOccsByHost[email] || [];

    const passed = (actualList.length === plannedCount);
    if (!passed) {
      errors.push(`Mandatory teacher ${t.name} (${email}) count mismatch: planned ${plannedCount}, stored ${actualList.length}`);
    }

    teacherResults[email] = {
      name: t.name,
      plannedCount,
      storedCount: actualList.length,
      passed
    };
  }

  // 3. Yuliia Savchuk Specific Historical Regression Check
  const yuliiaEmail = 'yuliasavchuk03@gmail.com';
  const yuliiaOccs = targetOccsByHost[yuliiaEmail] || [];
  let yuliiaRegressionPassed = true;

  if (manifestObj.teacher_reconciliation?.[yuliiaEmail]?.planned_target_count >= 12) {
    // Check 21-27 September date distribution (Scenario 9 requires 8 occurrences in 21-27 Sep)
    const datesCount = {};
    for (const o of yuliiaOccs) {
      if (o.start_time) {
        const d = getKyivDateString(o.start_time);
        datesCount[d] = (datesCount[d] || 0) + 1;
      }
    }

    let week21to27Count = 0;
    for (const [d, c] of Object.entries(datesCount)) {
      if (d >= '2026-09-21' && d <= '2026-09-27') {
        week21to27Count += c;
      }
    }

    if (week21to27Count !== 8) {
      errors.push(`Yuliia Savchuk week 21-27 Sep count mismatch: expected 8, got ${week21to27Count}`);
      yuliiaRegressionPassed = false;
    }
  }

  const success = errors.length === 0;

  return {
    success,
    totalPlanned: plannedOccurrences.length,
    matchedCount,
    errors,
    teacherResults,
    yuliiaRegressionPassed
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('verify-zoom-migration.js')) {
  const args = process.argv.slice(2);
  let manifestPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    }
  }

  if (!manifestPath) {
    console.error('Usage: node verify-zoom-migration.js --manifest <manifest.json>');
    process.exit(1);
  }

  verifyMigration({ manifestPath })
    .then(result => {
      console.log('====================================================');
      console.log('🔍 CRM-005 Migration Verification');
      console.log(`   Success:          ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`   Total Planned:    ${result.totalPlanned}`);
      console.log(`   Matched:          ${result.matchedCount}`);
      console.log(`   Error Count:      ${result.errors.length}`);
      console.log('====================================================');

      console.log('\nMandatory Teachers:');
      for (const [email, r] of Object.entries(result.teacherResults)) {
        console.log(`   ${r.passed ? '✅' : '❌'} ${r.name} (${email}): planned ${r.plannedCount}, stored ${r.storedCount}`);
      }

      if (!result.success) {
        console.error('\nVerification Errors:');
        result.errors.forEach(e => console.error(`   - ${e}`));
        process.exit(1);
      }

      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ Verification failed: ${err.message}`);
      process.exit(1);
    });
}
