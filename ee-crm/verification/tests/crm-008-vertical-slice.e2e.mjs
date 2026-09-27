// ee-crm/verification/tests/crm-008-vertical-slice.e2e.mjs
// Automated Cumulative E2E Verification Suite for CRM-008:
// Refactor EE-CRM to Target Vertical Slice Module Structure
// Validates ADR-001 governance, clean layer layout, domain isolation, thin transport controller,
// dead QoS removal, Next.js proxy migration, and live production Vercel deployment behavior.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const LOCAL_BASE_URL = 'http://localhost:3000';
const VERCEL_BASE_URL = 'https://poc-zom-report-2qvs.vercel.app';

const results = [];
function recordResult(id, description, status, details = '') {
  results.push({ id, description, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '🚫' : '⚠️';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
}

async function runVerification() {
  console.log('========================================================================');
  console.log('🧪 EE-CRM CUMULATIVE E2E VERIFICATION SUITE — CRM-008');
  console.log(`Local Base URL:  ${LOCAL_BASE_URL}`);
  console.log(`Vercel Base URL: ${VERCEL_BASE_URL}`);
  console.log(`Timestamp:       ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  // ------------------------------------------------------------------------
  // Group 1: Live Deployment Verification (Vercel Production)
  // ------------------------------------------------------------------------
  console.log('--- Group 1: Live Deployment Verification (Vercel Production) ---');

  // Test 1.1: Production Health Endpoint
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/health`);
    const data = await res.json();
    const cacheControl = res.headers.get('cache-control');

    if (
      res.status === 200 &&
      data.status === 'ok' &&
      data.integrations?.redis?.connected === true &&
      data.integrations?.redis?.mode === 'upstash_cloud' &&
      data.integrations?.schoolmate?.configured === true &&
      cacheControl?.includes('no-store')
    ) {
      recordResult(
        'E2E-PROD-HEALTH',
        'Vercel /api/health returns 200 OK with upstash_cloud mode, Schoolmate configured, and no-store header',
        'PASS',
        `Status: ${res.status}, Redis Mode: ${data.integrations?.redis?.mode}, SM Configured: ${data.integrations?.schoolmate?.configured}`
      );
    } else {
      recordResult(
        'E2E-PROD-HEALTH',
        'Vercel /api/health returned unexpected payload or status',
        'FAIL',
        `Status: ${res.status}, Body: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-HEALTH', 'Failed to reach Vercel /api/health', 'FAIL', err.message);
  }

  // Test 1.2: Production Weekly Lessons Empty Request
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teacherIds: [] })
    });
    const data = await res.json();
    if (res.status === 200 && data && typeof data.results === 'object' && Object.keys(data.results).length === 0) {
      recordResult(
        'E2E-PROD-WEEKLY-EMPTY',
        'Vercel POST /api/teachers/weekly-lessons returns 200 OK with empty results map for empty teacherIds',
        'PASS',
        `Status: ${res.status}, Payload: ${JSON.stringify(data)}`
      );
    } else {
      recordResult(
        'E2E-PROD-WEEKLY-EMPTY',
        'Vercel POST /api/teachers/weekly-lessons returned unexpected payload for empty query',
        'FAIL',
        `Status: ${res.status}, Payload: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-WEEKLY-EMPTY', 'Failed to reach Vercel weekly lessons endpoint', 'FAIL', err.message);
  }

  // Test 1.3: Production Weekly Lessons Query (Live Teacher)
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teacherIds: [17251], fromDate: '2026-09-14', toDate: '2026-09-20' })
    });
    const data = await res.json();
    if (
      res.status === 200 &&
      data?.results?.['17251'] &&
      typeof data.results['17251'].totalLessons === 'number' &&
      data.weekRange?.fromDate === '2026-09-14'
    ) {
      recordResult(
        'E2E-PROD-WEEKLY-QUERY',
        'Vercel POST /api/teachers/weekly-lessons successfully resolves live teacher schedule & cache',
        'PASS',
        `Status: 200, Teacher 17251: ${data.results['17251'].totalLessons} lessons, ${data.results['17251'].totalMinutes} min, cached: ${data.results['17251'].cached}`
      );
    } else {
      recordResult(
        'E2E-PROD-WEEKLY-QUERY',
        'Vercel POST /api/teachers/weekly-lessons returned unexpected response for live teacher',
        'FAIL',
        `Status: ${res.status}, Body: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-WEEKLY-QUERY', 'Failed to execute weekly query on Vercel', 'FAIL', err.message);
  }

  // Test 1.4: Production Weekly Lessons Invalid JSON (400 Bad Request)
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-malformed-json'
    });
    const data = await res.json();
    if (res.status === 400 && data.error === 'Invalid JSON body') {
      recordResult(
        'E2E-PROD-WEEKLY-400',
        'Vercel POST /api/teachers/weekly-lessons returns HTTP 400 for malformed JSON request',
        'PASS',
        `Status: ${res.status}, Error: ${data.error}`
      );
    } else {
      recordResult(
        'E2E-PROD-WEEKLY-400',
        'Vercel POST /api/teachers/weekly-lessons did not return expected 400 error',
        'FAIL',
        `Status: ${res.status}, Payload: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-WEEKLY-400', 'Failed to test weekly 400 on Vercel', 'FAIL', err.message);
  }

  // Test 1.5: Production Zoom Webhook CRC Endpoint
  try {
    const res = await fetch(`${VERCEL_BASE_URL}/api/webhooks/zoom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'endpoint.url_validation',
        payload: { plainToken: 'qa_crc_probe_crm008' }
      })
    });
    const data = await res.json();
    if (res.status === 200 && data.plainToken === 'qa_crc_probe_crm008' && typeof data.encryptedToken === 'string') {
      recordResult(
        'E2E-PROD-WEBHOOK-CRC',
        'Vercel /api/webhooks/zoom handles CRC challenge and returns encryptedToken',
        'PASS',
        `Status: ${res.status}, Token: ${data.encryptedToken.slice(0, 16)}...`
      );
    } else {
      recordResult(
        'E2E-PROD-WEBHOOK-CRC',
        'Vercel /api/webhooks/zoom failed CRC challenge',
        'FAIL',
        `Status: ${res.status}, Body: ${JSON.stringify(data)}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-WEBHOOK-CRC', 'Failed to reach Zoom webhook endpoint', 'FAIL', err.message);
  }

  // Test 1.6: Production Proxy & Route Accessibility
  try {
    const loginRes = await fetch(`${VERCEL_BASE_URL}/login`);
    const homeRes = await fetch(`${VERCEL_BASE_URL}/`, { redirect: 'manual' });
    if (loginRes.status === 200 && (homeRes.status === 200 || homeRes.status === 307)) {
      recordResult(
        'E2E-PROD-PROXY',
        'Vercel Next.js Proxy allows access to login and public application routes',
        'PASS',
        `Login status: ${loginRes.status}, Home status: ${homeRes.status}`
      );
    } else {
      recordResult(
        'E2E-PROD-PROXY',
        'Vercel Next.js Proxy unexpected routing behavior',
        'FAIL',
        `Login: ${loginRes.status}, Home: ${homeRes.status}`
      );
    }
  } catch (err) {
    recordResult('E2E-PROD-PROXY', 'Failed to test proxy routes on Vercel', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 2: Architectural Invariants & Static Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Group 2: Architectural Invariants & Static Verification ---');

  // Test 2.1: ADR-001 Documentation (AC-1)
  try {
    const adrPath = path.resolve(process.cwd(), 'docs/architecture/ADR-001-target-architecture-and-module-boundaries.md');
    assert.ok(fs.existsSync(adrPath), 'ADR-001 document must exist');
    const content = fs.readFileSync(adrPath, 'utf-8');
    assert.ok(content.includes('## Target Module Layout'), 'ADR-001 must define Target Module Layout');
    assert.ok(content.includes('## Layer Responsibility Ownership Matrix'), 'ADR-001 must define Responsibility Matrix');
    assert.ok(content.includes('## Dependency Direction & Rules'), 'ADR-001 must define Dependency Direction');
    recordResult(
      'AC-1-ADR-001',
      'ADR-001 is documented with required layout, responsibility matrix, and layering constraints',
      'PASS',
      `Document size: ${content.length} bytes at docs/architecture/ADR-001...`
    );
  } catch (err) {
    recordResult('AC-1-ADR-001', 'ADR-001 verification failed', 'FAIL', err.message);
  }

  // Test 2.2: Directory Layout & Root Lib Cleanliness (AC-2)
  try {
    const libDir = path.resolve(process.cwd(), 'lib');
    const requiredDirs = ['domain', 'services', 'infrastructure', 'utils', 'shared'];
    for (const dir of requiredDirs) {
      const dirPath = path.join(libDir, dir);
      assert.ok(fs.existsSync(dirPath), `lib/${dir} directory must exist`);
      assert.ok(fs.statSync(dirPath).isDirectory(), `lib/${dir} must be a directory`);
    }
    const rootFiles = fs.readdirSync(libDir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
    assert.deepEqual(rootFiles, [], `lib/ root must not contain any files: ${rootFiles.join(', ')}`);
    recordResult(
      'AC-2-LAYOUT',
      'lib/ contains domain, services, infrastructure, utils, shared and zero root files',
      'PASS',
      `Required subdirectories verified; 0 orphan files in lib/ root`
    );
  } catch (err) {
    recordResult('AC-2-LAYOUT', 'Directory layout check failed', 'FAIL', err.message);
  }

  // Test 2.3: Thin Weekly Route Handler (AC-3)
  try {
    const routePath = path.resolve(process.cwd(), 'app/api/teachers/weekly-lessons/route.js');
    const routeContent = fs.readFileSync(routePath, 'utf-8');
    const lineCount = routeContent.split('\n').length;
    assert.ok(lineCount <= 50, `Route handler must be thin (< 50 lines), found ${lineCount} lines`);
    assert.ok(routeContent.includes("from '@/lib/services/weekly-schedule-service.js'"), 'Route must delegate to weekly-schedule-service');
    assert.ok(!routeContent.includes('new SchoolmateClient'), 'Route must not instantiate SchoolmateClient directly');
    assert.ok(!routeContent.includes('getWeeklyLessonsCache'), 'Route must not query weekly cache directly');
    assert.ok(routeContent.includes('isSchoolmateUnavailableError'), 'Route must map Schoolmate availability errors');
    recordResult(
      'AC-3-THIN-CONTROLLER',
      'POST /api/teachers/weekly-lessons is a thin transport adapter (< 50 lines)',
      'PASS',
      `Handler is ${lineCount} lines; transport-only delegation verified`
    );
  } catch (err) {
    recordResult('AC-3-THIN-CONTROLLER', 'Thin route controller check failed', 'FAIL', err.message);
  }

  // Test 2.4: Dead QoS Pruned & Middleware to Proxy Migrated (AC-4)
  try {
    const zoomPath = path.resolve(process.cwd(), 'lib/infrastructure/zoom.js');
    const zoomContent = fs.readFileSync(zoomPath, 'utf-8');
    assert.ok(!zoomContent.includes('fetchZoomMeetingQoS'), 'zoom.js must not contain fetchZoomMeetingQoS');
    assert.ok(!zoomContent.includes('enrichMeetingWithQoS'), 'zoom.js must not contain enrichMeetingWithQoS');

    const middlewarePath = path.resolve(process.cwd(), 'middleware.js');
    assert.ok(!fs.existsSync(middlewarePath), 'middleware.js must be removed');

    const proxyPath = path.resolve(process.cwd(), 'proxy.js');
    assert.ok(fs.existsSync(proxyPath), 'proxy.js must exist');
    const proxyContent = fs.readFileSync(proxyPath, 'utf-8');
    assert.ok(proxyContent.includes('function proxy'), 'proxy.js must export proxy function');
    assert.ok(proxyContent.includes('config = {'), 'proxy.js must export config matcher');
    recordResult(
      'AC-4-QOS-PROXY',
      'Dead QoS functions pruned from zoom.js, middleware.js removed, proxy.js active',
      'PASS',
      `QoS methods absent; proxy.js verified with matcher`
    );
  } catch (err) {
    recordResult('AC-4-QOS-PROXY', 'QoS and proxy verification failed', 'FAIL', err.message);
  }

  // Test 2.5: Domain Isolation (AC-6)
  try {
    const domainDir = path.resolve(process.cwd(), 'lib/domain');
    const domainFiles = fs.readdirSync(domainDir).filter(f => f.endsWith('.js'));
    const illegalPatterns = [
      /from\s*['"][^'"]*infrastructure/i,
      /from\s*['"][^'"]*services/i,
      /from\s*['"]@upstash\/redis/i,
      /from\s*['"]next/i
    ];
    for (const file of domainFiles) {
      const content = fs.readFileSync(path.join(domainDir, file), 'utf-8');
      for (const pattern of illegalPatterns) {
        assert.ok(!pattern.test(content), `Domain module ${file} violates isolation rule: ${pattern}`);
      }
    }
    recordResult(
      'AC-6-DOMAIN-ISOLATION',
      'Domain layer modules (zoom-occurrence.js, comparison-engine.js) have zero infrastructure/Upstash imports',
      'PASS',
      `Scanned ${domainFiles.length} domain modules; strict isolation confirmed`
    );
  } catch (err) {
    recordResult('AC-6-DOMAIN-ISOLATION', 'Domain isolation check failed', 'FAIL', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 3: Local Server Transport Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Group 3: Local Server Transport Verification ---');

  // Test 3.1: Local Weekly Lessons Empty Query
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teacherIds: [] })
    });
    const data = await res.json();
    if (res.status === 200 && data && typeof data.results === 'object') {
      recordResult(
        'E2E-LOCAL-WEEKLY-EMPTY',
        'Local POST /api/teachers/weekly-lessons responds 200 with empty results',
        'PASS',
        `Status: ${res.status}, Body: ${JSON.stringify(data)}`
      );
    } else {
      recordResult('E2E-LOCAL-WEEKLY-EMPTY', 'Local weekly empty failed', 'FAIL', `Status: ${res.status}`);
    }
  } catch (err) {
    recordResult('E2E-LOCAL-WEEKLY-EMPTY', 'Failed to reach local server', 'BLOCKED', err.message);
  }

  // Test 3.2: Local Weekly Lessons Invalid JSON (400 Bad Request)
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/teachers/weekly-lessons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-json'
    });
    const data = await res.json();
    if (res.status === 400 && data.error === 'Invalid JSON body') {
      recordResult(
        'E2E-LOCAL-WEEKLY-400',
        'Local POST /api/teachers/weekly-lessons returns 400 on malformed JSON',
        'PASS',
        `Status: ${res.status}, Error: ${data.error}`
      );
    } else {
      recordResult('E2E-LOCAL-WEEKLY-400', 'Local weekly 400 failed', 'FAIL', `Status: ${res.status}`);
    }
  } catch (err) {
    recordResult('E2E-LOCAL-WEEKLY-400', 'Failed to test local 400', 'BLOCKED', err.message);
  }

  // ------------------------------------------------------------------------
  // Group 4: Stale Import Audit & Cumulative Suite Regression Detection
  // ------------------------------------------------------------------------
  console.log('\n--- Group 4: Cumulative Suite Import Integrity Audit ---');

  const verificationDir = path.resolve(process.cwd(), 'verification/tests');
  const staleVerificationImports = [];
  const stalePattern = /from\s*['"](?:(?:\.\.\/)+|(?:\.\/)+|@\/)?lib\/[a-zA-Z0-9_\-]+(?:\.js)?['"]/;

  if (fs.existsSync(verificationDir)) {
    const testFiles = fs.readdirSync(verificationDir).filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
    for (const f of testFiles) {
      const fullPath = path.join(verificationDir, f);
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (stalePattern.test(content)) {
        staleVerificationImports.push(f);
      }
    }
  }

  if (staleVerificationImports.length === 0) {
    recordResult(
      'AC-5-CUMULATIVE-IMPORTS',
      'All cumulative E2E verification test suites have up-to-date modular imports',
      'PASS',
      'Zero stale imports found in verification/tests/'
    );
  } else {
    recordResult(
      'AC-5-CUMULATIVE-IMPORTS',
      'Stale flat lib/ imports detected in verification/tests/ suites',
      'FAIL',
      `Found ${staleVerificationImports.length} broken test files: ${staleVerificationImports.join(', ')}`
    );
  }

  // ------------------------------------------------------------------------
  // Summary & Export Evidence
  // ------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const blocked = results.filter(r => r.status === 'BLOCKED').length;

  console.log('\n========================================================================');
  console.log(`📊 VERIFICATION RUN SUMMARY: ${passed}/${total} PASS, ${failed} FAIL, ${blocked} BLOCKED`);
  console.log('========================================================================');

  const evidence = {
    suite: 'CRM-008 Vertical Slice Module Structure E2E Verification',
    timestamp: new Date().toISOString(),
    vercelBaseUrl: VERCEL_BASE_URL,
    localBaseUrl: LOCAL_BASE_URL,
    totalScenarios: total,
    passed,
    failed,
    blocked,
    results
  };

  const evidencePath = path.resolve(process.cwd(), 'verification/evidence/crm-008-vercel-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
  console.log(`Evidence saved to ${evidencePath}`);

  return { passed, failed, blocked, total };
}

runVerification().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
