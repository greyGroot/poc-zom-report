# Architecture Plan: CRM-017 — Expand/Collapse All Includes Zoom Meetings

## Overview
This document outlines the technical design for updating the global expand/collapse toggle to synchronously control both Schoolmate lessons and Zoom meeting cards on the Teacher Schedule and Teacher Day Details views.

## 1. State Management & Component Interface Definition
- **Controlled Component Pattern for Zoom Meetings:**
  `ZoomMeetingCard` currently manages its own internal `participantsOpen` state. It will be refactored to accept `isExpanded` (boolean) and `onToggle` (function) props. When these props are provided, it operates as a controlled component; otherwise, it falls back to its internal `useState` (to preserve standalone usage).
- **Global Toggle State (`TeacherScheduleClient` & `TeacherDayDetailsClient`):**
  - Both parent views will introduce a new state to track expanded Zoom meetings (e.g., `const [expandedZoomMeetings, setExpandedZoomMeetings] = useState(new Set());`), complementing the existing `expandedLessons` state.
  - The "Expand All" / "Collapse All" button logic (`toggleAll`) will compute the total number of present lessons and Zoom meetings. If `expandedLessons.size + expandedZoomMeetings.size === totalLessons + totalZoomMeetings` and the total is > 0, the button label displays "Collapse All". Otherwise, it displays "Expand All".
  - Triggering `toggleAll` will populate both Sets with all IDs present on the page (expand all) or clear both Sets (collapse all).

## 2. Component Updates

### `app/teachers/[id]/ZoomMeetingCard.js`
- Accept `isExpanded` and `onToggle` props.
- Modify `participantsOpen` to read from `isExpanded ?? localParticipantsOpen`.
- Modify the click handler for the toggle to invoke `onToggle()` if defined, otherwise `setLocalParticipantsOpen(prev => !prev)`.

### `app/teachers/[id]/TeacherScheduleClient.js`
- Add `expandedZoomMeetings` state.
- Rename `toggleAllLessons` to `toggleAll` and update its logic to compute `totalItems` (lessons + Zoom meetings).
- Update the toggle button label logic: `(expandedLessons.size === totalLessons && expandedZoomMeetings.size === totalZoomMeetings && totalItems > 0) ? 'Collapse All' : 'Expand All'`.
- Pass `isExpanded={expandedZoomMeetings.has(occ.id)}` and `onToggle={() => toggleZoomMeeting(occ.id)}` to the `<ZoomMeetingCard>` components in the render tree.

### `app/teachers/[id]/[date]/TeacherDayDetailsClient.js`
- Add an "Expand All" / "Collapse All" button to the page controls (currently missing from this view), aligning styling with `TeacherScheduleClient`.
- Implement `expandedZoomMeetings` state and `toggleAll` logic exactly as in the Schedule Client.
- Pass `isExpanded` and `onToggle` props down to the `<ZoomMeetingCard>` components.

## Implementation Verification Checks

1. **Verify Teacher Day Details - Schoolmate Lessons Expansion:** Assert that clicking "Expand All" on the Teacher Day Details page (`/teachers/[id]/[date]`) expands all Schoolmate lesson cards and reveals their details/rosters. (Maps to To-Do #1)
2. **Verify Teacher Day Details - Zoom Meetings Expansion:** Assert that clicking "Expand All" on the Teacher Day Details page expands all Zoom meeting cards and reveals meeting details and participant lists. (Maps to To-Do #2)
3. **Verify Teacher Day Details - Global Collapse:** Assert that clicking "Collapse All" on the Teacher Day Details page collapses all Schoolmate lesson cards and all Zoom meeting cards. (Maps to To-Do #3)
4. **Verify Teacher Schedule - Global Expand:** Assert that clicking "Expand All" on the Teacher Schedule view (`/teachers/[id]`) expands all Schoolmate lessons and all Zoom meetings across the displayed date range. (Maps to To-Do #4)
5. **Verify Teacher Schedule - Global Collapse:** Assert that clicking "Collapse All" on the Teacher Schedule view collapses all Schoolmate lessons and all Zoom meetings across the displayed date range. (Maps to To-Do #5)
6. **Verify Empty States (Zoom Only):** Assert that on a page with only Zoom meetings (0 Schoolmate lessons), "Expand All" and "Collapse All" correctly toggle all Zoom meeting cards without error. (Maps to To-Do #6)

## ⚠️ User Action Required
- N/A. Operates entirely on the client-side UI state. No database migrations, scripts, or deployment interventions are required.
