# Data Management System (DMS)

**A working prototype of a client data management system for a financial services firm. It is split into two websites, Prospect DMS and Investor DMS, which are joined only by a controlled bridge.**

![Status](https://img.shields.io/badge/status-prototype-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20.19-339933?logo=node.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![frappe-ui](https://img.shields.io/badge/frappe--ui-1.1-0089FF)

**Live demo:** [Prospect DMS](https://anubhav-research.github.io/Data-management-system---DMS/prospect/) · [Investor DMS](https://anubhav-research.github.io/Data-management-system---DMS/investor/) · [Demo home](https://anubhav-research.github.io/Data-management-system---DMS/)

> **Prototype with fictional data.** Telephony, WhatsApp, email and the Transaction Platform are simulated. Do not use it for real client data in its current form.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Technology Stack](#technology-stack)
4. [Project Architecture](#project-architecture)
5. [Folder Structure](#folder-structure)
6. [Prerequisites](#prerequisites)
7. [Installation and Setup](#installation-and-setup)
8. [Environment Variables](#environment-variables)
9. [How to Run](#how-to-run)
10. [Live Demo](#live-demo)
11. [Database Setup](#database-setup)
12. [Demo Users](#demo-users)
13. [Screenshots](#screenshots)
14. [What Is Simulated](#what-is-simulated)
15. [Future Improvements](#future-improvements)
16. [Contribution Guidelines](#contribution-guidelines)
17. [License](#license)

---

## Project Overview

The DMS is where Investment Specialists (IS) manage a client from first contact until the client becomes an investor, and after that. Every call, message, note, task, event and deal is kept on one client record. Changes to sensitive client data go through a manager approval chain.

The system is split into **two separate websites**, each with its own back end and its own data store:

| Website | Who is in it | Default URL |
|---|---|---|
| **Prospect DMS** (blue) | People **not yet registered** on the Transaction Platform: Pool, Prospects, Leads, and the families of converted investors (Investor Family) | http://localhost:5175 |
| **Investor DMS** (green) | People **registered** on the Transaction Platform: Investors, Unassigned Investors, Deals, AUM | http://localhost:5176 |

The two websites share **no runtime data**: no store, no database and no API. Everything that crosses between them goes through the **bridge** service, as five defined flows. Each flow can be switched on or off in `.env` (`FLOW_F1` … `FLOW_F4`) and is written to an append-only, hash-chained audit log.

| Flow | Direction | What crosses |
|---|---|---|
| F1 handover | Prospect → Investor | Contract fields of the newly registered person(s) only |
| F1-ack | Investor → Prospect | `{handoverId, status, reasonCode, at}` |
| F2 family log | Investor → Prospect | `{familyId, advisorMhfId, status, investedLast18Months, updatedAt}` |
| F3 number check | Prospect asks; Investor DMS and the platform answer | Yes / No per mobile number or PAN |
| F4 busy blocks | Both ways | `{userMhfId, start, end, allDay}` |

---

## Key Features

### Prospect DMS
- **Pool:** a shared calling pool handed out in batches. Pool rules decide what happens after each call (convert, inactive, junk).
- **Prospects and Leads:** each record has timers (an inactivity clock and an overall cap). A record whose time runs out goes back to the Pool automatically.
- **Conversion to investor:** a wizard checks each family member on the Transaction Platform (simulator). Verified members are handed over to Investor DMS through the bridge, with an outbox, retries, acknowledgement and Admin Retry / Revert.
- **Investor Family:** families that still have members left to convert. When the last member is accepted by Investor DMS, the family leaves the list and the IS who converted it gets a congratulation notification.
- **Data Import (CSV)** with a protected-number check against Investor DMS, and **IS Mapping** to move records between specialists.
- **Junk** and **Unassigned Family** sections for Admin.

### Investor DMS
- **Investors list** with an **AUM** column (current value, gain in ₹ and %, refreshed at the end of each day) and quick filters.
- **Deals**, **Portfolio**, **Unassigned Investors** and **Junk** (with a downloadable log).
- **Daily jobs**, for example moving investors without an investment for 18 months to Unassigned.
- **Inbox** that receives handovers from Prospect DMS and assigns them to the converting IS.

### In both websites
- **Client record** with tabs: Activity, Calls, WhatsApp, Emails, Notes, Events, Documents and Data (Deals in Investor DMS).
- **Approval chain** for data changes (TL → VP → President → Admin), shown as a stepper card with Approve / Reject.
- **Messaging rules:**
  - Templates are allowed for 12 hours after a Followup call.
  - Free text is allowed for 24 hours after the client replies.
  - Per-user permission switches control what each person may send.
  - Only the record's IS, the people above them, and Admin may message a client.
- **WhatsApp tab:** one person and one number at a time. Attach from the computer or from the Document Repository, or paste a copied document with Ctrl+V.
- **Emails tab** in the Frappe CRM style: newest first, Reply / Reply All, TO / CC / BCC limited to the family's saved addresses, emoji, attachments and email templates.
- **Dashboards** with 30 / 60 / 90-day periods, a team / person scope, "Needs attention", charts, a grouped team table and an **Analyse** chart builder. Every number drills down to the exact records.
- **Lists** with search, quick filters, an advanced filter, multi-key sort and pagination.
- **Notes, Tasks, Events, Calendar**, **Call / WhatsApp / Email logs** and **Notifications**.
- **Settings:** users and access switches, templates, calendar, defaults and preferences.

### Content Hub (shared by both websites)
- **Document Repository** with folders, preview, download and copy.
- **Circulars** with read tracking.
- **Market Update** with a heat map and tables. It can be typed in by hand or filled by an automation feed that matches rows and columns by name.
- **Quiz** with per-team participation for Admin.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Language | JavaScript (ES modules) |
| Front end | [Vue 3](https://vuejs.org/) (`<script setup>`), [Vue Router 4](https://router.vuejs.org/), [Pinia 2](https://pinia.vuejs.org/) |
| UI kit and look | [frappe-ui 1.1](https://github.com/frappe/frappe-ui) (components and charts), following [Frappe CRM](https://github.com/frappe/crm) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com/), PostCSS, Autoprefixer |
| Build tool | [Vite 8](https://vitejs.dev/) with `@vitejs/plugin-vue` |
| Documents | [pdf.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) for PDF preview |
| Back-end services | Node.js (built-in `http` module, no framework) |
| Data storage | JSON files on disk, one store per service (see [Database Setup](#database-setup)) |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |
| QA / end-to-end tests | [Playwright](https://playwright.dev/) (`playwright-core`) driving Edge or Chrome |

---

## Project Architecture

```
          Browser                                   Browser
   ┌──────────────────────┐                 ┌──────────────────────┐
   │  Prospect DMS :5175  │                 │  Investor DMS :5176  │
   │  Vue 3 + frappe-ui   │                 │  Vue 3 + frappe-ui   │
   └──────────┬───────────┘                 └───────────┬──────────┘
              │ Vite proxy adds the website's own key   │
     /api     │   /bridge   /tp   /content              │  /api  /bridge  /tp  /content
              ▼                                         ▼
   ┌──────────────────────┐   ┌───────────────┐  ┌──────────────────────┐
   │ p-api :4101          │   │ bridge :4104  │  │ i-api :4102          │
   │ Prospect data (JSON) │◄─►│ F1-F4 + audit │◄►│ Investor data (JSON) │
   └──────────────────────┘   └───────┬───────┘  └──────────────────────┘
                                      │
              ┌───────────────────────┴───────────┐
              ▼                                   ▼
   ┌──────────────────────┐          ┌──────────────────────────┐
   │ tp-sim :4103         │          │ Content Hub :4105        │
   │ Transaction Platform │          │ Documents, Circulars,    │
   │ SIMULATOR + console  │          │ Market Update, Quiz      │
   └──────────────────────┘          └──────────────────────────┘
```

- **Websites (`apps/`).** Business rules live in each website's `src/services`. The website loads its whole state from its own API, edits it in the browser, and saves it back with an **optimistic version number**. If someone else saved first, the server answers `409` and the screen reloads with the latest data.
- **Shared code (`packages/core-ui`).** This is code only, with no data: formatters, the sync client, the bridge client, dashboard cards and the Content Hub screens.
- **Service keys.** Each website's Vite dev server adds its own API key when it forwards `/api`, `/bridge`, `/tp` and `/content`, so the browser never holds a key. A service accepts only its own website's key.
- **Background work.** The handover outbox, family log, inbox and daily jobs run in the open browser tabs, standing in for server-side workers.

---

## Folder Structure

```
.
├── apps/
│   ├── prospect-dms/          # Website 1 (port 5175): Pool, Prospects, Leads, Investor Family
│   │   ├── public/            # favicon and static assets
│   │   └── src/
│   │       ├── components/    # list, record tabs, modals, dashboard, settings
│   │       ├── composables/   # list state (search, filters, sort)
│   │       ├── data/          # masters (dropdowns, rules) and the demo seed
│   │       ├── layouts/       # sidebar, notifications panel
│   │       ├── pages/         # one file per screen (+ pages/settings)
│   │       ├── router/        # routes
│   │       ├── services/      # business rules: lifecycle, calls, handover, approvals, dashboard ...
│   │       ├── stores/        # Pinia store and server sync
│   │       └── utils/
│   └── investor-dms/          # Website 2 (port 5176): Investors, Deals, AUM (same layout)
├── packages/
│   └── core-ui/               # shared code: format, sync, bridge client, components, Content Hub UI
├── services/
│   ├── lib/                   # common helpers and the generic JSON state server
│   ├── p-api/                 # Prospect DMS back end (port 4101)
│   ├── i-api/                 # Investor DMS back end (port 4102)
│   ├── tp-sim/                # Transaction Platform simulator + console (port 4103)
│   ├── bridge/                # the only link between the websites (port 4104) + contract/
│   └── content/               # Content Hub (port 4105): seed.mjs + seed-files/
├── scripts/                   # dev-all, reset-all, service start/stop, market feed, content seed
├── qa/                        # Playwright QA suites (smoke, journeys, junk rules, responsive, split)
├── .env.example               # ports, demo keys and flow switches
├── package.json               # npm workspaces and scripts
└── README.md
```

---

## Prerequisites

| Requirement | Version / notes |
|---|---|
| [Node.js](https://nodejs.org/) | **20.19 or newer** (npm comes with it) |
| [Git](https://git-scm.com/) | to clone the repository |
| A modern browser | Edge, Chrome or Firefox |
| Microsoft Edge or Google Chrome | only for the QA scripts (`npm run qa:all`) |

No database server is needed.

---

## Installation and Setup

```bash
# 1. Clone the repository
git clone https://github.com/Anubhav-research/Data-management-system---DMS.git
cd Data-management-system---DMS

# 2. Install all workspaces (both websites, shared package, tools)
npm install

# 3. (Optional) create a local configuration
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Step 3 is optional. Without a `.env` file the defaults from `.env.example` are used.

---

## Environment Variables

Settings are read from `.env.example` first and then from `.env`, if it exists. A value in `.env` overrides the default. **Never commit `.env`.** It is listed in `.gitignore`.

| Variable | Default | Purpose |
|---|---|---|
| `PDMS_PORT` | `5175` | Prospect DMS website |
| `IDMS_PORT` | `5176` | Investor DMS website |
| `P_API_PORT` | `4101` | Prospect DMS back end |
| `I_API_PORT` | `4102` | Investor DMS back end |
| `TP_SIM_PORT` | `4103` | Transaction Platform simulator |
| `BRIDGE_PORT` | `4104` | Bridge service |
| `CONTENT_PORT` | `4105` | Content Hub |
| `P_API_KEY` | demo placeholder | Key that only the Prospect DMS website may use |
| `I_API_KEY` | demo placeholder | Key that only the Investor DMS website may use |
| `BRIDGE_LOOKUP_KEY` | demo placeholder | Used by the bridge for the Yes/No number check |
| `MARKET_FEED_KEY` | demo placeholder | Lets an automation publish a Market Update |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` makes the sites reachable on the local network) |
| `FLOW_F1`, `FLOW_F1_ACK`, `FLOW_F2`, `FLOW_F3`, `FLOW_F4` | `on` | Starting state of the five bridge flows |
| `INVESTOR_DATA_IN_PDMS` | `remove` | What happens to an investor's personal data in Prospect DMS after the handover is accepted: `remove` or `hide` |

> The keys in `.env.example` are **demo placeholders**. For any shared or deployed environment, set your own random values in `.env`.

---

## How to Run

Start all five services and both websites with one command:

```bash
npm run dev:all
```

The command prints labelled logs for every process and the local and network links. Then open:

- **Prospect DMS:** http://localhost:5175
- **Investor DMS:** http://localhost:5176
- **Transaction Platform simulator console:** http://localhost:4103

On Windows, the firewall asks once per port whether to allow network access. Choose **Private networks** if colleagues should open the network links.

### All commands

| Command | What it does |
|---|---|
| `npm run dev:all` | Start every service and both websites |
| `npm run build:all` | Production build of both websites (`apps/*/dist`) |
| `npm run reset:all` | Return both websites, the bridge, the simulator and the Content Hub to their seed data (the audit log is archived, never edited). **This erases all current data.** |
| `npm run stop:<service>` / `npm run start:<service>` | Stop or start one service: `p-api`, `i-api`, `tp-sim`, `bridge`, `content` (for example, to demo "bridge down") |
| `npm run market:feed -- <file.xlsx \| file.json>` | Publish a Market Update through the automation feed |
| `npm run build:pages` | Build the GitHub Pages demo into `pages-dist/`: both websites, with the five services running inside the visitor's browser and this PC's current demo data as the starting data (`pages/`) |
| `npm run qa:all` | Build and run every QA suite and write `qa/REPORT.md`. Needs `dev:all` running. **It resets the data.** |

To run a single website only: `npm run dev -w apps/prospect-dms` (the services must be running for data).

---

## Live Demo

The demo runs on **GitHub Pages**, with no server:

| Website | Link |
|---|---|
| **Prospect DMS** | [https://anubhav-research.github.io/Data-management-system---DMS/prospect/](https://anubhav-research.github.io/Data-management-system---DMS/prospect/) |
| **Investor DMS** | [https://anubhav-research.github.io/Data-management-system---DMS/investor/](https://anubhav-research.github.io/Data-management-system---DMS/investor/) |
| Demo home page | [https://anubhav-research.github.io/Data-management-system---DMS/](https://anubhav-research.github.io/Data-management-system---DMS/) |

Sign in with any demo MHF ID from the login screen (see [Demo Users](#demo-users)); any password works.

How it works: GitHub Pages can only serve files, so the five back-end services (p-api, i-api, tp-sim, content, bridge) run **inside the visitor's browser** in a service worker (`pages/sw.js`), using the same service code as on a PC. Both websites share that worker, so the bridge works between them when they are open in two tabs of the same browser. The data starts from the published demo data, and each visitor's changes stay in their own browser (the home page has **Start over** to go back to the original data).

To update the demo: run `npm run build:pages` (it takes this PC's current demo data as the starting data) and publish `pages-dist/` on the `gh-pages` branch.

---

## Database Setup

No database server is used. Each service keeps its data in **JSON files** under its own folder:

| Service | Data folder | Created from |
|---|---|---|
| p-api | `services/p-api/data/` | the Prospect DMS seed (`apps/prospect-dms/src/data/seed.js`) |
| i-api | `services/i-api/data/` | the Investor DMS seed (`apps/investor-dms/src/data/seed.js`) |
| tp-sim | `services/tp-sim/data/` | `services/tp-sim/seed.json` |
| bridge | `services/bridge/data/` | empty state + append-only audit and family logs |
| content | `services/content/data/` | `services/content/seed.mjs` + `seed-files/` |

**Initialization is automatic.** On a fresh clone these folders don't exist. They are created when the services start, and the first website to load writes its seed data. To start over at any time, run `npm run reset:all` and reload both websites.

The data folders are listed in `.gitignore`, so runtime data is never committed. Every save carries a version number (`*.meta.json`), and a stale save is rejected with `409`.

---

## Demo Users

The same people exist in both websites; each website keeps its own user table. **Any password works** in the demo.

| Role | Name | Employee ID |
|---|---|---|
| Admin | James Wilson | MHF500001 |
| President | Robert Brown | MHF500002 |
| VP | Emma Clark | MHF500003 |
| TL | David Miller | MHF500004 |
| IS | John Smith | MHF500007 |
| IS | Emily Davis | MHF500011 |

Once signed in, use **Switch demo user** in the user menu to change roles. All names and client records are fictional.

---

## Screenshots

> Screenshots will be added. Suggested images (save them in `docs/screenshots/` and link them here):

| Screen | Image |
|---|---|
| Prospect DMS: Dashboard | _placeholder: `docs/screenshots/prospect-dashboard.png`_ |
| Prospect DMS: Client record (WhatsApp / Emails) | _placeholder: `docs/screenshots/prospect-record.png`_ |
| Investor DMS: Investors list with AUM | _placeholder: `docs/screenshots/investor-list.png`_ |
| Investor DMS: Dashboard | _placeholder: `docs/screenshots/investor-dashboard.png`_ |
| Content Hub: Market Update | _placeholder: `docs/screenshots/market-update.png`_ |

---

## What Is Simulated

| Area | In this prototype |
|---|---|
| Transaction Platform | The `tp-sim` service, labelled "SIMULATOR – NOT A REAL SYSTEM" |
| Telephony, WhatsApp, email | Simulated inside the websites; nothing is really sent |
| Background workers | Run in the open browser tabs |
| Sign-in | Demo login with any password; no single sign-on |
| Data Import | Reads CSV rows; the full cleaning rules are not executed |

---

## Future Improvements

These are **not implemented yet**:

- Real integrations: WhatsApp Business API, an email gateway, telephony, and the live Transaction Platform (including end-of-day investment values).
- Company single sign-on and a security review of every service.
- Moving background jobs (outbox, family log, daily jobs) to server-side workers.
- A production database in place of the JSON files.
- Connecting the Market Update automation to a live market data source.
- A read-only research desk login for publishing circulars, documents and quizzes.
- A weekly summary email built from the dashboard.
- Automated unit tests next to the existing end-to-end QA suites.

---

## Contribution Guidelines

1. **Fork** the repository and create a branch from `main`: `git checkout -b feature/short-description`.
2. Install with `npm install` and run everything with `npm run dev:all`.
3. Keep the design rules:
   - Business rules belong in each website's `src/services`, not in the screens.
   - The two websites must not share data. Anything that crosses goes through the bridge.
   - Shared code (no data) goes in `packages/core-ui`.
   - Follow the existing Frappe UI look.
4. Check your change in the browser, and make sure both websites still build: `npm run build:all`.
5. Never commit `.env`, real client data, or anything under `services/*/data/`.
6. Commit with a clear message and open a **pull request** that describes what changed and why. Add screenshots for UI changes.

For bugs and ideas, please open an **issue** with steps to reproduce.

---

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
