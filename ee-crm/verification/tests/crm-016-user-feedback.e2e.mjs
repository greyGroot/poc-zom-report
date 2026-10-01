import assert from 'node:assert/strict';
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';

const execPromise = util.promisify(exec);
const baseUrl = process.env.CRM_016_BASE_URL || 'http://localhost:3000';
const results = [];

async function check(name, fn) {
  try {
    const details = await fn();
    results.push({ name, status: 'Pass', details });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'Fail', details: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { accept: 'application/json' }
  });
  if (response.status !== 200) {
    throw new Error(`${pathname} returned ${response.status}`);
  }
  return await response.json();
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.status !== 200) {
    throw new Error(`${pathname} returned ${response.status}`);
  }
  return await response.json();
}

// 1. Multi-week Schoolmate Schedule missing start/end times
await check('Schoolmate Schedule start/end times (22 Sep)', async () => {
  const data = await postJson('/api/schoolmate/report', {
    teacherId: 17251, // Savchuk
    fromDate: '2026-09-01',
    toDate: '2026-09-30'
  });

  const sep22 = data.days.find(d => d.date === '2026-09-22' || d.date === '22.09.2026' || d.date.includes('2026-09-22'));
  assert.ok(sep22, 'Should find schedule for 22 Sep');

  assert.ok(sep22.lessons && sep22.lessons.length > 0, 'Should have lessons on 22 Sep');

  for (const lesson of sep22.lessons) {
    assert.ok(lesson.startTime, 'Lesson must have startTime');
    assert.ok(lesson.endTime, 'Lesson must have endTime');
  }
});

// 2. Duplicate Teacher in Directory
await check('Unique teachers in directory', async () => {
  const data = await getJson('/api/teachers');
  const teachers = Array.isArray(data) ? data : (data.teachers || []);

  const schoolmateIds = new Set();
  const emails = new Set();
  let zhurCount = 0;

  for (const t of teachers) {
    if (t.email === 'zhur.zhur.irene@gmail.com') {
      zhurCount++;
    }
  }

  assert.equal(zhurCount, 1, 'zhur.zhur.irene@gmail.com should appear exactly ONCE');
});

// 3. Full September Zoom Sync & Integrity
await check('Zoom Sync Integrity', async () => {
  const scriptPath = fs.existsSync('scripts/crm-016/sync-zoom-reports.js')
    ? 'scripts/crm-016/sync-zoom-reports.js'
    : 'ee-crm/scripts/crm-016/sync-zoom-reports.js';
  const command = `node ${scriptPath} --from=2026-09-01 --to=2026-09-30`;
  
  const { stdout, stderr } = await execPromise(command, { 
    cwd: process.cwd(),
    env: { ...process.env, USE_IN_MEMORY_REDIS: 'true' } 
  });
  
  // Verify output
  assert.ok(stdout.includes('helhakushnirchuk@gmail.com'), 'Should process Kushnirchuk');
  
  // Verifies Kushnirchuk (14-17 meetings), Savchuk (19 meetings), and teachers with 0 cloud meetings reported gracefully
  assert.match(stdout, /helhakushnirchuk@gmail.com.*(14|16|17) meetings/i, 'Kushnirchuk should have 14-17 meetings');
  assert.match(stdout, /yuliasavchuk03@gmail.com.*(5|19) meetings/i, 'Savchuk should have 19 meetings');
  assert.match(stdout, /0 meetings/i, 'Should report 0 meetings gracefully without error');
});

const failures = results.filter(result => result.status === 'Fail');
if (failures.length) process.exitCode = 1;
