// ee-crm/verification/tests/crm-017-expand-all-includes-zoom-meetings.e2e.mjs
// Automated E2E Verification Suite for CRM-017: Expand/Collapse All Includes Zoom Meetings

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const LOCAL_BASE_URL = 'http://localhost:3000';
const TEACHER_ID = 't_2f8087fc'; // Using an existing teacher ID from fixtures
const DATE = '2026-09-18'; // Using an existing date from fixtures

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM E2E VERIFICATION SUITE — CRM-017');
  console.log(`Local URL:  ${LOCAL_BASE_URL}`);
  console.log(`Timestamp:  ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    
    // Group 1: Teacher Day Details View
    console.log('\n--- Group 1: Teacher Day Details View ---');
    const dayContext = await browser.newContext();
    const dayPage = await dayContext.newPage();
    
    try {
      await dayPage.goto(`${LOCAL_BASE_URL}/teachers/${TEACHER_ID}/${DATE}`, { waitUntil: 'networkidle' });
      
      const expandAllBtn = dayPage.locator('button', { hasText: /Expand All/i });
      
      // To-Do #1 & #2 & #3 will likely fail right here because the button doesn't exist yet on this page.
      const isVisible = await expandAllBtn.isVisible();
      assert.ok(isVisible, 'Expand All button should be visible on Teacher Day Details page');
      
      await expandAllBtn.click();

      // Check lessons expansion (To-Do #1)
      const lessons = dayPage.locator('.lesson-card.expanded');
      const lessonsCount = await lessons.count();
      assert.ok(lessonsCount > 0, 'Schoolmate lessons should be expanded');
      recordResult('TODO-1', 'Teacher Day Details - Schoolmate Lessons Expansion', 'PASS');

      // Check Zoom expansion (To-Do #2)
      const zooms = dayPage.locator('.zoom-meeting-card.expanded');
      const zoomsCount = await zooms.count();
      assert.ok(zoomsCount > 0, 'Zoom meetings should be expanded');
      recordResult('TODO-2', 'Teacher Day Details - Zoom Meetings Expansion', 'PASS');

      // To-Do #3
      const collapseAllBtn = dayPage.locator('button', { hasText: /Collapse All/i });
      await collapseAllBtn.click();
      
      const expandedZooms = await dayPage.locator('.zoom-meeting-card.expanded').count();
      const expandedLessons = await dayPage.locator('.lesson-card.expanded').count();
      assert.equal(expandedZooms, 0, 'Zoom meetings should be collapsed');
      assert.equal(expandedLessons, 0, 'Lessons should be collapsed');
      recordResult('TODO-3', 'Teacher Day Details - Global Collapse', 'PASS');
      
    } catch (err) {
      recordResult('TODO-1/2/3', 'Teacher Day Details toggles', 'FAIL', err.message);
    }
    await dayContext.close();

    // Group 2: Teacher Schedule View
    console.log('\n--- Group 2: Teacher Schedule View ---');
    const schedContext = await browser.newContext();
    const schedPage = await schedContext.newPage();
    
    try {
      await schedPage.goto(`${LOCAL_BASE_URL}/teachers/${TEACHER_ID}`, { waitUntil: 'networkidle' });
      
      const expandAllBtn = schedPage.locator('button', { hasText: /Expand All/i });
      const isVisible = await expandAllBtn.isVisible();
      assert.ok(isVisible, 'Expand All button should be visible on Teacher Schedule page');
      
      await expandAllBtn.click();

      // Check Schedule expansion (To-Do #4)
      const zoomsCount = await schedPage.locator('.zoom-meeting-card.expanded').count();
      assert.ok(zoomsCount > 0, 'Zoom meetings should be expanded across days');
      recordResult('TODO-4', 'Teacher Schedule - Global Expand', 'PASS');

      // Check Schedule collapse (To-Do #5)
      const collapseAllBtn = schedPage.locator('button', { hasText: /Collapse All/i });
      await collapseAllBtn.click();
      
      const expandedZooms = await schedPage.locator('.zoom-meeting-card.expanded').count();
      assert.equal(expandedZooms, 0, 'Zoom meetings should be collapsed across days');
      recordResult('TODO-5', 'Teacher Schedule - Global Collapse', 'PASS');
      
    } catch (err) {
      recordResult('TODO-4/5', 'Teacher Schedule toggles', 'FAIL', err.message);
    }
    await schedContext.close();

    // Group 3: Empty States (Zoom Only)
    // To-Do #6
    console.log('\n--- Group 3: Empty States (Zoom Only) ---');
    const emptyContext = await browser.newContext();
    const emptyPage = await emptyContext.newPage();
    
    try {
      // Assuming a fixture date where there are zoom meetings but no lessons. E.g. '2026-09-17'
      await emptyPage.goto(`${LOCAL_BASE_URL}/teachers/${TEACHER_ID}/2026-09-17`, { waitUntil: 'networkidle' });
      
      const expandAllBtn = emptyPage.locator('button', { hasText: /Expand All/i });
      const isVisible = await expandAllBtn.isVisible();
      assert.ok(isVisible, 'Expand All button should be visible even if only Zoom meetings exist');
      
      await expandAllBtn.click();
      const zoomsExpanded = await emptyPage.locator('.zoom-meeting-card.expanded').count();
      assert.ok(zoomsExpanded > 0, 'Zoom meetings should be expanded when clicking Expand All on Zoom-only page');
      
      const collapseAllBtn = emptyPage.locator('button', { hasText: /Collapse All/i });
      await collapseAllBtn.click();
      const zoomsAfter = await emptyPage.locator('.zoom-meeting-card.expanded').count();
      assert.equal(zoomsAfter, 0, 'Zoom meetings should be collapsed when clicking Collapse All on Zoom-only page');
      
      recordResult('TODO-6', 'Empty States (Zoom Only)', 'PASS');
    } catch (err) {
      recordResult('TODO-6', 'Empty States (Zoom Only)', 'FAIL', err.message);
    }
    await emptyContext.close();

  } catch (err) {
    console.error('Fatal error running verification:', err);
  } finally {
    if (browser) await browser.close();
  }

  // Summary
  console.log('\n========================================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const blocked = results.filter(r => r.status === 'BLOCKED').length;
  console.log(`SUMMARY: ${passed} PASS, ${failed} FAIL, ${blocked} BLOCKED, ${results.length} TOTAL`);
  
  if (failed > 0) {
    console.error('\n❌ Verification Failed (Red Phase).');
    process.exit(1);
  } else {
    console.log('\n✅ Verification Passed (Green Phase).');
    process.exit(0);
  }
}

runTests();
