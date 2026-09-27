// ee-crm/test-all.js
// Runs full verification suite for all integrations

import { spawn } from 'node:child_process';

const tests = [
  { name: 'PDF Parser Test', file: 'test-parser.js' },
  { name: 'Database & Logging Test', file: 'test-db.js' },
  { name: 'Zoom Occurrences Test', file: 'test-zoom-occurrences.js' },
  { name: 'CRM-002 Teacher-Day Details Test', file: 'test-crm-002.js' },
  { name: 'CRM-004 Teacher-Day Comparison Test', file: 'test-crm-004.js' },
  { name: 'CRM-005 Zoom Migration & Ingestion Test', file: 'test-crm-005.js' },
  { name: 'CRM-006 Persistence Fallbacks & Reliability Test', file: 'test-crm-006.js' },
  { name: 'CRM-007 Network Reliability Test', file: 'test-crm-007.js' },
  { name: 'CRM-008 Vertical Slice Architecture Test', file: 'test-crm-008.js' },
  { name: 'Live Schoolmate API Test', file: 'test-schoolmate.js' }
];

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

async function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================`);
    console.log(`RUNNING: ${test.name} (${test.file})`);
    console.log(`========================================`);

    const p = spawn('node', [test.file], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test' }
    });
    p.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${test.name} failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  const start = Date.now();
  for (const t of tests) {
    await runTest(t);
  }
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n========================================`);
  console.log(`🎉 ALL INTEGRATION SUITES PASSED! (${duration}s)`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('\n❌ Suite failed:', err.message);
  process.exit(1);
});
