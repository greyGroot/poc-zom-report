// ee-crm/lib/timezone.js
// Timezone and date formatting utilities for EE-CRM with Europe/Kyiv authoritative time

export const TIMEZONE = 'Europe/Kyiv';

/**
 * Returns YYYY-MM-DD date string in Europe/Kyiv timezone for a given ISO date or timestamp.
 * @param {string|Date} dateInput
 * @returns {string|null}
 */
export function getKyivDateString(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Formats time (e.g. "08:00") in Europe/Kyiv timezone according to locale.
 * @param {string|Date} dateInput
 * @param {string} [locale='en']
 * @returns {string}
 */
export function formatKyivTime(dateInput, locale = 'en') {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Formats date heading (e.g. "Saturday, 26 September" or "субота, 26 вересня")
 * @param {string|Date} dateInput
 * @param {string} [locale='en']
 * @returns {string}
 */
export function formatKyivDateHeader(dateInput, locale = 'en') {
  if (!dateInput) return '';
  let d;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    d = new Date(`${dateInput}T12:00:00Z`);
  } else {
    d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  }
  if (Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(d);
}

/**
 * Format duration in minutes into a localized string (e.g. "60 min", "1h 30m").
 * @param {number|null} minutes
 * @param {string} [locale='en']
 * @returns {string}
 */
export function formatDuration(minutes, locale = 'en') {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return '';
  }
  if (locale === 'uk') {
    return `${minutes} хв`;
  }
  if (locale === 'pl') {
    return `${minutes} min`;
  }
  return `${minutes} min`;
}
