---
description: Test-suite scenario inventory — every E2E and Functional spec, what it covers, known gaps
---

# Test Standards — Reference

Companion file to [`SKILL.md`](SKILL.md). This catalogs **what's already tested** and what's intentionally gapped, so authors don't duplicate coverage and reviewers can spot what's missing for a new feature. Update this file in the same edit batch as adding or removing a spec.

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
| `@App-Critical` | `npm run app-critical` | 3–5 must-pass-before-anything-else tests |
| `@App-Smoke` | `npm run app-smoke` | Critical-path UI flows — login, landing, navigation |
| `@App-Sanity` | `npm run app-sanity` | Quick post-deploy read-only verification |
| `@App-regression` | `npm run app-regression` | Functional regression — largest bucket. **Lowercase `regression` — the only non-Title-case tag** |
| `@App-API` | `npm run app-api` | API contract + schema validation |
| `@App-Integration` | `npm run app-integration` | Cross-component integration |
| `@App-E2E` | `npm run app-e2e` | End-to-end UI journey (create → verify → edit → delete) |
| (union) | `npm run app-all` | Full nightly / pre-merge, single worker |

Tag casing must match `package.json` greps exactly: Title-case for every tag **except** `@App-regression`, which is lowercase (`app-regression` and `app-all` both grep the lowercase form). The overwhelming majority of specs use `@App-regression` (~398 occurrences across ~34 files); zero tests use Title-case `@App-Regression`, and a Title-case tag would never run.

---

## Scenario inventory — E2E specs

Live under [`tests/app/e2e/`](../../../tests/app/e2e/). Each is one test per flow with multiple `test.step` phases. Tag: `@App-E2E` unless noted.

| Spec | Covers |
|---|---|
| [`http-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/http-synthetic-monitor-crud.spec.ts) | Create / verify / edit / delete HTTP monitors for each method (GET, HEAD, DELETE, POST, PUT) + check-interval matrix. Includes the expanded-view-loads stub (one `test.step` of ~20 lines). |
| [`icmp-synthetic-monitor.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) | Create / verify / edit / delete ICMP monitor + check-interval matrix. |
| [`icmp-synthetic-monitor-view.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor-view.spec.ts) | **⚠ ANTI-PATTERN — do not replicate for new monitor types.** Creates ICMP monitor through UI → expands row → verifies expanded view structure. Overlaps with `icmp-monitor-expanded-view.spec.ts` (functional). Retained for historical coverage; not a template. See [`selectors/recipes.md` § 18](../selectors/recipes.md). |
| [`tcp-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/tcp-synthetic-monitor-crud.spec.ts) | Create / verify / edit / delete TCP monitor + expanded-view-loads stub. |
| [`websocket-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/websocket-synthetic-monitor-crud.spec.ts) | Same pattern for WebSocket monitors + expanded-view-loads stub. |
| [`dns-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/dns-synthetic-monitor-crud.spec.ts) | DNS monitor CRUD. |
| [`mcp-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/mcp-synthetic-monitor-crud.spec.ts) | MCP (AI/LLM health) monitor CRUD. |
| [`login-smoke.spec.ts`](../../../tests/app/e2e/tenant-service/login-smoke.spec.ts) | Login page elements, forgot-password link, successful login. **Tag:** `@App-Smoke`. |
| [`login-negative.spec.ts`](../../../tests/app/e2e/tenant-service/login-negative.spec.ts) | Invalid credentials, empty fields. |
| [`forgot-password.spec.ts`](../../../tests/app/e2e/tenant-service/forgot-password.spec.ts) | Password reset flow (extracts link from Mailpit email). |
| [`terms-and-conditions.spec.ts`](../../../tests/app/e2e/tenant-service/terms-and-conditions.spec.ts) | Accept / decline flow. |
| [`initial-user-registration.spec.ts`](../../../tests/app/e2e/tenant-service/initial-user-registration.spec.ts) | First-time user setup. |
| [`metrics-page-flow.spec.ts`](../../../tests/app/e2e/monitoring-service/metrics/metrics-page-flow.spec.ts) | Metrics page end-to-end flow (host pick → metric pick → chart render). |

---

## Scenario inventory — Functional specs

Live under [`tests/app/functional/`](../../../tests/app/functional/). One test per validation scenario, `beforeEach` navigates to the form. Tag: `@App-regression` unless noted.

### Form validation specs (per monitor type)

| Spec | Covers |
|---|---|
| [`http-create-edit-monitor.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/http-create-edit-monitor.spec.ts) | Type selection, navigation, form validation, method-specific fields, required fields, boundaries. |
| [`icmp-create-edit-monitor.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/icmp-create-edit-monitor.spec.ts) | Required fields, name / target boundaries, timeout, check intervals, ICMP settings accordion, traceroute toggle, max hops, probe selection, navigation. |
| [`websocket-create-edit-monitor.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/websocket-create-edit-monitor.spec.ts) | Same validation pattern for WebSocket. |
| [`dns-create-edit-monitor.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/dns-create-edit-monitor.spec.ts) | Same validation pattern for DNS. |
| [`mcp-create-edit-monitor.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/mcp-create-edit-monitor.spec.ts) | Same validation pattern for MCP. |

### Detail-view specs (one per monitor type)

Pattern: API-seeded monitor in `beforeAll`, semantic assertions on expanded-row UI, `afterAll` deletes via API. See [`selectors/recipes.md` § 18](../selectors/recipes.md) for the full design pattern.

| Spec | Covers |
|---|---|
| [`icmp-monitor-expanded-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/icmp-monitor-expanded-view.spec.ts) | Expanded row structure, header controls (probe location, refresh, auto-refresh), tabs state (Metrics active, Traceroute / Path disabled), metric card labels, packet statistics card, empty state, collapse / re-expand, type isolation (HTTP ≠ ICMP view). Split into 8 granular tests with per-scenario Qase IDs — stylistic predecessor to the current consolidated pattern; both shapes valid. |
| [`tcp-monitor-detail-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/tcp-monitor-detail-view.spec.ts) | TCP expanded row — 3 metric cards (**Port Available**, **DNS Lookup**, **TCP Connect**) with regex value validation, numeric validity (`>0ms`), decorative icon presence per card; header controls (probe selector + non-empty name, manual refresh, auto-refresh default ON, `Updated HH:MM[:SS]` timestamp); Connection Timing card; stacked bar with `0ms` left scale + right total-ms scale label and exactly 2 colored segments; **conditional inline ms labels** via `verifyInlineMsLabels` (frontend's >10% threshold); legend with 2 dot+label+ms items in correct visual order (DNS Lookup before TCP Connect); manual refresh via network-wait; auto-refresh toggle off→on flow; explicit absence of struck-through AC items (Service Responding, Status Code, TLS Handshake, Total Response, timeframe selector, Response Time History); collapse / re-expand re-verification. **Intentionally not tested:** Radix tooltip hover interactions (label text already in legend). |
| [`websocket-monitor-detail-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/websocket-monitor-detail-view.spec.ts) | WebSocket expanded row — 4 metric cards (**Status**, **Connection Time**, **Message RTT**, **Success Rate**) with regex value validation, numeric validity (`>0ms` for Connection Time + Message RTT); header controls; Connection Timing Breakdown card with stacked bar + 4 colored segments; conditional inline ms labels; legend with 4 dot+label+ms items in order (DNS Lookup → TCP Connect → TLS Handshake → WS Upgrade); Message Statistics card + 7 labels (Sent, Received, Failed, Disconnects, Avg Size, Min RTT, Max RTT); Throughput card + 5 labels (Messages/sec, Bandwidth, Send Rate, Recv Rate, Send Time); manual refresh; auto-refresh toggle; explicit absence of timeframe selector; collapse / re-expand. Reuses generic parameterized timing helpers on `SyntheticsPage` scoped to `wsTimingBreakdownCard` — no WS-specific wrappers needed. **Fixture exception:** targets a pre-seeded monitor (`"[todor] postman wss"`, overridable via `WS_FIXTURE_MONITOR_NAME` env var); skips with clear message via `listSynthetics` if missing. **Intentionally not tested:** Radix tooltips, Message Statistics / Throughput value formats. |
| [`http-monitor-detail-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/http-monitor-detail-view.spec.ts) | HTTP/S expanded row — metric cards, header controls, timing breakdown with tooltips, response time history with timeframe toggle and legend averages, "Follow Redirects" exclusion, collapse / re-expand. |
| [`dns-monitor-detail-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/dns-monitor-detail-view.spec.ts) | DNS expanded row — DNS response card, semantic value assertions, header controls, collapse / re-expand. |

### Page-level specs

| Spec | Covers |
|---|---|
| [`synthetics-page.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/synthetics-page.spec.ts) | Synthetics list page — page chrome, table interactions. |
| [`probes-page.spec.ts`](../../../tests/app/functional/monitoring-service/probes/probes-page.spec.ts) | Probes-page layout (status cards, toolbar, table columns, pagination); status-card filtering (Total / Online / Offline / Provisioning); sorting (Name / Status / Location / Region); pagination (page size, next/prev, last page); status filter dropdown; type filter (Local / Global); search by name / location; combined filters; special characters; filter preservation after sheet overlay; delete dialog; register-probe sheet (fields, validation, cancel / close); view details; edit sheet (pre-filled, read-only ID, cancel / close); local-probe action restrictions. |
| [`dashboard-page.spec.ts`](../../../tests/app/functional/monitoring-service/dashboard-page.spec.ts) | Landing-page structure (greeting + Synthetics / Probes / Monitors-by-Type / Quick-Actions sections); sidebar Dashboard link round-trip; Synthetics stat cards (5× title + numeric, internal sum consistency, total vs Synthetics API `totalElements`); Synthetics card navigation with `?health=<value>` and filter-label assertion (looped per card); Probes stat cards (4× title + numeric, total vs Probes API `totalElements`); Probes card navigation with `?status=<value>` (looped per card); Monitors-by-Type (set of visible bars matches API `count > 0` types, aria-label count per bar, per-type click → `?type=<value>`); Quick Actions (3× title + description, 3-step combined navigation test + `href` attribute assertion); empty-tenant state (auto-skips when tenant has monitors). Read-only spec — no monitor / probe creation or cleanup. |
| [`metrics-page.spec.ts`](../../../tests/app/functional/monitoring-service/metrics/metrics-page.spec.ts) | Metrics page — host picker, metric selection, chart toolbar, expanded dialog. |

---

## Scenario inventory — API specs

Live under [`tests/app/api/`](../../../tests/app/api/). One spec per API resource. Tag: `@App-API`. The deep authoring methodology (negative-matrix, status-code coverage, per-verb playbook) lives in the [`api-testing`](../api-testing/SKILL.md) skill — this is just an index.

| Spec | Resource |
|---|---|
| [`admin-tenants.spec.ts`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts) | `POST/GET/PATCH/DELETE /api/v1/admin/tenants(/:id)` — admin-realm token. |
| [`admin-realms.spec.ts`](../../../tests/app/api/tenant-service/admin-realms.spec.ts) | `POST/PATCH /api/v1/admin/realms` — admin-realm token (no path param). |
| [`admin-users.spec.ts`](../../../tests/app/api/tenant-service/admin-users.spec.ts) | `POST/GET/PATCH/DELETE /api/v1/admin/tenant/:tenant/user(s)`. |
| [`probes.spec.ts`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) | `POST/GET/PATCH/DELETE /api/v1/probes(/:id)` — tenant token. |
| [`http-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/http-synthetic-monitor.spec.ts) | HTTP monitor CRUD via `/api/v1/synthetics`. |
| [`dns-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/dns-synthetic-monitor.spec.ts) | DNS monitor CRUD. |
| [`data-metrics.spec.ts`](../../../tests/app/api/monitoring-service/metrics/data-metrics.spec.ts) | `GET /api/v1/synthetics/:id/metrics` (metric definitions per monitor). |
| [`data-query.spec.ts`](../../../tests/app/api/monitoring-service/metrics/data-query.spec.ts) | `GET /api/v1/data` and `POST /api/v1/data/metrics` query endpoints. |
| [`cross-tenant-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-isolation.spec.ts) | Cross-tenant isolation matrix — token from tenant A cannot read/write tenant B's resources. |
| [`cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts) | Cross-tenant isolation specific to metrics queries. |
| [`e2e-tenant-onboarding-flow.spec.ts`](../../../tests/app/api/tenant-service/e2e-tenant-onboarding-flow.spec.ts) | E2E onboarding — create tenant + invite user + verify Mailpit email + UUID immutability + multi-user emails. **Tag:** `@App-E2E`. |

---

## Setup specs

Live at [`tests/app/`](../../../tests/app/). Filename pattern: `*.setup.ts`. No tag.

| Spec | What it generates |
|---|---|
| [`login.setup.ts`](../../../tests/app/login.setup.ts) | Storage states (`.auth/app/<persona>Session.json`) via Keycloak UI login + API tokens (`process.env.USER_ACCESS_TOKEN_*`) via Keycloak admin client. Runs first; downstream projects (`app-chromium`, `api`, `keycloak`) depend on it. |

---

## Known gaps (intentional)

These gaps are tracked here so reviewers don't ask "why isn't this tested?" — and so authors don't accidentally fill them without checking why they're open.

- **Probe selector switching not tested** in any detail-view spec — requires multi-probe setup (≥ 2 active probes per tenant). Re-add when the probe-fleet helper supports multi-probe seeding.
- **Radix tooltip hover interactions** in detail-view specs — not an AC requirement; label text already visible verbatim in the legend; hover + Radix pointer-event timing is flaky under Playwright.
- **WebSocket Message Statistics / Throughput value formats** — too many units (integers, B/KB/MB, B/s, ms) and low user-impact if slightly malformed.
- **Tenant requires primary user (AC 4 of onboarding)** — backend doesn't enforce yet; current behavior allows tenant creation without a primary user. The `e2e-tenant-onboarding-flow.spec.ts` does not assert this AC.
- **`tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor-view.spec.ts`** — anti-pattern, retained for historical coverage. Don't replicate the layout for new monitor types. See [`selectors/recipes.md` § 18](../selectors/recipes.md).

---

## How to update this catalog

When adding or removing a spec, update this file in the same edit batch:

1. New spec → add a row to the matching section (E2E / Functional / API / Setup).
2. Removed spec → delete the row.
3. Spec scope expanded → update the "Covers" cell to reflect the new scenarios.
4. New intentional gap → add a bullet to § Known gaps with the rationale.

Catalog drift between this file and the actual specs is the leading cause of authors duplicating coverage that already exists. Verify with `ls tests/app/{api,e2e,functional}/` before adding a "new" spec.
