# FCT Station — User App & Admin Website Planner

> **What this is:** the end-to-end build plan for the two pieces of software around the FCT station described in `FCT_Requirements_Specification.pdf` (Draft 1.2):
> 1. **User App** — cross-platform (Android + web) app the customer's operator uses to load, program and test each PCB on the FCT station.
> 2. **Admin Website** — the owner's portal to monitor, per customer, the number of **unique PCBs tested** (by PCB unique ID), with payments later.
>
> **Hardware is out of scope for now.** The ESP32-S3 station is replaced by a **station simulator** that behaves exactly like the real one (Section 7), so the app and website can be fully built and tested today. When the station is ready, it implements the same interface.
>
> **How to use:** give this file plus the spec PDF to an AI coding agent or developer, and execute **one phase at a time** (Section 10). Spec requirement IDs (e.g. `OPS-051`) are cited so every feature traces back to the spec.

---

## 1. The big picture

```
   CUSTOMER SITE                                      COMPANY (OWNER)
 ┌───────────────────────┐   local Wi-Fi   ┌───────────────────────────┐
 │  FCT Station          │◀──────────────▶ │  USER APP                 │
 │  ESP32-S3 + fixture   │  HTTP + WS      │  (Android / web)          │
 │  programs & tests PCB │                 │  LOAD · START · results   │
 └───────────────────────┘                 └─────────────┬─────────────┘
                                                         │ HTTPS (when online)
                                                         ▼
                                           ┌───────────────────────────┐
                                           │  BACKEND API + DATABASE   │
                                           │  + S3 (program files)     │
                                           └─────────────┬─────────────┘
                                                         │
                                                         ▼
                                           ┌───────────────────────────┐
                                           │  ADMIN WEBSITE            │
                                           │  unique boards per        │
                                           │  customer, board search   │
                                           └───────────────────────────┘
```

- The **station** does the electrical work (programming via ICP, measurements, test sequence) — unchanged from the spec.
- The **User App** is the operator's interface to the station and the bridge to the server.
- The **Backend** stores every test result and serves program files.
- The **Admin Website** reads from the backend.

---

## 2. How this plan fits the FCT spec

| Spec says | This plan does |
|---|---|
| Station hosts its own web UI (UI-001…UI-006) | The **User App** becomes the operator interface. The station keeps its TFT and tower light (HW-110) for at-a-glance status. The station's built-in web UI becomes optional. |
| Station works fully offline (HW-111, IOT-010) | The User App programs and tests with **no internet**; results queue on the phone and sync later. |
| Operator workflow & state machine (Section 10, OPS-001) | The app's Run screen mirrors the station state machine, extended with the LOAD/PROGRAMMED states from your workflow (Section 4.2). |
| Buttons lit only when actionable (OPS-020, OPS-021) | App buttons are enabled strictly by station state: LOAD, START, CONFIRM, ABORT, ACK. |
| Wrong-variant catch before power (OPS-012, OPS-013, TFW-041) | LOAD is blocked if the board-ID reading doesn't match the JSON plan's `board_id_ohms` window. |
| Plan integrity & traceability (TFW-022, TFW-023, TFW-070) | App computes SHA-256 of the JSON plan and program file; both hashes stored with every result. |
| Plan validation at load (TFW-024, TFW-030) | App validates the JSON before sending it; invalid plans never reach the station. |
| Result record contents (IOT-002) | The result record schema (Section 6.4) contains every IOT-002 field. |
| Fixture faults not counted as board failures (OPS-053) | Fixture faults are stored but excluded from all yield and board counts. |
| Retest governance (OPS-080 – OPS-083) | Attempt number tracked per PCB UID; max 2 retests, then supervisor approval. First-pass yield uses attempt 1 only. |
| Pass token = MCU lock bit (OPS-060) | Result record includes `locked: true/false`; website can show boards that failed or were never locked. |
| Dashboard metrics (IOT-014, IOT-015) | Website Phase 1: unique boards, FPY, failure Pareto. Later: Cpk, relay trends, LED Vf histograms. |
| MS51 unique ID (DFW-035 `DEVICE_ID`, open item #5) | The PCB unique ID is the MCU UID read by the station. |

---

## 3. Tech stack (decided)

TypeScript across app, website, backend and simulator, so the same schemas (JSON plan, station events, result record) are shared everywhere.

| Part | Technology |
|---|---|
| **User App** | **Expo (React Native) + TypeScript** — one codebase for Android and web (iOS can be added later from the same code with no rewrite). Expo Router (navigation), Tamagui (UI + light/dark themes), TanStack Query (server data), Zustand (station/session state), expo-sqlite (offline result queue + history), expo-secure-store (tokens), expo-document-picker (file selection). Releases via EAS Build, hotfixes via EAS Update. |
| **Admin Website** | **Next.js (App Router) + TypeScript**, Tailwind CSS, shadcn/ui, TanStack Table, Recharts |
| **Backend** | **NestJS + TypeScript**, **PostgreSQL** via Prisma, **Redis + BullMQ** (background jobs), **AWS S3** (program files, plans, exports), OpenAPI → generated typed client |
| **Station simulator** | Node.js + Fastify + WebSocket |
| **Shared schemas** | Zod (types + runtime validation), exported as JSON Schema for the ESP32 firmware team |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Hosting** | AWS Mumbai (`ap-south-1`): ECS Fargate (API + workers), RDS PostgreSQL, ElastiCache Redis, S3 + KMS, CloudFront; Terraform |
| **Quality** | GitHub Actions CI, Jest/Vitest, Maestro (app E2E), Playwright (website E2E), Sentry, OpenTelemetry |
| **Payments (future)** | Razorpay (India), Stripe (international) |

### Repository layout
```
fct-platform/
├── apps/
│   ├── mobile/         # User App (Expo: Android + web)
│   ├── admin/          # Admin Website (Next.js)
│   ├── api/            # Backend (NestJS + workers)
│   └── station-sim/    # ESP32-S3 station simulator
├── packages/
│   ├── contracts/      # Zod schemas: test plan, station API, events, result record
│   ├── api-client/     # Generated backend client
│   └── station-client/ # Typed station client (HTTP + WebSocket)
├── infra/              # docker-compose (local), terraform (cloud)
└── docs/               # ADRs, station-interface.md for firmware team, runbooks
```

---

## 4. PART A — User App

### 4.1 Per-PCB workflow (your requirements, aligned with the spec)

```
 Place PCB, close lid
        │
        ▼
 ① BOARD DETECTED ── station reads board-ID resistor (variant) + PCB unique ID (MCU UID)
        │            app shows: UID, variant, attempt number for this UID
        ▼
 ② LOAD ─────────── operator selects 2 files: program file + JSON plan
        │            app validates JSON, checks variant match, computes SHA-256 of both
        │            both files sent to ESP32-S3
        │            ESP32-S3 programs the PCB (ICP erase → program → verify)
        │            ESP32-S3 WIPES the program file, KEEPS the JSON
        ▼
 ③ START ────────── ESP32-S3 runs the full test sequence from the JSON
        │            app shows live progress by phase (A → B0 → B1 → C), live steps,
        │            CONFIRM prompts for visual checks, ABORT always available
        ▼
 ④ RESULT ───────── PASS / FAIL / FIXTURE FAULT
        │            ESP32-S3 WIPES its memory (JSON too) — PCB KEEPS its program
        │            signed result record saved in app → uploaded to server
        ▼
 Next PCB (app re-sends the same files; station wiped each time)
```

**Step ① — Unique ID.** When a PCB is placed and the lid closed, the station reads the MCU unique ID and the board-ID resistor, and reports both. The UID is read again after programming and must match.

**Step ② — LOAD.**
- **Initial stage (Phases 1–4):** the two files are picked from the phone/computer.
- **Later (Phase 5):** files come from the server; program files are stored in **AWS S3** and delivered encrypted so the operator never handles raw firmware.
- The ESP32-S3 holds the program **in RAM only**, programs and verifies the PCB, then zeroes the program buffer. The JSON plan stays in RAM for the test.

**Step ③ — START.** Enabled only after programming is verified. The station runs every test in the JSON `sequence`.

**Step ④ — Completion.** The station wipes all working memory. The PCB's program is never erased. On PASS the MCU lock bit is set (DFW-045, OPS-060).

### 4.2 Station state machine (shared by station, simulator and app)

| State | Meaning | Buttons enabled in app |
|---|---|---|
| `IDLE` | No board / lid open | — |
| `ARMED` | Board present, UID + variant read | **LOAD** |
| `LOADING` | Files transferring to ESP32-S3 | ABORT |
| `PROGRAMMING` | ICP erase / write / verify | ABORT |
| `PROGRAMMED` | PCB programmed, program wiped, JSON kept | **START**, ABORT |
| `RUNNING` | Test sequence executing | ABORT |
| `AWAIT_CONFIRM` | Operator visual check (e.g. display 8.8.8.) — 60 s timeout (OPS-031) | **CONFIRM**, ABORT |
| `SAFING` | Outputs safed, memory wiped, lid releasing (OPS-040) | — |
| `PASS` | All tests passed, lock bit set | Next board (auto on lid open, OPS-052) |
| `FAIL` | A test failed | **ACK** (required before next board, OPS-051) |
| `FIXTURE_FAULT` | Station problem, not board problem | Supervisor unlock (OPS-054) |

Rules:
- Every exit from `RUNNING` passes through `SAFING` (OPS-002).
- LOAD is **disabled** if the board-ID reading is outside the plan's `board_id_ohms` window — shown as "Wrong variant for this plan" (OPS-013).
- LOAD is **disabled** if this UID has already used its 2 retests (OPS-080) — shown as "Supervisor approval needed".
- The app only changes state when the station reports it — it never assumes.

### 4.3 Screens

| Screen | What it shows / does |
|---|---|
| **Sign in** | Email + password (customer operator or supervisor). Works offline after first sign-in. Operator identity recorded in every result (OPS-090). |
| **Stations** | Paired stations, online/offline. Pair a new station by scanning its QR or entering IP + 6-digit code. |
| **Shift start** | Golden board run (OPS-091). Logged separately, excluded from counts; failure = fixture fault (OPS-092). |
| **Run** (main screen) | Station card (name, state, fixture ID). Board card (**PCB UID**, variant, attempt no.). Two file slots (**Program**, **Test plan**) with name, size, short SHA-256, ✓/✗ validation. Big **LOAD** and **START** buttons. Programming progress bar. Phase stepper A → B0 → B1 → C. Live step list with values vs limits. Wipe confirmations: "Program cleared from station ✓", "Station memory cleared ✓". |
| **Confirm** (overlay) | Visual check prompt with instruction and countdown; CONFIRM / ABORT. |
| **Result** | Big PASS (green) / FAIL (red) / FIXTURE FAULT (amber). On FAIL: failing test, measured value vs limit, ranked suspects as text (FDX-052), **ACK** button. Cycle time, UID, serial. |
| **History** | Local and synced results; search by UID; filter by verdict/date; sync badge per record. |
| **Settings** | Account, theme, sync now, diagnostics export, app version. |

### 4.4 App behaviour rules
1. **JSON validation before sending** — schema version supported (TFW-024), every limit has min < max and a unit, every referenced limit/array/`skip_to` target exists, `caps` counts match arrays (TFW-030). Errors shown in plain language.
2. **Program file checks** — allowed formats `.hex`/`.bin`, max size, SHA-256 computed.
3. **Offline-first** — every result goes into a SQLite outbox; a sync worker uploads in batches when online; records are removed only after the server confirms.
4. **Recovery** — if Wi-Fi drops or the app is closed mid-test, on reconnect the app fetches the result from the station (the station keeps signed results until the app acknowledges them).
5. **Files remembered for the next board** — the operator loads once per batch in the UI; the app re-sends to the station for each PCB (files are 16–32 KB, well under a second).

### 4.5 Visual design
Clean, industrial, high-contrast. Neutral background; colour used only for meaning, matching the spec's button colours (OPS-020): **green** START/PASS, **blue** CONFIRM, **red** ABORT/FAIL, **amber** ACK/fixture fault. Large touch targets, big status text readable at arm's length, tabular numbers for measurements, light and dark themes, identical look on Android and web.

### 4.6 Platform notes
- **Android:** allow plain HTTP only to local network addresses (network security config).
- **Station discovery:** mDNS/Bonjour (`_fct._tcp`) on Android, with manual IP + code as fallback.
- **iOS:** out of scope for now. Expo keeps the door open; adding it later needs only local-network permission, an App Store account and testing.
- **Web:** browsers block `http://` station calls from an `https://` page — serve the web build from the station itself or give the station an HTTPS certificate. Decide in Phase 3.
- Uses an Expo development build (not Expo Go).

---

## 5. PART B — Admin Website

### 5.1 Pages

| Page | Contents |
|---|---|
| **Overview** | Cards: **unique PCBs tested** (selected period), total test runs, active customers, active stations, first-pass yield. Chart: unique PCBs per day. Top customers by unique PCBs. |
| **Customers** | Table: customer, stations, **unique PCBs tested**, runs, pass/fail, first-pass yield, last activity. Period filter, search, CSV export. |
| **Customer detail** | Unique PCBs per day/week/month, stations, recent runs, failure Pareto (top failing tests), users. |
| **PCB search** | Enter a **PCB unique ID** → full history: every attempt, customer, station, operator, verdict, lock status, program hash, plan hash, measurements (TFW-023 traceability). |
| **Stations** | All stations: customer, last seen, firmware version, last sync, missing-record alerts. Register and assign stations. |
| **Test runs** | Filter by customer, station, verdict, date; open a run to see every step with value, limits and verdict. |
| **Integrity** | Missing result records (sequence gaps), rejected (tampered) records, stations not synced in N days. |
| **Files** *(Phase 5)* | Upload program files and JSON plans, versions, which customer may load which. |
| **Users & audit** | Admin users, customer accounts, audit log of admin actions. |
| **Analytics** *(Phase 7)* | Per-test Cpk, relay actuation & contact-resistance trends, LED Vf histograms with bimodality flag (IOT-014, IOT-015). |
| **Billing** *(Phase 8)* | Plans, usage (unique PCBs), invoices, payment status. |

### 5.2 Metric definitions (same everywhere)

| Metric | Definition |
|---|---|
| **Unique PCBs tested** | Count of distinct PCB UIDs with at least one test run in the period (per customer). |
| **Test runs** | All attempts, including retests. |
| **PCBs passed** | Unique PCBs whose latest attempt in the period is PASS. |
| **First-pass yield** | PASS on attempt 1 ÷ all attempt-1 runs (OPS-082). |
| **Retested PCBs** | PCBs with more than one attempt (OPS-083). |
| **Fixture faults** | Shown separately; never counted as PCB tests or failures (OPS-053). |
| Golden-board runs | Excluded from all counts (OPS-091). |

### 5.3 Rules
- Admin-only, separate subdomain, two-factor login required.
- Large exports run in the background and download via expiring links.
- Charts read pre-computed daily totals so the site stays fast with millions of results.

---

## 6. PART C — Backend (only what the app and website need)

### 6.1 Modules
`auth` (login, tokens, roles) · `customers` · `users` · `stations` · `ingest` (receive results) · `boards` (unique PCB registry) · `runs` · `stats` (daily totals) · `audit` · `files` *(Phase 5)* · `billing` *(Phase 8)*

Roles: `ADMIN` (owner), `CUSTOMER_SUPERVISOR`, `OPERATOR`.

### 6.2 Data model (main tables)

| Table | Key fields |
|---|---|
| `customers` | id, name, status, created_at |
| `users` | id, customer_id (null for admin), email, password_hash, role |
| `stations` | id (fixture ID), customer_id, public_key, firmware_version, last_seen, last_seq |
| `boards` | **uid** (primary key), variant, first_customer_id, first_tested_at, last_verdict, attempt_count |
| `test_runs` | id, station_id, **seq** (unique with station_id), customer_id, board_uid, serial, variant, attempt_no, verdict, locked, started_at, duration_ms, operator_id, program_sha256, plan_sha256, plan_version, is_golden |
| `test_steps` | run_id, step_id, block, value, unit, min, max, verdict, duration_ms, suspects (JSON) |
| `daily_stats` | customer_id, day, runs, unique_boards, passed, failed, fixture_faults |
| `sync_gaps` | station_id, from_seq, to_seq, detected_at, resolved_at |
| `audit_log` | actor, action, target, details, time |

### 6.3 Receiving results (exactly-once, tamper-proof)
`POST /v1/ingest/runs` — called by the app with up to 100 records:
1. Check the user belongs to the customer that owns the station.
2. **Verify the station's digital signature** on each record; reject and log any that fail.
3. Insert with a unique key on `(station_id, seq)` — uploading the same record twice never double-counts.
4. Create/update the `boards` row for the PCB UID.
5. Detect missing sequence numbers → `sync_gaps` alert.
6. Reply per record: `accepted` / `duplicate` / `rejected`. The app clears a record only on accepted/duplicate.
7. Queue a job to refresh `daily_stats`.

### 6.4 Result record (created and signed by the station, contains all IOT-002 fields)
```json
{
  "recordId": "uuid",
  "stationId": "FCT-0007",
  "seq": 1042,
  "boardUid": "4D53513100A1B2C3D4E5F601",
  "serial": "WLC24090001",
  "variant": "WLC-ECO",
  "attemptNo": 1,
  "verdict": "PASS",
  "locked": true,
  "isGolden": false,
  "startedAt": "2026-09-23T10:41:07Z",
  "durationMs": 71240,
  "operatorId": "OP-12",
  "planVersion": "0.1.0",
  "planSha256": "…",
  "programSha256": "…",
  "steps": [
    { "id": "S010", "block": "LED_SCAN", "value": 1.72, "unit": "V",
      "min": 1.45, "max": 2.00, "verdict": "PASS", "ms": 40, "suspects": [] }
  ],
  "signature": "ed25519:…"
}
```

### 6.5 Main API endpoints
```
Auth       POST /v1/auth/login | /refresh | /logout
App        GET  /v1/me · GET /v1/stations · POST /v1/ingest/runs
           GET  /v1/boards/:uid/attempts        (retest count before LOAD, when online)
           GET  /v1/files/releases              (Phase 5: files this customer may load)
Admin      GET  /v1/admin/overview?from&to
           GET  /v1/admin/customers?from&to     (with unique PCB counts)
           GET  /v1/admin/customers/:id/stats?from&to&by=day|week|month
           GET  /v1/admin/boards/:uid           (full PCB history)
           GET  /v1/admin/runs?filters&cursor
           GET  /v1/admin/stations · POST /v1/admin/stations · PATCH /v1/admin/stations/:id
           POST /v1/admin/exports/runs          (background CSV)
           GET  /v1/admin/integrity             (gaps, rejected records)
```

### 6.6 Customer data separation
Every customer-owned row carries `customer_id`; every query is forced to filter by the logged-in user's customer; PostgreSQL row-level security as a second layer; automated tests confirm customer A can never read customer B's data.

---

## 7. PART D — Station simulator and interface (so no hardware is needed)

### 7.1 Station interface (the contract the real ESP32-S3 will implement later)
| Call | Purpose |
|---|---|
| `GET /v1/info` | Station ID, firmware version, public key, state |
| `POST /v1/pair` | Pairing code → access token for the app |
| `GET /v1/board` | Board present, **PCB UID**, board-ID resistance |
| `POST /v1/sessions` | Start a session for the current board |
| `PUT /v1/sessions/:id/plan` | Upload JSON plan |
| `PUT /v1/sessions/:id/program` | Upload program file (with SHA-256); station then programs the PCB |
| `POST /v1/sessions/:id/start` | START the test |
| `POST /v1/sessions/:id/confirm` | Operator CONFIRM |
| `POST /v1/sessions/:id/abort` | ABORT |
| `POST /v1/sessions/:id/ack` | ACK after FAIL |
| `GET /v1/records?afterSeq=N` · `POST /v1/records/ack` | Recover / acknowledge signed results |
| `WS /v1/events` | Live events: state, board, upload progress, programming progress, **wiped**, step start/result, confirm request, completed, error |

### 7.2 Memory rules (station and simulator must both follow)
1. Program file kept **in RAM only**, never saved to station flash/SD.
2. Program buffer zeroed right after programming (success or failure) → event `wiped: program`.
3. JSON plan zeroed when the session ends → event `wiped: plan`.
4. ABORT, error, board removal, or 5-minute idle → everything wiped.
5. **The PCB's program is never erased** by any wipe.
6. Signed result records (no firmware inside) kept until the app acknowledges them.

### 7.3 Simulator features
- Implements every call and event above with realistic timing (programming ~5 s, test ~60 s).
- Runs whatever JSON plan it receives, step by step, so real plans (e.g. `WLC-ECO.json`) drive it.
- Control page: place/remove board, choose a scenario — all pass · programming verify fail · LED open · wrong LED colour · relay contact high · wrong variant · fixture fault · confirm timeout · board removed mid-test · Wi-Fi drop mid-test.
- Signs records with its own key; keeps a persistent sequence counter.

---

## 8. Scalability

| Target (v1) | Design choice |
|---|---|
| 1,000 customers, 5,000 stations | Stateless API containers that scale horizontally on ECS |
| 1M test runs / month | Batched, idempotent ingest; indexed `test_runs`; monthly table partitioning when needed |
| Fast dashboards | Pre-computed `daily_stats`, Redis caching, cursor pagination |
| Heavy work off the request path | BullMQ workers for stats, exports, emails |
| Server outage | App and station keep working offline; nothing lost |
| Growth beyond v1 | Read replicas; move measurement analytics to a time-series store in Phase 7 if needed |

## 9. Security

| Risk | Protection |
|---|---|
| Customer sees another customer's data | Enforced customer filter + row-level security + tests |
| Fake or edited results | Station-signed records verified by the server |
| Double counting | Unique `(station_id, seq)` |
| Hidden/missing results | Sequence-gap alerts |
| Firmware copied from the station | RAM-only, zeroed after programming |
| Firmware copied from the phone (Phase 5) | Per-station encrypted file packages; app never sees plain firmware |
| Unknown app controlling a station | Pairing code + station token |
| Account attacks | Strong password hashing, rate limits, short-lived tokens, 2FA for admins |
| Data at rest | Encrypted database and S3 (KMS), private buckets |

---

## 10. Phases

Each phase ends with a demo and must pass its acceptance checks before the next starts.

### Phase 0 — Setup (1 week)
- Monorepo, shared config, local docker-compose (Postgres, Redis, MinIO).
- `packages/contracts`: JSON plan schema + validator (TFW-030 rules), station API, events, state machine, result record.
- CI: lint, type-check, test, build on every pull request.

✅ All services start with one command; contract tests pass.

### Phase 1 — Station simulator (1 week)
- Everything in Section 7; typed `station-client`; generate `docs/station-interface.md` for the firmware team.

✅ A script completes pair → board → LOAD → program → START → result for every scenario, with the correct wipe events every time.

### Phase 2 — Backend core (2 weeks)
- Auth + roles, customers, users, stations, ingest (Section 6.3), boards, runs, daily stats worker, audit log, customer data separation, OpenAPI client.

✅ Same upload twice = same counts · tampered record rejected · sequence gap detected · cross-customer access blocked.

### Phase 3 — User App (3 weeks)
- All screens in 4.3; state-driven buttons (4.2); JSON + program checks; live progress; CONFIRM/ACK flows; retest limit; offline outbox + sync; recovery; Android and web builds.
- Maestro end-to-end tests against the simulator.

✅ An operator tests 20 boards on Android and web with no help · airplane mode mid-test loses nothing · wrong-variant plan blocks LOAD · FAIL requires ACK · wipe confirmations shown for every board.

### Phase 4 — Admin Website (2 weeks)
- Pages in 5.1 except Files, Analytics, Billing; metric definitions in 5.2; CSV export; 2FA.
- Playwright end-to-end tests.

✅ The owner answers "how many unique PCBs did customer X test last month, and which IDs?" in under 30 seconds · PCB search shows full history · pages load in < 0.5 s with 1M results.

### Phase 5 — Load files from the server (2 weeks)
- Admin uploads program files + JSON plans; versions; per-customer access.
- Program files stored in **S3**; encrypted per station; app downloads and forwards without seeing plain firmware.
- App LOAD shows the files available to the customer; local-file loading kept only for development.

✅ A file prepared for station A is rejected by station B · removing a customer's access blocks new loads.

### Phase 6 — Hardening & launch (2–3 weeks)
- Load testing, security review, backups + restore drill, alerts, runbooks.
- Cloud setup with Terraform; Play Store and web release; pilot with 1–2 customers.

✅ Pilot runs 2 weeks with zero lost or double-counted results.

### Phase 7 — Production analytics (later)
- Per-test Cpk, relay timing and contact-resistance trends, LED Vf histograms with bimodality alerts, drift by fixture (IOT-014, IOT-015).

### Phase 8 — Payment gateway (future)
- Billing by unique PCBs tested (or subscription); Razorpay first, Stripe for international; invoices in the website and app.

**Parallel — Real station:** when hardware is ready, the ESP32-S3 firmware implements `docs/station-interface.md` and must pass the same simulator test suite unchanged.

**Timeline:** Phases 0–6 ≈ **14 weeks**.

---

## 11. Decisions to confirm

| # | Question | Default in this plan |
|---|---|---|
| 1 | "Program saved in S3" = **AWS S3 cloud storage** (not the ESP32-S3)? | Yes, cloud storage |
| 2 | The spec tests with a **test firmware** and then flashes **production firmware** (DFW-044). Your flow loads **one** program file. Keep one file, or allow an optional third "test firmware" file? | One program file; optional test-firmware slot added later if needed |
| 3 | Re-send files per PCB, or keep the program on the station for a batch? | Per PCB (station wiped every time) |
| 4 | If the MCU UID isn't readable (spec open item #5), use a barcode/label ID? | Yes, same field |
| 5 | Keep the station's built-in web UI (spec Section 11) alongside the app? | Optional; app is primary |
| 6 | Billing unit: unique PCB, test run, or subscription? | Unique PCB |

---

## 12. Instructions for the building agent
1. Build **one phase at a time**, starting at Phase 0.
2. Before each phase, restate its tasks and acceptance checks and list any unclear points.
3. All shared types live in `packages/contracts` — never copy a schema into an app.
4. Never weaken the wipe rules (7.2), exactly-once ingest (6.3) or customer data separation (6.6) to make a test pass.
5. Cite the spec requirement ID in code comments where a feature implements one.
6. End each phase with: what was built, how to run it, test results, and any deviations from this plan.
