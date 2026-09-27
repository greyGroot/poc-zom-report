// ee-crm/scripts/crm-005/schema.js
// Central versioned schema definition, validation, and canonical hashing for CRM-005.

import crypto from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const MIGRATION_ID = 'crm-005';

export const MANDATORY_TEACHERS = [
  { name: 'Dmy Rostyslav', email: 'dmytrasevych@ukr.net' },
  { name: 'Kondratovych Yana', email: 'kondratovicana4@gmail.com' },
  { name: 'Kushnirchuk Olha', email: 'helhakushnirchuk@gmail.com' },
  { name: 'Martynenko Svitlana', email: 'svmartynenko74@gmail.com' },
  { name: 'Savchuk Yuliia', email: 'yuliasavchuk03@gmail.com' },
  { name: 'Zhuravlova Iryna', email: 'zhur.zhur.irene@gmail.com' }
];

/**
 * Known Zoom host IDs to email mapping discovered from verified POC telemetry
 */
export const KNOWN_HOST_ID_MAP = {
  '468nd0qatxums_a7tc-f9g': 'yuliasavchuk03@gmail.com',
  'ox-vdcvpreuljzukdbcaaq': 'darya.loboda@englishempire.com.ua',
  'gyfckjl0skszhxnurzqtwg': 'zhur.zhur.irene@gmail.com',
  'wqpp4zl1tlifphumflo36w': 'grey.rsm@gmail.com'
};

/**
 * Recursively canonicalize an object/array by sorting keys to ensure deterministic JSON.
 * @param {any} value
 * @returns {any}
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalizeJson(value[key]);
  }
  return sorted;
}

/**
 * Compute SHA-256 hash of a string or canonicalized object.
 * @param {string|object} content
 * @returns {string} Hex SHA-256
 */
export function computeSha256(content) {
  const str = typeof content === 'string'
    ? content
    : JSON.stringify(canonicalizeJson(content));
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Validates a frozen POC source snapshot.
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['Snapshot must be a non-null object'] };
  }

  if (snapshot.schema_version !== SCHEMA_VERSION) {
    errors.push(`Invalid schema_version: expected ${SCHEMA_VERSION}, received ${snapshot.schema_version}`);
  }

  if (!snapshot.source || typeof snapshot.source !== 'object') {
    errors.push('Missing source metadata');
  } else {
    if (!snapshot.source.fingerprint) errors.push('Missing source.fingerprint');
    if (!snapshot.source.cutoff_at) errors.push('Missing source.cutoff_at');
    if (!snapshot.source.captured_at) errors.push('Missing source.captured_at');
  }

  if (!snapshot.inventory || typeof snapshot.inventory !== 'object') {
    errors.push('Missing inventory object');
  } else {
    if (!Array.isArray(snapshot.inventory.meeting_index_members)) {
      errors.push('inventory.meeting_index_members must be an array');
    }
    if (!Array.isArray(snapshot.inventory.meeting_records)) {
      errors.push('inventory.meeting_records must be an array');
    }
    if (!Array.isArray(snapshot.inventory.webhook_log_entries)) {
      errors.push('inventory.webhook_log_entries must be an array');
    }
  }

  if (!snapshot.counts || typeof snapshot.counts !== 'object') {
    errors.push('Missing counts object');
  } else {
    if (snapshot.inventory) {
      if (snapshot.counts.meeting_index_count !== snapshot.inventory.meeting_index_members?.length) {
        errors.push('counts.meeting_index_count mismatch with inventory array length');
      }
      if (snapshot.counts.meeting_records_count !== snapshot.inventory.meeting_records?.length) {
        errors.push('counts.meeting_records_count mismatch with inventory array length');
      }
      if (snapshot.counts.webhook_log_entries_count !== snapshot.inventory.webhook_log_entries?.length) {
        errors.push('counts.webhook_log_entries_count mismatch with inventory array length');
      }
    }
  }

  if (!snapshot.content_sha256) {
    errors.push('Missing content_sha256');
  } else if (snapshot.inventory) {
    const expectedHash = computeSha256(snapshot.inventory);
    if (snapshot.content_sha256 !== expectedHash) {
      errors.push(`content_sha256 mismatch: expected ${expectedHash}, received ${snapshot.content_sha256}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates a migration manifest.
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  if (manifest.schema_version !== SCHEMA_VERSION) {
    errors.push(`Invalid schema_version: expected ${SCHEMA_VERSION}, received ${manifest.schema_version}`);
  }

  if (manifest.migration_id !== MIGRATION_ID) {
    errors.push(`Invalid migration_id: expected ${MIGRATION_ID}, received ${manifest.migration_id}`);
  }

  if (!manifest.snapshot_sha256) {
    errors.push('Missing snapshot_sha256');
  }

  if (!manifest.source || !manifest.source.fingerprint) {
    errors.push('Missing source fingerprint');
  }

  if (!manifest.occurrences || !Array.isArray(manifest.occurrences)) {
    errors.push('manifest.occurrences must be an array');
  }

  if (!manifest.dispositions || typeof manifest.dispositions !== 'object') {
    errors.push('manifest.dispositions must be an object');
  }

  if (!manifest.teacher_reconciliation || typeof manifest.teacher_reconciliation !== 'object') {
    errors.push('manifest.teacher_reconciliation must be an object');
  } else {
    for (const t of MANDATORY_TEACHERS) {
      const email = t.email.toLowerCase();
      if (!manifest.teacher_reconciliation[email]) {
        errors.push(`Missing mandatory teacher reconciliation entry for ${t.name} (${email})`);
      }
    }
  }

  const blockingCount = manifest.summary_counts?.blocking_invalid || 0;
  if (blockingCount > 0) {
    errors.push(`Manifest contains ${blockingCount} blocking invalid items`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
