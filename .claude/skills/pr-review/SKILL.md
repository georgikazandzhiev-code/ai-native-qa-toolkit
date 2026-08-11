---
name: pr-review
version: 1.0.0
description: Pre-push self-review — walks every changed file against the matching skill's Critical block plus framework MUSTs (single tag, qase.suite, schema.parse, test-options import, no any/XPath/waitForTimeout, cleanup). Use before opening a PR or pushing a branch. Triggers — "review my PR", "ready to push", "pre-push check". Not a bug/efficiency review (/code-review) and not a substitute for running the specs.
metadata:
  category: running
---

# PR Review Skill

Last-line-of-defense self-review before a PR opens. The framework already has `/code-review` (generic bugs), `/review-changes` (deep skill-canon scan), and `/security-review` (security). This skill is narrower and faster: a **mechanical convention check** against the framework's MUSTs and WON'Ts, organized so you can finish in a few minutes before pushing.

## Critical

- **ALWAYS run this skill BEFORE `git push`.** Husky's `lint-staged` only runs ESLint + Prettier on staged files; it cannot catch a missing `qase.suite()`, a `getByTestId` violating the Radix exception, or a leftover `console.log`. This skill closes that gap.
- **ALWAYS run the affected specs with `--workers=1` before declaring the PR ready.** A passing lint is not a passing test. Per memory: shared tenant env causes cross-spec flakes in parallel — always single-worker.
- **NEVER bypass this skill to ship faster.** Every shipped convention violation becomes future drift. The 5 minutes this skill takes saves a reviewer round-trip.
- **NEVER reuse this skill for actual bug-hunting or efficiency review.** Bugs are `/code-review`. Skill-canon depth is `/review-changes`. This skill is the convention layer between them.

## What's in each file

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | The mechanical PR checklist, organized by changed-file kind. | **Always** — on any pre-push or PR review task. |

## Workflow

### Step 1 — Get the changed-file inventory

```bash
# Files modified vs the base branch (usually main)
git diff --name-status main...HEAD

# Or vs origin if you've pushed before
git diff --name-status origin/main...HEAD
```

Group the output by **file kind** — each kind has its own checklist below:

- **Spec files** (`tests/app/**/*.spec.ts`)
- **Page objects** (`pages/app/**/*.ts`, `pages/baseClasses/**/*.ts`)
- **Helpers** (`helpers/app/**/*.ts`, `helpers/util/**/*.ts`)
- **Zod schemas** (`fixtures/api/schemas/app/**/*.ts`)
- **Fixtures** (`fixtures/**/*.ts`)
- **Enums / config / static data** (`enums/**`, `config/**`, `test-data/**`)
- **Skills / rules** (`~/.claude/skills/**`, `.cursor/rules/**`, `CLAUDE.md`)

### Step 2 — Per-kind checklist

#### Spec files (`tests/app/**/*.spec.ts`)

Routed skill: [`test-standards`](../test-standards/SKILL.md). Walk every modified spec:

- [ ] `import { test, expect } from "fixtures/pom/test-options"` — never from `@playwright/test`
- [ ] Each `test(...)` has **exactly one** tag from the whitelist (`@App-API | @App-E2E | @App-Smoke | @App-regression` — lowercase `regression`, matching the `package.json` greps). No combined tags. No tags on `test.describe(...)`.
- [ ] Each `test(...)` body opens with `qase.suite(SUITES.<NAME>);`. If a Qase ID exists, `qase.id(N);` is present; if not, commented out (never deleted).
- [ ] Multi-step tests use `test.step("GIVEN/WHEN/THEN ...", ...)` for each phase.
- [ ] Web-first assertions only (`expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveCount()`). **No `page.waitForTimeout(...)`.**
- [ ] **No `try/catch` around `expect`.** The only allowed `try/catch` is capturing an accidentally-created resource ID for cleanup.
- [ ] **No `if`/`else`/ternary in test bodies.** Tests are deterministic; one case per test.
- [ ] Page objects consumed via fixture destructuring (`async ({ syntheticsPage }) => {...}`). **No `new SyntheticsPage(page)`** inside the test.
- [ ] State-mutating tests have `afterEach`/`afterAll` cleanup via the matching `helpers/app/<resource>.ts` helper. **No UI deletes** — API only.
- [ ] **No `test.only(...)`** anywhere. **No `.skip` without `// FIXME: <TICKET>`** — or use the comment-out-with-TODO pattern instead of `test.skip`.
- [ ] **No `console.log`/`console.debug`** in committed code.
- [ ] **No commented-out scratch code** — only `// TODO:`, `// FIXME:`, `// BUG:` with context.

API specs additionally — routed skill: [`api-testing`](../api-testing/SKILL.md):

- [ ] Coverage plan comment at the top of the spec enumerates every status code from the OpenAPI spec.
- [ ] Every API response asserted with the exact idiom: `expect(SchemaName.parse(body)).toBeTruthy();` — not bare `Schema.parse(body)`.
- [ ] **No redundant field assertions after `Schema.parse`** (`expect(body.id).toBeTruthy()`, `expect(typeof body.id).toBe("string")` — these are noise; the schema proved it).
- [ ] Per-field omission tests and per-field invalid-type loop tests are present for required fields. Empty-body-only 400 test is insufficient.
- [ ] If a status code can't be tested (e.g. 403 token not provisioned), test is commented-out with `// TODO: FIXME: <TICKET>` — not silently dropped.

#### Page objects (`pages/app/**`, `pages/baseClasses/**`)

Routed skills: [`page-objects`](../page-objects/SKILL.md), [`selectors`](../selectors/SKILL.md):

- [ ] New POMs extend `BasePage` (except `SideNavigation` and `LoginPage` exceptions).
- [ ] Locators are `get accessor` returning `Locator`. **Not async. Not `Promise<Locator>`. No `readonly` field in constructor.**
- [ ] **No JSDoc on locator getters.** JSDoc with `@param`/`@returns` is required only on public action methods.
- [ ] Every public action method has a built-in wait: web-first assertion, `waitForResponse`, or toast check. **No "thin" methods** that only call `click()` / `fill()`.
- [ ] Locator priority: `getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > getByAltText/Title > page.locator(css)`. **Radix exception:** `getByTestId` jumps above `getByText` for Radix primitives, state-changing text, and testid contracts.
- [ ] **No XPath.** **No top-level CSS class/id selectors** (`page.locator('.btn')`, `page.locator('#foo')`). CSS only chained off a higher-priority anchor.
- [ ] **No `page.waitForTimeout(...)`.**
- [ ] Form/CRUD POMs include feedback locators (success toast, error toast, field validation, empty state, loading).
- [ ] New POMs are registered on `FrameworkFixtures` in [`fixtures/pom/page-object-fixture.ts`](../../../fixtures/pom/page-object-fixture.ts).
- [ ] Radix trigger-swallow `try/catch` (the one allowed exception) is annotated `// eslint-disable-next-line playwright/no-force-option -- Radix trigger retry`.
- [ ] **Substring match guard:** Every `filter({ hasText: value })` and `getByText(value)` in a dynamic method (where `value` is a parameter) uses `{ exact: true }` or wraps in `filter({ has: page.getByText(value, { exact: true }) })`. Substring matching causes false positives when one name is a prefix of another (e.g., "Item9" matching "Item90").
- [ ] **Post-action table stabilization:** Any action method that triggers a data reload (pagination click, sort header click, page-size change, filter toggle) ends with `await this.waitForTableSettled()` or equivalent. Asserting only the UI control change (e.g., page counter updated) without waiting for rows to reload is a flake source.
- [ ] **Cross-POM duplication check:** If the PR adds the same method body to 2+ POMs, flag it. Identical logic belongs in `DataTableBase` (for table-bearing pages) or a shared base class / utility. One implementation, one place to fix.

#### Hygiene (all file kinds)

- [ ] **Dead code sweep:** For every file deleted or substantially refactored in the PR, grep for consumers (`git grep <ClassName>`, `git grep <functionName>`). Files with zero imports/references are dead code — delete them. README/doc references to deleted files must also be cleaned up.

#### Helpers (`helpers/app/**`, `helpers/util/**`)

Routed skill: [`helpers`](../helpers/SKILL.md):

- [ ] First arg of every exported helper is `apiRequest: ApiRequestFn`. Last optional arg is `headers?: string`.
- [ ] No Zod schema authored inside a helper — schemas live only in `fixtures/api/schemas/app/`.
- [ ] Cleanup helpers use `Promise.allSettled` and tolerate 404s (resource may already be gone).
- [ ] Cleanup ordering respects FK constraints (synthetics-before-probes).
- [ ] New files use **kebab-case** filenames (`admin-tenants.ts`, not `adminTenants.ts`).

#### Zod schemas (`fixtures/api/schemas/app/**`)

Routed skills: [`api-testing`](../api-testing/SKILL.md), [`type-safety`](../type-safety/SKILL.md):

- [ ] New schemas use `z.strictObject()` (rejects extra keys — catches API drift).
- [ ] String formats use the chained validators: `z.string().uuid()`, `.email()`, `.url()` — not regex.
- [ ] **No `z.any()`** to silence a `ZodError`. If the API is non-deterministic, file a ticket and either `.optional()` correctly or block the test with `// FIXME: <TICKET>`.
- [ ] **No `unknown` past the call site.** Use `z.infer<typeof Schema>` for the type.

#### Fixtures (`fixtures/**`)

Routed skill: [`fixtures`](../fixtures/SKILL.md):

- [ ] New fixture is registered into `fixtures/pom/test-options.ts` via `mergeTests`.
- [ ] Default scope `{ scope: 'test' }`. `{ scope: 'worker' }` only for genuinely expensive shared setup (auth storage) — never for per-test state.
- [ ] File name is kebab-case + `-fixture.ts` suffix.

#### Enums / config / static data

Routed skills: [`enums`](../enums/SKILL.md), [`config`](../config/SKILL.md), [`data-strategy`](../data-strategy/SKILL.md):

- [ ] Repeated UI strings used in `getByText` come from `enums/app/*`. No hardcoded strings in specs/POMs.
- [ ] Endpoint paths live in `config/app.ts` under `appConfig.api.*` (API) or `appConfig.paths.*` (UI routes) — not in `enums`.
- [ ] Env values use `process.env.X!` (non-null assertion at every access). **No `??` / `||` defaulting at call sites.** Defaults belong in `config/util/<service>.ts`.
- [ ] Changing an existing enum value, key, or `test-data/*.json` value? You should have used the [`refactor-values`](../refactor-values/SKILL.md) skill — every consumer must be updated atomically.

#### Skills / rules (`~/.claude/skills/**`, `.cursor/rules/**`, `CLAUDE.md`)

Routed skill: [`skill-creator`](../skill-creator/SKILL.md):

- [ ] New skill's `SKILL.md` is **<500 lines** (Anthropic's canonical guidance).
- [ ] Frontmatter has `name` (lowercase + hyphens, max 64 chars, no "anthropic"/"claude") and `description` (<1024 chars, follows `[what] + [when] + triggers + "Do NOT use for X (use the <other> skill)"`).
- [ ] Supplementary files (`reference.md`, `templates.md`, `<topic>.md`) have **Load-When** annotations in SKILL.md's `## What's in each file` table.
- [ ] **No README.md** inside the skill folder. Docs go in SKILL.md or `references/`.
- [ ] Cross-skill references use relative paths (`../<skill>/SKILL.md`).
- [ ] Renamed/deleted skills updated in `~/.claude/CLAUDE.md § Routed Detail Index`.

### Step 3 — Run the affected specs

```bash
# Spec-by-spec, single worker, before pushing
npx playwright test tests/app/path/to/changed-spec.spec.ts --workers=1

# Or the full tag for the affected layer
npm run app-regression  # or app-api, app-e2e, app-smoke, app-sanity
```

**A PR with failing tests is not ready to ship.** Per the framework's verification standard.

### Step 4 — Run the linter & type-check

```bash
npx eslint <changed files>     # zero warnings expected
npx tsc --noEmit               # zero type errors expected
```

Husky `lint-staged` will run `eslint --fix` + `prettier --write` on commit automatically. **Never bypass with `git commit --no-verify`.**

### Step 5 — Write the PR description

Required sections:

- **Summary** (1–3 bullets): what changed and why
- **Test plan**: bulleted checklist of what was run, with `--workers=1` results
- **Risk / blast radius**: if the change touches shared infra (base classes, fixtures, helpers), list affected specs

## Decision tree — which review skill to load

```
Need a check before pushing?
   │
   ├─ Bugs / correctness / efficiency?         → /code-review (or /simplify for cleanup-only)
   ├─ Security / authorization concerns?       → /security-review
   ├─ Deep skill-canon compliance scan?        → /review-changes (regex-bypass semantic review)
   ├─ Framework convention check (this skill)? → pr-review
   ├─ Test ran but flaked?                     → flakiness-triage
   └─ Test failed reproducibly?                → debugging
```

`pr-review` is the lightest of these — load it FIRST, then escalate to the deeper skills if it surfaces something the convention check can't classify.

## Anti-patterns

- ❌ Skipping the affected-spec run "because lint passed". Lint doesn't run Playwright; you don't know the spec works.
- ❌ Running with default parallelism (`--workers` not set). Always `--workers=1` for this framework — shared tenant env interference.
- ❌ Bypassing husky with `--no-verify` because pre-commit is "slow". The hook catches real issues; investigate failures, don't bypass.
- ❌ Letting commented-out scratch code ship "to revisit later". Either keep it with a `// TODO:` + ticket reference, or delete.
- ❌ Pushing a PR description that says "small fixes" with no test plan. Reviewers (and your future self) need to know what was tested.
- ❌ Using `pr-review` as a replacement for `/code-review`. The two answer different questions.
- ❌ Using `pr-review` on a draft that's still mid-change. Run it on the last commit before push — running mid-stream wastes effort because the next commit may invalidate findings.
- ❌ `filter({ hasText: name })` without `exact: true` — substring collision risk. "Item9" matches "Item90". Always use `filter({ has: page.getByText(name, { exact: true }) })` for dynamic values.
- ❌ Copy-pasting methods (`cellForRow`, `getColumnTexts`, pagination helpers) into multiple POMs instead of extracting to `DataTableBase` or a shared component. One copy drifts, one gets updated — guaranteed divergence.

## Self-review checklist

Before declaring the PR ready:

- [ ] Walked the per-kind checklist above for every file in `git diff --name-status main...HEAD`.
- [ ] Ran `npx playwright test <affected> --workers=1` and recorded pass/fail.
- [ ] Ran `npx eslint <changed>` and `npx tsc --noEmit` — both clean (or pre-existing errors are documented).
- [ ] PR description has Summary + Test plan + Risk sections.
- [ ] No `.only`, no `console.log`, no commented-out code without context, no `test.skip` without a ticket.
- [ ] Renamed/deleted skills updated in `~/.claude/CLAUDE.md`.
- [ ] If the change touches shared infra (BasePage, fixtures, base helpers): listed downstream-affected specs in the Risk section.

## Examples

### Example 1 — Pre-push self-review of a 3-file PR

```
git diff --name-status main...HEAD
# M tests/app/api/alerts/alerts.spec.ts
# M pages/app/AlertsPage.ts
# A helpers/app/alerts.ts
```

Walk:
1. **`alerts.spec.ts`** — spec-file checklist: import ✓, single tag (`@App-API`) ✓, `qase.suite(SUITES.API_ALERTS)` ✓, `test.step` ✓, web-first assertions ✓, no `try/catch` ✓, no `if`, no UI cleanup, schema validation idiom ✓.
2. **`AlertsPage.ts`** — POM checklist: extends `BasePage` ✓, locator getters ✓, no JSDoc on getters ✓, action methods have waits ✓, feedback locators present ✓, registered in `page-object-fixture.ts` ✓.
3. **`alerts.ts`** (new helper) — helper checklist: `apiRequest` first arg ✓, no Zod schema inside ✓, cleanup `Promise.allSettled` ✓, kebab-case filename ✓.
4. **Run:** `npx playwright test tests/app/api/alerts/alerts.spec.ts --workers=1` — green.
5. **Lint:** clean. **tsc:** clean.

Push.

### Example 2 — Pre-push catches a convention miss

`git diff` shows a new POM with no fixture registration. The pr-review checklist's "registered on `FrameworkFixtures`" line catches it. Without this check, the PR would have shipped with a POM that tests can't access via fixture destructuring → next reviewer round-trip.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "`pr-review` says my PR is ready but reviewer found 3 violations" | The skill missed those because it's mechanical, not semantic | Add `/review-changes` to the loop for semantic depth |
| "Husky is blocking on lint but `eslint` shows zero errors" | `lint-staged` runs `eslint --fix` then re-stages; an unfixable error (like a real type error) blocks | Run `npx tsc --noEmit` to find the real cause; don't `--no-verify` |
| "Spec passed locally but the PR pipeline is red" | Local ran with default workers; CI uses single worker but cross-spec interference | Load [`flakiness-triage`](../flakiness-triage/SKILL.md) — likely cross-test interference, not your spec's bug |
| "I changed a base class — what's the blast radius?" | Affects every consumer | `git grep -l "extends BasePage"` (or the changed class) and run each consumer's spec |

## See Also

- [`test-standards`](../test-standards/SKILL.md) — spec-file conventions (tag, qase, test.step, fixture import).
- [`page-objects`](../page-objects/SKILL.md) — POM class structure rules.
- [`selectors`](../selectors/SKILL.md) — locator priority, Radix exception.
- [`api-testing`](../api-testing/SKILL.md) — Zod validation idiom, negative-test matrix.
- [`helpers`](../helpers/SKILL.md) — helper signature, cleanup discipline.
- [`type-safety`](../type-safety/SKILL.md) — no `any`, `process.env.X!` pattern.
- [`flakiness-triage`](../flakiness-triage/SKILL.md) — when the run is flaky, not red.
- [`debugging`](../debugging/SKILL.md) — when the run is red and you need to diagnose.
- [`owasp-security-testing`](../owasp-security-testing/SKILL.md) — pair its `review-checklist.md` for a security pass on the diff (access control, auth, injection, misconfiguration).
- Slash commands: `/code-review` (bugs), `/review-changes` (deep skill canon), `/security-review`, `/simplify`.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Verification Standard codifies the don't-say-"looks-fine" rule.
