// api/lib/redis.js
// Pure ESM Upstash Redis persistence layer with in-memory fallback for poc-zoom-report

import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from '@upstash/redis';

import { toSafeOccurrenceId, deriveFactFingerprint } from './zoom-occurrence.js';

export const MEETING_KEY_PREFIX = 'zoom:meeting:';
export const MEETINGS_INDEX_KEY = 'zoom:meetings:index';
export const WEBHOOK_LOGS_KEY = 'zoom:webhook:logs';
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
 * In-memory asynchronous lock map per meetingId.
 * Serializes concurrent read-modify-write and delete operations on the same meeting.
 */
const meetingLocks = new Map();
const lockStorage = new AsyncLocalStorage();

/**
 * Execute an asynchronous operation with exclusive lock per meetingId.
 * Ensures sequential execution of concurrent operations on the same meeting.
 * Supports re-entrancy within the same asynchronous call chain.
 * @param {string|number} meetingId
 * @param {Function} fn
 * @returns {Promise<any>}
 */
export function withMeetingLock(meetingId, fn) {
  const idStr = String(meetingId);
  const currentLocks = lockStorage.getStore();
  if (currentLocks && currentLocks.has(idStr)) {
    return fn();
  }

  const prevPromise = meetingLocks.get(idStr) || Promise.resolve();

  let release;
  const gate = new Promise(resolve => { release = resolve; });

  const cleanup = () => {
    release();
    if (meetingLocks.get(idStr) === gate) {
      meetingLocks.delete(idStr);
    }
  };

  meetingLocks.set(idStr, gate);

  return prevPromise
    .catch(() => {}) // Prevent previous operation errors from blocking subsequent ones
    .then(() => {
      const active = new Set(currentLocks || []);
      active.add(idStr);
      return lockStorage.run(active, fn);
    })
    .finally(cleanup);
}

/**
 * Deep merge participant structures, supporting both Array and Object map formats.
 * Matches participant items by email, user_id, or name.
 * @param {Array|object} existingParticipants
 * @param {Array|object} newParticipants
 * @returns {Array|object}
 */
export function mergeParticipants(existingParticipants, newParticipants) {
  if (newParticipants === undefined || newParticipants === null) {
    return existingParticipants;
  }
  if (existingParticipants === undefined || existingParticipants === null) {
    return newParticipants;
  }

  const matches = (a, b, keyA, keyB) => {
    if (!a || !b) return false;
    const emailA = (a.email || (keyA && keyA.includes('@') ? keyA : '') || '').toLowerCase().trim();
    const emailB = (b.email || (keyB && keyB.includes('@') ? keyB : '') || '').toLowerCase().trim();
    if (emailA && emailB && emailA === emailB) return true;

    const idA = String(a.user_id || a.userId || a.id || '');
    const idB = String(b.user_id || b.userId || b.id || '');
    if (idA && idB && idA === idB) return true;

    const nameA = (a.name || a.user_name || '').toLowerCase().trim();
    const nameB = (b.name || b.user_name || '').toLowerCase().trim();
    if (nameA && nameB && nameA === nameB) return true;

    return false;
  };

  // Case 1: Existing participants is an Array
  if (Array.isArray(existingParticipants)) {
    const result = [...existingParticipants];
    const incomingList = Array.isArray(newParticipants)
      ? newParticipants
      : Object.entries(newParticipants).map(([k, v]) => ({
          email: k.includes('@') ? k : undefined,
          ...(typeof v === 'object' && v !== null ? v : { val: v })
        }));

    for (const item of incomingList) {
      if (!item || typeof item !== 'object') continue;
      const idx = result.findIndex(p => matches(p, item));
      if (idx !== -1) {
        result[idx] = { ...result[idx], ...item };
      } else {
        result.push({ ...item });
      }
    }
    return result;
  }

  // Case 2: Existing participants is an Object map
  if (typeof existingParticipants === 'object') {
    const result = { ...existingParticipants };

    if (Array.isArray(newParticipants)) {
      for (const item of newParticipants) {
        if (!item || typeof item !== 'object') continue;
        let foundKey = null;
        for (const [key, existingItem] of Object.entries(result)) {
          if (matches(existingItem, item, key)) {
            foundKey = key;
            break;
          }
        }
        if (foundKey) {
          result[foundKey] = { ...result[foundKey], ...item };
        } else {
          const key = item.email || (item.user_id ? String(item.user_id) : null) || item.name || `participant_${Object.keys(result).length}`;
          result[key] = { ...item };
        }
      }
      return result;
    }

    if (typeof newParticipants === 'object') {
      for (const [key, item] of Object.entries(newParticipants)) {
        if (result[key] && typeof result[key] === 'object' && typeof item === 'object' && item !== null) {
          result[key] = { ...result[key], ...item };
        } else {
          result[key] = item;
        }
      }
      return result;
    }
  }

  return newParticipants;
}

/**
 * Compute the UTC offset string for Europe/Kyiv on a given date (YYYY-MM-DD).
 * Europe/Kyiv observes EET (UTC+2) in winter and EEST (UTC+3) in summer.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string} e.g. '+02:00' or '+03:00'
 */
export function getKyivOffset(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const approx = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kyiv',
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(approx);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+03:00';
    const match = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const mins = (match[3] || '00').padStart(2, '0');
      return `${sign}${hours}:${mins}`;
    }
  } catch {
    // Fallback if timezone data is unavailable
  }
  return '+03:00';
}

/**
 * In-memory Redis mock implementation supporting key-value and Sorted Set (ZSET) commands.
 * Used during local development and automated testing when remote Upstash credentials are not configured.
 */
export class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.zsets = new Map();
    this.lists = new Map();
    this.hashes = new Map();
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
      set: (k, v) => { operations.push(() => this.set(k, v)); return proxy; },
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

  async set(key, value) {
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
    const allKeys = Array.from(new Set([...this.store.keys(), ...this.zsets.keys()]));
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
    // Sort by score ascending, ties by member
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
    // Normalize bounds to handle both [min, max] and Redis-standard REV [max, min]
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
 * Returns the active Redis client instance (real Upstash Redis or InMemoryRedis fallback).
 * @param {{ forceMock?: boolean }} [options]
 */
export function getRedisClient(options = {}) {
  if (options.forceMock) {
    if (!currentClient || !isMock) {
      currentClient = new InMemoryRedis();
      isMock = true;
    }
    return currentClient;
  }

  if (currentClient) {
    return currentClient;
  }

  // Support Vercel KV (automatically provisioned by Vercel) and standalone Upstash Redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const isTest = process.env.NODE_ENV === 'test' || process.env.USE_IN_MEMORY_REDIS === 'true';

  if ((!url || !token) && !isTest) {
    try {
      if (typeof Redis.fromEnv === 'function') {
        const envClient = Redis.fromEnv();
        if (envClient) {
          currentClient = envClient;
          isMock = false;
          return currentClient;
        }
      }
    } catch {
      // ignore and fall back to in-memory
    }
  }

  if (!url || !token || isTest) {
    currentClient = new InMemoryRedis();
    isMock = true;
    return currentClient;
  }

  try {
    const client = new Redis({ url, token });
    // Polyfill zrangebyscore if not natively present in this @upstash/redis version
    if (typeof client.zrangebyscore !== 'function') {
      client.zrangebyscore = function(key, min, max, opts = {}) {
        return client.zrange(key, min, max, { ...opts, byScore: true });
      };
    }
    currentClient = client;
    isMock = false;
    return currentClient;
  } catch (err) {
    console.warn(`[Redis] Failed to initialize Upstash/Vercel KV client (${err.message}). Falling back to InMemoryRedis.`);
    currentClient = new InMemoryRedis();
    isMock = true;
    return currentClient;
  }
}

/**
 * Set or override the active Redis client instance (e.g. in tests).
 */
export function setRedisClient(client) {
  currentClient = client;
  isMock = client instanceof InMemoryRedis;
}

/**
 * Reset singleton client instance (clears current client and active locks).
 */
export function resetRedisClient() {
  currentClient = null;
  isMock = false;
  meetingLocks.clear();
}

/**
 * Checks if current client is using the in-memory mock.
 */
export function isMockClient() {
  return isMock;
}

/**
 * Store or update a meeting record in Redis and maintain the sorted set index.
 * Sequential execution per meetingId is enforced via withMeetingLock.
 * @param {string|number} meetingId
 * @param {object} data
 * @param {{ merge?: boolean }} [options]
 * @returns {Promise<object>} The stored meeting record
 */
export async function saveMeeting(meetingId, data, options = {}) {
  if (meetingId === null || meetingId === undefined || meetingId === '') {
    throw new Error('meetingId is required to save meeting');
  }
  const idStr = String(meetingId);

  return withMeetingLock(idStr, async () => {
    const redis = getRedisClient();
    const key = `${MEETING_KEY_PREFIX}${idStr}`;
    const safeData = (data && typeof data === 'object') ? data : {};

    let recordToSave = safeData;
    if (options.merge) {
      const existing = await getMeeting(idStr);
      if (existing && typeof existing === 'object') {
        recordToSave = {
          ...existing,
          ...safeData,
          participants: mergeParticipants(existing.participants, safeData.participants)
        };
      }
    }

    const normalized = {
      ...recordToSave,
      meeting_id: recordToSave.meeting_id !== undefined ? recordToSave.meeting_id : (recordToSave.meetingId !== undefined ? recordToSave.meetingId : idStr),
      meetingId: recordToSave.meetingId !== undefined ? recordToSave.meetingId : (recordToSave.meeting_id !== undefined ? recordToSave.meeting_id : idStr),
      updated_at: recordToSave.updated_at || new Date().toISOString()
    };

    await redis.set(key, normalized);

    // Score by start timestamp in milliseconds (handle numeric 0 cleanly)
    const rawStartTime = normalized.start_time !== undefined ? normalized.start_time
      : (normalized.startTime !== undefined ? normalized.startTime : normalized.created_at);

    let score = Date.now();
    if (rawStartTime !== undefined && rawStartTime !== null && rawStartTime !== '') {
      const parsed = typeof rawStartTime === 'number' ? rawStartTime : Date.parse(rawStartTime);
      if (!Number.isNaN(parsed)) {
        score = parsed;
      }
    }

    await redis.zadd(MEETINGS_INDEX_KEY, { score, member: idStr });
    return normalized;
  });
}

/**
 * Retrieve a meeting record from Redis.
 * @param {string|number} meetingId
 * @returns {Promise<object|null>}
 */
export async function getMeeting(meetingId) {
  if (meetingId === null || meetingId === undefined || meetingId === '') return null;
  const redis = getRedisClient();
  const key = `${MEETING_KEY_PREFIX}${String(meetingId)}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Query meetings from the sorted set index with optional date and host filtering.
 * @param {{
 *   date?: string,
 *   startDate?: string,
 *   endDate?: string,
 *   minScore?: number|string,
 *   maxScore?: number|string,
 *   host?: string,
 *   limit?: number,
 *   offset?: number,
 *   rev?: boolean
 * }} [options]
 * @returns {Promise<Array<object>>}
 */
export async function getMeetingsByIndex(options = {}) {
  const {
    date,
    startDate,
    endDate,
    host,
    limit = 50,
    offset = 0,
    rev = true
  } = options;

  let min = options.minScore !== undefined ? options.minScore : '-inf';
  let max = options.maxScore !== undefined ? options.maxScore : '+inf';

  // Handle date parameter (YYYY-MM-DD) with dynamic Europe/Kyiv seasonal timezone offset
  const targetDate = date || startDate;
  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const startOffset = getKyivOffset(targetDate);
    const startOfDay = new Date(`${targetDate}T00:00:00.000${startOffset}`).getTime();
    min = startOfDay;

    const endTarget = endDate || targetDate;
    const endOffset = getKyivOffset(endTarget);
    const endOfDay = new Date(`${endTarget}T23:59:59.999${endOffset}`).getTime();
    max = endOfDay;
  } else if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    const endOffset = getKyivOffset(endDate);
    const endOfDay = new Date(`${endDate}T23:59:59.999${endOffset}`).getTime();
    max = endOfDay;
  }

  // In Upstash Redis and Redis 6.2+: ZRANGE key max min BYSCORE REV
  // When rev: true is passed, score bounds must be ordered [max, min]
  const startScore = rev ? max : min;
  const stopScore = rev ? min : max;

  const redis = getRedisClient();

  // If host filter is present, we cannot apply count: limit at the ZSET query level
  // because the top `limit` meetings may belong to other hosts.
  const zrangeOpts = {
    byScore: true,
    rev
  };
  if (!host) {
    zrangeOpts.offset = offset;
    zrangeOpts.count = limit;
  }

  const ids = await redis.zrange(MEETINGS_INDEX_KEY, startScore, stopScore, zrangeOpts);

  if (!ids || ids.length === 0) {
    return [];
  }

  const meetings = await Promise.all(ids.map(id => getMeeting(id)));
  let validMeetings = meetings.filter(Boolean);

  if (host) {
    const hostQuery = String(host).trim().toLowerCase();
    validMeetings = validMeetings.filter(m => {
      const email = String(m.host_email || m.hostEmail || '').toLowerCase();
      const name = String(m.host_name || m.hostName || '').toLowerCase();
      return email.includes(hostQuery) || name.includes(hostQuery);
    });

    if (offset > 0) {
      validMeetings = validMeetings.slice(offset);
    }
    if (limit !== undefined && limit !== null) {
      const lim = Number(limit);
      if (lim >= 0) {
        validMeetings = validMeetings.slice(0, lim);
      }
    }
  }

  return validMeetings;
}

/**
 * Delete a meeting record and remove it from the index.
 * Sequential execution per meetingId is enforced via withMeetingLock.
 * @param {string|number} meetingId
 * @returns {Promise<boolean>}
 */
export async function deleteMeeting(meetingId) {
  if (meetingId === null || meetingId === undefined || meetingId === '') return false;
  const idStr = String(meetingId);
  return withMeetingLock(idStr, async () => {
    const redis = getRedisClient();
    const key = `${MEETING_KEY_PREFIX}${idStr}`;
    await Promise.all([
      redis.del(key),
      redis.zrem(MEETINGS_INDEX_KEY, idStr)
    ]);
    return true;
  });
}

/**
 * Record an incoming webhook event log in Redis for live monitoring and debugging.
 * Stores up to the last 100 events in a capped Redis list.
 * @param {object} entry
 */
export async function recordWebhookLog(entry) {
  try {
    const redis = getRedisClient();
    const item = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    if (typeof redis.lpush === 'function') {
      await redis.lpush(WEBHOOK_LOGS_KEY, JSON.stringify(item));
      if (typeof redis.ltrim === 'function') {
        await redis.ltrim(WEBHOOK_LOGS_KEY, 0, 9999);
      }
    }
  } catch (err) {
    console.warn('[Redis] Error saving webhook log:', err.message);
  }
}

/**
 * Retrieve the most recent webhook event logs from Redis.
 * @param {number} [limit=100]
 * @returns {Promise<Array<object>>}
 */
export async function getWebhookLogs(limit = 100) {
  try {
    const redis = getRedisClient();
    if (typeof redis.lrange === 'function') {
      const raw = await redis.lrange(WEBHOOK_LOGS_KEY, 0, limit - 1);
      return (raw || []).map(r => {
        if (typeof r === 'object' && r !== null) return r;
        try {
          return JSON.parse(r);
        } catch {
          return { raw: String(r) };
        }
      });
    }
    return [];
  } catch (err) {
    console.warn('[Redis] Error fetching webhook logs:', err.message);
    return [];
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
    // @upstash/redis accepts an object map. The positional Redis signature is
    // supported by the in-memory fake but is interpreted incorrectly by the
    // production client (it stores the fingerprint string character-by-character).
    await redis.hset(factKey, {
      [fingerprint]: typeof fact === 'string' ? fact : JSON.stringify(fact)
    });
  } else {
    // Fallback if hset is not available
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
        // CRM-003/early CRM-005 used the wrong Upstash HSET signature and may
        // have left character-valued hash fields. They are not valid facts;
        // guarded migration execution replaces the hash from source evidence.
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
 * Clear all webhook event logs from Redis.
 * @returns {Promise<boolean>}
 */
export async function clearWebhookLogs() {
  try {
    const redis = getRedisClient();
    if (typeof redis.del === 'function') {
      await redis.del(WEBHOOK_LOGS_KEY);
    }
    return true;
  } catch (err) {
    console.warn('[Redis] Error clearing webhook logs:', err.message);
    return false;
  }
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



