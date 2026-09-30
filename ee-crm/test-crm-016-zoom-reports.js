import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('CRM-016 Red Phase Checks', async (t) => {
  await t.test('Check 1: Rate-Safe Zoom Report Client', async () => {
    const zoom = await import('./lib/infrastructure/zoom.js');
    assert.ok(zoom.fetchTeacherPastMeetings, 'fetchTeacherPastMeetings is missing');
    assert.ok(zoom.fetchMeetingParticipantsSafe, 'fetchMeetingParticipantsSafe is missing');
    
    // Simulate rate-limiting check if possible, or at least check they are functions
    assert.equal(typeof zoom.fetchTeacherPastMeetings, 'function');
    assert.equal(typeof zoom.fetchMeetingParticipantsSafe, 'function');
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
  });

  await t.test('Check 3: Query & Persistence Integrity in Redis', async () => {
    const persistence = await import('./lib/infrastructure/zoom-occurrences.js');
    assert.ok(persistence.getZoomOccurrencesForTeacher, 'getZoomOccurrencesForTeacher is missing');
    assert.ok(persistence.publishOccurrenceProjection || persistence.saveZoomOccurrence, 'save function is missing');
  });

  await t.test('Check 4: Historical Target Dataset Verification', async () => {
    // Check if the CLI script exists
    try {
      await fs.access('./scripts/crm-016/sync-zoom-reports.js');
    } catch (e) {
      assert.fail('CLI script scripts/crm-016/sync-zoom-reports.js is missing');
    }
  });
});
