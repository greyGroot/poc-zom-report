import { getZoomUsersSnapshot, ZoomSourceError } from '../infrastructure/zoom.js';
import {
  getMembershipSnapshot as getStoredMembershipSnapshot,
  saveMembershipSnapshot,
  getMembershipActivation
} from '../infrastructure/zoom-membership-store.js';
import { resolveTeacherMembership, normalizeMappedEmail } from '../domain/zoom-membership.js';
import { logger } from '../infrastructure/logger.js';

export const ZOOM_MEMBERSHIP_STALE_MAX_MS = 24 * 60 * 60 * 1000;

function safeLog(level, action, message, details = {}) {
  const fn = logger[level];
  if (typeof fn !== 'function') return;
  Promise.resolve(fn.call(logger, action, message, details)).catch(() => {});
}

function unavailableSnapshotResult({ nowIso, failureCategory, lastSuccessfulAt = null }) {
  return {
    snapshot: null,
    freshness: {
      state: 'unavailable',
      checkedAt: nowIso,
      lastSuccessfulAt
    },
    failureCategory
  };
}

export async function getZoomMembershipSnapshot(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const staleMaxMs = options.staleMaxMs ?? ZOOM_MEMBERSHIP_STALE_MAX_MS;
  const zoomOptions = { ...(options.zoomOptions || {}), nowMs };
  const accountId = zoomOptions.accountId || process.env.ZOOM_ACCOUNT_ID || '';
  const fetchSnapshot = options.fetchSnapshot || getZoomUsersSnapshot;
  const saveSnapshot = options.saveSnapshot || saveMembershipSnapshot;
  const loadSnapshot = options.loadSnapshot || getStoredMembershipSnapshot;

  try {
    const snapshot = await fetchSnapshot(zoomOptions);
    await saveSnapshot(snapshot, options.redisClient || null);
    safeLog('info', 'ZOOM_MEMBERSHIP_SNAPSHOT_SUCCESS', 'Zoom membership snapshot refreshed', {
      checkedAt: snapshot.checkedAt,
      activeCount: snapshot.users.filter(user => user.status === 'active').length,
      pendingCount: snapshot.users.filter(user => user.status === 'pending').length
    });
    return {
      snapshot,
      freshness: {
        state: 'fresh',
        checkedAt: snapshot.checkedAt,
        lastSuccessfulAt: snapshot.checkedAt
      },
      failureCategory: null
    };
  } catch (error) {
    const failureCategory = error instanceof ZoomSourceError
      ? error.category
      : (error?.category || 'transport');
    let stored = null;
    if (accountId) {
      try {
        stored = await loadSnapshot(accountId, options.redisClient || null);
      } catch {
        stored = null;
      }
    }

    if (stored?.checkedAt) {
      const ageMs = nowMs - Date.parse(stored.checkedAt);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= staleMaxMs) {
        safeLog('warn', 'ZOOM_MEMBERSHIP_STALE_FALLBACK', 'Using last successful Zoom membership snapshot', {
          failureCategory,
          lastSuccessfulAt: stored.checkedAt
        });
        return {
          snapshot: stored,
          freshness: {
            state: 'stale',
            checkedAt: nowIso,
            lastSuccessfulAt: stored.checkedAt
          },
          failureCategory
        };
      }
      return unavailableSnapshotResult({
        nowIso,
        failureCategory,
        lastSuccessfulAt: stored.checkedAt
      });
    }

    safeLog('warn', 'ZOOM_MEMBERSHIP_UNAVAILABLE', 'Zoom membership lookup unavailable without fallback', {
      failureCategory
    });
    return unavailableSnapshotResult({ nowIso, failureCategory });
  }
}

async function resolveWithActivation(teacher, snapshotResult, options, activationCache) {
  const mappedEmail = normalizeMappedEmail(teacher?.zoomHostEmail || teacher?.email);
  let activation = null;
  if (snapshotResult?.snapshot && mappedEmail) {
    const matchingActive = snapshotResult.snapshot.users.filter(
      user => user.email === mappedEmail && user.status === 'active'
    );
    const distinctIds = [...new Set(matchingActive.map(user => user.id))];
    if (distinctIds.length === 1) {
      const zoomUserId = distinctIds[0];
      if (!activationCache.has(zoomUserId)) {
        const loadActivation = options.loadActivation || getMembershipActivation;
        activationCache.set(
          zoomUserId,
          Promise.resolve(loadActivation(
            snapshotResult.snapshot.accountId,
            zoomUserId,
            options.redisClient || null
          )).catch(() => null)
        );
      }
      activation = await activationCache.get(zoomUserId);
    }
  }
  return resolveTeacherMembership({ teacher, snapshotResult, activation });
}

export async function enrichTeachersWithZoomMembership(teachers, options = {}) {
  const list = Array.isArray(teachers) ? teachers : [];
  const snapshotResult = options.snapshotResult || await getZoomMembershipSnapshot(options);
  const activationCache = new Map();
  return Promise.all(list.map(async teacher => {
    const zoomMembership = await resolveWithActivation(teacher, snapshotResult, options, activationCache);
    return {
      ...teacher,
      zoomMembership,
      zoomStatus: zoomMembership.status
    };
  }));
}

export async function enrichTeacherWithZoomMembership(teacher, options = {}) {
  if (!teacher) return teacher;
  const [enriched] = await enrichTeachersWithZoomMembership([teacher], options);
  return enriched;
}
