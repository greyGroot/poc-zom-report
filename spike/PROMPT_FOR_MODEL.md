# Master Prompt for GPT-6 Astra Medium: EdTech Fraud Detection & CRM-Zoom Telemetry Reconciliation

> **Instructions for the User**: Copy and paste the prompt below directly into **GPT-6 Astra Medium** (or your frontier LLM of choice) along with the files from this `spike/` folder (`zoom_raw_events.json`, `zoom_meetings_telemetry.json`, `schoolmate_crm_schedule.json`, and `PROBLEM_DESCRIPTION.md`).

---

```markdown
# MISSION BRIEFING: EdTech Payroll Fraud Analytics & Telemetry Reconciliation Engine

You are acting as a **Principal Anti-Fraud Systems Architect** and **Staff Product UX Designer** specializing in EdTech operations and video-telemetry reconciliation.

## 1. PROJECT CONTEXT & THE PROBLEM
We run an English language academy (**Empire English**). 
Teachers conduct lessons on **Zoom** and self-report their completed lessons, attendance, and cancellations in **Schoolmate CRM** (`https://empireenglish.schoolmate.eu`).

Teacher monthly payroll is directly calculated based on the statuses they record in Schoolmate CRM. However, without automated verification against ground-truth Zoom call logs, the school faces significant financial leakage from:
1. **Ghost lessons** (teachers claiming pay for lessons that never happened).
2. **Sockpuppet / Multi-device simulation** (teachers joining a Zoom call from a laptop and a smartphone on the same IP to fake a 2-person meeting).
3. **Falsified student attendance** (marking students as present when only the teacher sat in the room).
4. **Duration truncation** (conducting a 10-minute call instead of 60 minutes, but billing for a full hour).
5. **Abuse of No-Show cancellations** (claiming "Last-minute cancellation" to get 100% pay, but never actually waiting for the student).

We have built a working prototype of the CRM dashboard at:
👉 **Prototype URL**: `https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f`

Currently, this prototype has a **Split-View**:
- **Left Column**: Teacher-reported schedule and lesson statuses from Schoolmate CRM.
- **Right Column**: Currently a static placeholder ("Zoom Telemetry Reconciliation - Phase 2").

We have already extracted real production datasets into the following JSON files for you to analyze:
- `spike/zoom_raw_events.json`: 200 raw webhook events from Zoom (meeting.started, participant_joined, data_connection, participant_left, meeting.ended).
- `spike/zoom_meetings_telemetry.json`: Aggregated Zoom meetings with participant intervals, QoS, and calculated durations.
- `spike/schoolmate_crm_schedule.json`: Real teacher schedule for September 20–24, 2026 from Schoolmate CRM.
- `spike/PROBLEM_DESCRIPTION.md`: The complete technical and business problem specification.

---

## 2. BUSINESS RULES & PAYMENT MATRIX
Teacher compensation rates (`TeacherRate`) follow these strict business rules:

### Verbatim Business Rules (Original Ukrainian):
```text
"LessonStatusName": "Trial Success" - викладач поставив означає урок повністю проведений з людьми (були всі чи 1 не важливо). TeacherRate повністю зараховоються (100%)

"LessonStatusName": "Late Cancelation" - студент(и) відмінили заняття більше ніж за 6 год, але менше ніж за 24 год. Teacher Rate 50%

"LessonStatusName": "Last minute cancelation" - студент(и) відмінили заняття менше ніж за 6 год, або не з'явились загалом, коли викладач їх чекав. Teacher Rate 100%

"LessonStatusName": "Canceled in advance" - студент(и) відмінили заняття більше ніж за 24 год, або відмінив викладач не важливо за скільки. Teacher Rate 0%

"ClassDetailsAdded": true - відображати, компанії інколи теж просять репорт. Важливість в імплементації низька.

"AttendanceChecked": true - відображає чи викладач повідмічав студентів
```

### Detailed Logic & Rates:
1. **`"LessonStatusName": "Trial Success"`** *(or standard completed / `null` in the API)*:
   - Meaning: Teacher conducted the lesson in full with human student(s) present (all or at least 1 student attended).
   - **Teacher Pay Rate**: **100%**
2. **`"LessonStatusName": "Late Cancelation"`**:
   - Meaning: Student(s) cancelled between 6 hours and 24 hours prior to the lesson.
   - **Teacher Pay Rate**: **50%**
3. **`"LessonStatusName": "Last minute cancelation"`** *(or `Last-minute cancellation`)*:
   - Meaning: Student(s) cancelled less than 6 hours before the lesson, OR failed to show up at all (**No-Show**) while the teacher joined Zoom and waited.
   - **Teacher Pay Rate**: **100%**
4. **`"LessonStatusName": "Canceled in advance"`** *(or `Cancelled in Advance`)*:
   - Meaning: Student(s) cancelled more than 24 hours in advance, OR the teacher cancelled (regardless of when).
   - **Teacher Pay Rate**: **0%**
5. **`"AttendanceChecked": true / false`**:
   - Indicates whether the teacher explicitly marked the attendance checkbox for students.
6. **`"ClassDetailsAdded": true / false`**:
   - Indicates whether class notes were recorded (informational, low priority for fraud).

---

## 3. TECHNICAL CONSTRAINTS
When designing your solution, you must respect these real-world constraints:
1. **Guest Mode for Students**: Students do NOT have corporate Zoom accounts. They join as anonymous guests via browser or Zoom client. Their emails are usually blank, and names may be informal (e.g. "iPhone", "Alex", "Guest"). **You cannot match students by email.**
2. **Personal Meeting IDs (PMI)**: Teachers often host multiple back-to-back classes in their permanent personal meeting room. A single 120-minute Zoom meeting may span two separate 60-minute CRM lessons.
3. **Multi-device Legitimacy vs Fraud**: A legitimate user might join with PC for video and mobile phone for audio. However, if a meeting only has two participants (Host + 1 Guest) and **both share the exact same public IP address**, this is a critical fraud signal of self-joining.
4. **Network Reconnects**: Brief WiFi disconnects may produce multiple session segments for a single participant. Durations must be computed via interval unions.

---

## 4. REQUIRED DELIVERABLES

Please provide an exhaustive, production-ready engineering and UX proposal covering the following four areas:

### DELIVERABLE 1: Anti-Fraud Metrics & Heuristics Matrix
Define mathematical formulas, threshold values, and decision logic for detecting anomalies:
1. **`IP_Collision_Detector`**: How to distinguish a teacher connecting a 2nd device to simulate a student vs. legitimate multi-device usage.
2. **`Duration_Fidelity_Ratio`**: Metric comparing claimed CRM duration against actual Zoom elapsed duration with student presence. What delta triggers an alert?
3. **`Phantom_Attendance_Index`**: Flagging when `AttendanceChecked: true` or `Trial Success` is set, but Zoom shows 0 non-host participants.
4. **`NoShow_Grace_Period_Validator`**: For `Last minute cancelation` (100% pay), how to verify that the teacher genuinely joined and waited at least 15 minutes before leaving.
5. **Composite `Fraud_Risk_Score` (0–100)**: A clear scoring algorithm that categorizes lessons into:
   - 🟢 `CLEAN / VERIFIED` (0–15)
   - 🟡 `WARNING / DISCREPANCY` (16–50)
   - 🔴 `CRITICAL FRAUD ALERT` (51–100)

### DELIVERABLE 2: Reconciliation & Matching Algorithm
Provide pseudo-code or TypeScript algorithmic logic that reconciles a teacher's daily Schoolmate schedule with their daily Zoom meetings:
- Input: `schoolmate_lessons[]` and `zoom_meetings[]` for a given date.
- Matching criteria: Host identity (`host_email` / `zoomHostEmail`), scheduled time window tolerance (e.g. $\pm 15$ min start buffer), duration fit, and participant presence.
- Edge case handling: How to split a single 2-hour Zoom meeting across two consecutive 1-hour CRM classes.

### DELIVERABLE 3: UX/UI Specification for Teacher Profile Page
Design the user experience for the right column of the split-view on `https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f`:
1. **Card-for-Card Alignment**: How each CRM lesson on the left corresponds visually to a Zoom Reconciliation Card on the right.
2. **Visual Hierarchy & Badge Design**:
   - Status badges: `VERIFIED ✅`, `GHOST LESSON 🚨`, `SAME-IP SOCKPUPPET 🚨`, `DURATION SHORTFALL ⚠️`, `VALIDATED NO-SHOW ℹ️`, `UNSCHEDULED MEETING 🔍`.
   - Side-by-side comparison chips (e.g., Claimed: 60m vs Zoom: 12m).
3. **Interactive Audit Tools for Admins**:
   - One-click admin actions (e.g. "Override Pay Rate to 0%", "Mark Under Investigation", "Approve Discrepancy").
   - Expandable "Forensic Evidence Drawer" showing participant timestamps, device channels, and IP addresses.
4. **Component Mockup**: Provide a complete, clean React/Tailwind/CSS mockup of a reconciled lesson card showing both a clean lesson and a flagged fraud attempt.

### DELIVERABLE 4: Data Contract / API Schema
Define the exact JSON payload schema that `/api/reconciliation/[teacherId]?from=YYYY-MM-DD&to=YYYY-MM-DD` should return to cleanly drive this frontend interface.

---
Begin your analysis by examining the provided sample data, and present your findings with rigor, clarity, and actionable production-grade code.
```
