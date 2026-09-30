import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.CRM_016_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let expectedTeacherId = process.env.CRM_016_TEACHER_ID || '';
const date = process.env.CRM_016_DAY || '2026-09-28';
const evidencePath = process.env.CRM_016_EVIDENCE_PATH || '';
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
  return { response, json: await response.json() };
}

// Ensure a valid teacher fixture exists
if (!expectedTeacherId) {
  try {
    const { json: teachersData } = await getJson('/api/teachers');
    const teachersList = Array.isArray(teachersData) ? teachersData : teachersData.teachers || [];
    const target = teachersList.find(t => t.zoomHostEmail === 'helhakushnirchuk@gmail.com' || t.email === 'helhakushnirchuk@gmail.com') ||
      teachersList.find(t => t.zoomHostEmail || t.email) ||
      teachersList[0];
    if (target?.id) {
      expectedTeacherId = target.id;
    }
  } catch {}

  if (!expectedTeacherId) {
    try {
      const createRes = await fetch(`${baseUrl}/api/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Olena',
          lastName: 'Kushnirchuk',
          email: 'helhakushnirchuk@gmail.com',
          schoolmateTeacherId: 18305,
          zoomHostEmail: 'helhakushnirchuk@gmail.com'
        })
      });
      if (createRes.status === 201) {
        const createData = await createRes.json();
        expectedTeacherId = createData.teacher?.id;
      }
    } catch {}
  }
}

await check('Check 5: UI & End-to-End Contract Preservation (API)', async () => {
  const { json: day } = await getJson(`/api/teachers/${encodeURIComponent(expectedTeacherId)}/days/${date}`);
  
  assert.ok(day, 'Day response should be valid JSON');
  assert.ok(day.zoom, 'Response should contain zoom evidence structure');
  assert.ok(['available', 'empty', 'unmapped', 'unavailable'].includes(day.zoom.state), `zoom state "${day.zoom.state}" must be a valid state`);
  
  const meetings = day.zoom.meetings || day.zoom.occurrences || [];
  assert.ok(Array.isArray(meetings), 'meetings/occurrences should be an array');
  
  return { status: 'api-success', zoomState: day.zoom.state, count: meetings.length };
});

await check('Check 5: UI & End-to-End Contract Preservation (HTML)', async () => {
  const response = await fetch(`${baseUrl}/teachers/${encodeURIComponent(expectedTeacherId)}/${date}`);
  assert.equal(response.status, 200, `Page returned ${response.status}`);
  const html = await response.text();
  
  // Basic validation that the page loaded and shows Day Details
  assert.ok(
    html.includes('day-details') ||
    html.includes('Zoom Evidence') ||
    html.includes('Schoolmate') ||
    html.includes('Teacher Day Details'),
    'Page should render teacher day details workspace'
  );
  
  return { status: 'html-success' };
});

const evidence = {
  story: 'CRM-016',
  baseUrl,
  testedAt: new Date().toISOString(),
  results
};

if (evidencePath) {
  const absolute = path.resolve(evidencePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

const failures = results.filter(result => result.status === 'Fail');
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exitCode = 1;
