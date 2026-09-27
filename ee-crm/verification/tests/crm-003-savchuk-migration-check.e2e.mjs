// ee-crm/verification/tests/crm-003-savchuk-migration-check.e2e.mjs
// 
// REAL production E2E check: Does Savchuk's September 25 Zoom data
// actually exist in the deployed EE-CRM?
//
// This test hits the REAL Vercel deployment — no mocks.
// It will FAIL until:
//   1. CRM-003 code is committed and deployed to Vercel
//   2. The migration script is executed against production Upstash Redis
//
// Evidence source: poc-zoom-report shows meeting ID 5445746456 on 2026-09-25
//   Host: yuliasavchuk03@gmail.com (Юлія Савчук)
//   Students: bevz.s, Анна Козачук
//   Duration: 13:02–14:08 (66 min)

const VERCEL_BASE = 'https://poc-zom-report-2qvs.vercel.app';
const SAVCHUK_TEACHER_ID = 't_759a0536';  // from the EE-CRM URL in screenshot
const FROM = '2026-09-25';
const TO = '2026-09-25';

const results = [];

function record(id, description, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '🚫';
  console.log(`${icon} [${status}] ${id}: ${description}`);
  if (details) console.log(`    ↳ ${details}`);
  results.push({ id, description, status, details });
}

console.log('================================================================');
console.log('🔍 CRM-003 PRODUCTION MIGRATION CHECK — Savchuk Yuliia');
console.log(`   Target: ${VERCEL_BASE}`);
console.log(`   Teacher: yuliasavchuk03@gmail.com (Schoolmate ID: 17251)`);
console.log(`   Date: ${FROM}`);
console.log(`   Timestamp: ${new Date().toISOString()}`);
console.log('================================================================\n');

// ── Check 1: Is the EE-CRM teacher page API reachable without auth redirect? ──
console.log('--- Check 1: Teacher API accessibility ---');
try {
  const url = `${VERCEL_BASE}/api/teachers/${SAVCHUK_TEACHER_ID}/zoom-meetings?from=${FROM}&to=${TO}`;
  const res = await fetch(url, { redirect: 'manual' });

  if (res.status === 307 || res.status === 302) {
    const location = res.headers.get('location');
    record(
      'API-ACCESS',
      'Teacher Zoom meetings API is accessible without auth redirect',
      'FAIL',
      `HTTP ${res.status} redirect to ${location}. The API is blocked by NextAuth. CRM-003 middleware exemption may not cover teacher API (expected — teacher routes should be protected), OR you need to be authenticated.`
    );
  } else if (res.status === 200) {
    record('API-ACCESS', 'Teacher Zoom meetings API is accessible', 'PASS', `HTTP 200`);
  } else {
    record('API-ACCESS', 'Teacher Zoom meetings API is accessible', 'FAIL', `HTTP ${res.status}`);
  }
} catch (err) {
  record('API-ACCESS', 'Teacher Zoom meetings API is accessible', 'FAIL', err.message);
}

// ── Check 2: Does the webhook endpoint accept requests (CRM-003 deployed)? ──
console.log('\n--- Check 2: Webhook endpoint deployment status ---');
try {
  const res = await fetch(`${VERCEL_BASE}/api/webhooks/zoom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'endpoint.url_validation',
      payload: { plainToken: 'test_probe_token' }
    }),
    redirect: 'manual'
  });

  if (res.status === 307 || res.status === 302) {
    record(
      'WEBHOOK-DEPLOYED',
      'CRM-003 middleware exemption is deployed (webhook not redirected)',
      'FAIL',
      `HTTP ${res.status} → ${res.headers.get('location')}. CRM-003 is NOT deployed to Vercel yet.`
    );
  } else if (res.status === 200) {
    record('WEBHOOK-DEPLOYED', 'CRM-003 middleware exemption is deployed', 'PASS', 'HTTP 200 — webhook handler reached directly');
  } else {
    record('WEBHOOK-DEPLOYED', 'CRM-003 middleware exemption is deployed', 'FAIL', `HTTP ${res.status}`);
  }
} catch (err) {
  record('WEBHOOK-DEPLOYED', 'CRM-003 middleware exemption is deployed', 'FAIL', err.message);
}

// ── Check 3: Does the teacher page show Zoom meetings for Savchuk? ──
// We scrape the actual teacher page HTML to check for "No tracked Zoom meetings"
console.log('\n--- Check 3: Savchuk teacher page shows Zoom data (not empty state) ---');
try {
  const pageUrl = `${VERCEL_BASE}/teachers/${SAVCHUK_TEACHER_ID}?from=${FROM}&to=${TO}&preset=yesterday`;
  const res = await fetch(pageUrl, { redirect: 'manual' });

  if (res.status === 307 || res.status === 302) {
    record(
      'SAVCHUK-HAS-DATA',
      'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25',
      'FAIL',
      `HTTP ${res.status} redirect to login. Cannot verify — page requires authentication. After deploying CRM-003 and running migration, log in and check manually.`
    );
  } else if (res.status === 200) {
    const html = await res.text();
    const hasEmptyState = html.includes('No tracked Zoom meetings') || html.includes('No Zoom meeting occurrences');
    const hasMeetingData = html.includes('5445746456') || html.includes('Юлія Савчук') || html.includes('Personal Meeting Room');

    if (hasEmptyState && !hasMeetingData) {
      record(
        'SAVCHUK-HAS-DATA',
        'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25',
        'FAIL',
        'Page renders "No tracked Zoom meetings" empty state. Migration has NOT been executed against production Redis.'
      );
    } else if (hasMeetingData) {
      record(
        'SAVCHUK-HAS-DATA',
        'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25',
        'PASS',
        'Meeting data found on page — migration successful.'
      );
    } else {
      record(
        'SAVCHUK-HAS-DATA',
        'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25',
        'FAIL',
        'Page loaded but could not determine if meeting data is present. Manual inspection required.'
      );
    }
  } else {
    record('SAVCHUK-HAS-DATA', 'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25', 'FAIL', `HTTP ${res.status}`);
  }
} catch (err) {
  record('SAVCHUK-HAS-DATA', 'Savchuk teacher page shows migrated Zoom meetings for 2026-09-25', 'FAIL', err.message);
}

// ── Summary ──
console.log('\n================================================================');
const pass = results.filter(r => r.status === 'PASS').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`SUMMARY: ${pass} PASSED, ${fail} FAILED out of ${results.length} checks`);

if (fail > 0) {
  console.log('\n⚠️  MIGRATION IS NOT COMPLETE. To fix:');
  console.log('   1. Commit and push CRM-003 changes to main');
  console.log('   2. Wait for Vercel deployment to complete');
  console.log('   3. Run: npm run migrate:zoom:dry-run   (audit first)');
  console.log('   4. Run: npm run migrate:zoom:execute   (backfill production Redis)');
  console.log('   5. Re-run this test to verify');
}

console.log('================================================================\n');
process.exit(fail > 0 ? 1 : 0);
