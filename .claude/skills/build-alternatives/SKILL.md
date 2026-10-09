---
name: build-alternatives
version: 1.0.0
description: >-
  Turn "which way should I do this?" into finished work — when the task is clear but there are several
  ways to do it, build every way on its own local alt/<topic>/<option> branch, present them side by
  side, and ask only which to keep, then delete the rest. Use whenever you are about to ask the human
  to choose between implementations, PR splits, approaches or designs, and on every unattended run,
  where a question means the human returns to nothing. Reach for it the moment a draft reply contains
  "should I", "do you want me to", "A or B?" or "which approach". Trigger phrases — "build both",
  "build the alternatives", "don't ask, do it", "one PR or two", "which approach", "show me the
  options built". Do NOT use when what to build is unclear (ask, marked [human-only: requirement]). Do
  NOT use for outward actions — push, PR, comment, merge, delete (ask, marked [human-only: outward]).
  Do NOT use for splitting finished work into PRs once chosen (use the GOVERNANCE.md § One logical
  change per PR rule).
metadata:
  category: cross-cutting
---

# Build Alternatives

Owns the constitution's **Alternatives, not questions** rule. An agent that stops to ask "one PR or two?" or "helper or inline?" turns a session into a round trip, and an unattended run into a list of questions with no work behind them. When the task is clear and only the *way* is open, the cheaper move is to build each way and let the person compare real results — they choose faster between two branches than between two descriptions. This skill says when that applies, how to keep the alternatives apart, how to present them, and how to clean up. The hook at `.claude/hooks/alternatives-gate.mjs` enforces it; this skill is what the hook's message points to.

## Critical

- **ALWAYS build every alternative before asking which to keep.** Each one complete enough to judge: it compiles, its tests run, its diff reads on its own. A stub of option B next to a finished option A is a recommendation in disguise.
- **ALWAYS put each alternative on its own local branch named `alt/<topic>/<option>`**, branched from the same base, and name those branches in the question. The gate checks the branches exist; a question naming branches that were never created is denied.
- **NEVER push an `alt/` branch, open a PR from one, or post about it.** Alternatives are local until one is chosen. Anything that leaves the machine is an outward action and is asked, not built.
- **ALWAYS ask a question the gate can read when building cannot answer it**, marked with why: `[human-only: outward]` for an action that leaves the machine or cannot be undone, `[human-only: fact]` for something only a person knows, `[human-only: requirement]` when what to build is unclear. An unmarked choice question is the thing the rule exists to stop.
- **ALWAYS delete the alternatives that were not chosen** — branch and worktree — in the same turn as the choice, then carry on from the kept branch. A repository full of stale `alt/` branches is the next session's confusion.
- **NEVER build alternatives for an unclear requirement.** "Which endpoint?" is not answered by building against every endpoint; it is answered by asking. The rule is for a clear *what* with an open *how*.
- **ALWAYS apply the rule on unattended runs too.** That is where it matters most: the human returns to built options instead of a question they could have answered in one word.

## Decision — build or ask?

| The open point is… | Do | Marker |
|---|---|---|
| How to implement a clear task (helper or inline, approach A or B, one PR or two) | **Build every way** | none — the question names the `alt/` branches |
| Whether to start local, reversible work ("shall I go ahead?") | **Just do it** | none — there is nothing to ask |
| An action that leaves the machine or can't be undone (push, open a PR, comment, merge, delete) | Ask | `[human-only: outward]` |
| A fact only a person has (ticket key, a reviewer's opinion, which account) | Ask | `[human-only: fact]` |
| What to build (which endpoint, what the requirement means) | Ask | `[human-only: requirement]` |

**Three or more ways** — build them all; the rule has no cap. When building them all would be genuinely large (several full features), build each to the point where the difference is visible — the part that differs, tested — and say in the presentation how far each one goes.

## Workflow — build, present, keep one

```
- [ ] 1. Name the topic and the options (alt/<topic>/<option>, lowercase, hyphens)
- [ ] 2. Build each option from the same base — a worktree each, or one branch at a time
- [ ] 3. Verify each one like finished work: validator, tests, lint
- [ ] 4. Present them: what each does, how they differ, which you'd keep and why
- [ ] 5. Ask only which to keep, naming the branches
- [ ] 6. On the answer: delete the other branches and worktrees, continue on the kept one
```

### Step 2 — keeping them apart

One worktree per option keeps the builds independent and lets them run in parallel:

`git worktree add ../<repo>-<option> -b alt/<topic>/<option> <base>`

Subagents can build options at the same time, each in its own worktree. Without worktrees, build one branch, commit, switch back to the base, build the next. Never stack option B on top of option A — each starts from the same base, or the comparison is unfair.

### Step 4 — the presentation

Lead with the options, not the process: for each, the branch, one line on what it does, and what it costs (size of the diff, what it changes for reviewers). Then the difference that decides it, and your recommendation with the reason. The person should be able to choose from that message alone. The question that follows names every branch:

> Built both — `alt/pr-split/one-pr` (everything in one PR, 14 files) and `alt/pr-split/two-prs` (the lint rule, then the docs, 9 + 5 files). I'd keep two PRs: the lint change can merge while the docs are discussed. Which do you keep?

### Step 6 — cleanup

`git worktree remove ../<repo>-<option>` for each worktree, then `git branch -D alt/<topic>/<option>` for every option not kept. Rename the kept branch to its real name before pushing (`git branch -m alt/<topic>/<option> <real-name>`). If the person keeps more than one, each kept branch continues on its own.

## Anti-patterns

- ❌ **Asking "should I do A or B?" with nothing built.** The question costs the person a round trip and leaves an unattended run empty-handed. Build both and ask which to keep.
- ❌ **Building a polished A and a sketch of B.** That is choosing for the person while appearing not to. Bring every option to the same standard, or say plainly how far each one goes.
- ❌ **Stacking B on A.** A second option built on top of the first can't be judged on its own, and deleting A breaks B. Branch every option from the same base.
- ❌ **Pushing alternatives "so they can be reviewed".** Open PRs for options that will be deleted spend a reviewer's attention on throwaway work. Alternatives are local; only the chosen one leaves the machine.
- ❌ **Building against every guess of an unclear requirement.** Three implementations of three readings of "the report endpoint" waste three builds. Ask, marked `[human-only: requirement]`.
- ❌ **Marking a choice `[human-only: …]` to get past the gate.** The marker states a reason; a marker on "helper or inline?" is a false statement in the record. Build the options.
- ❌ **Leaving the rejected branches behind.** The next session finds `alt/` branches and can't tell which was chosen. Clean up in the turn the choice is made.

## Self-review checklist

- [ ] Every option I was going to ask about exists as `alt/<topic>/<option>`, branched from the same base.
- [ ] Each option passes the same checks finished work would (validator, tests, lint).
- [ ] Nothing `alt/` was pushed, opened as a PR or posted.
- [ ] The presentation names each branch, what it does and what it costs, plus my recommendation and why.
- [ ] Every question I'm asking either names two or more built branches or carries `[human-only: outward|fact|requirement]` with a true reason.
- [ ] No "shall I go ahead?" about local, reversible work — I did it.
- [ ] After the choice: the other branches and worktrees are deleted, and the kept one has its real name before it is pushed.

## Examples

### Example 1 — one PR or two

User says: *"Fix the env-var rule and update the lint rule that enforces it."* The work could ship as one PR or as two.

1. **Name** — topic `env-rule`, options `one-pr` and `two-prs`.
2. **Build** — `alt/env-rule/one-pr` holds everything; `alt/env-rule/two-prs-lint` and `alt/env-rule/two-prs-docs` hold the split.
3. **Verify** — the validator and every suite pass on each branch.
4. **Present** — "One PR: 12 files, one review. Two PRs: the lint rule (5 files) can merge while the docs (7) are discussed. I'd keep two." Then: "Which do you keep?", naming the three branches.
5. **Keep** — the answer is "two"; delete `alt/env-rule/one-pr`, rename the other two, push.

### Example 2 — an unattended run

The lead starts a run at night: *"Refactor the orders helpers to the assertion style."* Two shapes are possible — one helper per call, or one generic helper with a typed map.

1. **Build** both, each on its own branch with tests passing. Nobody is there to ask, which is exactly when the rule applies.
2. **Present** in the final message: both branches, the diff size of each, the trade-off, a recommendation.
3. **Outward step** — opening a PR is not done; it is listed as the next step, marked `[human-only: outward]`.
4. In the morning the lead reads one message and picks one. No round trip.

### Example 3 — when asking is right

User says: *"Add tests for the export endpoint."* The repository has `/exports` and `/reports/export`.

1. **Decide** — this is an unclear requirement, not an open implementation: building tests for both endpoints guesses at what was meant.
2. **Ask** — "Which endpoint — `/exports` or `/reports/export`? [human-only: requirement]". The gate lets it through because the reason is stated.
3. Once answered, any open *how* (helper or inline) is built, not asked.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The question tool is denied with "offers choices that were not built" | An unmarked choice question with no `alt/` branches in its options | Build the options and name the branches in the question, or mark it with the real reason it can't be built |
| Denied with "names alt/x/y, which does not exist locally" | A typo in the branch name, or the branch was never created, or it was created in a different clone | `git branch --list "alt/*"` and correct the name; the gate asks git in the session's working directory |
| The final reply is bounced once with "nothing was built for it" | The Stop hook found a choice question ("shall I", "do you want", "which option") with no marker and no built branches | Build the alternatives, or mark the question. A question that is not a choice ("did that answer it?") is not caught |
| The gate does nothing at all | Claude Code started before `.claude/settings.json` existed, or the version predates exec-form hooks (`args`) | Open `/hooks` once or restart the session; update Claude Code |
| A legitimate question keeps getting bounced | It is phrased as a choice but is really outward, a fact or a requirement | Add the marker that states why — that is the intended path, not a workaround |

## See Also

- **Constitution:** [`../../CLAUDE.md`](../../CLAUDE.md) — § MUST "Alternatives, not questions" and § SHOULD "Ask before guessing", which this skill reconciles.
- **The gate:** [`../../hooks/alternatives-gate.mjs`](../../hooks/alternatives-gate.mjs), wired in [`../../settings.json`](../../settings.json), proven by `npm run test:alternatives`.
- [`ai-native-workflow`](../ai-native-workflow/SKILL.md) — how to work with the agent in this repo; this skill is its rule for open choices.
- [`pr-review`](../pr-review/SKILL.md) — the pre-push review the kept alternative goes through before it leaves the machine.
- **GOVERNANCE.md § One logical change per PR** — once an option is kept, how it is split into PRs.
