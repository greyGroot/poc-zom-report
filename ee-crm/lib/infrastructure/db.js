// ee-crm/lib/db.js
// Persistence layer for Empire English CRM with strict Upstash Redis and Local Memory mode

import crypto from 'node:crypto';
import { getRedisClient, isMockClient } from './redis.js';

const TEACHERS_KEY = 'ee:teachers:map';
const LOGS_KEY = 'ee:app:logs';
const REPORT_KEY_PREFIX = 'ee:report:';
const WEEKLY_LESSONS_PREFIX = 'ee:lessons:week:';
const GROUP_ROSTER_PREFIX = 'ee:group:roster:';

// In-Memory Fallback store for local testing
class MemoryStore {
  constructor() {
    this.teachers = new Map();
    this.reports = new Map();
    this.weeklyLessons = new Map();
    this.groupRosters = new Map();
    this.logs = [];
  }

  reset() {
    this.teachers.clear();
    this.reports.clear();
    this.weeklyLessons.clear();
    this.groupRosters.clear();
    this.logs = [];
  }
}

const memoryStore = globalThis.__eeCrmDbMemoryStore || (globalThis.__eeCrmDbMemoryStore = new MemoryStore());

export function resetDbMemoryStore() {
  memoryStore.reset();
}

// -------------------------------------------------------------
// Teachers CRUD
// -------------------------------------------------------------

export async function getTeachers() {
  const redis = getRedisClient();
  if (!isMockClient()) {
    const all = await redis.hgetall(TEACHERS_KEY);
    if (!all) return [];
    return Object.values(all).map(t => (typeof t === 'string' ? JSON.parse(t) : t));
  }
  return Array.from(memoryStore.teachers.values());
}

export async function getTeacherById(id) {
  if (!id) return null;
  const idStr = String(id).trim();
  const redis = getRedisClient();

  if (!isMockClient()) {
    const raw = await redis.hget(TEACHERS_KEY, idStr);
    if (raw) {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    // Fallback: look up by schoolmateTeacherId or email if direct key didn't match
    const all = await redis.hgetall(TEACHERS_KEY);
    if (all) {
      for (const val of Object.values(all)) {
        const t = typeof val === 'string' ? JSON.parse(val) : val;
        if (t && (t.id === idStr || String(t.schoolmateTeacherId) === idStr || t.email?.toLowerCase() === idStr.toLowerCase())) {
          return t;
        }
      }
    }
    return null;
  }

  if (memoryStore.teachers.has(idStr)) {
    return memoryStore.teachers.get(idStr);
  }
  for (const t of memoryStore.teachers.values()) {
    if (t.id === idStr || String(t.schoolmateTeacherId) === idStr || t.email?.toLowerCase() === idStr.toLowerCase()) {
      return t;
    }
  }
  return null;
}

export async function createTeacher({
  firstName,
  lastName,
  email,
  schoolmateTeacherId,
  phone,
  telegramId,
  zoomHostEmail,
  schoolmateLogin,
  city,
  nationality,
  contractType
}) {
  const id = `t_${crypto.randomUUID().substring(0, 8)}`;
  const teacher = {
    id,
    firstName: firstName?.trim() || '',
    lastName: lastName?.trim() || '',
    fullName: `${lastName?.trim() || ''} ${firstName?.trim() || ''}`.trim() || 'Teacher',
    email: email?.trim() || '',
    schoolmateTeacherId: Number(schoolmateTeacherId),
    phone: phone?.trim() || '',
    telegramId: telegramId?.trim() || '',
    schoolmateLogin: schoolmateLogin?.trim() || '',
    city: city?.trim() || '',
    nationality: nationality?.trim() || '',
    contractType: contractType?.trim() || '',
    zoomHostEmail: zoomHostEmail?.trim() || email?.trim() || '',
    createdAt: new Date().toISOString()
  };

  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.hset(TEACHERS_KEY, { [id]: JSON.stringify(teacher) });
    return teacher;
  }

  memoryStore.teachers.set(id, teacher);
  return teacher;
}

export async function deleteTeacher(id) {
  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.hdel(TEACHERS_KEY, String(id));
    return true;
  }
  return memoryStore.teachers.delete(String(id));
}

/**
 * Bulk upsert teachers from Schoolmate with deduplication
 * Matches by schoolmateTeacherId or email, preserving existing IDs and custom fields.
 * @param {Array<object>} schoolmateTeachers
 * @returns {Promise<{ totalFetched: number, created: number, updated: number, totalTeachers: number }>}
 */
export async function bulkUpsertTeachers(schoolmateTeachers = []) {
  const existingTeachers = await getTeachers();
  const bySmId = new Map();
  const byEmail = new Map();

  for (const t of existingTeachers) {
    if (t.schoolmateTeacherId) {
      bySmId.set(Number(t.schoolmateTeacherId), t);
    }
    if (t.email) {
      byEmail.set(t.email.trim().toLowerCase(), t);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  const teachersMap = new Map(existingTeachers.map(t => [t.id, t]));

  for (const item of schoolmateTeachers) {
    const smId = Number(item.schoolmateTeacherId);
    const email = (item.email || '').trim().toLowerCase();

    // Match existing teacher
    const existing = (smId ? bySmId.get(smId) : null) || (email ? byEmail.get(email) : null);

    if (existing) {
      // Update existing record
      const updatedTeacher = {
        ...existing,
        firstName: item.firstName?.trim() || existing.firstName || '',
        lastName: item.lastName?.trim() || existing.lastName || '',
        fullName: item.fullName?.trim() || existing.fullName || `${item.lastName} ${item.firstName}`.trim(),
        email: existing.email || item.email?.trim() || '',
        schoolmateTeacherId: smId || existing.schoolmateTeacherId,
        phone: item.phone?.trim() || existing.phone || '',
        telegramId: item.telegramId?.trim() || existing.telegramId || '',
        schoolmateLogin: item.schoolmateLogin?.trim() || existing.schoolmateLogin || '',
        city: item.city?.trim() || existing.city || '',
        nationality: item.nationality?.trim() || existing.nationality || '',
        contractType: item.contractType?.trim() || existing.contractType || '',
        isArchived: item.isArchived !== undefined ? Boolean(item.isArchived) : Boolean(existing.isArchived),
        zoomHostEmail: existing.zoomHostEmail || item.email?.trim() || '',
        updatedAt: new Date().toISOString()
      };
      teachersMap.set(existing.id, updatedTeacher);
      updatedCount++;
    } else {
      // Create new record
      const newId = `t_${crypto.randomUUID().substring(0, 8)}`;
      const newTeacher = {
        id: newId,
        firstName: item.firstName?.trim() || '',
        lastName: item.lastName?.trim() || '',
        fullName: item.fullName?.trim() || `${item.lastName} ${item.firstName}`.trim() || 'Teacher',
        email: item.email?.trim() || '',
        schoolmateTeacherId: smId,
        phone: item.phone?.trim() || '',
        telegramId: item.telegramId?.trim() || '',
        schoolmateLogin: item.schoolmateLogin?.trim() || '',
        city: item.city?.trim() || '',
        nationality: item.nationality?.trim() || '',
        contractType: item.contractType?.trim() || '',
        isArchived: Boolean(item.isArchived),
        zoomHostEmail: item.email?.trim() || '',
        createdAt: new Date().toISOString()
      };
      teachersMap.set(newId, newTeacher);
      if (smId) bySmId.set(smId, newTeacher);
      if (email) byEmail.set(email, newTeacher);
      createdCount++;
    }
  }

  // Persist all updated records to Redis or MemoryStore
  const redis = getRedisClient();
  if (!isMockClient()) {
    const recordsToSet = {};
    for (const [id, teacher] of teachersMap.entries()) {
      recordsToSet[id] = JSON.stringify(teacher);
    }
    if (Object.keys(recordsToSet).length > 0) {
      await redis.hset(TEACHERS_KEY, recordsToSet);
    }
  } else {
    for (const [id, teacher] of teachersMap.entries()) {
      memoryStore.teachers.set(id, teacher);
    }
  }

  return {
    totalFetched: schoolmateTeachers.length,
    created: createdCount,
    updated: updatedCount,
    totalTeachers: teachersMap.size
  };
}

/**
 * Get weekly lessons summary cache from Redis/DB
 * @param {string} weekKey e.g. '2026-09-21'
 * @param {Array<number|string>} teacherIds
 * @returns {Promise<Map<number, object>>}
 */
export async function getWeeklyLessonsCache(weekKey, teacherIds = []) {
  const resultMap = new Map();
  if (!weekKey || !teacherIds.length) return resultMap;

  const redis = getRedisClient();
  if (!isMockClient()) {
    const keys = teacherIds.map(id => `${WEEKLY_LESSONS_PREFIX}${weekKey}:${id}`);
    if (keys.length > 0) {
      const results = await redis.mget(...keys);
      results.forEach((val, idx) => {
        if (val) {
          const parsed = typeof val === 'string' ? JSON.parse(val) : val;
          resultMap.set(Number(teacherIds[idx]), parsed);
        }
      });
    }
    return resultMap;
  }

  // Memory fallback
  for (const id of teacherIds) {
    const memKey = `${WEEKLY_LESSONS_PREFIX}${weekKey}:${id}`;
    if (memoryStore.weeklyLessons.has(memKey)) {
      resultMap.set(Number(id), memoryStore.weeklyLessons.get(memKey));
    }
  }

  return resultMap;
}

/**
 * Save weekly lessons summary in Redis/DB with 24-hour TTL (86400s)
 * @param {string} weekKey e.g. '2026-09-21'
 * @param {number|string} teacherId
 * @param {object} data e.g. { totalLessons, totalMinutes, totalWage }
 * @param {number} [ttlSeconds=86400] 24 hours
 */
export async function setWeeklyLessonsCache(weekKey, teacherId, data, ttlSeconds = 86400) {
  if (!weekKey || !teacherId) return;
  const key = `${WEEKLY_LESSONS_PREFIX}${weekKey}:${teacherId}`;

  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
    return;
  }

  memoryStore.weeklyLessons.set(key, data);
}

/**
 * Save multiple weekly lessons summaries in Redis/DB with 24-hour TTL (86400s)
 * @param {string} weekKey e.g. '2026-09-21'
 * @param {Map<number, object>|Array<[number, object]>} entries
 * @param {number} [ttlSeconds=86400]
 */
export async function setMultipleWeeklyLessonsCache(weekKey, entries, ttlSeconds = 86400) {
  if (!weekKey || !entries) return;
  const entriesList = entries instanceof Map ? Array.from(entries.entries()) : entries;
  if (!entriesList.length) return;

  const redis = getRedisClient();
  if (!isMockClient()) {
    for (let i = 0; i < entriesList.length; i += 100) {
      const chunk = entriesList.slice(i, i + 100);
      const pipeline = redis.pipeline();
      for (const [teacherId, data] of chunk) {
        const key = `${WEEKLY_LESSONS_PREFIX}${weekKey}:${teacherId}`;
        pipeline.set(key, JSON.stringify(data), { ex: ttlSeconds });
      }
      await pipeline.exec();
    }
    return;
  }

  for (const [teacherId, data] of entriesList) {
    const key = `${WEEKLY_LESSONS_PREFIX}${weekKey}:${teacherId}`;
    memoryStore.weeklyLessons.set(key, data);
  }
}

/**
 * Prunes all weekly lessons, report, and group roster caches from Redis or in-memory store
 */
export async function pruneAllCaches() {
  const redis = getRedisClient();
  if (!isMockClient()) {
    const lessonKeys = await redis.keys(`${WEEKLY_LESSONS_PREFIX}*`);
    const reportKeys = await redis.keys(`${REPORT_KEY_PREFIX}*`);
    const rosterKeys = await redis.keys(`${GROUP_ROSTER_PREFIX}*`);
    const allKeys = [
      ...(Array.isArray(lessonKeys) ? lessonKeys : []),
      ...(Array.isArray(reportKeys) ? reportKeys : []),
      ...(Array.isArray(rosterKeys) ? rosterKeys : [])
    ];
    for (let i = 0; i < allKeys.length; i += 100) {
      const batch = allKeys.slice(i, i + 100);
      if (batch.length > 0) {
        await redis.del(...batch);
      }
    }
    return;
  }

  memoryStore.weeklyLessons.clear();
  memoryStore.reports.clear();
  memoryStore.groupRosters.clear();
}

// -------------------------------------------------------------
// Group Roster Cache (TTL 24 hours)
// -------------------------------------------------------------

export async function getGroupRosterCache(groupId) {
  if (!groupId) return null;
  const key = `${GROUP_ROSTER_PREFIX}${groupId}`;
  const redis = getRedisClient();
  if (!isMockClient()) {
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  return memoryStore.groupRosters.get(key) || null;
}

export async function setGroupRosterCache(groupId, students, ttlSeconds = 86400) {
  if (!groupId || !Array.isArray(students)) return;
  const key = `${GROUP_ROSTER_PREFIX}${groupId}`;
  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.set(key, JSON.stringify(students), { ex: ttlSeconds });
    return;
  }
  memoryStore.groupRosters.set(key, students);
}

// -------------------------------------------------------------
// Report Cache
// -------------------------------------------------------------

export async function saveCachedReport(teacherId, periodKey, parsedData) {
  const key = `${REPORT_KEY_PREFIX}${teacherId}:${periodKey}`;
  const record = {
    cachedAt: new Date().toISOString(),
    data: parsedData
  };

  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.set(key, JSON.stringify(record), { ex: 300 });
    return;
  }
  memoryStore.reports.set(key, record);
}

export async function getCachedReport(teacherId, periodKey) {
  const key = `${REPORT_KEY_PREFIX}${teacherId}:${periodKey}`;
  const redis = getRedisClient();
  if (!isMockClient()) {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed.data || parsed;
  }
  const mem = memoryStore.reports.get(key);
  return mem ? mem.data : null;
}

// -------------------------------------------------------------
// Application Logs (Retention: 14 days)
// -------------------------------------------------------------

const LOG_RETENTION_DAYS = 14;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Remove logs older than maxAgeDays (default: 14 days)
 * @param {number} [maxAgeDays=14]
 * @returns {Promise<number>} Number of logs removed
 */
export async function cleanOldAppLogs(maxAgeDays = LOG_RETENTION_DAYS) {
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const redis = getRedisClient();

  if (!isMockClient()) {
    const rawList = await redis.lrange(LOGS_KEY, 0, -1);
    if (!rawList || rawList.length === 0) return 0;

    const validLogs = [];
    let removedCount = 0;

    for (const item of rawList) {
      const parsed = typeof item === 'string' ? JSON.parse(item) : item;
      const itemTime = new Date(parsed.timestamp).getTime();
      if (itemTime >= cutoffTime) {
        validLogs.push(typeof item === 'string' ? item : JSON.stringify(item));
      } else {
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await redis.del(LOGS_KEY);
      if (validLogs.length > 0) {
        await redis.rpush(LOGS_KEY, ...validLogs);
      }
    }

    return removedCount;
  }

  // In-memory fallback
  const initialCount = memoryStore.logs.length;
  memoryStore.logs = memoryStore.logs.filter(
    l => new Date(l.timestamp).getTime() >= cutoffTime
  );
  return initialCount - memoryStore.logs.length;
}

export async function addAppLog(entry) {
  const logItem = {
    id: `log_${Date.now()}_${crypto.randomUUID().substring(0, 6)}`,
    timestamp: new Date().toISOString(),
    level: entry.level || 'INFO',
    action: entry.action || 'GENERAL',
    message: entry.message || '',
    durationMs: entry.durationMs || null,
    details: entry.details || null
  };

  const redis = getRedisClient();
  if (!isMockClient()) {
    await redis.lpush(LOGS_KEY, JSON.stringify(logItem));
    await redis.ltrim(LOGS_KEY, 0, 499); // Keep latest 500 logs max
    return logItem;
  }

  memoryStore.logs.unshift(logItem);
  if (memoryStore.logs.length > 500) memoryStore.logs.pop();
  return logItem;
}

export async function getAppLogs(limit = 100) {
  const cutoffTime = Date.now() - LOG_RETENTION_MS;
  const redis = getRedisClient();

  if (!isMockClient()) {
    const list = await redis.lrange(LOGS_KEY, 0, limit - 1);
    if (!list) return [];
    return list
      .map(item => (typeof item === 'string' ? JSON.parse(item) : item))
      .filter(item => new Date(item.timestamp).getTime() >= cutoffTime);
  }

  return memoryStore.logs
    .slice(0, limit)
    .filter(item => new Date(item.timestamp).getTime() >= cutoffTime);
}
