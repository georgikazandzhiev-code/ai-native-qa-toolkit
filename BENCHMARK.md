# Benchmark — do these skills actually change the output?

**Run date:** 2026-08-11 · **Method:** blind A/B, 6 eval cases, 45 checkable expectations · **Model:** Claude Opus 5, `effort: high`, both arms

This repository argues that AI output must be proven rather than asserted. That obligation applies to the repository itself, so the skills were measured the same way they ask tests to be measured. **The result is not flattering and is published unchanged.**

## Headline

| | Expectations met | Rate |
|---|---:|---:|
| **With skill** | 40 / 45 | **88.9%** |
| **Baseline** (no skill, no constitution) | 40 / 45 | **88.9%** |

**No measured lift overall.** Case outcomes: 1 win for the skill, 2 for baseline, 3 ties.

## Per skill

| Skill | With skill | Baseline | Δ | Reading |
|---|---:|---:|---:|---|
| `api-testing` | 15/16 (93.8%) | 15/16 (93.8%) | 0 | Parity. Both arms broke the same rule (see below). |
| `selectors` | **12/15 (80.0%)** | 14/15 (93.3%) | **−2** | **The skill made the output worse.** A real defect — see § The defect. |
| `mutation-testing` | **13/14 (92.9%)** | 11/14 (78.6%) | **+2** | The skill won, and won on exactly the expectations it exists for. |

## Per case

| # | Skill | Case | Exp. | With skill | Baseline | Winner |
|---|---|---|---:|---:|---:|---|
| 1 | `api-testing` | New endpoint spec from a contract | 10 | 9 | 9 | tie |
| 2 | `api-testing` | "Fix my test so the suite goes green" (schema-loosening trap) | 6 | 6 | 6 | tie |
| 3 | `selectors` | Strict-mode violation on a table row action | 8 | 8 | 8 | tie (grader preferred baseline's construction) |
| 4 | `selectors` | Page-object locators for a settings form | 7 | **4** | 6 | **baseline** |
| 5 | `mutation-testing` | Black-box repo, "set up mutation testing" | 7 | 6 | 6 | tie |
| 6 | `mutation-testing` | "Management wants 80% before the release" | 7 | **7** | 5 | **skill** |

## The defect this exposed

`selectors` degrades the output, consistently, in both of its cases:

- **Case 4.** The skill arm made `data-testid` the **primary** locator for nearly every element, demoting `getByRole` / `getByLabel` to comments and `.or()` branches. The skill's own priority hierarchy puts `data-testid` last. It failed three expectations by breaking its own stated rule.
- **Case 3.** Both arms met all eight expectations, but the skill arm anchored the table row on a CSS structural selector (`tbody tr:not([data-testid="expanded-row"])`) reached through an invented `getByTestId('data-table')`, and wrapped the answer in a page object depending on several unverified test-ids. Baseline identified the row purely through roles — `getByRole('row')` filtered by `getByRole('cell', { name: 'Apollo' })` — and depended on nothing but table semantics.

**Working hypothesis:** the Radix recipes and test-id taxonomy sections are long and concrete enough to drown the priority hierarchy. The model absorbs *how to use a test-id* more strongly than *test-id is a last resort*. Volume beat precedence.

This is a content defect, not a measurement artifact, and it is tracked as the top item in § What changes next.

## Where the skills genuinely earned their place

The one clear win is instructive. In case 6 the baseline accepted the premise — it optimised toward the 80% target and shipped `thresholds.break: 80` into CI, treating the metric as the goal while declining only the crudest ways to game it. The skill arm refused the vanity metric outright, ordered survivors by user-observable impact, deliberately left `thresholds.break` unset until a baseline existed over three runs, and gated on per-file regression instead.

Case 2 is the same shape at parity: both arms refused to loosen the schema, but for different reasons — baseline from first-principles consumer impact, the skill arm by citing its own rule.

The pattern across all six cases: **the skills do not teach the model test automation. They constrain what it is willing to agree to.**

## Honest limitations

1. **The baseline is strong.** Claude Opus 5 at high effort already knows Playwright, Zod and modern QA practice. Most of the 45 expectations measure general good practice, which the baseline satisfies unaided. The rubric therefore under-measures what these skills are actually for — house conventions and refusals — and over-measures what any capable model already does. That is a flaw in the eval design, not a caveat on the result.
2. **Small n.** Six cases, three skills, one run each. No variance estimate. A rerun could move a case either way.
3. **Single grader per case.** Blind to arm assignment (A/B order alternates by case index), but not adversarially verified by a second grader.
4. **Twenty-three skills untested.** 23 of the 26 skills have no eval cases at all.
5. **Cost.** The run took ~8 minutes across 18 agents and ~1.1M subagent tokens. Cheap enough to repeat, expensive enough to be deliberate about.

## What changes next

Ordered by the evidence above, not by preference:

1. **Fix `selectors`.** Move the Radix recipes and test-id taxonomy into `reference.md`, leave the priority hierarchy alone in `SKILL.md`, and re-run cases 3 and 4. The hypothesis is that volume is beating precedence; the fix is boundary discipline, which the skill contract already mandates and this skill violates.
2. **Rewrite the rubrics to measure conventions, not competence.** Expectations that a strong model satisfies unaided tell us nothing. Replace them with the house-specific rules: fixtures-barrel imports, `z.strictObject`, single tag, cleanup ordering, the specific refusals.
3. **Fix the shared `api-testing` miss.** Both arms put conditionals in test bodies — ternaries for leaked-id capture in one, `if` statements in an omission loop in the other. The constitution forbids this and permits `try`/`catch` only for capturing an accidentally-created resource id. Neither arm found that path, which suggests the rule is stated but the sanctioned alternative is not discoverable.
4. **Add cases for the remaining skills**, starting with `test-standards`, `type-safety` and `qe-pattern-memory`.
5. **Add a second grader** and count only expectations both graders agree on.

## Run 2 — after fixing `selectors` (same day)

The `selectors` regression was diagnosed and fixed, then the same two cases were re-run with **byte-identical prompts and rubric**. Only the skill changed.

**Diagnosis.** The `Priority hierarchy` section carried 18 mentions of the Radix exception against 3 of `getByRole`. The section meant to establish *role first, test-id last* spent three quarters of itself arguing for the exception, and the Critical block stated "`getByTestId` jumps to priority 4" as its second rule. Agents were reading the exception as the default.

**Fix.** Moved the exception's full rationale to `recipes.md`, restated the rule narrowly in `SKILL.md` (per element, never above priority 4), and rewrote the first three Critical rules to lead with `getByRole` and to forbid generalising the exception to a page or form.

| | Run 1 | Run 2 | |
|---|---:|---:|---|
| `selectors` with skill | 12/15 | **13/15** | +1 |
| `selectors` baseline | 14/15 | **15/15** | +1 |
| Gap | −2 | **−2** | unchanged |

**Honest reading: the targeted defect is fixed; the score is not yet.**

- **The defect itself is gone.** The grader was asked separately which answer made `data-testid` the *default* locator choice. Run 1: the skill arm did. Run 2: **"neither", in both cases.** That is the specific failure the fix targeted, and it no longer occurs.
- **The score movement is inside the noise.** Baseline improved by exactly the same +1 with *zero* changes to it, so ±1 at n=1 per case is run-to-run variance. The skill's +1 cannot be claimed as a real gain on this evidence.
- **Two narrower failures replaced the big one.** In case 2 the skill arm still promoted test-ids for the Radix *popover content, options, and validation message* — where `role="listbox"`, `role="option"` and `role="alert"` exist — and attached JSDoc to locator getters, which the convention forbids.

Both were fixed after run 2: the exception is now explicitly scoped to the **trigger** rather than the component subtree, with the portal's real ARIA roles named, and the no-JSDoc-on-getters rule was added to the skill itself (it existed only in the constitution, which the eval deliberately withholds from the skill arm).

**Not re-measured.** Those two fixes have no run behind them yet. They are recorded as changed-but-unverified rather than counted as an improvement.

### What this run actually established

The loop works: a published number exposed a real content defect, the defect was diagnosed from the skill's own text, the fix was applied, and the re-run confirmed the specific behaviour changed. What it did **not** establish is a score gain — and at two cases per skill it could not have. The next honest step is more cases per skill, not another tweak.

## Run 3 — the lint gate: an objective metric, and six defects it found in itself

Runs 1 and 2 graded with an LLM against written expectations. Most of those expectations measured
general competence, which a capable model already has, so the arms tied. Run 3 replaced the grader
with a **machine**: both arms generate a real `.ts` file, and the score is the violation count from
`eslint-plugin-qa-constitution`. No judgement, no rubric, no grader variance.

Three tasks — a POST endpoint spec, a page object, a four-call lifecycle spec. Identical prompts for
both arms. The prompts deliberately withhold the barrel path and the tag whitelist, because whether
the skill transmits house conventions is the thing being measured.

### Result

| Case | Baseline | With skill |
|---|---:|---:|
| 1 — API spec | **12** | **0** |
| 2 — Page object | **2** | **0** |
| 3 — Lifecycle spec | **3** | **0** |
| **Total** | **17** violations / 416 lines | **0** violations / 742 lines |

The skill arm produced 78% more code and zero constitution violations. The baseline invented a tag
(`@api`) that does not exist in the whitelist, put JSDoc on locator getters, used `try`/`catch` in a
test body, and left a test untagged — every one of them a convention it had no way to know.

**This is the first measured lift in the whole exercise, and the metric that produced it is the one
that cannot flatter anybody.**

### The part worth reading: the harness was wrong six times

The first pass of run 3 reported the skill arm as **worse** than baseline — 23 violations against 18.
Every one of those extra findings was a defect in the linter or the harness, not in the skill. They
were caught by opening the flagged line instead of trusting the report.

| # | Defect | What it falsely accused |
|---|---|---|
| 1 | Fabricated tag whitelist in the harness config | The skill arm chose `@App-API` and `@App-E2E` — both valid, both semantically right. The invented whitelist rejected them, and 29 of 41 reported violations were this one mistake. |
| 2 | `eslint-plugin-playwright` not registered | A generated file's `eslint-disable` for one of its rules made ESLint report "Definition for rule not found" as an error. |
| 3 | `isTestCall` did not exclude lifecycle hooks | `test.beforeAll` / `test.afterAll` reported as "a test with no tag". |
| 4 | `enclosingTest` did not stop at a hook | An `if` inside `beforeAll` reported as forbidden conditional logic — when seeding a precondition there is exactly what the constitution *requires*. |
| 5 | `no-conditional-in-test` too broad | `body: method === 'DELETE' ? undefined : {}` — shaping a payload in a 405 loop — reported as steering around missing data. |
| 6 | `schema-parse-idiom` accepted only bare `expect(...)` | **The most consequential.** All five "discarded parse result" findings were `expect.soft(Schema.parse(body), label).toBeTruthy()` — the correct form for a negative-case loop, modelled five times in the skill's own `templates.md`. |

Defect 6 is the one to dwell on. Had run 3 been published as first reported, this repository would
have claimed — authoritatively, with a number — that its own `api-testing` skill violates the MUST
rule it exists to enforce. An LLM grader would have agreed. What prevented it was that `npx eslint`
names a file and a line number, and the line, when opened, said the opposite.

**A report is not evidence. The line is.**

All six are fixed. Defects 3–6 are locked in with regression suites: 21 `RuleTester` suites now,
including one per false positive, each carrying the code that was wrongly flagged.

### One change to the skill, and it was not a fix

The negative-matrix table in `api-testing/SKILL.md` listed its validation column as a bare
`APIErrorSchema.parse(body)` — the shorthand, not the mandated idiom. Eleven such forms across two
files are now written out in full. The generated code was already correct, so this repaired no
defect; an example that shows shorthand where a rule demands a full form is still worth removing,
because an agent copies examples far more reliably than it follows prose.

### Limitations

1. **Three cases, one run each.** No variance estimate. A rerun could move a number.
2. **The metric only covers the enforceable half.** Zero lint violations does not mean the spec is
   good — it means it breaks no mechanically checkable rule. Selector quality, coverage adequacy and
   cleanup correctness are still unmeasured.
3. **Two skills of 26 have lint-gate coverage.** The others are still asserted.
4. **The baseline is uninformed by construction.** Withholding the conventions is the point, but it
   means the result measures *convention transmission*, not whether the conventions are good ones.

### What changes next

1. Extend the lint gate to the remaining skills, five cases each, so a claim about "the toolkit"
   stops being a claim about three tasks.
2. Add rules for the constitution items still unenforced but checkable: `test.step` per API call
   when a test makes two or more, and `qase.suite` as the first statement in a test body.
3. Re-run runs 1 and 2 with rubrics rewritten to measure conventions rather than competence — the
   old expectations are known to be uninformative and their tie result should not be cited.
4. Wire the gate into CI on the automation repo with branch protection, so the number stops being a
   report and starts being a merge condition.

## Reproducing

Eval definitions live beside each skill at `.claude/skills/<skill>/evals/evals.json`. Machine-readable results: `.claude/skills/<skill>/evals/results.json`.

Each case runs twice — once with the skill file read in full, once with the skill and constitution explicitly withheld — then a grader scores both against the fixed expectation list without knowing which arm is which. "Partial" counts as not met.
