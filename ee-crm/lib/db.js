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

export async function createTeacher({ firstName, lastName, email, schoolmateTeacherId, zoomHostEmail, schoolmateLogin }) {
  const id = `t_${crypto.randomUUID().substring(0, 8)}`;
  const teacher = {
    id,
    firstName: firstName?.trim() || '',
    lastName: lastName?.trim() || '',
    fullName: `${lastName?.trim() || ''} ${firstName?.trim() || ''}`.trim() || 'Teacher',
    email: email?.trim() || '',
    schoolmateTeacherId: Number(schoolmateTeacherId),
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
      // Cache for 24 hours
      await redis.set(key, JSON.stringify(record), { ex: 86400 });
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
// Application Logs
// -------------------------------------------------------------

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
      await redis.ltrim(LOGS_KEY, 0, 499); // Keep latest 500 logs
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
  const redis = getRedisClient();
  if (redis) {
    try {
      const list = await redis.lrange(LOGS_KEY, 0, limit - 1);
      if (!list) return [];
      return list.map(item => (typeof item === 'string' ? JSON.parse(item) : item));
    } catch (err) {
      console.warn('[DB] Redis getAppLogs error:', err.message);
    }
  }
  return memoryStore.logs.slice(0, limit);
}
