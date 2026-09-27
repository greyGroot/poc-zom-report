# CRM-012 — Display Zoom organization membership date

**Story ID:** CRM-012  
**Status:** Draft — Zoom source-field semantics require confirmation  
**Primary user:** School administrator  
**Related PRD:** [Schedule and Zoom Evidence Review](../PRD.md)

## Summary

Show the date on which a teacher accepted the Zoom organization invitation and became an active organization member. Display it in the teachers directory, the teacher page and the teacher-day page.

The date must come from an authoritative Zoom source field representing organization membership activation. It must never be inferred from an invitation send date, first meeting, Schoolmate record or EE-CRM refresh time.

## Business objective

Give administrators immediate context about whether and when a teacher joined the school’s Zoom organization, helping them understand the availability of organization-managed Zoom evidence.

## User story

As a school administrator,  
I want to see when a teacher became an active member of our Zoom organization,  
so that I can understand the teacher’s Zoom membership context while reviewing their activity.

## Current-state findings

- EE-CRM currently shows Zoom status as `member`, `pending` or `not_invited`.
- The Zoom integration retrieves active and pending users by email but currently returns status only.
- Teacher matching uses the configured Zoom host email, falling back to the teacher email.

## Functional requirements

1. Retrieve an authoritative Zoom organization-membership activation timestamp for active members.
2. Document the exact Zoom source field, endpoint and semantics used for that timestamp.
3. Display `Zoom member since: {localized date}` in the teachers directory for an active member.
4. Display the same membership date in the teacher page header.
5. Display the same membership date in the teacher-day page header or teacher context area.
6. Use the configured Zoom host email when it differs from the teacher email.
7. Show the date only when the teacher is an active Zoom organization member and the source date is available.
8. Retain the existing `pending` and `not_invited` states; do not show a membership date for either state.
9. When the membership date is unavailable for an active member, show neutral unavailable copy rather than a fabricated date.
10. Format the date using existing EE-CRM locale and timezone conventions.
11. Refresh the membership date together with the existing Zoom user-status lookup and expose its freshness where source data is stale or unavailable.
12. Do not alter invitations, Zoom membership, teacher records or historical meeting evidence.

## Acceptance criteria

### Scenario 1: Active member with an available date
Given a teacher’s configured Zoom host email maps to an active Zoom organization member  
And Zoom provides the authoritative membership activation timestamp  
When an administrator opens the directory, teacher page or teacher-day page  
Then each page displays the same localized `Zoom member since` date.

### Scenario 2: Pending invitation
Given a teacher’s Zoom organization invitation is pending  
When an administrator opens any of the three pages  
Then the pending status remains visible  
And no membership date is displayed.

### Scenario 3: Not invited teacher
Given no Zoom organization user matches the teacher’s mapped Zoom host email  
When an administrator opens any of the three pages  
Then the not-invited status remains visible  
And no membership date is displayed.

### Scenario 4: Different mapped Zoom email
Given the teacher email differs from the configured Zoom host email  
And the configured Zoom host email is an active member with a membership date  
When the membership information loads  
Then EE-CRM displays the date associated with the configured Zoom host email.

### Scenario 5: Active member without a source date
Given a teacher is an active Zoom organization member  
And the authoritative source does not provide a membership activation date  
When the membership information loads  
Then EE-CRM displays the active-member status  
And shows a neutral unavailable date state  
And does not substitute invitation, meeting, Schoolmate or refresh data.

### Scenario 6: Zoom source failure
Given the Zoom membership lookup fails or returns stale data  
When an administrator opens a relevant page  
Then the page does not present a newly fabricated membership date  
And existing last-known information, if displayed, is identified as stale.

### Scenario 7: Membership changes from pending to active
Given a teacher was previously pending  
And Zoom now reports the teacher as active with a membership activation date  
When EE-CRM refreshes the Zoom user information  
Then the status changes to active member  
And the membership date becomes visible on all three pages.

## Business rules

- “Zoom member since” means the date the teacher became an active member of the school’s Zoom organization.
- The displayed date is not a first meeting date, a Zoom account creation date or an invitation-send date unless Zoom documents that the chosen field specifically represents membership activation.
- Zoom host email is the teacher-to-Zoom association key unless a later approved mapping replaces it.
- One current membership date is shown; this story does not reconstruct invitation or membership history.
- Missing source data is distinct from an unknown or pending membership state.

## Permissions and roles

- The feature introduces no new role or permission.
- Users who can view existing teacher Zoom status can view the membership date.
- The membership date must not expose Zoom credentials, invitation tokens or unrelated Zoom user details.

## Data requirements

- Teacher ID, teacher email and configured Zoom host email.
- Zoom user ID, normalized email and membership status.
- Source membership-activation timestamp, source field name and data freshness timestamp.
- Explicit state for available, unavailable and stale membership-date data.

## Edge cases and error handling

- Teacher email and Zoom host email differ.
- Multiple Zoom users match ambiguously or no user matches.
- Zoom returns an active member without the approved date field.
- Zoom is unavailable, rate-limited or returns stale cached data.
- The source timestamp has no timezone or cannot be parsed.
- A teacher accepts, leaves or is re-invited to the organization.

## Dependencies

- Existing Zoom OAuth credentials and user-status API access.
- Zoom API documentation or integration-owner confirmation of the authoritative date field.
- Existing teachers directory, teacher page and teacher-day page.
- UX copy and placement for available, unavailable and stale states.

## Recommended subtasks

1. Integration: confirm the Zoom field and extend the status lookup to return membership metadata.
2. Backend: expose normalized membership status, date and freshness through teacher APIs.
3. Frontend: render consistent membership context on all three pages.
4. QA: active, pending, not-invited, mapped-email, unavailable-date and stale-source scenarios.
5. Delivery: commit and push completed work to `main`; verify production deployment.

## Assumptions

- Zoom provides, or the integration owner can identify, an authoritative membership-activation timestamp.
- Existing status visibility is approved for all three pages.
- This feature shows current membership context and not a full organization-membership audit history.

## Out of scope

- Sending, accepting, revoking or managing Zoom invitations.
- Changing teacher Zoom host-email mappings.
- Displaying Zoom account creation, first meeting or invitation-send dates as a substitute.
- Reconstructing historical membership periods or changing meeting/reconciliation behavior.

## Open questions

1. Which Zoom API field is the authoritative organization-membership activation date, and does it differ from Zoom account creation date?
2. If a teacher leaves and later rejoins, should EE-CRM show the latest active-membership date or retain membership history?
3. What exact unavailable and stale-state copy should UX use?

## Definition of Ready checklist

- [x] Business objective, user and display locations are clear
- [x] Successful, pending, unavailable and failure scenarios are documented
- [x] Data, permissions, edge cases and exclusions are documented
- [ ] Zoom date-field semantics are confirmed
- [ ] UX copy and placement are approved
- [ ] Open questions are resolved or accepted

## Audit trail

| Date | Decision |
|---|---|
| 27 September 2026 | Created CRM-012 to display the authoritative date a teacher became an active Zoom organization member. |
| 27 September 2026 | Reserved CRM-010 and CRM-011 for the previously agreed attention-flags and teacher-day review-workflow stories. |
