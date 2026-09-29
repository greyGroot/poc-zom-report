// ee-crm/test-crm-008.js
// Unit & Integration Test Suite for CRM-008: Vertical Slice Module Structure Refactoring

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as zoomModule from './lib/infrastructure/zoom.js';
import {
  getCurrentWeekRange,
  normalizeTeacherName,
  buildTeacherLookups,
  resolveTeacher,
  aggregateSchedulerLessons,
  getWeeklyLessonSummaries
} from './lib/services/weekly-schedule-service.js';
import { SchoolmateUnavailableError } from './lib/infrastructure/schoolmate.js';
import {
  determineExitCode,
  determineVerificationExitCode
} from './verification/tests/crm-008-vertical-slice.e2e.mjs';

console.log('====================================================');
console.log('🧪 CRM-008 Target Vertical Slice Module Structure Suite');
console.log('====================================================\n');

let passedCount = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 1. ADR-001 Documentation & Governance (AC-1)
// ----------------------------------------------------------------------------
console.log('--- 1. ADR-001 Architecture Decision Record ---');

await test('Scenario 1: ADR-001 is documented with required layout, matrix, and layering rules', () => {
  const adrPath = path.resolve(process.cwd(), 'docs/architecture/ADR-001-target-architecture-and-module-boundaries.md');
  assert.ok(fs.existsSync(adrPath), 'ADR-001 document must exist');

  const content = fs.readFileSync(adrPath, 'utf-8');
  assert.ok(content.includes('## Status'), 'ADR-001 must contain Status');
  assert.ok(content.includes('## Context'), 'ADR-001 must contain Context');
  assert.ok(content.includes('## Target Module Layout'), 'ADR-001 must define Target Module Layout');
  assert.ok(content.includes('## Layer Responsibility Ownership Matrix'), 'ADR-001 must define Responsibility Matrix');
  assert.ok(content.includes('## Dependency Direction & Rules'), 'ADR-001 must define Dependency Direction');
  assert.ok(content.includes('Domain Isolation'), 'ADR-001 must enforce Domain Isolation');
  assert.ok(content.includes('Thin Controllers'), 'ADR-001 must enforce Thin Controllers');
});

// ----------------------------------------------------------------------------
// 2. Directory Layout & Root Lib Cleanliness (AC-2)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Directory Layout & Root Lib Cleanliness ---');

await test('Scenario 2: lib/ contains domain, services, infrastructure, utils, shared and zero root files', () => {
  const libDir = path.resolve(process.cwd(), 'lib');
  const requiredDirs = ['domain', 'services', 'infrastructure', 'utils', 'shared'];

  for (const dir of requiredDirs) {
    const dirPath = path.join(libDir, dir);
    assert.ok(fs.existsSync(dirPath), `lib/${dir} directory must exist`);
    assert.ok(fs.statSync(dirPath).isDirectory(), `lib/${dir} must be a directory`);
  }

  // Verify zero files directly in root of lib/
  const rootEntries = fs.readdirSync(libDir, { withFileTypes: true });
  const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
  assert.deepEqual(rootFiles, [], `lib/ root must not contain any files: ${rootFiles.join(', ')}`);
});

// ----------------------------------------------------------------------------
// 3. Domain Isolation & Dependency Boundaries (AC-6)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Domain Isolation & Layer Dependency Rules ---');

await test('Scenario 3: Domain layer modules never import infrastructure, services, or Upstash', () => {
  const domainDir = path.resolve(process.cwd(), 'lib/domain');
  const domainFiles = fs.readdirSync(domainDir).filter(f => f.endsWith('.js'));
  assert.ok(domainFiles.length >= 2, 'Domain directory should contain comparison-engine.js and zoom-occurrence.js');

  const illegalDomainPatterns = [
    /from\s*['"][^'"]*infrastructure/i,
    /from\s*['"][^'"]*services/i,
    /from\s*['"]@upstash\/redis/i,
    /from\s*['"]next/i
  ];

  for (const file of domainFiles) {
    const fullPath = path.join(domainDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const pattern of illegalDomainPatterns) {
      assert.ok(
        !pattern.test(content),
        `Domain module lib/domain/${file} violates dependency rule with: ${pattern}`
      );
    }
  }

  // Also check utils/ has no imports from infrastructure or services
  const utilsDir = path.resolve(process.cwd(), 'lib/utils');
  const utilsFiles = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));
  for (const file of utilsFiles) {
    const fullPath = path.join(utilsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(!/from\s*['"][^'"]*infrastructure/i.test(content), `Utils module lib/utils/${file} must not import infrastructure`);
    assert.ok(!/from\s*['"][^'"]*services/i.test(content), `Utils module lib/utils/${file} must not import services`);
  }
});

// ----------------------------------------------------------------------------
// 4. Dead QoS Pruning & Proxy Migration (AC-4)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Dead QoS Pruning & Next.js Proxy Migration ---');

await test('Scenario 4a: fetchZoomMeetingQoS and enrichMeetingWithQoS are pruned from zoom.js', () => {
  assert.equal(zoomModule.fetchZoomMeetingQoS, undefined, 'fetchZoomMeetingQoS must not be exported');
  assert.equal(zoomModule.enrichMeetingWithQoS, undefined, 'enrichMeetingWithQoS must not be exported');

  const zoomContent = fs.readFileSync(path.resolve(process.cwd(), 'lib/infrastructure/zoom.js'), 'utf-8');
  assert.ok(!zoomContent.includes('fetchZoomMeetingQoS'), 'zoom.js must not contain fetchZoomMeetingQoS');
  assert.ok(!zoomContent.includes('enrichMeetingWithQoS'), 'zoom.js must not contain enrichMeetingWithQoS');
});

await test('Scenario 4b: middleware.js is removed and proxy.js exists with correct matcher', () => {
  const middlewarePath = path.resolve(process.cwd(), 'middleware.js');
  const proxyPath = path.resolve(process.cwd(), 'proxy.js');

  assert.equal(fs.existsSync(middlewarePath), false, 'middleware.js must be removed');
  assert.equal(fs.existsSync(proxyPath), true, 'proxy.js must exist');

  const proxyContent = fs.readFileSync(proxyPath, 'utf-8');
  assert.ok(proxyContent.includes('withAuth'), 'proxy.js must use withAuth');
  assert.ok(proxyContent.includes('export const config = {'), 'proxy.js must export config');
  assert.ok(proxyContent.includes('api/auth'), 'proxy.js matcher must exclude api/auth');
  assert.ok(proxyContent.includes('api/health'), 'proxy.js matcher must exclude api/health');
  assert.ok(proxyContent.includes('api/webhooks'), 'proxy.js matcher must exclude api/webhooks');
});

// ----------------------------------------------------------------------------
// 5. Weekly Schedule Pure Helpers (AC-3 unit)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Weekly Schedule Service Pure Helpers ---');

await test('Scenario 5a: getCurrentWeekRange calculates Monday-Sunday accurately across week days and Sunday', () => {
  // Monday 2026-09-21
  const mon = new Date('2026-09-21T12:00:00Z');
  const monRange = getCurrentWeekRange(mon);
  assert.equal(monRange.fromDate, '2026-09-21');
  assert.equal(monRange.toDate, '2026-09-27');
  assert.equal(monRange.weekKey, '2026-09-21');

  // Wednesday 2026-09-23
  const wed = new Date('2026-09-23T15:30:00Z');
  const wedRange = getCurrentWeekRange(wed);
  assert.equal(wedRange.fromDate, '2026-09-21');
  assert.equal(wedRange.toDate, '2026-09-27');

  // Sunday 2026-09-27 (day === 0)
  const sun = new Date('2026-09-27T12:00:00Z');
  const sunRange = getCurrentWeekRange(sun);
  assert.equal(sunRange.fromDate, '2026-09-21');
  assert.equal(sunRange.toDate, '2026-09-27');
});

await test('Scenario 5b: normalizeTeacherName normalizes casing, apostrophes, and spacing', () => {
  assert.equal(normalizeTeacherName("O'Connor"), "o'connor");
  assert.equal(normalizeTeacherName("O`Connor"), "o'connor");
  assert.equal(normalizeTeacherName("O’Connor"), "o'connor");
  assert.equal(normalizeTeacherName("  Iryna   Zhuravlova  "), "iryna zhuravlova");
  assert.equal(normalizeTeacherName(null), "");
});

await test('Scenario 5c: buildTeacherLookups and resolveTeacher handle full, reversed, and surname matching', () => {
  const dbTeachers = [
    { schoolmateTeacherId: 101, firstName: 'Iryna', lastName: 'Zhuravlova', fullName: 'Zhuravlova Iryna' },
    { schoolmateTeacherId: 102, firstName: 'Yuliia', lastName: 'Savchuk', fullName: 'Yuliia Savchuk' },
    { schoolmateTeacherId: 103, firstName: 'Anna', lastName: 'Kovalenko', fullName: 'Anna Kovalenko' },
    { schoolmateTeacherId: 104, firstName: 'Maria', lastName: 'Kovalenko', fullName: 'Maria Kovalenko' } // Ambiguous surname!
  ];

  const lookups = buildTeacherLookups(dbTeachers);

  // Exact full name match
  assert.equal(resolveTeacher('Zhuravlova Iryna', lookups)?.schoolmateTeacherId, 101);
  // First Last match
  assert.equal(resolveTeacher('Iryna Zhuravlova', lookups)?.schoolmateTeacherId, 101);
  // Reversed match
  assert.equal(resolveTeacher('Savchuk Yuliia', lookups)?.schoolmateTeacherId, 102);
  // Unique surname match
  assert.equal(resolveTeacher('Savchuk', lookups)?.schoolmateTeacherId, 102);
  // Ambiguous surname: Kovalenko matches 2 teachers, should NOT guess
  assert.equal(resolveTeacher('Kovalenko', lookups), null);
  // Unknown teacher
  assert.equal(resolveTeacher('Nonexistent Teacher', lookups), null);
});

await test('Scenario 5d: aggregateSchedulerLessons deduplicates GroupLessonId and defaults duration', () => {
  const dbTeachers = [
    { schoolmateTeacherId: 101, firstName: 'Iryna', lastName: 'Zhuravlova', fullName: 'Iryna Zhuravlova' }
  ];

  const events = [
    {
      SchedulerLessons: [
        { GroupLessonId: 'L-1', Teacher: 'Iryna Zhuravlova', DefaultLessonLength: 45 },
        { GroupLessonId: 'L-1', Teacher: 'Iryna Zhuravlova', DefaultLessonLength: 45 }, // Duplicate!
        { GroupLessonId: 'L-2', Teacher: 'Iryna Zhuravlova' } // Missing DefaultLessonLength -> defaults to 60
      ]
    }
  ];

  const summaries = aggregateSchedulerLessons(events, dbTeachers, { nowIso: '2026-09-27T12:00:00Z' });
  const irynaSummary = summaries.get(101);

  assert.ok(irynaSummary, 'Iryna summary must exist');
  assert.equal(irynaSummary.totalLessons, 2, 'Must deduplicate duplicate GroupLessonId');
  assert.equal(irynaSummary.totalMinutes, 105, '45 + 60 default = 105 minutes');
  assert.equal(irynaSummary.totalWage, '0 ₴');
});

// ----------------------------------------------------------------------------
// 6. Weekly Schedule Service & Thin Route Integration (AC-3)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Weekly Schedule Service Orchestration & Route Thinness ---');

await test('Scenario 6a: getWeeklyLessonSummaries handles cache hits and misses with TTL', async () => {
  const cachedDb = {
    cacheStore: new Map([[101, { totalLessons: 5, totalMinutes: 300, totalWage: '0 ₴' }]]),
    savedBatch: null,
    async getWeeklyLessonsCache(weekKey, ids) {
      const res = new Map();
      for (const id of ids) {
        if (this.cacheStore.has(id)) res.set(id, this.cacheStore.get(id));
      }
      return res;
    },
    async setMultipleWeeklyLessonsCache(weekKey, summaries, ttl) {
      this.savedBatch = { weekKey, summaries, ttl };
    },
    async getTeachers() {
      return [
        { schoolmateTeacherId: 101, fullName: 'Iryna Zhuravlova' },
        { schoolmateTeacherId: 102, fullName: 'Yuliia Savchuk' }
      ];
    }
  };

  const mockClient = {
    schedulerCalled: false,
    async getSchedulerEvents({ date }) {
      this.schedulerCalled = true;
      return {
        events: [
          {
            SchedulerLessons: [
              { GroupLessonId: 'S-1', Teacher: 'Yuliia Savchuk', DefaultLessonLength: 60 }
            ]
          }
        ]
      };
    }
  };

  // 1. Partial cache hit: teacher 101 is cached, teacher 102 is uncached
  const res = await getWeeklyLessonSummaries({
    teacherIds: [101, 102],
    fromDate: '2026-09-21',
    toDate: '2026-09-27',
    schoolmateClient: mockClient,
    db: cachedDb
  });

  assert.equal(res.results[101].cached, true);
  assert.equal(res.results[101].totalLessons, 5);

  assert.equal(res.results[102].cached, false);
  assert.equal(res.results[102].totalLessons, 1);
  assert.equal(res.results[102].totalMinutes, 60);

  assert.ok(mockClient.schedulerCalled, 'Scheduler must be called for uncached teacher');
  assert.equal(cachedDb.savedBatch?.ttl, 86400, 'Batch cache must be saved with 24h TTL (86400s)');
});

await test('Scenario 6b: SchoolmateUnavailableError bubbles through service for route mapping', async () => {
  const emptyDb = {
    async getWeeklyLessonsCache() { return new Map(); },
    async setMultipleWeeklyLessonsCache() {},
    async getTeachers() { return []; }
  };

  const failingClient = {
    async getSchedulerEvents() {
      throw new SchoolmateUnavailableError('Simulated Schoolmate timeout', new Error('ETIMEDOUT'));
    }
  };

  await assert.rejects(
    async () => {
      await getWeeklyLessonSummaries({
        teacherIds: [101],
        schoolmateClient: failingClient,
        db: emptyDb
      });
    },
    err => {
      assert.ok(err instanceof SchoolmateUnavailableError);
      return true;
    },
    'Service must propagate SchoolmateUnavailableError without suppressing it'
  );
});

await test('Scenario 6c: weekly-lessons route.js is a thin transport adapter', () => {
  const routeContent = fs.readFileSync(path.resolve(process.cwd(), 'app/api/teachers/weekly-lessons/route.js'), 'utf-8');
  assert.ok(routeContent.includes("from '@/lib/services/weekly-schedule-service.js'"), 'Route must import weekly-schedule-service');
  assert.ok(!routeContent.includes('new SchoolmateClient'), 'Route must NOT instantiate SchoolmateClient directly');
  assert.ok(!routeContent.includes('getWeeklyLessonsCache'), 'Route must NOT call getWeeklyLessonsCache directly');
  assert.ok(!routeContent.includes('SchedulerLessons'), 'Route must NOT iterate SchedulerLessons');
  assert.ok(routeContent.includes('isSchoolmateUnavailableError'), 'Route must retain 503 error transport mapping');
});

await test('Scenario 6d: fetchTeachersList throwing SchoolmateUnavailableError when dbTeachers is empty bubbles up', async () => {
  const emptyDb = {
    async getWeeklyLessonsCache() { return new Map(); },
    async setMultipleWeeklyLessonsCache() {},
    async getTeachers() { return []; } // Empty DB teachers
  };

  const clientWithFailingTeacherList = {
    async getSchedulerEvents({ date }) {
      return { events: [] }; // Scheduler succeeds
    },
    async fetchTeachersList({ pageSize }) {
      throw new SchoolmateUnavailableError('Simulated Schoolmate timeout on teachers list', new Error('ETIMEDOUT'));
    }
  };

  await assert.rejects(
    async () => {
      await getWeeklyLessonSummaries({
        teacherIds: [101],
        schoolmateClient: clientWithFailingTeacherList,
        db: emptyDb
      });
    },
    err => {
      assert.ok(err instanceof SchoolmateUnavailableError);
      return true;
    },
    'Service must propagate SchoolmateUnavailableError when fallback fetchTeachersList fails'
  );
});

// ----------------------------------------------------------------------------
// 7. Whole-Repository Import Cleanliness
// ----------------------------------------------------------------------------
console.log('\n--- 7. Whole-Repository Stale-Import Integrity ---');

await test('Scenario 7: Zero stale flat lib imports remain across app, scripts, tests, and verification suites', () => {
  function scan(dir, list = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (['node_modules', '.next', '.git'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(process.cwd(), full).replace(/\\/g, '/');
      if (rel.startsWith('verification/archive') || rel.startsWith('verification/evidence')) continue;
      if (e.isDirectory()) scan(full, list);
      else if (/\.(js|jsx|mjs|cjs)$/.test(e.name)) list.push(full);
    }
    return list;
  }

  const allFiles = scan(process.cwd());
  const stalePattern = /from\s*['"](?:\.\/|\.\.\/|@\/)?lib\/[a-zA-Z0-9_\-]+(?:\.js)?['"]/;

  const badFiles = [];
  for (const f of allFiles) {
    const rel = path.relative(process.cwd(), f);
    if (rel.startsWith('lib\\') || rel.startsWith('lib/')) continue;
    const content = fs.readFileSync(f, 'utf-8');
    if (stalePattern.test(content)) {
      badFiles.push(rel);
    }
  }

  assert.deepEqual(badFiles, [], `Files with stale flat lib imports: ${badFiles.join(', ')}`);
});

// ----------------------------------------------------------------------------
// 8. Verification Suite Exit Semantics & Deterministic Failure Exit Coverage
// ----------------------------------------------------------------------------
console.log('\n--- 8. Verification Suite Exit Semantics & Failure Guards ---');

await test('Scenario 8a: determineVerificationExitCode returns 0 when all scenarios PASS (failed = 0, blocked = 0)', () => {
  assert.equal(determineVerificationExitCode({ passed: 14, failed: 0, blocked: 0, total: 14 }), 0);
  assert.equal(determineExitCode({ passed: 14, failed: 0, blocked: 0, total: 14 }), 0);
  assert.equal(determineVerificationExitCode([
    { id: 'E2E-PROD-HEALTH', status: 'PASS' },
    { id: 'AC-1-ADR-001', status: 'PASS' }
  ]), 0);
});

await test('Scenario 8b: determineVerificationExitCode returns non-zero when at least one scenario FAILS (failed > 0)', () => {
  const codeCount = determineVerificationExitCode({ passed: 13, failed: 1, blocked: 0, total: 14 });
  assert.notEqual(codeCount, 0, 'Exit code must be non-zero when failed > 0');
  assert.equal(codeCount, 1);

  const codeArray = determineVerificationExitCode([
    { id: 'E2E-PROD-HEALTH', status: 'PASS' },
    { id: 'AC-1-ADR-001', status: 'FAIL' }
  ]);
  assert.notEqual(codeArray, 0, 'Exit code must be non-zero when failed > 0');
  assert.equal(codeArray, 1);
});

await test('Scenario 8c: determineVerificationExitCode returns non-zero when at least one required scenario is BLOCKED (blocked > 0)', () => {
  const codeCount = determineVerificationExitCode({ passed: 12, failed: 0, blocked: 2, total: 14 });
  assert.notEqual(codeCount, 0, 'Exit code must be non-zero when blocked > 0');
  assert.equal(codeCount, 1);

  const codeArray = determineVerificationExitCode([
    { id: 'E2E-PROD-HEALTH', status: 'PASS' },
    { id: 'E2E-LOCAL-WEEKLY-EMPTY', status: 'BLOCKED' }
  ]);
  assert.notEqual(codeArray, 0, 'Exit code must be non-zero when blocked > 0');
  assert.equal(codeArray, 1);
});

await test('Scenario 8d: Subprocess exit code reflects determineVerificationExitCode deterministically without live dependencies', async () => {
  const runSubprocessProbe = (payload) => {
    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          '-e',
          `import { determineExitCode } from './verification/tests/crm-008-vertical-slice.e2e.mjs';
           const code = determineExitCode(${JSON.stringify(payload)});
           process.exit(code);`
        ],
        { stdio: 'ignore' }
      );
      child.on('close', code => resolve(code));
    });
  };

  // 1. All PASS -> child process exits with code 0
  const passExit = await runSubprocessProbe({ passed: 10, failed: 0, blocked: 0 });
  assert.equal(passExit, 0, 'Process must exit with 0 for all-pass scenario');

  // 2. 1 FAIL -> child process exits non-zero (1)
  const failExit = await runSubprocessProbe({ passed: 9, failed: 1, blocked: 0 });
  assert.equal(failExit, 1, 'Process must exit with 1 for failing scenario');

  // 3. 1 BLOCKED -> child process exits non-zero (1)
  const blockedExit = await runSubprocessProbe({ passed: 9, failed: 0, blocked: 1 });
  assert.equal(blockedExit, 1, 'Process must exit with 1 for blocked required scenario');
});

console.log('\n====================================================');
console.log(`🎉 ALL ${passedCount} CRM-008 ACCEPTANCE TESTS PASSED!`);
console.log('====================================================\n');
