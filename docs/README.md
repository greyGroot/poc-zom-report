# Empire English CRM (EE-CRM) Documentation

Welcome to the centralized documentation repository for **Empire English CRM (EE-CRM)**. This directory establishes the single source of truth for product requirements, architecture, user stories, quality assurance, UX design, and original product requirements.

---

## Documentation Structure

| Directory | Description | Primary Artifacts |
|---|---|---|
| [**`prd/`**](prd/) | Product Requirements & Roadmap | [`PRD.md`](prd/PRD.md), [`POST_MVP.md`](prd/POST_MVP.md), [`project-status.md`](prd/project-status.md) |
| [**`architecture/`**](architecture/) | System Architecture & Decisions | [`ADR-001`](architecture/ADR-001-target-architecture-and-module-boundaries.md), Feature Architecture Plans (`CRM-001` - `CRM-017`) |
| [**`stories/`**](stories/) | User Stories & Backlog | Active stories (`CRM-009`, `CRM-010`, `CRM-011`, `CRM-013`, `CRM-014`, `CRM-018`, `CRM-019`), [`archived/`](stories/archived/) |
| [**`ux/`**](ux/) | User Experience Specifications | Feature UX specs (`CRM-001`, `CRM-004`, `CRM-012`, `CRM-013`, schedule evidence review) |
| [**`qa/`**](qa/) | Verification Reports & Quality Gates | [`CRM-001-e2e-report.md`](qa/CRM-001-e2e-report.md) |
| [**`bugs/`**](bugs/) | Bug Documentation & Remediations | [`BUG-001`](bugs/BUG-001-stale-imports-in-verification-e2e-test-suites.md) |
| [`product/`](product/) | Original product requirements | [`original-request.md`](product/original-request.md) |

---

## Active Target Application

The core application codebase resides in [`ee-crm/`](../ee-crm/):
- **Framework:** Next.js (App Router)
- **Integrations:** Schoolmate CRM API, Zoom Webhook Ingestion & REST API
- **Persistence:** Upstash Redis (Serverless KV)
- **Architecture:** Target Vertical Slice Modules ([ADR-001](architecture/ADR-001-target-architecture-and-module-boundaries.md))
