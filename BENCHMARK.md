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
4. **Two skills untested.** 23 of the 26 skills have no eval cases at all.
5. **Cost.** The run took ~8 minutes across 18 agents and ~1.1M subagent tokens. Cheap enough to repeat, expensive enough to be deliberate about.

## What changes next

Ordered by the evidence above, not by preference:

1. **Fix `selectors`.** Move the Radix recipes and test-id taxonomy into `reference.md`, leave the priority hierarchy alone in `SKILL.md`, and re-run cases 3 and 4. The hypothesis is that volume is beating precedence; the fix is boundary discipline, which the skill contract already mandates and this skill violates.
2. **Rewrite the rubrics to measure conventions, not competence.** Expectations that a strong model satisfies unaided tell us nothing. Replace them with the house-specific rules: fixtures-barrel imports, `z.strictObject`, single tag, cleanup ordering, the specific refusals.
3. **Fix the shared `api-testing` miss.** Both arms put conditionals in test bodies — ternaries for leaked-id capture in one, `if` statements in an omission loop in the other. The constitution forbids this and permits `try`/`catch` only for capturing an accidentally-created resource id. Neither arm found that path, which suggests the rule is stated but the sanctioned alternative is not discoverable.
4. **Add cases for the remaining skills**, starting with `test-standards`, `type-safety` and `qe-pattern-memory`.
5. **Add a second grader** and count only expectations both graders agree on.

## Reproducing

Eval definitions live beside each skill at `.claude/skills/<skill>/evals/evals.json`. Machine-readable results: `.claude/skills/<skill>/evals/results.json`.

Each case runs twice — once with the skill file read in full, once with the skill and constitution explicitly withheld — then a grader scores both against the fixed expectation list without knowing which arm is which. "Partial" counts as not met.
