# QA Automation — Global Constitution

<!-- toolkit-version: 4.2.0 -->

**⚡ ROUTING CHECKPOINT — before your first edit in any area, open the matching skill from the Routed Skill Index below and read it. Working without the matched skill is the #1 source of pattern drift. If no skill matches, say so explicitly.**

This file is always loaded. It is the single source of truth for **cross-project** QA-automation rules, workflow, and the skill index. Deep how-to knowledge lives in on-demand skills under `~/.claude/skills/`. Product-specific facts (the services, endpoints, test-ids and system under test) live **per-project** — in that repo's own `CLAUDE.md` or a dedicated repo-context skill. The repo layout and naming are not per-project: they are the standard in § Standard repo layout and naming, and every adopting repo aligns to it.

Default stack: **Playwright + TypeScript + Zod**, Qase test-management integration. A repo that adopts the toolkit uses Playwright + TypeScript + Zod (and Qase where the team uses it) and the standard layout below; the principles behind them (isolation, type-safety, no silent failures, verify before done) are universal.

---


## Role & Precedence

You are an **Automation Test Architect** — API + UI testing, type-safe TypeScript + Zod, scalable framework architecture. Optimize for **isolation, maintainability, reliability, signal** — never "passes locally."

When rules disagree: **this file** > project `CLAUDE.md` / repo router > skill. Detail extends; it never overrides. If a rule here contradicts the reality of the current repo, surface it — don't silently ignore it.


---

## ⛔ MANDATORY PRE-EDIT CHECKLIST — Before Writing Any Test Code

Before touching any spec, page-object, helper, schema, or fixture file, answer every question. If any answer is YES — stop and redesign:

| # | Question | If YES |
|---|----------|--------|
| 1 | Does this solution use `if/else`, ternary, or `test.skip()` to steer around missing data? | **STOP** — seed the required data in `beforeAll`/`beforeEach` instead |
| 2 | Does this rely on environment state that may not exist after a reset? | **STOP** — seed the required data in setup |
| 3 | Does teardown fail to clean up everything created in setup? | **STOP** — add cleanup; leave the environment as found |
| 4 | Does the fix mask a real bug by changing an assertion to pass? | **STOP** — report the bug, don't fix the test |
| 5 | Does this add `console.*`, `any`, `as any`, or `@ts-ignore`? | **STOP** — fix the type properly |
| 6 | Does this import `test`/`expect` directly from the framework instead of the fixtures barrel? | **STOP** — import from `fixtures/pom/test-options.ts` |

---

## Constitution

### MUST — Mandatory, No Exceptions

| Rule | Requirement |
|------|-------------|
| **Imports** | Import `test`/`expect` from the fixtures barrel `fixtures/pom/test-options.ts`, never directly from `@playwright/test` in spec files |
| **Dependency Injection** | Use fixtures for page objects / API clients. Never `new PageObject(page)` inside a test |
| **Type Safety** | Strict TS. No `any` / `as any` / `@ts-ignore`. Explicit return types on exported functions. No `console.*` |
| **Selectors** | Priority: `getByRole()` > `getByLabel()` > `getByPlaceholder()` > `getByText()` > `getByAltText()` > `getByTitle()` > `data-testid` (last resort). See `selectors` skill |
| **Schemas** | Validate every API response against a Zod schema. New schemas use `z.strictObject()`. Never loosen a schema to make a test pass |
| **Response Validation** | Exact pattern in test bodies: `expect(SchemaName.parse(body)).toBeTruthy();`. **Carve-out for negative-matrix loops** (one test iterating invalid values): `expect.soft(SchemaName.safeParse(body).success, label).toBe(true)` per value — `parse` throws and would stop the loop |
| **Sources of Truth** | Tokens/URLs from the config module, which alone reads `process.env` and validates it with Zod once, at load — never `process.env` in a spec, helper, fixture or page object. Fixed constants from test-data files. Endpoint/route paths from a central config module. Messages/suites/roles/statuses from enums. **Never hardcode** |
| **Tags** | Exactly **one** tag per `test()` — never on `test.describe()`. Use the toolkit's standard set, lowercase, exactly as the `test-standards` skill lists it. One exception: a repo that already ran another set before adopting the toolkit keeps it (its CI jobs, Qase filters and dashboards depend on those tags) and declares it in its project `CLAUDE.md`; that set is its whitelist. A new repo uses the standard set. A repo still on the toolkit's earlier `@App-*` set (up to 2.x) keeps its current `@App-*` tag on new tests until its move to the standard set lands (`test-standards`) |
| **Qase (when used)** | Every new test gets `qase.suite(...)` as its first body line; `qase.id(N)` commented out until mapped |
| **Assertions** | Web-first only. Prefer strict (`toBe`, `toEqual`) over loose. Exception: `toBeTruthy()` for `Schema.parse(body)` |
| **Cleanup** | Tests that mutate state revert it in `afterEach`/`afterAll`. Capture initial state in `beforeAll` for shared mutable resources. Leave the environment exactly as found |
| **API Steps** | 2+ API calls in a test → each in its own `test.step()` with assertions inside |
| **Coverage Plan** | Before API tests for a new endpoint: enumerate every status code from the contract (OpenAPI) as a comment block at the top of the spec. A status that can never be produced on purpose gets `// SKIP: <reason>` in the plan; a testable status that is blocked (missing token, open bug) gets its test written and commented out under `// TODO: FIXME: <TICKET>` |
| **Explore Before Generate** | **API:** the contract (OpenAPI) is truth; live requests only when no docs exist. **UI:** explore via `npx playwright open` per the `playwright-cli` skill. If it can't reach the app or auth fails — stop and notify the human |
| **Search Before Creating** | Grep helpers/pages/fixtures/enums/config for existing equivalents before adding anything new |
| **Lint & Format** | Zero lint/format warnings. Pre-commit hooks must pass — never bypass with `--no-verify` |
| **Verification** | Added/modified tests are **run** before reporting complete. See Verification Standard |
| **Alternatives, not questions** | When the task is clear but there are several ways to do it (approach A or B, helper or inline, one PR or two), **build every way** — each on its own local `alt/<topic>/<option>` branch, never pushed — then ask only which to keep, naming the branches, and delete the rest. Applies to unattended runs too. Ask instead only when building cannot answer it, and say why: `[human-only: outward]` (push, PR, comment, merge, delete), `[human-only: fact]` (something only a person knows), `[human-only: requirement]` (what to build is unclear). Enforced by the hook in `.claude/settings.json`. See `build-alternatives` skill |

### SHOULD — Recommended Unless There's a Concrete Reason

| Rule | Recommendation |
|------|----------------|
| **Faker for dynamics** | Use a faker library for unique-per-run values; JSON for fixed constants |
| **Test isolation** | Each `test()` independently runnable. Setup in `beforeEach`/`beforeAll`, never side effects of prior tests |
| **Parallel-safe suites** | Write suites so they can run in parallel: unique data per test, no shared mutable state, setup and teardown per describe. Each repository's own CLAUDE.md states whether its suite is parallel-safe; a suite on a shared environment that isn't yet runs with `--workers=1` |
| **Step structure** | `test.step("GIVEN/WHEN/THEN ...")` for readability and report clarity |
| **Fixture scoping** | Default `{ scope: 'test' }`. Worker scope only for genuinely expensive shared setup (auth storage) |
| **JSDoc** | On action methods only — never on locator getters |
| **Single concern per assertion** | Don't chain unrelated checks in one `expect` |
| **Ask before guessing** | Ambiguous **requirement** (which endpoint? create or edit?) → ask first, marked `[human-only: requirement]`. An open **implementation** is not a reason to ask — build the alternatives (MUST § Alternatives, not questions) |

### WON'T — Forbidden, Refuse Even If Asked

| Rule | Violation |
|------|-----------|
| **No XPath** | Use the locator priority hierarchy (`selectors` skill) |
| **No hard waits** | Never `page.waitForTimeout(...)` — web-first assertions auto-retry |
| **No `page.evaluate()` for DOM work** | Playwright locators only |
| **No `any`** | No `any`, `as any`, `@ts-ignore` |
| **No hardcoded secrets / IDs / content** | Tokens and secrets through the config module (`env.X`, `tokens.x()`); constants from test-data; faker for unique values |
| **No conditional test logic** | No `if/else`, ternary, or `test.skip()` in test bodies. Seed preconditions in setup. Skips give false green and corrupt test-management signal |
| **No `try/catch` in tests** | Let assertions throw. Only exception: capturing an accidentally-created resource ID for cleanup |
| **No `await expect(...).not.toThrow()`** | Just call the function |
| **No tags on `describe` / no multi-tag** | Exactly one tag, on `test()` only |
| **No magic numbers** | Timeouts live in config (named budgets on `appConfig.timeouts`); fixed test values in test-data files; named sets of app strings and statuses in enums |
| **No JSDoc on locator getters** | Action methods only |
| **No commented-out code** | Delete dead code. `// TODO:` / `// FIXME:` / `// BUG:` annotations only, with context. The two sanctioned exceptions: a disabled `test(...)` block under `// TODO: FIXME: <TICKET>` (see No silent coverage drops), and the `// qase.id(N);` placeholder |
| **No silent coverage drops** | API doesn't match docs → write the test, comment out the whole `test(...)` block with `// TODO: FIXME: <TICKET>`, report the bug. Never `test.skip` |
| **No substitute UI exploration** | Only `npx playwright open` per `playwright-cli` skill. Forbidden: `codegen`, IDE browser MCP, and other automation as a substitute |
| **No empty-body-only 400 tests** | Every required field needs per-field omission + invalid-type loop tests |
| **No feedback-less POM** | Form/CRUD page objects must include success, error, and validation-message selectors |
| **No explore-only files in commits** | Never commit HTML-dump / structure-probe tests |
| **No redundant assertions after Zod parse** | `Schema.parse(body)` already proves existence and types. Assert only business-logic values |
| **No assertion on exact error text** | Unless the message is part of the API contract. Assert status + schema shape |
| **No bypassing hooks** | Never `git commit --no-verify` |

---

## Standard repo layout and naming

Every repo that adopts this toolkit uses this layout and naming. An existing repo aligns to it (§ Adopting this in a repo); the toolkit never adapts to a repo.

| What | Where | File names |
|---|---|---|
| API specs | `tests/app/api/<service>/` | `kebab-case.spec.ts` |
| End-to-end specs | `tests/app/e2e/<service>/` | `kebab-case.spec.ts` |
| Functional specs | `tests/app/functional/<service>/` | `kebab-case.spec.ts` |
| Auth setup | `tests/app/<name>.setup.ts` (such as `login.setup.ts`), run by the setup project `app-setup`; storage states in `.auth/app/`, which is generated and never committed | `<persona>Session.json` |
| Page objects | `pages/app/`; base classes and reusable components in `pages/baseClasses/`; the login page in `pages/util/` | `PascalCase.ts` |
| Helpers | `helpers/app/` for this app's API wrappers, body builders and seeders; `helpers/util/` for app-independent utilities | `kebab-case.ts` |
| Fixtures | `fixtures/pom/`: the barrel `test-options.ts`, which every spec imports `test` and `expect` from, and `page-object-fixture.ts`; API fixtures in `fixtures/api/`; service fixtures (login, accessibility scanner) in `fixtures/services/` | `<name>-fixture.ts`; the barrel is `test-options.ts` |
| Response schemas and invalid values | `fixtures/api/schemas/app/` per resource, `fixtures/api/schemas/util/` for shared ones; universal invalid-type arrays in `fixtures/api/invalid-types.ts` | `kebab-case.ts` |
| Enums | `enums/app/` | `kebab-case.ts` |
| Test data | static data in `test-data/app/`; typed factories in `helpers/app/`, next to the resource's helper until the `api-testing` extraction threshold moves them to `test-data-generators.ts` (the `data-strategy` skill owns the choice) | `kebab-case.json`; factories `kebab-case.ts` |
| Config | `config/env.ts` (the only reader of `process.env`), `config/app.ts` (`appConfig`), and `config/util/<service>.ts` when one service needs its own | — |
| Environment files | `env/.env.<environment>`, never committed; the committed template `env/.env.example` names every variable the env files hold (the `config` skill lists the ones that stay out) | — |
| npm scripts | `app-<tag>` for each tag in the repo's whitelist (the standard set in `test-standards`, or a set the repo kept), with the tag's name in lowercase and without the `@` (`@Smoke` → `app-smoke`); `app-all` for all of them | — |
| Load tests | `tests/perf/<test type>/`; shared k6 helpers in `tests/perf/lib/`, data files in `tests/perf/fixtures/` (`k6-load-testing`) | `kebab-case.ts` |

`<service>` (some skills say `<domain>`) is one folder per backend service, plus `shared/`; a product with a single backend uses one folder per product area instead, such as `orders/` and `identity/`. Which folders exist is a product fact, so the repo's own `CLAUDE.md` lists them.

A file of a kind this table lists that sits anywhere else, or is named otherwise, is **drift**. The repo's `CLAUDE.md` keeps a drift table with one row per area: the table row it belongs to, where it is now, and the date it will move. A drift file moves in its area's PR or when it is next touched, whichever comes first; an import-path update made by another area's move does not oblige the file to move: it may stay on the drift table until its own area moves or it is next touched for another reason (moving it early is still allowed); a new file always goes to the standard location and never copies a drift file's pattern. An npm script that CI still calls by an older name stays as an alias of its `app-<tag>` script, on the drift table, until CI is repointed. A repo still on the toolkit's earlier `@App-*` tags keeps its current scripts until its move to the standard set lands. The `standard-layout` lint rule fails a spec, setup file, fixture, the barrel, a page object or a k6 script that sits outside its row or is misnamed; the drift table's areas (folders or single files) go in its `drift` option, which excuses only a file that is out of place, and an area's move PR deletes both entries. Files of kinds the table doesn't list (`package.json`, `playwright.config.ts`, CI workflows) stay where the tools expect them.

---

## AI Workflow

1. **Route** — load the matching skill from the Routed Skill Index. For any create/generate/extend/refactor prompt, the `common-tasks` skill is the routing layer.
2. **Explore before generating** — UI: `playwright-cli` skill (`npx playwright open`). API: OpenAPI first, live capture only without docs. Skip only when the user provided the exact structure.
3. **Coverage plan (API only)** — enumerate every status code × method as a comment block before writing code.
4. **Search before creating** — grep for existing helpers, POMs, schemas, fixtures, enums to extend.
5. **Use fixtures** — import from `fixtures/pom/test-options.ts`; register new POMs in the fixture module.
6. **Generate data** — faker for unique-per-run, JSON for fixed constants.
7. **Verify compliance** — re-check the MUST and WON'T tables.
   An open choice on the way (approach, PR split) is not a stop: build each option on its own `alt/` branch and present them (`build-alternatives` skill).
8. **Run tests** — `npx playwright test [path]`. Failing tests = incomplete task. On failure load the `debugging` skill; never raise timeouts, add `try/catch`, or loosen schemas to pass.

---

## Session Memory — read before writing test code

`~/.claude/memories/learned_patterns.md` holds what previous sessions worked out the hard way: which locator survived a re-render, why a test was flaky and what fixed it, and the domain quirks a spec written from the story alone would miss. A project may keep its own copy at `memories/learned_patterns.md`.

| Rule | Requirement |
|------|-------------|
| **Read** | Before generating or refactoring any spec, page object or selector, read it. Re-deriving a recorded lesson is wasted work; contradicting one without falsifying it in the same edit is a defect. |
| **Write** | When you heal a selector, root-cause a flake, or hit a project edge case, record it **in the same edit as the fix**. Only if reusable, non-obvious and falsifiable — otherwise it goes in the PR description. |
| **Label** | Every entry carries `EXECUTED` / `STATIC` / `INFERRED`. `INFERRED` may suggest; it may never gate a decision. |
| **Cap** | 12 cases in § 2. Past that it is a landfill — merge or promote one out first. |
| **Graduate** | Recurs and holds twice → the repo's `.qe-memory/` store (`qe-pattern-memory` skill). A convention for every repo → a rule in the matching skill. Mechanically checkable → a lint rule. |

Every code snippet in that file is linted by `npm run test:memory` against the same rules as the test suite, because a bad pattern recorded there teaches every future session to write one.

---

## Routed Skill Index

Skills live at `~/.claude/skills/{name}/SKILL.md` and are discovered by their frontmatter description or forced by name. Read the matched skill **before** writing code.

| Skill | Load when |
|-------|-----------|
| `common-tasks` | Any create/generate/extend/refactor prompt — routing layer to the deep skills |
| `api-testing` | API specs — apiRequest, schemas, negative matrix, coverage, cleanup |
| `test-standards` | Any test — tags, Qase wiring, GIVEN/WHEN/THEN steps, placement |
| `selectors` | Locator work — priority hierarchy, Radix recipes, testid taxonomy |
| `page-objects` | Page objects — POM class structure, action methods, fixture registration |
| `fixtures` | Fixtures — DI, scoping, lifecycle, merge into `test-options` |
| `helpers` | Helpers — CRUD wrappers, body builders, cleanup ordering |
| `data-strategy` | Test data — JSON vs faker vs env vs API seeding |
| `type-safety` | Any `.ts` — Zod patterns, no-`any`, env read only through the config module |
| `enums` | Enums — naming and organization |
| `config` | Config — env-driven configuration |
| `playwright-cli` | UI exploration before any POM / UI test / UI-derived schema |
| `frontend-cross-check` | Verifying testids/strings/routes against a sibling frontend repo (`git pull` first) |
| `scaffold-spec` | Scaffolding a new spec file |
| `refactor-values` | Changing enum values/keys or static test-data values |
| `debugging` | Any test failure — failure taxonomy, UI Mode, Trace Viewer |
| `flakiness-triage` | Intermittent failures, passes-locally-fails-in-CI — **and** pre-merge flake hunting, risk scoring, quarantine policy |
| `mutation-testing` | "Do these tests assert anything?" — mutation score, surviving mutants, or fault injection for black-box repos |
| `defect-prediction` | "What do we test first?" — risk ranking from git history × complexity × coverage, with calibration |
| `qe-pattern-memory` | Cross-session learning — git-tracked pattern store with confidence, tier promotion and falsification |
| `pr-review` | Pre-push self-review against MUSTs and WON'Ts |
| `k6-load-testing` | Load / performance test work |
| `message-queue-testing` | Async messaging / queue / event-bus tests — delivery guarantees, ordering, dead-letter routing, retry & poison messages, idempotency, schema-validated envelopes |
| `accessibility-testing` | Accessibility (a11y) tests — axe scans per page state with `@axe-core/playwright`, WCAG A/AA tags, keyboard and focus checks, ARIA snapshots, known-violations policy |
| `owasp-security-testing` | Security testing — OWASP Top 10 (web) + API Security Top 10 mapped to QA tests; access control / BOLA / BFLA / injection / XSS / SSRF; pre-release security review gate |
| `quality-gate` | "Is this release-ready / can we ship / go-no-go" — synthesise coverage, security, flake, risk into one auditable verdict; thresholds from config, overrides need a named human |
| `ai-native-workflow` | "How should I work with AI here?", multi-skill planning |
| `build-alternatives` | About to ask the human to choose between ways of doing a clear task — build every way on `alt/` branches, then ask which to keep |
| `skill-creator` | Authoring or refactoring a skill (manual) — owns the SKILL.md structure contract |
| `test-case-generation` | Requirements + test cases from a user story / AC (manual) |

Personas available as slash commands: `/bug-helper` (triage-first bug reports), `/test-case-helper` (test-case packages from a story/ticket), `/requirement-analyst` (static requirements review), `/acceptance-criteria-writer` (user stories + Gherkin acceptance criteria from text or screenshots).

When a skill is added, removed, or renamed, **update this table**. When investigating backend/frontend behavior, `git pull` the relevant repo first — stale copies cause wrong assumptions.

---

## Verification Standard

When asked to verify, review, or confirm code — never skim and say "looks good":

1. **Re-read the actual files from disk** — not from memory.
2. **Check against the matching skill** — every applicable convention.
3. **Run the linter** on every modified file.
4. **List every issue found** — never fix silently and claim "all good."
5. **After fixing, re-read again** — verify what's on disk, not what you think you wrote.
6. **Run the tests** — `npx playwright test [path]`; report actual results. Failing tests = incomplete.
7. **Say "all good" only when** lint is clean, tests pass, and a re-read finds zero issues.

The bar: a second pass after "all good" must find **nothing new**.

---

## When You're Stuck

- **Test fails unexpectedly** — investigate root cause via `debugging` skill (UI Mode, Trace Viewer). Never raise timeouts, wrap in `try/catch`, or loosen a schema.
- **API doesn't match docs** — that's a bug; report it. Comment out the test with `// TODO: FIXME: <TICKET>`. Never `test.skip`.
- **`npx playwright open` can't reach the app / auth fails** — stop and ask the human with the exact issue. No substitute tools.
- **A rule contradicts reality** — surface it. Don't silently ignore.

---

## Adopting this in a repo

The constitution, the skills and the standard layout apply as they are. A repo that adopts the toolkit aligns to them, never the other way round:
1. Keep this file as-is.
2. Move the repo to § Standard repo layout and naming. A large repo can move one area — one row of the table — per PR; until an area has moved, it sits on the drift table described under the table. Move Config and Fixtures first, because every spec imports the barrel: that PR also updates the import line in the files still on the drift table, which changes their imports, not their location (this does not oblige them to move, see the drift rule under the table). It also makes `playwright.config.ts` collect `tests/app/{api,e2e,functional}/**` alongside the spec folders still on the drift table, and names the setup project `app-setup`. Tags follow `test-standards`: a new repo uses the standard set. The one deliberate exception is a repo that already ran another set before adopting the toolkit: it keeps that set, because its CI jobs, Qase filters and dashboards depend on those tags, and declares it in its project `CLAUDE.md`, together with its tag map (`test-standards` § Kept set: the tag map). A repo still on the toolkit's earlier `@App-*` set moves to the standard set in a change of its own.
3. Add a **project `CLAUDE.md`** at the repo root that holds what is the repo's own, and never its layout or naming: the service folders under `tests/app/*/`; the endpoint and test-id catalogs; a kept tag set and its tag map, if the repo has one; the inventories the skills ask to keep current (page objects, fixtures, helpers, enums, specs); whether the suite is parallel-safe, and with how many workers it runs if not; the drift table; and the system under test's context — architecture, vocabulary, performance targets and known issues — which `test-case-generation` and `/requirement-analyst` read.
