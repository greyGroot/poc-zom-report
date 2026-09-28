import { getRedisClient, InMemoryRedis } from './redis.js';
import { ZOOM_MEMBERSHIP_SOURCE_KINDS } from '../domain/zoom-membership.js';

export const MEMBERSHIP_SNAPSHOT_KEY_PREFIX = 'zoom:membership:snapshot:';
export const MEMBERSHIP_ACTIVATION_KEY_PREFIX = 'zoom:membership:activation:';
export const CRM_012_BASELINE_MANIFEST_KEY_PREFIX = 'zoom:membership:baseline:crm-012:';

function requiredSegment(value, name) {
  const normalized = value === undefined || value === null ? '' : String(value).trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function membershipSnapshotKey(accountId) {
  return `${MEMBERSHIP_SNAPSHOT_KEY_PREFIX}${requiredSegment(accountId, 'accountId')}`;
}

export function membershipActivationKey(accountId, zoomUserId) {
  return `${MEMBERSHIP_ACTIVATION_KEY_PREFIX}${requiredSegment(accountId, 'accountId')}:${requiredSegment(zoomUserId, 'zoomUserId')}`;
}

export function baselineManifestKey(accountId) {
  return `${CRM_012_BASELINE_MANIFEST_KEY_PREFIX}${requiredSegment(accountId, 'accountId')}`;
}

function parseStored(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function saveMembershipSnapshot(snapshot, customClient = null) {
  if (!snapshot?.complete || !snapshot?.accountId || !Array.isArray(snapshot?.users) || !snapshot?.checkedAt) {
    throw new Error('A complete membership snapshot is required');
  }
  const redis = customClient || getRedisClient();
  await redis.set(membershipSnapshotKey(snapshot.accountId), JSON.stringify(snapshot));
  return snapshot;
}

export async function getMembershipSnapshot(accountId, customClient = null) {
  const redis = customClient || getRedisClient();
  const parsed = parseStored(await redis.get(membershipSnapshotKey(accountId)));
  if (!parsed?.complete || !Array.isArray(parsed.users) || !parsed.checkedAt) return null;
  return parsed;
}

function shouldReplaceActivation(existing, incoming) {
  if (!existing) return true;
  if (incoming.sourceKind === ZOOM_MEMBERSHIP_SOURCE_KINDS.BASELINE) return false;
  if (incoming.sourceKind !== ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED) return false;
  if (existing.sourceKind !== ZOOM_MEMBERSHIP_SOURCE_KINDS.INVITATION_ACCEPTED) return true;
  return Date.parse(incoming.acceptedAt) > Date.parse(existing.acceptedAt);
}

const UPSERT_ACTIVATION_LUA = `
local current = redis.call('GET', KEYS[1])
local incoming = cjson.decode(ARGV[1])
if not current then
  redis.call('SET', KEYS[1], ARGV[1])
  return 'inserted'
end
local existing = cjson.decode(current)
if incoming.sourceKind == 'approved_current_member_baseline' then
  return 'preserved'
end
if incoming.sourceKind ~= 'zoom_invitation_accepted' then
  return 'preserved'
end
if existing.sourceKind ~= 'zoom_invitation_accepted' or incoming.acceptedAt > existing.acceptedAt then
  redis.call('SET', KEYS[1], ARGV[1])
  return 'updated'
end
return 'preserved'
`;

export async function upsertMembershipActivation(activation, customClient = null) {
  if (!activation?.accountId || !activation?.zoomUserId || !activation?.acceptedAt || !activation?.sourceKind) {
    throw new Error('A valid membership activation is required');
  }
  if (Number.isNaN(Date.parse(activation.acceptedAt))) {
    throw new Error('Membership activation acceptedAt must be a valid timestamp');
  }

  const redis = customClient || getRedisClient();
  const key = membershipActivationKey(activation.accountId, activation.zoomUserId);
  const serialized = JSON.stringify(activation);

  if (!(redis instanceof InMemoryRedis) && typeof redis.eval === 'function') {
    const disposition = await redis.eval(UPSERT_ACTIVATION_LUA, [key], [serialized]);
    return { disposition: String(disposition), activation: await getMembershipActivation(activation.accountId, activation.zoomUserId, redis) };
  }

  const existing = parseStored(await redis.get(key));
  if (!shouldReplaceActivation(existing, activation)) {
    return { disposition: 'preserved', activation: existing };
  }
  await redis.set(key, serialized);
  return { disposition: existing ? 'updated' : 'inserted', activation };
}

export async function getMembershipActivation(accountId, zoomUserId, customClient = null) {
  const redis = customClient || getRedisClient();
  return parseStored(await redis.get(membershipActivationKey(accountId, zoomUserId)));
}

export async function saveBaselineManifest(manifest, customClient = null) {
  if (!manifest?.accountId || !manifest?.cutoff || !Array.isArray(manifest?.zoomUserIds)) {
    throw new Error('A valid CRM-012 baseline manifest is required');
  }
  const redis = customClient || getRedisClient();
  const key = baselineManifestKey(manifest.accountId);
  const result = await redis.set(key, JSON.stringify(manifest), { nx: true });
  if (result === null) {
    return { disposition: 'preserved', manifest: await getBaselineManifest(manifest.accountId, redis) };
  }
  return { disposition: 'inserted', manifest };
}

export async function getBaselineManifest(accountId, customClient = null) {
  const redis = customClient || getRedisClient();
  return parseStored(await redis.get(baselineManifestKey(accountId)));
}
