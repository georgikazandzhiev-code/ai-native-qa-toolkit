---
description: The invented example app's scenario inventory — each E2E, Functional and API spec, what it covers, intentional gaps; the model for your repo's own list
---

# Test Standards — Reference

Every catalog in this file is the invented example app's. Your repo's own lists belong in its `CLAUDE.md` or repo-context skill.

Companion file to [`SKILL.md`](SKILL.md). It shows the shape of a scenario inventory: what each spec covers and which gaps are intentional. Keep your own list in that shape, so authors don't duplicate coverage and reviewers can spot what's missing for a new feature. Update it in the same edit batch as adding or removing a spec.

## Contents

- [Tag → npm script mapping](#tag--npm-script-mapping)
- [Scenario inventory — E2E specs](#scenario-inventory--e2e-specs)
- [Scenario inventory — Functional specs](#scenario-inventory--functional-specs)
- [Scenario inventory — API specs](#scenario-inventory--api-specs)
- [Setup specs](#setup-specs)
- [Known gaps (intentional)](#known-gaps-intentional)
- [How to update this catalog](#how-to-update-this-catalog)

---

## Tag → npm script mapping

| Tag | npm script | What runs |
|---|---|---|
| `@critical` | `npm run app-critical` | 3–5 must-pass-before-anything-else tests |
| `@smoke` | `npm run app-smoke` | Critical-path UI flows — login, landing, navigation |
| `@sanity` | `npm run app-sanity` | Quick post-deploy read-only verification |
| `@regression` | `npm run app-regression` | Functional regression — largest bucket. |
| `@api` | `npm run app-api` | API contract + schema validation |
| `@integration` | `npm run app-integration` | Cross-component integration |
| `@e2e` | `npm run app-e2e` | End-to-end UI journey (create → verify → edit → delete) |
| (union) | `npm run app-all` | Full nightly / pre-merge |

Tag casing must match `package.json` greps exactly, and every tag in the example app is lowercase, so a mis-cased tag such as `@Regression` would never run. Your repo's own tags and scripts belong in its `CLAUDE.md` or repo-context skill.

---

## Scenario inventory — E2E specs

In the example app, these live under `tests/app/e2e/`. Each is one test per flow with multiple `test.step` phases. Tag: `@e2e` unless noted.

| Spec | Covers |
|---|---|
| `http-job-crud.spec.ts` | Create / verify / edit / delete HTTP jobs for each method (GET, HEAD, DELETE, POST, PUT) + run-interval matrix. Includes the expanded-view-loads stub (one `test.step` of ~20 lines). |
| `export-job.spec.ts` | Create / verify / edit / delete `export` job + run-interval matrix. |
| `export-job-view.spec.ts` | **⚠ ANTI-PATTERN — do not replicate for new job types.** Creates `export` job through UI → expands row → verifies expanded view structure. Overlaps with `export-job-expanded-view.spec.ts` (functional). Not a template. See [`selectors/recipes.md` § 18](../selectors/recipes.md). |
| `sftp-job-crud.spec.ts` | Create / verify / edit / delete SFTP job + expanded-view-loads stub. |
| `stream-job-crud.spec.ts` | Same pattern for stream jobs + expanded-view-loads stub. |
| `email-job-crud.spec.ts` | Email-job CRUD. |
| `webhook-job-crud.spec.ts` | Webhook-job CRUD (outbound callback jobs). |
| `login-smoke.spec.ts` | Login page elements, forgot-password link, successful login. **Tag:** `@smoke`. |
| `login-negative.spec.ts` | Invalid credentials, empty fields. |
| `forgot-password.spec.ts` | Password reset flow (extracts link from Mailpit email). |
| `terms-and-conditions.spec.ts` | Accept / decline flow. |
| `initial-user-registration.spec.ts` | First-time user setup. |
| `run-stats-page-flow.spec.ts` | Run-stats page end-to-end flow (job pick → run-stat pick → chart render). |

---

## Scenario inventory — Functional specs

In the example app, these live under `tests/app/functional/`. One test per validation scenario, `beforeEach` navigates to the form. Tag: `@regression` unless noted.

### Form validation specs (per job type)

| Spec | Covers |
|---|---|
| `http-create-edit-job.spec.ts` | Type selection, navigation, form validation, method-specific fields, required fields, boundaries. |
| `export-create-edit-job.spec.ts` | Required fields, name / target boundaries, timeout, run intervals, `export` settings accordion, record-run-steps toggle, max recorded run steps, worker selection, navigation. |
| `stream-create-edit-job.spec.ts` | Same validation pattern for stream jobs. |
| `email-create-edit-job.spec.ts` | Same validation pattern for email jobs. |
| `webhook-create-edit-job.spec.ts` | Same validation pattern for webhook jobs. |

### Detail-view specs (one per job type)

Pattern: API-seeded job in `beforeAll`, semantic assertions on expanded-row UI, `afterAll` deletes via API. See [`selectors/recipes.md` § 18](../selectors/recipes.md) for the full design pattern.

| Spec | Covers |
|---|---|
| `export-job-expanded-view.spec.ts` | Expanded row structure, header controls (worker location, refresh, auto-refresh), tabs state (Run Stats active, Run Steps / Timeline disabled), run-stat card labels, record statistics card, empty state, collapse / re-expand, type isolation (HTTP ≠ `export` view). Split into 8 granular tests with per-scenario Qase IDs. The other detail-view specs consolidate scenarios into fewer tests; both shapes are valid. |
| `sftp-job-detail-view.spec.ts` | SFTP expanded row — 3 run-stat cards (**Transfer Result**, **Files Transferred**, **Transfer Time**) with regex value validation, numeric validity (`>0ms` for Transfer Time), decorative icon presence per card; header controls (worker selector + non-empty name, manual refresh, auto-refresh default ON, `Updated HH:MM[:SS]` timestamp); Transfer Timing card; stacked bar with `0ms` left scale + right total-ms scale label and exactly 2 colored segments; **conditional inline ms labels** via `verifyInlineMsLabels` (frontend's >10% threshold); legend with 2 dot+label+ms items in correct visual order (Session Setup before File Transfer); manual refresh via network-wait; auto-refresh toggle off→on flow; explicit absence of the HTTP-only sections (Response Time History, timeframe selector); collapse / re-expand re-verification. **Intentionally not tested:** Radix tooltip hover interactions (label text already in legend). |
| `stream-job-detail-view.spec.ts` | Stream-job expanded row — 4 run-stat cards (**Stream State**, **Messages Consumed**, **Consumer Lag**, **Batch Time**) with regex value validation, numeric validity (`>0ms` for Batch Time); header controls; Consumption Timing card with stacked bar + 4 colored segments; conditional inline ms labels; legend with 4 dot+label+ms items in order (Subscribe → Fetch → Process → Ack); Message Statistics card + 7 labels (Consumed, Acknowledged, Failed, Redelivered, Avg Size, Max Lag, Avg Process Time); Throughput card + 5 labels (Messages/sec, Bytes/sec, Fetch Rate, Ack Rate, Peak Rate); manual refresh; auto-refresh toggle; explicit absence of timeframe selector; collapse / re-expand. Reuses generic parameterized timing helpers on `JobsPage` scoped to `streamTimingBreakdownCard` — no stream-specific wrappers needed. **Precondition:** targets a pre-seeded job named by `STREAM_FIXTURE_JOB_NAME` (no default committed). If it is missing, `beforeAll` must **fail fast** with a clear message. A self-skip reads as green, so a spec that skips here is drift. **Intentionally not tested:** Radix tooltips, Message Statistics / Throughput value formats. |
| `http-job-detail-view.spec.ts` | HTTP/S expanded row — run-stat cards (**Status Code**, **Response Time**, **Response Size**), header controls, timing breakdown (Connect → TLS → Waiting → Download) with tooltips, response time history with timeframe toggle and legend averages, collapse / re-expand. |
| `email-job-detail-view.spec.ts` | Email-job expanded row — email delivery card, semantic value assertions, header controls, collapse / re-expand. |

### Page-level specs

| Spec | Covers |
|---|---|
| `jobs-page.spec.ts` | Jobs list page — page chrome, table interactions. |
| `workers-page.spec.ts` | Workers-page layout (status cards, toolbar, table columns, pagination); status-card filtering (Total / Online / Offline / Provisioning); sorting (Name / Status / Location / Region); pagination (page size, next/prev, last page); status filter dropdown; kind filter (Self-hosted / Managed); search by name / location; combined filters; special characters; filter preservation after sheet overlay; delete dialog; register-worker sheet (fields, validation, cancel / close); view details; edit sheet (pre-filled, read-only ID, cancel / close); managed-worker action restrictions (read-only). |
| `dashboard-page.spec.ts` | Landing-page structure (greeting + Jobs / Workers / Type-Breakdown / Quick-Actions sections); sidebar Dashboard link round-trip; Jobs stat cards (5× title + numeric, internal sum consistency, total vs Jobs API `totalElements`); Jobs card navigation with `?jobStatus=<value>` and filter-label assertion (looped per card); Workers stat cards (4× title + numeric, total vs Workers API `totalElements`); Workers card navigation with `?status=<value>` (looped per card); Type Breakdown (set of visible bars matches API `count > 0` types, aria-label count per bar, per-type click → `?type=<value>`); Quick Actions (3× title + description, 3-step combined navigation test + `href` attribute assertion); empty-tenant state (if the test auto-skips when the tenant has jobs, that is drift: seed an empty tenant in setup, or fail fast, never skip). Read-only spec — no job / worker creation or cleanup. |
| `run-stats-page.spec.ts` | Run-stats page — job picker, run-stat selection, chart toolbar, expanded dialog. |

---

## Scenario inventory — API specs

In the example app, these live under `tests/app/api/`. One spec per API resource. Tag: `@api`. The deep authoring methodology (negative-matrix, status-code coverage, per-verb playbook) lives in the [`api-testing`](../api-testing/SKILL.md) skill — this is just an index.

| Spec | Resource |
|---|---|
| `admin-tenants.spec.ts` | `POST/GET/PATCH/DELETE /api/v1/admin/tenants(/:id)` — admin-realm token. |
| `admin-realms.spec.ts` | `POST/PATCH /api/v1/admin/realms` — admin-realm token (no path param). |
| `admin-users.spec.ts` | `POST/GET/PATCH/DELETE /api/v1/admin/tenant/:tenant/user(s)`. |
| `workers.spec.ts` | `POST/GET/PATCH/DELETE /api/v1/workers(/:id)` — tenant token. |
| `http-job.spec.ts` | HTTP job CRUD via `/api/v1/jobs`. |
| `email-job.spec.ts` | Email-job CRUD. |
| `job-run-stats.spec.ts` | `GET /api/v1/jobs/:id/run-stats` (run-stat definitions per job). |
| `run-stats-aggregate.spec.ts` | `POST /api/v1/run-stats/aggregate` (aggregated run-stat values query). |
| `run-stats-query.spec.ts` | `GET /api/v1/run-stats` query endpoint. |
| `cross-tenant-isolation.spec.ts` | Cross-tenant isolation matrix — token from tenant A cannot read/write tenant B's resources. |
| `cross-tenant-run-stats-isolation.spec.ts` | Cross-tenant isolation specific to run-stats queries. |
| `e2e-tenant-onboarding-flow.spec.ts` | Multi-endpoint onboarding API flow — create tenant + invite user + verify Mailpit email + UUID immutability + multi-user emails. **Tag:** `@api` (an API flow, not a UI journey). |

---

## Setup specs

In the example app, setup specs live at `tests/app/`. Filename pattern: `*.setup.ts`. No tag.

| Spec | What it generates |
|---|---|
| `login.setup.ts` | Storage states (`.auth/app/<persona>Session.json`) via Keycloak UI login + API tokens via Keycloak admin client, written into `process.env.USER_ACCESS_TOKEN_*` (the setup project's one sanctioned touch of `process.env`; specs read them via `tokens.full()` / `.admin()` / `.zero()` from `config/env.ts`). Runs first; downstream projects (`app-chromium`, `api`, `keycloak`) depend on it. |

---

## Known gaps (intentional)

These are the example app's intentional gaps. Track your repo's own the same way, so reviewers don't ask "why isn't this tested?" — and so authors don't accidentally fill them without checking why they're open.

- **Worker selector switching not tested** in any detail-view spec — requires multi-worker setup (≥ 2 active workers per tenant). Add the test once a helper can seed more than one worker per tenant.
- **Radix tooltip hover interactions** in detail-view specs — not an AC requirement; label text already visible verbatim in the legend; hover + Radix pointer-event timing is flaky under Playwright.
- **Stream-job Message Statistics / Throughput value formats** — too many units (integers, B/KB/MB, B/s, ms) and low user-impact if slightly malformed.
- **`tests/app/e2e/jobs-service/jobs/export-job-view.spec.ts`** — anti-pattern; it overlaps the functional `export-job-expanded-view.spec.ts`. Don't replicate the layout for new job types. See [`selectors/recipes.md` § 18](../selectors/recipes.md).

**Not a gap — disabled by a bug.** If the backend creates a tenant without a primary user (an onboarding acceptance criterion), write the test in the onboarding-flow spec (`e2e-tenant-onboarding-flow.spec.ts` in the example app), comment it out under `// TODO: FIXME: <TICKET>`, and report it.

---

## How to update this catalog

When adding or removing a spec, update your repo's catalog in the same edit batch:

1. New spec → add a row to the matching section (E2E / Functional / API / Setup).
2. Removed spec → delete the row.
3. Spec scope expanded → update the "Covers" cell to reflect the new scenarios.
4. New intentional gap → add a bullet to § Known gaps with the rationale.

Catalog drift between the list and the real specs is the leading cause of authors duplicating coverage that already exists. Search your repo's spec folders for an existing spec before you add a "new" one.
