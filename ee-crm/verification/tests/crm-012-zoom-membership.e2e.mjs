import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.CRM_012_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const expectedTeacherId = process.env.CRM_012_TEACHER_ID || '';
const evidencePath = process.env.CRM_012_EVIDENCE_PATH || '';
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
  assert.equal(response.status, 200, `${pathname} returned ${response.status}`);
  return { response, json: await response.json() };
}

await check('application is available', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Empire English CRM|Teachers Directory/);
  return { status: response.status };
});

let teachers = [];
await check('teacher list exposes normalized membership contracts', async () => {
  const { response, json } = await getJson('/api/teachers');
  teachers = Array.isArray(json) ? json : json.teachers;
  assert.ok(Array.isArray(teachers));
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  for (const teacher of teachers) {
    assert.ok(teacher.zoomMembership, `missing zoomMembership for ${teacher.id}`);
    assert.equal(teacher.zoomStatus, teacher.zoomMembership.status);
    assert.ok(['member', 'pending', 'not_invited', 'unavailable'].includes(teacher.zoomMembership.status));
    if (teacher.zoomMembership.status !== 'member') {
      assert.equal(teacher.zoomMembership.memberSince?.value ?? null, null);
    }
  }
  return {
    count: teachers.length,
    counts: Object.fromEntries(['member', 'pending', 'not_invited', 'unavailable'].map(status => [
      status,
      teachers.filter(teacher => teacher.zoomMembership.status === status).length
    ]))
  };
});

const selected = expectedTeacherId
  ? teachers.find(teacher => teacher.id === expectedTeacherId)
  : teachers.find(teacher => teacher.zoomMembership?.status === 'member');

if (selected) {
  await check('member date is identical across list and detail APIs', async () => {
    const { json: resJson } = await getJson(`/api/teachers/${encodeURIComponent(selected.id)}`);
    const detail = resJson.teacher || resJson;
    assert.equal(detail.zoomMembership.status, 'member');
    assert.equal(detail.zoomMembership.memberSince.state, 'available');
    assert.equal(detail.zoomMembership.memberSince.value, selected.zoomMembership.memberSince.value);
    assert.equal(detail.zoomMembership.matchedEmail, selected.zoomMembership.matchedEmail);
    return { teacherId: selected.id, memberSince: detail.zoomMembership.memberSince.value };
  });

  await check('member date is identical on teacher-day API', async () => {
    const date = process.env.CRM_012_DAY || '2026-09-25';
    const { json: day } = await getJson(`/api/teachers/${encodeURIComponent(selected.id)}/days/${date}`);
    assert.equal(day.teacher.zoomMembership.status, 'member');
    assert.equal(day.teacher.zoomMembership.memberSince.value, selected.zoomMembership.memberSince.value);
    return { teacherId: selected.id, date, memberSince: day.teacher.zoomMembership.memberSince.value };
  });
} else {
  console.log('SKIP cross-surface live-member checks: no member fixture exists in this environment');
  results.push({ name: 'cross-surface live-member checks', status: 'Not applicable', details: 'No member fixture exists' });
}

const evidence = {
  story: 'CRM-012',
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
