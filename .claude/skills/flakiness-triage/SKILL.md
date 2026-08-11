---
name: flakiness-triage
description: Classify a failing test as real bug, cross-test interference, or per-test flake — and hunt flakes proactively before CI finds them, via repeat-run detection, static flake-risk scoring, and a quarantine policy with expiry. Use when a test fails intermittently, passes locally but fails in CI, passes alone but fails in the suite, or before merging new and modified specs. Triggers — "flaky", "intermittent", "passes locally fails in CI", "passes alone", "is this test stable", "flake risk", "quarantine this test". Not for first-time diagnosis of a single failure (use the `debugging` skill). Not for whether a test asserts anything real (use the `mutation-testing` skill).
metadata:
  category: running
---

# Flakiness Triage Skill

Sister skill to `debugging`. `debugging` covers "this test just failed — what's wrong?" Flakiness-triage covers "this test fails *sometimes* — is it the test, the code, or the environment?" The two are paired: classify the failure here, then fix it via `debugging`.

## Critical

- **NEVER add a retry to "fix" a flake without classification.** A retry hides root cause. The framework's `playwright.config.ts` already retries on CI (`retries: process.env.CI ? 1 : 0`). Adding more retries (`test.describe.configure({ retries: N })`) is a `~/.claude/CLAUDE.md` WON'T-rule violation.
- **NEVER raise `actionTimeout` / `expect.timeout` to make a flake go green.** Same WON'T-rule. The timeout exposed a timing assumption; fix the assumption.
- **NEVER wrap an `expect` in `try/catch` to suppress an intermittent failure.** Per the orchestrator: a `catch` that doesn't re-throw or assert is hiding a failure.
- **ALWAYS reproduce N times before declaring a test "fixed".** Single green run after a flake fix means nothing — aim for **3–5 consecutive green runs** of the affected spec at the same parallelism level (always `--workers=1` for this framework per the memory note on shared-tenant interference).
- **ALWAYS isolate the test before debugging.** Run the spec alone (`npx playwright test <spec> --workers=1`). If it passes alone but fails in the suite, the cause is **cross-test interference** (shared tenant state, leaked fixture, cleanup ordering). If it fails alone too, it's a **per-test bug** (race, missing wait, stale storage state).
- **ALWAYS check the storage-state age for `401` flakes.** This framework's `login.setup.ts` writes storage-state files; long-running local sessions may use expired tokens. Re-run setup before assuming a code bug.
- **NEVER skip a flaky test with `test.skip`.** Per the orchestrator, `test.skip` corrupts Qase ID mappings. Comment out with `// FIXME: <TICKET> flaky — investigating` and report the ticket.
- **ALWAYS repeat-run a new or modified spec before merging it.** 5 consecutive green runs at `--workers=1` is the merge bar. A spec that has only ever run once is unverified, not stable — and the cheapest flake to fix is the one that never reached main.
- **NEVER quarantine without a ticket and an expiry date.** A quarantine with no expiry is silent coverage loss that nobody ever revisits. See § Quarantine policy.

## What's in each file

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Both modes, classification workflow, decision tree, detection, quarantine policy, anti-patterns. | **Always** — on any flake-triage or pre-merge stability task. |

(Single-file skill for now. Split when content grows past 300L.)

## Two modes

| Mode | Trigger | Entry point |
|------|---------|-------------|
| **Reactive triage** | A test already failed intermittently. | § Decision tree → § Workflow |
| **Proactive hunting** | New or modified spec heading for a merge; a suite whose flake rate is creeping up. | § Proactive detection |

Reactive triage is the expensive path — it starts after CI has been red, a release has been delayed, or someone has lost an afternoon. Hunting is the cheap path. Prefer it.

## Decision tree

```
Test fails intermittently
   │
   ├─ Does it fail in isolation? (npx playwright test <spec> --workers=1, run 5×)
   │     │
   │     ├─ Yes, every time → not flaky, it's a real bug. Route to `debugging`.
   │     │
   │     ├─ No, passes alone → cross-test interference.
   │     │       │
   │     │       ├─ Suspect: shared tenant state, leaked fixture, cleanup order
   │     │       ├─ Action: bisect via --grep to find the polluting spec
   │     │       └─ Fix via: `helpers/app/<resource>.ts` cleanup, `afterEach`
   │     │
   │     └─ Sometimes alone, sometimes not → genuine flake.
   │             │
   │             ├─ Suspect: missing wait, race, storage-state TTL, network jitter
   │             └─ See § Genuine-flake taxonomy
   │
   └─ Does it only fail in CI? (passes locally, red in CI)
         │
         ├─ Suspect: timing / parallelism / env diff / storage-state staleness
         ├─ Action: download CI trace, replay with `npx playwright show-trace`
         └─ See `debugging` skill § CI-only failures
```

## Workflow

### Step 1 — Capture the evidence

Before any classification, capture:

1. **Failure rate** — out of N runs, how many failed? (Bitbucket CI shows historical pass rate per spec.) <50% flake rate = probably real bug; >50% flake rate = probably environmental.
2. **Failure mode** — TimeoutError? Strict-mode violation? ZodError? 401/403? Network race? (Load `debugging` skill for the taxonomy.)
3. **Failure site** — same line every time, or different lines? Same-line failures classify faster than wandering failures.
4. **Local vs CI** — does it fail locally too, or only in CI?

### Step 2 — Run the isolation experiment

```bash
# Isolate: run ONLY the failing spec, 5 times in a row, single worker
for i in 1 2 3 4 5; do
  npx playwright test tests/app/api/<failing-spec>.spec.ts --workers=1 || echo "RUN $i FAILED"
done
```

Then run it inside its own suite tag:

```bash
npx playwright test --grep "@App-regression" --workers=1
```

Compare results:

| Isolated 5× | In suite | Diagnosis |
|---|---|---|
| 0 fails | 0 fails | Was a one-off (CI quirk, transient API hiccup). Watch but don't fix. |
| 0 fails | ≥1 fail | **Cross-test interference.** Bisect the polluting spec. |
| ≥1 fail | ≥1 fail | **Per-test instability.** Diagnose the test itself (§ Genuine-flake taxonomy). |
| 5 fails | 5 fails | Not flaky — real bug. Route to `debugging`. |

### Step 3 — For cross-test interference: bisect the pollutor

```bash
# Split the suite at the failing spec, run only what's BEFORE
npx playwright test --grep "@App-regression" --workers=1 \
  --grep-invert "<failing-spec-name>"
```

If the failing spec passes when its preceding peers are removed, one of those peers is leaking state. Common causes in this framework:
- **Synthetic not cleaned up** → next spec's "should not see any synthetics" fails. Fix: ensure `helpers/app/synthetics.deleteSynthetic(...)` in `afterEach`.
- **Probe not cleaned up** → cleanup-ordering violation (synthetics-before-probes). Fix per `helpers` skill § Cleanup ordering.
- **Storage state mutated** → a UI spec changed user prefs. Fix: re-create the user per worker, not per suite.
- **Tenant left in wrong state** → an admin spec changed tenant config. Fix: capture-and-restore in `beforeAll` / `afterAll`.

### Step 4 — For genuine per-test flakes: classify the cause

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `TimeoutError` on `expect(locator).toBeVisible()` | Element not rendered when assertion runs — race with async data | Wait on the upstream signal: `page.waitForResponse(url => url.includes('/api/data'))` before the assertion |
| `TimeoutError` on `getByRole("button", { name: "X" }).click()` | Button re-renders after data load — clicked stale element | Anchor the click on a parent that stabilizes: `await expect(container).toBeVisible(); await container.getByRole(...).click()` |
| Strict-mode violation: "resolved to N elements" | Duplicate elements appear briefly (skeleton + final) | Scope the locator: `card.getByRole(...)` not `page.getByRole(...)` |
| `ZodError` intermittently on `Schema.parse(body)` | API response shape varies (optional field appears sometimes) | Either: API is non-deterministic (real bug — file ticket), or schema is wrong (missing `.optional()`) |
| `401` from `apiRequest` after long local session | Storage-state token expired | Re-run `npx playwright test --grep "@setup"` to refresh storage state |
| `409` on creation | Previous test's resource not cleaned | Cleanup-order issue — see § Step 3 |
| Network race (response arrives mid-assertion) | `expect(locator).toHaveText(...)` runs before the XHR completes | Use `page.waitForResponse(...)` to gate the assertion |

### Step 5 — Verify the fix holds

```bash
# Run the spec 5 times in a row. ALL must pass.
for i in 1 2 3 4 5; do
  npx playwright test tests/app/<path>.spec.ts --workers=1 || echo "RUN $i FAILED — FIX INCOMPLETE"
done
```

Then run the spec inside its tag at parallelism (CI shape):

```bash
npx playwright test --grep "@App-regression" --workers=1
```

Only declare done when 5 consecutive isolated runs and 1 full-suite run all pass.

## Proactive detection — flake hunting

Three techniques, cheapest first. All of them run before a spec reaches main.

### A. Static flake-risk scoring (seconds, no execution)

Grep the changed specs and page objects for the constructs that cause flakes in this framework. Each hit is a risk point — this is a **review checklist, not a verdict**:

| Signal | Grep for | Why it flakes |
|--------|----------|---------------|
| Hard wait | `waitForTimeout` | Already a WON'T-rule violation; also the #1 flake source. |
| Unscoped locator | `page.getByRole` / `page.locator` in a spec | Strict-mode violation the moment a skeleton or duplicate renders. |
| Ungated action-then-assert | `.click()` immediately followed by `expect(` with no `waitForResponse` | The missing-wait race — ~40% of flakes here. |
| Non-web-first assertion | `expect(await ` | Snapshots a value instead of retrying on it. |
| Shared mutable state | module-scope `let` / `const` holding an id in a spec | Cross-test interference when workers or order change. |
| Missing cleanup | a create helper called with no matching `afterEach` / `afterAll` | Leaves state that trips a later spec (the `409` class). |
| Fixed test data | a hardcoded name/email where faker belongs | Collides with a previous run's leftovers. |
| `try`/`catch` in a spec | `try {` | Suppression; also hides intermittency from the report. |

Two or more hits on one spec means read it properly before merging. Zero hits does not prove stability — it only means the known shapes are absent.

### B. Repeat-run detection (minutes, this is the merge bar)

Run the changed spec 5× isolated at `--workers=1`. Anything short of 5/5 green is a flake found before it cost anyone an afternoon:

```bash
for i in 1 2 3 4 5; do
  npx playwright test <changed-spec> --workers=1 || echo "RUN $i FAILED"
done
```

Then once inside its tag, to catch interference the isolated run cannot see. Interpretation is the same table as § Step 2.

### C. Trend tracking (per suite, not per test)

A single failure is noise; a drifting pass rate is a signal. Track per-spec pass rate across CI runs and watch the **direction**, not the absolute value:

| Pass rate | Action |
|-----------|--------|
| 100% over 20+ runs | Stable. Leave it alone. |
| 95–99% | Watch. Triage when it next fails; do not chase it yet. |
| 80–95% | Triage now, before it becomes background noise the team learns to ignore. |
| < 80% | Quarantine per § Quarantine policy, then triage. It is actively destroying trust in the suite. |

The failure mode this catches: a suite where everyone knows "those three always fail, just re-run it". By then the signal is gone and real regressions hide in the noise.

## Quarantine policy

Quarantine is a last resort — the constitution prefers fixing over isolating, and forbids `test.skip` outright. When a flake is blocking a release and the fix is not same-day, all four of these are required together:

1. **Comment out the whole `test(...)` block** with `// FIXME: <TICKET> flaky — quarantined <YYYY-MM-DD>, expires <YYYY-MM-DD>`. Never `test.skip` — it corrupts Qase ID mapping.
2. **A ticket exists** and names the suspected cause, not just "flaky".
3. **An expiry date**, default 14 days. On expiry the test is fixed or the ticket is escalated — it does not lapse quietly.
4. **The coverage loss is reported** in the release notes or gate decision. A quarantined test is a documented gap, not an invisible one — this is the same discipline as a `CONCERNS` gate.

Review quarantined tests every sprint. A quarantine list that only grows means the team has stopped paying down flake debt, and the number is worth reporting upward as-is.

## Genuine-flake taxonomy

The most common per-test flake causes in this framework, in rough frequency order:

1. **Missing wait between cause and effect** (~40%). Test fires a click that triggers an XHR + DOM update, then asserts the updated DOM before the XHR has returned. Fix: `page.waitForResponse` or `expect(...).toHaveText(...)` (which auto-retries).
2. **Strict-mode violation under load** (~20%). Skeleton/placeholder + real content briefly co-exist. Fix: scope to the container that stabilizes.
3. **Cleanup ordering** (~15%). FK-constrained resource (synthetic → probe) deleted in wrong order, leaving an orphan that a later test trips on. Fix: per the `helpers` skill cleanup-order rules.
4. **Storage-state expiry** (~10%). Long sessions, `KEYCLOAK_*` tokens have TTL. Fix: rerun setup.
5. **Network jitter / API non-determinism** (~10%). Real bug on the BE side. Fix: file ticket, comment out test with `// FIXME: <TICKET>`.
6. **Genuine race in app code** (~5%). The flake is a real bug — the app has a race condition (e.g. two competing updates). Fix: file ticket, the FE must fix.

## Anti-patterns

- ❌ Adding `await page.waitForTimeout(2000)` "to give it time". Hard waits hide the real cause and amplify total runtime.
- ❌ Wrapping the assertion in `try { await expect(...).toBeVisible() } catch { await expect(...).toBeVisible({ timeout: 30_000 }) }`. Two-level catch is still suppression.
- ❌ Raising `expect.timeout` in `playwright.config.ts` globally. Every test eats the new timeout; flakes elsewhere now take 3× longer to surface.
- ❌ `test.describe.configure({ retries: 3 })` on the flaky describe block. Hides the underlying race; CI passes but production user hits the same race.
- ❌ Calling a test "fixed" after one green run. One green proves nothing about an intermittent failure.
- ❌ Marking the test `test.skip` with no ticket. Loses Qase ID mapping and removes visibility.
- ❌ Bisecting flakes by sprinkling `console.log`. Use the trace (`trace: 'on-first-retry'` in `playwright.config.ts` already captures one).

## Self-review checklist

- [ ] Ran the failing spec in isolation 5× and recorded the pass/fail count.
- [ ] Ran the failing spec inside its tag at `--workers=1` and recorded the result.
- [ ] Classified the failure: real bug / cross-test interference / per-test flake / CI-only.
- [ ] If cross-test interference: identified the polluting spec and the leaked state.
- [ ] If per-test flake: matched the symptom to a row in § Step 4's table.
- [ ] Fix is applied and verified with 5 consecutive isolated runs + 1 full-tag run, all green.
- [ ] No `waitForTimeout`, no try/catch around `expect`, no raised global timeout, no `test.describe.configure({ retries })`.
- [ ] If file-a-ticket path: ticket exists and test is commented out with `// FIXME: <TICKET>`, not `test.skip`-ed.
- [ ] **Pre-merge (hunting mode):** static flake-risk grep run over the changed specs; two-or-more hits were read properly.
- [ ] **Pre-merge (hunting mode):** changed spec repeat-run 5× isolated, 5/5 green, plus one in-tag run.
- [ ] If quarantined: comment-out (not `test.skip`), ticket with suspected cause, expiry date set, coverage loss reported in the gate decision.
- [ ] Confirmed flake cause with reuse value stored via `qe-pattern-memory` rather than re-derived next time.

## Examples

### Example 1 — Cross-test interference (cleanup ordering)

**Symptom:** `synthetic-monitor-crud.spec.ts > "creates a new HTTP monitor"` passes in isolation but fails in `@App-regression` with a `409 Conflict` on the create POST.

**Triage:**
1. Step 2 isolation: 5/5 green → confirms not a per-test bug.
2. Step 3 bisect: removed the preceding `synthetic-monitor-edit.spec.ts` → the failing test now passes in suite.
3. Cause: the edit spec mutated a fixture-seeded monitor and didn't restore it; the create spec then tries to create with the same name and gets 409.

**Fix:** Add `afterEach` in `synthetic-monitor-edit.spec.ts` calling `deleteSynthetic(apiRequest, monitorId)` for the mutated row. Or rename the create spec's monitor to a faker-generated unique name.

**Verify:** 5× isolated green + 1 full-tag green.

### Example 2 — Per-test race (missing wait)

**Symptom:** `alerts-page.spec.ts > "renders firing alerts"` fails ~30% of CI runs with `TimeoutError: expect(locator).toBeVisible()` on the first alert row.

**Triage:**
1. Step 2 isolation: 3/5 green → confirms genuine flake.
2. Trace replay: the alerts XHR returns *after* the assertion timeout. The test clicks the Refresh button then immediately asserts the row — but the row only appears after `/api/v1/alerts` resolves.

**Fix:** Gate the assertion on the response:
```ts
await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/v1/alerts')),
  alertsPage.refresh(),
]);
await expect(alertsPage.firstAlertRow).toBeVisible();
```

**Verify:** 5× isolated green + 1 full-tag green.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Test passed locally 5× but still fails in CI" | CI is slower; absolute-timing assumptions fail. | Replay the CI trace (`show-trace`), look for the action that's slow in CI. Often the fix is the same as a per-test race (use `waitForResponse`). |
| "Bisect doesn't isolate one spec — every preceding spec triggers the fail" | Storage-state staleness or session-level leakage. | Check `tests/app/login.setup.ts`. Restart workers between tags (CI does, local may not). |
| "Spec is `@App-Critical` and CI runs it on a tight budget" | Critical tag has stricter timeout; spec is slow but not flaky. | Move spec to `@App-regression` if the run-time budget is the issue; don't retry it under Critical. |
| "Flake only happens when ICMP probe is unhealthy" | External dependency; flake is environmental. | This is not a test bug — file env ticket; comment out with `// FIXME: <ENV-TICKET>`. |

## See Also

- [`debugging`](../debugging/SKILL.md) — failure-mode taxonomy, trace/UI mode workflow. Use first for any failure; promote here only when intermittent.
- [`helpers`](../helpers/SKILL.md) — cleanup-ordering rules that prevent cross-test interference.
- [`api-testing`](../api-testing/SKILL.md) — cleanup patterns for API specs.
- [`page-objects`](../page-objects/SKILL.md) — action methods must include built-in waits; thin action methods are a flake source.
- [`selectors`](../selectors/SKILL.md) — strict-mode locator design; web-first assertions.
- [`qe-pattern-memory`](../qe-pattern-memory/SKILL.md) — store a confirmed flake cause once so the next session applies the fix instead of re-diagnosing it. This skill is the store's biggest producer.
- [`mutation-testing`](../mutation-testing/SKILL.md) — a *stable* test is not the same as a *useful* one; verify the assertion bites after stabilising it.
- [`defect-prediction`](../defect-prediction/SKILL.md) — product-code risk ranking. Do not confuse an unstable test with a risky module; the two need different work.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Won't rules forbid all the flake-suppression patterns this skill warns about.
- Memory: `Always run Playwright tests with --workers=1` — shared tenant env causes cross-spec flakes in parallel.
