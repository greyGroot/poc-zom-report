// ee-crm/lib/pdf-parser.js
// High-precision parser for Schoolmate Teacher Weekly Schedule PDFs

import { PDFParse } from 'pdf-parse';

/**
 * Converts DD/MM/YYYY to YYYY-MM-DD
 */
function parseDateToIso(ddmmyyyy) {
  if (!ddmmyyyy) return null;
  const parts = ddmmyyyy.trim().split('/');
  if (parts.length !== 3) return ddmmyyyy;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parses a Teacher Weekly Schedule PDF buffer into structured JSON
 * @param {Buffer} pdfBuffer
 * @returns {Promise<object>}
 */
export async function parseTeacherSchedulePdf(pdfBuffer) {
  if (!pdfBuffer || !(pdfBuffer instanceof Buffer || pdfBuffer instanceof Uint8Array)) {
    throw new Error('Valid PDF Buffer is required for parsing');
  }

  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  const fullText = textResult?.text || '';

  if (!fullText.trim()) {
    throw new Error('PDF contains no extractable text stream.');
  }

  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Extract Teacher Name and Date Period from header
  // Example: "Teacher Weekly Schedule (Zhuravlova Iryna) - 14/09/2026 - 20/09/2026"
  let teacherName = '';
  let periodFrom = '';
  let periodTo = '';

  const headerRegex = /Teacher Weekly Schedule\s*\((.*?)\)\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i;
  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      teacherName = match[1].trim();
      periodFrom = parseDateToIso(match[2]);
      periodTo = parseDateToIso(match[3]);
      break;
    }
  }

  // 2. Extract Total Minutes footer
  // Example: "Total Minutes \t 1,200 min."
  let totalMinutesReported = null;
  const totalMinutesRegex = /Total Minutes\s*[\t\s]+([\d,]+)\s*min/i;
  for (const line of lines) {
    const match = line.match(totalMinutesRegex);
    if (match) {
      totalMinutesReported = Number(match[1].replace(/,/g, ''));
      break;
    }
  }

  // 3. Extract Days and Lessons
  // Lessons row format:
  // 14/09/2026 \t 08:00 - 09:00 \t 60 min. \t Alena Medvedieva Sushi Icons \t GE \t English
  const lessons = [];
  const daysMap = new Map();
  let currentDayHeader = null;

  // Day header detector: "Monday 14th September Start - End Duration..."
  const dayHeaderRegex = /^((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+(?:st|nd|rd|th)?\s+[A-Za-z]+)/i;

  for (const line of lines) {
    // Check if line is a day header
    const dayMatch = line.match(dayHeaderRegex);
    if (dayMatch) {
      currentDayHeader = dayMatch[1].trim();
      continue;
    }

    // Split line by tab characters (Schoolmate PDF layout is tab-delimited)
    const tabs = line.split('\t').map(t => t.trim()).filter(Boolean);

    // Look for lines starting with a date: DD/MM/YYYY
    if (tabs.length >= 3 && /^\d{2}\/\d{2}\/\d{4}$/.test(tabs[0])) {
      const dateRaw = tabs[0];
      const isoDate = parseDateToIso(dateRaw);
      const timeRange = tabs[1] || '';
      const durationStr = tabs[2] || '';
      const groupOrStudent = tabs[3] || 'Individual Lesson';
      const lessonType = tabs[4] || 'GE';
      const language = tabs[5] || null;

      let startTime = null;
      let endTime = null;
      const timeMatch = timeRange.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      }

      let durationMinutes = 0;
      const durMatch = durationStr.match(/(\d+)\s*min/i);
      if (durMatch) {
        durationMinutes = Number(durMatch[1]);
      }

      const lessonItem = {
        id: `lesson_${isoDate}_${startTime?.replace(':', '') || '0000'}_${Math.random().toString(36).substring(2, 6)}`,
        date: isoDate,
        dayName: currentDayHeader || '',
        startTime,
        endTime,
        durationMinutes,
        groupOrStudent,
        lessonType,
        language
      };

      lessons.push(lessonItem);

      if (!daysMap.has(isoDate)) {
        daysMap.set(isoDate, {
          date: isoDate,
          dayName: currentDayHeader || isoDate,
          subtotalMinutes: 0,
          lessons: []
        });
      }

      const dayObj = daysMap.get(isoDate);
      dayObj.lessons.push(lessonItem);
      dayObj.subtotalMinutes += durationMinutes;
    }
  }

  const calculatedTotalMinutes = lessons.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
  const days = Array.from(daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    teacherName,
    periodFrom,
    periodTo,
    totalMinutesReported: totalMinutesReported ?? calculatedTotalMinutes,
    totalMinutesCalculated: calculatedTotalMinutes,
    totalLessonsCount: lessons.length,
    isMinutesMatching: totalMinutesReported === null || totalMinutesReported === calculatedTotalMinutes,
    days,
    lessons
  };
}
