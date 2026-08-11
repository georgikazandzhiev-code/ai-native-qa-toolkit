---
name: test-standards
version: 1.0.0
description: Spec-file conventions — test-options.ts imports, the single-tag whitelist, Qase wiring (qase.suite + qase.id), API vs E2E vs functional placement, GIVEN/WHEN/THEN steps, web-first assertions, cleanup. Use when creating any spec, choosing a tag/directory, or reviewing compliance. Triggers — "create a test", "which tag", "qase suite", "test.step". Not for the API negative-test matrix (api-testing) or locators (selectors).
metadata:
  category: domain
---

# Test Standards

Every spec in `tests/app/{api,e2e,functional}/**` lands on the same shape: imports from `test-options.ts`, exactly one tag drawn from the framework whitelist, `qase.suite()` as the first body line, `test.step()` for Given/When/Then, web-first assertions, and API-driven cleanup. The shape is enforced because deviations break the npm scripts (a misspelled tag means `npm run app-regression` skips the test) and the Qase reporter (a missing `qase.suite` orphans the run). This skill is the **single source of truth** for spec-file conventions — for the deeper API-test workflow (negative matrix, per-verb coverage, schema patterns) load [`api-testing`](../api-testing/SKILL.md); for POM class structure load [`page-objects`](../page-objects/SKILL.md); for locator strategy load [`selectors`](../selectors/SKILL.md).

## Critical

- **ALWAYS** import `test` and `expect` from `fixtures/pom/test-options.ts`. **NEVER** from `@playwright/test` in a spec file. Why: `test-options.ts` merges `pageObjectFixture`, `apiRequestFixture`, `loginFixture`, `mailpitFixture` — importing from `@playwright/test` strips every custom fixture and silently breaks `apiRequest`, `loginUser`, `mailpit`, and every page-object destructure.
- **ALWAYS** tag every test with **exactly one** value from the framework whitelist: `@App-Critical | @App-Smoke | @App-Sanity | @App-regression | @App-API | @App-Integration | @App-E2E`. Casing must match the `package.json` `--grep` patterns **exactly**: every tag is Title-case **except `@App-regression`, which is lowercase `regression`** (the `app-regression` and `app-all` scripts grep the lowercase form). **NEVER** combine tags. **NEVER** put a tag on a `test.describe(...)` block. Why: combined or mistyped tags miss the npm-script greps and never run in CI.
- **ALWAYS** start every test body with `qase.suite(SUITES.<RESOURCE>);` and add `qase.id(N);` if a Qase case ID exists. Why: without `qase.suite`, the run is orphaned in Qase and the Qase pipeline can't aggregate by feature.
- **ALWAYS** wrap each phase of a test in `test.step("GIVEN/WHEN/THEN/AND: description", async () => { ... })`. **REQUIRED** for any test with 2+ distinct phases (which is almost every test). Why: `test.step` is what produces the readable HTML report and the trace timeline — without it, a failing test gives a single timeout pointing at the whole body.
- **ALWAYS** use web-first assertions (`await expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveCount()`, etc.). **NEVER** `page.waitForTimeout(...)`. Why: hard waits mask real timing bugs and are flake amplifiers under parallel execution.
- **ALWAYS** consume page objects through fixture destructuring (`async ({ dashboardPage }) => { ... }`). **NEVER** instantiate via `new DashboardPage(page)` inside a spec. Why: bypasses every other merged fixture (api-request, login, mailpit) and produces specs that pass alone but fail in CI.
- **ALWAYS** clean up created resources via the matching helper in `helpers/app/<resource>.ts` inside `test.afterEach` or `test.afterAll`. UI tests delete via the API, not via the UI — the helper layer owns the canonical delete. Why: UI delete adds 5–10 seconds per test and amplifies flake when CI is busy.
- **NEVER** commit explore-only or debug spec files (`console.log(await page.content())`, throwaway probes, `.only`). Why: they bloat CI, get committed by accident, and rot the test surface.
- **NEVER** silently drop a test because the API or UI misbehaves. **Comment out** the entire `test(...)` block and add `// TODO: FIXME: <TICKET-NUMBER> <description>` directly above the commented-out code. **Do NOT use `test.skip`** — skipped tests corrupt Qase ID mappings and pollute reporting. Every status code in the OpenAPI spec must be a passing test, a failing test, or a commented-out test with a ticket reference. Why: silent omission hides regressions; the `// TODO: FIXME:` + ticket annotation leaves a searchable paper trail. **Convention:** `// FIXME: <ticket>` marks a **broken** thing that needs a code fix (bug, API drift, FE regression). `// TODO: <description>` marks **planned work** that's not yet implemented (feature pending, test deferred). Use the one that matches the situation.
- **ALWAYS** run the affected spec(s) and confirm zero failures before declaring the task done — `npx playwright test <spec>` for one file, `npm run app-regression` / `npm run app-api` etc. for whole tag groups. A test that fails locally is not complete.

## What's in each file (read this before reaching for another file)

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, tag whitelist, structural workflow, anti-patterns, examples for spec authoring across all four test types. | **Always** — on any task that creates / extends / refactors a spec under `tests/app/**`. |
| **[`reference.md`](reference.md)** *(TBD — inline catalog below for now)* | Catalog: tag → npm-script mapping, `SUITES.X` enum keys, env var → token catalog, `MS = {...}` E2E timeout idiom, list of canonical example specs per type. | **Load on lookup** — "Which `SUITES.X` for probes?" / "What's the npm command for the smoke tag?" |

**Boundary rule:** rules, decisions, and anti-patterns live in this `SKILL.md`. POM class structure is the [`page-objects`](../page-objects/SKILL.md) skill. Locator priority is the [`selectors`](../selectors/SKILL.md) skill. The deep API negative-test matrix and per-verb coverage live in [`api-testing`](../api-testing/SKILL.md) — **do not duplicate them here**. Spec scaffolding (templates) lives in [`scaffold-spec`](../scaffold-spec/SKILL.md). If you find rule content in a sibling skill (or vice versa), it's drift — fix it before adding more.

## Tag whitelist & npm scripts

| Tag | npm script | Used for |
|-----|-----------|----------|
| `@App-Critical` | `app-critical` | 3–5 tests whose red means the build is broken. |
| `@App-Smoke` | `app-smoke` | Critical-path UI — login, landing, navigate to major pages. |
| `@App-Sanity` | `app-sanity` | Quick post-deploy read-only verification. |
| `@App-regression` | `app-regression` | Functional regression — largest bucket; lives in `tests/app/functional/`. **Lowercase `regression` — the only non-Title-case tag.** |
| `@App-API` | `app-api` | API contract + schema validation. Lives in `tests/app/api/`. |
| `@App-Integration` | `app-integration` | Cross-component integration that's neither pure API nor end-to-end UI. |
| `@App-E2E` | `app-e2e` | End-to-end UI journey (create → verify → edit → delete). Lives in `tests/app/e2e/`. |
| (union) | `app-all` | Full nightly / pre-merge, single worker. |

**Tag-casing matters.** `package.json` greps are case-sensitive and mixed-case: `app-regression` greps **lowercase** `@App-regression`, and `app-all` greps `@App-(Smoke|Sanity|Integration|E2E|API|regression)` — Title-case for everything except `regression`. Lowercase `@App-regression` **is the standard** that runs in CI; a Title-case `@App-Regression` tag would match neither script and would **never run**. In fact zero tests use `@App-Regression` — the codebase uniformly uses lowercase `@App-regression` (~398 occurrences across ~34 spec files). Match the existing casing exactly; never "fix" it to Title-case.

## Test types & directories

| Type | Directory | Tag | Covers | Canonical example |
|------|-----------|-----|--------|-------------------|
| **API** | `tests/app/api/` | `@App-API` | API contracts, schema validation, status-code matrix, per-field negative coverage | [`tests/app/api/monitoring-service/probes/probes.spec.ts`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) |
| **E2E** | `tests/app/e2e/` | `@App-E2E` | Full CRUD journeys — create → verify → edit → delete in one test | [`tests/app/e2e/monitoring-service/synthetics/http-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/http-synthetic-monitor-crud.spec.ts) |
| **Functional** | `tests/app/functional/` | `@App-regression` (+ rare `@App-Smoke` for landing pages) | One feature or behaviour in isolation — form validation, dropdown behavior, navigation, page-structure assertions | [`tests/app/functional/monitoring-service/dashboard-page.spec.ts`](../../../tests/app/functional/monitoring-service/dashboard-page.spec.ts) |
| **Smoke (UI)** | `tests/app/e2e/` | `@App-Smoke` | Critical-path login + landing-page sanity | [`tests/app/e2e/tenant-service/login-smoke.spec.ts`](../../../tests/app/e2e/tenant-service/login-smoke.spec.ts) |
| **Setup** | `tests/app/` | (no tag) | Storage-state generation, token bootstrap | [`tests/app/login.setup.ts`](../../../tests/app/login.setup.ts) |

**Functional vs E2E** is a frequent decision point:

- A **functional test** isolates and verifies a single behaviour (e.g., "Dashboard renders all four sections", "form rejects invalid email"). Each test covers one thing. **Tag: `@App-regression`.**
- An **E2E test** chains 4+ phases in a single test that mirrors a real user journey from start to finish (create → verify → edit → delete). An E2E file typically contains 1–3 high-level scenario tests. **Tag: `@App-E2E`. Use `test.setTimeout(300_000)` at the describe level.**

**E2E `beforeAll` boundary.** `beforeAll` seeds **background infrastructure** that the journey needs but that isn't the story being tested (e.g., a probe or monitor that a policy-crud E2E needs). The **lifecycle actions under test** must be visible `test.step()`s inside the test body. If the most interesting action is hidden in `beforeAll`, the test shape is wrong. Example: a policy-crud E2E seeds a probe + monitor via API in `beforeAll` (infrastructure), then the test walks create → view → disable → enable → edit → delete (the journey). An alerts E2E should seed monitors + policy in `beforeAll` (infrastructure), then the first visible step is "wait for alert to fire" — that's where the journey starts.

**Hybrid strategy for data-dependent UI tests.** When a UI feature requires collected data that takes minutes to materialize (traceroute paths, metric graphs, historical timelines), split tests into two groups: **structural tests** (tab visibility, not-enabled states, empty-state messages, toggle defaults) use a **freshly created monitor** — no data needed. **Data-dependent tests** (graph rendering, hop details, diagnostic hints, historical views) use a **pre-existing, data-rich fixture** named in configuration guaranteed to have historical data. The decider: does the test need *collected data* to assert something meaningful? If yes → existing monitor. If no → fresh monitor. Never add a multi-minute polling loop in `beforeAll` to wait for data collection — that is a signal to use the hybrid strategy instead.

**Functional page-spec coverage baseline.** When authoring a functional spec for a list/table page, use the live app and POM locators to ensure coverage of every interactive element. At minimum: (1) page structure — all sections, cards, toolbar visible; (2) sorting — each sortable column toggles order; (3) pagination — next/previous, page count, rows-per-page; (4) search — type, verify filtered results, clear; (5) each filter dropdown — select, verify URL/table update, clear; (6) empty state — non-existent search term shows empty message; (7) row actions — each menu item opens its target; (8) combined filters — stacking search + filter narrows correctly. Reference: `policies-page.spec.ts` is the canonical example.

## Workflow — author or extend a spec

```
- [ ] 1. Pick the test type (Functional / E2E / API / Smoke / Setup) → resolves directory + tag.
- [ ] 2. Load the matching deep skill — `api-testing` for API specs, `page-objects` + `selectors` for UI specs.
- [ ] 3. For UI: explore the live app via `npx playwright open` (the `playwright-cli` skill). For API: read OpenAPI / Swagger first (the `api-testing` skill, Phase 1).
- [ ] 4. Author the imports + describe + beforeEach skeleton; pull `SUITES.<RESOURCE>` from `enums/app/qase-suites.ts` (extend it if missing).
- [ ] 5. Tag with exactly ONE value from the whitelist (exact casing — lowercase `@App-regression`, Title-case for the rest). Add `qase.suite(SUITES.X)` as the first body line; add `qase.id(N)` if a Qase case ID exists.
- [ ] 6. Structure the body with `test.step("GIVEN/WHEN/THEN/AND: ...", async () => { ... })`. Web-first assertions only.
- [ ] 7. For E2E: track created resource names in a `createdNames: string[]` array; add `test.afterAll` that deletes via the matching `helpers/app/<resource>.ts` helper.
- [ ] 8. For data-driven tests: loop OUTSIDE the test block, generating individual `test(...)` calls with descriptive names.
- [ ] 9. Run the spec — `npx playwright test <spec>` — and confirm zero failures. For tag groups, use the matching `npm run app-<tag>` script.
```

### Step 1 — pick the test type

If the user request is ambiguous, decide using this ladder:

1. Pure HTTP request + response assertion, no UI? → **API** (`tests/app/api/`, `@App-API`).
2. UI happens, single behaviour, ≤ 3 phases? → **Functional** (`tests/app/functional/`, `@App-regression`).
3. UI happens, full journey with 4+ phases (create → verify → edit → delete)? → **E2E** (`tests/app/e2e/`, `@App-E2E`).
4. UI happens, must-pass-before-anything-else (login, landing, navigation)? → **Smoke** (`tests/app/e2e/`, `@App-Smoke`).
5. Generates storage state or auth tokens? → **Setup** (`tests/app/<name>.setup.ts`, no tag).

### Step 2 — read the matching rule

| Spec type | Read this rule |
|-----------|----------------|
| API | [`api-testing`](../api-testing/SKILL.md) (status-code matrix, schema-validation pattern, per-field negative coverage, per-verb coverage in `http-method-coverage.md`) |
| Functional / E2E / Smoke | [`page-objects`](../page-objects/SKILL.md) (POM Method Standards, class structure, fixture registration) + [`selectors`](../selectors/SKILL.md) (Locator Priority Hierarchy, Radix exception, recipes) |

### Step 3 — explore first

- **UI tests:** open the page via `npx playwright open` (see the [`playwright-cli`](../playwright-cli/SKILL.md) skill). Capture role / accessible name / testid for every element you'll touch, every feedback message, every loading and empty state. **Never write locators from frontend source or wireframes alone.**
- **API tests:** the `api-testing` skill mandates "OpenAPI / Swagger first; live exploration only as a fallback". Pull the documented contract and build the schema + status-code matrix from it.

### Step 4 — author the skeleton

Every UI spec opens with this exact import block:

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
```

Every API spec opens with that block plus schema and helper imports:

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { appConfig } from "../../../config/app";
import { faker } from "@faker-js/faker";
// + Zod schemas from fixtures/api/schemas/app/<resource>
// + Helpers from helpers/app/<resource>
// + Invalid-type arrays from fixtures/api/invalid-types
```

`SUITES.<RESOURCE>` lives in [`enums/app/qase-suites.ts`](../../../enums/app/qase-suites.ts). If the suite you need (`APP_SETTINGS`, `API_REPORTS`, etc.) isn't there yet, **extend the enum first** via the [`enums`](../enums/SKILL.md) skill — never inline a string literal.

### Step 5 — tag and Qase

```typescript
test(
  "Verify dashboard renders all four sections",
  { tag: "@App-regression" },           // Single tag, exact whitelist casing
  async ({ dashboardPage }) => {
    qase.suite(SUITES.APP_DASHBOARD);   // First body line
    qase.id(531);                       // Optional, if a Qase case exists
    // ...
  },
);
```

- **One tag per test.** Never `tag: ["@App-regression", "@App-Smoke"]`.
- **Exact casing.** Match `package.json` greps: lowercase `@App-regression`, Title-case for every other tag. A mis-cased tag silently misses CI.
- **Tag goes on the test, not on `describe`.** `test.describe("X @App-regression", ...)` is forbidden.
- **`qase.suite()` first, then `qase.id()` (optional), then `test.step(...)` for the body.**

### Step 6 — structure with `test.step`

```typescript
test(
  "Verify create-monitor flow shows success toast",
  { tag: "@App-E2E" },
  async ({ syntheticsPage, createMonitorPage }) => {
    qase.suite(SUITES.APP_SYNTHETICS);

    await test.step("GIVEN: User is on the Synthetics page", async () => {
      await syntheticsPage.open();
      await syntheticsPage.verifyPageLoaded();
    });

    await test.step("WHEN: User submits a valid HTTP monitor", async () => {
      await syntheticsPage.createMonitorButton.click();
      await createMonitorPage.fillHttpMonitorForm({ name: monitorName, url: TARGET });
      await createMonitorPage.submit();
    });

    await test.step("THEN: Success toast is visible", async () => {
      await expect(createMonitorPage.successToast).toBeVisible();
    });
  },
);
```

Step labels follow `GIVEN: / WHEN: / THEN: / AND:` — verbatim, capitalized prefix, colon, single space, then the description. The capitalized `GIVEN`/`WHEN`/`THEN`/`AND` is the existing convention across every spec in the repo (see `dashboard-page.spec.ts`, `login-smoke.spec.ts`, `http-synthetic-monitor-crud.spec.ts`).

### Step 7 — E2E cleanup

E2E describes set `test.setTimeout(300_000)`, declare `const MS = { sheet: 15_000, toast: 10_000, button: 20_000, grid: 15_000 };` at file scope, track names in `const createdMonitorNames: string[] = []`, and delete via the matching `helpers/app/<resource>.ts` helper inside `test.afterAll`. See Example 3 below for the full shape — mirror [`http-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/http-synthetic-monitor-crud.spec.ts) verbatim. Don't invent new timeout-constant names per file.

### Step 8 — data-driven tests

Loop **outside** the `test()` block so each iteration produces a separately selectable test (see Example 2). The static-data tier rule (universal invalid-type arrays vs domain-specific curated sets vs inline boundaries) lives in the [`data-strategy`](../data-strategy/SKILL.md) skill — read it before adding a new file under `test-data/`.

> **Drift to converge — test data.** Today, `test-data/` holds only `test-data/app/*.json` files (no factories, no tiered static). The planned three-tier shape — `test-data/factories/<area>/`, `test-data/static/util/`, `test-data/static/<area>/` — is the canonical pattern that the [`data-strategy`](../data-strategy/SKILL.md) skill teaches. New tests authored through this skill should:
> - Use `faker.<...>` directly inline for happy-path values until factories exist (mirrors `http-synthetic-monitor-crud.spec.ts`'s `faker.string.alphanumeric(6)`).
> - Import existing JSON via `import probeData from "../../../test-data/app/probe.json";` (mirrors current api-spec usage).
> - Avoid creating *new* JSON files — open an issue to add the matching tiered TS file when the planned migration lands.

### Locale / i18n tests

When testing translated UI strings across locales, **always test both the default locale (EN) and the target locale (e.g., DE) for every assertion**. If a DE test asserts the pagination label shows "Zeilen pro Seite", a paired EN test must assert "Rows per page". Asymmetric locale coverage lets regressions in one locale go undetected.

### Step 9 — run the spec

```bash
# Single file
npx playwright test tests/app/functional/tenant-service/settings.spec.ts

# By tag (whole tag group)
npm run app-regression
npm run app-smoke
npm run app-api
npm run app-e2e

# Full union (single worker, mirrors CI)
npm run app-all
```

A test that fails locally is not complete. For the failure-mode taxonomy and the right Playwright tool (UI Mode `npm run app-ui`, debug `npm run app-debug`, trace viewer), read the [`debugging`](../debugging/SKILL.md) skill. Do not raise timeouts, wrap in `try/catch`, or loosen a schema to make a failure go away.

## Anti-patterns

- ❌ **`import { test, expect } from "@playwright/test"`.** Strips every merged fixture; `apiRequest`, page objects become `undefined`. Fix: import from `../../../fixtures/pom/test-options`.
- ❌ **Title-case `@App-Regression` tag.** Doesn't match `--grep @App-regression` in `package.json` (or the `app-all` grep); never runs in CI. Fix: lowercase `@App-regression`.
- ❌ **Combined tags (`["@App-regression", "@App-E2E"]`) or non-whitelisted (`@functional`, `@destructive`, `@regression`).** Fix: exactly one tag from the whitelist; pick the heaviest applicable.
- ❌ **Tag on `test.describe(...)`.** Tags are per-test. Fix: move onto each `test(...)`.
- ❌ **Missing `qase.suite(...)`.** Run is orphaned in Qase. Fix: add as the first body line. Extend `enums/app/qase-suites.ts` if missing.
- ❌ **`page.waitForTimeout(1000)`.** Flake amplifier. Fix: web-first assertion / `waitForResponse` / `expect.toPass`.
- ❌ **`new DashboardPage(page)` inside a spec.** Bypasses merged fixtures. Fix: destructure from test context.
- ❌ **E2E test deletes via the UI.** Slow + flaky. Fix: API-driven `test.afterAll` via `helpers/app/<resource>.ts`.
- ❌ **Using `test.skip` for known bugs.** Skipped tests corrupt Qase ID mappings. Comment out the test instead and add `// TODO: FIXME: <TICKET> <description>` above. Grep for `// TODO: FIXME:` to find all deferred tests.
- ❌ **No `test.step` — body is one big block.** Trace viewer becomes useless on failure. Fix: wrap each phase.
- ❌ **Hardcoded URL / token / endpoint / UI string.** Fix: `process.env.*`, `appConfig.*`, `enums/app/*`, `test-data/app/*`.
- ❌ **Committed `.only` / explore spec / `console.log(...)`.** Fix: delete before committing.
- ❌ **Single-assertion test with full navigation overhead.** If a test contains one assertion and shares the same `beforeEach` navigation as its neighbors, merge it as an `AND:` step into the nearest structural test. A standalone `test()` is justified only when it has a distinct GIVEN/WHEN/THEN flow or tests an interaction (click, type, select).
- ❌ **Back-to-back navigation calls where the second supersedes the first.** E.g., `await sideNavigation.navigateToApp(); await page.goto(alertsUrl);` — the first navigation is wasted. Fix: remove the redundant navigation; keep only the one that lands on the target page.
- ❌ **Blanket `test.describe.skip` covering tests with different dependencies.** If only 2 of 4 describes need Mailpit, skip those 2 — not all 4. Over-scoped skips hide passing tests from CI and inflate the skip count. Each skip must cite the specific blocker (`// FIXME: requires MAILPIT_URL`).

## Self-review checklist

- [ ] Imports `test` / `expect` from `fixtures/pom/test-options.ts` (never `@playwright/test`).
- [ ] File in the right directory for the type; filename is kebab-case `.spec.ts`.
- [ ] Exactly ONE tag from the whitelist with exact casing (lowercase `@App-regression`, Title-case otherwise), on the test (not on `describe`).
- [ ] `qase.suite(SUITES.<RESOURCE>);` is the first body line; `qase.id(N);` follows if applicable. `SUITES.<RESOURCE>` exists in `enums/app/qase-suites.ts`.
- [ ] Multi-phase tests use `test.step("GIVEN/WHEN/THEN/AND: ...", async () => { ... })`. Web-first assertions only — no `page.waitForTimeout`.
- [ ] Page objects destructured from test context — no `new <Page>(page)`.
- [ ] E2E specs: `test.setTimeout(300_000)` + `MS = { sheet, toast, button, grid }` + `createdNames: string[]` + `test.afterAll` cleanup via `helpers/app/<resource>.ts`.
- [ ] No hardcoded URLs / tokens / endpoints / strings — all from `process.env.*`, `appConfig.*`, `enums/app/*`, `test-data/app/*`.
- [ ] No `.only`. No `test.skip` — comment out the test with `// TODO: FIXME: <TICKET> <description>` instead (Qase ID preservation).
- [ ] When assertions reference strings from a `test-data/app/*.json` file, every relevant entry in that file has a corresponding assertion. Cross-reference the data file against the test to catch missing coverage.
- [ ] Affected tests run green before declaring done.

## Examples

### Example 1 — Functional smoke for the Dashboard landing page

User says: *"Verify the Dashboard renders all four sections (Synthetics, Probes, Monitors-by-Type, Quick Actions) when the user lands on `/`."*

1. **Step 1.** Single behaviour, single phase → **Functional** (`tests/app/functional/`, `@App-regression`).
2. **Step 2.** Confirm imports, tag, `qase.suite` requirement against the Critical block above.
3. **Step 3.** Open `/` via `npx playwright open`, verify all four section testids exist on `DashboardPage` (already there — see [pages/app/DashboardPage.ts:147-180](../../../pages/app/DashboardPage.ts#L147-L180)).
4. **Step 4.** Skeleton — imports + describe.
5. **Step 5.** Tag `{ tag: "@App-regression" }`, `qase.suite(SUITES.APP_DASHBOARD)`.
6. **Step 6.** Structure: `GIVEN: I am on Dashboard` → `THEN: All four sections visible`. Use `dashboardPage.verifyAllSectionsVisible()`.

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";

test.describe("Dashboard Page — Page Structure & Navigation", () => {
  test.beforeEach(async ({ sideNavigation, dashboardPage }) => {
    await test.step("GIVEN: I am on the Dashboard Page", async () => {
      await sideNavigation.navigateToApp();
      await dashboardPage.verifyPageLoaded();
    });
  });

  test(
    "Verify Dashboard renders all four sections",
    { tag: "@App-regression" },
    async ({ dashboardPage }) => {
      qase.suite(SUITES.APP_DASHBOARD);
      await test.step("THEN: Synthetics, Probes, Monitors-by-Type, and Quick-Actions sections are visible", async () => {
        await dashboardPage.verifyAllSectionsVisible();
      });
    },
  );
});
```

### Example 2 — Data-driven Functional test (loop-outside-test idiom)

For "verify the HTTP method dropdown supports each of GET / HEAD / POST / PUT / DELETE", loop **outside** `test()` so each method becomes its own selectable test:

```typescript
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE"] as const;

for (const method of HTTP_METHODS) {
  test(
    `Verify HTTP method dropdown supports ${method}`,
    { tag: "@App-regression" },
    async ({ createMonitorPage }) => {
      qase.suite(SUITES.APP_SYNTHETICS);
      await test.step(`WHEN: User selects HTTP method ${method}`, async () => {
        await createMonitorPage.selectDropdownOption("config.method", method);
      });
      await test.step(`THEN: ${method} is the selected value`, async () => {
        await expect(createMonitorPage.fieldInput("config.method")).toHaveText(method);
      });
    },
  );
}
```

For larger or domain-specific data sets, see the [`data-strategy`](../data-strategy/SKILL.md) skill's three-tier rule.

### Example 3 — E2E CRUD with API cleanup

User says: *"E2E test for HTTP monitor: create via UI → verify in grid → edit → delete via UI."*

1. **Step 1.** Multi-phase journey → **E2E** (`tests/app/e2e/`, `@App-E2E`).
2. **Step 7.** `test.setTimeout(300_000)`, `MS = {...}`, `createdMonitorNames` array, `test.afterAll` cleanup via `listSynthetics` + `deleteSyntheticMonitor`. Mirror [`http-synthetic-monitor-crud.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/http-synthetic-monitor-crud.spec.ts) verbatim.

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { faker } from "@faker-js/faker";
import { SUITES } from "../../../enums/app/qase-suites";
import { deleteSyntheticMonitor, listSynthetics } from "../../../helpers/app/synthetics";

const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL!;
const MS = { sheet: 15_000, toast: 10_000, button: 20_000, grid: 15_000 };

test.describe("E2E — HTTP Synthetic Monitor CRUD (single method)", () => {
  test.setTimeout(300_000);
  const createdMonitorNames: string[] = [];

  test.afterAll(async ({ apiRequest }) => {
    for (const name of createdMonitorNames) {
      const { body } = await listSynthetics(apiRequest, TENANT_TOKEN, { name });
      for (const s of body.synthetics) {
        await deleteSyntheticMonitor(apiRequest, s.id, TENANT_TOKEN);
      }
    }
  });

  test(
    "Create, verify, edit, delete an HTTP monitor",
    { tag: "@App-E2E" },
    async ({ sideNavigation, syntheticsPage, createMonitorPage }) => {
      qase.suite(SUITES.APP_SYNTHETICS);
      const monitorName = `e2e-http-${faker.string.alphanumeric(6).toLowerCase()}`;
      createdMonitorNames.push(monitorName);

      await test.step("GIVEN: User is on the Synthetics page", async () => {
        await sideNavigation.navigateToSynthetics();
        await syntheticsPage.verifyPageLoaded();
      });
      await test.step("WHEN: User creates an HTTP monitor", async () => {
        await syntheticsPage.createMonitorButton.click();
        await createMonitorPage.fillHttpMonitorForm({ name: monitorName, url: "https://example.com/health" });
        await createMonitorPage.submit();
      });
      await test.step("THEN: Monitor appears in the grid", async () => {
        await expect(syntheticsPage.getRowByName(monitorName)).toBeVisible({ timeout: MS.grid });
      });
      // ... edit phase, delete phase
    },
  );
});
```

### Example 4 — API + Smoke routing

For an API spec (`POST /probes` covering 201/400/401/403/405): pick `tests/app/api/`, tag `@App-API`, `qase.suite(SUITES.API_PROBES)`. The deep negative-test matrix (per-field omission loop, invalid-type loop, auth matrix, 405 test) belongs in the [`api-testing`](../api-testing/SKILL.md) skill — load it for the per-verb playbook. Mirror [`tests/app/api/monitoring-service/probes/probes.spec.ts`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) for the canonical shape.

For a UI smoke test: pick `tests/app/e2e/`, tag `@App-Smoke`, `qase.suite(SUITES.APP_LOGIN)`, use `resetStorageState` in `beforeEach`. Mirror [`tests/app/e2e/tenant-service/login-smoke.spec.ts`](../../../tests/app/e2e/tenant-service/login-smoke.spec.ts).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test runs locally, doesn't run in CI under `npm run app-regression`. | Tag is mis-cased (e.g. Title-case `@App-Regression`) but `package.json` greps lowercase `@App-regression`. | Flip to lowercase `@App-regression`. |
| `Cannot find name 'apiRequest'` (or `dashboardPage`, `loginUser`, etc.) on the test context. | Spec imported `test` from `@playwright/test` instead of `fixtures/pom/test-options.ts`. | Change the import to `from "../../../fixtures/pom/test-options"`. |
| Qase shows the run as orphaned / "Uncategorized". | Missing `qase.suite(SUITES.X);` as the first body line. | Add it immediately after `async (...) => {`. Extend `enums/app/qase-suites.ts` if `SUITES.X` doesn't exist. |
| `test.describe` tag not picked up by the npm script. | Tag belongs on the test, not on the describe. | Move the `{ tag: "..." }` argument onto each individual `test(...)`. |
| Spec passes alone, fails in parallel under `npm run app-all`. | Spec mutates shared state without cleanup, or uses hardcoded names that collide. | Track names with `faker.string.alphanumeric(6)` for uniqueness, and delete via API in `test.afterAll`. |
| `TypeError: Cannot read property 'X' of undefined` mid-test. | Page-object method returned without waiting; the next assertion ran before the UI settled. | Open the POM and confirm the offending action method has a built-in wait (`page.waitForResponse(...)` / `expect(locator).toBeVisible()`). See the `page-objects` skill § Step 6. |
| `expect(locator).toHaveText('...')` fails with the locator showing a partial / streamed value. | Missing `.toHaveText()` is an exact match by default; the value is loading. | Either await visibility first, then `.toHaveText`, or switch to `.toContainText('...')`. Don't add `waitForTimeout`. |
| Need to disable a test for a known bug. | `test.skip` corrupts Qase ID mappings; ESLint also blocks bare `.skip`. | **Comment out** the entire `test(...)` block. Add `// TODO: FIXME: <TICKET> <description>` directly above the commented-out code. Do not use `test.skip`. |
| Spec creates 50 monitors / probes per run, never deletes. | No `test.afterAll` cleanup. | Track names in a `createdNames: string[]` and call the matching `helpers/app/<resource>.ts` `cleanup<X>` / `delete<X>` inside `test.afterAll`. |
| Test fails with `Test timeout of 30000ms exceeded`. | E2E test missing `test.setTimeout(300_000)` at the describe level. | Add it as the first line inside `test.describe`. UI E2E flows commonly need 300 seconds for the full create→edit→delete loop. |
| Functional test with many interactions times out at 30s on CI. | Default 30s is too short for specs with 6+ UI navigation steps (e.g., policy wizard with 8 type cards). | Add `test.setTimeout(60_000)` or `test.setTimeout(120_000)` **on the individual test**, not the describe. Unlike E2E (where `300_000` at the describe is standard), functional tests set timeouts per-test, only where needed — the 30s default is correct for most single-behaviour tests. |
| `ZodError` thrown on `Schema.parse(body)`. | API contract has drifted, OR the schema is wrong. | Read the Zod error path. If the API is wrong, file a bug → comment out the test with `// TODO: FIXME: <TICKET>`. If the schema is wrong, fix it. **Never** loosen the schema with `.passthrough()` or `z.any()` to silence the error — that masks real drift. See the `api-testing` skill § Skipping. |

## See Also

- **Paired skills:** [`api-testing`](../api-testing/SKILL.md) for API specs (schema validation, status-code matrix, per-field negative coverage), [`page-objects`](../page-objects/SKILL.md) + [`selectors`](../selectors/SKILL.md) for UI specs (POM Method Standards, locator priority). Always-on framework invariants live in [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md).
- **Sibling cluster (UI authoring + API authoring):** [`page-objects`](../page-objects/SKILL.md) (POM class structure), [`selectors`](../selectors/SKILL.md) (locator strategy), [`api-testing`](../api-testing/SKILL.md) (deep API workflow + per-verb coverage), [`scaffold-spec`](../scaffold-spec/SKILL.md) (spec scaffolding starting points), [`fixtures`](../fixtures/SKILL.md) (DI + helper-fixture promotion), [`helpers`](../helpers/SKILL.md) (per-resource API helpers used in cleanup), [`enums`](../enums/SKILL.md) (`SUITES.X`, `Messages.X`, `ApiEndpoints.X`), [`data-strategy`](../data-strategy/SKILL.md) (factories, three-tier static data), [`type-safety`](../type-safety/SKILL.md) (`process.env.X!`, no `any`, Zod), [`config`](../config/SKILL.md) (`appConfig.api.*`, `appConfig.paths.*`).
- **Failure investigation:** [`debugging`](../debugging/SKILL.md) — failure-mode taxonomy and the right Playwright tool (`npm run app-ui`, `npm run app-debug`, trace viewer) when Step 9 reports red.
- **Orchestrator:** [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Routed Detail Index lists this skill.
- **Companion plan:** [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) — drift-to-converge entries (planned three-tier test-data migration).
