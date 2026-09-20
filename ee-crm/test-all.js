// ee-crm/test-all.js
// Runs full verification suite for all integrations

import { spawn } from 'node:child_process';

const tests = [
  { name: 'PDF Parser Test', file: 'test-parser.js' },
  { name: 'Database & Logging Test', file: 'test-db.js' },
  { name: 'Live Schoolmate API Test', file: 'test-schoolmate.js' }
];

async function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================`);
    console.log(`RUNNING: ${test.name} (${test.file})`);
    console.log(`========================================`);

    const p = spawn('node', [test.file], { stdio: 'inherit' });
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
