import crypto from 'node:crypto';
import { getZoomUsersSnapshot } from '@/lib/infrastructure/zoom.js';
import {
  getBaselineManifest,
  getMembershipActivation,
  saveBaselineManifest,
  upsertMembershipActivation
} from '@/lib/infrastructure/zoom-membership-store.js';
import {
  createBaselineActivation,
  CRM_012_BASELINE_INSTANT,
  ZOOM_MEMBERSHIP_SOURCE_KINDS
} from '@/lib/domain/zoom-membership.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTH_TOKEN_SHA256 = '4a43ab4a13c68fc06a482919b62db89ed35aea827837a55a2491ac58700498c7';

function isAuthorized(request) {
  const provided = request.headers.get('x-crm-012-token') || '';
  const actual = crypto.createHash('sha256').update(provided).digest();
  const expected = Buffer.from(AUTH_TOKEN_SHA256, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const snapshot = await getZoomUsersSnapshot({ forceRefresh: true });
  const existingManifest = await getBaselineManifest(snapshot.accountId);
  if (existingManifest) {
    return Response.json({ status: 'already_applied', count: existingManifest.zoomUserIds?.length || 0 });
  }

  const activeUsers = snapshot.users.filter(user => user.status === 'active');
  if (activeUsers.length !== 6) {
    return Response.json(
      { error: 'active_member_count_mismatch', expected: 6, actual: activeUsers.length },
      { status: 409 }
    );
  }

  const recordedAt = new Date().toISOString();
  const applied = [];
  for (const user of activeUsers) {
    const existing = await getMembershipActivation(snapshot.accountId, user.id);
    if (existing) {
      applied.push({ zoomUserId: user.id, disposition: 'preserved' });
      continue;
    }
    const result = await upsertMembershipActivation(createBaselineActivation({
      accountId: snapshot.accountId,
      zoomUserId: user.id,
      email: user.email,
      recordedAt
    }));
    applied.push({ zoomUserId: user.id, disposition: result.disposition });
  }

  const manifest = {
    version: 1,
    storyId: 'CRM-012',
    accountId: snapshot.accountId,
    cutoff: '2026-09-28',
    baselineInstant: CRM_012_BASELINE_INSTANT,
    sourceKind: ZOOM_MEMBERSHIP_SOURCE_KINDS.BASELINE,
    snapshotCheckedAt: snapshot.checkedAt,
    zoomUserIds: activeUsers.map(user => user.id),
    runAt: recordedAt
  };
  const manifestResult = await saveBaselineManifest(manifest);

  return Response.json({
    status: 'applied',
    count: applied.filter(row => row.disposition === 'inserted').length,
    preserved: applied.filter(row => row.disposition !== 'inserted').length,
    manifest: manifestResult.disposition
  });
}
