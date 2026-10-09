---
name: refactor-values
version: 1.0.2
description: Safe workflow for changing values that already cascade — enum string values, enum key renames, appConfig route constants, fixed test-data JSON. Use BEFORE editing any existing shared value so every consumer updates atomically. Triggers — "rename enum", "change SUITES value", "update test-data value", "change route constant". Not for adding new enums (enums) or new test data (data-strategy).
metadata:
  category: authoring
---

# Refactoring Enum Values and Static Test Data

## Critical

- **ALWAYS** run Phase 1 (find all consumers) before making any edit. Enum values and `test-data/app/*.json` keys feed specs, page objects, helpers, and Zod schemas — the blast radius must be known up front.
- **ALWAYS** search for both the **enum key** (e.g. `SUITES.API_JOBS`) **and the raw string value** (e.g. `"API\tJobs"`, or `"paused"` for the `JOB_STATUSES` member). Some consumers may have bypassed the enum and hardcoded the string — those will not auto-update.
- **NEVER** edit a value, rename a key, or change a `test-data/app/*.json` field without updating every consumer **in the same commit**. No intermediate broken state on the default branch.
- **NEVER** loosen a Zod schema (`z.literal`, `z.enum([...])`, e.g. `StatusSchema` in `fixtures/api/schemas/app/tenant.ts`) to make an updated value pass. Update the schema literal/enum to match the new value — the schema is the contract.
- **ALWAYS** run `npx tsc --noEmit` and the lint-staged pipeline (eslint + prettier) plus the affected Playwright tests before declaring the refactor done. TypeScript catches key renames; eslint catches stale patterns; tests catch assertion drift.
- **NEVER** use a single global find-and-replace. It misses casing variants, hardcoded copies in specs, and references inside `~/.claude/skills/*`, `.cursor/rules/*`, `README.md`, and Qase suite-name mappings. Inspect every match.
- **ALWAYS** treat `SUITES.*` value changes as a **Qase rename** — the value is the suite name shown in the Qase UI. Coordinate with whoever owns the Qase project before merging.
- **NEVER** bypass Husky pre-commit hooks (`--no-verify`). If the hook fails after a value rename, fix the underlying lint/type issue.

## When to use this skill

In-scope:
- Changing the **string value** of an enum member (e.g. `SUITES.API_JOBS = "API\tJobs"` → `"API\tScheduled Jobs"`).
- **Renaming an enum key** (e.g. `SUITES.API_JOBS` → `SUITES.API_SCHEDULED_JOBS`).
- Editing an existing **field value** in `test-data/app/<resource>.json` (e.g. updating `invalidId`, `nonExistentId`, `defaultPageSize`).
- Updating a `z.enum([...])` member that mirrors an enum or API value (e.g. `StatusSchema` in `fixtures/api/schemas/app/tenant.ts`).

Out-of-scope:
- **Adding** a new enum member or a new static-data key — use the `enums` and `data-strategy` skills.
- **Removing** a dead enum member entirely — that's a code-deletion task; this skill assumes a value is in active use.
- Restructuring code that does not change a value.

## Workflow

### Phase 1: Find all consumers (do this BEFORE editing anything)

Search the entire repo for both shapes — the **import reference** AND the **raw string** — because some specs may have bypassed the enum and hardcoded the value. The project does not standardize on `rg` (the binary is shimmed and may invoke a wrapper) — use plain `grep -rn` for portable, predictable output.

For an enum-key change (e.g. renaming `SUITES.API_JOBS`):

```bash
grep -rn "SUITES.API_JOBS" <sibling-repos>/automation/ --include="*.ts"
grep -rn "API\\\\tJobs" <sibling-repos>/automation/ --include="*.ts"
```

For a job-status value change (`"paused"` → `"suspended"` in `JOB_STATUSES`, `enums/app/job-status.ts`):

```bash
grep -rn "JOB_STATUSES" <sibling-repos>/automation/ --include="*.ts"
grep -rn "'paused'\|\"paused\"" <sibling-repos>/automation/ --include="*.ts"
```

For a JSON field rename (e.g. `defaultPageSize` in `test-data/app/worker.json`):

```bash
grep -rn "workerData.defaultPageSize" <sibling-repos>/automation/ --include="*.ts"
grep -rn "defaultPageSize" <sibling-repos>/automation/test-data/app/
```

Inspect every hit — do not auto-replace. Expect matches in `tests/app/api/**`, `tests/app/e2e/**`, `tests/app/functional/**`, `pages/app/**`, `helpers/app/**`, `fixtures/api/schemas/app/**`, `enums/**`, `~/.claude/skills/**`, `.cursor/rules/**`, and `README.md`.

### Phase 2: Update every consumer in the same commit

Atomicity is mandatory. Recommended order:

1. Edit the source — the enum value, the renamed key, or the JSON field.
2. Update every consumer surfaced in Phase 1 in the same working tree.
3. If a `z.enum([...])` literal references the value (e.g. `StatusSchema = z.enum(["created", "updated", "deleted", "logged out"])` in `fixtures/api/schemas/app/tenant.ts`), update it in the same diff.
4. Run TypeScript, lint, then affected tests.
5. Commit once. Do not push a partially-updated branch.

Forbidden:
- Single global find-and-replace across the repo.
- Splitting "rename in source" and "rename in consumers" into two commits.
- Skipping the schema or skipping `~/.claude/skills/*` documentation that names the value.

### Phase 3: Verify

Run, in order, before declaring done:

```bash
npx tsc --noEmit
npx eslint .
```

Then the affected Playwright tests — the project exposes scripts via `package.json`:

- `npm run app-api` — runs `--grep @App-API` on `app-chromium`. Right call when the value is referenced from API specs.
- `npm run app-e2e` — runs `--grep @App-E2E`. Right call when the value flows through end-to-end specs.
- `npm run app-regression` — runs `--grep @App-regression` (lowercase — matches the codebase standard). Right call for functional specs.
- `npx playwright test <path>` — when the change touches a single spec file, run that file directly.

Do not raise timeouts, weaken a schema, or wrap in `try/catch` to make a failing test green — load the `debugging` skill.

## Project-specific cascade points

Where a value-change in this repo radiates to. Check each row before committing.

| Source change | Cascades to | What breaks if missed |
|---------------|-------------|-----------------------|
| `enums/app/qase-suites.ts` value (e.g. `SUITES.API_JOBS`) | `qase.suite(SUITES.API_JOBS)` calls in every spec under `tests/app/api/**` AND **the Qase UI suite name** | Suite renames in Qase; mapped `qase.id(...)` may detach from the renamed suite |
| `enums/app/qase-suites.ts` key rename | TypeScript imports across all spec files | TS compile errors at every consumer (caught by `npx tsc --noEmit`) |
| `enums/app/job-status.ts` value (e.g. `"paused"` in `JOB_STATUSES`) | Page-object `getByText(...)` calls and `expect(...).toHaveText(...)` UI assertions that take the status from `JOB_STATUSES`; any spec that hardcoded `'paused'` directly | UI assertions drift; hardcoded copies fail silently |
| `appConfig.api.<X>` route constant (in `config/app.ts`) | Every `apiRequest({ url: appConfig.api.X, ... })` call AND any spec that hardcoded the path string | API tests hit the wrong URL; 404s look like coverage failures |
| `StatusSchema = z.enum([...])` in `fixtures/api/schemas/app/tenant.ts` | Every response body parsed as `Schema.parse(body)` where the schema includes `status: StatusSchema` | `ZodError: Invalid enum value` on parse — the schema rejects the new API value |
| `fixtures/api/schemas/app/job.ts` `z.enum(["enabled", "disabled"])` | Every job create/list response parse | Same — schema rejects new value |
| `test-data/app/worker.json` field (e.g. `invalidId`, `nonExistentId`, `defaultPageSize`) | `workerData.invalidId` references in `tests/app/api/jobs-service/workers/workers.spec.ts` and others; helper iteration over `workerData.sortFields` | Negative-test loops break or assert wrong values |
| `test-data/app/job-common.json` field (e.g. `runIntervals`, `timeout.max`) | Any spec destructuring those keys; UI tests selecting a run-interval option | Boundary tests pass against stale ranges |
| Documentation references (`~/.claude/skills/*`, `.cursor/rules/*`, `README.md`) | Future authors who copy old patterns | Long-term drift — new specs reproduce the stale value |

The project's `helpers/app/<resource>.ts` files do **not** declare schemas inline (rule from `api-testing`), so a value rename does not need to touch helper code unless a helper hardcoded the old value as a literal — grep confirms this.

## Anti-patterns

- ❌ Editing the enum but leaving a hardcoded raw string in a spec (e.g. `expect(body.status).toBe("created")` not updated when `StatusSchema` changed).
- ❌ Loosening `StatusSchema` from `z.enum([...])` to `z.string()` "to make the test pass" — that hides the contract drift.
- ❌ Changing `SUITES.API_JOBS = "API\tJobs"` to `"API\tScheduled Jobs"` without checking the Qase project — the suite renames in the UI, breaking dashboards and saved filters.
- ❌ Renaming an enum key but skipping `~/.claude/skills/*` and `.cursor/rules/*` references — the next author copies the old key from documentation.
- ❌ Editing `test-data/app/worker.json`'s `defaultPageSize` without re-checking `workers.spec.ts` pagination assertions that hardcoded `10` (the old value) instead of importing the constant.
- ❌ Splitting source-change and consumer-update into separate commits — leaves the default branch in a broken state mid-PR.
- ❌ Using `git commit --no-verify` to bypass Husky after the rename triggers a lint failure. Fix the lint.
- ❌ Renaming a `z.enum` literal without verifying the API actually returns the new value — change the schema only when the contract has changed.
- ❌ Bulk find-and-replace on a substring like `Active` — collides with `Inactive`, `Deactivate`, `Activate`, etc. Always inspect.

## Self-review checklist

Before committing a value refactor:

- [ ] Phase 1 grep ran for **both** the enum key/import reference AND the raw string value.
- [ ] Every Phase 1 hit was inspected and either updated or explicitly judged irrelevant (with a one-line note in the PR).
- [ ] If the value lives in `enums/app/qase-suites.ts`, the Qase project owner is aware (a value change renames the suite in Qase).
- [ ] If a `z.enum([...])` or `z.literal()` references the value (e.g. `StatusSchema` in `fixtures/api/schemas/app/tenant.ts`, `job.ts` `z.enum(["enabled", "disabled"])`), it was updated in the same diff.
- [ ] `~/.claude/skills/*`, `.cursor/rules/*`, and `README.md` were checked for documentation references that name the value.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx eslint .` passes.
- [ ] Affected tests pass — the matching script from `package.json` (`npm run app-api`, `npm run app-e2e`, `npm run app-regression`) or `npx playwright test <spec>` directly.
- [ ] The change is a single atomic commit; no intermediate broken state.
- [ ] Husky pre-commit hook passed without `--no-verify`.

## Examples

### Example 1 — Renaming `SUITES.API_JOBS` → `SUITES.API_SCHEDULED_JOBS`

The Qase suite was renamed for clarity. Both the key and the value change.

1. **Phase 1**: 
   ```bash
   grep -rn "SUITES.API_JOBS" <sibling-repos>/automation/ --include="*.ts"
   grep -rn "API\\\\tJobs" <sibling-repos>/automation/ --include="*.ts"
   ```
   Hits land in `enums/app/qase-suites.ts` (definition) and ~20 lines across `tests/app/api/jobs-service/jobs/backup-job.spec.ts`, `export-job.spec.ts`, `stream-job.spec.ts`, plus other job-type specs.
2. **Phase 2**: edit `qase-suites.ts` — change both the key (`API_JOBS` → `API_SCHEDULED_JOBS`) and the value (`"API\tJobs"` → `"API\tScheduled Jobs"`). Update every `qase.suite(SUITES.API_JOBS)` to `SUITES.API_SCHEDULED_JOBS`. Coordinate with the Qase owner so the existing suite is renamed (not duplicated).
3. **Phase 3**: `npx tsc --noEmit` (catches any missed key reference), `npx eslint .`, then `npm run app-api`. Commit once.

### Example 2 — Updating `nonExistentId` in `test-data/app/worker.json`

Backend started rejecting all-zero UUIDs as malformed instead of returning 404. The `nonExistentId` sentinel in `worker.json` needs to flip to a different well-formed-but-unused UUID.

1. **Phase 1**:
   ```bash
   grep -rn "workerData.nonExistentId" <sibling-repos>/automation/ --include="*.ts"
   grep -rn "00000000-0000-0000-0000-000000000000" <sibling-repos>/automation/ --include="*.ts"
   ```
   Hits: `tests/app/api/jobs-service/workers/workers.spec.ts` (5 lines) plus any spec that hardcoded the literal UUID.
2. **Phase 2**: edit `test-data/app/worker.json`'s `nonExistentId`. Find any hardcoded `"00000000-..."` strings in specs that bypassed `workerData.nonExistentId` — replace each to import the constant, in the same commit.
3. **Phase 3**: `npx tsc --noEmit`, `npx eslint .`, then `npx playwright test tests/app/api/jobs-service/workers/workers.spec.ts --project=app-chromium`. Confirm 404 tests still pass.

### Example 3 — `StatusSchema` enum literal change in `fixtures/api/schemas/app/tenant.ts`

The API renamed the `"logged out"` status to `"signed_out"`. The Zod literal needs to track.

1. **Phase 1**:
   ```bash
   grep -rn "logged out" <sibling-repos>/automation/ --include="*.ts"
   grep -rn "StatusSchema" <sibling-repos>/automation/ --include="*.ts"
   ```
   Hits: the schema definition itself, every spec asserting `expect(body.status).toBe("logged out")`, and every spec or helper that imports it from `fixtures/api/schemas/app/tenant.ts` (there is no schema barrel — consumers deep-import the resource file).
2. **Phase 2**: update `StatusSchema = z.enum(["created", "updated", "deleted", "signed_out"])`. Update each `expect(body.status).toBe("logged out")` to `"signed_out"` in the same diff. Do **NOT** loosen to `z.string()`.
3. **Phase 3**: `npx tsc --noEmit`, `npx eslint .`, `npm run app-api`. The `Schema.parse(body)` calls now validate the new contract.

### Example 4 (abstract) — UI message wording (`MESSAGES.LOGIN_ERROR`-shaped change)

Generic shape: a UI message enum's value changes (e.g. `"Invalid email or password"` → `"Incorrect credentials. Please try again."`). Search for both the enum key and the old raw string. Page objects using `getByText(MESSAGES.LOGIN_ERROR)` auto-update; any test that hardcoded the literal must be edited in the same commit. (This project's `enums/app/job-status.ts` and `qase-suites.ts` are the analogous real cases — `MESSAGES.*` is the canonical pattern.)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Property 'API_JOBS' does not exist on type` after rename | A consumer was missed — old key still referenced | Run `npx tsc --noEmit`, fix every reported location, then re-grep `~/.claude/skills/*` and `.cursor/rules/*` for the old name in documentation. |
| Test fails `expect(locator).toHaveText('paused')` after a `JOB_STATUSES` value change | A spec or page object hardcoded the old raw string instead of taking it from `JOB_STATUSES` | Search for the old string under `tests/`, `pages/`. Replace with the imported enum reference. |
| `ZodError: Invalid enum value. Expected ... received "signed_out"` | The API now returns the new value but the schema's `z.enum([...])` still has the old one | Update the literal in `fixtures/api/schemas/app/<resource>.ts`. Do **not** weaken to `z.string()`. |
| Qase report shows two separate suites after a `SUITES.*` value change | The old suite still has historical results; the new value created a fresh suite | Coordinate with the Qase project owner to merge or rename the suite directly in the Qase UI. Decide before merging the code change. |
| Pagination test fails after editing `defaultPageSize` in `worker.json` | A spec hardcoded the integer (e.g. `expect(body.pageInfo.pageSize).toBe(10)`) instead of `workerData.defaultPageSize` | Replace the literal with the import. Add this finding to the PR description so the reviewer knows the cleanup happened. |
| Husky pre-commit hook fails after a value rename | Lint/format/type issue in a touched file | Fix the underlying issue. Never `--no-verify`. |
| `npm run app-api` passes but `npm run app-e2e` fails | The value also flows through end-to-end paths and the `--grep` filter on `@App-API` skipped them | Run `npm run app-e2e` and `npm run app-regression` too whenever the value spans multiple test types. |

## See Also

- **`enums`** — naming and organization for **new** enum values (this skill is for changing existing ones).
- **`data-strategy`** — when to use JSON vs faker vs env vs seeded API data; the three-tier rule for invalid-value arrays. Use when **adding** new static test data.
- **`api-testing`** — `Schema.parse(body)` invariant, error envelopes, and the `StatusSchema` cascade.
- **`type-safety`** — Zod 3 conventions, `z.strictObject()`, `z.enum([...])` patterns referenced by this skill.
- **`debugging`** — when a test fails after a refactor: failure-mode taxonomy, UI Mode, Trace Viewer.
- **`~/.claude/CLAUDE.md`** — orchestrator constitution, especially the **Sources of Truth** MUST row and **No hardcoded test content** WON'T row.
- **[`api-testing`](../api-testing/SKILL.md)** — API spec invariants (read whenever the refactor touches `tests/app/api/**`).
