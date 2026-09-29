// ee-crm/test-crm-013-zoom-backfill.js
// Automated test suite for CRM-013: Zoom Raw Events Backfill, Projection Invariants & Teacher Query Integrity.

import assert from 'node:assert/strict';
import path from 'node:path';
import {
  InMemoryRedis,
  setRedisClient,
  resetRedisClient
} from './lib/infrastructure/redis.js';
import {
  backfillZoomRawEvents,
  HOST_MAPPINGS
} from './scripts/crm-013/backfill-zoom-raw-events.js';
import {
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay
} from './lib/infrastructure/zoom-occurrences.js';
import { getKyivDateString } from './lib/utils/timezone.js';

async function runTests() {
  console.log('🧪 Starting CRM-013 Zoom Backfill Test Suite...\n');

  // Setup isolated InMemoryRedis
  const mockRedis = new InMemoryRedis();
  setRedisClient(mockRedis);

  try {
    // Test 1: Dry-Run Mode Backfill
    console.log('--- Test 1: Dry-Run Mode Backfill Execution ---');
    const dryRunResult = await backfillZoomRawEvents({
      dryRun: true,
      redisClient: mockRedis
    });

    assert.equal(dryRunResult.success, true, 'Dry run should succeed');
    assert.equal(dryRunResult.totalEventsInFixture, 318, 'Total fixture events should be 318');
    assert.equal(dryRunResult.filteredEventsCount, 49, 'Filtered 26-29 Sep events should be 49');
    assert.equal(dryRunResult.occurrencesRestoredCount, 12, 'Should restore exactly 12 occurrences');
    assert.equal(dryRunResult.hostBreakdown['helhakushnirchuk@gmail.com'], 10, 'Olha should have 10 occurrences');
    assert.equal(dryRunResult.hostBreakdown['zhur.zhur.irene@gmail.com'], 2, 'Irina should have 2 occurrences');
    assert.equal(dryRunResult.errors.length, 0, 'Should have zero validation errors');

    // Confirm nothing was persisted in dry run
    const keysInMock = await mockRedis.keys('*');
    assert.equal(keysInMock.length, 0, 'No keys should be written to Redis in dry run mode');
    console.log('✅ Test 1 Passed: Dry run correctly parsed 49 events into 12 valid occurrences without writing to Redis.');

    // Test 2: Execute Mode Backfill into Redis
    console.log('\n--- Test 2: Execute Mode Backfill into Redis ---');
    const executeResult = await backfillZoomRawEvents({
      dryRun: false,
      redisClient: mockRedis
    });

    assert.equal(executeResult.success, true, 'Execute backfill should succeed');
    assert.equal(executeResult.occurrencesRestoredCount, 12, 'Should restore 12 occurrences');

    const keysAfterExec = await mockRedis.keys('*');
    assert.ok(keysAfterExec.length > 0, 'Keys should be written to Redis in execute mode');
    console.log(`✅ Test 2 Passed: Ingested 12 occurrences into Redis (${keysAfterExec.length} total keys created).`);

    // Test 3: Teacher Query Integrity (Olha Kushnirchuk)
    console.log('\n--- Test 3: Query Occurrences for Olha Kushnirchuk ---');
    const olhaAll = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'helhakushnirchuk@gmail.com',
      fromDate: '2026-09-26',
      toDate: '2026-09-29'
    });

    assert.equal(olhaAll.length, 10, `Olha should have 10 occurrences across 26-29 Sep (got ${olhaAll.length})`);

    // Breakdown per day
    const olhaSep26 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'helhakushnirchuk@gmail.com',
      fromDate: '2026-09-26',
      toDate: '2026-09-26'
    });
    assert.equal(olhaSep26.length, 3, 'Olha should have 3 occurrences on 2026-09-26');

    const olhaSep28 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'helhakushnirchuk@gmail.com',
      fromDate: '2026-09-28',
      toDate: '2026-09-28'
    });
    assert.equal(olhaSep28.length, 2, 'Olha should have 2 occurrences on 2026-09-28');

    const olhaSep29 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'helhakushnirchuk@gmail.com',
      fromDate: '2026-09-29',
      toDate: '2026-09-29'
    });
    assert.equal(olhaSep29.length, 5, 'Olha should have 5 occurrences on 2026-09-29');

    console.log('✅ Test 3 Passed: Olha Kushnirchuk queries match expected date counts (3 on Sep 26, 2 on Sep 28, 5 on Sep 29).');

    // Test 4: Teacher Query Integrity (Irina Zhuravleva)
    console.log('\n--- Test 4: Query Occurrences for Irina Zhuravleva ---');
    const irinaAll = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'zhur.zhur.irene@gmail.com',
      fromDate: '2026-09-26',
      toDate: '2026-09-29'
    });

    assert.equal(irinaAll.length, 2, `Irina should have 2 occurrences across 26-29 Sep (got ${irinaAll.length})`);

    const irinaSep27 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'zhur.zhur.irene@gmail.com',
      fromDate: '2026-09-27',
      toDate: '2026-09-27'
    });
    assert.equal(irinaSep27.length, 1, 'Irina should have 1 occurrence on 2026-09-27');

    const irinaSep29 = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'zhur.zhur.irene@gmail.com',
      fromDate: '2026-09-29',
      toDate: '2026-09-29'
    });
    assert.equal(irinaSep29.length, 1, 'Irina should have 1 occurrence on 2026-09-29');

    console.log('✅ Test 4 Passed: Irina Zhuravleva queries match expected date counts (1 on Sep 27, 1 on Sep 29).');

    // Test 5: Invariants & Format for Display
    console.log('\n--- Test 5: Validate Invariants & Display Formatting ---');
    for (const occ of olhaAll) {
      assert.ok(occ.uuid, 'Occurrence must have a valid uuid');
      assert.equal(occ.host_email, 'helhakushnirchuk@gmail.com', 'Host email must be normalized');
      assert.ok(occ.start_time, 'Start time must be defined');

      const formatted = formatOccurrenceForDisplay(occ);
      assert.ok(formatted.id, 'Formatted occurrence must have safe ID');
      assert.ok(formatted.startTime, 'Formatted occurrence must have startTime');
      assert.ok(['complete', 'incomplete', 'unavailable'].includes(formatted.durationState), 'Valid duration state');
      assert.ok(Array.isArray(formatted.participants), 'Formatted participants must be array');
    }
    console.log('✅ Test 5 Passed: All reconstructed occurrences satisfy invariants and format for display properly.');

    // Test 6: Idempotency & Re-execution Safety
    console.log('\n--- Test 6: Re-run Backfill to Verify Idempotency ---');
    const rerunResult = await backfillZoomRawEvents({
      dryRun: false,
      redisClient: mockRedis
    });

    assert.equal(rerunResult.success, true, 'Re-run backfill should succeed');
    assert.equal(rerunResult.occurrencesRestoredCount, 12, 'Re-run should still report 12 occurrences');

    const olhaRerun = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'helhakushnirchuk@gmail.com',
      fromDate: '2026-09-26',
      toDate: '2026-09-29'
    });
    assert.equal(olhaRerun.length, 10, 'Occurrence count must not change on re-run');
    console.log('✅ Test 6 Passed: Backfill is strictly idempotent.');

    console.log('\n🎉 ALL CRM-013 ZOOM BACKFILL TESTS PASSED SUCCESSFULLY!');
  } finally {
    resetRedisClient();
  }
}

runTests().catch(err => {
  console.error('\n❌ CRM-013 Zoom Backfill Test Failed:', err);
  process.exit(1);
});
