// ee-crm/test-zoom-occurrences.js
// Unit tests for authoritative Zoom meeting occurrence store, interval union, and identity isolation

import assert from 'node:assert/strict';
import {
  saveZoomOccurrence,
  getZoomOccurrence,
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay,
  calculateIntervalUnionSeconds,
  toSafeOccurrenceId,
  fromSafeOccurrenceId,
  resetOccurrenceMemoryStore
} from './lib/zoom-occurrences.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('====================================================');
console.log('🧪 Zoom Occurrences Store & Business Rules Unit Tests');
console.log('====================================================\n');

// 1. Interval Union Tests (AC-5)
test('calculateIntervalUnionSeconds: handles empty or invalid sessions', () => {
  assert.equal(calculateIntervalUnionSeconds([]), 0);
  assert.equal(calculateIntervalUnionSeconds(null), 0);
  assert.equal(calculateIntervalUnionSeconds([{ join_time: 'invalid' }]), 0);
});

test('calculateIntervalUnionSeconds: sums distinct reconnect intervals without double-counting', () => {
  // 3 distinct reconnect intervals: 10m (600s) + 15m (900s) + 20m (1200s) = 45m (2700s)
  const reconnectSessions = [
    { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:10:00Z' },
    { join_time: '2026-09-14T08:15:00Z', leave_time: '2026-09-14T08:30:00Z' },
    { join_time: '2026-09-14T08:35:00Z', leave_time: '2026-09-14T08:55:00Z' }
  ];
  assert.equal(calculateIntervalUnionSeconds(reconnectSessions), 2700);
});

test('calculateIntervalUnionSeconds: merges overlapping intervals (e.g. PC + Phone)', () => {
  // Overlapping PC (08:00 - 08:50 = 3000s) and Phone (08:20 - 08:40 = 1200s) -> total 3000s
  const overlapSessions = [
    { join_time: '2026-09-14T08:00:00Z', leave_time: '2026-09-14T08:50:00Z' },
    { join_time: '2026-09-14T08:20:00Z', leave_time: '2026-09-14T08:40:00Z' }
  ];
  assert.equal(calculateIntervalUnionSeconds(overlapSessions), 3000);
});

// 2. Safe Occurrence ID Encoding (AC-9)
test('toSafeOccurrenceId and fromSafeOccurrenceId: lossless and URL-safe for tricky characters', () => {
  const trickyUuid = 'zoom_uuid_tricky+/=123';
  const safeId = toSafeOccurrenceId(trickyUuid);
  assert.ok(!safeId.includes('/'), 'Must not contain /');
  assert.ok(!safeId.includes('+'), 'Must not contain +');
  assert.ok(!safeId.includes('='), 'Must not contain =');

  const restored = fromSafeOccurrenceId(safeId);
  assert.equal(restored, trickyUuid);
});

// Async Store Tests
async function runAsyncTests() {
  resetOccurrenceMemoryStore();

  const sharedRoomId = '89411204451';
  const uuid1 = 'zoom_uuid_occ_001_kyiv_sep14';
  const uuid2 = 'zoom_uuid_occ_002_kyiv_sep15';
  const uuidIncomplete = 'zoom_uuid_occ_003_incomplete';

  // 3. Shared numeric meeting ID isolation (AC-3)
  await testAsync('AC-3: Separate occurrences sharing numeric meeting ID are not merged', async () => {
    await saveZoomOccurrence({
      uuid: uuid1,
      numeric_meeting_id: sharedRoomId,
      topic: 'Lesson 1',
      host_email: 'yulia@example.com',
      start_time: '2026-09-14T05:00:00Z',
      end_time: '2026-09-14T06:00:00Z',
      participants: {
        student1: { name: 'Student 1', email: 's1@example.com', sessions: [{ join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }] }
      }
    });

    await saveZoomOccurrence({
      uuid: uuid2,
      numeric_meeting_id: sharedRoomId,
      topic: 'Lesson 2',
      host_email: 'yulia@example.com',
      start_time: '2026-09-15T10:00:00Z',
      end_time: '2026-09-15T11:00:00Z',
      participants: {
        student2: { name: 'Student 2', email: 's2@example.com', sessions: [{ join_time: '2026-09-15T10:02:00Z', leave_time: '2026-09-15T10:59:00Z' }] }
      }
    });

    const o1 = await getZoomOccurrence(uuid1);
    const o2 = await getZoomOccurrence(uuid2);

    assert.equal(o1.numeric_meeting_id, o2.numeric_meeting_id);
    assert.notEqual(o1.uuid, o2.uuid);
    assert.ok(o1.participants.student1 && !o1.participants.student2);
    assert.ok(o2.participants.student2 && !o2.participants.student1);
  });

  // 4. Duplicate event replay idempotency (AC-4)
  await testAsync('AC-4: Replayed event does not inflate sessions or duration', async () => {
    const before = await getZoomOccurrence(uuid1);
    const beforeSessionsCount = before.participants.student1.sessions.length;

    await saveZoomOccurrence({
      uuid: uuid1,
      numeric_meeting_id: sharedRoomId,
      participants: {
        student1: { name: 'Student 1', email: 's1@example.com', sessions: [{ join_time: '2026-09-14T05:01:00Z', leave_time: '2026-09-14T05:58:00Z' }] }
      }
    }, { merge: true });

    const after = await getZoomOccurrence(uuid1);
    assert.equal(after.participants.student1.sessions.length, beforeSessionsCount);
  });

  // 5. Incomplete duration handling (AC-6, BUG-03)
  await testAsync('AC-6 & BUG-03: Incomplete meeting duration is null, not wall-clock elapsed', async () => {
    await saveZoomOccurrence({
      uuid: uuidIncomplete,
      numeric_meeting_id: '555666777',
      topic: 'Unfinished Lesson',
      host_email: 'yulia@example.com',
      start_time: '2026-09-16T12:00:00Z'
      // end_time is missing!
    });

    const occ = await getZoomOccurrence(uuidIncomplete);
    const formatted = formatOccurrenceForDisplay(occ);

    assert.equal(formatted.durationState, 'incomplete');
    assert.equal(formatted.durationMinutes, null, 'durationMinutes must be null, not invented!');
    assert.equal(formatted.durationSeconds, null);
  });

  // 6. Display names collision isolation (BUG-04)
  await testAsync('BUG-04: Participants with identical display names are kept distinct', async () => {
    await saveZoomOccurrence({
      uuid: 'uuid-name-collision',
      start_time: '2026-09-14T10:00:00Z',
      end_time: '2026-09-14T11:00:00Z',
      participants: {
        p1: { name: 'Anna', sessions: [{ join_time: '2026-09-14T10:00:00Z', leave_time: '2026-09-14T10:30:00Z' }] },
        p2: { name: 'Anna', sessions: [{ join_time: '2026-09-14T10:30:00Z', leave_time: '2026-09-14T11:00:00Z' }] }
      }
    });

    const occ = await getZoomOccurrence('uuid-name-collision');
    const count = Object.keys(occ.participants).length;
    assert.equal(count, 2, 'Must preserve 2 separate participants for same name without user_id/email');
  });

  // 7. Unmapped teacher privacy isolation (BUG-02)
  await testAsync('BUG-02: Unmapped teacher returns 0 meetings (no data leak)', async () => {
    const leaked = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: '',
      teacherEmail: '',
      fromDate: '2026-09-14',
      toDate: '2026-09-20'
    });
    assert.equal(leaked.length, 0, 'Must return empty array when teacher has no host mapping');
  });

  // 8. Factual display formatting without tags (AC-1)
  await testAsync('AC-1: formatOccurrenceForDisplay contains no reconciliation or risk tags', async () => {
    const occ = await getZoomOccurrence(uuid1);
    const formatted = formatOccurrenceForDisplay(occ);

    assert.equal(formatted.flags, undefined);
    assert.equal(formatted.reconciliationTag, undefined);
    assert.equal(formatted.business_status, undefined);
    assert.equal(formatted.status, undefined);
    assert.equal(formatted.topic, 'Lesson 1');
    assert.equal(formatted.durationMinutes, 60);
    assert.equal(formatted.durationState, 'complete');
    assert.equal(formatted.participantsCount, 1);
  });

  console.log(`\n====================================================`);
  console.log(`SUMMARY: ${passed} PASSED of ${total} tests`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runAsyncTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
