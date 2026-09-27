// ee-crm/lib/logger.js
// Centralized structured logging for EE CRM

import { addAppLog } from './db.js';

export const logger = {
  async info(action, message, details = {}) {
    console.log(`[INFO] [${action}] ${message}`, details);
    return addAppLog({ level: 'INFO', action, message, details });
  },

  async warn(action, message, details = {}) {
    console.warn(`[WARN] [${action}] ${message}`, details);
    return addAppLog({ level: 'WARN', action, message, details });
  },

  async error(action, message, err = null, details = {}) {
    const errorDetails = {
      ...details,
      errorMessage: err?.message || String(err),
      stack: err?.stack || null
    };
    console.error(`[ERROR] [${action}] ${message}`, errorDetails);
    return addAppLog({ level: 'ERROR', action, message, details: errorDetails });
  },

  async timed(action, message, asyncFn) {
    const start = Date.now();
    try {
      const result = await asyncFn();
      const durationMs = Date.now() - start;
      await addAppLog({
        level: 'INFO',
        action,
        message: `${message} completed in ${durationMs}ms`,
        durationMs
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      await addAppLog({
        level: 'ERROR',
        action,
        message: `${message} failed after ${durationMs}ms: ${err.message}`,
        durationMs,
        details: { stack: err.stack }
      });
      throw err;
    }
  }
};
