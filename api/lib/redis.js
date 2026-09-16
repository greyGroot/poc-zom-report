// api/lib/redis.js
// Pure ESM Upstash Redis persistence layer with in-memory fallback for poc-zoom-report

import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from '@upstash/redis';

export const MEETING_KEY_PREFIX = 'zoom:meeting:';
export const MEETINGS_INDEX_KEY = 'zoom:meetings:index';

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
