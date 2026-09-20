// ee-crm/lib/pdf-parser.js
// High-precision serverless-compatible parser for Schoolmate Teacher Weekly Schedule PDFs

import { extractText } from 'unpdf';

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

const KNOWN_LANGUAGES = new Set([
  'English',
  'Ukrainian',
  'Russian',
  'Spanish',
  'German',
  'Polish',
  'French',
  'Italian'
]);

function parseGroupAndDetails(rest) {
  const parts = rest.trim().split(/\s+/);
  let language = null;
  let lessonType = 'GE';
  const groupTokens = [...parts];

  if (groupTokens.length > 1 && KNOWN_LANGUAGES.has(groupTokens[groupTokens.length - 1])) {
    language = groupTokens.pop();
  }

  if (groupTokens.length > 1 && /^[A-Z]{2,4}$/.test(groupTokens[groupTokens.length - 1])) {
    lessonType = groupTokens.pop();
  }

  const groupOrStudent = groupTokens.join(' ') || 'Individual Lesson';
  return { groupOrStudent, lessonType, language };
}

/**
 * Parses a Teacher Weekly Schedule PDF buffer into structured JSON
 * @param {Buffer|Uint8Array} pdfBuffer
 * @returns {Promise<object>}
 */
export async function parseTeacherSchedulePdf(pdfBuffer) {
  if (!pdfBuffer || !(pdfBuffer instanceof Buffer || pdfBuffer instanceof Uint8Array)) {
    throw new Error('Valid PDF Buffer is required for parsing');
  }

  const { text } = await extractText(new Uint8Array(pdfBuffer), { mergePages: true });
  const fullText = text || '';

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
  // Example: "Total Minutes 1,200 min." or "Total Minutes \t 1,200 min."
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
  // 14/09/2026 08:00 - 09:00 60 min. Alena Medvedieva Sushi Icons GE English
  const lessons = [];
  const daysMap = new Map();
  let currentDayHeader = null;

  // Day header detector: "Monday 14th September Start - End Duration..."
  const dayHeaderRegex = /^((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+(?:st|nd|rd|th)?\s+[A-Za-z]+)/i;
  const lessonPattern = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(\d+)\s*min\.?\s+(.*)$/i;

  for (const line of lines) {
    // Check if line is a day header
    const dayMatch = line.match(dayHeaderRegex);
    if (dayMatch) {
      currentDayHeader = dayMatch[1].trim();
      continue;
    }

    // Match lesson row
    const match = line.match(lessonPattern);
    if (match) {
      const dateRaw = match[1];
      const isoDate = parseDateToIso(dateRaw);
      const startTime = match[2];
      const endTime = match[3];
      const durationMinutes = Number(match[4]);
      const rest = match[5];

      const { groupOrStudent, lessonType, language } = parseGroupAndDetails(rest);

      const lessonItem = {
        id: `lesson_${isoDate}_${startTime.replace(':', '')}_${Math.random().toString(36).substring(2, 6)}`,
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
