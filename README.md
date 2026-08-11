# AI-Native QA Toolkit

A governance layer for AI-assisted quality engineering: **26 on-demand skills** and a written engineering constitution that define what "done" means *before* an agent writes a line of test code.

Built for [Claude Code](https://claude.com/claude-code); the skills are plain Markdown and port to any agent harness that supports on-demand instruction loading.

---

## The problem this solves

An agent with no rules does not save time. It produces confidently wrong code and tests that pass while proving nothing — and it does so faster than a human can review. Speed without governance ships the defect sooner.

So the interesting question is not *how do we get AI to write tests*. It is **what has to be true before we trust the output.** That is what this repository answers.

## How it works

Three layers, loaded progressively:

| Layer | File | Loaded |
|-------|------|--------|
| **Constitution** | `.claude/CLAUDE.md` | Always. MUST / SHOULD / WON'T tables, a mandatory pre-edit checklist, and the routing index. |
| **Skills** | `.claude/skills/<name>/SKILL.md` | On demand, when the task matches. Deep how-to for one concern each. |
| **Personas** | `.claude/commands/*.md` | Manually, as slash commands. |

The constitution is deliberately short and absolute; skills carry the detail. A skill may extend a constitutional rule and may never contradict one.

## What's actually enforced

Not aspirations — these are the rules the agent is held to, and the reason the output is reviewable:

- **Test-First, non-negotiable.** Test plans and cases are authored and approved before product code. A requirement with no test blocks the pipeline.
- **Every API response validated against a schema.** Exact idiom, no exceptions, and loosening a schema to make a test pass is forbidden rather than discouraged.
- **No conditional test logic.** No `if`/`else`, no ternaries, no `test.skip` to steer around missing data — preconditions get seeded in setup. Skips produce false green and corrupt test-management signal.
- **No silent failure suppression.** No hard waits, no `try`/`catch` around assertions, no raised timeouts to turn a flake green.
- **Strict typing.** No `any`, no `as any`, no `@ts-ignore`, no `console.*`.
- **Evidence labels on findings.** `EXECUTED` / `STATIC` / `INFERRED` / `CONJECTURE`. Quality gates block only on executed or static evidence, so an inferred finding can never quietly become a fact.
- **Verify before reporting done.** Added or modified tests are *run*. Failing tests mean the task is incomplete, and the fix is never to weaken the assertion.

## The skills

**Authoring** — `common-tasks` (routing) · `scaffold-spec` · `skill-creator` · `test-case-generation` · `ai-native-workflow`

**Test design & standards** — `test-standards` · `api-testing` · `selectors` · `page-objects` · `fixtures` · `helpers` · `data-strategy` · `type-safety` · `enums` · `config` · `refactor-values`

**Effectiveness & risk** — `mutation-testing` · `defect-prediction` · `qe-pattern-memory` · `flakiness-triage` · `debugging`

**Specialist** — `owasp-security-testing` · `k6-load-testing` · `playwright-cli` · `frontend-cross-check` · `pr-review`

Four of these are worth calling out, because they are the parts most AI-QA tooling skips:

| Skill | What it does |
|-------|--------------|
| **`mutation-testing`** | Proves the suite catches defects rather than merely executing code. Mutation scoring where the source is local; deliberate fault injection as the black-box substitute for repos that drive an external app and have nothing to mutate. |
| **`defect-prediction`** | Ranks files by risk from seven signals computable from `git log`, then **calibrates the ranking against what actually broke**. No trained model and no probability claims — an ordering that can be recomputed by hand and defended in a review. |
| **`qe-pattern-memory`** | Cross-session learning as a git-tracked pattern store: confidence scoring, tier promotion, and *mandatory falsification*. A store that only counts successes converges on false confidence, so recording failures is a hard rule. Promotion to canonical is a pull-request review, never a self-assessment. |
| **`owasp-security-testing`** | OWASP Top 10 and API Security Top 10 mapped to concrete QA test targets, layered on the negative-test matrix. |

## Install

```bash
git clone https://github.com/georgikazandzhiev-code/ai-native-qa-toolkit.git
```

Copy the layer into your Claude Code configuration:

```bash
cp -r ai-native-qa-toolkit/.claude/CLAUDE.md   ~/.claude/CLAUDE.md
```

```bash
cp -r ai-native-qa-toolkit/.claude/skills/*    ~/.claude/skills/
```

```bash
cp -r ai-native-qa-toolkit/.claude/commands/*  ~/.claude/commands/
```

If you already have a `~/.claude/CLAUDE.md`, merge rather than overwrite — the constitution is the routing table, and clobbering it loses your own rules.

## Adopting it in your repo

The constitution and skills are **project-agnostic on purpose**. Nothing here hardcodes one repository's layout as universal truth.

To onboard a repository, keep `CLAUDE.md` as-is and add a project-level `CLAUDE.md` at the repo root carrying that repo's own folder map, fixture entry points, tag whitelist, and test-id catalogs. The reusable skills then apply on top without modification.

The default stack in the examples is Playwright + TypeScript + Zod, with Qase for test management. Adapt the tooling to whatever your project actually uses — the principles (isolation, type safety, no silent failures, verify before done) are stack-independent.

## Scope of this repository

This is the **generic layer**. Client-specific repository context and internal integrations are intentionally excluded, so nothing here is tied to a particular employer or customer. The skills reference a "repo-context skill" as an extension point where that per-project detail belongs.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, adapt it.
