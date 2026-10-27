# Teacher Zoom Calendar — prototype report

Date: 2026-10-27
Disposition: retain this report only; discard the exploratory implementation and supporting artifacts.

## Outcome

The experiment demonstrated that the CRM can create Zoom meetings for a mapped, active organization member, show the participant join link, independently verify the created meeting, and delete it through the Calendar interface. Both a one-time scheduled meeting and a reusable permanent room completed this live lifecycle.

This establishes feasibility for the tested account and flow. It does not establish production readiness, unrestricted scheduling for every organization member, or an exemption from Basic-plan meeting-duration limits. The live exercise verified a configured duration of 60 minutes; it did not run an attended meeting for 60 minutes.

## What we explored

The proposed feature is a dedicated Calendar on a teacher's page, separate from Schoolmate lessons and conducted Zoom attendance. Three interactive HTML alternatives were explored; the user selected variant A, a weekly calendar with a scheduling dialog.

The initial implementation supported simulation and live execution. Later instructions narrowed it to live-only operation in the existing application, with one-time meetings, permanent rooms, participant links, and deletion. The UI used 60-minute meetings, Kyiv time, scheduling from 08:00 through 22:00, compact empty rows, and a separate permanent-room section. These are prototype choices, not permanent product requirements.

The final live exercise also covered a CRM teacher without a Schoolmate ID. This showed that Zoom scheduling can operate independently of Schoolmate identity when the teacher's Zoom mapping and membership are valid.

## Findings and evidence

| Question | Result | Evidence and limits |
| --- | --- | --- |
| Can the existing integration manage meetings? | Yes for the tested account. | The existing Server-to-Server OAuth integration supported live listing, creation, independent readback, and deletion. Resolve the teacher to an immutable Zoom user ID. |
| Does one-time scheduling preserve the requested time? | Yes after correcting the provider timezone identifier. | A browser-created meeting requested for **2026-11-01 at 22:00 Kyiv** read back as **2026-11-01T20:00:00Z**, duration 60 minutes. Host identity, meeting type, participant link, and effective security settings were independently checked. |
| Can we create a reusable permanent room? | Yes in the live exercise. | A type-3 room was created through the UI, independently read back, and deleted. It has no fixed calendar date or time. |
| Did cleanup work? | Yes for both final test meetings. | UI deletion was followed by independent Zoom GET responses of 404. A delayed inventory recheck retained all pre-existing distinct meeting IDs and found no additional test meeting. |
| Is the interaction usable? | Demonstrated in prototype checks. | Teacher-page navigation, scheduling, cancellation, multiple meetings, permanent-room separation, error feedback, keyboard focus, and narrow-screen behavior were exercised. This is bounded verification, not a full accessibility audit. |
| Do Basic hosts have unlimited meeting time? | Not established. | Early research asserted a Ukraine exemption, but the retained evidence does not substantiate a current account-wide exemption. Meeting creation and a 60-minute duration field do not prove actual session length. |

The final live verification was recorded on 2026-10-27 at 14:36 UTC. It supersedes the earlier simulation-only findings that reported live testing as blocked. The final evidence does not separately record the test host's license tier, so it should not be presented as a complete license-specific acceptance test for all Basic members.

## The timezone failure and its lesson

An earlier real creation used local wall-clock time with `Europe/Kyiv` in the Zoom payload. Readback showed `America/Los_Angeles` and a different instant: a request for November 1 at 22:00 Kyiv appeared as November 2 at 06:00 UTC, or 08:00 Kyiv. This was consistent with fallback to the host timezone.

Initially, the implementation only accepted `Europe/Kiev` as an alias during readback. That fixed a spelling comparison but did not fix the outbound request. The complete correction used Zoom's documented `Europe/Kiev` identifier at the API boundary, while retaining `Europe/Kyiv` for application calculations and display. A regression modeled the observed fallback, and the subsequent live round trip verified the intended UTC instant.

The durable lesson is to verify the **actual scheduled instant**, not just a successful create response or a recognized timezone label. Preserve strict checks for host, meeting type, duration, participant link, and effective security settings as well. See [Zoom's timezone reference](https://developers.zoom.us/docs/api/references/abbreviations/#timezones).

The final cleanup result applies to the two dedicated final test meetings. Earlier wrongly scheduled meetings were deliberately left unchanged under the user's instructions; their current disposition is not established by this report.

## Review and workflow lessons

The original simulation prototype completed two implementation–review rounds. The first independent review found three concrete problems: accepted off-hour or overlapping meetings missing from the grid, scheduling errors hidden behind the modal, and keyboard focus escaping the modal without proper restoration. The second review independently verified the fixes and passed the simulation flow. That pass preceded the later integration changes and does not certify the final live-only implementation in full.

- A selectable HTML reference made the visual direction concrete, but acceptance criteria still needed explicit behavior for duplicate slots, weekends, errors, and keyboard interaction.
- Independent review of the running UI found issues that screenshots and author checks missed. Compare observed behavior with the agreed reference rather than relying on an implementation summary.
- Live readback changed the feasibility verdict. Keep simulation success, mocked regression success, and live-provider success separate in reports.
- Provider boundaries need their own normalization. An application-valid timezone identifier is not necessarily accepted by the provider.
- Creation and verification are separate operations. A failed readback can occur after Zoom has already created the meeting; preserve its ID and inspect before retrying.
- Upcoming inventory can lag deletion and contain repeated meeting IDs. Use direct meeting readback for verification and distinct IDs for inventory comparisons.
- Configuration sources conflicted during setup. Establish explicit environment precedence and keep credentials server-side and out of evidence.
- Scope evolved from a throwaway simulation into live integration and unrelated test maintenance. A future experiment should keep those deliverables separate and state its stopping condition before implementation.

## Validation and remaining gaps

Calendar-specific domain and mocked API checks covered date/DST behavior, participant-link filtering, membership/session gates, host-owned deletion, malformed inputs, pagination, and effective readback. The production build passed. Browser checks covered desktop and narrow layouts, modal keyboard behavior, and the live one-time/permanent-room lifecycle.

The broader test run was **not all green**. Its recorded inventory was 18 individual scripts passing, 9 failing, and 2 not run, excluding the aggregate runner from the count. Some subsequent local test repairs passed, but six historical verification gaps remained tracked in [issue #3](https://github.com/greyGroot/poc-zom-report/issues/3). Those test repairs are outside this retained deliverable and are discarded with the implementation; their reported passes do not describe the retained codebase.

Before any production build of this feature:

1. Verify the intended Basic host's current license, actual attended-session duration, account security policy, and participant/host joining behavior. The live exercise checked returned security fields, not participant entry into a running meeting.
2. Define role-based scheduling/deletion authorization, audit events, and deployment authentication. Local development bypasses are not a rollout policy.
3. Handle uncertain create outcomes with durable idempotency or reconciliation, including creation followed by failed verification.
4. Confirm complete provider behavior for recurring occurrences and permanent-room inventory, alongside pagination and deduplication.
5. Specify timezone/DST policy and future multi-country support; keep provider-specific identifiers at the integration boundary.
6. Keep scheduled meetings separate from conducted occurrence telemetry. Scheduling a meeting must not fabricate attendance evidence.

The relevant official API entry point is [Zoom Meetings API](https://developers.zoom.us/docs/api/meetings/). Standard Basic limits are described in [Zoom's meeting time-limit guidance](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067966); recheck account-specific policy when implementing.

## Retention decision

Only this self-contained report is retained for merge. The calendar implementation, prototype-specific tests, HTML alternatives, screenshots, research draft, glossary/ADR additions, temporary handoffs and helper scripts, and exploratory test repairs are discarded. Existing application configuration and unrelated repository work are preserved. No production Calendar feature is delivered by this change, and no new Zoom mutation is needed for this cleanup.

Evidence provenance: this report consolidates the selected-variant README, two independent simulation reviews, integration verification, timezone diagnosis, final live-verification record, full-test-run record, and later test-maintenance notes inspected before cleanup. Those exploratory artifacts are intentionally not required to read or use this report.
