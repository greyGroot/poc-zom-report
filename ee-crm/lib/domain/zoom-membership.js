export const ZOOM_MEMBERSHIP_STATUSES = Object.freeze({
  MEMBER: 'member',
  PENDING: 'pending',
  NOT_INVITED: 'not_invited',
  UNAVAILABLE: 'unavailable'
});

export const ZOOM_MEMBERSHIP_SOURCE_KINDS = Object.freeze({
  INVITATION_ACCEPTED: 'zoom_invitation_accepted',
  BASELINE: 'approved_current_member_baseline'
});

export const CRM_012_BASELINE_INSTANT = '2026-09-28T00:00:00+03:00';
export const CRM_012_BASELINE_ISO = '2026-09-27T21:00:00.000Z';

const MIN_EVENT_TIMESTAMP_MS = Date.UTC(2000, 0, 1);
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function normalizeMappedEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function normalizeEventTimestamp(value, nowMs = Date.now()) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) return null;
  if (numeric < MIN_EVENT_TIMESTAMP_MS || numeric > nowMs + MAX_FUTURE_SKEW_MS) return null;
  const parsed = new Date(numeric);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeSnapshotUser(user, expectedStatus) {
  if (!user || typeof user !== 'object') return null;
  const email = normalizeMappedEmail(user.email);
  const id = user.id === undefined || user.id === null ? '' : String(user.id).trim();
  if (!email || !id) return null;
  return {
    id,
    email,
    status: expectedStatus
  };
}

export function normalizeUsersSnapshot({ accountId, activeUsers = [], pendingUsers = [], checkedAt } = {}) {
  const normalizedAccountId = accountId === undefined || accountId === null
    ? ''
    : String(accountId).trim();
  const normalizedCheckedAt = new Date(checkedAt || Date.now()).toISOString();
  const users = [];

  for (const user of activeUsers) {
    const normalized = normalizeSnapshotUser(user, 'active');
    if (normalized) users.push(normalized);
  }
  for (const user of pendingUsers) {
    const normalized = normalizeSnapshotUser(user, 'pending');
    if (normalized) users.push(normalized);
  }

  return {
    version: 1,
    accountId: normalizedAccountId,
    checkedAt: normalizedCheckedAt,
    complete: true,
    users
  };
}

export function normalizeInvitationAcceptedEvent(body, nowMs = Date.now()) {
  if (!body || body.event !== 'user.invitation_accepted') {
    return { ok: false, reason: 'unsupported_event' };
  }

  const object = body.payload && typeof body.payload.object === 'object'
    ? body.payload.object
    : null;
  const accountId = body.payload?.account_id === undefined || body.payload?.account_id === null
    ? ''
    : String(body.payload.account_id).trim();
  const zoomUserId = object?.id === undefined || object?.id === null
    ? ''
    : String(object.id).trim();
  const email = normalizeMappedEmail(object?.email);
  const acceptedAt = normalizeEventTimestamp(body.event_ts, nowMs);

  if (!accountId) return { ok: false, reason: 'missing_account_id' };
  if (!zoomUserId) return { ok: false, reason: 'missing_zoom_user_id' };
  if (!email) return { ok: false, reason: 'missing_email' };
  if (!acceptedAt) return { ok: false, reason: 'invalid_event_ts' };

  return {
    ok: true,
    value: {
      version: 1,
      accountId,
      zoomUserId,
      email,
      event: 'user.invitation_accepted',
      acceptedAt,
      sourceKind: ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED
    }
  };
}

export function createBaselineActivation({ accountId, zoomUserId, email, recordedAt = new Date().toISOString() }) {
  const normalizedEmail = normalizeMappedEmail(email);
  if (!accountId || !zoomUserId || !normalizedEmail) {
    throw new Error('accountId, zoomUserId, and email are required for the CRM-012 baseline');
  }
  return {
    version: 1,
    accountId: String(accountId),
    zoomUserId: String(zoomUserId),
    email: normalizedEmail,
    event: 'crm-012.current_member_baseline',
    acceptedAt: CRM_012_BASELINE_ISO,
    baselineLocalDate: '2026-09-28',
    sourceKind: ZOOM_MEMBERSHIP_SOURCE_KINDS.BASELINE,
    recordedAt: new Date(recordedAt).toISOString()
  };
}

function unavailableMemberSince() {
  return { state: 'unavailable', value: null, sourceKind: null };
}

function baseMembership({ status, freshness, failureCategory = null, matchedEmail = null, zoomUserId = null }) {
  return {
    status,
    memberSince: unavailableMemberSince(),
    matchedEmail,
    zoomUserId,
    freshness,
    source: {
      status: 'GET /v2/users',
      memberSince: null
    },
    failureCategory
  };
}

export function resolveTeacherMembership({ teacher, snapshotResult, activation = null } = {}) {
  const mappedEmail = normalizeMappedEmail(teacher?.zoomHostEmail || teacher?.email);
  const fallbackFreshness = {
    state: 'unavailable',
    checkedAt: null,
    lastSuccessfulAt: null
  };

  if (!mappedEmail) {
    return baseMembership({
      status: ZOOM_MEMBERSHIP_STATUSES.UNAVAILABLE,
      freshness: snapshotResult?.freshness || fallbackFreshness,
      failureCategory: 'configuration'
    });
  }

  if (!snapshotResult || !snapshotResult.snapshot || snapshotResult.freshness?.state === 'unavailable') {
    return baseMembership({
      status: ZOOM_MEMBERSHIP_STATUSES.UNAVAILABLE,
      freshness: snapshotResult?.freshness || fallbackFreshness,
      failureCategory: snapshotResult?.failureCategory || 'transport'
    });
  }

  const matches = snapshotResult.snapshot.users.filter(user => user.email === mappedEmail);
  const distinctIds = new Set(matches.map(user => user.id));
  if (distinctIds.size > 1) {
    return baseMembership({
      status: ZOOM_MEMBERSHIP_STATUSES.UNAVAILABLE,
      freshness: snapshotResult.freshness,
      failureCategory: 'ambiguous'
    });
  }

  const active = matches.find(user => user.status === 'active');
  const pending = matches.find(user => user.status === 'pending');
  const matched = active || pending || null;

  if (!matched) {
    return baseMembership({
      status: ZOOM_MEMBERSHIP_STATUSES.NOT_INVITED,
      freshness: snapshotResult.freshness
    });
  }

  if (!active) {
    return baseMembership({
      status: ZOOM_MEMBERSHIP_STATUSES.PENDING,
      freshness: snapshotResult.freshness,
      matchedEmail: mappedEmail,
      zoomUserId: matched.id
    });
  }

  const membership = baseMembership({
    status: ZOOM_MEMBERSHIP_STATUSES.MEMBER,
    freshness: snapshotResult.freshness,
    matchedEmail: mappedEmail,
    zoomUserId: active.id
  });

  if (
    activation &&
    activation.zoomUserId === active.id &&
    activation.accountId === snapshotResult.snapshot.accountId &&
    [ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED, ZOOM_MEMBERSHIP_SOURCE_KINDS.BASELINE].includes(activation.sourceKind) &&
    typeof activation.acceptedAt === 'string' &&
    !Number.isNaN(Date.parse(activation.acceptedAt))
  ) {
    membership.memberSince = {
      state: 'available',
      value: new Date(activation.acceptedAt).toISOString(),
      sourceKind: activation.sourceKind
    };
    membership.source.memberSince = activation.sourceKind === ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED
      ? 'user.invitation_accepted:event_ts'
      : 'approved_current_member_baseline:2026-09-28';
  }

  return membership;
}

export function hasMaterialMembershipChange(previous, next) {
  if (!previous || !next) return Boolean(previous !== next);
  return previous.status !== next.status ||
    previous.memberSince?.state !== next.memberSince?.state ||
    previous.memberSince?.value !== next.memberSince?.value ||
    previous.freshness?.state !== next.freshness?.state;
}
