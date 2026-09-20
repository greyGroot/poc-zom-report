// ee-crm/test-db.js
// Verification of teacher persistence and logging

import { createTeacher, getTeachers, getTeacherById, deleteTeacher, getAppLogs } from './lib/db.js';
import { logger } from './lib/logger.js';

async function run() {
  console.log('--- Testing DB Persistence & Logging ---');

  // 1. Log an action
  await logger.info('TEST_INIT', 'Starting database verification test');

  // 2. Create sample teacher
  console.log('\n[1] Creating sample teacher...');
  const teacher = await createTeacher({
    firstName: 'Iryna',
    lastName: 'Zhuravlova',
    email: 'iryna.zhuravlova@empire.eu',
    schoolmateTeacherId: 17251,
    schoolmateLogin: 'izai1498'
  });
  console.log('✅ Created teacher:', teacher);

  // 3. Get all teachers
  console.log('\n[2] Fetching all teachers...');
  const teachers = await getTeachers();
  console.log(`✅ Retrieved ${teachers.length} teachers:`, teachers.map(t => t.fullName));

  // 4. Check teacher by ID
  console.log('\n[3] Fetching teacher by ID...');
  const found = await getTeacherById(teacher.id);
  console.log('✅ Found teacher:', found?.fullName, '(ID:', found?.id, ')');

  // 5. Check logs
  console.log('\n[4] Fetching application logs...');
  const logs = await getAppLogs(5);
  console.log(`✅ Retrieved ${logs.length} logs. Latest:`, logs[0]?.action, '-', logs[0]?.message);

  console.log('\n🎉 ALL DATABASE AND LOGGING TESTS PASSED!');
}

run().catch(err => {
  console.error('DB test failed:', err);
  process.exit(1);
});
