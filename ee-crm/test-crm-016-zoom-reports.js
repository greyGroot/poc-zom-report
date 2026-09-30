import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
if (!process.env.UPSTASH_REDIS_REST_URL) {
  process.env.USE_IN_MEMORY_REDIS = 'true';
}

test('CRM-016 Red Phase Checks', async (t) => {
  await t.test('Check 1: Rate-Safe Zoom Report Client', async () => {
    const zoom = await import('./lib/infrastructure/zoom.js');
    assert.ok(zoom.fetchTeacherPastMeetings, 'fetchTeacherPastMeetings is missing');
    assert.ok(zoom.fetchMeetingParticipantsSafe, 'fetchMeetingParticipantsSafe is missing');
    assert.equal(typeof zoom.fetchTeacherPastMeetings, 'function');
    assert.equal(typeof zoom.fetchMeetingParticipantsSafe, 'function');

    // Verify 429 retry logic with mocked fetch
    let attempts = 0;
    const mockFetch = async (url) => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'retry-after': '1' }
        });
      }
      return new Response(JSON.stringify({
        participants: [
          { name: 'Student A', user_id: '1', duration: 1800, join_time: '2026-09-28T10:00:00Z', leave_time: '2026-09-28T10:30:00Z' }
        ]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const participants = await zoom.fetchMeetingParticipantsSafe({
      token: 'mock-token',
      meetingKey: 'test-meeting-key',
      fetchImpl: mockFetch,
      pacingDelayMs: 0,
      maxRetries: 2
    });

    assert.equal(attempts, 2, 'Should retry on HTTP 429');
    assert.equal(participants.length, 1, 'Should return participants after retry');
    assert.equal(participants[0].name, 'Student A');
  });

  await t.test('Check 2: Occurrence Adaptation & Invariant Compliance', async () => {
    const adapter = await import('./lib/infrastructure/zoom-report-adapter.js');
    const domain = await import('./lib/domain/zoom-occurrence.js');
    
    assert.ok(adapter.adaptZoomReportToOccurrence, 'adaptZoomReportToOccurrence is missing');
    
    const rawMeeting = {
      uuid: 'test-uuid-1',
      id: 123456789,
      topic: 'Test Topic',
      host_id: 'host-1',
      start_time: '2026-09-28T10:00:00Z',
      end_time: '2026-09-28T11:00:00Z',
      duration: 60
    };
    
    const rawParticipants = [
      {
        name: 'Test Student',
        user_email: 'student@example.com',
        user_id: 'student-1',
        join_time: '2026-09-28T10:05:00Z',
        leave_time: '2026-09-28T10:30:00Z',
        duration: 25 * 60,
        status: 'in_meeting'
      },
      {
        name: 'Test Student',
        user_email: 'student@example.com',
        user_id: 'student-1',
        join_time: '2026-09-28T10:35:00Z', // Reconnect
        leave_time: '2026-09-28T10:55:00Z',
        duration: 20 * 60,
        status: 'in_meeting'
      },
      {
        name: 'Waiting Room User',
        status: 'in_waiting_room'
      }
    ];
    
    const hostEmail = 'teacher@example.com';
    
    const occurrence = adapter.adaptZoomReportToOccurrence(rawMeeting, rawParticipants, hostEmail);
    assert.ok(occurrence, 'Should return an occurrence');
    assert.equal(occurrence.uuid, 'test-uuid-1');
    assert.equal(occurrence.host_email, hostEmail);
    
    // Check interval union for reconnects
    const student = Object.values(occurrence.participants).find(p => p.email === 'student@example.com');
    assert.ok(student, 'Student should be mapped');
    assert.equal(student.sessions.length, 2, 'Should have 2 sessions');
    assert.equal(student.duration_seconds, 45 * 60, 'Should use interval union for duration');
    
    const waitingRoomUser = Object.values(occurrence.participants).find(p => p.name === 'Waiting Room User');
    assert.ok(waitingRoomUser, 'Waiting room user should be mapped');
    assert.equal(waitingRoomUser.status, 'in_waiting_room', 'Should capture waiting room status');
    
    const validation = domain.validateOccurrenceInvariants(occurrence);
    assert.equal(validation.valid, true, 'Adapted occurrence should be valid');
    assert.deepEqual(validation.errors, []);
  });

  await t.test('Check 3: Query & Persistence Integrity in Redis', async () => {
    const persistence = await import('./lib/infrastructure/zoom-occurrences.js');
    const adapter = await import('./lib/infrastructure/zoom-report-adapter.js');
    assert.ok(persistence.getZoomOccurrencesForTeacher, 'getZoomOccurrencesForTeacher is missing');
    assert.ok(persistence.saveZoomOccurrence, 'saveZoomOccurrence is missing');

    const testOccurrence = adapter.adaptZoomReportToOccurrence(
      {
        uuid: 'test-persistence-uuid',
        id: 987654321,
        topic: 'Algebra 101',
        start_time: '2026-09-28T14:00:00Z',
        end_time: '2026-09-28T15:00:00Z',
        duration: 60
      },
      [
        { name: 'Alice', user_email: 'alice@test.com', join_time: '2026-09-28T14:00:00Z', leave_time: '2026-09-28T15:00:00Z' }
      ],
      'rigor.teacher@example.com'
    );

    // Save and query back
    await persistence.saveZoomOccurrence(testOccurrence);
    const results = await persistence.getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'rigor.teacher@example.com',
      fromDate: '2026-09-28',
      toDate: '2026-09-28'
    });

    assert.ok(Array.isArray(results), 'Results must be an array');
    assert.ok(results.length >= 1, 'Must find at least 1 persisted occurrence');
    const found = results.find(o => o.occurrence_id === 'test-persistence-uuid' || o.uuid === 'test-persistence-uuid');
    assert.ok(found, 'Persisted occurrence must match UUID');
    assert.equal(found.host_email, 'rigor.teacher@example.com');
    assert.ok(found.participants && Object.keys(found.participants).length > 0, 'Participants must not be empty');

    // Idempotency: save again and confirm count doesn't duplicate
    await persistence.saveZoomOccurrence(testOccurrence);
    const resultsSecond = await persistence.getZoomOccurrencesForTeacher({
      teacherZoomEmail: 'rigor.teacher@example.com',
      fromDate: '2026-09-28',
      toDate: '2026-09-28'
    });
    const foundMatches = resultsSecond.filter(o => o.occurrence_id === 'test-persistence-uuid' || o.uuid === 'test-persistence-uuid');
    assert.equal(foundMatches.length, 1, 'Re-saving occurrence must be idempotent');
  });

  await t.test('Check 4: Historical Target Dataset & Chunking Verification', async () => {
    const { getDateChunks } = await import('./scripts/crm-016/sync-zoom-reports.js');
    assert.ok(typeof getDateChunks === 'function', 'getDateChunks must be exported');

    // 1-month range
    const septChunks = getDateChunks('2026-09-01', '2026-09-30', 30);
    assert.equal(septChunks.length, 1);
    assert.equal(septChunks[0].from, '2026-09-01');
    assert.equal(septChunks[0].to, '2026-09-30');

    // 2-month range
    const multiChunks = getDateChunks('2026-08-01', '2026-09-30', 30);
    assert.ok(multiChunks.length >= 2, 'Should create at least 2 chunks for 60 days');
    assert.equal(multiChunks[0].from, '2026-08-01');
    assert.equal(multiChunks[multiChunks.length - 1].to, '2026-09-30');
  });
});
