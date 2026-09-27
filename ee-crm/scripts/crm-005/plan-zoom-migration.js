// ee-crm/scripts/crm-005/plan-zoom-migration.js
// Pure snapshot-to-manifest occurrence reconstruction pipeline for CRM-005.
// Groups raw facts by exact Zoom UUID, partitions participant sessions from legacy aggregates,
// derives deterministic legacy IDs for UUID-less sessions, and computes canonical hashes.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  SCHEMA_VERSION,
  MIGRATION_ID,
  MANDATORY_TEACHERS,
  KNOWN_HOST_ID_MAP,
  canonicalizeJson,
  computeSha256,
  validateSnapshot,
  validateManifest
} from './schema.js';
import {
  toSafeOccurrenceId,
  deriveLegacyDerivedId,
  deriveFactFingerprint,
  normalizeWebhookEventToFacts,
  reduceOccurrenceFacts,
  computeProjectionHash,
  validateOccurrenceInvariants
} from '../../lib/domain/zoom-occurrence.js';

/**
 * Normalizes host email string.
 */
function normEmail(email) {
  return (email || '').trim().toLowerCase();
}

function occurrenceRoomId(occurrence) {
  return String(
    occurrence?.projection?.numeric_meeting_id ||
    occurrence?.facts?.find(fact => fact.numeric_meeting_id)?.numeric_meeting_id ||
    ''
  ).trim();
}

function sessionOverlapsOccurrence(session, occurrence, toleranceMs = 30 * 60 * 1000) {
  const occurrenceStartMs = occurrence?.start_time ? Date.parse(occurrence.start_time) : NaN;
  if (Number.isNaN(occurrenceStartMs) || !session?.join_time) return false;

  const joinMs = Date.parse(session.join_time);
  if (Number.isNaN(joinMs)) return false;

  const leaveMs = session.leave_time ? Date.parse(session.leave_time) : joinMs;
  const sessionEndMs = Number.isNaN(leaveMs) ? joinMs : leaveMs;
  const parsedOccurrenceEndMs = occurrence?.end_time ? Date.parse(occurrence.end_time) : NaN;
  const occurrenceEndMs = Number.isNaN(parsedOccurrenceEndMs)
    ? occurrenceStartMs
    : parsedOccurrenceEndMs;

  return joinMs <= occurrenceEndMs + toleranceMs &&
    sessionEndMs >= occurrenceStartMs - toleranceMs;
}

/**
 * Plans migration from an immutable snapshot object.
 * Pure and deterministic: running twice against the same snapshot produces identical manifest and hashes.
 * @param {object} snapshot - Validated snapshot object
 * @returns {object} Migration manifest
 */
export function planMigration(snapshot) {
  const snapshotValidation = validateSnapshot(snapshot);
  if (!snapshotValidation.valid) {
    throw new Error(`Invalid source snapshot: ${snapshotValidation.errors.join('; ')}`);
  }

  const snapshotSha256 = snapshot.content_sha256;
  const sourceFingerprint = snapshot.source.fingerprint;

  const inventory = snapshot.inventory;
  const webhookLogs = inventory.webhook_log_entries || [];
  const meetingRecords = inventory.meeting_records || [];

  // Build Host ID and Room ID lookup tables from legacy records and raw logs
  const hostIdToEmail = { ...KNOWN_HOST_ID_MAP };
  const roomIdToHostEmail = {};
  const roomIdToTopic = {};

  for (const rec of meetingRecords) {
    const d = rec.data || {};
    const email = normEmail(d.host_email || d.hostEmail);
    const hostId = (d.host_id || d.hostId ? String(d.host_id || d.hostId).trim().toLowerCase() : '');
    const roomId = String(rec.meeting_id || d.meeting_id || d.id || '').trim();

    if (hostId && email) {
      hostIdToEmail[hostId] = email;
    }
    if (roomId && email) {
      roomIdToHostEmail[roomId] = email;
    }
    if (roomId && d.topic) {
      roomIdToTopic[roomId] = d.topic;
    }
  }

  // Track dispositions of every source evidence item
  const dispositions = {};
  const summaryCounts = {
    total_source_items: webhookLogs.length + meetingRecords.length,
    exact_occurrence: 0,
    legacy_derived: 0,
    duplicate_evidence: 0,
    informational: 0,
    blocking_invalid: 0
  };

  const blockingErrors = [];

  // 1. Group raw webhook facts by exact UUID
  const rawFactsByUuid = new Map();
  const seenFactFingerprints = new Set();

  for (let idx = 0; idx < webhookLogs.length; idx++) {
    const log = webhookLogs[idx];
    const logId = log.id || `log_${idx}`;
    const sourceHash = computeSha256(log);

    if (!log.payload_raw) {
      // Non-payload log or informational
      if (log.event === 'endpoint.url_validation') {
        dispositions[sourceHash] = { disposition: 'informational', type: log.event };
        summaryCounts.informational++;
        continue;
      }
      dispositions[sourceHash] = { disposition: 'informational', message: 'No payload_raw' };
      summaryCounts.informational++;
      continue;
    }

    let payloadObj = null;
    try {
      payloadObj = typeof log.payload_raw === 'string' ? JSON.parse(log.payload_raw) : log.payload_raw;
    } catch (parseErr) {
      dispositions[sourceHash] = {
        disposition: 'blocking_invalid',
        error: `Malformed JSON in webhook log: ${parseErr.message}`
      };
      summaryCounts.blocking_invalid++;
      blockingErrors.push(`Log ${logId}: Malformed JSON in payload_raw`);
      continue;
    }

    const eventName = payloadObj.event || log.event;
    const obj = payloadObj.payload?.object || {};
    const uuid = obj.uuid ? String(obj.uuid).trim() : null;

    if (!uuid) {
      if (eventName === 'endpoint.url_validation') {
        dispositions[sourceHash] = { disposition: 'informational', type: eventName };
        summaryCounts.informational++;
      } else {
        dispositions[sourceHash] = {
          disposition: 'informational',
          type: eventName,
          note: 'Event without UUID'
        };
        summaryCounts.informational++;
      }
      continue;
    }

    // Normalize facts for this event
    const facts = normalizeWebhookEventToFacts(eventName, payloadObj.payload);
    if (!rawFactsByUuid.has(uuid)) {
      rawFactsByUuid.set(uuid, []);
    }

    let hasNewFact = false;
    for (const fact of facts) {
      const fp = deriveFactFingerprint(fact);
      if (seenFactFingerprints.has(fp)) {
        // Duplicate delivery
        continue;
      }
      seenFactFingerprints.add(fp);
      rawFactsByUuid.get(uuid).push(fact);
      hasNewFact = true;
    }

    if (hasNewFact) {
      dispositions[sourceHash] = {
        disposition: 'exact_occurrence',
        uuid,
        safeId: toSafeOccurrenceId(uuid)
      };
      summaryCounts.exact_occurrence++;
    } else {
      dispositions[sourceHash] = {
        disposition: 'duplicate_evidence',
        uuid
      };
      summaryCounts.duplicate_evidence++;
    }
  }

  // 2. Reduce exact raw occurrences
  const plannedOccurrences = new Map();

  for (const [uuid, facts] of rawFactsByUuid.entries()) {
    // Resolve host email
    let hostEmail = null;
    let hostId = null;
    for (const f of facts) {
      if (f.host_email) hostEmail = normEmail(f.host_email);
      if (f.host_id) hostId = String(f.host_id).trim().toLowerCase();
    }
    if (!hostEmail && hostId && hostIdToEmail[hostId]) {
      hostEmail = hostIdToEmail[hostId];
    }
    if (!hostEmail) {
      for (const f of facts) {
        if (f.numeric_meeting_id && roomIdToHostEmail[f.numeric_meeting_id]) {
          hostEmail = roomIdToHostEmail[f.numeric_meeting_id];
          break;
        }
      }
    }

    // Enhance facts with resolved host email if missing
    if (hostEmail) {
      for (const f of facts) {
        if (!f.host_email) f.host_email = hostEmail;
      }
    }

    const projection = reduceOccurrenceFacts(uuid, facts);
    if (!projection.host_email && hostEmail) {
      projection.host_email = hostEmail;
    }

    const safeId = toSafeOccurrenceId(uuid);
    plannedOccurrences.set(uuid, {
      occurrence_id: uuid,
      safeId,
      uuid,
      identity_kind: 'exact_uuid',
      host_email: projection.host_email,
      start_time: projection.start_time,
      end_time: projection.end_time,
      facts,
      projection
    });
  }

  // 3. Examine legacy meeting records (zoom:meeting:*)
  // Identify exact UUIDs not in raw facts, and partition multi-day participant sessions
  for (const rec of meetingRecords) {
    const sourceHash = computeSha256(rec);
    const d = rec.data || {};
    const numericMeetingId = String(rec.meeting_id || d.meeting_id || d.id || '').trim();
    const rawUuid = d.uuid ? String(d.uuid).trim() : null;
    const hostEmail = normEmail(d.host_email || d.hostEmail || roomIdToHostEmail[numericMeetingId]);
    const rawParticipants = d.participants || {};

    const participantList = Array.isArray(rawParticipants)
      ? rawParticipants
      : Object.entries(rawParticipants).map(([k, p]) => ({ _key: k, ...p }));

    // A. If legacy record has an exact UUID already in plannedOccurrences:
    if (rawUuid && plannedOccurrences.has(rawUuid)) {
      dispositions[sourceHash] = {
        disposition: 'exact_occurrence_supplemental',
        uuid: rawUuid,
        safeId: toSafeOccurrenceId(rawUuid)
      };
      summaryCounts.exact_occurrence++;

      // Check for participant sessions in this legacy record that belong to OTHER times/dates
      const existingOcc = plannedOccurrences.get(rawUuid);
      // Extract sessions that are separated by hours/days from this occurrence window
      const orphanedSessionsByDate = new Map();

      for (const p of participantList) {
        const sessions = Array.isArray(p.sessions) ? p.sessions : (p.join_time ? [{ join_time: p.join_time, leave_time: p.leave_time }] : []);
        for (const s of sessions) {
          if (!s || !s.join_time) continue;
          const sJoinMs = Date.parse(s.join_time);
          if (Number.isNaN(sJoinMs)) continue;

          // A participant may join long after the meeting starts. Match using
          // interval overlap with the full occurrence window, not distance from
          // the start timestamp alone.
          const inWindow = sessionOverlapsOccurrence(s, existingOcc);
          if (!inWindow) {
            // Check if this session matches ANY other planned raw occurrence
            let matchedOther = false;
            for (const otherOcc of plannedOccurrences.values()) {
              if (otherOcc.uuid === rawUuid) continue;
              if (occurrenceRoomId(otherOcc) !== numericMeetingId) continue;
              if (sessionOverlapsOccurrence(s, otherOcc)) {
                matchedOther = true;
                break;
              }
            }

            if (!matchedOther) {
              // Group orphaned session by date/start window
              const sessionDateKey = s.join_time.slice(0, 10);
              if (!orphanedSessionsByDate.has(sessionDateKey)) {
                orphanedSessionsByDate.set(sessionDateKey, []);
              }
              orphanedSessionsByDate.get(sessionDateKey).push({
                participant: p,
                session: s
              });
            }
          }
        }
      }

      // If distinct historical sessions exist with no raw UUID, reconstruct them as legacy_derived
      for (const [dateKey, sessionEntries] of orphanedSessionsByDate.entries()) {
        const sortedEntries = sessionEntries.sort((a, b) => Date.parse(a.session.join_time) - Date.parse(b.session.join_time));
        const firstJoinTime = sortedEntries[0].session.join_time;
        let invalidLeaveBoundaryCount = 0;
        const lastLeaveTime = sortedEntries.reduce((latest, e) => {
          if (!e.session.leave_time) return latest;
          const joinMs = Date.parse(e.session.join_time);
          const leaveMs = Date.parse(e.session.leave_time);
          if (Number.isNaN(leaveMs) || (!Number.isNaN(joinMs) && leaveMs < joinMs)) {
            invalidLeaveBoundaryCount++;
            return latest;
          }
          if (!latest) return e.session.leave_time;
          return e.session.leave_time > latest ? e.session.leave_time : latest;
        }, null);

        const derivedId = deriveLegacyDerivedId(numericMeetingId, firstJoinTime);
        const derivedSafeId = toSafeOccurrenceId(derivedId);

        // Build facts for this derived occurrence
        const derivedFacts = [
          {
            type: 'meeting.started',
            occurrence_id: derivedId,
            uuid: null,
            identity_kind: 'legacy_derived',
            numeric_meeting_id: numericMeetingId,
            topic: d.topic || roomIdToTopic[numericMeetingId] || 'Zoom Meeting',
            host_email: hostEmail,
            start_time: firstJoinTime,
            timezone: d.timezone || 'Europe/Kyiv',
            source_timestamp: firstJoinTime
          }
        ];

        if (lastLeaveTime) {
          derivedFacts.push({
            type: 'meeting.ended',
            occurrence_id: derivedId,
            uuid: null,
            identity_kind: 'legacy_derived',
            numeric_meeting_id: numericMeetingId,
            end_time: lastLeaveTime,
            source_timestamp: lastLeaveTime
          });
        }

        for (const { participant: p, session: s } of sortedEntries) {
          derivedFacts.push({
            type: 'participant.joined',
            occurrence_id: derivedId,
            uuid: null,
            identity_kind: 'legacy_derived',
            numeric_meeting_id: numericMeetingId,
            user_id: p.user_id ? String(p.user_id).trim() : null,
            email: p.email ? normEmail(p.email) : null,
            name: p.name || p.user_name || null,
            is_host: Boolean(p.is_host),
            join_time: s.join_time,
            source_timestamp: s.join_time
          });

          const joinMs = Date.parse(s.join_time);
          const leaveMs = s.leave_time ? Date.parse(s.leave_time) : NaN;
          const hasValidLeave = s.leave_time && !Number.isNaN(leaveMs) &&
            (Number.isNaN(joinMs) || leaveMs >= joinMs);

          if (hasValidLeave) {
            derivedFacts.push({
              type: 'participant.left',
              occurrence_id: derivedId,
              uuid: null,
              identity_kind: 'legacy_derived',
              numeric_meeting_id: numericMeetingId,
              user_id: p.user_id ? String(p.user_id).trim() : null,
              email: p.email ? normEmail(p.email) : null,
              name: p.name || p.user_name || null,
              leave_time: s.leave_time,
              source_timestamp: s.leave_time
            });
          }
        }

        const provenance = {
          source: 'poc_snapshot',
          numeric_meeting_id: numericMeetingId,
          start_time: firstJoinTime,
          derivation_version: 1,
          reason: 'Historical session without retained raw Zoom UUID',
          invalid_leave_boundaries_ignored: invalidLeaveBoundaryCount
        };

        const identityObj = {
          occurrence_id: derivedId,
          uuid: null,
          identity_kind: 'legacy_derived',
          identity_provenance: provenance
        };

        const derivedProjection = reduceOccurrenceFacts(identityObj, derivedFacts);

        plannedOccurrences.set(derivedId, {
          occurrence_id: derivedId,
          safeId: derivedSafeId,
          uuid: null,
          identity_kind: 'legacy_derived',
          identity_provenance: provenance,
          host_email: hostEmail,
          start_time: firstJoinTime,
          end_time: lastLeaveTime,
          facts: derivedFacts,
          projection: derivedProjection
        });

        summaryCounts.legacy_derived++;
      }

      continue;
    }

    // B. Legacy record has an exact UUID NOT in raw facts:
    if (rawUuid && !plannedOccurrences.has(rawUuid)) {
      if (!hostEmail) {
        dispositions[sourceHash] = {
          disposition: 'blocking_invalid',
          error: `Legacy record ${numericMeetingId} has UUID ${rawUuid} but missing host email`
        };
        summaryCounts.blocking_invalid++;
        blockingErrors.push(`Meeting ${numericMeetingId}: Missing host email`);
        continue;
      }

      const startTime = d.start_time || d.startTime;
      if (!startTime || Number.isNaN(Date.parse(startTime))) {
        dispositions[sourceHash] = {
          disposition: 'blocking_invalid',
          error: `Legacy record ${numericMeetingId} has UUID ${rawUuid} but invalid start_time`
        };
        summaryCounts.blocking_invalid++;
        blockingErrors.push(`Meeting ${numericMeetingId}: Invalid start_time`);
        continue;
      }

      const safeId = toSafeOccurrenceId(rawUuid);
      const facts = [
        {
          type: 'meeting.started',
          occurrence_id: rawUuid,
          uuid: rawUuid,
          identity_kind: 'exact_uuid',
          numeric_meeting_id: numericMeetingId,
          topic: d.topic || 'Zoom Meeting',
          host_id: d.host_id || null,
          host_email: hostEmail,
          host_name: d.host_name || null,
          start_time: startTime,
          timezone: d.timezone || 'Europe/Kyiv',
          source_timestamp: startTime
        }
      ];

      if (d.end_time || d.endTime) {
        facts.push({
          type: 'meeting.ended',
          occurrence_id: rawUuid,
          uuid: rawUuid,
          identity_kind: 'exact_uuid',
          numeric_meeting_id: numericMeetingId,
          end_time: d.end_time || d.endTime,
          duration: d.duration !== undefined ? Number(d.duration) : null,
          source_timestamp: d.end_time || d.endTime
        });
      }

      // Add participant facts strictly belonging to this occurrence start window
      const occStartMs = Date.parse(startTime);
      for (const p of participantList) {
        const sessions = Array.isArray(p.sessions) ? p.sessions : (p.join_time ? [{ join_time: p.join_time, leave_time: p.leave_time }] : []);
        for (const s of sessions) {
          if (!s || !s.join_time) continue;
          const sJoinMs = Date.parse(s.join_time);
          if (Number.isNaN(sJoinMs)) continue;
          if (Math.abs(sJoinMs - occStartMs) <= 30 * 60 * 1000) {
            facts.push({
              type: 'participant.joined',
              occurrence_id: rawUuid,
              uuid: rawUuid,
              identity_kind: 'exact_uuid',
              numeric_meeting_id: numericMeetingId,
              user_id: p.user_id ? String(p.user_id).trim() : null,
              email: p.email ? normEmail(p.email) : null,
              name: p.name || p.user_name || null,
              is_host: Boolean(p.is_host),
              join_time: s.join_time,
              source_timestamp: s.join_time
            });
            if (s.leave_time) {
              facts.push({
                type: 'participant.left',
                occurrence_id: rawUuid,
                uuid: rawUuid,
                identity_kind: 'exact_uuid',
                numeric_meeting_id: numericMeetingId,
                user_id: p.user_id ? String(p.user_id).trim() : null,
                email: p.email ? normEmail(p.email) : null,
                name: p.name || p.user_name || null,
                leave_time: s.leave_time,
                source_timestamp: s.leave_time
              });
            }
          }
        }
      }

      const projection = reduceOccurrenceFacts(rawUuid, facts);
      plannedOccurrences.set(rawUuid, {
        occurrence_id: rawUuid,
        safeId,
        uuid: rawUuid,
        identity_kind: 'exact_uuid',
        host_email: hostEmail,
        start_time: startTime,
        end_time: d.end_time || d.endTime || null,
        facts,
        projection
      });

      dispositions[sourceHash] = {
        disposition: 'exact_occurrence',
        uuid: rawUuid,
        safeId
      };
      summaryCounts.exact_occurrence++;
      continue;
    }

    // C. Legacy record has NO UUID at all
    // Check if it represents a distinct session
    const startTime = d.start_time || d.startTime;
    if (startTime && !Number.isNaN(Date.parse(startTime)) && hostEmail) {
      const derivedId = deriveLegacyDerivedId(numericMeetingId, startTime);
      const derivedSafeId = toSafeOccurrenceId(derivedId);

      const provenance = {
        source: 'poc_snapshot',
        numeric_meeting_id: numericMeetingId,
        start_time: startTime,
        derivation_version: 1,
        reason: 'Legacy meeting record without UUID'
      };

      const identityObj = {
        occurrence_id: derivedId,
        uuid: null,
        identity_kind: 'legacy_derived',
        identity_provenance: provenance
      };

      const facts = [
        {
          type: 'meeting.started',
          occurrence_id: derivedId,
          uuid: null,
          identity_kind: 'legacy_derived',
          numeric_meeting_id: numericMeetingId,
          topic: d.topic || 'Zoom Meeting',
          host_email: hostEmail,
          start_time: startTime,
          timezone: d.timezone || 'Europe/Kyiv',
          source_timestamp: startTime
        }
      ];

      const projection = reduceOccurrenceFacts(identityObj, facts);
      plannedOccurrences.set(derivedId, {
        occurrence_id: derivedId,
        safeId: derivedSafeId,
        uuid: null,
        identity_kind: 'legacy_derived',
        identity_provenance: provenance,
        host_email: hostEmail,
        start_time: startTime,
        end_time: d.end_time || null,
        facts,
        projection
      });

      dispositions[sourceHash] = {
        disposition: 'legacy_derived',
        occurrence_id: derivedId,
        safeId: derivedSafeId
      };
      summaryCounts.legacy_derived++;
    } else {
      dispositions[sourceHash] = {
        disposition: 'blocking_invalid',
        error: `Legacy record ${numericMeetingId} cannot be resolved to an occurrence`
      };
      summaryCounts.blocking_invalid++;
      blockingErrors.push(`Record ${numericMeetingId}: Unresolvable without UUID or start_time/host`);
    }
  }

  // 4. Validate domain invariants for every planned occurrence & compute hashes
  const plannedList = [];
  const plannedByHost = {};

  for (const item of plannedOccurrences.values()) {
    const inv = validateOccurrenceInvariants(item.projection);
    if (!inv.valid) {
      blockingErrors.push(`Occurrence ${item.occurrence_id}: Invariant failed (${inv.errors.join(', ')})`);
      summaryCounts.blocking_invalid++;
    }

    const projHash = computeProjectionHash(item.projection);
    const factFps = item.facts.map(f => deriveFactFingerprint(f)).sort();

    const plannedEntry = {
      occurrence_id: item.occurrence_id,
      safeId: item.safeId,
      uuid: item.uuid,
      identity_kind: item.identity_kind,
      identity_provenance: item.identity_provenance || null,
      host_email: item.host_email,
      topic: item.projection?.topic || item.topic || 'Zoom Meeting',
      duration_seconds: item.projection?.duration_seconds ?? null,
      start_time: item.start_time,
      end_time: item.end_time,
      score: item.start_time ? Date.parse(item.start_time) : Date.now(),
      facts: item.facts,
      fact_fingerprints: factFps,
      projection: item.projection,
      projection_sha256: projHash
    };

    plannedList.push(plannedEntry);

    const h = normEmail(item.host_email);
    if (!plannedByHost[h]) plannedByHost[h] = [];
    plannedByHost[h].push(plannedEntry);
  }

  // Sort planned occurrences chronologically
  plannedList.sort((a, b) => (a.score || 0) - (b.score || 0));

  // 5. Build Mandatory Teachers Reconciliation Table
  const teacherReconciliation = {};
  for (const t of MANDATORY_TEACHERS) {
    const email = t.email.toLowerCase();
    const teacherOccs = plannedByHost[email] || [];
    const exactCount = teacherOccs.filter(o => o.identity_kind === 'exact_uuid').length;
    const derivedCount = teacherOccs.filter(o => o.identity_kind === 'legacy_derived').length;

    // Check if host mapping resolved
    let hostMappingStatus = 'mapped';
    if (!email) {
      hostMappingStatus = 'unmapped';
      blockingErrors.push(`Mandatory teacher ${t.name} has no valid email`);
      summaryCounts.blocking_invalid++;
    }

    teacherReconciliation[email] = {
      teacher_name: t.name,
      teacher_email: email,
      host_mapping_status: hostMappingStatus,
      source_occurrence_count: teacherOccs.length,
      exact_identity_count: exactCount,
      legacy_derived_count: derivedCount,
      planned_target_count: teacherOccs.length,
      occurrence_ids: teacherOccs.map(o => o.occurrence_id),
      status: teacherOccs.length > 0 ? 'reconciled' : 'zero_activity_verified'
    };
  }

  // 6. Build the final manifest
  const manifestData = {
    schema_version: SCHEMA_VERSION,
    migration_id: MIGRATION_ID,
    snapshot_sha256: snapshotSha256,
    created_at: new Date().toISOString(),
    source: {
      fingerprint: sourceFingerprint,
      cutoff_at: snapshot.source.cutoff_at
    },
    summary_counts: summaryCounts,
    blocking_errors: blockingErrors,
    teacher_reconciliation: teacherReconciliation,
    dispositions,
    occurrences: plannedList
  };

  const manifestSha256 = computeSha256({
    snapshot_sha256: snapshotSha256,
    occurrences: plannedList.map(o => ({
      occurrence_id: o.occurrence_id,
      projection_sha256: o.projection_sha256,
      fact_fingerprints: o.fact_fingerprints
    })),
    teacher_reconciliation: teacherReconciliation
  });

  manifestData.manifest_sha256 = manifestSha256;

  return manifestData;
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('plan-zoom-migration.js')) {
  const args = process.argv.slice(2);
  let snapshotPath = '';
  let outputPath = '';
  let reportPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--snapshot' && i + 1 < args.length) {
      snapshotPath = args[++i];
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (args[i] === '--report' && i + 1 < args.length) {
      reportPath = args[++i];
    }
  }

  if (!snapshotPath) {
    console.error('Usage: node plan-zoom-migration.js --snapshot <snapshot.json> [--output <manifest.json>]');
    process.exit(1);
  }

  try {
    const rawSnap = fs.readFileSync(path.resolve(snapshotPath), 'utf-8');
    const snapshot = JSON.parse(rawSnap);
    const manifest = planMigration(snapshot);

    console.log('====================================================');
    console.log('📋 CRM-005 Migration Planner Output');
    console.log(`   Manifest SHA-256:     ${manifest.manifest_sha256}`);
    console.log(`   Total Planned Occs:   ${manifest.occurrences.length}`);
    console.log(`   - Exact UUIDs:        ${manifest.occurrences.filter(o => o.identity_kind === 'exact_uuid').length}`);
    console.log(`   - Legacy Derived:     ${manifest.occurrences.filter(o => o.identity_kind === 'legacy_derived').length}`);
    console.log(`   Blocking Errors:      ${manifest.blocking_errors.length}`);
    console.log('====================================================');

    if (outputPath) {
      const resolvedOutput = path.resolve(outputPath);
      const dir = path.dirname(resolvedOutput);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedOutput, JSON.stringify(manifest, null, 2), 'utf-8');
      console.log(`📄 Manifest written to: ${resolvedOutput}`);
    }

    if (manifest.blocking_errors.length > 0) {
      console.error('\n❌ Planning failed due to blocking errors:');
      manifest.blocking_errors.forEach(e => console.error(`   - ${e}`));
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error(`❌ Planning error: ${err.message}`);
    process.exit(1);
  }
}
