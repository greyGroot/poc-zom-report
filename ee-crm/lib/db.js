// ee-crm/lib/db.js
// Persistence layer for Empire English CRM with Upstash Redis and Local Fallback

import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

const TEACHERS_KEY = 'ee:teachers:map';
const LOGS_KEY = 'ee:app:logs';
const REPORT_KEY_PREFIX = 'ee:report:';

// In-Memory Fallback store for local testing
class MemoryStore {
  constructor() {
    this.teachers = new Map();
    this.reports = new Map();
    this.logs = [];
  }
}

const memoryStore = new MemoryStore();

/**
 * Returns active Redis client if credentials exist, otherwise null
 */
function getRedisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return new Redis({ url, token });
    } catch (err) {
      console.warn('[DB] Failed to init Upstash client, falling back to memory:', err.message);
    }
  }
  return null;
}

// -------------------------------------------------------------
// Teachers CRUD
// -------------------------------------------------------------

export async function getTeachers() {
  const redis = getRedisClient();
  if (redis) {
    try {
      const all = await redis.hgetall(TEACHERS_KEY);
      if (!all) return [];
      return Object.values(all).map(t => (typeof t === 'string' ? JSON.parse(t) : t));
    } catch (err) {
      console.warn('[DB] Redis getTeachers error, fallback to memory:', err.message);
    }
  }
  return Array.from(memoryStore.teachers.values());
}

export async function getTeacherById(id) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.hget(TEACHERS_KEY, String(id));
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      console.warn('[DB] Redis getTeacherById error:', err.message);
    }
  }
  return memoryStore.teachers.get(String(id)) || null;
}

export async function createTeacher({
  firstName,
  lastName,
  email,
  schoolmateTeacherId,
  phone,
  telegramId,
  zoomHostEmail,
  schoolmateLogin
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
    zoomHostEmail: zoomHostEmail?.trim() || email?.trim() || '',
    createdAt: new Date().toISOString()
  };

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.hset(TEACHERS_KEY, { [id]: JSON.stringify(teacher) });
      return teacher;
    } catch (err) {
      console.warn('[DB] Redis createTeacher error, saving to memory:', err.message);
    }
  }

  memoryStore.teachers.set(id, teacher);
  return teacher;
}

export async function deleteTeacher(id) {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.hdel(TEACHERS_KEY, String(id));
      return true;
    } catch (err) {
      console.warn('[DB] Redis deleteTeacher error:', err.message);
    }
  }
  return memoryStore.teachers.delete(String(id));
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
  if (redis) {
    try {
      // Cache for 5 minutes (300 seconds)
      await redis.set(key, JSON.stringify(record), { ex: 300 });
      return;
    } catch (err) {
      console.warn('[DB] Redis saveCachedReport error:', err.message);
    }
  }
  memoryStore.reports.set(key, record);
}

export async function getCachedReport(teacherId, periodKey) {
  const key = `${REPORT_KEY_PREFIX}${teacherId}:${periodKey}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed.data || parsed;
    } catch (err) {
      console.warn('[DB] Redis getCachedReport error:', err.message);
    }
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

  if (redis) {
    try {
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
    } catch (err) {
      console.warn('[DB] Redis cleanOldAppLogs error:', err.message);
    }
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
  if (redis) {
    try {
      await redis.lpush(LOGS_KEY, JSON.stringify(logItem));
      await redis.ltrim(LOGS_KEY, 0, 499); // Keep latest 500 logs max
      return logItem;
    } catch (err) {
      console.warn('[DB] Redis addAppLog error:', err.message);
    }
  }

  memoryStore.logs.unshift(logItem);
  if (memoryStore.logs.length > 500) memoryStore.logs.pop();
  return logItem;
}

export async function getAppLogs(limit = 100) {
  const cutoffTime = Date.now() - LOG_RETENTION_MS;
  const redis = getRedisClient();

  if (redis) {
    try {
      const list = await redis.lrange(LOGS_KEY, 0, limit - 1);
      if (!list) return [];
      return list
        .map(item => (typeof item === 'string' ? JSON.parse(item) : item))
        .filter(item => new Date(item.timestamp).getTime() >= cutoffTime);
    } catch (err) {
      console.warn('[DB] Redis getAppLogs error:', err.message);
    }
  }

  return memoryStore.logs
    .slice(0, limit)
    .filter(item => new Date(item.timestamp).getTime() >= cutoffTime);
}
