# Prospect DMS (website 1, port 5175)

Forked from `04_DMS_DEMO` and pruned for people who have **not** registered on the Transaction Platform.

**Sidebar:** Notifications · Dashboard · Pool · Prospects · Leads · **Investor Family** · Notes · Tasks · Events · Calendar · Call Logs · WhatsApp Logs · Email Logs · **Unassigned Family** (Admin) · Junk (Admin). Investor DMS addresses (`/investors`, `/deals`, `/unassigned`, `/portfolio`) show the invalid page.

**Removed:** Investors, Deals, Unassigned Investors, Portfolio, Data Codes, investor clocks and warnings (N-19, N-20), investor seed data.

**Added** (code in `src/services`):

| File | What it does |
|---|---|
| `family.js` | Family IDs, Investor tags, "do not distribute" numbers, Admin exceptions |
| `handover.js` | Conversion wizard rules, F1 outbox (retry with backoff, idempotency key), acknowledgement, Admin Retry / Revert |
| `familyLog.js` | Applies F2 (advisor change, Unassigned, back to assigned, Investor active); manual fallback while F2 is off |
| `numberCheck.js` | F3 for Data Import (fifth count + skipped-rows CSV), manual creation and Pool batches |
| `busy.js` | F4 busy blocks |
| `jobs.js` | Background jobs, self-registration alerts, Run daily jobs |
| `dashboard.js` | Dashboard numbers |

**Pages:**

| Page | Notes |
|---|---|
| `components/modals/ConversionWizard.vue` | Replaces the old Convert to Investor modal |
| `pages/UnassignedFamily.vue` | Admin only |
| `pages/settings/DataBoundary.vue` | Flows, outbox, F2, F3, exceptions, contract, diagram, audit log |
| `pages/settings/FamilyAdvisor.vue` | Manual fallback, shown only while F2 is off |
| `pages/Dashboard.vue` | Dashboard |

**Rules that live elsewhere:**
- Investor Family rules: `lifecycle.js` (no Pool, no Junk, not in 1500), `access.js` (fully converted = Admin only), `approvals.js` (removing a member, DECISION-17).

**Data:** loaded from and saved to p-api (`services/p-api/data/pdms-db.json`) through `packages/core-ui/src/sync.js`. Sign-in per tab in `sessionStorage` key `mh-pdms-session`.

**Data Import template:** `Data_Extraction_prompt.txt` / `Raw_format_data.xlsx` (AI pre-import) belong to this website and are unchanged.
