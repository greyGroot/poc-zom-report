import crypto from 'crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getZoomUsersSnapshot } from '../../lib/infrastructure/zoom.js';
import {
  getMembershipActivation,
  upsertMembershipActivation,
  saveBaselineManifest
} from '../../lib/infrastructure/zoom-membership-store.js';
import {
  createBaselineActivation,
  CRM_012_BASELINE_INSTANT,
  ZOOM_MEMBERSHIP_SOURCE_KINDS
} from '../../lib/domain/zoom-membership.js';

const APPLY_CONFIRMATION = 'CRM-012-2026-09-28';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

export async function planBaselineSeed(options = {}) {
  const snapshot = options.snapshot || await getZoomUsersSnapshot({ forceRefresh: true });
  const loadActivation = options.loadActivation || getMembershipActivation;
  const activeUsers = snapshot.users.filter(user => user.status === 'active');
  const rows = [];

  for (const user of activeUsers) {
    const existing = await loadActivation(snapshot.accountId, user.id, options.redisClient || null);
    rows.push({
      zoomUserId: user.id,
      email: user.email,
      action: existing?.sourceKind === ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED
        ? 'preserve_event'
        : existing
          ? 'preserve_existing'
          : 'seed_baseline'
    });
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(activeUsers.map(user => [user.id, user.email]).sort()))
    .digest('hex');

  return {
    accountId: snapshot.accountId,
    snapshotCheckedAt: snapshot.checkedAt,
    baselineInstant: CRM_012_BASELINE_INSTANT,
    fingerprint,
    rows
  };
}

export async function applyBaselineSeed(plan, options = {}) {
  if (options.confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires confirmation ${APPLY_CONFIRMATION}`);
  }
  const upsert = options.upsertActivation || upsertMembershipActivation;
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString();
  const applied = [];

  for (const row of plan.rows) {
    if (row.action !== 'seed_baseline') {
      applied.push({ zoomUserId: row.zoomUserId, disposition: row.action });
      continue;
    }
    const activation = createBaselineActivation({
      accountId: plan.accountId,
      zoomUserId: row.zoomUserId,
      email: row.email,
      recordedAt: nowIso
    });
    const result = await upsert(activation, options.redisClient || null);
    applied.push({ zoomUserId: row.zoomUserId, disposition: result.disposition });
  }

  const manifest = {
    version: 1,
    storyId: 'CRM-012',
    accountId: plan.accountId,
    cutoff: '2026-09-28',
    baselineInstant: CRM_012_BASELINE_INSTANT,
    sourceKind: ZOOM_MEMBERSHIP_SOURCE_KINDS.BASELINE,
    snapshotCheckedAt: plan.snapshotCheckedAt,
    snapshotFingerprint: plan.fingerprint,
    zoomUserIds: plan.rows.map(row => row.zoomUserId),
    runAt: nowIso
  };
  const manifestResult = await (options.saveManifest || saveBaselineManifest)(manifest, options.redisClient || null);
  return { applied, manifestDisposition: manifestResult.disposition, manifest: manifestResult.manifest };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmationArg = process.argv.find(arg => arg.startsWith('--confirm='));
  const confirmation = confirmationArg?.slice('--confirm='.length) || process.env.CRM_012_BASELINE_CONFIRM || '';
  const plan = await planBaselineSeed();
  const publicPlan = {
    ...plan,
    rows: plan.rows.map(({ zoomUserId, action }) => ({ zoomUserId, action }))
  };
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', plan: publicPlan }, null, 2));
  if (!apply) return;
  const result = await applyBaselineSeed(plan, { confirmation });
  console.log(JSON.stringify({ result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[CRM-012] ${error.message}`);
    process.exitCode = 1;
  });
}
