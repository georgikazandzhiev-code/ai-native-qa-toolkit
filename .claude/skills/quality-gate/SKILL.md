---
name: quality-gate
version: 1.0.1
description: Turn measured quality signals into an auditable go/no-go verdict at a commit, PR, release, or hotfix gate — thresholds from config, evidence-classed inputs, and overrides that need a named human, not the agent. Use when deciding whether a change is ready to merge or a build is ready to ship, when wiring a CI gate that passes or fails a pipeline, or when asked "is this release-ready / can we deploy / does this pass the bar". It synthesises what other skills measure (coverage, security, flake rate, risk, suite strength) into one verdict with a per-criterion breakdown. Trigger phrases — "quality gate", "release ready", "can we ship", "go/no-go", "deploy decision", "merge bar", "pass the gate". Do NOT use for the pre-push self-review of one diff against the framework rules (use the `pr-review` skill). Do NOT use for ranking what to test first (use the `defect-prediction` skill). Do NOT use for whether the suite actually catches defects (use the `mutation-testing` skill).
metadata:
  category: cross-cutting
---

# Quality Gate

A quality gate turns **measured** signals into a single **go/no-go verdict** at a defined point — a commit, a pull request, a release, or a hotfix — and records why. Functional tests prove the code works; this skill decides whether *the evidence as a whole* clears the bar the team agreed on, and says so in a form a reviewer and a CI pipeline can both act on.

It is a **synthesiser, not a measurer.** Coverage comes from the test runner, security from `owasp-security-testing`, the flake verdict from `flakiness-triage`, the risk ranking from `defect-prediction`, suite strength from `mutation-testing`. This skill reads those outputs, checks each against a configured threshold, and renders the verdict. It owns the decision, never the measurement.

**Evidence: STATIC.** The gate model, tiers, and thresholds below follow the toolkit's own conventions (config-sourced constants, the EXECUTED/STATIC/INFERRED classes from `qe-pattern-memory`, the CI exit-code contract). They have not been executed as a gate against a repository from this project; record the first real gate run in `memories/learned_patterns.md`.

This skill has no paired rule (rule disposition: skill-only). It composes rules the other skills own; it adds no constitution MUST of its own.

## Critical

Non-negotiable. Each rule is what separates a gate that means something from a rubber stamp.

- **ALWAYS read every threshold from config, never a literal in the verdict logic.** Coverage floor, critical-bug ceiling, flake ceiling, perf budget, coverage-delta rule — each is a named constant (`appConfig.gates.*` or the project's gate config), so one file sets the bar and a reader can see *why* a number is what it is. A hardcoded `80` in the decision is the `No magic numbers` violation and the first thing that drifts. (`config`.)
- **A gate blocks only on EXECUTED or STATIC evidence.** EXECUTED = a check ran and produced the number (the coverage report, the regression run, the security spec result). STATIC = read from a file the build produced (a lockfile, a schema, a quarantine list). An **INFERRED** signal ("this change looks risky", a `defect-prediction` rank) **informs the verdict and the review focus but never blocks on its own** — it is upgraded by running the check. This is the same false-positive discipline `owasp-security-testing` uses. A gate that blocks on a hunch trains the team to override it.
- **NEVER move a threshold to fit the result.** Lowering the coverage floor from 80 to 72 because the branch landed at 72 turns the gate green by deleting the bar. If the bar is wrong, change it in config in its own change, with a reason, before the run — never inside the failing evaluation.
- **NEVER self-approve an override.** A failing gate that ships anyway needs a **named human**, a **reason**, an **expiry**, and an **audit record**. The agent computes and reports the verdict and the cost of overriding; it does not grant the waiver. Overriding is an outward decision a person owns — mark it `[human-only: requirement]` and stop at the recommendation.
- **ALWAYS report the per-criterion breakdown with each input's evidence class.** A bare `PASS`/`FAIL` hides which check was real and which was inferred. The verdict is a table: criterion, threshold, actual, evidence class, pass/fail — so the reader can see the one line that blocked and trust the ones that passed.
- **Report the honest verdict even when it blocks the release.** The gate's whole value is the **no** it can say. A gate that always passes is theatre. If the evidence does not clear the bar, the verdict is FAIL with the blocking criterion named — never massaged to GREEN, never softened to "mostly ready".
- **NEVER invent a signal you did not get.** A missing input (no coverage report, security review not run, flake check skipped) is **not** a pass — it is an `INCONCLUSIVE` criterion that blocks a release gate and is named as missing. Absence of evidence is reported as absence, never as a green tick.

## Gate tiers — the bar rises with the blast radius

Pick the tier by what the change is about to affect. Each tier adds criteria to the one before it.

| Gate | Trigger | Blocks on (all EXECUTED/STATIC) | Typical action on FAIL |
|------|---------|----------------------------------|------------------------|
| **Commit** | pre-commit / push | lint clean; the affected spec(s) green | Block the commit; fix before pushing |
| **PR** | PR open / update | coverage delta not negative; changed specs pass the `flakiness-triage` merge bar (5 consecutive isolated runs plus 1 in-suite run); `pr-review` found no MUST/WON'T violation; review approved | Block the merge; comment the blocking criterion |
| **Release** | release branch / tag | full regression green; 0 unresolved critical bugs; `owasp-security-testing` review clean (EXECUTED findings only); perf within budget; no quarantined test on the shipped path | Block the deploy; the verdict is the release note's blocker |
| **Hotfix** | emergency fix | minimal viable: the fix's own spec green **and** no critical regression in the affected area | Fast-track only under a logged override with expiry + enhanced monitoring |

The hotfix tier is the only one that ships on a reduced bar, and only behind an override (see § The override). The other tiers never trade their criteria for speed.

## The verdict

The output is one object and one table, nothing else.

```
GATE: release  VERDICT: FAIL
┌────────────────────┬───────────┬────────┬──────────┬──────┐
│ Criterion          │ Threshold │ Actual │ Evidence │ Pass │
├────────────────────┼───────────┼────────┼──────────┼──────┤
│ Line coverage      │ ≥ 80%     │ 92.3%  │ EXECUTED │  ✓   │
│ Critical bugs open │ 0         │ 1      │ STATIC   │  ✗   │  ← blocks
│ Security review    │ clean     │ clean  │ EXECUTED │  ✓   │
│ Perf regression    │ < 5%      │ 2.1%   │ EXECUTED │  ✓   │
└────────────────────┴───────────┴────────┴──────────┴──────┘
Blocked by: 1 unresolved critical bug (JOBS-412). Overriding this gate is a human decision.
```

- **JSON** for the machine: `{ gate, verdict, criteria: [{ name, threshold, actual, evidence, passed }], blockedBy }`.
- **CI exit code**: `0` on PASS, `1` on FAIL — so a pipeline step is the gate.
- **Markdown table** for the human, blocking criterion marked.
- Keep the V2-friendly summary fields a pipeline may already read: `passed`, `score`, `blockedBy`.

## Workflow — evaluate a gate

```
- [ ] 1. Pick the tier from the trigger (commit / PR / release / hotfix) — § Gate tiers.
- [ ] 2. Load thresholds from config (appConfig.gates.* / the project's gate config). Never inline a number.
- [ ] 3. Collect each input and its evidence class — coverage (runner), security (owasp), flake (flakiness-triage), critical bugs (tracker/STATIC), perf (budget run). A missing input is INCONCLUSIVE, not a pass.
- [ ] 4. Evaluate each criterion: actual vs threshold. Block only on EXECUTED/STATIC fails; INFERRED signals annotate, never block.
- [ ] 5. Render the verdict table + JSON + exit code. Name the blocking criterion.
- [ ] 6. On FAIL — report it. Do NOT lower a threshold and do NOT self-approve an override; surface the override cost and stop at the recommendation.
- [ ] 7. Record the outcome (gate, verdict, blocker) where the team keeps gate history — a reusable gate lesson goes to `qe-pattern-memory`.
```

## The override — a human decision, logged

A failing gate can still ship, but only on a waiver the agent never grants itself:

- **Named human** — who authorized it, by name/role, not "the team".
- **Reason** — the business call, in one line.
- **Expiry** — the waiver is time-boxed; the criterion must pass by then or the gate blocks again.
- **Audit record** — the override is written where gate history lives, with the verdict it overrode.
- **Compensating control** — what offsets the risk (enhanced monitoring, a follow-up ticket, a canary).

The agent's job is to compute the verdict, state plainly what overriding it costs, and record the waiver once a human gives it. Granting the waiver is `[human-only: requirement]`.

## Anti-patterns

- ❌ **A bare PASS/FAIL with no breakdown.** Hides which check was real. Always emit the per-criterion table with each input's evidence class.
- ❌ **Blocking on an INFERRED signal.** Failing a gate because `defect-prediction` ranked a file high, with no executed check that confirms a problem, is a false positive that teaches the team to ignore the gate. Inferred signals steer review; they do not block.
- ❌ **Lowering the bar to pass.** Editing the threshold inside the failing run. If the bar is wrong, fix config first, in its own change, with a reason.
- ❌ **The agent approving its own override.** A waiver with no named human is not a waiver. Report the cost; let a person authorize.
- ❌ **Treating a missing input as a pass.** No coverage report is `INCONCLUSIVE`, not ✓. A release gate blocks on it and names it missing.
- ❌ **Re-measuring here.** This skill does not compute coverage or re-run the security scan; it reads their results. Duplicating the measurement drifts from the owning skill.
- ❌ **One gate for every tier.** A commit does not owe a full regression; a release is not cleared by a green unit run. The bar rises with the blast radius.
- ❌ **A verdict with no record.** An ungated history means the next release cannot see that the last one shipped on an override. Write the outcome.

## Self-review checklist

- [ ] Every threshold came from config; no literal number lives in the verdict logic.
- [ ] Each criterion carries its evidence class; the gate blocks only on EXECUTED/STATIC.
- [ ] INFERRED signals (risk ranks, hunches) annotate the verdict, never block it.
- [ ] No threshold was changed to fit the result.
- [ ] A missing input is reported as INCONCLUSIVE, not a pass.
- [ ] The verdict is the per-criterion table + JSON + exit code, with the blocking criterion named.
- [ ] The tier matches the trigger (commit / PR / release / hotfix).
- [ ] Any override is a human waiver with name, reason, expiry, audit record, and compensating control — never self-approved.
- [ ] The outcome is recorded where gate history lives; a reusable lesson went to `qe-pattern-memory`.
- [ ] The skill read other skills' results; it did not re-measure them.

## Examples

### Example 1 — Release gate for a jobs-service candidate

User says: _"Is the jobs-service release ready?"_

1. **Tier** — release. Thresholds from `appConfig.gates.release` (coverage ≥ 80, critical bugs 0, perf regression < 5%).
2. **Collect** — coverage report 92.3% (EXECUTED); open critical bugs from the tracker: 1, `JOBS-412` (STATIC); `owasp-security-testing` review: clean, EXECUTED findings only; perf run 2.1% (EXECUTED).
3. **Evaluate** — coverage ✓, security ✓, perf ✓, critical bugs ✗ (1 > 0).
4. **Verdict** — `FAIL`, blocked by `JOBS-412`. Table emitted, exit code `1`.
5. **Report** — do not lower the ceiling and do not waive. Surface: "shipping needs either `JOBS-412` resolved or a named override with expiry." Record the verdict.

### Example 2 — PR gate where risk is high but evidence is clean

User says: _"Can this PR merge? `defect-prediction` flagged the worker-assignment file as high risk."_

1. **Tier** — PR. The high-risk flag is **INFERRED** — it raises review attention, it does not block.
2. **Collect** — coverage delta `+0.4%` (EXECUTED); changed specs pass the `flakiness-triage` merge bar, 5 + 1 runs, no flake (EXECUTED); `pr-review` found no MUST/WON'T violation; review approved.
3. **Evaluate** — every blocking criterion passes on EXECUTED evidence; the risk flag annotates the verdict ("high-risk area — reviewer focus here").
4. **Verdict** — `PASS`, with the note that the risk rank steered the review, exit code `0`.
5. **Lesson** — if this file keeps landing clean despite a high rank, that calibration note belongs in `qe-pattern-memory` (and feeds `defect-prediction`).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| The gate never fails | Thresholds too loose, or only happy-path inputs collected | Re-derive the bar in config with the team; confirm every tier's criteria are actually evaluated, not assumed green. |
| A number in the verdict logic | Threshold hardcoded instead of config-sourced | Move it to `appConfig.gates.*` / the gate config; the verdict reads the constant (`config`, `No magic numbers`). |
| The agent "passed" an override | Self-approved waiver | Revert. An override needs a named human, reason, expiry, audit record. Report the cost and stop. |
| A high `defect-prediction` rank failed the gate | Blocked on INFERRED evidence | Risk ranks inform, never block. Only EXECUTED/STATIC fails block; upgrade the hunch by running the check. |
| Coverage/security result is missing and the gate passed | Absence treated as a pass | Report the input as `INCONCLUSIVE`. A release gate blocks on a missing required input and names it. |
| Two gates disagree on the same change | Different tiers evaluated | That is expected — a commit gate and a release gate have different bars. State which tier the verdict is for. |

## See Also

- **`pr-review`** — the pre-push self-review of one diff against the framework MUSTs/WON'Ts. The PR gate **consumes** its result as one criterion; this skill does not repeat that check.
- **`defect-prediction`** — the risk ranking. An INFERRED input: it steers review focus and names where to look, it does not block the gate.
- **`mutation-testing`** — suite strength. A gate can require a minimum mutation score at the release tier; read the score here, compute it there.
- **`flakiness-triage`** — the flake verdict and the quarantine list. A quarantined test on the shipped path is a release-gate blocker.
- **`owasp-security-testing`** — security findings, EXECUTED/STATIC only (its own `No Report Without Proof` rule). The release gate reads its verdict.
- **`config`** — where the thresholds live (`appConfig.gates.*`); the gate reads constants, never literals.
- **`qe-pattern-memory`** — where a reusable gate lesson (a calibration, a recurring blocker) is stored across sessions.
- **`bug-helper`** — filing the bug a failed gate surfaced; the gate names the blocker, `bug-helper` triages it.
- **[~/.claude/CLAUDE.md](~/.claude/CLAUDE.md)** — always-on framework invariants; this skill routes from its Routed Skill Index.
