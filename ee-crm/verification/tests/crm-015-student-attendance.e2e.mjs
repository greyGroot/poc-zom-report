import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_BASE_URL = (process.env.CRM_015_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function fetchHtml(urlPath) {
  const url = `${TARGET_BASE_URL}${urlPath}`;
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache'
    }
  });
  const html = await response.text();
  return { response, html, status: response.status, headers: response.headers };
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-015');
  console.log(`Target URL:  ${TARGET_BASE_URL}`);
  console.log(`Timestamp:   ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // We are checking a teacher and date that we expect to have an attendance API proxy hit.
  // We'll use teacher t_0fa2ff7f on 2026-09-25 as an example.
  const teacherId = 't_0fa2ff7f';
  const pastDate = '2026-09-25';
  
  // A date in the future for testing future lesson exclusion.
  const futureDate = '2050-01-01';

  // 1. Generic person icon replaced with status indicator on student chips (Check 1, 2, 3, 4)
  console.log('\n--- Checking Past Day Details (Status mapping) ---');
  try {
    const { status, html } = await fetchHtml(`/teachers/${teacherId}/${pastDate}`);
    assert.equal(status, 200, 'Page loaded successfully');
    
    // In Red phase, these should fail as the feature isn't implemented.
    assert.ok(html.includes('✅'), 'Page should render ✅ for present students');
    assert.ok(html.includes('❌'), 'Page should render ❌ for absent students');
    assert.ok(html.includes('❓'), 'Page should render ❓ for unchecked students');
    assert.ok(!html.includes('👤'), 'Generic person icon should be replaced');
    
    recordResult('CRM015-ICONS', 'Renders ✅, ❌, and ❓ instead of 👤', 'PASS');
  } catch (err) {
    recordResult('CRM015-ICONS', 'Renders ✅, ❌, and ❓ instead of 👤', 'FAIL', err.message);
  }

  // 2. Tooltip / hover and accessible title/aria-label assertions (Check 7)
  try {
    const { html } = await fetchHtml(`/teachers/${teacherId}/${pastDate}`);
    assert.ok(html.includes('aria-label="Present"') || html.includes('title="Present"'), 'Present tooltip found');
    assert.ok(html.includes('aria-label="Absent"') || html.includes('title="Absent"'), 'Absent tooltip found');
    recordResult('CRM015-A11Y', 'Renders accessible labels for attendance indicators', 'PASS');
  } catch (err) {
    recordResult('CRM015-A11Y', 'Renders accessible labels for attendance indicators', 'FAIL', err.message);
  }

  // 3. Universal scope across Teacher Schedule
  console.log('\n--- Checking Teacher Schedule ---');
  try {
    const { status, html } = await fetchHtml(`/teachers/${teacherId}`);
    assert.equal(status, 200, 'Page loaded successfully');
    assert.ok(html.includes('✅') || html.includes('❓') || html.includes('❌'), 'Schedule page should render attendance indicators');
    recordResult('CRM015-SCHEDULE', 'Attendance indicators rendered on Teacher Schedule page', 'PASS');
  } catch (err) {
    recordResult('CRM015-SCHEDULE', 'Attendance indicators rendered on Teacher Schedule page', 'FAIL', err.message);
  }

  // 4. Future lessons do NOT trigger Schoolmate API / render neutral state (Check 5)
  console.log('\n--- Checking Future Day Details ---');
  try {
    const { status, html } = await fetchHtml(`/teachers/${teacherId}/${futureDate}`);
    assert.equal(status, 200, 'Page loaded successfully');
    
    // Should render neutral state or ❓, and NOT ✅ or ❌
    assert.ok(!html.includes('✅'), 'Future lesson should not show present icon');
    assert.ok(!html.includes('❌'), 'Future lesson should not show absent icon');
    
    recordResult('CRM015-FUTURE', 'Future lessons do not show checked attendance icons', 'PASS');
  } catch (err) {
    recordResult('CRM015-FUTURE', 'Future lessons do not show checked attendance icons', 'FAIL', err.message);
  }

  // Final summary
  console.log('\n========================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`E2E EXECUTION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    console.error(`❌ Verification suite failed with ${failCount} failing checks.`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('\n❌ E2E Verification failed with fatal error:', err);
  process.exit(1);
});
