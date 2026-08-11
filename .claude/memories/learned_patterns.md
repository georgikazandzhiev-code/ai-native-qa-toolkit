# 🧠 Learned patterns — the agent's memory across sprints

**READ RULE.** Read this file **before** generating or refactoring any Playwright test, page object or selector. Re-deriving something already recorded here is wasted work; contradicting it without a falsification entry is a defect.

**WRITE RULE.** When you heal a selector, find the root cause of a flaky test, or hit a project-specific edge case, record it here **in the same edit as the fix** — not "later". A lesson recorded a day after the fix has already lost the artifact that proves it.

**Every entry carries an evidence label.** `EXECUTED` — a command was run and its output is in the entry. `STATIC` — read from source or a contract. `INFERRED` — reasoned, not verified. **`INFERRED` entries may suggest; they may never gate a decision.** An unlabelled entry is indistinguishable from a guess.

**Hard cap: 12 cases in § 2.** Past that this file has stopped being memory and become a landfill nobody reads. Before adding the thirteenth, either merge two entries or promote one out — see § 5.

> **Two of the three code snippets in the original draft of this file violated the constitution** — a redundant `waitFor` before a web-first assertion, and a `waitForResponse` registered after the action that triggers it. They are corrected below, with the reason, because a memory file that teaches a bad pattern poisons every session that reads it. `npm run test:memory` now lints every snippet in this file against the same 16 rules the test suite is held to.

---

## 🎯 1. Resilient selector catalog

Locator priority is not negotiable: `getByRole` → `getByText` → `getByLabel` → `getByPlaceholder` → `getByAltText` → `getByTitle` → `data-testid` **last**. This table records which locator *won* for a given component shape, never a shortcut past the hierarchy.

| Component | Use | Avoid | Why |
|---|---|---|---|
| Modal / dialog | `getByRole('dialog', { name: '…' })` | `div.modal-body > button` | The portal re-mounts on every open; a CSS path through it breaks on re-render. The role survives. |
| Table row | `getByRole('row').filter({ has: getByRole('cell', { name: id, exact: true }) })` | `tr:nth-child(3) > td` — and `getByTestId('data-row-<id>')` as a *fallback*, not a default | Rows re-sort, so an index passes for the wrong row. A table renders real ARIA roles; reach for a test-id only when it does not. |
| Action button | `getByRole('button', { name: 'Submit' })` | `button.btn-primary` | A complex form has several primary buttons. The accessible name is the thing the user actually distinguishes. |
| Async input | `getByLabel('Search users')` | `input[name="search"]` | Label association is the accessibility contract; if the label is missing, that is a product bug worth filing, not a locator problem to route around. |
| Dynamic value in a locator | always pass `{ exact: true }` | `filter({ hasText: value })` bare | Substring collision: `"Item9"` matches `"Item90"` silently. Passes locally, breaks on real data. **EXECUTED** — this is a lint rule, not advice. |

**Radix and other portalled components:** the popover is a `listbox`, its items are `option`s. Anchor on the trigger, then drill into the portal by role. Full recipes: `selectors` skill → `recipes.md § Radix`.

---

## 🛡️ 2. Flaky-test root causes and the fix that held

### 📌 Case #001: a click intercepted by a fade-in overlay

- **Issue:** `click()` intermittently intercepted; the element was present, its opacity transition still running.
- **Root cause:** presence in the DOM is not readiness for input.
- **Evidence:** INFERRED — a common shape, kept as the reference example. Replace with a real trace when it happens here.
- **Learned fix:**

```ts
// ❌ waitForTimeout — forbidden. Passes on a fast machine, fails in CI.
// await page.waitForTimeout(2000);

// ❌ Also wrong, and this was in the first draft of this file: waitFor() followed by
// the same assertion. The web-first assertion already retries until visible or times
// out, so the extra line adds a second timeout budget and no information.
// await modal.waitFor({ state: 'visible' });

// ✅ One web-first assertion. It retries, and it reports what it saw on failure.
const modal = page.getByRole('dialog', { name: 'Confirm action' });
await expect(modal).toBeVisible();
await modal.getByRole('button', { name: 'Confirm' }).click();
```

### 📌 Case #002: a select rendered empty because its options were still loading

- **Issue:** options asserted before the fetch that fills them resolved.
- **Root cause:** the wait was registered *after* the action that triggers the request, so the response could land in between and never be seen.
- **Evidence:** INFERRED — reference example.
- **Learned fix:**

```ts
// ❌ Registered too late — this is a race, not a wait. It was in the first draft.
// await page.getByRole('button', { name: 'Open' }).click();
// await page.waitForResponse(r => r.url().includes('/options') && r.status() === 200);

// ✅ Arm the wait BEFORE the action, then await both.
const optionsLoaded = page.waitForResponse(
  (r) => r.url().includes(ApiRoute.Options) && r.ok(),
);
await page.getByRole('button', { name: 'Open' }).click();
await optionsLoaded;

// ✅ Assert non-emptiness, not a magic count. A hardcoded 5 breaks the day a
// sixth option ships, and it was never the thing under test.
await expect(page.getByRole('option')).not.toHaveCount(0);
```

### 📌 Case #003: a lint rule reported correct code, three times, for the same reason

- **Issue:** `schema-parse-idiom` flagged `Project.parse(body).id` — a parse whose field is read on the spot, so nothing is discarded.
- **Root cause:** the rule was written as an **allowlist of accepted parent node types**. Every shape of *using* a value that its author had not enumerated read as *discarding* it. Third defect in that one rule, same cause each time.
- **Evidence:** EXECUTED — `node tests/fault-injection.test.mjs` → `FALSE + schema-parse-idiom  1 on smoke/good/: projects.spec.ts:57`.
- **Learned fix:** when a rule must decide "is this value used?", ask that question directly — walk out to the nearest enclosing statement and check whether anything reads the result. Do not enumerate the good cases. **Generalises beyond linting:** an allowlist of accepted forms is a false-positive generator wherever the set of valid forms is open.

### 📌 Case #004: `expect.soft(...)` is the idiom in a negative-case loop, not a violation

- **Issue:** a rule demanded bare `expect(Schema.parse(body)).toBeTruthy()` and rejected `expect.soft(Schema.parse(body), label).toBeTruthy()`.
- **Root cause:** a per-field omission loop must keep running after the first failure, or you learn about one field per run. `expect.soft` is the correct form and is modelled five times in `api-testing/templates.md`.
- **Evidence:** EXECUTED — 5 of 41 findings in the first pass of eval run 3 were this.
- **Learned fix:** before believing a tool that reports your own convention as a violation, **open the line**. A report is not evidence; the line is.

### 📌 Case #005: a +1 score change was noise, and the baseline proved it

- **Issue:** a fix moved a skill's eval score 12 → 13 and it looked like a win.
- **Root cause:** the **baseline arm moved 14 → 15 in the same run with nothing changed on its side.** At two cases, ±1 is run-to-run variance.
- **Evidence:** EXECUTED — `npm run eval:compare` → `WITHIN NOISE: 1.1.0 → 1.2.0: 12 → 13 (delta +1, noise floor ±2 at 2 case(s))`.
- **Learned fix:** never read a delta without the control arm from the same run, and never below the noise floor for the sample size. A tool that reports variance as progress teaches you to trust noise.

---

## 🚨 3. Domain edge cases that must reach the Gherkin

Project-specific quirks, discovered in QA, that a spec written from the story alone would miss. **Each needs an owner and a date** — an undated quirk becomes folklore.

| Quirk | What a spec must therefore do | Evidence | Recorded |
|---|---|---|---|
| _(example shape — replace, do not ship this row)_ Idle sessions expire faster in pre-prod than in production | Multi-step form scenarios need an explicit re-auth or token-refresh step, or they fail at the last step for the wrong reason | INFERRED | — |
| _(example shape)_ Currency inputs trim trailing zeroes on blur | Assert the **numeric value**, never the formatted string. `"10.00"` and `"10"` are the same amount and a different string | INFERRED | — |

---

## 🤖 4. Auto-update protocol

When a self-correction loop or a failed dry run produces a real lesson:

1. **Check § 2 first.** If the root cause is already recorded, add nothing — cite the case number in the PR instead. Duplicates are how a memory file dies.
2. **Decide whether it belongs here at all.** It does only if all three hold: **reusable** by a future session, **non-obvious** (not already in a skill or the constitution), and **falsifiable** (written so someone can test whether it still holds). Otherwise it goes in the PR description.
3. **Append** using the exact shape below, in the same edit as the fix.
4. **Label the evidence.** No label, no entry.
5. **When a recorded pattern turns out to be wrong**, do not delete it — append `**Falsified <date>:** <what happened>` to the entry and strike the fix. The next agent needs to know the idea was tried.

```markdown
### 📌 Case #NNN: <short title, named for the cause not the symptom>

- **Issue:** <what was observed>
- **Root cause:** <why, not what>
- **Evidence:** EXECUTED | STATIC | INFERRED — <command and output, or source>
- **Learned fix:** <the pattern, and what it generalises to>
```

---

## 5. When an entry graduates

This file is an **inbox**, not the archive. Three exits, and every entry should eventually take one:

| If the lesson… | Then it moves to | Because |
|---|---|---|
| recurs on this repo and holds twice | the repo's `.qe-memory/` store as a scored pattern — see the `qe-pattern-memory` skill | it has earned a confidence score and a tier, which a flat file cannot carry |
| is a convention every repo should follow | a rule in the matching skill, via `skill-creator` | a convention belongs where it is routed to automatically, not where it is remembered |
| is mechanically checkable | a lint rule in `eslint-plugin-qa-constitution` | prose an agent is asked to follow is weaker than a check a pipeline refuses to merge past |

An entry that has sat here unpromoted for two sprints is telling you it was never reusable. Drop it.

## See also

- `selectors` skill — the locator priority hierarchy this file records outcomes against.
- `qe-pattern-memory` skill — the scored, tiered store an entry graduates into.
- `flakiness-triage` skill — the triage path before a flake becomes an entry here.
- `debugging` skill — trace-viewer workflow for finding the root cause an entry needs.
