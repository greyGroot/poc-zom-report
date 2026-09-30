// ee-crm/scripts/crm-016/sync-zoom-reports.js
// Standalone CLI script and synchronization pipeline for Zoom REST API Reports.
// Ingests past meetings and participant telemetry into authoritative occurrences in Redis.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  isZoomConfigured,
  getZoomAccessToken,
  getZoomUsersSnapshot,
  fetchTeacherPastMeetings,
  fetchMeetingParticipantsSafe
} from '../../lib/infrastructure/zoom.js';
import { adaptZoomReportToOccurrence } from '../../lib/infrastructure/zoom-report-adapter.js';
import { saveZoomOccurrence } from '../../lib/infrastructure/zoom-occurrences.js';
import { getTeachers } from '../../lib/infrastructure/db.js';

// Load environment configuration across working directory and parent repositories
const candidateDirs = [
  process.cwd(),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '../..'),
  path.resolve(process.cwd(), '../../..')
];
for (const dir of candidateDirs) {
  dotenv.config({ path: path.resolve(dir, '.env'), quiet: true });
  dotenv.config({ path: path.resolve(dir, '.env.local'), quiet: true });
  dotenv.config({ path: path.resolve(dir, '.env.vercel'), quiet: true });
}

export const DEFAULT_FROM_DATE = '2026-09-01';
export const DEFAULT_TO_DATE = '2026-09-30';

/**
 * Splits a date range into chunks of up to maxDays (default 30 days for Zoom API limits).
 *
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @param {number} [maxDays=30]
 * @returns {Array<{ from: string, to: string }>}
 */
export function getDateChunks(fromDate, toDate, maxDays = 30) {
  const chunks = [];
  let cur = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cur <= end) {
    const chunkStart = cur.toISOString().split('T')[0];
    const chunkEndMs = Math.min(cur.getTime() + (maxDays - 1) * 24 * 60 * 60 * 1000, end.getTime());
    const chunkEnd = new Date(chunkEndMs).toISOString().split('T')[0];
    chunks.push({ from: chunkStart, to: chunkEnd });
    cur = new Date(chunkEndMs + 24 * 60 * 60 * 1000);
  }
  return chunks;
}

/**
 * Synchronizes past Zoom meeting reports for active teachers into Redis.
 *
 * @param {object} options
 * @param {string} [options.fromDate='2026-09-01'] - YYYY-MM-DD
 * @param {string} [options.toDate='2026-09-30'] - YYYY-MM-DD
 * @param {string|null} [options.teacher=null] - Optional teacher ID or email filter
 * @param {boolean} [options.dryRun=true] - When true, simulates sync without writing to Redis
 * @param {Function} [options.fetchImpl=fetch] - Custom fetch implementation for testing
 * @param {string|null} [options.token=null] - Pre-acquired Zoom access token
 * @returns {Promise<object>} Sync summary report
 */
export async function syncZoomReports({
  fromDate = DEFAULT_FROM_DATE,
  toDate = DEFAULT_TO_DATE,
  teacher = null,
  dryRun = true,
  fetchImpl = fetch,
  token = null
} = {}) {
  const startTime = Date.now();
  const summary = {
    mode: dryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE',
    dateRange: { from: fromDate, to: toDate },
    teacherFilter: teacher || 'ALL',
    teachersProcessed: 0,
    totalMeetingsFetched: 0,
    totalOccurrencesAdapted: 0,
    totalOccurrencesSaved: 0,
    totalParticipantsRecorded: 0,
    teachersWithMeetingsCount: 0,
    teachersWithZeroMeetingsCount: 0,
    teacherBreakdown: {},
    errors: [],
    durationMs: 0
  };

  if (!isZoomConfigured()) {
    throw new Error('Zoom API is not configured. Please ensure ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET are set.');
  }

  const authToken = token || await getZoomAccessToken({ fetchImpl });

  // 1. Resolve teachers / Zoom users
  let zoomSnapshot = null;
  try {
    zoomSnapshot = await getZoomUsersSnapshot({ fetchImpl });
  } catch (err) {
    throw new Error(`Failed to fetch Zoom users snapshot: ${err.message}`);
  }

  const activeZoomUsers = (zoomSnapshot?.users || []).filter(u => u.status === 'active');
  const dbTeachers = await getTeachers();

  const targetTeachers = [];

  if (teacher) {
    const normTarget = String(teacher).trim().toLowerCase();
    const matchedDbTeacher = dbTeachers.find(t => 
      t.id === teacher ||
      String(t.schoolmateTeacherId) === teacher ||
      t.email?.toLowerCase() === normTarget ||
      t.zoomHostEmail?.toLowerCase() === normTarget
    );

    const targetEmail = matchedDbTeacher?.zoomHostEmail?.toLowerCase().trim() ||
      matchedDbTeacher?.email?.toLowerCase().trim() ||
      (normTarget.includes('@') ? normTarget : null);

    const matchedZoomUser = activeZoomUsers.find(u => 
      (targetEmail && u.email?.toLowerCase().trim() === targetEmail) ||
      u.id === teacher ||
      u.email?.toLowerCase().trim() === normTarget
    );

    if (matchedZoomUser) {
      targetTeachers.push({
        userId: matchedZoomUser.id,
        email: matchedZoomUser.email.toLowerCase().trim(),
        name: `${matchedZoomUser.first_name || ''} ${matchedZoomUser.last_name || ''}`.trim() || matchedDbTeacher?.fullName || 'Teacher'
      });
    } else if (targetEmail) {
      targetTeachers.push({
        userId: targetEmail,
        email: targetEmail,
        name: matchedDbTeacher?.fullName || 'Teacher'
      });
    } else {
      throw new Error(`Could not resolve teacher '${teacher}' in Zoom users or CRM database.`);
    }
  } else {
    for (const u of activeZoomUsers) {
      const email = u.email?.toLowerCase().trim();
      const dbMatch = dbTeachers.find(t => 
        t.zoomHostEmail?.toLowerCase().trim() === email || 
        t.email?.toLowerCase().trim() === email
      );
      targetTeachers.push({
        userId: u.id,
        email,
        name: dbMatch?.fullName || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Teacher'
      });
    }
  }

  // 2. Query past meetings and participants for each teacher
  const dateChunks = getDateChunks(fromDate, toDate, 30);

  for (const t of targetTeachers) {
    summary.teachersProcessed++;
    let teacherMeetings = [];
    const seenMeetingUuids = new Set();

    for (const chunk of dateChunks) {
      try {
        const chunkMeetings = await fetchTeacherPastMeetings({
          token: authToken,
          userId: t.userId,
          fromDate: chunk.from,
          toDate: chunk.to,
          fetchImpl
        });
        for (const m of (chunkMeetings || [])) {
          if (!seenMeetingUuids.has(m.uuid)) {
            seenMeetingUuids.add(m.uuid);
            teacherMeetings.push(m);
          }
        }
      } catch (err) {
        summary.errors.push({
          teacher: t.email,
          action: 'fetchTeacherPastMeetings',
          chunk,
          error: err.message
        });
      }
    }

    if (teacherMeetings.length > 0) {
      summary.teachersWithMeetingsCount++;
    } else {
      summary.teachersWithZeroMeetingsCount++;
    }

    summary.totalMeetingsFetched += teacherMeetings.length;
    let savedForTeacher = 0;

    for (const meeting of teacherMeetings) {
      let participants = [];
      try {
        participants = await fetchMeetingParticipantsSafe({
          token: authToken,
          meetingKey: meeting.uuid,
          fetchImpl
        });
      } catch (err) {
        summary.errors.push({
          teacher: t.email,
          meetingUuid: meeting.uuid,
          action: 'fetchMeetingParticipantsSafe',
          error: err.message
        });
      }

      let occurrence = null;
      try {
        occurrence = adaptZoomReportToOccurrence(meeting, participants, t.email);
        summary.totalOccurrencesAdapted++;
        summary.totalParticipantsRecorded += Object.keys(occurrence.participants || {}).length;
      } catch (err) {
        summary.errors.push({
          teacher: t.email,
          meetingUuid: meeting.uuid,
          action: 'adaptZoomReportToOccurrence',
          error: err.message
        });
        continue;
      }

      if (!dryRun) {
        try {
          await saveZoomOccurrence(occurrence, { merge: true });
          summary.totalOccurrencesSaved++;
          savedForTeacher++;
        } catch (err) {
          summary.errors.push({
            teacher: t.email,
            meetingUuid: meeting.uuid,
            action: 'saveZoomOccurrence',
            error: err.message
          });
        }
      } else {
        savedForTeacher++;
      }
    }

    summary.teacherBreakdown[t.email] = {
      name: t.name,
      meetingsCount: teacherMeetings.length,
      occurrencesProcessed: savedForTeacher
    };
  }

  summary.durationMs = Date.now() - startTime;
  return summary;
}

export async function main() {
  const args = process.argv.slice(2);
  let fromDate = DEFAULT_FROM_DATE;
  let toDate = DEFAULT_TO_DATE;
  let teacher = null;
  let dryRun = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--from=')) {
      fromDate = arg.split('=')[1];
    } else if (arg === '--from' && args[i + 1]) {
      fromDate = args[++i];
    } else if (arg.startsWith('--to=')) {
      toDate = arg.split('=')[1];
    } else if (arg === '--to' && args[i + 1]) {
      toDate = args[++i];
    } else if (arg.startsWith('--teacher=')) {
      teacher = arg.split('=').slice(1).join('=');
    } else if (arg === '--teacher' && args[i + 1]) {
      teacher = args[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--execute' || arg === '--yes') {
      dryRun = false;
    }
  }

  console.log('====================================================');
  console.log('🚀 CRM-016: Zoom REST API Reports Ingestion Pipeline');
  console.log('====================================================');
  console.log(`Mode:        ${dryRun ? 'DRY-RUN (Simulated)' : 'EXECUTE (Persisting to Redis)'}`);
  console.log(`Date Range:  ${fromDate} to ${toDate}`);
  console.log(`Teacher:     ${teacher || 'ALL Active Teachers'}`);
  console.log('----------------------------------------------------');

  const result = await syncZoomReports({ fromDate, toDate, teacher, dryRun });

  console.log('\n📊 Sync Execution Summary:');
  console.log(`- Teachers Processed:        ${result.teachersProcessed}`);
  console.log(`- Total Meetings Fetched:    ${result.totalMeetingsFetched}`);
  console.log(`- Total Occurrences Adapted: ${result.totalOccurrencesAdapted}`);
  if (!dryRun) {
    console.log(`- Total Occurrences Saved:   ${result.totalOccurrencesSaved}`);
  }
  console.log(`- Total Participants Mapped: ${result.totalParticipantsRecorded}`);
  console.log(`- Duration:                  ${result.durationMs}ms`);
  console.log('\nTeacher Breakdown:');
  const teachersWithMeetings = [];
  const teachersWithZeroMeetings = [];
  for (const [email, info] of Object.entries(result.teacherBreakdown)) {
    if (info.meetingsCount > 0) {
      teachersWithMeetings.push({ email, ...info });
    } else {
      teachersWithZeroMeetings.push({ email, ...info });
    }
  }

  if (teachersWithMeetings.length > 0) {
    console.log('  Meetings Synced:');
    for (const t of teachersWithMeetings) {
      console.log(`  * ${t.email} (${t.name}): ${t.meetingsCount} meetings (${t.occurrencesProcessed} processed)`);
    }
  }

  if (teachersWithZeroMeetings.length > 0) {
    console.log('  Zero Cloud Meetings:');
    for (const t of teachersWithZeroMeetings) {
      console.log(`  * ${t.email} (${t.name}): 0 meetings`);
    }
  }

  if (result.errors.length > 0) {
    console.warn(`\n⚠️ Encountered ${result.errors.length} warnings/errors:`);
    for (const e of result.errors) {
      console.warn(`  - [${e.action}] ${e.teacher || ''} ${e.meetingUuid || ''}: ${e.error}`);
    }
  }

  console.log('\n✅ Sync complete.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    console.error('Fatal sync error:', err.message);
    process.exit(1);
  });
}
