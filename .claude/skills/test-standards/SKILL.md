---
name: test-standards
version: 6.0.0
description: Spec-file conventions — test-options.ts imports, the tag taxonomy (one type tag plus suite and trait tags), Qase wiring (qase.suite + qase.id), API vs E2E vs functional placement, GIVEN/WHEN/THEN steps, web-first assertions, cleanup. Use when creating any spec, choosing a tag/directory, or reviewing compliance. Triggers — "create a test", "which tag", "qase suite", "test.step". Not for the API negative-test matrix (api-testing) or locators (selectors).
metadata:
  category: domain
---

# Test Standards

Every spec — API, E2E or functional — lands on the same shape: imports from `test-options.ts`, one type tag plus the suite and trait tags it needs, `qase.suite()` as the first body line when the repo uses Qase, `test.step()` for Given/When/Then, web-first assertions, and API-driven cleanup. The shape is enforced because deviations break the npm scripts (a misspelled or undeclared tag means the CI job's tag expression skips the test) and, where Qase is used, the Qase reporter (a missing `qase.suite` orphans the test run). This skill is the **single source of truth** for spec-file conventions — for the deeper API-test workflow (negative matrix, per-verb coverage, schema patterns) load [`api-testing`](../api-testing/SKILL.md); for POM class structure load [`page-objects`](../page-objects/SKILL.md); for locator strategy load [`selectors`](../selectors/SKILL.md).

Folder paths such as `tests/app/…`, `helpers/app/…`, `enums/app/…` and `test-data/app/…` are the standard layout (`~/.claude/CLAUDE.md § Standard repo layout and naming`). Service folders and spec file names (`jobs-service/`, `http-job-crud.spec.ts`) are the invented example app's; your repo's services are listed in its `CLAUDE.md`.

## Critical

- **ALWAYS** import `test` and `expect` from `fixtures/pom/test-options.ts`. **NEVER** from `@playwright/test` in a spec file. Why: `test-options.ts` merges `pageObjectFixture`, `apiRequestFixture`, `loginFixture`, `mailpitFixture` — importing from `@playwright/test` strips every custom fixture and silently breaks `apiRequest`, `loginUser`, `mailpit`, and every page-object destructure.
- **ALWAYS** tag every test with **exactly one type tag** — `@api`, `@functional`, `@e2e` or `@integration`, matching its folder — plus the **suite tags** (`@smoke`, `@sanity`, `@regression`) and **trait tags** (`@critical`, `@slow`) it needs (§ Tag taxonomy & npm scripts). A tag in no declared category fails the lint: a repo or an organisation plugin adds a suite or trait tag to its declared categories (the lint rule's `categories` option and its project `CLAUDE.md`) before using it, and never replaces or renames the type tags. A repo that already ran another set before adopting the toolkit keeps it (its CI jobs, Qase filters and dashboards depend on those tags), declares it in its project `CLAUDE.md` with its **tag map** (§ Kept set: the tag map), and tags exactly one tag per test from it (the lint rule's `whitelist`). A new repo uses the standard taxonomy. The toolkit's own earlier set (`@App-*`, up to 2.x) is not another set: a repo that adopted it moves to the standard taxonomy in a change of its own: the tags, the CI greps and the lint config in one PR, with a person renaming the Qase filters in Qase. Until that change lands, a new test keeps the repo's current `@App-*` tag, so its CI grep still runs it. Every standard tag is lowercase, and the lint rule, Qase filters and dashboards match tags exactly, so there is no casing exception to remember; a declared set is used exactly as cased in the project `CLAUDE.md`. Every tag in the toolkit's tables, examples, templates and run commands is the standard taxonomy's: in a repo with a declared set, read each one through the tag map, and in a repo still on `@App-*`, as its `@App-*` counterpart (`@api` → `@App-API`). **NEVER** recase a tag the repo's whitelist holds, or swap it for a standard tag to match a table, example, template or run command. Moving a test to another type, or into or out of a suite, and the `@App-*` move PR are deliberate retags, not fixes. **NEVER** put a tag on a `test.describe(...)` block. Why: CI selects tests by tag expressions; a test with no type tag, or with an undeclared or mistyped tag, is skipped or picked up by the wrong job.
- **ALWAYS**, when the repo uses Qase (its project `CLAUDE.md` says so; when that file is silent, the repo already has Qase wiring; § Qase is optional), start every test body with `qase.suite(SUITES.<RESOURCE>);`, then `qase.id(N);` — commented out (`// qase.id(N);`) until the case is mapped in Qase. Why: without `qase.suite`, the test run is orphaned in Qase and the Qase pipeline can't aggregate by feature. A repo without Qase adds no `qase.*` lines and keeps any it already has (§ Qase is optional).
- **NEVER** invent a Qase project code, case ID or traceability link. Why: an ID nobody mapped files the result against the wrong case, which is worse than no ID. Leave `// qase.id(N);` for a person to fill.
- **ALWAYS** wrap each phase of a test in `test.step("GIVEN/WHEN/THEN/AND: description", async () => { ... })`. **REQUIRED** for any test with 2+ distinct phases (which is almost every test). Why: `test.step` is what produces the readable HTML report and the trace timeline — without it, a failing test gives a single timeout pointing at the whole body.
- **ALWAYS** use web-first assertions (`await expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveCount()`, etc.). **NEVER** `page.waitForTimeout(...)`. Why: hard waits mask real timing bugs and are flake amplifiers under parallel execution.
- **ALWAYS** consume page objects through fixture destructuring (`async ({ dashboardPage }) => { ... }`). **NEVER** instantiate via `new DashboardPage(page)` inside a spec. Why: bypasses every other merged fixture (api-request, login, mailpit) and produces specs that pass alone but fail in CI.
- **ALWAYS** clean up created resources via the matching helper in `helpers/app/<resource>.ts` inside `test.afterEach` or `test.afterAll`. UI tests delete via the API, not via the UI — the helper layer owns the canonical delete. Why: UI delete adds 5–10 seconds per test and amplifies flake when CI is busy.
- **NEVER** commit explore-only or debug spec files (`console.log(await page.content())`, throwaway checks, `.only`). Why: they bloat CI, get committed by accident, and rot the test surface.
- **NEVER** silently drop a test because the API or UI misbehaves. **Comment out** the entire `test(...)` block and add `// TODO: FIXME: <TICKET-NUMBER> <description>` directly above the commented-out code. **Do NOT use `test.skip`** — a skip reports green and corrupts the test-management signal (in Qase, its ID mappings). Every status code in the OpenAPI spec must be a passing test, a failing test, or a commented-out test with a ticket reference. Why: silent omission hides regressions; the `// TODO: FIXME:` + ticket annotation leaves a searchable paper trail. **The marker for a disabled test is always the same string,** `// TODO: FIXME: <TICKET>` `<description>`, so one search finds every disabled test. Elsewhere in code, `// FIXME: <ticket>` marks a broken thing that needs a fix, and `// TODO: <description>` marks planned work.
- **NEVER** put conditional logic in a test body — no `if/else`, no ternary, no `&&` short-circuit, no `test.skip()`. Seed the precondition in `beforeAll`/`beforeEach` instead. Why: a conditional steers around missing data, so the test passes without exercising the behaviour and the test run is recorded as coverage of something it never touched. Enforced by `qa-constitution/no-conditional-in-test` for `if`, `switch`, a control-flow ternary and an in-body `test.skip()`; an `&&` short-circuit is a review point — the lint can't tell it from a legitimate boolean expression.
- **ALWAYS** run the affected spec(s) and confirm zero failures before declaring the task done — `npx playwright test <spec>` for one file, the tag-group script for whole tag groups (`npm run app-regression` / `npm run app-api`; with a kept set, the script of the mapped tag). A test that fails locally is not complete.

## What's in each file (read this before reaching for another file)

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, tag taxonomy, structural workflow, anti-patterns, examples for spec authoring across all four test types. | **Always** — on any task that creates / extends / refactors a spec. |
| **[`reference.md`](reference.md)** | The standard tag → npm-script mapping, and the example app's catalog: every spec with what it covers, the setup spec, intentional gaps. The model for your repo's own scenario inventory. | **Load on lookup** — "What does a detail-view spec cover?" / "What's the npm command for the smoke tag?" |

**Boundary rule:** rules, decisions, and anti-patterns live in this `SKILL.md`. POM class structure is the [`page-objects`](../page-objects/SKILL.md) skill. Locator priority is the [`selectors`](../selectors/SKILL.md) skill. The deep API negative-test matrix and per-verb coverage live in [`api-testing`](../api-testing/SKILL.md) — **do not duplicate them here**. Spec scaffolding (templates) lives in [`scaffold-spec`](../scaffold-spec/SKILL.md). If you find rule content in a sibling skill (or vice versa), it's drift — fix it before adding more.

## Tag taxonomy & npm scripts

Tags describe the test, not the CI job. Each test carries exactly one **type** tag, which says what it is, and any **suite** and **trait** tags it needs. CI jobs select tests with tag expressions over them, so a new job never needs a new tag.

| Category | Tags (standard) | Per test | Means |
|---|---|---|---|
| Type | `@api`, `@functional`, `@e2e`, `@integration` | exactly one | What the test exercises; matches its folder (§ Test types & directories). `@integration` is cross-component, neither pure API nor an end-to-end UI journey. |
| Suite | `@smoke`, `@sanity`, `@regression` | zero or more | Which suites include it: the critical path, quick read-only post-deploy checks, the full regression run. |
| Trait | `@critical`, `@slow` | zero or more | Properties a job selects on: red means the build is broken (3–5 tests); slower than the run's time budget. |

`{ tag: ["@api", "@regression", "@slow"] }` is an API test, in the regression suite, and slow. A repo or an organisation plugin extends the suite and trait categories by declaring its own tags (`@security`, `@nightly`) in the lint rule's `categories` option and its project `CLAUDE.md`. The option adds to the standard tags and cannot remove one; the type tags are fixed and cannot be extended. A tag in no declared category fails the lint.

**Moving from 4.x (one tag per test, the flat standard set).** The move is breaking, so do it in one PR: give every functional test `@functional` next to its `@regression`, give every test that carried only `@smoke`, `@sanity` or `@critical` its type tag, replace the lint rule's `whitelist` option with nothing (or `categories` for your own suites and traits), change `app-all` to grep the type tags, and add `app-functional` and `app-slow`. With no options the rule now checks the standard taxonomy; before, it accepted any single tag.

| npm script (standard) | Selects |
|---|---|
| `app-<tag>` | Every test carrying that tag, one script per declared tag: `app-api`, `app-functional`, `app-e2e`, `app-integration`, `app-smoke`, `app-sanity`, `app-regression`, `app-critical`, `app-slow`. |
| `app-all` | Every test with a type tag: `--grep "@(api|functional|e2e|integration)"`. |

A CI job combines tags with Playwright's filters: `--grep "@regression" --grep-invert "@slow"` for the pre-merge run, `--grep "@smoke"` after a deploy, `--grep "(?=.*@api)(?=.*@regression)"` for API regression only. The job's name and its expression live in CI; the tag list never grows to name a job.

The tags and the `app-*` script names are both standard (`~/.claude/CLAUDE.md § Standard repo layout and naming`). A repo with a kept set reads this section through its tag map (§ Kept set: the tag map), and names its scripts after its own tags.

**Tag casing matters.** `app-regression` greps `@regression`, and `app-all` greps `@(api|functional|e2e|integration)`. Playwright's `--grep` ignores case, so a mis-cased tag still runs, but the lint rule, Qase filters and dashboards match tags exactly, so `@Regression` fails the lint and drops out of every exact filter. Keeping every standard tag lowercase removes the question. A repo with a declared set uses that set's own casing, and there `@Regression` may be exactly right: never recase a tag the whitelist holds. The `single-tag-on-test` lint rule catches a stray capital before merge.

### Kept set: the tag map

A repo that kept its own set keeps one tag per test, as its CI already expects (the lint rule's `whitelist`). It declares two things in its project `CLAUDE.md`: the whitelist, exactly as cased, and a **tag map** that gives each spec type in § Test types & directories the tag it takes, plus a row for each suite or trait tag (`@smoke`, `@sanity`, `@regression`, `@critical`, `@slow`) that the repo's tests use. For example:

| Spec type or standard tag | Tag |
|---|---|
| API | `@Regression` |
| Functional | `@Regression` |
| E2E | `@Nightly` |
| Smoke (UI) | `@Smoke` |
| Critical | `@Smoke` |

Every tag the skills name (`@api`, `{ tag: "@e2e" }`, `--grep "@regression"`, `npm run app-api`) is then read through the map. A type the kept set has no tag of its own for still gets a row, naming the tag whose CI job should run it. With a kept set, a test still takes exactly one tag: the map's tag for its spec type. The suite and trait tags in the toolkit's examples (`["@functional", "@regression"]` → the Functional row's tag) are dropped unless the map gives them a row of their own and the repo's CI selects on them. If the map is missing, or has no row for the spec type, ask which tag the repo uses (`[human-only: fact]`); never fall back to a standard tag, and never recase a whitelisted one. A repo still on `@App-*` needs no map: each standard tag's counterpart is its `@App-*` tag (`@api` → `@App-API`, `@functional` → `@App-regression`, which functional tests used before), exactly as cased in the repo's existing specs, one tag per test as above.

## Qase is optional

Qase is the toolkit's default test-management integration, not a prerequisite. A repo uses it when its project `CLAUDE.md` says so; that file should also name the project code, and an explicit no there wins over leftover wiring. If the project `CLAUDE.md` says nothing, look at the repo: a Qase reporter in `playwright.config`, an `enums/app/qase-suites.ts`, or existing `qase.suite(...)` calls mean it uses Qase, so keep wiring new tests the same way and suggest adding the line to its `CLAUDE.md`; if none of those is there and you are about to write a test, ask (`[human-only: fact]`) and suggest recording the answer in its project `CLAUDE.md`. Never remove existing `qase.*` lines: a repo that declares no Qase keeps the ones it has until a change of its own removes them.

In a repo that uses Qase, every test opens with `qase.suite(SUITES.<RESOURCE>)`, carries `// qase.id(N);` until the case is mapped, and `SUITES` lives in `enums/app/qase-suites.ts`. A repo that doesn't use Qase adds no `qase.*` line, `qase` import or `qase-suites.ts`, and keeps its traceability in the repo, the CI report or its own test-management tool; every other rule in the skills applies unchanged. Every `qase.*` line in the skills' examples, templates and checklists is read this way. In either case, never invent a Qase project code, a case ID or a traceability link.

## Test types & directories

| Type | Directory | Tags (standard) | Covers | Example (example app) |
|------|-----------|-----|--------|-------------------|
| **API** | `tests/app/api/` | `@api` (+ `@regression` and other suites it belongs to) | API contracts, schema validation, status-code matrix, per-field negative coverage | `tests/app/api/jobs-service/workers/workers.spec.ts` |
| **E2E** | `tests/app/e2e/` | `@e2e` (+ suites) | Full CRUD journeys — create → verify → edit → delete in one test | `tests/app/e2e/jobs-service/jobs/http-job-crud.spec.ts` |
| **Functional** | `tests/app/functional/` | `@functional` (+ `@regression`; `@smoke` for landing pages) | One feature or behaviour in isolation — form validation, dropdown behavior, navigation, page-structure assertions | `tests/app/functional/jobs-service/dashboard-page.spec.ts` |
| **Smoke (UI)** | `tests/app/e2e/` | `@e2e @smoke` | Critical-path login + landing-page sanity | `tests/app/e2e/tenant-service/login-smoke.spec.ts` |
| **Setup** | `tests/app/` | (no tag) | Storage-state generation, token bootstrap | `tests/app/login.setup.ts` |

A multi-endpoint API flow (e.g. create → read → delete over HTTP only) is still an API test: `tests/app/api/`, the API type tag (`@api` in the standard taxonomy). With a kept set, every tag in this section comes from the tag map.

**Functional vs E2E** is a frequent decision point:

- A **functional test** isolates and verifies a single behaviour (e.g., "Dashboard renders all four sections", "form rejects invalid email"). Each test covers one thing. **Tags: `@functional`, plus `@regression` and any other suites it belongs to; with a kept set, the tag map's Functional tag.**
- An **E2E test** chains 4+ phases in a single test that mirrors a real user journey from start to finish (create → verify → edit → delete). An E2E file typically contains 1–3 high-level scenario tests. **Tags: `@e2e`, plus the suites it belongs to; with a kept set, the tag map's E2E tag. Set `test.setTimeout(appConfig.timeouts.e2eJourney)` at the describe level.**

**E2E `beforeAll` boundary.** `beforeAll` seeds **background infrastructure** that the journey needs but that isn't the story being tested (e.g., a worker or job that a notification-rule-crud E2E needs). The **lifecycle actions under test** must be visible `test.step()`s inside the test body. If the most interesting action is hidden in `beforeAll`, the test shape is wrong. Example: a notification-rule-crud E2E seeds a worker + job via API in `beforeAll` (infrastructure), then the test walks create → view → disable → enable → edit → delete (the journey). A notifications E2E should seed jobs + notification rule in `beforeAll` (infrastructure), then the first visible step is "wait for notification to fire" — that's where the journey starts.

**Hybrid strategy for data-dependent UI tests.** When a UI feature requires data from the job's runs that takes minutes to materialize (run-step views, run-stat graphs, historical timelines), split tests into two groups: **structural tests** (tab visibility, not-enabled states, empty-state messages, toggle defaults) use a **freshly created job** — no data needed. **Data-dependent tests** (graph rendering, run-step details, diagnostic hints, historical views) use a **pre-existing, data-rich fixture** named in configuration guaranteed to have historical data. The decider: does the test need *run stats or run steps from the job's completed runs* to assert something meaningful? If yes → existing job. If no → fresh job. Never add a multi-minute polling loop in `beforeAll` to wait for the job's first run to complete — that is a signal to use the hybrid strategy instead.

**Functional page-spec coverage baseline.** When authoring a functional spec for a list/table page, use the live app and POM locators to ensure coverage of every interactive element. At minimum: (1) page structure — all sections, cards, toolbar visible; (2) sorting — each sortable column toggles order; (3) pagination — next/previous, page count, rows-per-page; (4) search — type, verify filtered results, clear; (5) each filter dropdown — select, verify URL/table update, clear; (6) empty state — non-existent search term shows empty message; (7) row actions — each menu item opens its target; (8) combined filters — stacking search + filter narrows correctly. In the example app, `notification-rules-page.spec.ts` follows this baseline.

## Workflow — author or extend a spec

```
- [ ] 1. Pick the test type (Functional / E2E / API / Smoke / Setup) → resolves directory + tag (the standard tag, or with a kept set the tag map's).
- [ ] 2. Load the matching deep skill — `api-testing` for API specs, `page-objects` + `selectors` for UI specs.
- [ ] 3. For UI: explore the live app via `npx playwright open` (the `playwright-cli` skill). For API: read OpenAPI / Swagger first (the `api-testing` skill, Phase 1).
- [ ] 4. Author the imports + describe + beforeEach skeleton; when the repo uses Qase, pull `SUITES.<RESOURCE>` from `enums/app/qase-suites.ts` (extend it if missing).
- [ ] 5. Tag with exactly one type tag plus the suite and trait tags the test needs, all declared (exact casing — the standard taxonomy is all lowercase; a kept set: one tag from its whitelist). When the repo uses Qase, add `qase.suite(SUITES.X)` as the first body line, then `qase.id(N)` — commented out until mapped.
- [ ] 6. Structure the body with `test.step("GIVEN/WHEN/THEN/AND: ...", async () => { ... })`. Web-first assertions only.
- [ ] 7. For E2E: track created resource names in a `createdNames: string[]` array; add `test.afterAll` that deletes via the matching `helpers/app/<resource>.ts` helper.
- [ ] 8. For data-driven tests: UI cases loop OUTSIDE the test block (one `test(...)` per case, descriptive names); API negative matrices loop INSIDE one test (`test.step` + `expect.soft` + `safeParse`, the `api-testing` skill).
- [ ] 9. Run the spec — `npx playwright test <spec>` — and confirm zero failures. For tag groups, use the script for that tag (`npm run app-<tag>`; with a kept set, the script of the mapped tag).
```

### Step 1 — pick the test type

If the user request is ambiguous, decide using this ladder:

1. Pure HTTP request + response assertion, no UI? → **API** (`tests/app/api/`, `@api` or the tag map's API tag).
2. UI happens, single behaviour, ≤ 3 phases? → **Functional** (`tests/app/functional/`, `@functional` plus its suites, or the tag map's Functional tag).
3. UI happens, full journey with 4+ phases (create → verify → edit → delete)? → **E2E** (`tests/app/e2e/`, `@e2e` or the tag map's E2E tag).
4. UI happens, must-pass-before-anything-else (login, landing, navigation)? → **Smoke** (`tests/app/e2e/`, `@e2e @smoke`, or the tag map's Smoke tag).
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

Every UI spec opens with this import block (without Qase, drop the `qase` and `SUITES` imports; § Qase is optional):

```typescript
import { expect, test } from "../../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../../enums/app/qase-suites";
```

Every API spec opens with that block plus schema and helper imports:

```typescript
import { expect, test } from "../../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../../enums/app/qase-suites";
import { appConfig } from "../../../../config/app";
import { faker } from "@faker-js/faker";
// + Zod schemas from fixtures/api/schemas/app/<resource>
// + Helpers from helpers/app/<resource>
// + Invalid-type arrays from fixtures/api/invalid-types
```

When the repo uses Qase, `SUITES.<RESOURCE>` lives in `enums/app/qase-suites.ts`. If the suite you need (`APP_SETTINGS`, `API_REPORTS`, etc.) isn't there yet, **extend the enum first** via the [`enums`](../enums/SKILL.md) skill — never inline a string literal.

### Step 5 — tag and Qase

```typescript
test(
  "Verify dashboard renders all four sections",
  { tag: ["@functional", "@regression"] },  // One type tag, then the suites it belongs to
  async ({ dashboardPage }) => {
    qase.suite(SUITES.APP_DASHBOARD);   // First body line
    // qase.id(N);                      // Commented out until the case is mapped in Qase
    await dashboardPage.verifyAllSectionsVisible();
  },
);
```

- **One type tag per test, then its suites and traits.** `tag: ["@functional", "@regression", "@smoke"]` is fine; `tag: ["@functional", "@e2e"]` is two types and is not.
- **Exact casing.** Standard tags are lowercase; a declared set keeps its own casing. A tag cased differently from its declared form fails the lint and misses Qase's and the dashboards' exact filters, even though `--grep` (case-insensitive) still runs it (in the standard set, `@Regression`; in a kept set, that may be the correct form).
- **Tag goes on the test, not on `describe`.** `test.describe("X @regression", ...)` is forbidden.
- **When the repo uses Qase, `qase.suite()` first, then `qase.id()` (optional), then `test.step(...)` for the body.**

### Step 6 — structure with `test.step`

```typescript
test(
  "Verify create-job flow shows success toast",
  { tag: "@e2e" },
  async ({ jobsPage, createJobPage }) => {
    qase.suite(SUITES.APP_JOBS);
    // qase.id(N);

    await test.step("GIVEN: User is on the Jobs page", async () => {
      await jobsPage.open();
      await jobsPage.verifyPageLoaded();
    });

    await test.step("WHEN: User submits a valid HTTP job", async () => {
      await jobsPage.openCreateJob();
      await createJobPage.fillHttpJobForm({ name: jobName, url: TARGET });
      await createJobPage.submit();
    });

    await test.step("THEN: Success toast is visible", async () => {
      await expect(createJobPage.successToast).toBeVisible();
    });
  },
);
```

Step labels follow `GIVEN: / WHEN: / THEN: / AND:` — verbatim, capitalized prefix, colon, single space, then the description. The capitalized `GIVEN`/`WHEN`/`THEN`/`AND` prefix is the convention for every spec. The one exception: inside a negative-matrix loop each step is one case, labelled with the case itself (`` `omit ${field}` ``, `` `PATCH /jobs` ``) — a GIVEN/WHEN/THEN prefix repeated on every iteration would say nothing.

### Step 7 — E2E cleanup

E2E describes set `test.setTimeout(appConfig.timeouts.e2eJourney)` and take every explicit wait from `appConfig.timeouts` (the `config` skill § Timeout budgets) — no timeout constants or numbers in the spec, track names in `const createdJobNames: string[] = []`, and delete via the matching `helpers/app/<resource>.ts` helper inside `test.afterAll`. See Example 3 below for the full shape. Don't invent timeout constants per file.

### Step 8 — data-driven tests

**UI cases** loop **outside** the `test()` block, so each case is its own selectable test (see Example 2). **API negative matrices** — invalid values, omitted fields, unsupported verbs — loop **inside** one `test()`, a `test.step` per value and `expect.soft` with `safeParse` ([`api-testing`](../api-testing/SKILL.md) § Per-field invalid-type loop): one test per validation concern, not one per value. The invalid-value tier rule (universal invalid-type arrays vs domain-specific curated sets vs inline boundaries) lives in [`api-testing` § Invalid-value arrays](../api-testing/SKILL.md#invalid-value-arrays--three-tier-rule) — read it before adding a new file under `test-data/`.

> **Where test data goes.** Static data lives in `test-data/app/<resource>.json` and typed factories in `helpers/app/`, in `test-data-generators.ts` once the `api-testing` extraction threshold is crossed (`~/.claude/CLAUDE.md § Standard repo layout and naming`); the [`data-strategy`](../data-strategy/SKILL.md) skill decides which one a value needs.

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

# Full union (mirrors CI)
npm run app-all
```

A test that fails locally is not complete. For the failure-mode taxonomy and the right Playwright tool (UI Mode `npx playwright test --ui`, debug `npx playwright test --debug`, trace viewer), read the [`debugging`](../debugging/SKILL.md) skill. Do not raise timeouts, wrap in `try/catch`, or loosen a schema to make a failure go away.

## Anti-patterns

- ❌ **`import { test, expect } from "@playwright/test"`.** Strips every merged fixture; `apiRequest`, page objects become `undefined`. Fix: import from `../../../../fixtures/pom/test-options`.
- ❌ **A tag cased differently from the repo's whitelist** (in the standard set, `@Regression` for `@regression`). Fails the lint, and misses the exact-match Qase filters and dashboards (Playwright's `--grep` ignores case, so CI still runs it and hides the problem). Fix: the declared casing. In a repo with a kept set, `@Regression` may be the whitelisted form: check the project `CLAUDE.md` before changing a tag, and never recase a whitelisted one.
- ❌ **No type tag, two type tags (`["@functional", "@e2e"]`), or a tag in no declared category (`@destructive`, `@flaky`).** Fix: exactly one type tag, the one matching the folder; declare a new suite or trait tag before using it. A suite tag alone (`["@regression"]`) says which runs include the test, not what it is.
- ❌ **Tag on `test.describe(...)`.** Tags are per-test. Fix: move onto each `test(...)`.
- ❌ **Missing `qase.suite(...)` in a repo that uses Qase.** Test run is orphaned in Qase. Fix: add as the first body line. Extend `enums/app/qase-suites.ts` if missing.
- ❌ **`page.waitForTimeout(1000)`.** Flake amplifier. Fix: web-first assertion / `waitForResponse` / `expect.toPass`.
- ❌ **`new DashboardPage(page)` inside a spec.** Bypasses merged fixtures. Fix: destructure from test context.
- ❌ **E2E test deletes via the UI.** Slow + flaky. Fix: API-driven `test.afterAll` via `helpers/app/<resource>.ts`.
- ❌ **Using `test.skip` for known bugs.** A skip reports green and corrupts the test-management signal (in Qase, its case-ID history). Comment out the test instead and add `// TODO: FIXME: <TICKET> <description>` above. Grep for `// TODO: FIXME:` to find all deferred tests.
- ❌ **No `test.step` — body is one big block.** Trace viewer becomes useless on failure. Fix: wrap each phase.
- ❌ **Hardcoded URL / token / endpoint / UI string.** Fix: the config module — `appConfig.*` (URLs, endpoints, routes), `env.X` / `tokens.full()` from `config/env.ts` (credentials, tokens) — `enums/app/*` (UI strings), `test-data/app/*` (fixed values).
- ❌ **Committed `.only` / explore spec / `console.log(...)`.** Fix: delete before committing.
- ❌ **Single-assertion test with full navigation overhead.** If a test contains one assertion and shares the same `beforeEach` navigation as its neighbors, merge it as an `AND:` step into the nearest structural test. A standalone `test()` is justified only when it has a distinct GIVEN/WHEN/THEN flow or tests an interaction (click, type, select).
- ❌ **Back-to-back navigation calls where the second supersedes the first.** E.g., `await sideNavigation.navigateToApp(); await page.goto(notificationsUrl);` — the first navigation is wasted. Fix: remove the redundant navigation; keep only the one that lands on the target page.
- ❌ **Disabling a whole describe when only some of its tests are blocked — and `test.describe.skip` at all.** If only 2 of 4 describes need Mailpit, disable those 2, not all 4, by commenting out their tests with `// TODO: FIXME: <TICKET> requires MAILPIT_URL`. Over-scoped disabling hides passing tests from CI; `test.describe.skip` also reports green and corrupts the test-management signal, like any other skip.

## Self-review checklist

- [ ] Imports `test` / `expect` from `fixtures/pom/test-options.ts` (never `@playwright/test`).
- [ ] File in the right directory for the type; filename is kebab-case `.spec.ts`.
- [ ] Exactly one type tag, matching the folder, plus only declared suite and trait tags, with exact casing (the standard taxonomy is all lowercase; a kept set: exactly one tag from its whitelist), on the test (not on `describe`).
- [ ] When the repo uses Qase: `qase.suite(SUITES.<RESOURCE>);` is the first body line; `qase.id(N);` follows — commented out until mapped, never invented. `SUITES.<RESOURCE>` exists in `enums/app/qase-suites.ts`. Without Qase: no new `qase.*` lines.
- [ ] Multi-phase tests use `test.step("GIVEN/WHEN/THEN/AND: ...", async () => { ... })`. Web-first assertions only — no `page.waitForTimeout`.
- [ ] Page objects destructured from test context — no `new <Page>(page)`.
- [ ] E2E specs: `test.setTimeout(appConfig.timeouts.e2eJourney)`, explicit waits from `appConfig.timeouts` (no numbers) + `createdNames: string[]` + `test.afterAll` cleanup via `helpers/app/<resource>.ts`.
- [ ] No hardcoded URLs / tokens / endpoints / strings — URLs from `appConfig`, credentials and tokens from `env` / `tokens` in `config/env.ts` (never `process.env` at a call site), endpoints and routes only from `appConfig.*` (never enums), UI strings / suites / statuses from `enums/app/*`, fixed values from `test-data/app/*`.
- [ ] No `.only`. No `test.skip` — comment out the test with `// TODO: FIXME: <TICKET> <description>` instead: a skip reports green and corrupts the test-management signal, in Qase its case-ID history.
- [ ] When assertions reference strings from a `test-data/app/*.json` file, every relevant entry in that file has a corresponding assertion. Cross-reference the data file against the test to catch missing coverage.
- [ ] Affected tests run green before declaring done.

## Examples

### Example 1 — Functional smoke for the Dashboard landing page

User says: *"Verify the Dashboard renders all four sections (Jobs, Workers, Type Breakdown, Quick Actions) when the user lands on `/`."*

1. **Step 1.** Single behaviour, single phase → **Functional** (`tests/app/functional/`, `@regression`).
2. **Step 2.** Confirm imports, tag, `qase.suite` requirement against the Critical block above.
3. **Step 3.** Open `/` via `npx playwright open`, verify all four section testids, and check that `DashboardPage` already has a locator for each before adding one.
4. **Step 4.** Skeleton — imports + describe.
5. **Step 5.** Tag `{ tag: ["@functional", "@regression"] }`, `qase.suite(SUITES.APP_DASHBOARD)`.
6. **Step 6.** Structure: `GIVEN: I am on Dashboard` → `THEN: All four sections visible`. Use `dashboardPage.verifyAllSectionsVisible()`.

```typescript
import { expect, test } from "../../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../../enums/app/qase-suites";

test.describe("Dashboard Page — Page Structure & Navigation", () => {
  test.beforeEach(async ({ sideNavigation, dashboardPage }) => {
    await test.step("GIVEN: I am on the Dashboard Page", async () => {
      await sideNavigation.navigateToApp();
      await dashboardPage.verifyPageLoaded();
    });
  });

  test(
    "Verify Dashboard renders all four sections",
    { tag: ["@functional", "@regression"] },
    async ({ dashboardPage }) => {
      qase.suite(SUITES.APP_DASHBOARD);
      // qase.id(N);
      await test.step("THEN: Jobs, Workers, Type-Breakdown, and Quick-Actions sections are visible", async () => {
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
    { tag: ["@functional", "@regression"] },
    async ({ createJobPage }) => {
      qase.suite(SUITES.APP_JOBS);
      // qase.id(N);
      await test.step(`WHEN: User selects HTTP method ${method}`, async () => {
        await createJobPage.selectDropdownOption("config.method", method);
      });
      await test.step(`THEN: ${method} is the selected value`, async () => {
        await expect(createJobPage.fieldInput("config.method")).toHaveText(method);
      });
    },
  );
}
```

For larger or domain-specific data sets, see [`api-testing` § Invalid-value arrays](../api-testing/SKILL.md#invalid-value-arrays--three-tier-rule) and the [`data-strategy`](../data-strategy/SKILL.md) skill.

### Example 3 — E2E CRUD with API cleanup

User says: *"E2E test for HTTP job: create via UI → verify in grid → edit → delete via UI."*

1. **Step 1.** Multi-phase journey → **E2E** (`tests/app/e2e/`, `@e2e`).
2. **Step 7.** `test.setTimeout(appConfig.timeouts.e2eJourney)`, `createdJobNames` array, `test.afterAll` cleanup via `listJobs` + `deleteJob`.

```typescript
import { expect, test } from "../../../../fixtures/pom/test-options";
import { appConfig } from "../../../../config/app";
import { qase } from "playwright-qase-reporter";
import { faker } from "@faker-js/faker";
import { SUITES } from "../../../../enums/app/qase-suites";
import { deleteJob, listJobs } from "../../../../helpers/app/jobs";
import { tokens } from "../../../../config/env";

test.describe("E2E — HTTP Job CRUD (single method)", () => {
  test.setTimeout(appConfig.timeouts.e2eJourney);
  const createdJobNames: string[] = [];

  test.afterAll(async ({ apiRequest }) => {
    for (const name of createdJobNames) {
      const { body } = await listJobs(apiRequest, { name }, tokens.full());
      for (const job of body.jobs) {
        await deleteJob(apiRequest, job.id, tokens.full());
      }
    }
  });

  test(
    "Create, verify, edit, delete an HTTP job",
    { tag: "@e2e" },
    async ({ sideNavigation, jobsPage, createJobPage }) => {
      qase.suite(SUITES.APP_JOBS);
      // qase.id(N);
      const jobName = `e2e-http-${faker.string.alphanumeric(6).toLowerCase()}`;
      createdJobNames.push(jobName);

      await test.step("GIVEN: User is on the Jobs page", async () => {
        await sideNavigation.navigateToJobs();
        await jobsPage.verifyPageLoaded();
      });
      await test.step("WHEN: User creates an HTTP job", async () => {
        await jobsPage.openCreateJob();
        await createJobPage.fillHttpJobForm({ name: jobName, url: "https://example.com/api/report" });
        await createJobPage.submit();
      });
      await test.step("THEN: Job appears in the grid", async () => {
        await expect(jobsPage.getRowByName(jobName)).toBeVisible({ timeout: appConfig.timeouts.persist });
      });
      // ... edit phase, delete phase
    },
  );
});
```

### Example 4 — API + Smoke routing

For an API spec (`POST /workers` covering 201/400/401/403/405): pick `tests/app/api/`, tag `@api` plus `@regression` if the regression run should include it (or the tag map's API tag), `qase.suite(SUITES.API_WORKERS)`. The deep negative-test matrix (per-field omission loop, invalid-type loop, auth matrix, 405 test) belongs in the [`api-testing`](../api-testing/SKILL.md) skill — load it for the per-verb playbook. Use the nearest API spec at its standard location in your repo as a reference (in the example app, `tests/app/api/jobs-service/workers/workers.spec.ts`); where it differs from this skill, the skill wins: name the difference as drift, never copy it.

For a UI smoke test: pick `tests/app/e2e/`, tag `["@e2e", "@smoke"]` (or the tag map's Smoke tag), `qase.suite(SUITES.APP_LOGIN)`, use `resetStorageState` in `beforeEach`. Use your repo's nearest smoke spec at its standard location as a reference (in the example app, `tests/app/e2e/tenant-service/login-smoke.spec.ts`); where it differs from this skill, the skill wins: name the difference as drift, never copy it.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test runs locally, doesn't run in CI under the regression script (`npm run app-regression`; with a kept set, the script of the mapped tag). | The test lacks the tag the script selects (`@regression` is a suite tag: a test is in the regression run only if it carries it), or the job's expression excludes it (`--grep-invert "@slow"`). Casing is not the cause: `--grep` ignores case. | Add the suite tag if the test belongs in that run, or fix the job's expression. Never recase a tag the repo's whitelist holds. |
| `Cannot find name 'apiRequest'` (or `dashboardPage`, `loginUser`, etc.) on the test context. | Spec imported `test` from `@playwright/test` instead of `fixtures/pom/test-options.ts`. | Change the import to `from "../../../../fixtures/pom/test-options"`. |
| Qase shows the test run as orphaned / "Uncategorized". | Missing `qase.suite(SUITES.X);` as the first body line. | Add it immediately after `async (...) => {`. Extend `enums/app/qase-suites.ts` if `SUITES.X` doesn't exist. |
| `test.describe` tag not picked up by the npm script. | Tag belongs on the test, not on the describe. | Move the `{ tag: "..." }` argument onto each individual `test(...)`. |
| Spec passes alone, fails in parallel under `npm run app-all`. | Spec mutates shared state without cleanup, or uses hardcoded names that collide. | Track names with `faker.string.alphanumeric(6)` for uniqueness, and delete via API in `test.afterAll`. |
| `TypeError: Cannot read property 'X' of undefined` mid-test. | Page-object method returned without waiting; the next assertion ran before the UI settled. | Open the POM and confirm the offending action method has a built-in wait (`page.waitForResponse(...)` / `expect(locator).toBeVisible()`). See the `page-objects` skill § Step 6. |
| `expect(locator).toHaveText('...')` fails with the locator showing a partial / streamed value. | Missing `.toHaveText()` is an exact match by default; the value is loading. | Either await visibility first, then `.toHaveText`, or switch to `.toContainText('...')`. Don't add `waitForTimeout`. |
| Need to disable a test for a known bug. | A skip reports green and corrupts the test-management signal (in Qase, its case-ID history); ESLint also blocks bare `.skip`. | **Comment out** the entire `test(...)` block. Add `// TODO: FIXME: <TICKET> <description>` directly above the commented-out code. Do not use `test.skip`. |
| Spec creates 50 jobs / workers per test run, never deletes. | No `test.afterAll` cleanup. | Track names in a `createdNames: string[]` and call the matching `helpers/app/<resource>.ts` `cleanup<X>` / `delete<X>` inside `test.afterAll`. |
| Test fails with `Test timeout of 30000ms exceeded`. | An E2E journey without its test-level budget — or a real slowdown. | E2E journeys set `test.setTimeout(appConfig.timeouts.e2eJourney)` at the describe level. If the budget is already set, investigate with the `debugging` skill first: never raise a budget to turn a failure green. |
| Functional test with many interactions times out at 30s on CI. | Specs with 6+ UI navigation steps (e.g. a notification-rule wizard with 8 type cards) can exceed the default. | Set a test-level budget (`appConfig.timeouts.asyncFlow`) **on the individual test**, not the describe, only where needed — the default is right for most single-behaviour tests. Investigate first if the test used to pass within the default. |
| `ZodError` thrown on `Schema.parse(body)`. | API contract has drifted, OR the schema is wrong. | Read the Zod error path. If the API is wrong, file a bug → comment out the test with `// TODO: FIXME: <TICKET>`. If the schema is wrong, fix it. **Never** loosen the schema with `.passthrough()` or `z.any()` to silence the error — that masks real drift. See the `api-testing` skill § Skipping. |

## See Also

- **Paired skills:** [`api-testing`](../api-testing/SKILL.md) for API specs (schema validation, status-code matrix, per-field negative coverage), [`page-objects`](../page-objects/SKILL.md) + [`selectors`](../selectors/SKILL.md) for UI specs (POM Method Standards, locator priority). Always-on framework invariants live in [`~/.claude/CLAUDE.md`](../../CLAUDE.md).
- **Sibling cluster (UI authoring + API authoring):** [`page-objects`](../page-objects/SKILL.md) (POM class structure), [`selectors`](../selectors/SKILL.md) (locator strategy), [`api-testing`](../api-testing/SKILL.md) (deep API workflow + per-verb coverage), [`scaffold-spec`](../scaffold-spec/SKILL.md) (spec scaffolding starting points), [`fixtures`](../fixtures/SKILL.md) (DI + helper-fixture promotion), [`helpers`](../helpers/SKILL.md) (per-resource API helpers used in cleanup), [`enums`](../enums/SKILL.md) (`SUITES.X`, `MESSAGES.X`, `JOB_STATUSES`; paths live in `config`), [`data-strategy`](../data-strategy/SKILL.md) (factories, static data), [`type-safety`](../type-safety/SKILL.md) (env via `config/env.ts`, no `any`, Zod), [`config`](../config/SKILL.md) (`appConfig.api.*`, `appConfig.paths.*`).
- **Failure investigation:** [`debugging`](../debugging/SKILL.md) — failure-mode taxonomy and the right Playwright tool (`npx playwright test --ui`, `npx playwright test --debug`, trace viewer) when Step 9 reports red.
- **Orchestrator:** [`~/.claude/CLAUDE.md`](../../CLAUDE.md) — § Routed Skill Index lists this skill.
