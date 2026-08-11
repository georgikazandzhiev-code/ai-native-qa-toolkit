---
name: enums
description: Conventions for enums/app/ — where repeated string constants live (SUITES in qase-suites.ts, health states, inventory labels, report messages), the `as const` pattern, naming, and barrel exports. Use when adding a Qase suite, status value, or any repeated string constant. Triggers — "enum", "SUITES", "status value", "message string". Not for changing existing values (refactor-values) or endpoint paths (config — paths live in appConfig).
metadata:
  category: domain
---

# Enums

## Critical

- **`as const` is the convention** for every enum container. Reasons: tree-shakable, no runtime artifacts, no numeric/string-enum footguns, plays cleanly with `strict` mode and Zod. No TypeScript `enum` exists anywhere in `enums/` today — do not introduce one. (Known drift: `SUITES` in `qase-suites.ts` is a plain object literal without `as const`; add the assertion when the file is next touched for another reason.)
- **NEVER** put endpoint paths, route strings, base URLs, or env-driven URLs in `enums/`. **Paths live in `config/app.ts`** under `appConfig.api.X` (API paths) and `appConfig.paths.X` (UI route paths) — this is the canonical home for paths in this codebase, not a temporary state. See the `config` skill. (The orchestrator at `~/.claude/CLAUDE.md` has been updated to reflect this.)
- **NEVER** invent a new file in `enums/` for a single value. Extend an existing file (e.g. add a new `SUITES.<KEY>` to `qase-suites.ts`) before creating a new module. New files require ≥ 2 related constants and a domain that does not fit any existing file.
- **ALWAYS** name containers in `SCREAMING_SNAKE_CASE` (`SUITES`, `HEALTH_STATES`, `INVENTORY_COLUMNS`) — the dominant pattern; `ReportMessages` (PascalCase) is the one drift case. Keys are `SCREAMING_SNAKE_CASE` in `SUITES` and `ReportMessages`; the inventory catalogs use camelCase keys (existing drift — don't propagate to new files). File names are `kebab-case.ts` (`qase-suites.ts`, `chart-export.ts`).
- **ALWAYS** add a JSDoc comment above the container (the `as const` declaration) that says what the constants group. `qase-suites.ts` and `reports.ts` carry top-level JSDoc — match that pattern (the other files currently lack it; backfill when touched).
- **ALWAYS** re-export new files through the area barrel — `enums/app/index.ts` re-exports every `enums/app/*.ts`. A new file that is not in the barrel is invisible to barrel imports.
- **ALWAYS** capture UI message text from the live app via the `playwright-cli` skill (which uses `npx playwright open`) before encoding it as a constant. Do not guess error/success/validation strings. (`reports.ts` / `ReportMessages` and the `inventory.ts` label catalogs are the existing examples; follow this rule for every new value.)
- **NEVER** rename a key or change a value in place. The change cascades through specs, page objects, helpers, and Qase mappings. Use the `refactor-values` skill.
- **NEVER** put arrays of curated test inputs (invalid emails, boundary numbers, monitor configs) in `enums/`. Those go in `test-data/app/*.json`. See the `data-strategy` skill.

## File Locations

The `enums/` tree is small and intentional. List every file before adding more.

| File | Container(s) | Pattern | Purpose |
|------|--------------|---------|---------|
| `enums/app/qase-suites.ts` | `SUITES` | Object literal (drift: missing `as const` — add on next touch) | Qase suite names used in `qase.suite(SUITES.X)` — UI suites under `"UI\t..."`, API suites under `"API\t..."` |
| `enums/app/chart-export.ts` | `CHART_EXPORT_FORMATS` + `ChartExportFormat` type | `as const` array + derived union type | Chart export format literals (`csv`, `png`, `jpg`, `pdf`) |
| `enums/app/health.ts` | `HEALTH_STATES` + `HealthState` type | `as const` array + derived union type | Monitor health states (`healthy`, `warning`, `critical`, `unknown`) |
| `enums/app/inventory.ts` | `INVENTORY_CARD_LABELS`, `INVENTORY_ACTION_MENU`, `INVENTORY_COLUMNS`, `INVENTORY_SOURCE_FILTER` | `as const` object literals / array | Inventory page UI labels — status cards, row action menu, table columns, source filter |
| `enums/app/reports.ts` | `ReportMessages` | `as const` object literal | Reports page UI message strings (mirrors frontend paraglide messages) |
| `enums/app/index.ts` | — | Barrel | `export *` for all five files above |

**That is the entire current inventory — `enums/app/` only; no `enums/util/` directory exists.** No `messages.ts`, no `roles.ts`, no `statuses.ts`, no `storage-state-paths.ts`, no `api-endpoints.ts` exist today. Endpoint paths live in `config/app.ts`. Storage-state paths are inline literals in `playwright.config.ts` (e.g. `".auth/app/appMainUserSession.json"`). If you genuinely need one of these new files, follow the workflow in § Adding a new enum file.

## When does a value belong in an enum?

| Value kind | Home | Rationale |
|------------|------|-----------|
| Qase suite name (e.g. `"API\tSynthetics"`) | `enums/app/qase-suites.ts` → `SUITES` | Already the canonical home; consumed by `qase.suite()` in every spec |
| Shared status / state string (`"healthy"`, `"critical"`) | `enums/app/health.ts` → `HEALTH_STATES` (or a new `as const` file for a genuinely new domain) | Cross-resource. No `enums/util/` directory exists; status containers live in `enums/app/`, `as const` from the start. |
| API endpoint path (`/synthetics`, `/admin/tenants`) | `config/app.ts` → `appConfig.api.X` | **Not enums.** Paths live in `config/` — canonical, not temporary. |
| UI route path (`/login`, `/dashboard`) | `config/app.ts` → `appConfig.paths.X` | Same — paths live in `config/`. |
| Base URL, env-driven URL, token, credential | `process.env.*` via `config/app.ts` | Environment-dependent. See the `config` skill. |
| Storage-state file path | Inline in `playwright.config.ts` | One-off; only Playwright config consumes it. Promote to an enum file only when 2+ non-config consumers appear. |
| UI message the app defines (error, success, validation, label, page title) | Existing per-page catalogs (`enums/app/reports.ts` → `ReportMessages`, `enums/app/inventory.ts` labels) or a new `enums/app/<page>.ts` — only when reused in 2+ specs | Capture exact text via the `playwright-cli` skill workflow (`npx playwright open`) first. Single-use messages stay inline at the assertion. |
| Role / permission name (`"admin"`, `"user"`) | New `enums/app/roles.ts` (does not exist yet) — only when reused | Today no test asserts a role string. |
| HTTP status code, well-known cross-app constant | Inline numeric literal at the call site | Not an enum candidate today. |
| Curated test inputs (invalid emails, weak passwords, boundary numerics) | `test-data/app/*.json` | Not enums. See the `data-strategy` skill. |
| Timeouts, retries, workers, project-wide tuning | `playwright.config.ts` or `appConfig.timeouts` | Not enums. |
| String literal used in exactly one place | Inline | Single-use does not justify an enum. |

If the value fits none of these rows, stop and ask. Do not invent a new top-level folder or stuff a value in the wrong file.

## Naming convention

| Element | Pattern | Real example | File |
|---------|---------|--------------|------|
| File name | `kebab-case.ts` | `qase-suites.ts`, `chart-export.ts`, `health.ts` | `enums/app/` |
| `as const` container | `SCREAMING_SNAKE_CASE` | `SUITES`, `CHART_EXPORT_FORMATS`, `HEALTH_STATES`, `INVENTORY_COLUMNS` | dominant pattern; `ReportMessages` in `reports.ts` is the PascalCase drift case |
| Derived union type | `PascalCase` | `ChartExportFormat`, `HealthState` — `(typeof X)[number]` | `chart-export.ts`, `health.ts` |
| Key / member | `SCREAMING_SNAKE_CASE` | `API_SYNTHETICS`, `APP_LOGIN`, `EMPTY_HEADING` | `qase-suites.ts`, `reports.ts` — the inventory catalogs use camelCase keys (drift; don't propagate) |
| Value | Exact wire / display string the app uses | `"API\tSynthetics"`, `"No widgets yet"` | all files |

Note on container casing: this codebase treats `as const` containers as constant catalogs and uses `SCREAMING_SNAKE_CASE` for them (`SUITES`, `HEALTH_STATES`). New `as const` containers in `enums/app/` follow the same pattern (`MESSAGES`, `ROLES`, `API_ENDPOINTS`). `ReportMessages` predates this rule; leave it as-is until a `refactor-values`-driven rename is warranted.

## Adding a new enum or member

**Workflow:**

1. **Search before creating** — `grep -rn "<value>" enums/ config/ test-data/`. If the value already exists somewhere, reuse it.
2. **Decide the home** using § When does a value belong in an enum? If it is not enum-shaped, route it (config / test-data / inline) and stop.
3. **Pick the right file** — extend an existing file when the domain matches (`SUITES`, `HEALTH_STATES`, the inventory catalogs, `ReportMessages`). Only create a new file when the domain is genuinely new and you have ≥ 2 related constants.
4. **Add the entry** — match the file's existing pattern when extending it. For `SUITES`: add `KEY: "value"` keeping the section grouping (`// UI Suites` vs `// API Suites`). For the other catalogs: match the surrounding key style and keep the `as const` assertion.
5. **Re-export through the barrel** — if you added a new file, add `export * from './<new-file>'` to `enums/app/index.ts`.
6. **Update consumers** — if a consumer is hardcoding the same string, replace the literal with the new constant. The orchestrator's "no hardcoded repeat strings" MUST rule applies.
7. **Run** — `npx playwright test` for the affected specs; the linter must pass.

## Adding a new enum file

A new file is only justified when:
- ≥ 2 related constants are needed (single-value files are noise), AND
- No existing file (`qase-suites.ts`, `chart-export.ts`, `health.ts`, `inventory.ts`, `reports.ts`) covers the domain.

Steps:
1. Create `enums/app/<kebab-name>.ts`.
2. Top-level JSDoc describing the file's purpose (mirror `qase-suites.ts` / `reports.ts`).
3. Pick the pattern: **`as const` object literal (or `as const` array + derived union type) — always.** TypeScript `enum` is not used in this codebase. No exceptions; no JSDoc-justified exemption.
4. Add `export * from './<kebab-name>'` to `enums/app/index.ts`.
5. Update the **File Locations** table in this skill in the same PR — if the inventory changes and the skill does not, the skill drifts.

## Capturing the real string from the live app

When (not if) a `messages.ts` file is added for UI text — error / success / validation / button label / page title — every value MUST come from observing the live application, not from a design spec, OpenAPI doc, or guess.

Workflow:
1. Read the `playwright-cli` skill (`~/.claude/skills/playwright-cli/SKILL.md`) for the full workflow.
2. Run `npx playwright open --load-storage <storage-state-path> https://<app-host>/<route>` and trigger the relevant action in the app.
3. Capture the exact rendered text (case, punctuation, whitespace, trailing periods).
4. Encode it as the constant value.

If the app is unavailable, do **not** ship the value. Stop and notify the human (per the orchestrator's "No substitute UI exploration" rule). Do not add a `// FIXME: unverified` placeholder and ship anyway — that is the silent-coverage anti-pattern.

## Anti-patterns

- ❌ Putting endpoint paths or route strings in `enums/app/` instead of `config/app.ts`. The codebase's source of truth for paths is `appConfig.api.X` and `appConfig.paths.X` — canonical and intentional, not a temporary state.
- ❌ Rewriting any `as const` container to a TypeScript `enum`. No TS `enum` exists in this codebase; introducing one would move backward.
- ❌ Authoring a new file with TypeScript `enum`. New files use `as const`, no exceptions.
- ❌ Pre-emptive standalone rewrite of a drift case (e.g. adding `as const` to `SUITES`, renaming `ReportMessages`) with no other change. Wait for a legitimate edit (member rename, new value, JSDoc change) and fix the drift as part of it.
- ❌ Hardcoding `"API\tSynthetics"` in a spec instead of `SUITES.API_SYNTHETICS`. Any string used in 2+ places must come from the constant.
- ❌ Hardcoding an expected UI message in `expect(...).toHaveText("Successfully logged in")` when the same string appears in a sibling spec. Promote to a `messages.ts` file (and capture via the `playwright-cli` skill workflow).
- ❌ Adding a new key directly to `qase-suites.ts` without checking whether the existing nesting prefix (`UI\t...` vs `API\t...`) covers it. Keep the section grouping intact.
- ❌ Creating `enums/app/messages.ts` with one entry "for completeness". Wait until 2+ messages need a home.
- ❌ Renaming a key or changing a value in place ("just a quick rename"). It cascades through every consumer. Use the `refactor-values` skill.
- ❌ Adding an array (`[...invalidEmails]`) to `enums/`. Arrays of curated test inputs go in `test-data/app/*.json`.
- ❌ Putting a URL like `https://staging.example.com` in an enum. URLs are environment-dependent and belong in `process.env.*` + `config/`.
- ❌ Adding a new file to `enums/app/` and forgetting to re-export it from `enums/app/index.ts`. The barrel is the single import surface; an un-exported file is dead code from the consumer's view.
- ❌ Skipping the `qase-suites.ts` update when adding a new API resource. Every new spec needs a `SUITES.API_<RESOURCE>` constant; `qase.suite()` is a MUST per the orchestrator.

## Self-review checklist

- [ ] New files use `as const` (no TS `enum`). No accidental backward rewrites of `as const` to `enum`.
- [ ] Container name is `PascalCase` (or `SCREAMING_SNAKE_CASE` for `SUITES`-style catalogs); keys / members are `SCREAMING_SNAKE_CASE`; file is `kebab-case.ts`.
- [ ] Container has a JSDoc comment describing what it groups; new files carry top-level JSDoc.
- [ ] No hardcoded path / URL / token / endpoint slipped into `enums/`. Paths went to `config/app.ts`. Env-driven values went to `process.env.*`.
- [ ] No new arrays-of-test-inputs added to `enums/`. Curated test data went to `test-data/app/*.json`.
- [ ] New file (if any) is re-exported through `enums/app/index.ts`.
- [ ] Every consumer that previously hardcoded the same string now imports the constant.
- [ ] If a UI-message constant was added, the value was captured via the `playwright-cli` skill workflow (`npx playwright open`) from the live app — not guessed.
- [ ] No in-place rename or value change without going through `refactor-values`.
- [ ] The **File Locations** table in this skill still matches reality. Update it in the same PR if you added a new file.
- [ ] `npx playwright test` and the linter pass for affected specs.

## Examples

### Example 1 — Adding `SUITES.API_<RESOURCE>` for a new API spec

User says: _"Add API tests for `/admin/sessions`."_ (Real example: `SUITES.API_ADMIN_SESSIONS` already exists; assume a fresh resource for the walkthrough.)

1. **Search before creating** — `grep -n "API_ADMIN" enums/app/qase-suites.ts`. Confirm the key does not already exist.
2. **Decide the home** — Qase suite name → `enums/app/qase-suites.ts` (the only home for SUITES).
3. **Pick the right file** — extend `qase-suites.ts`, do not create a new file.
4. **Add the entry** — under the `// API Suites (nested under API parent)` section, add:
   `API_ADMIN_SESSIONS: "API\tAdmin-Sessions",`
   Pattern matches the existing entries: `SCREAMING_SNAKE_CASE` key, `"API\t<HumanReadable>"` value with a tab separator for Qase nesting.
5. **Barrel** — `qase-suites.ts` is already re-exported by `enums/app/index.ts`; nothing more to do.
6. **Consumer** — in the new spec, `import { SUITES } from "../../../enums/app/qase-suites";` then `qase.suite(SUITES.API_ADMIN_SESSIONS);` as the first body line of every test (per the `api-testing` skill's MUST rules).
7. **Run** — `npx playwright test tests/app/api/tenant-service/admin-sessions.spec.ts --grep "@App-API"`.

### Example 2 — Adding a new shared health state

User says: _"The app now reports a `'degraded'` health state for monitors."_

1. **Search** — `grep -n "degraded" enums/app/health.ts`. Not present.
2. **Decide** — health-state string → shared (asserted across dashboard, inventory, synthetics specs) → `enums/app/health.ts`.
3. **Pick the file** — `health.ts` already owns `HEALTH_STATES`. Extend it; do not create a new file.
4. **Pattern** — the file uses an `as const` array with a derived union type. Match it: add `'degraded',` to the `HEALTH_STATES` array; `HealthState` picks it up automatically via `(typeof HEALTH_STATES)[number]`.
5. **Barrel** — `health.ts` is already re-exported by `enums/app/index.ts`.
6. **Consumer** — the spec asserting the state replaces a hardcoded `"degraded"` literal with the constant.

### Example 3 — Adding the first UI message constant (greenfield file)

User says: _"Two specs assert the login error 'Invalid email or password'. Centralize it."_

1. **Search** — `grep -rn "Invalid email or password" tests/ pages/`. Confirm 2+ consumers (the threshold for promotion).
2. **Capture from live app** — read the `playwright-cli` skill, run `npx playwright open --load-storage <path> https://<app-host>/login`, trigger a wrong-credentials submit, copy the **exact** rendered text including punctuation and case.
3. **Decide the home** — UI message the app defines → `enums/app/`. No `messages.ts` exists yet, so this creates one.
4. **Pick the pattern** — UI messages are a catalog of arbitrary string values, mirroring `SUITES`. Use `as const`:

   ```ts
   /** UI messages displayed to the user. Values captured live via `npx playwright open`; do not guess. */
   export const MESSAGES = {
     LOGIN_INVALID_CREDENTIALS: "Invalid email or password",
   } as const;
   ```

   File: `enums/app/messages.ts`.
5. **Barrel** — add `export * from './messages';` to `enums/app/index.ts`.
6. **Update consumers** — both specs replace the hardcoded literal with `MESSAGES.LOGIN_INVALID_CREDENTIALS`.
7. **Update this skill's File Locations table** — `enums/app/messages.ts` joins the inventory.
8. **Run** — `npx playwright test` for the two specs.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| I'm about to hardcode `"API\tSynthetics"` in a `qase.suite()` call. | Constant not imported. | Use `SUITES.API_SYNTHETICS` from `enums/app/qase-suites.ts`. |
| I'm about to hardcode `/synthetics` as an endpoint path in a spec. | Wrong source of truth. Paths live in `config/app.ts` in this codebase, not `enums/`. | Use `appConfig.api.SYNTHETICS`. See the `config` skill. |
| I want to put `process.env.APP_URL` in an enum. | Env-driven values are not enum candidates. | Keep it in `config/app.ts` (`appConfig.baseUrl`). See the `config` skill. |
| I want to add an array `INVALID_EMAILS = [...]` to `enums/`. | Arrays of curated test inputs are not enums. | Put it in `test-data/app/<resource>.json` and import. See the `data-strategy` skill. |
| I need to rename `SUITES.API_SYNTHETICS` to `SUITES.API_SYNTHETICS_V2`. | Cascades through every spec, page object, and Qase mapping. | Stop. Read the `refactor-values` skill — it owns the impact-analysis workflow. |
| My test assertion `expect(text).toHaveText(MESSAGES.X)` fails — text drifted from the live UI. | Constant value diverged from the real app text. | Re-capture via the `playwright-cli` skill workflow (`npx playwright open`) and update via `refactor-values` (not a local find-and-replace that may miss other consumers). |
| The new file I added to `enums/app/` is not picked up when consumers `import { X } from "../../../enums/app";`. | Forgot to re-export through the barrel. | Add `export * from './<new-file>';` to `enums/app/index.ts`. |
| Should I convert an `as const` container to a TypeScript `enum` for consistency with other TS projects? | The codebase rule is `as const`; no TS `enum` exists anywhere in `enums/`. | Do **not** introduce `enum`. Keep `as const` everywhere. |
| I'm authoring a brand-new file in `enums/`. Which pattern? | The going-forward rule is `as const`. | `as const` only. TypeScript `enum` is not an option for new files. |

## See Also

- **`config`** — where URLs, endpoint paths, route paths, credentials, and env-driven settings live (NOT in enums in this codebase).
- **`refactor-values`** — impact analysis and cascading update workflow for enum value / key changes.
- **`playwright-cli`** — how to capture real UI text before encoding it as a message constant (uses `npx playwright open`). Pair with `frontend-cross-check` (source) for stable Paraglide keys + inline literals.
- **`frontend-cross-check`** — verify what UI strings the frontend actually emits (Paraglide keys in `messages/en.json` + inline literals in `src/components/**`) before encoding into an enum. `git pull` `<sibling-repos>/frontend` first.
- **`data-strategy`** — where curated arrays of test inputs live (`test-data/app/*.json`, not enums).
- **`api-testing`** — primary consumer of `SUITES.API_*` for `qase.suite()`.
- **`~/.claude/CLAUDE.md`** — orchestrator constitution. The MUST row on Sources of Truth correctly states paths live in `config/app.ts` (`appConfig.api.X` / `appConfig.paths.X`) and message/role/suite constants live in `enums/app/*`.
