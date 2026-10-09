---
name: ai-native-workflow
version: 2.1.3
description: Orientation for AI-assisted work in this repo. Use for "how should I work with AI here?", "which skill applies?", or planning a multi-step change that crosses several skills. Read before diving into a specific skill when routing is unclear. Not for implementation (use the matched skill) or skill authoring (use skill-creator).
metadata:
  category: cross-cutting
---

# AI-Native Workflow

This skill is the **routing and onboarding layer** for AI-assisted work on this scaffold (Playwright v1.56 + TypeScript, multi-tenant scheduled-jobs platform with Qase integration). It teaches you how the constitution (`~/.claude/CLAUDE.md`), the on-demand skills, and the manual personas fit together — and which one to load for which task. It does not own any rules itself; rules live in their respective files.

## Critical

- **`~/.claude/CLAUDE.md` is always loaded — read it first.** This skill teaches you how to *apply* it, never replaces it. If a rule appears to live here, that's drift — fix it.
- **Skills are detail; `~/.claude/CLAUDE.md` is the constitution.** Precedence per `~/.claude/CLAUDE.md § Role & Precedence`: `~/.claude/CLAUDE.md` > the project's own `CLAUDE.md` / repo router > skill. Detail extends; it never overrides.
- **Match the task to the skill via the Routed Skill Index.** Do not free-text-guess a skill name — only the skills that actually exist as populated `SKILL.md` files in `~/.claude/skills/` are real.
- **When a task crosses skills, plan the sequence before writing code.** Multi-step changes load skills in order (e.g. `scaffold-spec` → `api-testing` → `data-strategy` → `debugging`); they do not stack five Critical blocks at once.
- **Audit-then-edit.** Before modifying any existing artifact, read it from disk. Never propose changes from memory or earlier context.
- **Verification Standard is non-negotiable.** Re-read from disk, run the linter, run the affected tests, report actual results. "Looks good" without verification is a Critical violation of `~/.claude/CLAUDE.md § Verification Standard`.
- **Surface drift, do not silently work around it.** When reality conflicts with a rule (an existing file violates the canonical pattern, or a `~/.claude/CLAUDE.md` line contradicts the matched skill), raise it with the human. The orchestrator's WON'T table is the refusal list.
- **Empty skill folders are not skills.** Folders that exist without a `SKILL.md` are placeholders. Do not invent their content; flag and stop.

## The three-layer model

| Layer | What | When it loads | Owns |
|-------|------|---------------|------|
| **L1 — Constitution** | `~/.claude/CLAUDE.md` — MUST / SHOULD / WON'T tables, AI Workflow, Routed Skill Index, Verification Standard | **Always loaded** at the start of every conversation | Cross-project rules and the only skill index |
| **L2 — Skills** | `~/.claude/skills/<name>/SKILL.md` (+ optional `reference.md`, `templates.md`, `<topic>.md`) | **On demand**, when the task matches the skill's description or its row in the Routed Skill Index | The rules and workflow for one area each |
| **L3 — Personas** | `~/.claude/commands/*.md` (`/bug-helper`, `/test-case-helper`, `/requirement-analyst`, `/acceptance-criteria-writer`) | **Manually**, when a person types the slash command | A role for a whole task; the knowledge stays in the skill a persona delegates to |

Skills extend the constitution; conflict resolution is in `~/.claude/CLAUDE.md § Role & Precedence`. Repo-specific facts (folder maps, test-ids, endpoints) live in that repo's own `CLAUDE.md` or a repo-context skill, never here. Single source of truth per concern.

## Conversation contract

- **Audit-then-edit (default).** For anything beyond a one-line fix: read the affected files from disk, propose scope (what changes, in which files, why), wait for approval, apply, report what landed.
- **Direct mode (trivial work).** Obvious typos, single-line fixes, single-import additions: do it and report.
- **When to ask vs do.** Clarify ambiguous prompts (which endpoint? create or edit? which job type?). Stop and ask before destructive actions, before silently picking between two valid architectural options, or when the matched skill's Critical conflicts with the request.
- **When to refuse.** The `~/.claude/CLAUDE.md § WON'T` table is the refusal list. Forbidden patterns include: silent failures (`try/catch` on `expect`, raised timeouts, silent `.skip`), schema loosening to make a test pass, hardcoded secrets/IDs, XPath, `page.waitForTimeout`, `any`/`as any`/`@ts-ignore`, `--no-verify` to bypass hooks, IDE/Cursor browser tools or `npx playwright codegen` as substitutes for the sanctioned exploration workflow (see the `playwright-cli` skill — uses `npx playwright open`).
- **Verification before "done".** Walk `~/.claude/CLAUDE.md § Verification Standard`: re-read from disk, lint, run the affected tests, report the actual result. A task with failing tests is not complete.

## Skill routing

The only skill index is `~/.claude/CLAUDE.md § Routed Skill Index`. Match the task to a row there, then load that skill. **This skill deliberately keeps no copy of the index.** An earlier copy here drifted: it called fully written skills empty placeholders, listed skills that do not exist, and missed four that do. Every duplicated routing table eventually disagrees with the real one.

For a generic "create / add / generate / extend / refactor" prompt, load `common-tasks` — it maps the request to the deep skills and carries the rules every artifact must obey.

## 7-phase task lifecycle

Each phase ties back to a `~/.claude/CLAUDE.md` rule. Walk in order; stop and surface if a phase cannot be completed.

1. **Understand** — re-read the prompt, restate the goal in one sentence, confirm the work category (new artifact / edit / refactor / debug / investigate).
2. **Locate** — open `~/.claude/CLAUDE.md § Routed Skill Index` and identify the matching skill. If the repository has its own `CLAUDE.md` or a repo-context skill, read it too — it holds the folder map the skills assume.
3. **Audit** — read existing code from disk (`ls`, then `Read` the relevant files). Never propose from memory. For API work, also confirm the endpoint contract via OpenAPI; for UI work, run `npx playwright open` (see the `playwright-cli` skill) per `~/.claude/CLAUDE.md` MUST: Explore Before Generate.
4. **Plan** — for multi-step or multi-file changes, write the scope: what changes, in which files, why, what's deliberately out of scope. If the work has several logical parts, name the **PR boundaries** now — one PR per part (`GOVERNANCE.md` § One logical change per PR). Wait for human approval on non-trivial work.
5. **Generate** — author the code following the matched skill's `## Critical` rules and the relevant `~/.claude/CLAUDE.md` MUST/WON'T entries. Re-check the Critical block while generating, not after.
6. **Verify** — walk `~/.claude/CLAUDE.md § Verification Standard`: re-read from disk, run the linter, run the affected tests (`npx playwright test [path]`), report actual results. On red, load the `debugging` skill — failure-mode taxonomy, UI Mode / Trace Viewer / Inspector workflow.
7. **Surface** — report what changed (files, substantive edits), flag any drift discovered (legacy filename inconsistency, schema duplication, dead code), and ask whether to commit. When a shippable unit is done, propose opening its PR rather than continuing on the same branch.

## Principles that make this scaffold AI-native

- **Single source of truth per concern.** Each domain has one canonical skill, and there is one skill index. `api-testing` for API specs, `page-objects` + `selectors` + `test-standards` for UI specs. The orchestrator (`~/.claude/CLAUDE.md`) holds framework-wide invariants; skills hold the per-area rules and workflows.
- **`## Critical` block at the top of every `SKILL.md`.** The model can scan the hard rules in 30 seconds before reading the workflow.
- **Layered topology.** Constitution → skills → personas. One source per concern; precedence is documented.
- **Routed by area through one index, not by free text.** The Routed Skill Index makes skill selection deterministic — the model does not have to guess.
- **One source of truth per concern.** URLs/credentials in `process.env.*` (declared in `env/.env.example`); endpoint paths and route constants in `config/app.ts` (`appConfig.api.*`, `appConfig.paths.*`); message strings, suite names, role names, status values in `enums/app/*` (e.g. `job-status.ts`, `qase-suites.ts`); fixed test constants in `test-data/app/*.json`. Per `~/.claude/CLAUDE.md § Sources of Truth`, paths live in `config/`, NOT in `enums/`.
- **Drift is surfaced explicitly in skills.** When a skill documents the canonical pattern but the codebase still has the legacy form, it says so (e.g. `api-testing` names legacy camelCase test-data files as drift and forbids new ones). The next person to touch the file converges; they don't perpetuate the drift.
- **Hard-stop forbidden patterns.** `~/.claude/CLAUDE.md § WON'T` and each skill's `## Anti-patterns` list refusal triggers, not soft preferences.

## Anti-patterns

- ❌ Diving into a task without consulting `~/.claude/CLAUDE.md § Routed Skill Index`.
- ❌ Generating code that contradicts what's already on disk — audit first.
- ❌ Inventing skill names, file paths, env-var names, or enum values the model "thinks" are there. Only the skills that exist as `~/.claude/skills/<name>/SKILL.md` are real.
- ❌ Routing to a skill folder that has no `SKILL.md`. Flag the gap; fall back to `~/.claude/CLAUDE.md` and the closest populated skill.
- ❌ Skipping verification. "The test should pass" is not a verification result. Run the linter, run the tests, report actual output.
- ❌ Treating a skill as the constitution. `~/.claude/CLAUDE.md` wins on conflict, every time.
- ❌ Restating rules — or the skill index — from another file in this skill. This is the orientation layer; rules and routing live in their owners.
- ❌ Letting one branch grow into many unrelated changes. Each logical unit ships as its own PR (`GOVERNANCE.md` § One logical change per PR).
- ❌ Stacking five skills' Critical blocks before writing a single line. Load one entry-point skill; chain to the next only when the first phase is done.
- ❌ Substituting another browser tool (IDE browser MCP, Cursor browser, `npx playwright codegen`) when `npx playwright open` cannot reach the app. Per `~/.claude/CLAUDE.md § No substitute UI exploration`, stop and notify the human.
- ❌ Silent coverage drops, schema loosening, raised timeouts, or `try/catch` on `expect` to make red turn green. Load `debugging` — it owns the failure-mode taxonomy and the right tool per failure type.

## Self-review checklist

Before declaring a task done:

- [ ] Loaded the global constitution (`~/.claude/CLAUDE.md`) and, where the repository provides one, its repo-context skill / router.
- [ ] Loaded the matching skill from `~/.claude/skills/` via the Routed Skill Index — confirmed it's populated, not an empty placeholder.
- [ ] Audited existing code from disk before adding anything new.
- [ ] Ran `npx playwright open` for UI work (see the `playwright-cli` skill) or consulted OpenAPI for API work, per `~/.claude/CLAUDE.md § Explore Before Generate`.
- [ ] Followed the matched skill's `## Critical` block while generating.
- [ ] Linter is clean (`eslint .` or pre-commit hook).
- [ ] The affected tests were run and pass (`npx playwright test [path]`).
- [ ] Re-read the final state from disk per `~/.claude/CLAUDE.md § Verification Standard`.
- [ ] Surfaced any drift discovered (legacy filenames, dead code, duplicated shared schemas, contradictions between the rule and the skill).

## Examples

### Example 1 — Adding API tests for a new endpoint

User: *"Add API tests for `POST /api/v1/jobs/{id}/pause`."*

1. **Understand** — new artifact: API spec for one endpoint with a path parameter.
2. **Locate** — `tests/app/api/**` → Routed Skill Index → load `api-testing` skill (carries the previous `api-tests.mdc` invariants + workflow).
3. **Audit** — `ls config/app.ts`, `ls fixtures/api/schemas/app/`, `ls helpers/app/`. Confirm whether `JOBS_PAUSE` already exists as a route constant.
4. **Plan** — schema additions, helper need (likely none — single-spec call), coverage plan from OpenAPI (200/400/401/403/404/405/409), test-data needs.
5. **Generate** — follow `api-testing § Authoring a new API spec` (10-step workflow) + `api-testing § Critical`. Schema goes in `fixtures/api/schemas/app/job.ts` as `z.strictObject`; the spec imports it from that file (there is no `app/` schema barrel). Spec follows `Verify <METHOD> <path> returns <status>` naming.
6. **Verify** — `npx playwright test tests/app/api/jobs-service/jobs/job-pause.spec.ts --grep "@App-API"` + `eslint .` + re-read from disk.
7. **Surface** — report files added, flag any drift caught (e.g. duplicated `APIErrorSchema`).

### Example 2 — Investigating a flaky UI test

User: *"`tests/app/functional/jobs-service/jobs/email-create-edit-job.spec.ts` flakes on CI but passes locally."*

1. **Understand** — debug task, suspected isolation or env drift.
2. **Locate** — `tests/app/functional/**` → Routed Skill Index → load `debugging` skill (failure-mode taxonomy + Trace Viewer / UI Mode workflow), plus `selectors` + `playwright-cli` if a locator looks suspect after re-exploration. UI invariants live in `page-objects` + `selectors` + `test-standards`.
3. **Audit** — read the spec from disk. Pull the CI artifact (`gh run download`), open the trace.
4. **Plan** — root-cause first (env? race? isolation?), no scope creep into unrelated cleanup.
5. **Generate** — fix at root cause (e.g. add a readiness check in `auth.setup.ts`). Re-run `npx playwright open` (see the `playwright-cli` skill) if a locator looks suspect.
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
| "Which skill applies to this task?" | Skill-routing decision | Open `~/.claude/CLAUDE.md § Routed Skill Index`. Match the glob/trigger to the skill column. If no row matches, default to `~/.claude/CLAUDE.md` + ask the human. |
| `~/.claude/CLAUDE.md` and skill X disagree | Drift, or order-of-precedence misread | `~/.claude/CLAUDE.md` wins. Surface the disagreement to the human and (when appropriate) note it should be reconciled in the skill. |
| Tempted to silently work around a rule | Forbidden | The `~/.claude/CLAUDE.md § WON'T` table is the refusal list — refuse and route to the matching MUST/SHOULD entry instead. |
| "I don't know what's already in the codebase" | Audit step skipped | Read from disk first (`ls`, then `Read`). Per `~/.claude/CLAUDE.md § Search Before Creating`, grep `helpers/`, `pages/`, `fixtures/`, `enums/`, `config/` before adding anything. |
| Skill folder exists but `SKILL.md` is missing | Empty placeholder | Flag the gap and stop. Fall back to `~/.claude/CLAUDE.md § Routed Skill Index` for the closest sibling skill. Do not invent the skill's content. |
| `npx playwright open` cannot reach the app or auth fails, but UI exploration is required | `~/.claude/CLAUDE.md § Explore Before Generate` forbids substitutes | Stop and notify the human (with the exact issue: missing storage state, expired session, wrong URL, network unreachable). Do not use IDE browser MCP, Cursor browser tools, or `npx playwright codegen`. |
| Wanting to load five skills' Critical blocks at once | Skill stacking | Load the entry-point skill only. It chains to the next one as the workflow phase requires. If the work genuinely needs three Critical blocks at once, the task is too big — split it. |
| "All good" without running tests | Verification skipped | Re-read `~/.claude/CLAUDE.md § Verification Standard`. A task with failing or unrun tests is not complete. |

## See Also

- **`~/.claude/CLAUDE.md`** — the always-on orchestrator. The **only rule file** in this repo. This skill teaches how to apply it.
- **API authoring:** [`api-testing`](../api-testing/SKILL.md) — full per-area workflow + endpoint context (consolidated from the previous `api-tests.mdc`).
- **UI authoring:** [`page-objects`](../page-objects/SKILL.md), [`selectors`](../selectors/SKILL.md), [`test-standards`](../test-standards/SKILL.md) — class structure, locator strategy, spec conventions (consolidated from the previous `ui-tests.mdc`).
- **Domain orientation:** `master-context` (project repo only — trimmed from this toolkit), `run-stats-api-tests-context` (project repo only — trimmed from this toolkit), [`test-case-generation`](../test-case-generation/SKILL.md) (manual invocations).
- **The skill list** — `~/.claude/CLAUDE.md § Routed Skill Index`. Not repeated here on purpose.
- [`build-alternatives`](../build-alternatives/SKILL.md) — the rule for open choices: build every way on `alt/` branches, then ask which to keep.
- **`skill-creator`** — for authoring or refactoring a skill (manual invocation only). Use this when you catch a gap (e.g. when an empty placeholder needs to be authored).
