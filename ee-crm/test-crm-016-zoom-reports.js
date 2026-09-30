import test from 'node:test';
import assert from 'node:assert';

test('CRM-016 Red Phase Checks', async (t) => {
  await t.test('Check 1: Rate-Safe Zoom Report Client', async () => {
    let zoom;
    try {
      zoom = await import('./lib/infrastructure/zoom.js');
    } catch (e) {
      assert.fail('Failed to load lib/infrastructure/zoom.js');
    }
    
    assert.ok(zoom.fetchTeacherPastMeetings, 'fetchTeacherPastMeetings is missing');
    assert.ok(zoom.fetchMeetingParticipantsSafe, 'fetchMeetingParticipantsSafe is missing');
  });

  await t.test('Check 2: Occurrence Adaptation & Invariant Compliance', async () => {
    let adapter;
    try {
      adapter = await import('./lib/infrastructure/zoom-report-adapter.js');
    } catch (e) {
      assert.fail('Failed to load lib/infrastructure/zoom-report-adapter.js');
    }
    
    assert.ok(adapter.adaptZoomReportToOccurrence, 'adaptZoomReportToOccurrence is missing');
  });

  await t.test('Check 3: Query & Persistence Integrity in Redis', async () => {
    let domain;
    try {
      domain = await import('./lib/infrastructure/zoom-occurrences.js');
    } catch (e) {
      assert.fail('Failed to load lib/infrastructure/zoom-occurrences.js');
    }
    assert.ok(domain.getZoomOccurrencesForTeacher, 'getZoomOccurrencesForTeacher is missing');
  });

  await t.test('Check 4: Historical Target Dataset Verification', async () => {
    // For red phase, check if the CLI script exists
    let fs = await import('fs/promises');
    try {
      await fs.access('./scripts/crm-016/sync-zoom-reports.js');
    } catch (e) {
      assert.fail('CLI script scripts/crm-016/sync-zoom-reports.js is missing');
    }
  });

  await t.test('Check 5: UI & End-to-End Contract Preservation', async () => {
    // Check if the api route is accessible / exists as expected
    let fs = await import('fs/promises');
    try {
      await fs.access('./app/api/teachers/[id]/days/[date]/route.js');
    } catch (e) {
      assert.fail('API route app/api/teachers/[id]/days/[date]/route.js is missing');
    }
  });
});
