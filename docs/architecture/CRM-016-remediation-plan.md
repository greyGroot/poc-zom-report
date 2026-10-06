# CRM-016 Remediation Plan: Architectural Review & Directives

## 1. Zoom Meeting History Scope
**Issue:** Meetings for some teachers were missing or completely empty because the sync script (`sync-zoom-reports.js`) was only run for a short date range (Sep 26-29), and some teachers genuinely had no meetings in September.
**Directive:** 
- The developer must update the `sync-zoom-reports.js` script to ensure it can sync a full month of data (e.g., 2026-09-01 to 2026-09-30). 
- If Zoom API rate limits or pagination require it, ensure the sync script processes in chunks but covers the full specified range.
- The script should output a summary report at the end showing which teachers had meetings synced and which teachers had exactly 0 meetings, to avoid future confusion during verification.

## 2. Missing Lesson Start/End Times on Left-side Schoolmate Schedule
**Issue:** The UI misses start/end times for lessons past the first week because `SchoolmateClient.getTeacherClassesSchedule` only fetches one week of scheduler events based on the start date (`fromDate`).
**Directive:**
- Modify `SchoolmateClient.getTeacherClassesSchedule` in `ee-crm/lib/infrastructure/schoolmate.js`.
- Introduce a loop to iterate from `fromDate` to `toDate` in 7-day increments.
- Fetch scheduler events for each week and merge the results into a single `timeMap` so that all lessons across the multi-week query range have accurate start and end times.

## 3. Duplicate Teacher in Directory
**Issue:** `zhur.zhur.irene@gmail.com` appears twice in the directory (different IDs, same `schoolmateTeacherId`).
**Directive:**
- Implement defensive deduplication in the teacher retrieval service (`getTeachers()`).
- Deduplicate based on `schoolmateTeacherId` and/or email address.
- When deduplicating, prefer the record with richer metadata or the most recent timestamps.
- Create a one-off cleanup script or instruction for the developer to run to remove the redundant duplicate keys from the Redis store.

## 4. QA Test Rigor
**Issue:** Current tests might pass on empty mocked data without verifying real data constraints.
**Directive:**
- Update E2E and integration tests to assert strict contracts.
- Ensure assertions explicitly check for the presence of actual data (e.g., array length > 0, specific fields present) rather than just succeeding on empty arrays or nulls.
- Fail tests if required real data properties are missing.
