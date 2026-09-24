# Spike: EdTech Fraud Detection & Zoom-CRM Reconciliation

This directory contains all research materials, live production datasets, business logic rules, and instructions prepared for **GPT-6 Astra Medium** to investigate and propose a solution for teacher payroll verification.

---

## 📁 File Manifest

| File | Description |
| :--- | :--- |
| **[`PROMPT_FOR_MODEL.md`](./PROMPT_FOR_MODEL.md)** | **Master prompt for GPT-6 Astra Medium.** Contains the mission briefing, business constraints, and 4 concrete deliverables. |
| **[`PROBLEM_DESCRIPTION.md`](./PROBLEM_DESCRIPTION.md)** | Detailed specification of the problem, fraud vectors (ghost lessons, sockpuppet same-IP devices, duration cuts, fake attendance), and UX requirements. |
| **[`zoom_raw_events.json`](./zoom_raw_events.json)** | Complete dump of **200 raw Zoom webhook events** collected from production (`meeting.started`, `participant_joined`, `participant_left`, `meeting.ended`, data connections, IPs). |
| **[`zoom_meetings_telemetry.json`](./zoom_meetings_telemetry.json)** | Aggregated Zoom meeting records from live telemetry with calculated durations, participant intervals, and QoS. |
| **[`schoolmate_crm_schedule.json`](./schoolmate_crm_schedule.json)** | Real teacher schedule for **September 20–24, 2026** directly from Schoolmate CRM, demonstrating all 4 cancellation/completion statuses and pay rates. |

---

## 🚀 How to Use

1. Open **[`PROMPT_FOR_MODEL.md`](./PROMPT_FOR_MODEL.md)** and copy the markdown block.
2. Provide the prompt to **GPT-6 Astra Medium** along with:
   - `PROBLEM_DESCRIPTION.md`
   - `zoom_raw_events.json`
   - `zoom_meetings_telemetry.json`
   - `schoolmate_crm_schedule.json`
3. The model will produce:
   - **Anti-Fraud Heuristic Engine**: Mathematical metrics (IP collision, duration fidelity ratio, phantom attendance index, composite fraud risk score).
   - **Reconciliation Algorithm**: Logic to match Schoolmate schedule slots to Zoom calls (including PMI rooms & multi-device sessions).
   - **UX/UI Blueprint**: Design and React components for the right column on `https://poc-zom-report-2qvs.vercel.app/teachers/t_0fa2ff7f`.
   - **API Schema**: Data contract for the reconciliation endpoint.
