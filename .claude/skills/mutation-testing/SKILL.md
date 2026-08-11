---
name: mutation-testing
version: 1.0.0
description: Prove a test suite actually catches defects by mutating the code under test and measuring what survives — plus the black-box substitute (deliberate fault injection) for repos that do not own the source. Use when coverage is high but confidence is low, when reviewing whether generated or AI-authored tests assert anything real, when a suite has never caught a regression, or before trusting a coverage number in a quality gate. Trigger phrases — "are these tests any good", "mutation score", "the tests pass but prove nothing", "prove the test fails on a bug", "false green", "weak assertions", "Stryker". Do NOT use for measuring line or branch coverage (that is a runner flag, see the `test-standards` skill). Do NOT use for diagnosing a failing test (use the `debugging` skill). Do NOT use for deciding which files to test first (use the `defect-prediction` skill).
metadata:
  category: domain
---

# Mutation Testing

Coverage says a line ran. Mutation testing says a line **mattered**. It breaks the code on purpose and asks whether the suite noticed — the only mechanical answer to "do these tests assert anything, or do they just execute code and pass?" This is the proof layer under the constitution's false-green rule and the P2 competency pillar.

The failure mode this prevents: a 90%-coverage suite that would stay green through a real defect, and a quality gate that trusts it.

This skill has no paired rule (rule disposition: skill-only).

## Critical

- **ALWAYS check whether the source under test is in this repo before proposing mutation testing.** Mutation requires mutating real source. A black-box automation repo that drives someone else's app over HTTP or a browser **cannot** be mutation-tested — use § Fault injection instead. Proposing Stryker for a black-box repo is a scoping error that wastes a day.
- **NEVER run mutation testing across a whole repo as a first move.** It is O(mutants × suite runtime). Scope to the changed files, or to one module. An unscoped first run on a mid-sized repo takes hours and gets abandoned, which is worse than not starting.
- **ALWAYS treat a surviving mutant as a finding about the test, not a bug in the tool.** A survivor means the suite tolerated a behaviour change. Either the assertion is weak, or the mutated behaviour genuinely does not matter — decide which, in writing.
- **NEVER raise a mutation-score threshold by weakening the mutant set.** Excluding operators or files to make the number go up is the same act as loosening a schema to make a test pass, and the constitution forbids it. Narrow the *scope* honestly; never narrow the *rigour*.
- **NEVER add an assertion whose only purpose is to kill a mutant.** The fix for a survivor is an assertion on the behaviour a user depends on. Asserting on an internal intermediate value to score points produces a brittle test and a dishonest number.
- **ALWAYS report equivalent mutants explicitly rather than silently.** Some mutants are semantically identical to the original and cannot be killed by any test. Mark them, subtract them from the denominator, and say you did. An unexplained ceiling below 100% erodes trust in the whole exercise.
- **NEVER put a mutation score in a CI gate before it has a baseline over at least three runs.** Mutation scores move with test-selection and timeouts. Gate on *regression against baseline*, not an absolute number pulled from a blog post.

## What's in each file

| File | Purpose | Load when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Decision on which technique applies, workflow, operator meaning, survivor triage, gating policy. | **Always** — on any test-effectiveness question. |
| **[`reference.md`](reference.md)** | Operator catalog, Stryker config shape, tuning knobs, score-band interpretation. | When configuring a run or interpreting a specific operator. |

**Boundary rule:** rules and triage decisions here; config shapes and the operator catalog in `reference.md`.

## Which technique applies

Answer this before anything else:

| Situation | Technique | Why |
|-----------|-----------|-----|
| Source and tests in the same repo (product repo, the SDD demo repos, framework helpers/schemas) | **Mutation testing** (Stryker) | Real mutants, automated, scored. |
| Automation repo drives an external app (black-box: API over HTTP, UI over browser) | **Fault injection** (§ below) | Nothing local to mutate. Break the *test's* own oracle instead. |
| Testing our own Zod schemas, helpers, body builders, fixtures | **Mutation testing** | This *is* our source. High value, small surface, fast. |
| Testing a third-party service's behaviour | Neither — this is contract testing | See the `api-testing` skill. |

## Workflow — mutation testing (source in repo)

1. **Pick the smallest meaningful scope.** The files changed in the current branch, or one module with real logic. Skip generated code, config, and pure type files — mutants there are noise.
2. **Establish a green baseline.** The suite must be fully green and stable first. Mutation testing on a suite with a pre-existing failure produces meaningless output.
3. **Time one suite run.** Total cost ≈ mutants × run time. If a single run is 18 seconds and the scope yields 400 mutants, expect roughly two hours without parallelism. Decide now, not after.
4. **Run scoped, with a per-mutant timeout.** Configure the runner to match the project (vitest or jest), point it at the scoped files, and cap per-mutant time so an infinite-loop mutant does not hang the run. Config shape in `reference.md`.
5. **Read the survivors, not the score.** The number is a summary; the survivors are the work. Sort them by whether a user would notice the mutated behaviour.
6. **Triage each survivor** per § Survivor triage.
7. **Re-run only the affected files** after strengthening assertions. Do not re-run the whole scope to confirm one fix.
8. **Record the baseline** and, when a durable weakness pattern emerges, store it via `qe-pattern-memory`.

## Workflow — fault injection (black-box repo)

The substitute when there is no local source. It answers the same question — *would this test notice?* — one test at a time, by hand.

1. **Pick the test whose value you doubt.** Usually one that has never failed, or one an agent generated.
2. **Break the oracle deliberately, one way at a time.** Invert the expected status code. Change an expected field value to something wrong. Tighten a Zod schema to require a field the API does not send. Point the request at a resource the user should not be able to see.
3. **Run it. It MUST fail.** A test that stays green with a deliberately wrong expectation asserts nothing — that is the finding.
4. **Revert the break immediately.** Never commit an injected fault. If a break has to survive a commit boundary, the workflow is wrong.
5. **Record the result** in the PR or, if it reveals a durable weakness class, as a pattern.

The special case worth automating: a test whose only assertion is `expect(response.status()).toBe(200)`. Point it at a deliberately invalid payload — if it still passes, the test proves the endpoint is reachable and nothing more.

## Survivor triage

Four outcomes, and every survivor gets exactly one:

| Verdict | Meaning | Action |
|---------|---------|--------|
| **Weak assertion** | The behaviour matters and no test checks it. | Strengthen the assertion on the observable behaviour. The common case. |
| **Coverage gap** | No test exercises that path at all. | Add the missing case. Cross-check against the spec's coverage matrix. |
| **Equivalent mutant** | Semantically identical to the original; unkillable. | Mark it, subtract from the denominator, say so in the report. |
| **Behaviour genuinely irrelevant** | Mutating it changes nothing a consumer can observe (log text, a defensive branch that cannot be reached). | Document *why*, exclude that mutant with a reason comment. Never a blanket exclusion. |

The rule that keeps this honest: **"behaviour genuinely irrelevant" requires a written reason.** Without one it is indistinguishable from giving up.

## Score bands and gating

Treat the score as a diagnostic, not a target:

| Band | Reading |
|------|---------|
| < 40% | The suite executes code without checking it. High coverage here is actively misleading. |
| 40–60% | Typical for a suite grown from happy-path tests. The survivors are the backlog. |
| 60–80% | Healthy for business logic. Chase specific survivors, not the number. |
| > 80% | Strong. Further gains usually cost more than they return, except on critical paths. |

Gating policy: gate on **no regression against the recorded baseline** for the scoped files, not on an absolute threshold. Absolute thresholds get gamed; regression gates catch the thing you actually care about — a change that made the suite blinder than it was.

## Anti-patterns

- ❌ Proposing Stryker for the black-box automation repo. There is no local source to mutate; the run produces nothing.
- ❌ Running unscoped on the whole repo "to get a number". Hours of compute, an abandoned run, no findings.
- ❌ Quoting the mutation score without listing a single survivor. The score is the least useful output.
- ❌ Excluding an operator or a directory to lift the score, with no reason recorded. Score manipulation.
- ❌ Killing a mutant by asserting on a private/internal value the test has no business knowing.
- ❌ Committing an injected fault, even briefly, even behind a comment.
- ❌ Running mutation testing on a suite that is not green. Every mutant will read as killed, and the number will look excellent.
- ❌ Setting an absolute score gate on the first run, with no baseline.

## Self-review checklist

- [ ] Confirmed the source under test is in this repo; otherwise used fault injection instead.
- [ ] Suite was fully green and stable before the run.
- [ ] Scope was limited to changed files or one module, and the time cost was estimated first.
- [ ] Per-mutant timeout configured.
- [ ] Every survivor has one of the four verdicts, in writing.
- [ ] Every "behaviour genuinely irrelevant" verdict has a written reason.
- [ ] Equivalent mutants are marked and excluded from the denominator explicitly.
- [ ] No operator or path was excluded to raise the score.
- [ ] No assertion was added purely to kill a mutant.
- [ ] Any injected fault was reverted; nothing was committed.
- [ ] Baseline recorded; any gate is a regression gate, not an absolute threshold.
- [ ] Durable weakness classes stored via `qe-pattern-memory`.

## Examples

### Example 1 — High coverage, blind suite (mutation testing)

A service module reports 94% line coverage. Scoped mutation run over that one file: 118 mutants, 51 killed, **43% score**.

The survivors cluster. Every mutant that changed a boundary comparison survived, because the tests assert only that the call returned without throwing. Verdict for the cluster: **weak assertion** — the tests exercise the boundary logic and check nothing about its result.

Fix: assert on the returned value at each boundary, driven by the acceptance criteria rather than by the mutant list. Re-run the file: **81%**. The remaining survivors are two log-message mutants (documented irrelevant) and one equivalent mutant. Reported as 81% with 3 explained survivors — not as "we hit our target".

### Example 2 — A generated API test that proves nothing (fault injection)

An agent-generated spec asserts only `expect(response.status()).toBe(201)` on a create endpoint. Coverage tooling cannot see the problem; there is no local source to mutate.

Fault injection, one break at a time:
1. Send a payload missing a required field → **the test still passes**, because the API returns `201` regardless. That is the finding, and it is two findings at once: the test asserts nothing about the response body, *and* the API accepts an invalid payload.
2. Revert. Add `expect(CreateResponse.parse(body)).toBeTruthy()` per the constitution's response-validation rule.
3. Re-run the original break → the schema now rejects it and the test fails as it should.
4. File the API defect separately; do not fix the product bug inside the test.

The durable learning — "status-only assertions on this service pass through invalid payloads" — goes into the pattern store, because it will recur across specs.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Run never finishes | Unscoped run, or a mutant caused an infinite loop with no per-mutant timeout. | Scope to changed files; set the timeout. Estimate mutants × run time before starting. |
| Score is 100% on the first run | The suite was red, or the scope contained no logic (types, config, barrels). | Verify green first; re-scope to files with real branching. |
| Every mutant survives in one file | No test imports that file, or the tests mock the module they are supposed to test. | Coverage gap — check the spec's coverage matrix. Mocking the unit under test is its own defect. |
| Score dropped after a refactor that added tests | New code added mutants faster than the new tests killed them. | Expected. Compare per-file, not repo-wide. This is why gating is on regression per scoped file. |
| Mutation testing proposed but the repo only has specs | Black-box repo — no source to mutate. | Switch to fault injection. Do not install Stryker. |
| Survivors are all in error-handling branches | Negative paths are under-tested. | This is the negative-matrix gap; see the `api-testing` skill. |

## See Also

- [`test-standards`](../test-standards/SKILL.md) — assertion rules; mutation testing is how you verify those assertions actually bite.
- [`api-testing`](../api-testing/SKILL.md) — the negative matrix and `Schema.parse(body)` rule; most fault-injection findings resolve into a missing negative case.
- [`type-safety`](../type-safety/SKILL.md) — `z.strictObject` is what makes schema-based fault injection work; a loose schema cannot detect a wrong response.
- [`defect-prediction`](../defect-prediction/SKILL.md) — use it to choose *which* module to mutation-test first; risk ranking beats alphabetical.
- [`qe-pattern-memory`](../qe-pattern-memory/SKILL.md) — store recurring weak-assertion classes so the next session recognises them without re-running.
- [`debugging`](../debugging/SKILL.md) — for a test that fails unexpectedly during a run.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § No redundant assertions after Zod parse, and the WON'T rule against loosening schemas, both constrain how survivors may be fixed.
