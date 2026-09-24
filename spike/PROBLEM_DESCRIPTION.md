# Comprehensive Problem Specification: CRM Schedule vs. Zoom Telemetry Reconciliation & Fraud Detection

## 1. Executive Summary & Context

**Empire English** is a corporate and individual language school. 
* **Business Operations**: Teachers track schedules, conducted classes, student attendance, and cancellation reasons in **Schoolmate CRM** (`https://empireenglish.schoolmate.eu`).
* **Lesson Delivery**: All online classes take place on **Zoom**, monitored via real-time webhooks processed by our telemetry microservice (`https://poc-zom-report.vercel.app`).
* **The Problem**: Teacher payroll is directly tied to the lesson statuses entered in the CRM. Without automated verification against ground-truth Zoom call metadata, the school is vulnerable to payroll fraud, inaccurate attendance billing, and disputed lesson completions.
* **The Goal**: Provide school administrators with an intuitive **Reconciliation Split-View** on the teacher dashboard (`https://poc-zom-report-2qvs.vercel.app/teachers/[id]`):
  * **Left Side**: Teacher-reported schedule, claimed lesson status, and compensation rate from Schoolmate CRM.
  * **Right Side**: Ground-truth Zoom meeting telemetry, verified attendance, and anomaly flags for that exact timeframe.

---

## 2. Business Rules & Pay Rate Matrix

Teacher payroll rates (`TeacherRate`) depend on the status recorded in Schoolmate CRM:

### Verbatim Business Rules (Original Ukrainian):
```text
"LessonStatusName": "Trial Success" - викладач поставив означає урок повністю проведений з людьми (були всі чи 1 не важливо). TeacherRate повністю зараховоються (100%)

"LessonStatusName": "Late Cancelation" - студент(и) відмінили заняття більше ніж за 6 год, але менше ніж за 24 год. Teacher Rate 50%

"LessonStatusName": "Last minute cancelation" - студент(и) відмінили заняття менше ніж за 6 год, або не з'явились загалом, коли викладач їх чекав. Teacher Rate 100%

"LessonStatusName": "Canceled in advance" - студент(и) відмінили заняття більше ніж за 24 год, або відмінив викладач не важливо за скільки. Teacher Rate 0%

"ClassDetailsAdded": true - відображати, компанії інколи теж просять репорт. Важливість в імплементації низька.

"AttendanceChecked": true - відображає чи викладач повідмічав студентів
```

### Pay Rate & Billing Impact Matrix:

| CRM Status (`LessonStatusName`) | Meaning & Conditions | Teacher Pay Rate | Billing Impact |
| :--- | :--- | :---: | :---: |
| **`Trial Success`** *(or standard completed / `null` in API)* | Lesson was conducted in full with human student(s) present (whether all or 1 student attended). | **100%** | Student/Company charged 100% |
| **`Late Cancelation`** | Student(s) cancelled between **6 hours and 24 hours** prior to lesson start. | **50%** | Student/Company charged 50% |
| **`Last minute cancelation`** *(or `Last-minute cancellation`)* | Student(s) cancelled **less than 6 hours** before the lesson, OR failed to attend at all (**No-Show**) while the teacher joined and waited. | **100%** | Student/Company charged 100% |
| **`Canceled in advance`** *(or `Cancelled in Advance`)* | Student(s) cancelled **more than 24 hours** before lesson, OR the teacher cancelled (regardless of time). | **0%** | No charge |

### Additional CRM Markers:
* **`AttendanceChecked: true/false`**:
  * Indicates whether the teacher opened the attendance register and marked individual students as present or absent.
  * *Discrepancy Trigger*: If `AttendanceChecked: true`, but Zoom shows zero students joined, this indicates deliberate falsification.
* **`ClassDetailsAdded: true/false`**:
  * Indicates whether the teacher entered lesson notes/topics covered (requested by some corporate clients).
  * *Weight*: Informational (low priority for fraud detection, but useful for audit).

---

## 3. Fraud Vectors & Threat Model

The automated fraud detection system must catch the following anomalies:

### 1. Ghost Lessons (Phantom Classes)
* **What happens**: The teacher marks a 60-minute lesson as completed (`Trial Success` or standard completed) to claim 100% pay.
* **Zoom Reality**: No Zoom meeting was started by the teacher's host account on that day, or during that time window ($\pm 60$ minutes).
* **Severity**: 🚨 **CRITICAL FRAUD** (100% unearned payout).

### 2. Sockpuppet / Fake Student Simulation (Multi-Device Self-Joining)
* **What happens**: The teacher knows that 2 participants are required for a "Verified" lesson. The teacher starts the meeting from their laptop and secretly connects a second device (smartphone or tablet) as a guest "student".
* **Zoom Reality**:
  * Participant count = 2.
  * **Both participants share the exact same public IP address (`ip_address`).**
  * Zoom data connections / device fingerprints indicate host and guest are on the same local network.
* **Severity**: 🚨 **CRITICAL FRAUD** (Deliberate simulation of student attendance).

### 3. Falsified No-Show Claims (`Last minute cancelation` Abuse)
* **What happens**: A student cancelled hours earlier or teacher didn't feel like teaching. The teacher marks `Last minute cancelation` (which pays 100%), claiming they sat in the meeting room waiting for the student who never arrived.
* **Zoom Reality**:
  * The teacher either never opened Zoom at all; OR
  * The teacher joined for **less than 2–3 minutes** (just to generate a log entry) instead of waiting the required grace period (typically 15 minutes).
* **Severity**: ⚠️ **SUSPICIOUS FRAUD** (Unearned No-Show compensation).

### 4. Duration Inflation (Short Calls)
* **What happens**: A 60-minute or 90-minute lesson is scheduled. The teacher wraps up in 10–15 minutes, but marks the lesson as fully completed in the CRM.
* **Zoom Reality**: Zoom telemetry records meeting duration as 12 minutes.
* **Severity**: ⚠️ **UNDER-DELIVERY** (Hours claimed > hours taught).

### 5. Fake Student Presence with False Attendance Check
* **What happens**: Teacher marks `AttendanceChecked: true`, recording 3 students as present in CRM.
* **Zoom Reality**: Zoom telemetry shows `participants_count = 1` (only the teacher was present throughout the call).
* **Severity**: 🚨 **FALSIFIED ATTENDANCE RECORD**.

### 6. Time-Shifted / Unscheduled Calls
* **What happens**: Lesson is scheduled for 10:00 AM. Zoom meeting starts at 21:30 PM.
* **Challenge**: May be a legitimate rescheduled class mutually agreed upon, or an accidental mismatch that requires admin attention.

---

## 4. Technical Constraints & Data Realities

When reconciling Schoolmate CRM data with Zoom Webhook telemetry, the algorithm must account for:

1. **Guest Mode for Students**:
   * Students in Empire English **do not have licensed Zoom corporate accounts**.
   * They join via personal meeting links as guests.
   * Student emails in Zoom webhooks are almost always **blank or null**.
   * Names entered by guests may vary: `"Oleksandr"`, `"Alex"`, `"iPhone (2)"`, `"Guest"`.
   * **Rule**: Matching cannot rely on student email. It must rely on:
     * Teacher host identity (`host_email` / `zoomHostEmail` / `16778240`).
     * Date and time window overlap.
     * Participant count (Teacher + $N$ non-host participants).
     * IP addresses to distinguish genuine distinct users from self-joining devices.

2. **Personal Meeting ID (PMI) vs Unique Meetings**:
   * Many teachers use their static Personal Meeting Room (e.g. `https://zoom.us/j/5445746456`) for all their daily classes.
   * If Teacher A has Lesson 1 (10:00–11:00) and Lesson 2 (11:00–12:00), they might **never end the Zoom meeting**. A single continuous 120-minute Zoom call might encompass two distinct CRM lessons.
   * The reconciliation engine must support splitting continuous Zoom meetings across sequential CRM slots.

3. **Multi-Device Legitimate Connections**:
   * A single user may connect from laptop (screen/video) and phone (audio) simultaneously.
   * Our telemetry engine merges these using **interval union** so duration is not double-counted, but fraud detection must check whether the *second participant* is actually the teacher on a second device.

4. **Network Drops & Reconnects**:
   * A 60-minute lesson in Ukraine might experience power/internet blips, resulting in 3 separate participant sessions of 18 min, 22 min, and 15 min.
   * The engine must evaluate aggregate cumulative time across the scheduled window.

---

## 5. UI/UX Objectives for the Prototype

The live prototype at `https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f` contains:
* **Header**: Teacher name, Schoolmate ID, date range picker (`From` / `To`), and `⚡ Отримати дані з Schoolmate` action button.
* **Left Column (`schedule-column`)**: Daily timeline cards parsed directly from Schoolmate EU JSON API, with badges for duration, rate, ribbon bookmarks for `AttendanceChecked` & `ClassDetailsAdded`, and status chips.
* **Right Column (`telemetry-column`)**: Currently a static "Phase 2 Placeholder".

### Desired UX State:
* For each day and for each lesson on the left, the right column should render a corresponding **Reconciliation Assessment Card**:
  * **Card Alignment**: Visual 1:1 row or day matching against the CRM lessons.
  * **Status Badges**:
    * 🟢 `VERIFIED` — Duration matches ($\ge 80\%$), teacher + genuine student(s) present, distinct IPs.
    * 🔴 `FRAUD DETECTED` / `DISCREPANCY` — Ghost lesson (no call), same-IP sockpuppet, or 0 students with completed claim.
    * 🟡 `DURATION SHORTFALL` — Meeting happened but lasted significantly less than claimed (e.g., 20m vs 60m).
    * 🔵 `VALIDATED NO-SHOW` — `Last minute cancelation` confirmed with verified teacher waiting period ($\ge 15\text{m}$).
    * ⚪ `CANCELLED IN ADVANCE` — Lesson properly cancelled, 0 min Zoom expected.
  * **Admin Audit Actions**:
    * Quick button: `Override Pay Rate to 0%`
    * Quick button: `Request Teacher Explanation`
    * Expandable "Zoom Evidence" drawer showing participants, join/leave times, and IP addresses.
