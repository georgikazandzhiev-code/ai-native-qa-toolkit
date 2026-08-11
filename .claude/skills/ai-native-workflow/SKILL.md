---
name: ai-native-workflow
description: Orientation for AI-assisted work in this repo. Use for "how should I work with AI here?", "which skill applies?", or planning a multi-step change that crosses several skills. Read before diving into a specific skill when routing is unclear. Not for implementation (use the matched skill) or skill authoring (use skill-creator).
---

# AI-Native Workflow

This skill is the **routing and onboarding layer** for AI-assisted work on this scaffold (Playwright v1.56 + TypeScript, multi-tenant network monitoring platform with Qase integration). It teaches you how the constitution (`~/.claude/CLAUDE.md`), the detail rule files, and the specialized skills fit together — and which one to load for which task. It does not own any rules itself; rules live in their respective files.

## Critical

- **`~/.claude/CLAUDE.md` is always loaded — read it first.** This skill teaches you how to *apply* it, never replaces it. If a rule appears to live here, that's drift — fix it.
- **Skills are detail; `~/.claude/CLAUDE.md` is the constitution.** Precedence per `~/.claude/CLAUDE.md § Precedence`: `~/.claude/CLAUDE.md` > scoped rule file (matched by glob) > skill (matched by area). Detail extends; it never overrides.
- **Match the task to the skill via the Routed Detail Index.** Do not free-text-guess a skill name — only the skills that actually exist as populated `SKILL.md` files in `~/.claude/skills/` are real.
- **When a task crosses skills, plan the sequence before writing code.** Multi-step changes load skills in order (e.g. `scaffold-spec` → `api-testing` → `data-strategy` → `debugging`); they do not stack five Critical blocks at once.
- **Audit-then-edit.** Before modifying any existing artifact, read it from disk. Never propose changes from memory or earlier context.
- **Verification Standard is non-negotiable.** Re-read from disk, run the linter, run the affected tests, report actual results. "Looks good" without verification is a Critical violation of `~/.claude/CLAUDE.md § Verification Standard`.
- **Surface drift, do not silently work around it.** When reality conflicts with a rule (an existing file violates the canonical pattern, or a `~/.claude/CLAUDE.md` line contradicts the matched skill), raise it with the human. The orchestrator's WON'T table is the refusal list.
- **Empty skill folders are not skills.** Folders that exist without a `SKILL.md` are placeholders. Do not invent their content; flag and stop.

## The three-layer model

| Layer | What | When it loads | Owns |
|-------|------|---------------|------|
| **L1 — Constitution** | `~/.claude/CLAUDE.md` — MUST / SHOULD / WON'T tables, AI Workflow, Routed Detail Index, Verification Standard | **Always loaded** at the start of every conversation | `~/.claude/CLAUDE.md` |
| **L2 — Skills** | `~/.claude/skills/<name>/SKILL.md` (+ optional `reference.md`, `templates.md`, `<topic>.md`) | Loaded by **area / trigger match** from the Routed Detail Index in `~/.claude/CLAUDE.md` | Each `SKILL.md` |

Skills extend the constitution. Conflict resolution is documented in `~/.claude/CLAUDE.md § Precedence`. The previous fat per-area rule files (`metrics-api-tests-context.mdc`, `test-case-generation.mdc`, `master-context.mdc`) were retired and consolidated into the matching skills. Where a repository provides a repo-context skill, its **thin glob routers** (`api-router.md`, `ui-router.md`) carry only that repo's service-domain folder maps plus pointers to the skills; all rule content lives in skills. Single source of truth per concern.

## Conversation contract

- **Audit-then-edit (default).** For anything beyond a one-line fix: read the affected files from disk, propose scope (what changes, in which files, why), wait for approval, apply, report what landed.
- **Direct mode (trivial work).** Obvious typos, single-line fixes, single-import additions: do it and report.
- **When to ask vs do.** Clarify ambiguous prompts (which endpoint? create or edit? which monitor type?). Stop and ask before destructive actions, before silently picking between two valid architectural options, or when the matched skill's Critical conflicts with the request.
- **When to refuse.** The `~/.claude/CLAUDE.md § WON'T` table is the refusal list. Forbidden patterns include: silent failures (`try/catch` on `expect`, raised timeouts, silent `.skip`), schema loosening to make a test pass, hardcoded secrets/IDs, XPath, `page.waitForTimeout`, `any`/`as any`/`@ts-ignore`, `--no-verify` to bypass hooks, IDE/Cursor browser tools or `npx playwright codegen` as substitutes for the sanctioned exploration workflow (see the `playwright-cli` skill — uses `npx playwright open`).
- **Verification before "done".** Walk `~/.claude/CLAUDE.md § Verification Standard`: re-read from disk, lint, run the affected tests, report the actual result. A task with failing tests is not complete.

## Skill-routing matrix

Authoritative source: `~/.claude/CLAUDE.md § Routed Detail Index`. The table below mirrors that index, restricted to skills that are actually populated. Empty placeholders are listed at the bottom and must not be routed to.

### Populated skills

| Task signal | Skill | Pairs with |
|-------------|-------|------------|
| Editing `tests/app/api/**`, `fixtures/api/**` — schemas, helpers, negative matrix | `api-testing` | `test-standards` (spec structure) |
| `pages/**` locator priority, allowed/forbidden patterns | `selectors` | `page-objects` (POM class structure) |
| `pages/**` POM class structure, `extends BasePage`, fixture registration | `page-objects` | `selectors` (locators) |
| `tests/**` — tag whitelist, Qase wiring, `test.step`, scenario inventory | `test-standards` | `api-testing` / `page-objects` (per spec type) |
| Any "create / generate / extend / refactor" prompt — routing layer + framework-wide rules | `common-tasks` | every authoring skill |
| UI exploration before authoring page objects, UI tests, or UI-derived schemas | `playwright-cli` (uses `npx playwright open`) | `selectors`, `page-objects` |
| Cross-checking claims about the frontend (testids, message strings, routes) against `<sibling-repos>/frontend` source | `frontend-cross-check` | `playwright-cli`, `selectors`, `enums` |
| `config/**` env-driven configuration, `appConfig.api.*` / `appConfig.paths.*` | `config` | `~/.claude/CLAUDE.md` MUST: Sources of Truth |
| `enums/**` naming and organization (suites, messages, statuses, roles) | `enums` | `~/.claude/CLAUDE.md` MUST: Sources of Truth |
| `helpers/**` — resource CRUD wrappers, body builders, cleanup, auth bootstrap | `helpers` | `api-testing § Helpers` |
| `fixtures/**` — page-object DI, `apiRequest`, `mailpit`, `loginUser`, scoping rules | `fixtures` | `api-testing § Three callable shapes` |
| Any `.ts` — Zod 3 schemas, `z.strictObject()`, no `any`, `process.env.X!` access | `type-safety` | `api-testing § Zod schema conventions` |
| `test-data/**` — JSON vs faker vs env vs API seeding, three-tier invalid-value rule | `data-strategy` | `api-testing` |
| Changing enum values, enum keys, or static `test-data/` values | `refactor-values` | `enums`, `data-strategy` |
| Test failed or behaves unexpectedly — failure-mode taxonomy, UI Mode / Trace Viewer | `debugging` | `selectors`, `api-testing` |
| Test fails intermittently / passes locally fails in CI / passes alone fails in suite | `flakiness-triage` | `debugging`, `helpers` |
| Pre-push self-review against framework MUSTs and WON'Ts (single tag, qase.suite, schema.parse, no `any`, cleanup) | `pr-review` | `test-standards`, `api-testing`, `selectors` |
| Scaffolding a new spec file from project conventions | `scaffold-spec` | `api-testing`, `test-case-generation` |
| Load / performance test work | `k6-load-testing` | — |
| Authoring or refactoring a skill (manual invocation only) | `skill-creator` | `~/.claude/CLAUDE.md § Skill File Structure` |
| Cross-repo platform encyclopedia (backend, frontend, collectors, infra) | `master-context` (manual invocation) | every domain skill |
| Generating test cases from a user story / AC | `test-case-generation` (manual invocation) | `master-context` |
| Metrics-API endpoints — synthetic-metrics, data-query, data-metrics specs | `metrics-api-tests-context` (manual invocation) | `api-testing` |
| "How should I work with AI here?", planning a multi-step change | **this skill** | `~/.claude/CLAUDE.md` |

When a skill is added or removed, update both `~/.claude/CLAUDE.md § Routed Detail Index` and this matrix.

## 7-phase task lifecycle

Each phase ties back to a `~/.claude/CLAUDE.md` rule. Walk in order; stop and surface if a phase cannot be completed.

1. **Understand** — re-read the prompt, restate the goal in one sentence, confirm the work category (new artifact / edit / refactor / debug / investigate).
2. **Locate** — open `~/.claude/CLAUDE.md § Routed Detail Index`. Identify the matching detail rule (by glob) and the matching skill (by area). If both exist, load the rule first, then the skill.
3. **Audit** — read existing code from disk (`ls`, then `Read` the relevant files). Never propose from memory. For API work, also confirm the endpoint contract via OpenAPI; for UI work, run `npx playwright open` (see the `playwright-cli` skill) per `~/.claude/CLAUDE.md` MUST: Explore Before Generate.
4. **Plan** — for multi-step or multi-file changes, write the scope: what changes, in which files, why, what's deliberately out of scope. Wait for human approval on non-trivial work.
5. **Generate** — author the code following the matched skill's `## Critical` rules and the relevant `~/.claude/CLAUDE.md` MUST/WON'T entries. Re-check the Critical block while generating, not after.
6. **Verify** — walk `~/.claude/CLAUDE.md § Verification Standard`: re-read from disk, run the linter, run the affected tests (`npx playwright test [path]`), report actual results. On red, load the `debugging` skill — failure-mode taxonomy, UI Mode / Trace Viewer / Inspector workflow.
7. **Surface** — report what changed (files, substantive edits), flag any drift discovered (legacy filename inconsistency, schema duplication, dead code), and ask whether to commit.

## Principles that make this scaffold AI-native

- **Single source of truth per concern.** Each domain has one canonical skill — no per-area paired rules. `api-testing` for API specs, `page-objects` + `selectors` + `test-standards` for UI specs. The orchestrator (`~/.claude/CLAUDE.md`) holds framework-wide invariants; skills hold the per-area rules and workflows.
- **`## Critical` block at the top of every `SKILL.md`.** The model can scan the hard rules in 30 seconds before reading the workflow.
- **Layered topology.** Constitution → detail rule files → skills. One source per concern; precedence is documented.
- **Routed by glob / area, not by free text.** The Routed Detail Index makes skill selection deterministic — the model does not have to guess.
- **One source of truth per concern.** URLs/credentials in `process.env.*` (declared in `env/.env.example`); endpoint paths and route constants in `config/app.ts` (`appConfig.api.*`, `appConfig.paths.*`); message strings, suite names, role names, status values in `enums/app/*` and `enums/util/*`; fixed test constants in `test-data/app/*.json`. Per `~/.claude/CLAUDE.md § Sources of Truth`, paths live in `config/`, NOT in `enums/`.
- **Drift is surfaced explicitly in skills.** When a skill documents the canonical pattern but the codebase still has the legacy form, it says so (e.g. `api-testing` cites `docs/framework-alignment-plan.md` § 5.1, § 5.4, § 6.6, § 6.7). The next person to touch the file converges; they don't perpetuate the drift.
- **Hard-stop forbidden patterns.** `~/.claude/CLAUDE.md § WON'T` and each skill's `## Anti-patterns` list refusal triggers, not soft preferences.

## Anti-patterns

- ❌ Diving into a task without consulting `~/.claude/CLAUDE.md § Routed Detail Index`.
- ❌ Generating code that contradicts what's already on disk — audit first.
- ❌ Inventing skill names, file paths, env-var names, or enum values the model "thinks" are there. Only the actual files in `~/.claude/skills/` and `.cursor/rules/` are real.
- ❌ Routing to an empty placeholder skill (`common-tasks`, `page-objects`, `test-standards`). Flag the gap; fall back to `~/.claude/CLAUDE.md` + the matching detail rule file.
- ❌ Skipping verification. "The test should pass" is not a verification result. Run the linter, run the tests, report actual output.
- ❌ Treating a skill as the constitution. `~/.claude/CLAUDE.md` wins on conflict, every time.
- ❌ Restating rules from another skill in this skill. This is the routing layer; rules live in their owners.
- ❌ Stacking five skills' Critical blocks before writing a single line. Load one entry-point skill; chain to the next only when the first phase is done.
- ❌ Substituting another browser tool (IDE browser MCP, Cursor browser, `npx playwright codegen`) when `npx playwright open` cannot reach the app. Per `~/.claude/CLAUDE.md § No substitute UI exploration`, stop and notify the human.
- ❌ Silent coverage drops, schema loosening, raised timeouts, or `try/catch` on `expect` to make red turn green. Load `debugging` — it owns the failure-mode taxonomy and the right tool per failure type.

## Self-review checklist

Before declaring a task done:

- [ ] Loaded the global constitution (`~/.claude/CLAUDE.md`) and, where the repository provides one, its repo-context skill / router.
- [ ] Loaded the matching skill from `~/.claude/skills/` via the Routed Detail Index — confirmed it's populated, not an empty placeholder.
- [ ] Audited existing code from disk before adding anything new.
- [ ] Ran `npx playwright open` for UI work (see the `playwright-cli` skill) or consulted OpenAPI for API work, per `~/.claude/CLAUDE.md § Explore Before Generate`.
- [ ] Followed the matched skill's `## Critical` block while generating.
- [ ] Linter is clean (`eslint .` or pre-commit hook).
- [ ] The affected tests were run and pass (`npx playwright test [path]`).
- [ ] Re-read the final state from disk per `~/.claude/CLAUDE.md § Verification Standard`.
- [ ] Surfaced any drift discovered (legacy filenames, dead code, duplicated shared schemas, contradictions between the rule and the skill).

## Examples

### Example 1 — Adding API tests for a new endpoint

User: *"Add API tests for `POST /api/v1/synthetics/{id}/pause`."*

1. **Understand** — new artifact: API spec for one endpoint with a path parameter.
2. **Locate** — `tests/app/api/**` → Routed Detail Index → load `api-testing` skill (carries the previous `api-tests.mdc` invariants + workflow).
3. **Audit** — `ls config/app.ts`, `ls fixtures/api/schemas/app/`, `ls helpers/app/`. Confirm whether `SYNTHETICS_PAUSE` already exists as a route constant.
4. **Plan** — schema additions, helper need (likely none — single-spec call), coverage plan from OpenAPI (200/400/401/403/404/405/409), test-data needs.
5. **Generate** — follow `api-testing § Authoring a new API spec` (10-step workflow) + `api-testing § Critical`. Schema goes in `fixtures/api/schemas/app/synthetic.ts` as `z.strictObject`, re-export from the barrel. Spec follows `Verify <METHOD> <path> returns <status>` naming.
6. **Verify** — `npx playwright test tests/app/api/monitoring-service/synthetics/synthetic-pause.spec.ts --grep "@App-API"` + `eslint .` + re-read from disk.
7. **Surface** — report files added, flag any drift caught (e.g. duplicated `APIErrorSchema`).

### Example 2 — Investigating a flaky UI test

User: *"`tests/app/functional/monitoring-service/synthetics/dns-create-edit-monitor.spec.ts` flakes on CI but passes locally."*

1. **Understand** — debug task, suspected isolation or env drift.
2. **Locate** — `tests/app/functional/**` → Routed Detail Index → load `debugging` skill (failure-mode taxonomy + Trace Viewer / UI Mode workflow), plus `selectors` + `playwright-cli` if a locator looks suspect after re-exploration. UI invariants live in `page-objects` + `selectors` + `test-standards`.
3. **Audit** — read the spec from disk. Pull the CI artifact (`gh run download`), open the trace.
4. **Plan** — root-cause first (env? race? isolation?), no scope creep into unrelated cleanup.
5. **Generate** — fix at root cause (e.g. add a readiness probe in `auth.setup.ts`). Re-run `npx playwright open` (see the `playwright-cli` skill) if a locator looks suspect.
6. **Verify** — push, watch CI, re-run locally with `ENVIRONMENT=ci`.
7. **Surface** — report root cause and the diagnostic path you walked (which Playwright tool, what the trace showed, why this fix is the minimal one).

### Example 3 — Adding a new env variable

User: *"Add `MAILPIT_URL` env var so we can swap the Mailpit instance."*

1. **Understand** — add an env-driven config value.
2. **Locate** — `config/**` → load `config` skill (env file layout, JSDoc-on-properties, deferral to `type-safety` for the access pattern). `enums/**` is **NOT** the right home — per `~/.claude/CLAUDE.md § Sources of Truth`, paths live in `config/`, not in `enums/`. Also load `type-safety` for the canonical `process.env.X!` access pattern.
3. **Audit** — read `config/app.ts`, `config/util/mailpit.ts`, `env/.env.example`. Grep for any existing `MAILPIT_URL` reference.
4. **Plan** — declare in `env/.env.example`, consume via `process.env.MAILPIT_URL!` (canonical `!` per `type-safety`; defaults belong in `config/util/mailpit.ts`, not at call sites), update `config/util/mailpit.ts`.
5. **Generate** — follow the `config` skill's pattern. Do NOT add the path to `enums/` — that's the legacy split that `~/.claude/CLAUDE.md` explicitly forbids.
6. **Verify** — `tsc --noEmit`, `eslint .`, run the affected Mailpit-using tests.
7. **Surface** — report: var declared, consumer updated, no `enums/` change.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Which skill applies to this task?" | Skill-routing decision | Open `~/.claude/CLAUDE.md § Routed Detail Index`. Match the glob/trigger to the skill column. If no row matches, default to `~/.claude/CLAUDE.md` + ask the human. |
| `~/.claude/CLAUDE.md` and skill X disagree | Drift, or order-of-precedence misread | `~/.claude/CLAUDE.md` wins. Surface the disagreement to the human and (when appropriate) note it should be reconciled in the skill. |
| Tempted to silently work around a rule | Forbidden | The `~/.claude/CLAUDE.md § WON'T` table is the refusal list — refuse and route to the matching MUST/SHOULD entry instead. |
| "I don't know what's already in the codebase" | Audit step skipped | Read from disk first (`ls`, then `Read`). Per `~/.claude/CLAUDE.md § Search Before Creating`, grep `helpers/`, `pages/`, `fixtures/`, `enums/`, `config/` before adding anything. |
| Skill folder exists but `SKILL.md` is missing | Empty placeholder | Flag the gap and stop. Fall back to `~/.claude/CLAUDE.md` § Routed Detail Index for the closest sibling skill. Do not invent the skill's content. |
| The matched skill is `common-tasks` (referenced from `~/.claude/CLAUDE.md § Code Generation Tasks`) but the folder is empty | Documented gap — `common-tasks` is referenced as authoritative but not yet authored | Use this skill's `## Anti-patterns` + `## Self-review checklist` + the matching detail rule file as the substitute. Surface the gap so it can be authored. |
| `npx playwright open` cannot reach the app or auth fails, but UI exploration is required | `~/.claude/CLAUDE.md § Explore Before Generate` forbids substitutes | Stop and notify the human (with the exact issue: missing storage state, expired session, wrong URL, network unreachable). Do not use IDE browser MCP, Cursor browser tools, or `npx playwright codegen`. |
| Wanting to load five skills' Critical blocks at once | Skill stacking | Load the entry-point skill only. It chains to the next one as the workflow phase requires. If the work genuinely needs three Critical blocks at once, the task is too big — split it. |
| "All good" without running tests | Verification skipped | Re-read `~/.claude/CLAUDE.md § Verification Standard`. A task with failing or unrun tests is not complete. |

## See Also

- **`~/.claude/CLAUDE.md`** — the always-on orchestrator. The **only rule file** in this repo. This skill teaches how to apply it.
- **API authoring:** [`api-testing`](../api-testing/SKILL.md) — full per-area workflow + endpoint context (consolidated from the previous `api-tests.mdc`).
- **UI authoring:** [`page-objects`](../page-objects/SKILL.md), [`selectors`](../selectors/SKILL.md), [`test-standards`](../test-standards/SKILL.md) — class structure, locator strategy, spec conventions (consolidated from the previous `ui-tests.mdc`).
- **Domain orientation:** `master-context` (project repo only — trimmed from this toolkit), `metrics-api-tests-context` (project repo only — trimmed from this toolkit), [`test-case-generation`](../test-case-generation/SKILL.md) (manual invocations).
- **Populated skills** in `~/.claude/skills/`: `ai-native-workflow` (this), `api-testing`, `common-tasks`, `config`, `data-strategy`, `debugging`, `enums`, `fixtures`, `flakiness-triage`, `frontend-cross-check`, `helpers`, `k6-load-testing`, `page-objects`, `skill-creator`, `playwright-cli`, `pr-review`, `refactor-values`, `scaffold-spec`, `selectors`, `test-case-generation`, `test-standards`, `type-safety`.
- **`skill-creator`** — for authoring or refactoring a skill (manual invocation only). Use this when you catch a gap (e.g. when an empty placeholder needs to be authored).
