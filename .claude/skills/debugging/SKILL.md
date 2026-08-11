---
name: debugging
description: Investigate any Playwright test failure — failure-mode taxonomy (TimeoutError, strict mode, ZodError, detachment, network race, stale storage state), trace capture/replay, and choosing UI Mode vs Trace Viewer vs Inspector. Load whenever a test fails or behaves unexpectedly. Triggers — "test fails", "timeout", "ZodError", "trace". Never to silence a failure; for intermittent failures use flakiness-triage first.
---

# Debugging Skill

When a Playwright test fails in this framework, you investigate first and fix second. This skill is the canonical entry point for **after** something breaks — what to look at, in what order, with which Playwright tool, and how to keep the fix at the root cause instead of in the symptom.

## Critical

- **ALWAYS read the failure message first.** Playwright's terminal output names the failing locator, the assertion or action, the timeout type, and the source line. Most failures are diagnosed before any tool is opened.
- **NEVER suppress a failure.** No `try/catch` around `expect`, no raised `actionTimeout` / `expect.timeout`, no loosened Zod schema, no deletion of the failing test. These are explicit WON'T rules in `~/.claude/CLAUDE.md`.
- **NEVER add `page.waitForTimeout(...)` to "give it time".** Hard waits hide the real cause. Use a web-first assertion (`await expect(locator).toBeVisible()`) or `page.waitForResponse(...)`.
- **When a test fails, load this skill BEFORE iterating.** Do not start guessing fixes. Classify the failure, pick the right tool, then change code.
- **Match the tool to the failure type.** UI Mode for interactive iteration, Trace Viewer for post-mortem on a captured trace, Inspector for breakpoint stepping, HTML report for screenshot + video + trace links. One tool per session — do not bounce between three.
- **CI-only failures: replay the trace locally before assuming "it's the environment".** Download the CI artifact, open it with `npx playwright show-trace`, and compare. Do not raise timeouts or add retries on the assumption of a CI quirk without proof.
- **Re-run a flake fix multiple times before declaring done.** A single green run after a flake fix is not enough — aim for at least 3–5 consecutive green runs of the affected test.
- **Never commit `test.only(...)`.** `playwright.config.ts` has `forbidOnly: !!process.env.CI`; CI will fail the build. Use `--grep` to narrow in CI workflows.

## Capture defaults (this project)

What `playwright.config.ts` automatically captures and where it lands:

| Artifact     | Setting                       | Where                                                       |
| ------------ | ----------------------------- | ----------------------------------------------------------- |
| Trace        | `trace: 'on-first-retry'`     | `test-results/<test-id>/trace.zip` — only when a retry runs |
| Screenshot   | `screenshot: 'only-on-failure'` | `test-results/<test-id>/test-failed-1.png`                |
| Video        | `video: 'retain-on-failure'` | `test-results/<test-id>/video.webm`                          |
| HTML report  | `reporter: [['html']]` (default; `QASE_REPORT=true` switches to list + blob + Qase) | `playwright-report/index.html` |

**Implication:** locally `retries: 0`, so on a first failure **no trace is written**. To capture one locally, either run UI Mode (always traces) or pass `--trace on` / `--trace retain-on-failure` on the command line. CI uses `retries: 1` so the second attempt produces the trace artifact.

## Choosing the right tool

| Need | Tool | Command |
|------|------|---------|
| Watch a test run interactively, step-by-step, with a timeline and locator picker | Playwright UI Mode | `npm run app-ui` (or `npx playwright test --ui`) |
| Investigate a specific failed run from a trace zip (local or CI artifact) | Trace Viewer | `npx playwright show-trace <path/to/trace.zip>` |
| Pause and step through a single test in a real browser | Playwright Inspector | `npm run app-debug` (or `--project=api`: `npm run api-debug`) |
| Read failure summary, screenshots, video, and trace links after a run | HTML reporter | `npx playwright show-report` |
| Force trace + single worker + no retries for deterministic local repro | Ad-hoc CLI | `npx playwright test <file> --trace on --workers=1 --retries=0` |
| Repeat a single test many times to surface flake | Repeat-each | `npm run app-repeat` (defaults to `--repeat-each=20`) or `npx playwright test <file> --repeat-each=10` |

UI Mode is the default first choice for interactive iteration; Trace Viewer is the default for post-mortem on a captured trace.

## Failure-mode taxonomy

Map the failure message to a category — each routes to a tool and (often) a sister skill.

| Failure type | Symptom | Likely cause | First investigation step |
|--------------|---------|--------------|--------------------------|
| `TimeoutError` on action | `locator.click() Timeout 10000ms exceeded` | Locator wrong, element disabled, page not loaded, hidden behind a modal | Trace Viewer — DOM snapshot at the moment of the click; or UI Mode + locator picker. Re-explore with `npx playwright open` (see the `playwright-cli` skill). |
| `TimeoutError` on assertion | `expect(locator).toBeVisible() Timeout 10000ms exceeded` | Locator wrong; OR element waits on a network response; OR fixture / setup ordering | UI Mode — re-snapshot just before the assertion. If locator is right, scope `expect` after `page.waitForResponse(...)`. |
| `TimeoutError` on navigation | `page.goto(...) Timeout 30000ms exceeded` | Wrong URL, env file wrong, app down, cold cache | Verify `process.env.APP_URL` and the loaded `env/.env.<ENVIRONMENT>` file. Curl the URL. |
| Strict-mode violation | `Error: strict mode violation: getByRole(...) resolved to N elements` | Locator matches >1 element | `selectors` skill § Strict mode disambiguation. Add `{ exact: true }`, scope to a parent (Pattern 7), or `.filter({ hasText })`. |
| `expect()` mismatch | `Expected: "X" / Received: "Y"` | Page state / data drift; OR a `Messages.*` enum value drifted from the live UI | Compare received vs expected. If a `Messages.*` value drifted, follow `refactor-values`. |
| `ZodError` on `Schema.parse(body)` | `expect.parse: ZodError: at body.X: Invalid enum value...` | API response disagrees with the Zod schema (contract drift) | If OpenAPI is the source of truth, this is a backend bug — route to `api-testing` § Skipping a test for a real backend bug. **Never** loosen the schema. |
| Locator "not attached" | `element is not attached to the DOM` | Misdiagnosis — Playwright's `Locator` is lazy; it never goes stale on its own. Real cause: page replaced before the action, frame swap, navigation race | Trace Viewer — check whether the action fired before/after a navigation event. |
| Network race | Action then immediate assert; flaky pass/fail | Action fires the XHR, assertion runs before the response lands | Wrap the action with `page.waitForResponse(...)` in the page-object method (NOT in the spec). |
| Auth failure / 401 mid-test | `Unauthorized` after a previously-passing flow | Stale storage state at `.auth/app/appMainUserSession.json` | Re-run the `app-setup` project. Verify `login.setup.ts` produced the file. |
| Token expiry mid-suite | 401s appearing only in the last ~20% of a long CI run (>1h) | Auth token lifespan shorter than total suite duration | Check Keycloak realm → Access Token Lifespan. Increase to 2× the longest suite duration, or implement token refresh in `beforeEach` via the auth-bootstrap helper. |
| `beforeAll` timeout → cascading 401s | Multiple tests in a describe fail with 401 / "Request context disposed" / "`beforeAll` hook timeout exceeded" | `beforeAll` hook creates tenants/users/Keycloak entities and exceeds its timeout on a slow environment. The disposed request context causes every subsequent test to report 401. | Check the `beforeAll` timeout first. Size it to the number of slow operations (see `api-testing` § Setup timeouts). Do NOT raise the global `actionTimeout` or add retries. |
| Stale UI aggregate | `expect(uiCount).toBe(apiCount)` fails with a small delta (e.g., 75 vs 77) | Dashboard/list page loaded with cached or pre-render data; API returned a fresher count | Move the API call outside the retry loop for a stable expected value. Inside `expect.toPass()`, call `page.reload()` + `verifyPageLoaded()` to force the UI to re-fetch, then re-read the UI value. Timeout 30s. |
| 409 Conflict on cleanup | `cleanup failed: 409` deleting a probe in `afterAll` | Probe still bound to a synthetic — wrong delete order | Use `cleanupProbesAndSynthetics` (synthetics first, then probes). See `api-testing` § Cleanup patterns. |
| Test passes alone, fails in suite | Green via `--grep`, red via `npm run app-test` | Test independence violation, shared state, parallel collision, missing cleanup | `test-standards` test isolation rules. Promote shared mutators to a fixture or `beforeEach`. |
| `forbidOnly` failed CI | `Error: focused tests are not allowed in CI` | Committed `test.only(...)` | Remove `test.only(...)`. Use `--grep` instead. |

## Workflow — investigating a failure

### Phase 1: Read the trace, do not guess

Open the terminal output first. Identify (a) which test failed, (b) which assertion or action threw, (c) which timeout class fired (action / navigation / `expect`), (d) the source line. If a trace exists (`test-results/<id>/trace.zip` after a CI retry), open it next: `npx playwright show-trace <path>`. The DOM snapshot at the moment of failure answers most "why" questions before any code is touched. If no trace exists locally because `retries: 0`, re-run with `--trace on` or use UI Mode.

### Phase 2: Reproduce locally before changing anything

Narrow the run to a tight feedback loop. A single spec, one worker, retries off: `npx playwright test tests/app/api/<file>.spec.ts --workers=1 --retries=0`. Narrow further with `--grep "<test title or tag>"` if the file is large. If the failure is intermittent, repeat: `npx playwright test <file> --repeat-each=10 --workers=1 --retries=0` (or `npm run app-repeat`). If the test is green locally and red in CI, jump to § CI-only failures — do not assume "it's CI" without evidence.

### Phase 3: Fix the root cause

Map the diagnosis to the right file. **Do not patch in the spec when the bug lives in a page object, schema, or helper.** Locator wrong → fix the POM getter (use `npx playwright open` to re-explore the live app, not guesswork — see the `playwright-cli` skill). Action raced ahead of navigation → add `page.waitForResponse(...)` in the page-object action method. `Messages.*` enum drifted → `refactor-values` workflow. Schema disagreed with documented contract → comment out the test with `// TODO: FIXME: <TICKET>` (`api-testing` § Skipping). Schema disagreed with undocumented response → update the schema to the real shape (never loosen with `z.unknown()`). Fixture missing → `fixtures` skill.

### Phase 4: Verify the fix is real, not a flake

Re-run the affected file with retries off and a single worker. Then re-run the file 3–5 consecutive times for confidence on flake fixes (a single pass after a timing fix is not enough). Then re-run the broader suite (`npm run app-test` or the appropriate area script) to confirm no neighbour broke. Confirm linter is clean (`npx eslint .`) and no `test.only(...)` was left behind.

## CI-only failures (red CI, green local)

When a test passes locally but fails in CI, you need CI's artifacts to reproduce — do not assume environment drift without proof.

1. **Download the CI artifacts.** GitHub Actions: `gh run download <run-id> -n playwright-report` (and `test-results` if separate). Bitbucket / other: pull the `playwright-report` and `test-results` archives from the pipeline UI.
2. **Open the failed trace.** Unzip the report; the trace zip for the failing test lives under `data/`. Then `npx playwright show-trace path/to/trace.zip`.
3. **Compare against local.** Common CI-only causes in this project:
   - Storage state stale or absent (`.auth/app/appMainUserSession.json` not produced) — confirm `app-setup` ran and succeeded.
   - Different `ENVIRONMENT` (CI loads `env/.env.<ENVIRONMENT>`; local typically `env/.env.dev`).
   - Parallelism — CI sets `workers: 1`, local runs parallel by default. A test that depends on shared state passes serially and fails parallel (or vice versa).
   - Token drift (`process.env.USER_ACCESS_TOKEN_*`) between CI secrets and local `.env`.
   - First-load timing on a cold dev cluster (real cause: missing readiness check, NOT a low timeout).
   - **Wrong environment loaded** — if tests hit the wrong backend, add a temporary `console.log` block to `playwright.config.ts` (wrapped in `/* eslint-disable no-console */` / `/* eslint-enable no-console */`) logging `ENVIRONMENT`, the dotenv file path, `APP_URL`, `API_URL`, and `KEYCLOAK_URL`. Commit, run one CI build, inspect, then **remove the debug block before merging**. Remember: CI platform variables override `.env` file values (see `config` skill § How env files load).
4. **Replay locally with the same flags.** `CI=1 ENVIRONMENT=<ci-env> npx playwright test <file> --workers=1 --retries=1`.
5. **Only if still green locally** add temporary instrumentation (`--trace on` for one CI run, screenshot points), commit, run in CI, inspect the new artifacts, then **remove the instrumentation** before merging. Never ship a raised timeout as a "CI fix".

## Anti-patterns

- ❌ Raising `actionTimeout`, `expect.timeout`, or `navigationTimeout` to make a failing assertion pass.
- ❌ Wrapping `expect(...)` in `try/catch` to "handle" the failure. The only `try/catch` allowed is capturing an accidentally-created resource id for cleanup, and even that re-throws or asserts.
- ❌ Adding `page.waitForTimeout(2000)` to "give it time".
- ❌ Loosening a Zod schema (`z.string()` → `z.unknown()`, `z.strictObject` → `z.object`, adding `.optional()` without justification) to make `Schema.parse(body)` succeed.
- ❌ Deleting the failing test "for now" without a `// FIXME: <ticket>` and the eslint-disable directive.
- ❌ Marking a test `.skip` without `// eslint-disable-next-line playwright/no-skipped-test` and a `// FIXME: <ticket-or-description>` (per `api-testing` § Skipping a test for a real backend bug).
- ❌ Editing production source code to make the test pass when the test is the one asserting reality. Figure out which side is right before changing either.
- ❌ Re-running until the test goes green ("flaky test acceptance"). 3 retries that eventually pass = a real bug that ships.
- ❌ Bouncing between UI Mode, Inspector, and `console.log` without finishing one investigation. Pick the right tool, finish, then move on.
- ❌ Patching in the spec when the bug lives in a page object getter, a Zod schema, or a helper. Fix at the source.
- ❌ Committing `test.only(...)` — `forbidOnly: !!process.env.CI` will fail the build.

## Self-review checklist

Before declaring a failure resolved:

- [ ] I read the trace (or generated one with `--trace on` / UI Mode if `retries: 0` produced none).
- [ ] I reproduced the failure locally with `--workers=1 --retries=0` before changing any code.
- [ ] I identified the root cause and named the failure-mode category from the taxonomy.
- [ ] My fix is at the root (POM getter / schema / helper / fixture) — not a `try/catch`, not a raised timeout, not a loosened schema.
- [ ] I ran the affected test 3–5 consecutive times with `--workers=1 --retries=0` and it passed every time.
- [ ] I ran the broader suite (`npm run app-test` or area script) and no neighbour broke.
- [ ] Linter is clean (`npx eslint .`); no `test.only(...)` remains.
- [ ] If a test was disabled for a real backend bug, it is **commented out** (not `test.skip`) with `// TODO: FIXME: <TICKET> <description>` directly above.

## Examples

### Example 1 — `TimeoutError` on `await expect(locator).toBeVisible()`

> `expect.toBeVisible: Timeout 10000ms exceeded for getByTestId('create-monitor-button')` in `tests/app/functional/monitoring-service/synthetics/icmp-create-edit-monitor.spec.ts`.

1. **Phase 1** — read the trace. Locally `retries: 0` so no trace was captured; re-run with `npm run app-ui` (UI Mode always traces).
2. **Phase 2** — re-run a single test: `npx playwright test tests/app/functional/monitoring-service/synthetics/icmp-create-edit-monitor.spec.ts --grep "create monitor" --workers=1 --retries=0 --trace on`. Open UI Mode timeline at the assertion frame.
3. **Diagnosis** — DOM at the moment of failure shows the synthetics list page is still loading; the create-monitor button has not rendered yet. The test asserts visibility before the list response lands.
4. **Fix at root** — in `pages/app/SyntheticsPage.ts`, the navigation method should `await page.waitForResponse(...)` for the synthetics list endpoint before returning. The spec stays as-is. **Do NOT** raise `expect.timeout`. **Do NOT** add `page.waitForTimeout(...)`. If the locator itself was wrong, re-explore via `npx playwright open` (see the `playwright-cli` skill) — never guess.
5. **Verify** — re-run the spec 5x with `--workers=1 --retries=0`; confirm `npm run app-test` is clean.

### Example 2 — `ZodError` on `Schema.parse(body)`

> `ZodError: at body.data.role: Invalid enum value. Expected 'admin' | 'user', received 'administrator'` on a `GET /api/v1/admin/users` test.

1. **Phase 1** — `Schema.parse(body)` failed at `data.role`. Failure category: contract drift.
2. **Phase 2** — open the trace (UI Mode → Network tab) and confirm the response body shape. The API returned `'administrator'` while the schema expected `'admin' | 'user'`.
3. **Decision** — OpenAPI is the source of truth. If the spec still says `'admin' | 'user'`, this is a **backend bug**, NOT a schema bug. Do **not** loosen `UserSchema`.
4. **Fix at root** — keep the test as-written, then **comment out** the entire `test(...)` block and add `// TODO: FIXME: <TICKET>` directly above. Do not use `test.skip` — it corrupts Qase ID mappings. See `api-testing` § Skipping a test for a real backend bug. If instead the OpenAPI spec was updated to include `'administrator'`, follow `refactor-values` to add the new enum member.
5. **Verify** — `npx eslint <file>` is clean; the skipped test is reported as skipped (not deleted).

### Example 3 — Test passes locally, fails in CI

> `Verify GET /synthetics returns 200 with valid schema` passes 5x locally, fails in the first CI run with `Timeout 30000ms exceeded waiting for navigation`.

1. **§ CI-only failures** — pull the artifact: `gh run download <run-id> -n playwright-report`.
2. Open the trace: `npx playwright show-trace path/to/trace.zip`. The trace shows `login.setup.ts` ran and `appMainUserSession.json` was produced — but the synthetic-monitor list endpoint returned 401 on the first request and then the test aborted.
3. **Compare environments** — local `env/.env.dev` has `USER_ACCESS_TOKEN_FULL` from a long-lived dev account; CI's token is minted fresh by `app-setup` against a colder cluster. The token-mint step in `app-setup` raced ahead of the Keycloak service being ready.
4. **Replay locally:** `CI=1 ENVIRONMENT=ci npx playwright test <file> --workers=1 --retries=1` — reproduces the 401.
5. **Fix at root** — add a readiness probe in `login.setup.ts` (or the helper that mints tokens) that polls Keycloak before issuing the credential request. **Do NOT** raise `navigationTimeout` — that masks the real timing bug. Verify the CI run is green for 3 consecutive pipeline executions.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No trace file after a local failure | `playwright.config.ts` has `trace: 'on-first-retry'` and locally `retries: 0` | Re-run with `--trace on` or use `npm run app-ui` (UI Mode always traces) |
| Test passes solo, fails when run with the full suite | Cleanup ordering or shared-state bug; parallel collision (local has parallel workers, CI is serial) | Check `afterAll` cleanup order. For synthetics-with-probes, use `cleanupProbesAndSynthetics` — synthetics first, probes second (`api-testing`). For shared mutators, move to a fixture or `beforeEach`. |
| `expect(locator).toBeVisible()` times out | Locator wrong OR element waits on a network call | Re-explore via `npx playwright open` (see the `playwright-cli` skill) to verify the locator. If the locator is right, scope the action's `page.waitForResponse(...)` inside the page-object method. Never raise `expect.timeout`. |
| `ZodError` on `Schema.parse(body)` | API response disagrees with the schema (contract drift) | `api-testing` § Skipping a test for a real backend bug — **comment out** the test with `// TODO: FIXME: <TICKET>`. **Never** use `test.skip` (corrupts Qase IDs). **Never** loosen the schema or change `z.strictObject` to `z.object`. |
| `Error: strict mode violation: ... resolved to N elements` | Locator matches >1 element | `selectors` skill § Strict mode — disambiguation. Add `{ exact: true }`, scope to a parent (Pattern 7), or `.filter({ hasText })`. |
| 409 Conflict deleting a probe in cleanup | Probe still bound to a synthetic | Use `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, token)`; never raw-delete probes in `afterAll` for monitor specs. |
| `element is not attached to the DOM` | Misdiagnosis — `Locator` is lazy and never goes stale; the real cause is page replacement, frame swap, or a navigation race | Open the trace; check whether the action fired before/after navigation. Add a web-first assertion or `page.waitForResponse(...)` in the page-object method to anchor the wait. |
| Auth fails mid-test (401 on a previously-passing flow) | Stale storage state at `.auth/app/appMainUserSession.json` | Re-run the `app-setup` project; check `login.setup.ts` produced the file; verify `playwright.config.ts` `storageState` path is unchanged. |
| `forbidOnly` failed the CI build | Committed `test.only(...)` | Remove `test.only(...)`; use `--grep "<title>"` to narrow CI workflow runs. |
| HTML report opens empty / stale | No run produced one yet, OR `playwright-report/` is stale | Run the failing test once first to refresh the report; then `npx playwright show-report`. |
| UI Mode is slow / consumes lots of memory | UI Mode keeps a hot context across sessions | Close it after each session. For pure post-mortem on a captured trace, prefer Trace Viewer (`npx playwright show-trace ...`) — lighter weight. |

## See Also

- **`selectors`** — strict-mode disambiguation, locator priority, Pattern 7 (sub-component scoping). Read when the failure is a strict-mode violation or "element not attached".
- **`api-testing`** — `Schema.parse` failures, error envelope shapes (`APIErrorSchema` / `GatewayErrorSchema`), the comment-out + `// TODO: FIXME:` workflow for real backend bugs, `cleanupProbesAndSynthetics` ordering.
- **`playwright-cli`** — re-explore the live app via `npx playwright open` when a locator no longer matches. **Mandatory** before guessing at a new selector.
- **`frontend-cross-check`** — when a locator failure points to a possible testid rename or component change, `git pull` `<sibling-repos>/frontend` and grep the source to confirm what the FE actually emits — before re-authoring the locator. Source is the truth for stable artifacts; `playwright-cli` is the truth for runtime behavior.
- **`page-objects`** *(TBD)* — where the fix lives when an action raced navigation: in the POM action method, NOT in the spec.
- **`fixtures`** — "fixture is undefined" failures; storage-state fixtures; the `apiRequest` and `mailpit` lifecycle.
- **`refactor-values`** — when an `expect()` mismatch traces to a `Messages.*` enum value or `test-data/app/*.json` value drift.
- **`data-strategy`** — when test data has drifted from the live API contract or from the UI's rendered strings.
- **[`test-standards`](../test-standards/SKILL.md)** — test independence, single-tag rule, structure conventions; many "passes alone, fails in suite" failures originate here. Pair with [`api-testing`](../api-testing/SKILL.md) for API-spec failures, [`page-objects`](../page-objects/SKILL.md) + [`selectors`](../selectors/SKILL.md) for UI-spec failures.
- **`~/.claude/CLAUDE.md`** — § When You're Stuck; the WON'T rules (no `try/catch`, no raised timeouts, no loosened schemas, no XPath, no `waitForTimeout`).
