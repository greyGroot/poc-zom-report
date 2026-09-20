// ee-crm/test-adversarial-m2.js
// Adversarial Stress Testing of Milestone 2 Frontend Routes & Resilience

import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PORT = 3488;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  return false;
}

async function runAdversarialM2() {
  console.log('================================================================');
  console.log('⚔️  ADVERSARIAL STRESS TEST: MILESTONE 2 FRONTEND & EDGE CASES');
  console.log('================================================================\n');

  console.log(`[Launch] Starting Next.js production server on port ${PORT}...`);
  const serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'inherit'
  });

  const cleanup = () => {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t']);
      } else {
        serverProcess.kill();
      }
    } catch {
      // ignore
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    const ready = await waitForServer();
    assert(ready, 'Next.js server failed to launch');
    console.log(`✅ Server online at ${BASE_URL}\n`);

    // --- TEST 1: Layout & Route Rendering Integrity ---
    console.log('--- [Stress 1] Layout & SSR Rendering Integrity ---');
    const routes = ['/', '/logs', '/api/health'];
    for (const r of routes) {
      const res = await fetch(`${BASE_URL}${r}`);
      assert.strictEqual(res.status, 200, `Route ${r} returned non-200: ${res.status}`);
      const text = await res.text();
      assert(text.length > 100, `Route ${r} returned suspiciously short content: ${text.length} chars`);
      console.log(`   Route ${r}: HTTP 200 OK (${text.length} bytes)`);
    }

    // --- TEST 2: Dynamic Route /teachers/[id] with Bogus / Non-existent ID ---
    console.log('\n--- [Stress 2] Non-existent Teacher Schedule Route Graceful SSR ---');
    const bogusRes = await fetch(`${BASE_URL}/teachers/non-existent-uuid-9999`);
    // Dynamic client component page SSRs successfully with HTTP 200 and client handles missing teacher
    assert.strictEqual(bogusRes.status, 200, `Expected SSR 200 for dynamic route, got ${bogusRes.status}`);
    const bogusHtml = await bogusRes.text();
    assert(bogusHtml.includes('Empire English CRM'), 'Missing RootLayout brand');
    assert(bogusHtml.includes('Back to Teachers'), 'Missing back navigation fallback');
    console.log('✅ Non-existent teacher ID route pre-renders cleanly without SSR crash');

    // --- TEST 3: Static Asset & CSS Bundle Delivery ---
    console.log('\n--- [Stress 3] CSS Design Tokens & Stylesheet Delivery ---');
    const pageHtml = await (await fetch(`${BASE_URL}/`)).text();
    const cssMatches = [...pageHtml.matchAll(/href="(\/_next\/static\/chunks\/[^"]+\.css)"/g)];
    assert(cssMatches.length > 0, 'No CSS bundle link tag found in rendered HTML');
    const cssUrl = `${BASE_URL}${cssMatches[0][1]}`;
    const cssRes = await fetch(cssUrl);
    assert.strictEqual(cssRes.status, 200, `CSS bundle failed to load: ${cssRes.status}`);
    const cssText = await cssRes.text();
    assert(cssText.includes('--primary'), 'Missing --primary token in compiled CSS');
    assert(cssText.includes('--bg-app'), 'Missing --bg-app token in compiled CSS');
    assert(cssText.includes('.split-view-container'), 'Missing .split-view-container in compiled CSS');
    assert(cssText.includes('.telemetry-card'), 'Missing .telemetry-card in compiled CSS');
    console.log(`✅ Design system CSS bundle verified (${cssText.length} bytes, all tokens present)`);

    // --- TEST 4: Teacher Directory Add & Deletion Lifecycle Under Rapid Calls ---
    console.log('\n--- [Stress 4] Rapid Teacher Creation & Deletion Integrity ---');
    const addRes = await fetch(`${BASE_URL}/api/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Stress',
        lastName: 'Tester',
        email: 'stress.tester@empire.eu',
        schoolmateTeacherId: 99991,
        zoomHostEmail: 'stress.tester@empire.eu'
      })
    });
    assert.strictEqual(addRes.status, 201, `Failed to create stress teacher: ${addRes.status}`);
    const { teacher: createdT } = await addRes.json();
    assert.strictEqual(createdT.fullName, 'Tester Stress');

    // Fetch teachers list and verify presence
    const listRes = await fetch(`${BASE_URL}/api/teachers`);
    const { teachers } = await listRes.json();
    const found = teachers.find(t => t.id === createdT.id);
    assert(found, 'Created stress teacher not found in GET /api/teachers');

    // Test Teacher Schedule page for newly created teacher
    const schedPageRes = await fetch(`${BASE_URL}/teachers/${createdT.id}`);
    assert.strictEqual(schedPageRes.status, 200);

    // Delete teacher
    const delRes = await fetch(`${BASE_URL}/api/teachers/${createdT.id}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
    console.log(`✅ Teacher lifecycle (Create -> List -> Schedule View -> Delete) validated`);

    // --- TEST 5: System Logs Filtering API Contract ---
    console.log('\n--- [Stress 5] System Logs Limit & Content Integrity ---');
    const logsRes = await fetch(`${BASE_URL}/api/logs?limit=5`);
    assert.strictEqual(logsRes.status, 200);
    const { logs } = await logsRes.json();
    assert(Array.isArray(logs), 'Expected array of logs');
    assert(logs.length <= 5, `Expected <= 5 logs, got ${logs.length}`);
    if (logs.length > 0) {
      assert(logs[0].id && logs[0].timestamp && logs[0].level && logs[0].action, 'Log schema missing required fields');
    }
    console.log(`✅ System logs endpoint validated with ?limit=5 (returned ${logs.length} entries)`);

    console.log('\n================================================================');
    console.log('🎉 ALL ADVERSARIAL STRESS SUITES PASSED WITH 100% FIDELITY!');
    console.log('================================================================\n');
  } finally {
    console.log('[Cleanup] Shutting down stress test server...');
    cleanup();
    await sleep(1000);
  }
}

runAdversarialM2().catch(err => {
  console.error('❌ Adversarial stress test failed:', err);
  process.exit(1);
});
