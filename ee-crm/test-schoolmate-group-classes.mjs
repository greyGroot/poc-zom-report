import { SchoolmateClient } from './lib/schoolmate.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runTest() {
  console.log('Testing Schoolmate getTeacherClassesSchedule with batching...');
  const client = new SchoolmateClient({
    baseUrl: process.env.SCHOOLMATE_BASE_URL,
    schoolPrefix: process.env.SCHOOLMATE_PREFIX,
    userName: process.env.SCHOOLMATE_USERNAME,
    password: process.env.SCHOOLMATE_PASSWORD,
    requestUserId: Number(process.env.SCHOOLMATE_ADMIN_USER_ID)
  });

  const schedule = await client.getTeacherClassesSchedule({
    teacherId: 6568,
    fromDate: '2026-08-24',
    toDate: '2026-08-30',
    batchSize: 3
  });

  console.log('Schedule result:');
  console.log('- Total groups:', schedule.totalGroupsCount);
  console.log('- Total lessons:', schedule.totalLessonsCount);
  console.log('- Total wage:', schedule.totalWage);
  console.log('- Total minutes:', schedule.totalMinutesCalculated);
  console.log('- Days count:', schedule.days.length);

  for (const day of schedule.days) {
    console.log(`\n📅 ${day.dayName} (${day.lessons.length} lessons, subtotal: ${day.subtotalWageFormatted}):`);
    for (const l of day.lessons) {
      console.log(`  - [ID: ${l.groupLessonId}] ${l.className} | ${l.groupName} | ${l.durationMinutes} min | Rate: ${l.teacherRate}`);
      console.log(`    Status: "${l.lessonStatusName}" (Color: ${l.lessonStatusColor}) | Attendance: ${l.attendanceChecked} | Details: ${l.classDetailsAdded}`);
    }
  }

  console.log('\n✅ Test passed successfully!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
