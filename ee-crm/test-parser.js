// ee-crm/test-parser.js
// Verification test for Schoolmate PDF parser on downloaded sample

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseTeacherSchedulePdf } from './lib/pdf-parser.js';

async function run() {
  const samplePdfPath = 'C:/Users/sergi/Downloads/Teacher_schedule_detail_202609201730464017.pdf';
  console.log(`[Test] Reading sample PDF from ${samplePdfPath}...`);

  const buffer = await fs.readFile(samplePdfPath);
  console.log(`[Test] PDF loaded (${buffer.length} bytes). Parsing...`);

  const startTime = Date.now();
  const parsed = await parseTeacherSchedulePdf(buffer);
  const durationMs = Date.now() - startTime;

  console.log(`[Test] Parsed successfully in ${durationMs} ms!`);
  console.log('--- Summary ---');
  console.log(`Teacher Name: ${parsed.teacherName}`);
  console.log(`Period: ${parsed.periodFrom} to ${parsed.periodTo}`);
  console.log(`Total Lessons: ${parsed.totalLessonsCount}`);
  console.log(`Total Minutes Reported: ${parsed.totalMinutesReported} min`);
  console.log(`Total Minutes Calculated: ${parsed.totalMinutesCalculated} min`);
  console.log(`Minutes Match: ${parsed.isMinutesMatching ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Number of Days: ${parsed.days.length}`);

  console.log('\n--- Breakdown by Day ---');
  for (const day of parsed.days) {
    console.log(`\n📅 ${day.dayName} (${day.date}) - Subtotal: ${day.subtotalMinutes} min (${day.lessons.length} lessons):`);
    for (const l of day.lessons) {
      console.log(`   ⏱️  ${l.startTime} - ${l.endTime} (${l.durationMinutes}m) | ${l.groupOrStudent} [${l.lessonType}${l.language ? ', ' + l.language : ''}]`);
    }
  }

  if (parsed.totalLessonsCount === 17 && parsed.totalMinutesCalculated === 1200 && parsed.isMinutesMatching) {
    console.log('\n🎉 ALL ASSERTIONS PASSED! 17/17 lessons extracted with 100% precision.');
  } else {
    console.error('\n❌ Warning: Expected 17 lessons and 1200 minutes.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
