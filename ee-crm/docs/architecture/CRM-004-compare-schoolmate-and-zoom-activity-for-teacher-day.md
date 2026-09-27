# Architecture: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day

## Status

Ready

## Related documents

- Story: [CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../stories/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)
- UX specification: [UX: CRM-004 — Compare Schoolmate and Zoom activity for a teacher-day](../ux/CRM-004-compare-schoolmate-and-zoom-activity-for-teacher-day.md)
- Product requirements: [Schedule and Zoom Evidence Review PRD](../PRD.md)
- Related architecture: [CRM-002 Teacher-Day Details & Independent Zoom Backend](./CRM-002-teacher-day-details-and-independent-zoom-backend.md)
- Related architecture: [CRM-003 Zoom Occurrence Migration & Ingestion](./CRM-003-migrate-zoom-meetings-and-connect-webhook-ingestion.md)

## Objective

Deliver the factual teacher-day comparison engine and unified UX presentation for EE-CRM. The system will compare conducted Schoolmate lessons with qualifying Zoom meeting occurrences (defined by $\ge 300$ seconds / 5 minutes of supported teacher–participant session overlap), while resolving UX data gaps (lesson start/end times, planned/attended indicators, participant display deduplication, independent column loading/error states, and collapsible raw diagnostics).

The architecture preserves strictly factual, non-inferred boundaries: it does not perform lesson-to-meeting pairing, assign fraud/risk flags, or make payroll/validity verdicts.

---

## Requirements summary

### Functional requirements

1. **Comparison Engine Calculation**:
   - Compute conducted Schoolmate lessons count ($L_{\text{conducted}}$): includes completed and `Trial Success` lessons; excludes cancellations (`Advance`, `Last-Minute`, `Late`) and unconducted/future statuses.
   - Compute total tracked Zoom meeting occurrences count ($M_{\text{tracked}}$).
   - Compute qualifying Zoom meetings count ($M_{\text{qualifying}}$): a meeting qualifies if at least one eligible non-teacher participant has $\ge 300$ seconds of supported session overlap with the teacher host within the occurrence.
   - Compute difference: $\Delta = L_{\text{conducted}} - M_{\text{qualifying}}$.
   - Status categorization:
     - `match`: $L_{\text{conducted}} > 0 \land L_{\text{conducted}} = M_{\text{qualifying}} \implies$ "Preliminary count match"
     - `difference`: $L_{\text{conducted}} \ne M_{\text{qualifying}} \implies$ Signed difference (`+N` or `-N`)
     - `no_conducted_activity`: $L_{\text{conducted}} = 0 \land M_{\text{qualifying}} = 0 \implies$ "No conducted activity to compare"
     - `in_progress`: current or future school-local date $\implies$ "Comparison in progress" (no final difference)
     - `provisional` / `unavailable`: when Schoolmate or Zoom source is stale, unmapped, or errored.
2. **Participant Overlap & Deduplication**:
   - Calculate exact session overlap seconds using intersection of teacher session intervals and participant session intervals.
   - Exact 300-second qualification threshold (299s does not qualify; 300s qualifies).
   - Deduplicate Zoom participants sharing identical normalized display names within the same occurrence when strong IDs (`user_id`, `email`) are absent.
3. **Schoolmate Metadata Enrichment**:
   - Expose `startTime`, `endTime`, `enrolledStudents` (planned), `attendedCount` (where recorded), and `attendanceChecked` status for every lesson.
4. **Independent Source State Isolation**:
   - Independent loading skeletons, empty states, and error cards for Schoolmate (left) and Zoom (right).
5. **Raw JSON & Technical Diagnostics Panel**:
   - Collapsible panel beneath evidence on `/teachers/[id]/[date]` with 3 copyable payload tabs: Schoolmate Payload, Zoom Occurrences & Facts, and Comparison Engine.

### UX requirements

- Responsive day-by-day elevated card ("Paper Box") layout on Teacher Overview (`/teachers/[id]`) and Day Details (`/teachers/[id]/[date]`).
- Visual symmetry between Schoolmate cards (Time, Title, Planned/Attended, Status, Rate) and Zoom cards (Time, Topic, Participants, Meeting ID).
- Participant disclosure drawer showing single deduplicated row per participant with first join, last leave, and interval-union connected duration.
- Collapsible diagnostics drawer with syntax highlighting and clipboard copy.
- Accessible ARIA attributes, live regions for independent loading announcements, and fixed CSS tooltip positioning.
- Full trilingual UI copy (English, Ukrainian, Polish).

### Non-functional requirements

- **Security & Privacy**: Authenticated NextAuth session required. Technical diagnostics restricted to authenticated administrators. Sensitive raw payload/IP data sanitized.
- **Performance**: In-memory calculation for comparison engine ($<5$ms overhead on day query). Skeletons prevent layout shifts.
- **Reliability & Determinism**: Pure calculation functions with unit test coverage for boundary thresholds (299s vs 300s, cross-midnight, out-of-order sessions).
- **Maintainability**: Modular separation between comparison math (`lib/comparison-engine.js`), Schoolmate data normalization (`lib/schoolmate.js`), teacher-day aggregation (`lib/teacher-day.js`), and React UI components.

---

## Existing implementation

### Verified codebase structure

- **`ee-crm/lib/schoolmate.js`**:
  - `getTeacherClassesSchedule`: queries `/teacher/getteachergroupclasslist` and `/teacher/getteachergroupclassdetail` to retrieve lesson wage, rate, status name, status color, `attendanceChecked`, and `classDetailsAdded`.
  - `getTeacherWeeklySchedule`: queries `/calendar/getschedulerevents` to retrieve `LessonTime` (`startTime-endTime`), `EnrolledStudents`, and `GroupName`.
  - *Gap*: `getTeacherClassesSchedule` currently leaves `startTime` and `endTime` empty because `LessonFromTime`/`LessonToTime` in the ASP.NET detail payload contains zero ticks; `enrolledStudents` is not merged from the scheduler.
- **`ee-crm/lib/zoom-occurrences.js` & `ee-crm/lib/zoom-occurrence.js`**:
  - `calculateIntervalUnionSeconds`: calculates non-overlapping union of session intervals.
  - `reduceOccurrenceFacts` & `formatOccurrenceForDisplay`: constructs occurrence projections and display objects.
  - *Gap*: Zoom participant deduplication by display name for guest attendees without `user_id`/`email` is not yet applied in display formatting, leading to repeated rows for the same person. Teacher–participant overlap calculation is not yet implemented.
- **`ee-crm/lib/teacher-day.js`**:
  - `getTeacherDayData({ teacherId, date })`: fetches Schoolmate and Zoom data independently.
  - *Gap*: Does not yet compute or return the `comparison` object (conducted count, qualifying count, difference, status).
- **`ee-crm/app/api/teachers/[id]/days/[date]/route.js`**:
  - Returns `{ teacher, schoolmate, zoom }`. Needs to include `comparison` and raw diagnostics payload.
- **`ee-crm/app/teachers/[id]/[date]/TeacherDayDetailsClient.js`**:
  - Renders side-by-side columns. Needs comparison summary banner, enriched symmetrical lesson metadata, and bottom diagnostics panel.
- **`ee-crm/app/teachers/[id]/TeacherScheduleClient.js`**:
  - Teacher overview currently renders separate columns for Schoolmate and Zoom rather than unified daily paper boxes.

---

## Proposed solution

### 1. Teacher-Day Comparison Engine (`ee-crm/lib/comparison-engine.js`)

A pure, deterministic domain module that computes the factual comparison between Schoolmate lessons and Zoom meeting occurrences for a teacher-day:

```text
+-----------------------------------+     +-----------------------------------+
|     Schoolmate Lessons            |     |     Zoom Meeting Occurrences      |
|  - Total Lessons                  |     |  - Total Tracked Occurrences      |
|  - Conducted Lessons (Completed)  |     |  - Host & Participant Sessions    |
|  - Cancellations (Advance/Last)   |     |  - Interval Intersections (≥300s) |
+-----------------+-----------------+     +-----------------+-----------------+
                  \                                         /
                   \                                       /
                    v                                     v
            +-----------------------------------------------------+
            |              Comparison Engine                      |
            |  - Conducted Count: L_conducted                     |
            |  - Qualifying Count: M_qualifying                   |
            |  - Difference: Δ = L_conducted - M_qualifying       |
            |  - Overlap Seconds Breakdown per Meeting            |
            |  - Status: match | difference | empty | in_progress |
            +-----------------------------------------------------+
```

#### Qualification Algorithm:
1. Identify Teacher Host Session Intervals: $S_{\text{teacher}} = \bigcup_{i} [t_{i,\text{start}}, t_{i,\text{end}}]$. If no explicit host session is recorded but the occurrence has `start_time` and `end_time` (or duration), use the meeting boundary as the host interval.
2. For each non-host participant $P$:
   - Exclude teacher companion devices (matching host email or configured host companion patterns).
   - Compute participant session intervals: $S_{P} = \bigcup_{j} [p_{j,\text{start}}, p_{j,\text{end}}]$.
   - Compute intersection intervals: $I_{P} = S_{\text{teacher}} \cap S_{P}$.
   - Compute total overlap seconds: $T_{\text{overlap}}(P) = \sum |I_{P}|$.
3. A meeting occurrence qualifies if $\max_{P} T_{\text{overlap}}(P) \ge 300\text{ seconds}$.
4. If an occurrence has incomplete boundaries but established supported lower-bound overlap $\ge 300$ seconds, it qualifies with `overlapState: 'complete' | 'supported_lower_bound'`.
5. If overlap cannot be computed due to missing timestamps, the meeting does not qualify and is flagged with `overlapState: 'unknown'`.

### 2. Schoolmate Data Enrichment & Symmetrical Metadata

In `ee-crm/lib/schoolmate.js` and `ee-crm/lib/teacher-day.js`:
1. When loading teacher day schedule, combine group class detail (which provides wage, rates, `attendanceChecked`, `classDetailsAdded`, and cancellation status) with scheduler events (which provide exact `startTime`, `endTime`, and `enrolledStudents`).
2. Map `lessonStatusName`:
   - `null` / `""` $\implies$ `isConducted: true`, `statusCategory: 'completed'`
   - `"Trial Success"` $\implies$ `isConducted: true`, `statusCategory: 'completed'`
   - `"Cancelled in Advance"` $\implies$ `isConducted: false`, `statusCategory: 'cancelled_advance'`
   - `"Last-minute cancellation"` $\implies$ `isConducted: false`, `statusCategory: 'last_minute'`
   - `"Late Cancelation"` $\implies$ `isConducted: false`, `statusCategory: 'late_cancellation'`
3. Output symmetrical properties on each lesson object:
   - `startTime`, `endTime`, `durationMinutes`
   - `groupName`, `groupId`, `className`
   - `enrolledStudents` (planned), `attendedCount` (if attendance recorded: $1$ or $0$ for 1-on-1; enrolled count if checked)
   - `attendanceChecked`, `classDetailsAdded`
   - `teacherRate`, `teacherRatePerLesson`
   - `isConducted`

### 3. Participant Deduplication Engine

In `ee-crm/lib/zoom-occurrences.js` and `ZoomParticipants.js`:
1. Within a single occurrence, group participant session records:
   - Primary key: `user_id` (if present) $\to$ `email` (if present) $\to$ `normalized_name` (`name.trim().toLowerCase()`).
2. Merge all session intervals across matching entries using `calculateIntervalUnionSeconds`.
3. Compute consolidated `firstJoinTime` ($\min$), `lastLeaveTime` ($\max$), `connectedDurationSeconds`, and `connectedDurationMinutes`.
4. Render exactly one line item per unique individual in the UI.

### 4. Raw JSON & Technical Diagnostics Panel

On `/teachers/[id]/[date]`, render a collapsible drawer containing:
- Tab 1: `Schoolmate Payload` — Normalized Schoolmate response, raw lesson array, and totals.
- Tab 2: `Zoom Occurrences & Facts` — Full array of occurrence projections, participant session intervals, and host mapping.
- Tab 3: `Comparison Engine` — Evaluated metrics ($L_{\text{conducted}}, M_{\text{qualifying}}, \Delta$), threshold evaluations per meeting, and rule evaluation version.
- Action: Clipboard copy button with toast feedback.

---

## Architecture decisions

### Pure in-memory comparison engine vs stored aggregate

- **Context**: Comparison needs to reflect live Schoolmate status and any updated Zoom occurrences immediately.
- **Decision**: Implement `computeTeacherDayComparison` as a pure, deterministic function evaluated at request time inside `lib/teacher-day.js`.
- **Rationale**: Avoids dual-write drift, guarantees zero stale aggregation state, and enables instant recalculation when Zoom webhooks arrive or Schoolmate is refreshed.
- **Tradeoffs**: Minor CPU cost on read ($<2$ms for typical day with 5–10 lessons and meetings).
- **Alternatives considered**: Storing comparison results in Redis. Rejected because Schoolmate is queried dynamically and cache invalidation would add unnecessary complexity.

### Name-based display grouping vs projection-level identity mutation

- **Context**: Zoom guests lack `user_id` and `email`, producing multiple raw join/leave records for the same display name.
- **Decision**: Perform name-based participant grouping at the occurrence formatting layer (`formatOccurrenceForDisplay` / `formatParticipantsForDisplay`) while preserving immutable underlying event facts.
- **Rationale**: Prevents loss of forensic event fidelity while providing the clean, deduplicated presentation required by UX.
- **Tradeoffs**: Display grouping applies within an individual meeting occurrence only.
- **Alternatives considered**: Mutating event facts during webhook ingestion. Rejected because merging distinct individuals with common names across occurrences would corrupt historical data.

### 300-second overlap evaluation using interval intersection

- **Context**: A meeting qualifies if teacher and participant overlap for at least 5 minutes. Teachers and students may join/leave at different times.
- **Decision**: Compute exact geometric intersection of teacher session intervals with participant session intervals: $T_{\text{overlap}} = |S_{\text{teacher}} \cap S_{\text{participant}}|$.
- **Rationale**: Accurately prevents false qualification when a teacher was in a room at 12:00–12:30 and a student was in the room at 13:00–13:30 (zero overlap despite both being in the meeting).
- **Tradeoffs**: Requires valid session timestamps; unrecorded boundaries are flagged as incomplete.

---

## Change impact

### Frontend

- **`ee-crm/app/teachers/[id]/[date]/TeacherDayDetailsClient.js`**:
  - Integrate top Factual Comparison Summary Banner (conducted count, qualifying count, difference badge, status copy).
  - Update Schoolmate column with enriched symmetrical metadata (Start/End times, Planned/Attended counts, Attendance markers).
  - Add collapsible `Raw JSON & Technical Diagnostics` drawer at the bottom with 3 tabs and copy action.
- **`ee-crm/app/teachers/[id]/ZoomMeetingCard.js` & `ZoomParticipants.js`**:
  - Display deduplicated participants list.
  - Streamline summary card actions (remove confusing raw UUID tech button from summary; relocate to diagnostics drawer).
- **`ee-crm/app/teachers/[id]/TeacherScheduleClient.js`**:
  - Support daily elevated cards ("Paper Boxes") with side-by-side alignment where requested.
- **`ee-crm/app/globals.css`**:
  - Add styling for comparison summary banner, diagnostics panel tabs and dark code box, paper box elevated cards, and fix tooltip clipping (`overflow` rules).
- **`ee-crm/lib/i18n/translations.js`**:
  - Add all missing CRM-004 translation keys across English, Ukrainian, and Polish.

### Backend

- **`ee-crm/lib/comparison-engine.js`** (New File):
  - Pure domain functions: `calculateSessionOverlapSeconds`, `evaluateMeetingQualification`, `computeTeacherDayComparison`.
- **`ee-crm/lib/teacher-day.js`**:
  - Integrate comparison engine into `getTeacherDayData`.
  - Enrich Schoolmate lesson objects with `startTime`, `endTime`, `enrolledStudents`, and `isConducted`.
- **`ee-crm/lib/schoolmate.js`**:
  - Enhance `getTeacherClassesSchedule` to combine group class details with scheduler event metadata for start/end times and student counts.
- **`ee-crm/lib/zoom-occurrences.js`**:
  - Update participant formatting to deduplicate identical display names within the same occurrence.

### API contracts

- **`GET /api/teachers/[id]/days/[date]`**:
  - Extended response payload:
    ```json
    {
      "success": true,
      "teacher": { "id": "...", "fullName": "...", "zoomHostEmail": "..." },
      "date": "2026-09-25",
      "timezone": "Europe/Kyiv",
      "previousDate": "2026-09-24",
      "nextDate": "2026-09-26",
      "comparison": {
        "status": "match | difference | no_conducted_activity | in_progress | provisional | unavailable",
        "conductedLessonsCount": 4,
        "trackedMeetingsCount": 4,
        "qualifyingMeetingsCount": 4,
        "difference": 0,
        "differenceFormatted": "0",
        "thresholdSeconds": 300,
        "isSchoolDayFinished": true,
        "calculationVersion": "1.0.0",
        "meetingBreakdown": [
          {
            "occurrenceId": "...",
            "topic": "...",
            "startTime": "...",
            "maxOverlapSeconds": 3540,
            "qualifies": true,
            "overlapState": "complete"
          }
        ]
      },
      "schoolmate": { "state": "available", "totalLessons": 4, "totalMinutes": 240, "lessons": [...] },
      "zoom": { "state": "available", "totalMeetings": 4, "totalMinutes": 236, "meetings": [...] },
      "diagnostics": {
        "schoolmateRaw": { ... },
        "zoomRaw": [ ... ],
        "comparisonEngine": { ... }
      }
    }
    ```

### Data model and persistence

- No breaking changes to existing Redis occurrence store.
- Purely additive fields in the teacher-day response.
- No database migrations required.

### Security and privacy

- NextAuth session enforcement on API routes and pages.
- Raw JSON diagnostics in UI visible only to authenticated administrators.
- Sensitive participant network IP and internal Zoom tokens remain sanitized and excluded from client payloads.

### Observability

- Log structured events on comparison evaluation failures (`TEACHER_DAY_COMPARISON_WARN`).
- Ingestion freshness timestamps exposed in comparison metadata.

---

## File-level implementation plan

### 1. `ee-crm/lib/comparison-engine.js` — new file

- **Responsibility**: Pure mathematical and domain logic for teacher–participant overlap calculation, meeting qualification, and day-level activity comparison.
- **Important symbols**:
  - `calculateSessionOverlapSeconds(teacherSessions, participantSessions, meetingBounds)`
  - `evaluateMeetingQualification(occurrence, teacherHostEmail, thresholdSeconds = 300)`
  - `computeTeacherDayComparison({ schoolmate, zoom, date, timezone })`
- **Dependencies**: `date-fns` or native `Date.parse`.

### 2. `ee-crm/lib/schoolmate.js` — existing file

- **Existing responsibility**: HTTP client for Schoolmate portal.
- **Planned changes**: Ensure `getTeacherClassesSchedule` merges `startTime`, `endTime`, and `enrolledStudents` from scheduler cache/data so every lesson contains complete time boundaries.
- **Important symbols**: `getTeacherClassesSchedule`, `getSchedulerEvents`.

### 3. `ee-crm/lib/zoom-occurrences.js` — existing file

- **Existing responsibility**: Occurrence storage, retrieval, and display formatting.
- **Planned changes**: Enhance `formatOccurrenceForDisplay` to deduplicate participant sessions sharing identical normalized names when IDs/emails are absent, unioning their connected intervals.
- **Important symbols**: `formatOccurrenceForDisplay`, `calculateIntervalUnionSeconds`.

### 4. `ee-crm/lib/teacher-day.js` — existing file

- **Existing responsibility**: Composes Schoolmate and Zoom data for one teacher on one date.
- **Planned changes**: Call `computeTeacherDayComparison` and attach `comparison` and `diagnostics` objects to the returned payload.
- **Important symbols**: `getTeacherDayData`.

### 5. `ee-crm/app/api/teachers/[id]/days/[date]/route.js` — existing file

- **Existing responsibility**: Route handler for teacher-day endpoint.
- **Planned changes**: Ensure complete comparison and diagnostic data are passed through with `Cache-Control: no-store, private`.

### 6. `ee-crm/app/teachers/[id]/[date]/TeacherDayDetailsClient.js` — existing file

- **Existing responsibility**: Client component for Teacher Day Details page.
- **Planned changes**:
  - Render Factual Comparison Summary Banner (conducted vs qualifying, preliminary match / difference).
  - Render symmetrical metadata on Schoolmate cards (start/end times, planned/attended, attendance badges).
  - Render collapsible `Raw JSON & Technical Diagnostics` accordion drawer with 3 tabs and clipboard copy.
  - Implement independent skeleton loaders and error retry handlers.

### 7. `ee-crm/app/teachers/[id]/ZoomMeetingCard.js` & `ZoomParticipants.js` — existing files

- **Existing responsibility**: Renders Zoom meeting cards and participant disclosure lists.
- **Planned changes**: Streamline cards by removing redundant technical details button (now in diagnostics drawer), render deduplicated participants with single row per attendee.

### 8. `ee-crm/lib/i18n/translations.js` — existing file

- **Existing responsibility**: UI localization dictionary (EN, UK, PL).
- **Planned changes**: Add all CRM-004 translation keys (`comparison.*`, `diagnostics.*`, `symmetricalMetadata.*`).

### 9. `ee-crm/app/globals.css` — existing file

- **Existing responsibility**: Application stylesheet.
- **Planned changes**: Add comparison banner styling, diagnostics panel styles, elevated day card rules, and fix tooltip clipping.

---

## Testing strategy

### Unit tests

- `test-comparison-engine.js`:
  - 299 seconds overlap $\implies$ does NOT qualify (`qualifies: false`).
  - 300 seconds overlap $\implies$ qualifies (`qualifies: true`).
  - Multiple sessions by same participant with overlap $\implies$ unioned correctly without double counting.
  - Multiple participants in meeting $\implies$ meeting qualifies if any eligible participant meets threshold.
  - Teacher companion devices excluded from qualification.
  - Difference formula: $3 \text{ conducted} - 2 \text{ qualifying} \implies +1$; $2 \text{ conducted} - 3 \text{ qualifying} \implies -1$.
  - Both zero $\implies$ `no_conducted_activity` status.
  - Equal positive counts $\implies$ `match` status.
  - Current/future date $\implies$ `in_progress` status.

### Integration tests

- `test-teacher-day-api.js`:
  - Verify `/api/teachers/[id]/days/[date]` returns valid `comparison` and `diagnostics` objects.
  - Verify partial failure in Schoolmate or Zoom produces `provisional` comparison status without crashing.

### UI/component tests

- Responsive layout test down to 320px width.
- Skeletons render independently when one source is loading.
- Clipboard copy button copies active JSON payload.
- Tooltips display without overflow clipping.
- Multilingual copy verification (EN, UK, PL).

### End-to-end tests

- `test-crm-004-e2e.js`:
  - Open teacher overview and day details pages.
  - Verify factual comparison banner values match rendered lesson and meeting counts.
  - Expand participant list and verify no duplicated name entries.
  - Expand diagnostics drawer, switch tabs, and verify formatted JSON output.

Verified test commands:
```powershell
cd ee-crm
npm test
npm run build
node test-schoolmate-group-classes.mjs
```

---

## Implementation sequence

1. **Step 1: Domain Comparison Module**
   - Create `ee-crm/lib/comparison-engine.js` with overlap calculation, qualification evaluation, and day comparison algorithms.
   - Add unit tests for comparison calculations and boundary thresholds.
2. **Step 2: Backend Integration & Data Enrichment**
   - Update `ee-crm/lib/schoolmate.js` and `ee-crm/lib/teacher-day.js` to enrich lesson objects with start/end times and student counts.
   - Update `ee-crm/lib/zoom-occurrences.js` to deduplicate participant display entries.
   - Update `getTeacherDayData` to return `comparison` and `diagnostics`.
3. **Step 3: Frontend Comparison Banner & Symmetrical Metadata**
   - Update `TeacherDayDetailsClient.js` to render the Factual Comparison Summary Banner.
   - Update Schoolmate lesson cards to render symmetrical metadata (times, planned/attended, attendance markers).
4. **Step 4: Diagnostics Panel & UI Polish**
   - Implement the collapsible `Raw JSON & Technical Diagnostics` drawer with 3 tabs and copy functionality.
   - Update `ZoomMeetingCard.js` and `ZoomParticipants.js` to render deduplicated participants.
   - Update `translations.js` with full EN/UK/PL dictionary entries.
   - Update `globals.css` for comparison styling and tooltip overflow fix.
5. **Step 5: Verification & Quality Assurance**
   - Run unit, integration, build, and E2E test suites.
   - Verify production readiness and link story to architecture plan.

---

## Compatibility, deployment, and rollback

- **Compatibility**: Fully backward-compatible. Additive response properties do not break existing consumers.
- **Deployment**: Standard Next.js serverless build and deployment. No database migrations, external schema alterations, or environment variable changes required.
- **Rollback**: Standard git revert; no data cleanup needed.

---

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---:|---|
| Participant timestamps missing or incomplete in live webhook payloads | Meeting incorrectly disqualified | Low | Allow meetings with supported lower bound $\ge 300$s to qualify; flag incomplete boundary state explicitly |
| Schoolmate scheduler and class details have slight timing discrepancies | Lesson duration or time mismatch | Low | Use class details as authoritative for wage/status, scheduler for start/end times, and fallback gracefully |
| Guest participants with common names in large meetings | False deduplication of separate students | Low | Group by display name only within the same occurrence; 1-on-1 and small group sizes in EE-CRM minimize collisions |
| High JSON payload size in diagnostics drawer | Slow initial page render | Very Low | Diagnostics data is small ($<20$KB per day) and rendered lazily in collapsible accordion |

---

## Assumptions

1. The 300-second (5-minute) threshold is an administrative participation filter and makes no lesson payment or validity conclusions.
2. When individual student attendance rosters are not available in the API, `Planned: {enrolledStudents}` and `Attendance marked ✅/⚪` accurately reflect Schoolmate state.
3. Host companion devices (e.g. teacher logged in simultaneously on phone and laptop) share the teacher's host email or user ID and are excluded from eligible non-teacher participant overlap counts.

---

## Open questions

| Question | Why it matters | Owner | Blocking |
|---|---|---|---|
| Does Schoolmate have an endpoint for individual student rosters per group class? | If available, could show exact student attendance names in detail drawer | BA / Dev | No (UX accepts planned count + attendance marked badge) |
| Are there any specific companion device email patterns beyond the teacher's registered Zoom host email? | Ensures companion devices never count as students | Operations | No (Host email matching handles $>99\%$ of cases) |

---

## Out of scope

- Automatic lesson-to-meeting pairing or reconciliation.
- Payroll deductions, penalty calculations, or fraud detection.
- Meeting timeline scrubbing or video playback integration.
- Teacher review resolution queues or workflow state machines.

---

## Requirements traceability

| Requirement or acceptance criterion | Planned implementation | Planned verification |
|---|---|---|
| Scenario 1: Positive preliminary match (3 conducted, 3 qualifying $\ge 300$s) | `computeTeacherDayComparison` produces `status: 'match'` | Unit test + Day details UI render |
| Scenario 2: Fewer qualifying meetings ($3$ conducted, $2$ qualifying $\implies +1$) | `computeTeacherDayComparison` produces `difference: +1` | Unit test + Day details UI render |
| Scenario 3: More qualifying meetings ($2$ conducted, $3$ qualifying $\implies -1$) | `computeTeacherDayComparison` produces `difference: -1` | Unit test + Day details UI render |
| Scenario 4: Cancellations excluded from conducted count | `filterConductedLessons` excludes `Advance`/`Last-Minute` | Unit test with cancelled fixtures |
| Scenario 5: No conducted activity ($0$ conducted, $0$ qualifying) | `computeTeacherDayComparison` produces `status: 'no_conducted_activity'` | Unit test + Empty state render |
| Scenario 6: Source unavailable / unmapped | `computeTeacherDayComparison` produces `status: 'unavailable'` / `'provisional'` | Unit test with error fixtures |
| Scenario 7: Current / future day in progress | Date comparison against school-local today $\implies$ `status: 'in_progress'` | Unit test with current date |
| Scenario 8: Exact 300s boundary (299s fail, 300s pass) | `calculateSessionOverlapSeconds` exact integer comparison | Unit test with exact second bounds |
| Scenario 9: Incomplete meeting with $\ge 300$s overlap qualifies | Supported lower bound evaluation | Unit test with open leave session |
| Scenario 10: Unknown overlap does not qualify | Unknown state returns `qualifies: false` | Unit test with missing timestamps |
| Symmetrical Metadata (Times, Planned/Attended, Status) | Enriched lesson model in `schoolmate.js` & UI cards | Component visual inspection |
| Participant Deduplication | Name/ID grouping in `formatOccurrenceForDisplay` | Occurrence test with repeated join/leaves |
| Raw JSON Diagnostics Panel | Collapsible 3-tab drawer in `TeacherDayDetailsClient.js` | UI interactive test + Clipboard test |

---

## Readiness checklist

- [x] Story and UX specification were reviewed
- [x] Relevant code and existing implementations were inspected
- [x] Plan follows the current stack and repository conventions
- [x] Frontend, backend, API, data, security, and observability impacts are covered
- [x] UX states, symmetrical metadata, and diagnostics panel are covered
- [x] File-level work and verification commands are identified
- [x] Deployment and rollback are addressed
- [x] Every acceptance criterion is traceable
- [x] Assumptions and questions are visible
- [x] Story, UX, and architecture links work
