# Archived Verification Artifacts

Files in this directory are retained only as historical QA evidence. They are not supported or runnable verification suites and must not be invoked by package scripts or verification documentation.

`crm-003-zoom-migration.e2e.mjs.archived` was retired by CRM-006 because it imports parent-POC modules and asserts the obsolete dual-write contract. Its valid signature, CRC, occurrence, migration, and safe-ID coverage is maintained by `ee-crm/test-crm-005.js` and the CRM-006 suites.
