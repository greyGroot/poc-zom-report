# CRM-011 — Bookmark, note, and review teacher days

**Story ID:** CRM-011  
**Status:** Draft — workflow and concurrency decisions pending  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)

## Summary

Allow administrators to bookmark teacher days, record notes, and manage a lightweight review lifecycle on the teacher overview and teacher-day detail pages. The workflow preserves the factual Schoolmate and Zoom evidence and its history.

## Business objective

Give administrators a durable way to follow up on days that need human review, record the reason for a decision, and identify evidence that changed after review.

## User story

As a school administrator,  
I want to bookmark a teacher day, add notes, and record its review status,  
so that follow-up is organized and review decisions are traceable.

## Functional requirements

1. Allow an administrator to bookmark and unbookmark a teacher day from the teacher overview and day detail page.
2. Allow an administrator to add a note to a teacher day.
3. Allow these review statuses: `To review`, `Waiting for teacher`, and `Resolved`.
4. Require an explanation when a day is marked `Resolved`; support these optional reasons: rescheduled, meeting restarted, multiple lessons in one meeting, cancellation explained, data issue, and other.
5. Display the current status, bookmark state, notes, and an append-only history of status changes with author and timestamp.
6. Keep bookmarking independent of flags and review status; resolving a day must not remove its evidence, flags, bookmark, or history.
7. Record the evidence revision or snapshot reviewed at resolution.
8. When material Schoolmate or Zoom evidence changes after resolution, mark the day `Updated since review` and preserve the prior review record.
9. Show a clear error when a save fails and prevent silent overwrites caused by concurrent edits.

## Acceptance criteria

### Scenario 1: Bookmark a day without flags

Given an administrator views an unflagged teacher day  
When the administrator bookmarks the day  
Then the bookmark is saved and visible on the overview and day detail page  
And no automated flag is required.

### Scenario 2: Add a note

Given an administrator is viewing a teacher day  
When the administrator submits a valid note  
Then the note is stored with its author and timestamp  
And it appears in the day’s history without modifying evidence.

### Scenario 3: Resolve with explanation

Given a teacher day is `To review` or `Waiting for teacher`  
When an administrator changes it to `Resolved` and supplies an explanation  
Then the resolved status, explanation, author, timestamp, and reviewed evidence revision are retained.

### Scenario 4: Prevent unexplained resolution

Given an administrator attempts to mark a day `Resolved` without an explanation  
When the administrator saves the change  
Then the change is rejected with a clear validation message  
And the existing status remains unchanged.

### Scenario 5: Evidence changes after resolution

Given a teacher day was resolved against a recorded evidence revision  
When material Schoolmate or Zoom evidence changes  
Then the day is marked `Updated since review`  
And the earlier resolution and its evidence revision remain visible.

### Scenario 6: Save or edit conflict

Given a note or status update cannot be saved or conflicts with a newer update  
When the administrator submits the change  
Then the interface reports the failure or conflict clearly  
And it does not silently overwrite the newer data.

## Business rules

- Notes and status history are append-only audit records; corrections are recorded as new entries.
- Bookmarking is independent of automated flags and review status.
- `Updated since review` indicates changed evidence, not that the prior reviewer made an incorrect decision.
- Review actions do not change Schoolmate, Zoom, comparison evidence, invitation status, or payroll data.
- Only an explicit `Resolved` action requires an explanation.

## Permissions and roles

- Users authorized to view a teacher day may create and view review records, subject to existing EE-CRM access controls.
- The final permission model must define whether all authorized users may resolve days or whether resolution is restricted to a reviewer role.

## Data requirements

- Teacher-day identifier, bookmark state, current review status, note text, optional resolution reason, explanation, author, timestamps, and history entries.
- Reviewed evidence revision or immutable snapshot reference at resolution.
- Version or concurrency metadata sufficient to detect conflicting changes.

## Edge cases and error handling

- A bookmarked day is later resolved, or an unbookmarked day remains under review.
- Multiple notes and rapid consecutive status changes.
- A note is submitted while data is refreshing or another administrator edits the day.
- Evidence becomes unavailable after resolution.
- A resolved day changes repeatedly; preserve each review and update event rather than losing history.

## Dependencies

- CRM-002 teacher-day detail page.
- CRM-004 comparison evidence and CRM-010 attention flags, where available.
- Persistent review-record storage, user identity, and approved UX for status/history display.

## Assumptions

- Review work starts from the teacher overview or teacher-day detail page; a cross-teacher review queue is a later feature.
- Existing authenticated user identity will be available when authentication is re-enabled before production use.

## Out of scope

- Messaging or requesting information from a teacher.
- A cross-teacher review queue, bulk actions, assignments, reminders, or notifications.
- Creating or changing automated flags, Schoolmate records, Zoom records, or payroll decisions.
- Deleting historical review records.

## Open questions

1. Which role may resolve a day once production authentication is re-enabled?
2. What constitutes a material evidence change for `Updated since review`?
3. Should a concurrent edit be rejected, merged, or offered for manual resolution?
4. What retention and editing policy applies to note content and review history?

## Definition of Ready checklist

- [x] Business objective and core workflow are clear
- [x] Statuses, resolution requirement, and audit history are defined
- [ ] Role permissions and production-authentication dependency are confirmed
- [ ] Material-change and concurrency policies are approved
- [ ] UX design for notes, history, and error states is approved
- [ ] Open questions are resolved or explicitly accepted

## Audit trail

| Date | Decision |
|---|---|
| 27 September 2026 | Created as the teacher-day bookmark, note, and review-workflow story. |
| 27 September 2026 | Kept cross-teacher queue and messaging outside this story to maintain a focused first workflow increment. |
