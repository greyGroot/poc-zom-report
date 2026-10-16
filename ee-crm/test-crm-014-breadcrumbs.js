import assert from 'node:assert/strict';
import fs from 'node:fs';
import { translations } from './lib/shared/i18n/translations.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const renderer = read('./app/components/Breadcrumbs.js');
const schedule = read('./app/teachers/[id]/TeacherScheduleClient.js');
const day = read('./app/teachers/[id]/[date]/TeacherDayDetailsClient.js');
const logs = read('./app/logs/page.js');
const languageContext = read('./lib/shared/i18n/LanguageContext.js');

const labels = {
  en: { teachers: 'Teachers', systemLogs: 'System Logs', teacher: 'Teacher' },
  uk: { teachers: 'Вчителі', systemLogs: 'Журнал подій', teacher: 'Вчитель' },
  pl: { teachers: 'Nauczyciele', systemLogs: 'Logi systemowe', teacher: 'Nauczyciel' },
};

for (const [locale, expected] of Object.entries(labels)) {
  assert.deepEqual(translations[locale].breadcrumb, expected, `${locale} breadcrumb labels`);
}

assert.match(renderer, /<nav className="breadcrumb-nav" aria-label="Breadcrumb">/);
assert.match(renderer, /<ol className="breadcrumb">/);
assert.match(renderer, /items\.map\(\(item, index\) =>/);
assert.match(renderer, /aria-hidden="true"/);
assert.match(renderer, /aria-current="page"/);
assert.match(renderer, /<Link href=\{item\.href\}>/);

assert.match(schedule, /href: formatUrl\('\/'\)/);
assert.match(schedule, /teacher \? teacher\.fullName : t\('breadcrumb\.teacher'\)/);
assert.match(day, /href: formatUrl\(`\/teachers\/\$\{teacherId\}`\)/);
assert.match(day, /Intl\.DateTimeFormat\(locale, \{ timeZone: 'Europe\/Kyiv', weekday: 'long' \}\)/);
assert.match(day, /Intl\.DateTimeFormat\('en-GB', \{ timeZone: 'Europe\/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' \}\)/);
assert.doesNotMatch(logs, /Breadcrumbs|breadcrumb-nav/);
assert.match(languageContext, /targetLocale === defaultLocale/);
assert.ok(languageContext.includes("return cleanPath === '/' ? `/${targetLocale}`"));

const routeDate = new Date('2026-09-28T12:00:00Z');
for (const [locale, weekday] of Object.entries({
  en: 'Monday',
  uk: 'понеділок',
  pl: 'poniedziałek',
})) {
  assert.equal(
    new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Kyiv', weekday: 'long' }).format(routeDate),
    weekday,
    `${locale} route weekday`,
  );
}
assert.equal(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(routeDate),
  '28/09/2026',
);

assert.match(day, /if \(fromParam\) params\.set\('from', fromParam\)/);
assert.match(day, /if \(filterParam && filterParam !== 'all'\) params\.set\('filter', filterParam\)/);
assert.match(day, /<Link href=\{backUrl\} className="btn btn-secondary">/);
assert.doesNotMatch(day, /day-details-back-link|backToTeacher/);

console.log('CRM-014 breadcrumb development checks passed.');
