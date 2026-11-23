# Investor DMS (website 2, port 5176)

Forked from `04_DMS_DEMO` and pruned for people who **have** registered on the Transaction Platform.

**Sidebar:** Notifications · Dashboard · Investors · Unassigned Investors (Admin) · Deals · Notes · Tasks · Events · Calendar · Call Logs · WhatsApp Logs · Email Logs · Junk (Admin). Prospect DMS addresses (`/pool`, `/prospects`, `/leads`, `/investor-family`, Data Import) show the invalid page.

**Removed:**
- Pool, Prospects, Leads, Data Import, Pool Source Visibility, Convert, "+ Create".
- Admin bulk "Release to Pool": there is no path back to Prospect DMS.
- Junk is only for Unassigned Investors; Restore returns there.

**Records arrive only by:**
- the F1 handover;
- the one-time migration seed (Family IDs `FAM-M…`, DECISION-28);
- a platform investment for an Unassigned investor that names an employee (D06 §5.2).

**Added** (code in `src/services`):

| File | What it does |
|---|---|
| `inbox.js` | F1 inbox: contract check, duplicate-PAN rejection, joining an existing family group, advisor and Data Code, Inv Status from tp-sim, the single Activity line, ack after save; platform investments |
| `familyLog.js` | F2 sent on every change + daily snapshot (DECISION-06) |
| `busy.js` | F4, including scheduled deals |
| `jobs.js` | Background jobs, Run daily jobs (DECISION-29) |
| `dashboard.js` | Dashboard numbers |

DECISION-20 (a family's groups move together) is in `lifecycle.js`.

**F3:** i-api answers number checks for the bridge with Yes/No only (`services/i-api/server.mjs`) and logs counts, never the numbers.

**Pages:** `pages/settings/DataBoundary.vue` (inbox, F2 sent, F3 answers, exceptions "Needs Data Code" / "Duplicate investor", audit log) and `pages/Dashboard.vue`.

**Data:** loaded from and saved to i-api (`services/i-api/data/idms-db.json`). Sign-in per tab in `sessionStorage` key `mh-idms-session`.
