---
name: defect-prediction
description: Rank files and changesets by defect risk using signals computable from git history, complexity and coverage — then spend test effort where the risk is, and calibrate the ranking against what actually broke. Use when deciding what to test first on a large surface, when scoping regression effort for a release, when reviewing a PR that touches many files, when a test budget will not cover everything, or when asked where the quality risk sits. Trigger phrases — "what should we test first", "where is the risk", "regression scope for this release", "which files are risky", "prioritise the test effort", "risk-based testing". Do NOT use for classifying an already-failing test (use the `flakiness-triage` skill). Do NOT for measuring whether existing tests assert anything (use the `mutation-testing` skill). Do NOT use for security-specific threat surfaces (use the `owasp-security-testing` skill).
metadata:
  category: domain
---

# Defect Prediction

Risk-based prioritisation for finite test effort. When the surface is bigger than the budget, the alternative to ranking is testing alphabetically, testing what is easy, or testing what was tested last time — all of which leave the actual risk uncovered. This skill produces a defensible ranking from signals anyone can recompute, and then checks whether the ranking was right.

The failure mode this prevents: a confident risk score that nobody can explain, that was never checked against reality, and that quietly misallocates a whole release's regression effort.

This skill has no paired rule (rule disposition: skill-only).

> **On "ML-powered" defect prediction.** Tools in this space advertise trained classifiers and probability scores. Treat that claim as unverified unless you can point at the model, its training data, and its measured precision on *your* codebase. Everything in this skill is a **heuristic ranking recomputable by hand from `git log`** — weaker on paper, and the only version that survives an audit question of "how did you arrive at this?"

## Critical

- **NEVER present a risk score as a probability.** This produces an *ordering*, not a forecast. "Highest-risk file in this changeset" is defensible; "73% chance of a defect" is not, and it will be quoted back at you.
- **ALWAYS show the per-signal breakdown next to any score.** A score without its components cannot be argued with, corrected, or trusted. If the output is one number, it is not usable.
- **ALWAYS use bug-fix density as the primary signal when git history is available.** Files that have been fixed repeatedly are where the next defect lands. It is the strongest and cheapest signal, and it beats complexity metrics.
- **NEVER rank on complexity alone.** A long, gnarly file that has not changed in two years and never had a bug fix is not a risk. Complexity only becomes risk when it is combined with change.
- **ALWAYS intersect risk with coverage before allocating effort.** High risk with good coverage needs watching; high risk with no coverage is the actual work. Ranking without the coverage axis sends effort to places already protected.
- **NEVER use the ranking to justify skipping a requirement's test.** Every requirement still needs at least one test — the constitution's coverage rule is not negotiable by risk score. Ranking sets *depth and order*, never *whether*.
- **ALWAYS calibrate after the fact.** After a release, check whether the defects that surfaced were in the files ranked highest. An uncalibrated ranking is astrology with a spreadsheet.
- **NEVER let the ranking be computed once and reused across releases.** Risk moves with every commit. A stale ranking is worse than none, because it carries authority it no longer earns.

## What's in each file

| File | Purpose | Load when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Signals, weighting, the risk × coverage decision, calibration loop, anti-patterns. | **Always** — on any prioritisation question. |
| **[`reference.md`](reference.md)** | The git commands per signal, normalisation, the scoring table, changeset-level variant, calibration record shape. | When computing a ranking or wiring it into a pipeline. |

**Boundary rule:** decisions and interpretation here; commands and arithmetic in `reference.md`.

## The signals

Seven signals, all recomputable, ordered by how much they carry:

| # | Signal | What it measures | Why it predicts |
|---|--------|------------------|-----------------|
| 1 | **Bug-fix density** | Commits touching the file whose message marks a fix, bug, hotfix or regression. | Defects cluster. A file fixed five times gets fixed a sixth. Strongest single signal. |
| 2 | **Churn** | Commit count and lines changed in a window (default: 90 days). | Code that changes carries new defects; code that does not, does not. |
| 3 | **Recency** | Days since last change. | Risk decays. A fix six days ago is unsettled; a fix two years ago is proven. |
| 4 | **Author spread** | Distinct authors touching the file in the window. | Many hands means diluted ownership and inconsistent assumptions. |
| 5 | **Co-change coupling** | How many other files habitually change together with this one. | High coupling means a change here ripples where nobody looked. |
| 6 | **Complexity proxy** | Size, nesting depth, branch count. | Amplifier, not a cause. Only counts when combined with 1–3. |
| 7 | **Falsified patterns** | Count of `.qe-memory` patterns about this file that were falsified. | A file whose behaviour we have been wrong about repeatedly is poorly understood. |

Signals 1–3 do most of the work. If time is short, compute only those and say so.

## Weighting

Start here, then tune per repo against calibration results:

| Signal | Weight |
|--------|-------:|
| Bug-fix density | 30% |
| Churn | 20% |
| Recency | 15% |
| Author spread | 10% |
| Co-change coupling | 10% |
| Complexity proxy | 10% |
| Falsified patterns | 5% |

Two rules about the weights. **Publish them with the output** — an unpublished weighting is an unfalsifiable one. And **change them only from calibration evidence**, never because a stakeholder dislikes where their module landed.

## The risk × coverage decision

Ranking alone does not tell you what to do. Cross it with current coverage:

| | **Low coverage** | **Good coverage** |
|---|---|---|
| **High risk** | **Do this first.** The whole point of the exercise. | Watch. Add depth (negative cases, mutation testing) rather than breadth. |
| **Low risk** | Accept, with the requirement-level minimum still met. | Done. Do not spend here. |

The top-left cell is the deliverable. If a ranking exercise does not end with a concrete list of "these N files, in this order", it produced a report instead of a decision.

## Workflow

1. **Fix the window and the scope.** Default 90 days; the scope is the release diff, the PR, or a module. State both in the output — a ranking without a window is not reproducible.
2. **Compute signals 1–3 first** and look at the result. Often the ordering is already obvious and the remaining signals only confirm it.
3. **Add signals 4–7** if the top of the list is ambiguous or the stakes justify the effort.
4. **Normalise and score** per `reference.md`. Keep the per-signal columns in the output.
5. **Overlay coverage** and produce the four-cell split above.
6. **Convert to a test plan.** The top-left cell becomes ordered, named work — specs to write, negative matrices to complete, modules to mutation-test.
7. **Record the ranking** with its date, window, weights and scope. This is the artifact calibration compares against.
8. **Calibrate after the release** per § Calibration.

## Calibration

The step that separates this from guessing, and the one everybody skips.

After a release, take the defects that actually surfaced — production incidents, escaped bugs, hotfixes — and map each to the file that carried it. Then ask one question: **what share of them were in the top quartile of the ranking?**

| Share in top quartile | Reading |
|---|---|
| ≥ 50% | The ranking is working. Keep the weights. |
| 25–50% | Weak but better than random. Tune the weights toward whichever signal the missed files scored high on. |
| ~25% | No better than chance. The signals do not fit this codebase; investigate before ranking again. |
| < 25% | Actively misleading. Stop using it until the cause is understood. |

Record every calibration round. Three rounds of evidence is what lets you defend the weighting to an auditor or a sceptical engineering manager — and what tells you honestly when to stop.

## Anti-patterns

- ❌ Emitting a single risk number with no breakdown. Unarguable, therefore untrustworthy.
- ❌ Calling the output a probability or a prediction. It is an ordering.
- ❌ Ranking by complexity because it is the easiest metric to compute. Static complexity without change history flags the wrong files.
- ❌ Skipping a requirement's test because its file ranked low. Risk changes depth, never whether a requirement is covered.
- ❌ Reusing last release's ranking. Every commit invalidates it a little.
- ❌ Never calibrating. Without the feedback loop the weights are decoration.
- ❌ Tuning the weights because a team lead objects to their module ranking high. Tune from calibration data only.
- ❌ Counting merge commits and bulk reformatting as churn. Both inflate the score on files nobody meaningfully touched.
- ❌ Presenting the ranking without stating the window and scope. Not reproducible, so not evidence.

## Self-review checklist

- [ ] Window and scope stated explicitly in the output.
- [ ] Bug-fix density computed, not just complexity.
- [ ] Per-signal breakdown shown alongside every score.
- [ ] Weights published with the ranking.
- [ ] Merge commits and bulk-format commits excluded from churn.
- [ ] Coverage overlaid; the four-cell split produced.
- [ ] Output is an ordered list of named work, not a report.
- [ ] Every requirement still has at least one test regardless of rank.
- [ ] Ranking recorded with date, window, weights and scope.
- [ ] A calibration round is scheduled or, for a repeat exercise, the previous one has been read.
- [ ] Nothing in the output is phrased as a probability.

## Examples

### Example 1 — Regression scope for a release under a hard deadline

A release touches 84 files; there is time to regression-test roughly a quarter of them.

Signals 1–3 over 90 days, merge and format commits excluded. Three files separate clearly from the rest: each has 4+ fix commits, high churn, and a change within the last week. Two more are mid-pack on churn but carry the highest fix density in the repo.

Coverage overlay: four of the five sit in **high risk / low coverage**. That is the scope — named, ordered, and defensible when someone asks why their module was not covered.

Output states: window 90 days, scope = release diff, weights published, five files ranked with their per-signal columns. Two weeks later, calibration: three of the four escaped defects were in those five files. Ranking kept.

### Example 2 — A PR-level ranking that changes the review, not the tests

A PR touches 11 files. Changeset-level signals put one small utility file at the top — low churn, but the highest fix density in the repo and coupled to nine other files.

The decision is not "write more tests for the utility". It is: **this PR needs a closer review of that file's blast radius**, and the coupled consumers need a regression check. Nothing about the other ten files changes.

This is the shape of most PR-level use. The output is attention, not test count.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Every file scores about the same | Window too long, or the repo was recently mass-reformatted so churn is uniform. | Shorten the window to 30–60 days; exclude the reformat commit by hash. |
| Test files dominate the ranking | Specs are being counted as source. | Exclude test globs from the scope. Rank what is under test, not the tests. |
| Ranking says a file is risky but the team insists it is stable | Often a config or generated file with high churn and no logic. | Exclude generated and config paths. If it is genuinely hand-maintained, the ranking may be right — check its fix history. |
| Bug-fix density is zero everywhere | Commit messages do not mark fixes, or history was squashed on import. | Fall back to churn + recency and say so. If the repo uses ticket keys, match on the bug-ticket prefix instead. |
| Calibration shows ~25% (chance) | The signals do not fit this codebase — common with a young repo or one whose history was imported. | Stop ranking; use requirement-risk assessment instead until there is real history. |
| Coverage data unavailable | No coverage artifact in CI. | Produce the ranking without the overlay, and flag that the risk × coverage split is missing — do not silently drop the axis. |
| Ranking never gets used | It was delivered as a report rather than as ordered named work. | Convert the top-left cell into specs and tickets with owners. |

## See Also

- [`mutation-testing`](../mutation-testing/SKILL.md) — how to spend the effort once this decides *where*; mutation-test the top-ranked module first.
- [`api-testing`](../api-testing/SKILL.md) — the negative matrix is usually the concrete work item for a high-risk endpoint.
- [`test-case-generation`](../test-case-generation/SKILL.md) — turns a ranked file into actual cases.
- [`flakiness-triage`](../flakiness-triage/SKILL.md) — a file whose *tests* are unstable is a different problem; do not confuse test risk with product risk.
- [`qe-pattern-memory`](../qe-pattern-memory/SKILL.md) — supplies signal 7, and stores the calibration record so the next release inherits the evidence.
- [`owasp-security-testing`](../owasp-security-testing/SKILL.md) — security risk is threat-modelled, not history-ranked; run it alongside, not instead.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Coverage Plan requires every status code enumerated regardless of risk rank.
