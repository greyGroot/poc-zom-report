# EE-CRM Post-MVP Launch Readiness & Action Items

**Document:** POST_MVP.md  
**Status:** Note / Tracking  
**Context:** Findings and operational items identified during the architectural audit to be addressed upon reaching MVP readiness before production launch.  

---

## Overview

During the MVP development and staging phase, EE-CRM operates in a shared development environment alongside the legacy POC application—sharing an Upstash Redis database instance and utilizing an authentication bypass flag to streamline local and E2E QA testing.

Before transitioning EE-CRM into full production, the following architectural and security findings must be resolved to ensure complete tenant isolation, enterprise security, and data integrity.

---

## 1. Database Isolation & Dedicated Credentials (Resolves CRIT-1)

### Context & Risk
Production Vercel deployments currently point to the legacy POC's Upstash Redis database instance (`precious-hare-...`). Furthermore, the persistence layer only checks `UPSTASH_REDIS_REST_*` and `KV_REST_API_*`, ignoring the documented `EE_CRM_REDIS_REST_URL` and `EE_CRM_REDIS_REST_TOKEN` environment variables.

### Action Items
- **Runtime Precedence:** Update `getRedisClient()` across all persistence modules to prioritize `process.env.EE_CRM_REDIS_REST_URL` and `process.env.EE_CRM_REDIS_REST_TOKEN` ahead of generic fallbacks.
- **Dedicated Database Provisioning:** Provision a new, isolated Upstash Redis database instance specifically for EE-CRM production.
- **Environment Cleanup:** Configure Vercel production with the dedicated `EE_CRM_REDIS_*` credentials and remove all `POC_REDIS_REST_*` variables from the production environment.
- **Verification:** Ensure `/api/health` verifies connectivity against the dedicated `EE_CRM_REDIS` instance and reports isolated database status.

---

## 2. Production Authentication Perimeter Enforcement (Resolves MED-4 Part A)

### Context & Risk
`NEXT_PUBLIC_EE_CRM_AUTH_BYPASS` currently defaults to `'true'` in `next.config.mjs`, and `middleware.js` allows all requests unless explicitly configured with `'false'`. If deployed without explicit environment overrides, internal teacher, schedule, and wage data would be accessible without login.

### Action Items
- **Disable Bypass in Production:** Set `NEXT_PUBLIC_EE_CRM_AUTH_BYPASS=false` as the default in production builds.
- **Middleware Enforcement:** Verify that middleware strictly intercepts all routes except `/login`, `/api/auth`, `/api/health`, `/api/webhooks/zoom`, and static assets.
- **API Protection:** Ensure direct API calls without a session token receive HTTP 401 Unauthorized rather than being allowed through.

---

## 3. Google OAuth Corporate Domain Whitelisting (Resolves MED-4 Part B)

### Context & Risk
`lib/auth.js` currently configures Google OAuth without restricting allowed email domains. Without filtering, any visitor with a personal `@gmail.com` account could authenticate and view internal CRM data once the bypass is turned off.

### Action Items
- **Domain Verification Callback:** Implement a `signIn` callback in `lib/auth.js` that checks user email against authorized corporate domains:
  ```javascript
  async signIn({ user, account, profile }) {
    const email = user?.email?.toLowerCase().trim() || '';
    const allowedDomains = (process.env.ALLOWED_AUTH_DOMAINS || 'englishempire.com.ua')
      .split(',')
      .map(d => d.trim().toLowerCase());
    const isAllowed = allowedDomains.some(domain => email.endsWith(`@${domain}`));
    return isAllowed;
  }
  ```
- **Login Screen UX:** When unauthorized personal accounts are rejected (`/login?error=AccessDenied`), display a user-friendly, localized notice explaining that access requires an official school email account.

---

## 4. Standalone Repository Decoupling (Optional Post-MVP Milestone)

### Context & Risk
EE-CRM currently lives inside the `poc-zoom-report` monorepo. Turbopack detects two lockfiles and infers the root directory as the workspace root, generating build-time warnings.

### Action Items
- Extract `ee-crm/` into its own standalone Git repository.
- Remove root monorepo configuration in `.vercel/repo.json` and set project root directory to `.`.
- Verify standalone CI/CD pipeline builds and tests pass cleanly without parent repository files.

---

## 5. Mandatory Redis Failure-Mode Verification in an Isolated Vercel Preview (CRM-006)

### Context & Risk
CRM-006 removed silent production fallback to process-local memory when Redis is unavailable. Local tests verify this behavior with injected failures, but launch readiness also requires production-equivalent evidence from Vercel's actual serverless runtime. Without this check, a deployment could still acknowledge Zoom webhooks that were not durably persisted, causing silent and unrecoverable data loss when the function instance terminates.

### Mandatory Launch Gate
This check **must pass before production launch or final CRM-006 acceptance**. It must run in a disposable Vercel Preview deployment, never against Production or real Zoom traffic.

### Procedure
1. Create a temporary branch and its Vercel Preview deployment.
2. Add a Preview-only, branch-scoped invalid Redis token for the credential pair used by the application (`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN`). Do not change Production variables, and do not enable `USE_IN_MEMORY_REDIS`.
3. Redeploy the preview so the branch-scoped environment override takes effect.
4. Verify `GET /api/health` returns HTTP `503` with `status: "degraded"`, `connected: false`, and `mode: "unavailable"`.
5. Send a correctly signed, non-production Zoom webhook fixture to the preview and verify it returns HTTP `500` with `error: "ZOOM_PERSISTENCE_FAILED"`, never HTTP `200`.
6. Confirm responses and deployment logs do not expose Redis URLs, tokens, raw payloads, or stack traces.
7. Record sanitized request/response evidence in `verification/evidence/` and update the CRM-006 QA report to distinguish this Vercel Preview result from local simulated failures.
8. Remove the branch-specific environment override and delete the disposable preview/branch. Never promote the broken-Redis preview to Production.

### Exit Criteria
- [ ] Isolated Preview health probe returns the expected sanitized HTTP `503` response.
- [ ] Correctly signed webhook returns the expected sanitized HTTP `500` response.
- [ ] No in-memory fallback or successful webhook acknowledgement occurs.
- [ ] Sanitized Vercel evidence is attached to the CRM-006 QA report.
- [ ] Temporary environment overrides and preview resources are removed.
