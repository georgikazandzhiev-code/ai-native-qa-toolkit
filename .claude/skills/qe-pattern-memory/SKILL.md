---
name: qe-pattern-memory
description: Persist and reuse what the agent learns about a codebase across sessions — a git-tracked, human-reviewed pattern store with confidence scoring, tier promotion, and falsification. Use when a session discovers a reusable fact (a recurring flake cause, a locator that survives re-renders, an endpoint quirk, a cleanup ordering rule), when starting work on a repo the team has touched before, or when the same discovery is being re-derived a second time. Trigger phrases — "remember this pattern", "we already learned this", "load what we know about this repo", "why did we do it this way last time", "promote this pattern", "this pattern is wrong". Do NOT use for repo-specific static catalogs that never change (keep those in the repository's own repo-context skill). Do NOT use for one-off session notes with no reuse value (leave them in the PR description). Do NOT use for framework conventions that belong in a rule (use the `skill-creator` skill to author a skill instead).
metadata:
  category: cross-cutting
---

# QE Pattern Memory

Cross-session memory for quality engineering. Every session an agent discovers things — that a given API returns `201` with an empty body, that a Radix dropdown needs anchor-and-drill, that deleting a synthetic before its probe throws `409`. Without a store, the next session re-derives all of it, badly. This skill defines **where** those learnings live, **how** they earn confidence, and **who** approves promotion — so the store becomes an asset instead of a pile of stale guesses.

The failure mode this prevents: an agent that "remembers" something wrong and confidently applies it for six months.

This skill has no paired rule (rule disposition: skill-only).

> **Why files and not a database.** A SQLite + embeddings store (the approach `agentic-qe` takes) buys similarity search we do not need at this scale, and costs native build dependencies that silently degrade on Windows. Markdown in git gives us three things a DB cannot: the diff **is** the audit trail, promotion **is** a PR review, and `grep` **is** the query engine.

## Critical

- **NEVER write a pattern without an evidence label.** Every pattern carries `evidence: EXECUTED | STATIC | INFERRED | CONJECTURE`. `EXECUTED` means a command was run and its output is attached. `INFERRED` and `CONJECTURE` may be stored but **must never gate a decision** — they are leads, not facts. An unlabelled pattern is indistinguishable from a hallucination.
- **NEVER promote a pattern to `canonical` inside an agent session.** `candidate → active` may be automatic on evidence. `active → canonical` requires a human in a PR review. Canonical patterns steer future generation; unreviewed self-promotion is how a wrong belief becomes framework law.
- **ALWAYS record failures, not just successes.** When a stored pattern is applied and does **not** hold, increment `failures` and append to `## Falsifications` in the same edit. A store that only counts wins converges on false confidence — the exact false-green problem the constitution forbids.
- **NEVER delete a falsified pattern silently.** Set `tier: retired` with a `retired_reason`. The next agent needs to know the idea was tried and failed, or it will re-derive it.
- **ALWAYS check the store before exploring.** On any task touching a repo with a `.qe-memory/`, read `INDEX.md` first. Re-deriving a `canonical` pattern is wasted tokens; contradicting one without falsifying it is a defect.
- **NEVER store secrets, tokens, PII, customer names, or production data in a pattern.** The store is git-tracked and travels with the repo. Store the *shape* of a thing, never an instance of it.
- **ALWAYS keep one pattern per file and one line per pattern in `INDEX.md`.** `INDEX.md` is what gets loaded into context every session — it must stay skimmable. Pattern bodies are loaded on demand.
- **NEVER let `INDEX.md` exceed 60 lines.** Past that, the store has stopped being memory and become noise. Retire or merge before adding.

## What's in each file

| File | Purpose | Load when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, lifecycle, scoring, promotion and retirement workflow. | **Always** — on any read or write to the store. |
| **[`templates.md`](templates.md)** | Copy-paste skeletons: pattern file frontmatter, `INDEX.md` line format, falsification entry, retirement entry. | When creating a pattern, the index, or a falsification record. |

**Boundary rule:** decisions and lifecycle rules live here; copy-paste shapes live in `templates.md`. No pattern *content* lives in either — content lives in the target repo's `.qe-memory/`.

## Where the store lives

The store is **per repository**, committed alongside the code it describes:

| Path | Contains |
|------|----------|
| `.qe-memory/INDEX.md` | One line per non-retired pattern. The always-loaded map. |
| `.qe-memory/patterns/<slug>.md` | One pattern. Frontmatter + body + falsifications. |
| `.qe-memory/retired/<slug>.md` | Retired patterns, kept for the record. |

Not in a global location, and not in `~/.claude/`. A pattern about an endpoint's `409` behaviour is meaningless outside the repo that has that endpoint — and it must travel in the same PR as the code that proves it.

## Pattern lifecycle

```
observe ──► candidate ──► active ──► canonical
              │             │            │
              │             └── falsified ──► retired
              └── never reproduced ──────────► discarded (no file)
```

| Tier | Meaning | Enters by | May it gate a decision? |
|------|---------|-----------|-------------------------|
| `candidate` | Observed once. Unproven. | Any session, automatically. | No. Suggest only. |
| `active` | Reproduced ≥ 2 times, `success_rate` ≥ 0.8, evidence `EXECUTED` or `STATIC`. | Automatic when the counters cross. | Yes, with the pattern cited. |
| `canonical` | Reviewed by a human and accepted as a rule for this repo. | **PR review only.** | Yes. Contradicting it requires falsification. |
| `retired` | Falsified, obsolete, or superseded. | Falsification, or the code it described is gone. | Never. Read-only history. |

## Scoring

Three integers and one derived value. No model, no embedding, nothing that cannot be recomputed by hand:

| Field | Meaning |
|-------|---------|
| `uses` | Times the pattern was applied. |
| `successes` | Times it was applied and held. |
| `failures` | Times it was applied and did not hold. `uses = successes + failures`. |
| `success_rate` | `successes / uses`, recorded to 2 decimals. Recompute on every edit; never hand-wave it. |

Promotion thresholds are deliberately boring: **`active` needs `uses ≥ 2` and `success_rate ≥ 0.80`.** Demotion is immediate — a single failure on a `canonical` pattern drops it to `active` and opens a falsification entry. Confidence is earned slowly and lost fast, because the cost of a wrong canonical pattern is much higher than the cost of re-proving a right one.

## Workflow — reading (start of a session)

1. **Check for a store.** `ls .qe-memory/` in the repo root. No store → nothing to load; consider creating one when the session ends with a real learning.
2. **Read `INDEX.md` only.** Do not read every pattern file. The index carries slug, tier, one-line claim.
3. **Open the pattern bodies that touch your task.** Matching on domain (`api`, `ui`, `flake`, `data`, `perf`, `security`) and on the files you are about to change.
4. **Treat `canonical` as a constraint, `active` as a strong default, `candidate` as a hint.** If your task requires contradicting a `canonical` pattern, stop and follow § Workflow — falsifying.

## Workflow — writing (end of a session)

Write a pattern only when all three hold. If any fails, the learning belongs in the PR description, not the store:

1. **Reusable** — a future session on this repo would benefit.
2. **Non-obvious** — not already stated in a skill, the constitution, `CLAUDE.md`, or the code itself. The store is not a place to restate framework rules.
3. **Falsifiable** — written so a future session can test whether it still holds.

Then:

1. **Search first.** `grep -ri "<keyword>" .qe-memory/` — including `retired/`. An existing pattern gets its counters incremented, not a duplicate sibling. A retired pattern being rediscovered is itself a finding worth noting.
2. **Create the file** from `templates.md` at `.qe-memory/patterns/<slug>.md`, slug in kebab-case, named for the claim not the symptom (`probe-delete-before-synthetic-409`, not `weird-409-bug`).
3. **Label the evidence** and attach the artifact — the command and its output for `EXECUTED`, the data source for `STATIC`.
4. **Set `tier: candidate`**, `uses: 1`, and `successes`/`failures` to reflect what actually happened.
5. **Add one line to `INDEX.md`.**
6. **Commit it with the code change that proved it.** A pattern landing in a separate commit loses the link to its evidence.

## Workflow — falsifying

When a stored pattern is applied and does not hold, this is the highest-value path in the skill. Do it in one edit:

1. **Append to `## Falsifications`** in the pattern file: date, what was expected, what happened, the command or artifact showing it.
2. **Increment `failures`**, recompute `success_rate`.
3. **Demote.** `canonical → active` on the first failure. `active → candidate` if `success_rate` drops below 0.80. `candidate` with `success_rate` at 0 → retire.
4. **Retire** by moving the file to `.qe-memory/retired/` with `tier: retired` and a `retired_reason`, and removing the `INDEX.md` line.
5. **Report the falsification to the human** in the session summary. A `canonical` pattern being wrong is a finding about the framework, not routine bookkeeping.

## Anti-patterns

- ❌ Storing a framework convention ("import `test` from the fixtures barrel"). That belongs in the constitution or a skill; duplicating it in the store creates two sources of truth that drift.
- ❌ Storing a bug ("endpoint returns 500 on empty body"). A bug goes in Jira. Store the *pattern* if it teaches something durable about the system; otherwise file the ticket and move on.
- ❌ Writing `tier: canonical` in the session that discovered the pattern. Promotion is a human act, in a PR.
- ❌ Storing a pattern with `evidence: INFERRED` and then using it to gate a decision. Inferred is a lead; execute the check and upgrade the label, or do not rely on it.
- ❌ An `INDEX.md` line that restates the slug (`probe-delete-order — about probe delete order`). The line must carry the *claim*, so the index is usable without opening files.
- ❌ Letting `uses` grow without ever touching `failures`. A store where nothing ever fails is not being maintained; it is being flattered.
- ❌ Deleting a wrong pattern with `rm`. Retire it — the next agent must not re-derive a dead end.
- ❌ One giant `patterns.md`. Per-file granularity is what makes PR review of a single pattern possible.

## Self-review checklist

- [ ] Read `.qe-memory/INDEX.md` before exploring, if a store exists.
- [ ] Every pattern written this session has an `evidence` label, and `EXECUTED` ones have the command + output attached.
- [ ] No secrets, tokens, PII, customer names, or production data in any pattern body.
- [ ] `uses`, `successes`, `failures` are consistent (`uses = successes + failures`) and `success_rate` is recomputed.
- [ ] No pattern was promoted to `canonical` in this session.
- [ ] Every applied pattern that did not hold has a `## Falsifications` entry and a decremented tier.
- [ ] `INDEX.md` has exactly one line per non-retired pattern and is ≤ 60 lines.
- [ ] Grepped `.qe-memory/` (including `retired/`) before creating a new pattern.
- [ ] Pattern files committed in the same commit as the code change that proved them.

## Examples

### Example 1 — A flake cause becomes an active pattern

**Session 1.** A UI spec fails ~30% of CI runs. Triage (via `flakiness-triage`) finds the cause: a Radix dropdown re-renders after its data XHR, so a click on a directly-addressed item hits a stale node. Fix: anchor on the container, then drill.

Stored as `.qe-memory/patterns/radix-dropdown-anchor-and-drill.md`, `evidence: EXECUTED` (5× isolated runs before and after, output attached), `tier: candidate`, `uses: 1`, `successes: 1`.

**Session 2 (three weeks later).** A different spec, same symptom. The agent reads `INDEX.md`, finds the line, applies anchor-and-drill directly — no re-diagnosis. Increments to `uses: 2`, `successes: 2`, `success_rate: 1.00` → crosses the threshold → `tier: active`.

**PR review.** The reviewer sees the promotion diff, agrees it is a repo-wide rule, and sets `tier: canonical` in the review. Future sessions now treat direct addressing of Radix items as a defect.

### Example 2 — A canonical pattern is falsified

A `canonical` pattern says a given list endpoint always returns a `meta.total` field, and specs rely on it. A new session gets a `ZodError`: on an empty result set the field is absent.

The agent does **not** loosen the schema. It:
1. Appends a falsification: date, expected `meta.total` present, observed absent on empty set, with the failing request and response.
2. Sets `failures: 1`, recomputes `success_rate`, demotes `canonical → active`.
3. Reports it in the session summary as a contract finding, and files the ticket — because the API contradicting its own contract is a bug, not a test problem.

The pattern survives in a narrower form once the backend is fixed or the contract is corrected. The store now records that the naive belief was tried and found wrong.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `INDEX.md` is 200 lines and nobody reads it | Patterns are being added but never retired or merged. | Retire everything with `success_rate < 0.8` and no use in 90 days; merge near-duplicates. Enforce the 60-line cap. |
| Two patterns give contradictory advice | Both were written as `candidate` from single observations and never reconciled. | Run both claims against current code, falsify the loser, retire it. Contradiction is a signal the store was not grepped before writing. |
| Agents ignore the store | `INDEX.md` lines restate slugs instead of carrying claims, so the index looks useless. | Rewrite each line as a testable claim. The index earns its read or it will not get one. |
| A pattern is right but keeps getting falsified | The claim is scoped too broadly (stated for all endpoints, true only for one service). | Narrow the claim, do not widen the tolerance. Split into per-service patterns. |
| Store is full of restated framework rules | The 3-condition write gate (reusable / non-obvious / falsifiable) is not being applied. | Retire the restatements. If a rule deserves to be global, author a skill via `skill-creator` instead. |
| Merge conflicts in `INDEX.md` on every branch | Everyone appends at the bottom. | Keep the index sorted by domain then slug so edits land in different places. |

## See Also

- [`flakiness-triage`](../flakiness-triage/SKILL.md) — the biggest producer of durable patterns; confirmed flake causes belong in the store.
- [`defect-prediction`](../defect-prediction/SKILL.md) — consumes stored patterns as a risk signal; a file with several falsified patterns is a risky file.
- [`mutation-testing`](../mutation-testing/SKILL.md) — surviving mutants often reveal a durable weak-assertion pattern worth storing.
- [`skill-creator`](../skill-creator/SKILL.md) — when a `canonical` pattern turns out to be a general rule, graduate it into a skill.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Search Before Creating applies to the pattern store exactly as it applies to helpers.
