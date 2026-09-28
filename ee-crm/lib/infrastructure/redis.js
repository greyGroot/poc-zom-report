// ee-crm/lib/redis.js
// Pure ESM Upstash Redis persistence layer for Empire English CRM
// Enforces strict persistence mode policy and fail-fast durability.

import { Redis } from '@upstash/redis';
import { toSafeOccurrenceId, deriveFactFingerprint } from '../domain/zoom-occurrence.js';

export const OCCURRENCE_KEY_PREFIX = 'zoom:occurrence:';
export const HOST_OCCURRENCES_KEY_PREFIX = 'zoom:host:occurrences:';
export const OCCURRENCE_EVENTS_KEY_PREFIX = 'zoom:occurrence:events:';
export const MIGRATION_STATE_KEY = 'zoom:migrations:crm-003';
export const CRM_005_MIGRATION_STATE_KEY = 'zoom:migrations:crm-005';

/**
 * Deep clone helper for in-memory isolation.
 * Prevents caller mutation from leaking into InMemoryRedis store.
 */
function cloneDeep(val) {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  try {
    return structuredClone(val);
  } catch {
    return JSON.parse(JSON.stringify(val));
  }
}

/**
 * In-memory Redis mock implementation supporting key-value, Hashes, Lists, and Sorted Sets (ZSET).
 * Used strictly during local development and automated testing when explicitly allowed.
 */
export class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.zsets = new Map();
    this.lists = new Map();
    this.hashes = new Map();
  }

  async ping() {
    return 'PONG';
  }

  async hset(key, fieldOrObj, val) {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
      for (const [f, v] of Object.entries(fieldOrObj)) {
        hash.set(String(f), cloneDeep(v));
      }
      return Object.keys(fieldOrObj).length;
    }
    const isNew = !hash.has(String(fieldOrObj));
    hash.set(String(fieldOrObj), cloneDeep(val));
    return isNew ? 1 : 0;
  }

  async hsetnx(key, field, val) {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const fStr = String(field);
    if (hash.has(fStr)) return 0;
    hash.set(fStr, cloneDeep(val));
    return 1;
  }

  async hget(key, field) {
    const hash = this.hashes.get(key);
    if (!hash || !hash.has(String(field))) return null;
    return cloneDeep(hash.get(String(field)));
  }

  async hdel(key, ...fields) {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let count = 0;
    for (const f of fields.flat()) {
      if (hash.delete(String(f))) count++;
    }
    return count;
  }

  async hgetall(key) {
    const hash = this.hashes.get(key);
    if (!hash || hash.size === 0) return {};
    const res = {};
    for (const [f, v] of hash.entries()) {
      res[f] = cloneDeep(v);
    }
    return res;
  }

  async hlen(key) {
    const hash = this.hashes.get(key);
    return hash ? hash.size : 0;
  }

  async hkeys(key) {
    const hash = this.hashes.get(key);
    return hash ? Array.from(hash.keys()) : [];
  }

  async scan(cursor = 0, options = {}) {
    const allKeys = Array.from(new Set([
      ...this.store.keys(),
      ...this.zsets.keys(),
      ...this.lists.keys(),
      ...this.hashes.keys()
    ]));
    let matched = allKeys;
    if (options.match && options.match !== '*') {
      const regex = new RegExp('^' + options.match.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      matched = matched.filter(k => regex.test(k));
    }
    return ['0', cloneDeep(matched)];
  }

  pipeline() {
    const operations = [];
    const proxy = {
      set: (k, v, opts) => { operations.push(() => this.set(k, v, opts)); return proxy; },
      get: (k) => { operations.push(() => this.get(k)); return proxy; },
      zadd: (k, ...args) => { operations.push(() => this.zadd(k, ...args)); return proxy; },
      hset: (k, f, v) => { operations.push(() => this.hset(k, f, v)); return proxy; },
      del: (...args) => { operations.push(() => this.del(...args)); return proxy; },
      exec: async () => {
        const results = [];
        for (const op of operations) {
          results.push(await op());
        }
        return results;
      }
    };
    return proxy;
  }

  async lpush(key, ...values) {
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    for (const val of values.flat()) {
      list.unshift(cloneDeep(val));
    }
    return list.length;
  }

  async rpush(key, ...values) {
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    for (const val of values.flat()) {
      list.push(cloneDeep(val));
    }
    return list.length;
  }

  async lrange(key, start = 0, stop = -1) {
    const list = this.lists.get(key) || [];
    const len = list.length;
    let s = Number(start);
    let e = Number(stop);
    if (s < 0) s = Math.max(0, len + s);
    if (e < 0) e = Math.max(0, len + e);
    const sliced = list.slice(s, e + 1);
    return cloneDeep(sliced);
  }

  async ltrim(key, start, stop) {
    const list = this.lists.get(key) || [];
    const len = list.length;
    let s = Number(start);
    let e = Number(stop);
    if (s < 0) s = Math.max(0, len + s);
    if (e < 0) e = Math.max(0, len + e);
    const trimmed = list.slice(s, e + 1);
    this.lists.set(key, trimmed);
    return 'OK';
  }

  async get(key) {
    const val = this.store.get(key);
    if (val === undefined) return null;
    return cloneDeep(val);
  }

  async set(key, value, options = {}) {
    if ((options?.nx || options?.NX) && this.store.has(key)) {
      return null;
    }
    this.store.set(key, cloneDeep(value));
    return 'OK';
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys.flat()) {
      if (this.store.delete(key)) count++;
      if (this.zsets.delete(key)) count++;
      if (this.lists.delete(key)) count++;
      if (this.hashes.delete(key)) count++;
    }
    return count;
  }

  async mget(...keys) {
    const flatKeys = keys.flat();
    return flatKeys.map(k => {
      const v = this.store.get(k);
      return v === undefined ? null : cloneDeep(v);
    });
  }

  async keys(pattern = '*') {
    const allKeys = Array.from(new Set([
      ...this.store.keys(),
      ...this.zsets.keys(),
      ...this.lists.keys(),
      ...this.hashes.keys()
    ]));
    if (pattern === '*' || !pattern) return allKeys;
    const regexPattern = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    const reg = new RegExp(regexPattern);
    return allKeys.filter(k => reg.test(k));
  }

  async zadd(key, ...args) {
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }

    let addedCount = 0;
    const items = [];

    if (typeof args[0] === 'number' && args.length >= 2) {
      // Positional: zadd(key, score, member)
      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 < args.length) {
          items.push({ score: Number(args[i]), member: String(args[i + 1]) });
        }
      }
    } else {
      const flattened = args.flat();
      for (const item of flattened) {
        if (item && typeof item === 'object' && 'score' in item && 'member' in item) {
          items.push({ score: Number(item.score), member: String(item.member) });
        }
      }
    }

    for (const { score, member } of items) {
      if (!zset.has(member)) {
        addedCount++;
      }
      zset.set(member, score);
    }
    return addedCount;
  }

  async zcard(key) {
    const zset = this.zsets.get(key);
    return zset ? zset.size : 0;
  }

  async zscore(key, member) {
    const zset = this.zsets.get(key);
    if (!zset || !zset.has(String(member))) return null;
    return zset.get(String(member));
  }

  async zrem(key, ...members) {
    const zset = this.zsets.get(key);
    if (!zset) return 0;
    let count = 0;
    for (const member of members.flat()) {
      if (zset.delete(String(member))) {
        count++;
      }
    }
    return count;
  }

  async zrange(key, min, max, options = {}) {
    const zset = this.zsets.get(key);
    if (!zset || zset.size === 0) return [];

    if (options.byScore) {
      return this.zrangebyscore(key, min, max, options);
    }

    // Default: index-based range [start, stop]
    let entries = Array.from(zset.entries()).map(([member, score]) => ({ member, score }));
    entries.sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));

    if (options.rev) {
      entries.reverse();
    }

    const len = entries.length;
    let start = Number(min);
    let stop = Number(max);

    if (start < 0) start = Math.max(0, len + start);
    if (stop < 0) stop = len + stop;
    if (start > len - 1 || start > stop) return [];
    stop = Math.min(len - 1, stop);

    const sliced = entries.slice(start, stop + 1);
    if (options.withScores) {
      return sliced.map(e => ({ member: e.member, score: e.score }));
    }
    return sliced.map(e => e.member);
  }

  async zrangebyscore(key, min, max, options = {}) {
    const zset = this.zsets.get(key);
    if (!zset || zset.size === 0) return [];

    const parseBound = (b) => {
      if (b === '-inf' || b === '-infinity' || b === undefined || b === null) {
        return { val: -Infinity, exclusive: false };
      }
      if (b === '+inf' || b === '+infinity') {
        return { val: Infinity, exclusive: false };
      }
      const str = String(b).trim();
      if (str.startsWith('(')) {
        return { val: Number(str.slice(1)), exclusive: true };
      }
      return { val: Number(str), exclusive: false };
    };

    const boundA = parseBound(min);
    const boundB = parseBound(max);
    const lowerBound = boundA.val <= boundB.val ? boundA : boundB;
    const upperBound = boundA.val >= boundB.val ? boundA : boundB;

    let entries = Array.from(zset.entries()).map(([member, score]) => ({ member, score }));

    entries = entries.filter(e => {
      const matchMin = lowerBound.exclusive ? e.score > lowerBound.val : e.score >= lowerBound.val;
      const matchMax = upperBound.exclusive ? e.score < upperBound.val : e.score <= upperBound.val;
      return matchMin && matchMax;
    });

    entries.sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));

    if (options.rev) {
      entries.reverse();
    }

    let offset = options.offset;
    let count = options.count;
    if (options.limit) {
      offset = options.limit.offset ?? offset;
      count = options.limit.count ?? count;
    }
    offset = Number(offset) || 0;

    if (offset > 0) {
      entries = entries.slice(offset);
    }
    if (count !== undefined && count !== null) {
      const c = Number(count);
      if (c >= 0) {
        entries = entries.slice(0, c);
      }
    }

    if (options.withScores) {
      return entries.map(e => ({ member: e.member, score: e.score }));
    }
    return entries.map(e => e.member);
  }

  async flushdb() {
    this.store.clear();
    this.zsets.clear();
    this.lists.clear();
    this.hashes.clear();
    return 'OK';
  }

  async flushall() {
    return this.flushdb();
  }
}

let currentClient = null;
let isMock = false;

/**
 * Resolves the required persistence mode based on environment variables.
 * Enforces production invariants: production cannot use in-memory fallbacks or explicit mock flags.
 * @param {object} [env=process.env]
 * @returns {'upstash_cloud' | 'in_memory'}
 */
export function resolvePersistenceMode(env = process.env) {
  const nodeEnv = env.NODE_ENV;
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  const hasUrl = Boolean(url);
  const hasToken = Boolean(token);
  const hasCreds = hasUrl && hasToken;
  const hasPartialCreds = (hasUrl && !hasToken) || (!hasUrl && hasToken);
  const useInMemoryFlag = env.USE_IN_MEMORY_REDIS === 'true';

  if (hasPartialCreds) {
    throw new Error('Partial Redis configuration: both URL and Token must be provided');
  }

  if (nodeEnv === 'production') {
    if (useInMemoryFlag) {
      throw new Error('Invalid configuration: USE_IN_MEMORY_REDIS is forbidden in production');
    }
    if (!hasCreds) {
      throw new Error('Production environment requires valid Upstash/Vercel KV Redis credentials');
    }
    return 'upstash_cloud';
  }

  if (nodeEnv === 'test') {
    if (useInMemoryFlag || !hasCreds) {
      return 'in_memory';
    }
    return 'upstash_cloud';
  }

  if (nodeEnv === 'development') {
    if (useInMemoryFlag) {
      return 'in_memory';
    }
    if (hasCreds) {
      return 'upstash_cloud';
    }
    return 'in_memory';
  }

  // Any other environment
  if (useInMemoryFlag) {
    return 'in_memory';
  }
  if (hasCreds) {
    return 'upstash_cloud';
  }

  throw new Error('Redis credentials required when USE_IN_MEMORY_REDIS is not set');
}

/**
 * Returns the active Redis client instance (real Upstash Redis or InMemoryRedis).
 * Throws when production configuration is invalid or client construction fails.
 * @param {{ forceMock?: boolean }} [options]
 */
export function getRedisClient(options = {}) {
  if (options.forceMock) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('forceMock is forbidden in production');
    }
    if (!currentClient || !isMock) {
      currentClient = new InMemoryRedis();
      isMock = true;
    }
    return currentClient;
  }

  if (currentClient) {
    return currentClient;
  }

  const mode = resolvePersistenceMode(process.env);

  if (mode === 'in_memory') {
    currentClient = new InMemoryRedis();
    isMock = true;
    return currentClient;
  }

  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL).trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN).trim();

  const client = new Redis({ url, token });
  if (typeof client.zrangebyscore !== 'function') {
    client.zrangebyscore = function(key, min, max, opts = {}) {
      return client.zrange(key, min, max, { ...opts, byScore: true });
    };
  }

  currentClient = client;
  isMock = false;
  return currentClient;
}

/**
 * Set or override the active Redis client instance (e.g. in tests).
 */
export function setRedisClient(client) {
  currentClient = client;
  isMock = client instanceof InMemoryRedis;
}

/**
 * Reset singleton client instance (clears current client).
 */
export function resetRedisClient() {
  currentClient = null;
  isMock = false;
}

/**
 * Checks if current client is using the in-memory mock.
 */
export function isMockClient() {
  return isMock;
}

/**
 * Check Redis health status via read-only ping.
 * @returns {Promise<{ ok: boolean, connected: boolean, configured: boolean, mode: string, error?: string }>}
 */
export async function checkRedisHealth() {
  try {
    if (currentClient) {
      if (isMock) {
        return { ok: true, connected: true, configured: false, mode: 'in_memory' };
      }
      const res = await currentClient.ping();
      if (res === 'PONG' || res) {
        return { ok: true, connected: true, configured: true, mode: 'upstash_cloud' };
      }
      return { ok: false, connected: false, configured: true, mode: 'unavailable', error: 'PING_FAILED' };
    }

    const mode = resolvePersistenceMode(process.env);
    if (mode === 'in_memory') {
      return { ok: true, connected: true, configured: false, mode: 'in_memory' };
    }

    const client = getRedisClient();
    const res = await client.ping();
    if (res === 'PONG' || res) {
      return { ok: true, connected: true, configured: true, mode: 'upstash_cloud' };
    }
    return { ok: false, connected: false, configured: true, mode: 'unavailable', error: 'PING_FAILED' };
  } catch (err) {
    const isConfigured = Boolean(
      (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
    );
    return {
      ok: false,
      connected: false,
      configured: isConfigured,
      mode: 'unavailable',
      error: 'REDIS_CONNECTION_FAILED'
    };
  }
}

/**
 * Save an immutable occurrence event fact under zoom:occurrence:events:{safeId}.
 * Keyed by deterministic fact fingerprint to ensure idempotent storage.
 * @param {string} safeId
 * @param {object} fact
 * @param {object} [customClient]
 * @returns {Promise<string>} Fact fingerprint
 */
export async function saveOccurrenceFact(safeId, fact, customClient = null) {
  if (!safeId || !fact) {
    throw new Error('safeId and fact are required to save occurrence fact');
  }
  const redis = customClient || getRedisClient();
  const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;
  const fingerprint = deriveFactFingerprint(fact);

  if (typeof redis.hset === 'function') {
    await redis.hset(factKey, {
      [fingerprint]: typeof fact === 'string' ? fact : JSON.stringify(fact)
    });
  } else {
    const existing = (await redis.get(factKey)) || {};
    const map = typeof existing === 'string' ? JSON.parse(existing) : existing;
    map[fingerprint] = fact;
    await redis.set(factKey, map);
  }

  return fingerprint;
}

/**
 * Retrieve all occurrence event facts for a given safeId.
 * @param {string} safeId
 * @param {object} [customClient]
 * @returns {Promise<Array<object>>}
 */
export async function getOccurrenceFacts(safeId, customClient = null) {
  if (!safeId) return [];
  const redis = customClient || getRedisClient();
  const factKey = `${OCCURRENCE_EVENTS_KEY_PREFIX}${safeId}`;

  if (typeof redis.hgetall === 'function') {
    const rawMap = await redis.hgetall(factKey);
    if (!rawMap || typeof rawMap !== 'object') return [];
    const facts = [];
    for (const val of Object.values(rawMap)) {
      try {
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (parsed && typeof parsed === 'object' && parsed.type) facts.push(parsed);
      } catch {
        // Ignore unparseable entries
      }
    }
    return facts;
  }

  const raw = await redis.get(factKey);
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Object.values(parsed);
}

/**
 * Atomically publish an occurrence projection and maintain the host sorted set index.
 * Enforces monotonic revision: will not overwrite an existing record that has a higher revision.
 * @param {string} safeId
 * @param {object} occurrence
 * @param {string} [hostEmail]
 * @param {number} [score]
 * @param {object} [customClient]
 * @returns {Promise<object>}
 */
export async function publishOccurrenceProjection(safeId, occurrence, hostEmail, score, customClient = null) {
  if (!safeId || !occurrence) {
    throw new Error('safeId and occurrence are required for publication');
  }
  const redis = customClient || getRedisClient();
  const occKey = `${OCCURRENCE_KEY_PREFIX}${safeId}`;

  // Read existing occurrence to verify revision monotonicity
  const existingRaw = await redis.get(occKey);
  if (existingRaw) {
    const existing = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw;
    if (
      existing &&
      typeof existing.revision === 'number' &&
      typeof occurrence.revision === 'number' &&
      existing.revision > occurrence.revision
    ) {
      // Stale reducer projection: ignore overwrite
      return existing;
    }
  }

  await redis.set(occKey, occurrence);

  const effectiveHost = hostEmail || occurrence.host_email;
  if (effectiveHost) {
    const normEmail = String(effectiveHost).toLowerCase().trim();
    const hostKey = `${HOST_OCCURRENCES_KEY_PREFIX}${normEmail}`;

    let zScore = Date.now();
    if (score !== undefined && score !== null && !Number.isNaN(Number(score))) {
      zScore = Number(score);
    } else if (occurrence.start_time) {
      const parsed = Date.parse(occurrence.start_time);
      if (!Number.isNaN(parsed)) zScore = parsed;
    }

    await redis.zadd(hostKey, { score: zScore, member: safeId });
  }

  return occurrence;
}

/**
 * Retrieve occurrence by exact UUID or safeId.
 * @param {string} uuidOrSafeId
 * @param {object} [customClient]
 * @returns {Promise<object|null>}
 */
export async function getZoomOccurrence(uuidOrSafeId, customClient = null) {
  if (!uuidOrSafeId) return null;
  const redis = customClient || getRedisClient();
  const safeId = toSafeOccurrenceId(uuidOrSafeId);

  let raw = await redis.get(`${OCCURRENCE_KEY_PREFIX}${safeId}`);
  if (!raw && safeId !== uuidOrSafeId) {
    raw = await redis.get(`${OCCURRENCE_KEY_PREFIX}${uuidOrSafeId}`);
  }
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Get the current migration state from target Redis.
 * @param {object} [customClient]
 * @returns {Promise<object|null>}
 */
export async function getMigrationState(customClient = null) {
  const redis = customClient || getRedisClient();
  const raw = await redis.get(MIGRATION_STATE_KEY);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Set or update the migration state in target Redis.
 * @param {object} state
 * @param {object} [customClient]
 * @returns {Promise<object>}
 */
export async function setMigrationState(state, customClient = null) {
  const redis = customClient || getRedisClient();
  await redis.set(MIGRATION_STATE_KEY, state);
  return state;
}

/**
 * Get the current CRM-005 migration state from target Redis.
 * @param {object} [customClient]
 * @returns {Promise<object|null>}
 */
export async function getCrm005MigrationState(customClient = null) {
  const redis = customClient || getRedisClient();
  const raw = await redis.get(CRM_005_MIGRATION_STATE_KEY);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Set or update the CRM-005 migration state in target Redis.
 * @param {object} state
 * @param {object} [customClient]
 * @returns {Promise<object>}
 */
export async function setCrm005MigrationState(state, customClient = null) {
  const redis = customClient || getRedisClient();
  await redis.set(CRM_005_MIGRATION_STATE_KEY, state);
  return state;
}
