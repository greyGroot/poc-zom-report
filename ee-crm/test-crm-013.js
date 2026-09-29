// ee-crm/test-crm-013.js
// Unit & Integration Test Suite for CRM-013: Display Group Students Roster on Teacher and Day Pages

import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  getGroupRosterCache,
  setGroupRosterCache,
  resetDbMemoryStore,
  pruneAllCaches,
  createTeacher
} from './lib/infrastructure/db.js';
import { SchoolmateClient } from './lib/infrastructure/schoolmate.js';
import { getTeacherDayData } from './lib/services/teacher-day.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTests() {
  console.log('🧪 Starting CRM-013 Developer Test Suite...\n');

  // Test 1: DB Group Roster Cache
  console.log('--- Test 1: DB Group Roster Cache ---');
  resetDbMemoryStore();
  const testGroupId = 999001;
  const mockRoster = [
    { id: 101, fullName: 'Test Student One', firstName: 'Student', lastName: 'One' },
    { id: 102, fullName: 'Test Student Two', firstName: 'Student', lastName: 'Two' }
  ];

  const cachedBefore = await getGroupRosterCache(testGroupId);
  assert.equal(cachedBefore, null, 'Cache before set should be null');

  await setGroupRosterCache(testGroupId, mockRoster, 3600);
  const cachedAfter = await getGroupRosterCache(testGroupId);
  assert.ok(Array.isArray(cachedAfter), 'Cache after set should be an array');
  assert.equal(cachedAfter.length, 2, 'Cache after set should have 2 students');
  assert.equal(cachedAfter[0].fullName, 'Test Student One');

  await pruneAllCaches();
  const cachedPruned = await getGroupRosterCache(testGroupId);
  assert.equal(cachedPruned, null, 'Cache after prune should be null');
  console.log('✅ Test 1 Passed: DB Group Roster Cache works with TTL & pruning.');

  // Test 2: SchoolmateClient Mock Roster Fetching & Fallback
  console.log('\n--- Test 2: SchoolmateClient Mock Roster Fetching & Fallback ---');
  let mockFetchCalled = false;
  const mockClient = new SchoolmateClient({
    fetch: async (url, init) => {
      mockFetchCalled = true;
      if (url.includes('/admin')) {
        return new Response('<html></html>', {
          status: 200,
          headers: { 'set-cookie': 'ASP.NET_SessionId=mocksession123; path=/;' }
        });
      }
      if (url.includes('/security/index')) {
        return new Response(JSON.stringify({ IsSuccess: true }), { status: 200 });
      }
      if (url.includes('/group/getgroupattendancedetails')) {
        return new Response(JSON.stringify({
          IsSuccess: true,
          Data: {
            AttendanceList: [
              { StudentId: 401, Name: 'Mock Student Alpha' },
              { StudentId: 402, Name: 'Mock Student Beta' },
              { StudentId: 403, Name: 'Mock Student Gamma' }
            ]
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ IsSuccess: false }), { status: 404 });
    }
  });

  const fetchedRoster = await mockClient.getGroupStudentRoster({ groupId: 888001 });
  assert.equal(fetchedRoster.length, 3, 'Fetched roster should have 3 students');
  assert.equal(fetchedRoster[0].fullName, 'Mock Student Alpha');
  assert.equal(fetchedRoster[1].fullName, 'Mock Student Beta');
  assert.equal(fetchedRoster[2].fullName, 'Mock Student Gamma');
  console.log('✅ Test 2 Passed: SchoolmateClient parses group student roster correctly.');

  // Test 3: Live Schoolmate API Schedule Enrichment (GIZ Group 8 — Teacher ID 6568 / 2026-09-28)
  console.log('\n--- Test 3: Live Schoolmate API Schedule Enrichment for Target 1 (GIZ Group 8) ---');
  if (process.env.SCHOOLMATE_USERNAME && process.env.SCHOOLMATE_PASSWORD) {
    const liveClient = new SchoolmateClient();
    const liveSchedule = await liveClient.getTeacherClassesSchedule({
      teacherId: 6568,
      fromDate: '2026-09-28',
      toDate: '2026-09-28',
      teacherName: 'Zhuravlova Iryna'
    });

    assert.ok(liveSchedule, 'Live schedule should be returned');
    assert.ok(liveSchedule.lessons.length > 0, 'Should return lessons for 2026-09-28');

    const gizLesson = liveSchedule.lessons.find(l => l.groupId === 154734 || l.groupLessonId === 8669771);
    assert.ok(gizLesson, 'GIZ Group 8 lesson should be found');
    assert.equal(gizLesson.enrolledStudents, 6, `enrolledStudents should be 6 (got ${gizLesson.enrolledStudents})`);
    assert.ok(Array.isArray(gizLesson.students), 'students should be an array');
    assert.equal(gizLesson.students.length, 6, 'students length should be 6');
    assert.equal(gizLesson.isIndividual, false, 'isIndividual should be false for 6 students');

    const studentNames = gizLesson.students.map(s => s.fullName);
    assert.ok(studentNames.includes('Goncharov Andrii'), 'Should include Goncharov Andrii');
    assert.ok(studentNames.includes('Khyzhniak Valentyna'), 'Should include Khyzhniak Valentyna');
    assert.ok(studentNames.includes('Pynzaru Anastasiia'), 'Should include Pynzaru Anastasiia');
    assert.ok(studentNames.includes('Sytiuk Antonina'), 'Should include Sytiuk Antonina');
    assert.ok(studentNames.includes('Tsyberman Anastasiia'), 'Should include Tsyberman Anastasiia');
    assert.ok(studentNames.includes('Zahorodniuk Vira'), 'Should include Zahorodniuk Vira');

    console.log('✅ Test 3 Passed: Live GIZ Group 8 returns true 6-student roster.');
  } else {
    console.log('⚠️ Skipping Live Test 3 (Schoolmate credentials not configured).');
  }

  // Test 4: Live Schoolmate API Schedule Enrichment (NovaPay A2+/2 — Teacher ID 17251 / 2026-09-28)
  console.log('\n--- Test 4: Live Schoolmate API Schedule Enrichment for Target 2 (NovaPay A2+/2) ---');
  if (process.env.SCHOOLMATE_USERNAME && process.env.SCHOOLMATE_PASSWORD) {
    const liveClient = new SchoolmateClient();
    const liveSchedule2 = await liveClient.getTeacherClassesSchedule({
      teacherId: 17251,
      fromDate: '2026-09-28',
      toDate: '2026-09-28',
      teacherName: 'Savchuk Yuliia'
    });

    assert.ok(liveSchedule2, 'Live schedule should be returned');
    assert.ok(liveSchedule2.lessons.length > 0, 'Should return lessons for 2026-09-28');

    const novaLesson = liveSchedule2.lessons.find(l => l.groupId === 154643 || l.groupLessonId === 8648498);
    assert.ok(novaLesson, 'NovaPay A2+/2 lesson should be found');
    assert.equal(novaLesson.enrolledStudents, 4, `enrolledStudents should be 4 (got ${novaLesson.enrolledStudents})`);
    assert.ok(Array.isArray(novaLesson.students), 'students should be an array');
    assert.equal(novaLesson.students.length, 4, 'students length should be 4');
    assert.equal(novaLesson.isIndividual, false, 'isIndividual should be false for 4 students');

    const novaStudentNames = novaLesson.students.map(s => s.fullName);
    assert.ok(novaStudentNames.includes('Bevz Serhii'), 'Should include Bevz Serhii');
    assert.ok(novaStudentNames.includes('Kozachuk Anna'), 'Should include Kozachuk Anna');
    assert.ok(novaStudentNames.includes('Riabokon Tetiana'), 'Should include Riabokon Tetiana');
    assert.ok(novaStudentNames.includes('Yerunova Nataliia'), 'Should include Yerunova Nataliia');

    console.log('✅ Test 4 Passed: Live NovaPay A2+/2 returns true 4-student roster.');
  } else {
    console.log('⚠️ Skipping Live Test 4 (Schoolmate credentials not configured).');
  }

  // Test 5: TeacherDayData Service Mapping with Registered Teacher
  console.log('\n--- Test 5: TeacherDayData Service Integration with Registered Teacher ---');
  const seededTeacher = await createTeacher({
    firstName: 'Iryna',
    lastName: 'Zhuravlova',
    email: 'zhur.zhur.irene@gmail.com',
    schoolmateTeacherId: 6568,
    zoomHostEmail: 'zhur.zhur.irene@gmail.com'
  });

  const dayData = await getTeacherDayData({
    teacherId: seededTeacher.id,
    date: '2026-09-28'
  });

  assert.equal(dayData.success, true, 'getTeacherDayData should succeed');
  assert.ok(dayData.schoolmate?.lessons?.length > 0, 'Should have schoolmate lessons');

  const gizInService = dayData.schoolmate.lessons.find(l => l.groupId === 154734 || l.groupLessonId === 8669771);
  assert.ok(gizInService, 'GIZ Group 8 found in dayData');
  assert.equal(gizInService.enrolledStudents, 6, 'enrolledStudents in dayData should be 6');
  assert.equal(gizInService.students.length, 6, 'students in dayData should be 6');
  assert.equal(gizInService.isIndividual, false, 'isIndividual in dayData should be false');
  console.log('✅ Test 5 Passed: TeacherDayData service maps student roster accurately.');

  console.log('\n🎉 ALL CRM-013 DEVELOPER TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ Developer test failed:', err);
  process.exit(1);
});
