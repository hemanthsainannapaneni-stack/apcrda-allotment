# Amaravati Land Allotment Tracking & Review Portal — APCRDA

Internal workflow / case-management system for investor and institutional land allotments in the
Amaravati Capital Region. It moves each allotment **case** through a fixed sequence of stages and
decision gates, captures the required data at each stage, enforces who may act where, and gives
reviewers and management full visibility, audit history, and reporting.

This is **not** the public land-sale or e-auction storefront.

---

## Quick start

```bash
cp .env.example .env
cp .env.example server/.env

npm install
npm run db:push     # creates server/prisma/dev.db from the Prisma schema
npm run seed        # demo users + 21 sample cases with full history
npm run dev         # API on :4000, web on :5173
```

Open **http://localhost:5173** and use any account from the *Demo logins* panel on the sign-in
screen — one click fills the form and signs in.

The default database is **SQLite**, so nothing else needs to be installed. To reset the demo data at
any time: `npm run reset`.

### Running on Postgres / Docker

```bash
npm run use:postgres          # rewrites the Prisma datasource provider
docker compose up --build     # Postgres + API (:4000) + built web app (:8080)
```

`docker compose` runs `prisma db push` and the seed on first boot. To go back to the zero-infra
setup, run `npm run use:sqlite`.

---

## Deploying

The app is a **server plus a database**, not a static site. Publishing only
`web/dist` gives you a working-looking sign-in screen whose every request 404s,
because there is no API behind it.

### Netlify (config included)

`netlify.toml` builds the frontend, runs the Express API as a Netlify Function
at `/api/*`, and schedules the hourly sweeps as a background function.

1. **Create a Postgres database.** SQLite cannot be used — a function has no
   persistent disk. [Neon](https://neon.tech) works well and has a free tier.
2. **Push the schema and seed it, from your machine:**
   ```bash
   npm run use:postgres
   DATABASE_URL="postgres://…" npm run db:push
   DATABASE_URL="postgres://…" npm run seed
   ```
3. **Set the environment variables** in Site settings → Environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Postgres connection string |
   | `JWT_ACCESS_SECRET` | a long random string |
   | `JWT_REFRESH_SECRET` | a different long random string |
   | `NODE_ENV` | `production` |
   | `CLIENT_ORIGIN` | your site URL, e.g. `https://apcrda-allotment.netlify.app` |

   The API refuses to start in production while the JWT secrets still hold their
   demo defaults, so these two are not optional.
4. **Deploy.** Netlify picks up `netlify.toml` automatically; no build settings
   need to be entered by hand.

Check it worked by opening `/health` on your site — it should return JSON, not
an HTML page.

**Known limit on serverless:** file uploads need a writable disk, which a Netlify
Function does not have. Everything else works; uploading a document returns a
clear error until object storage is configured (`STORAGE_DRIVER=s3`). If you need
uploads, host the API on a container platform instead.

### Any Node host (Render, Railway, Fly, a VM)

A better fit if you want uploads and the built-in hourly sweeps.

```bash
npm run use:postgres
npm install && npm run build
DATABASE_URL=… JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… npm run start
```

Then build the frontend pointing at it, and host `web/dist` anywhere:

```bash
VITE_API_URL=https://your-api.example.com npm run build --workspace web
```

---

## Demo credentials

> **Demo credentials — change before production.** Set `VITE_SHOW_DEMO_LOGINS=false` to hide the
> quick-fill panel, and reset every password before go-live.

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@apcrda.demo` | `Admin@123` |
| Lands Officer | `lands@apcrda.demo` | `Lands@123` |
| Technical (DPR) Reviewer | `dpr@apcrda.demo` | `Dpr@123` |
| Economic Dev Reviewer | `ecodev@apcrda.demo` | `Eco@123` |
| LASC Member | `lasc@apcrda.demo` | `Lasc@123` |
| GoM Member | `gom@apcrda.demo` | `Gom@123` |
| Cabinet Sub-Committee | `subcab@apcrda.demo` | `Subcab@123` |
| Authority Approver | `authority@apcrda.demo` | `Auth@123` |
| Cabinet Approver | `cabinet@apcrda.demo` | `Cabinet@123` |
| Finance Officer | `finance@apcrda.demo` | `Finance@123` |
| Planning/Building Officer | `planning@apcrda.demo` | `Plan@123` |
| Investor A | `investor@demo.com` | `Investor@123` |
| Investor B | `investor2@demo.com` | `Investor@123` |
| Viewer / Auditor | `viewer@apcrda.demo` | `Viewer@123` |

---

## The workflow engine

The heart of the app is a **case** flowing through **stages**. Stages, their owners, SLAs, gate
outcomes, form fields, expected documents, and routing rules are **configurable data in the `Stage`
table**, not hard-coded branches. The engine (`server/src/workflow/engine.ts`) reads that table on
every transition, so an admin editing Settings → Workflow changes behaviour immediately.

### Stage catalogue

The catalogue has **20 entries — 16 numbered stages plus 4 sub-stages** (1a, 5a, 6a, 12a). The
original spec text says "19 stages" while its own table lists 20 rows; the build follows the table.

| # | Stage | Owner | Type | Gate outcomes |
|---|---|---|---|---|
| 0 | Land Inventory & Invitation Document | Lands | Setup | Published |
| 1 | Registration & Application (+ fee/EMD) | Investor | Intake | Submitted |
| 1a | Eligibility & Mode-of-Allotment Check | Lands | Gate | Eligible / Reject |
| 2 | DPR Submission & Review (R0, R1) | Technical + Investor | Review-loop | Accept / Return / Reject |
| 3 | Economic Development Review | Eco Dev | Review | Positive / Return / Reject |
| 4 | LASC Scrutiny + Site & Title Verification (R0–R2) | LASC | Committee | Recommend / Clarify / Reject |
| 5 | Group of Ministers (R0, R1, Auto) | GoM | Committee | Clear / Defer |
| 5a | Cabinet Sub-Committee *(conditional)* | Sub-Committee | Committee | Recommend / Return |
| 6 | APCRDA Authority Approval | Authority | Approval | Approve / Return / Reject |
| 6a | Cabinet-Approval Test | Authority (rule-driven) | Gate | To Cabinet / Direct to GO |
| 7 | Cabinet Approval *(conditional)* | Cabinet | Approval | Approve / Return / Reject |
| 8 | Government Order & Land Details | Planning | Issuance | Issued |
| 9 | Letter of Intent | Lands + Investor | Issuance | Accepted / Lapsed |
| 10 | Payment & Financial Processing | Finance + Investor | Financial | Current / Default |
| 11 | Revised DPR — Final Version | Technical + Investor | Review | Accepted / Return |
| 12 | Agreement Execution & Registration | Planning + Investor | Legal | Registered |
| 12a | Handover of Physical Possession | Lands | Operational | Handed over |
| 13 | Building Permission / Development Approval | Planning | Approval | Sanctioned / Return / Reject |
| 14 | Construction Commencement & Monitoring | Planning + Investor | Monitoring | On track / Delay notice |
| 15 | Utilisation Compliance & Completion | Lands | Compliance | Good standing / Breach notice / Resumption |

Phases: **A** (0–1a) intake · **B** (2–7) review & approval · **C** (8–12a) issuance & handover ·
**D** (13–15) development & compliance.

### Gates and transitions

- Every decision records actor, timestamp, outcome, kind (`pass` / `return` / `reject` / `defer` /
  `lapse`), and **mandatory remarks** — validated on the client *and* the server.
- **Review-loop stages** support rounds. A `return` or `defer` opens the next round of the target
  stage; the round number auto-increments and the round labels come from the stage record
  (`R0`, `R1`, `R2`, `Auto`). Exhausting the configured rounds forces a final accept or reject.
- **Stage 6a** is rule-driven (`routing.rule = "CABINET_TEST"`): it routes to Cabinet when
  `extent_acres >= cabinet_test_extent_acres` **OR** `isConcessional` **OR** the land category is
  sensitive — otherwise Stage 7 is skipped and the case goes straight to the Government Order. The
  reason is written onto the case and shown on the case header.
- **Stage 5a** applies only to concessional allotments and the modes listed in
  `subcommittee_required_modes`; it is skipped and marked *Not applicable* otherwise.
- **Stage 9** starts the LOI validity countdown. An hourly sweep warns before expiry and flags the
  case `Lapsed` if it is not accepted in time.
- **Stage 15** enforces the commencement deadline: a breach opens a cure period, and resumption
  closes the case with the refund/forfeiture calculation.
- Forward movement requires a `pass`. A `reject` / `lapse` / approved resumption moves the case to a
  terminal state — history is always retained, and cases are only ever soft-deleted.

### Parallel paths

- **Grievance / appeal** — any adverse decision can be contested. Linked record with its own status
  (`Open → Under Review → Resolved/Rejected`), assignee, and SLA timer.
- **Cancellation / withdrawal / resumption** — investor-initiated withdrawal or APCRDA-initiated
  cancellation/resumption. Requires a reason and approval, books the refund, forfeits the EMD, and
  returns the plot to the inventory.

### Time-driven rules

`server/src/workflow/sweeps.ts` runs at boot and hourly: LOI expiry warnings and lapses, overdue
payment flags with accrued penalty, commencement-deadline warnings and breach notices, and SLA
breach alerts. Notifications are de-duplicated so a long-running sweep does not spam.

---

## Designed to be readable without training

The process itself is complex — twenty steps, thirteen roles, and a pile of official acronyms. The
screens are not. Every jargon term on screen is paired with an ordinary-language version:

- **A plain-English layer** (`web/src/lib/plain.ts`) gives every step a short name ("Committee
  scrutiny"), a sentence explaining what is happening, and a sentence saying what the person holding
  it has to do. Shared steps carry a second version for the other party, so an investor is told to
  *submit* the report while the reviewer is told to *read* it.
- **Every case opens with a "right now" card**: how far along it is, what is happening in one
  sentence, whether it is waiting on you or on someone else, and what comes next.
- **Rounds read as "Attempt 2 of 3"** rather than `R1`.
- **Decision buttons say what they do** — "Recommend it to the ministers", not "RECOMMEND" — with a
  line underneath explaining the consequence, and a confirmation step that requires a written reason.
- **Progressive disclosure.** The dashboard opens with the four numbers that change what you do
  today; the other six and all the charts are behind one "show more" toggle. Case filters, the full
  twenty-step timeline, and the dates/order-numbers grid work the same way.
- **Acronyms are hoverable** (`<Term>`), and **How this works** (`/help`) is a single page covering
  the whole journey, a glossary, the other roles, and the questions people actually ask — tailored
  to whichever role is signed in.

The official terminology is never removed: the file still records "LASC Scrutiny + Site & Title
Verification, R1, outcome RECOMMEND". It is just no longer the only thing on screen.

## Modules

| Module | Where |
|---|---|
| Authentication & access | JWT access + rotating refresh tokens, session timeout, forgot/reset password, failed-login lockout, active/suspended accounts |
| Dashboard (role-aware) | Role-filtered KPIs, My Tasks, cases by stage/phase, aging, decisions over time, objective/mode/holding splits |
| Case management | List with search + 10 filters, case detail with stage stepper, active-stage panel, documents, payments, grievances, cancellation, notes, activity |
| Applications & eligibility | Investor application form, applicant profiles, eligibility checklist and mode selector at Stage 1a |
| Financial / payments | Schedule generation, receipts, dues, penalty accrual, refund/forfeiture calculator, Finance reconciliation |
| Committee & review workspaces | One queue screen driven by the permissions matrix — serves DPR, Eco Dev, LASC, GoM, Sub-Committee, Authority, Cabinet, Finance, Planning |
| Land inventory (Stage 0) | Plot registry with extent, survey/GIS ref, zone, land use, FSI/FAR, reserve price, objective, availability; invitation documents |
| Building & construction (13–15) | Permission checklist with statutory NOCs, milestone tracking (planned vs actual), compliance status, show-cause notice + cure period |
| Grievances & appeals | Raise, assign, track, resolve; SLA timers; register with filters |
| Reports & exports | 7 standard reports, date-range and filter driven, CSV + PDF export |
| Notifications | In-app centre with unread badge; email logs to the API console in the demo |
| User management | CRUD, role assignment, suspend/reinstate, admin password reset, last-login |
| Settings | Workflow config, master data, organisation, roles & permissions matrix, notification templates |
| Audit & history | Append-only log of every action with before/after diffs; global viewer + per-case tab |
| How this works | Role-aware orientation page: the four parts of the journey, your own steps, a glossary, and an FAQ |

---

## Roles & permissions

Thirteen seeded roles. Two layers of authorisation, both enforced **server-side**:

1. **Stage permissions** — the `Permission` table decides which role may *act* on which stage.
   Editable at Settings → Roles & permissions.
2. **Capabilities** — non-stage abilities (`users:manage`, `payments:manage`, `audit:view`, …)
   carried on the role record.

On top of that: **investors are strictly scoped to their own cases** via their applicant profiles,
and the **Viewer / Auditor role is read-only** — every non-GET request is rejected regardless of the
matrix. The UI hides and disables what a role cannot do, but the server is the authority.

---

## `«CONFIRM»` values to set before go-live

These are seeded with sensible defaults and edited at **Settings → Workflow / Finance**. Each one is
flagged in the UI with a *Confirm before go-live* badge.

| Setting | Default | Meaning |
|---|---|---|
| `loi_validity_days` | 90 | Days to accept the LOI before the case lapses |
| `cabinet_test_extent_acres` | 25 | Extent at or above which Stage 6a routes to Cabinet |
| `commencement_deadline_years` | 2 | Years from agreement to commence construction |
| `cure_period_days` | 90 | Time to remedy a commencement breach before resumption |
| `penalty_rate_pct_per_annum` | 12 | Simple interest on overdue payment lines |
| `forfeiture_pct_withdrawal` | 10 | Forfeiture on investor withdrawal |
| `forfeiture_pct_cancellation` | 25 | Forfeiture on APCRDA cancellation (EMD forfeited in full too) |
| `forfeiture_pct_resumption` | 50 | Forfeiture on resumption for breach |

Also replace `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env` — the API refuses to start in
production while they still hold the demo defaults.

---

## Seed data

`npm run seed` produces a non-empty, realistic system:

- **21 cases** spread across every phase, including one at each of Stages 1 → 15, a **lapsed LOI**,
  an **overdue payment with accrued penalty**, an **SLA-breached case**, a **grievance in progress**,
  an approved **withdrawal**, a pending **resumption** against a commencement breach, a **rejected**
  case with an appeal, and a **completed & compliant** case.
- **14 plots** across nine theme cities with varied zones, FSI, reserve prices, objective categories,
  and two parcels flagged *sensitive* (which force the Cabinet route).
- 12 applicant entities, 4 invitation documents, ~200 decisions with remarks, ~95 payment lines,
  construction milestones, compliance records, building permissions with NOCs, documents (all
  pointing at a real generated placeholder PDF so downloads work), notifications, and ~200 audit
  entries.
- INR amounts and Indian entity names throughout; dates spread over the last ~19 months.

---

## Architecture

```
server/                    Express + TypeScript + Prisma
  prisma/schema.prisma     Full data model (SQLite by default, Postgres-ready)
  prisma/seed*.ts          Seed script and its data tables
  src/lib/                 env, prisma, auth, audit, storage, notify, settings, http helpers
  src/middleware/auth.ts   requireAuth, requireCapability, read-only guard, investor scoping
  src/workflow/
    catalogue.ts           The 20-stage catalogue (seed data for the Stage table)
    engine.ts              Applicability, routing, decisions, side effects
    sweeps.ts              LOI expiry, penalties, commencement deadlines, SLA alerts
  src/routes/              One router per module

web/                       React 18 + TypeScript + Vite + Tailwind
  src/lib/                 API client with token refresh, auth context, formatters
  src/lib/plain.ts         Plain-English names, explanations and glossary for every step and status
  src/components/          UI primitives, layout, StageStepper, NextStep, ActiveStagePanel
  src/pages/               One page per module
```

**Notable choices**

- SQLite has no native enums or scalar lists, so enum-ish columns are `String` (vocabulary in
  `server/src/lib/enums.ts`) and structured blobs are JSON text. The same schema works on Postgres.
- File storage sits behind a small `StorageDriver` interface (`server/src/lib/storage.ts`) so the
  demo's local `/uploads` can be swapped for S3-compatible storage without touching the routes.
- The audit log is append-only: nothing in the codebase updates or deletes an `AuditLog` row, and the
  audit route exposes read + filter only.
- Documents are versioned — re-uploading the same type on a case bumps the version rather than
  overwriting.
- Cases and users are **soft-deleted**, never removed.

---

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run build` | Type-check and build both workspaces |
| `npm run seed` | Wipe and re-seed the demo data |
| `npm run reset` | Force-reset the schema, then re-seed |
| `npm run db:studio` | Prisma Studio against the current database |
| `npm run use:postgres` / `use:sqlite` | Switch the Prisma datasource provider |

## Non-functional

Client- and server-side validation (zod on the API), pagination and server-side filtering on every
list endpoint, IST timezone, `₹` INR formatting, DD-MMM-YYYY dates, keyboard-navigable UI with
visible focus rings, responsive down to tablet, loading/empty/error states, toasts, and confirmation
dialogs on every irreversible action.
