---
name: skill-creator
description: Author, refactor, or review skills for this repo. Owns the SKILL.md structure contract (Critical block, anti-patterns, self-review, See Also), the file-boundary rule (rules in SKILL.md, catalogs in reference.md, skeletons in templates.md), and the verify-by-grep policy. Triggers — "create a skill", "review this SKILL.md", "/skill-creator". Not for domain implementation work or editing rules.mdc.
metadata:
  category: authoring
disable-model-invocation: true
---

# Skill Creator

Manual-only meta-skill for authoring and refactoring skills inside `~/.claude/skills/`. Invoke with `/skill-creator`. The built-in `~/.cursor/skills-cursor/create-skill/` covers generic Cursor format; this skill layers the project's **paired-rule pattern**, **layered topology**, **standardized SKILL.md structure**, **boundary discipline**, **project-truthful policy**, and **surface-drift policy** — all of which were learned the hard way through Tier 1 cleanup of 16 skills.

A `postToolUse` hook ([.cursor/hooks/skill-validate.py](../../hooks/skill-validate.py)) validates every write under `~/.claude/skills/**/*.md` and surfaces frontmatter / length / structural defects back to the agent in the same turn.

> **Truth source.** Skill topology, rule disposition, migration sequence: [docs/cursor-skills-orchestration.md](../../../docs/cursor-skills-orchestration.md). Companion plan: [docs/framework-alignment-plan.md](../../../docs/framework-alignment-plan.md).

## Critical

Non-negotiable. Every rule below was learned from a real drift incident in this repo's Tier 1 audit. Skipping any of them produces skills that mislead the model and corrode the framework.

- **PROJECT-TRUTHFUL FIRST.** Every claim about the codebase must match real files. Before writing any path, helper name, testid prefix, env var, npm script, or schema name, **verify by grep / ls / cat**. The cost of a wrong claim is a model that generates broken locators, wrong imports, or non-existent helpers — and tests that never resolve.
- **SURFACE DRIFT, NEVER PERPETUATE IT.** When the codebase deviates from canonical (camelCase legacy filenames, `z.object` instead of `z.strictObject`, bare `process.env.X`, etc.), name the deviation explicitly with "drift, fix on next touch" — do NOT bake the deviation in as the rule. The skill teaches the going-forward target, not the current state.
- **STANDARDIZED STRUCTURE IS MANDATORY.** Every SKILL.md must include, in order: frontmatter (with "Do NOT use for X" disclaimers) → opener → `## Critical` block → `## What's in each file` (when multi-file) → workflow / phases / decision tables → `## Anti-patterns` → `## Self-review checklist` → `## Examples` (2-3 worked walkthroughs) → `## Troubleshooting` (symptom → cause → fix table) → `## See Also`. See § Standardized SKILL.md structure.
- **BOUNDARY DISCIPLINE.** Rules / decisions / anti-patterns live in `SKILL.md`. Catalogs of "what exists" live in `reference.md`. Copy-paste skeletons live in `templates.md`. Per-dimension playbooks (e.g. http-method-coverage) live in their own `<topic>.md`. **No code blocks longer than ~5 lines in `SKILL.md` unless the code IS the rule** (a single `expect(SchemaName.parse(body)).toBeTruthy()` line or a `process.env.X!` idiom is fine; a 30-line spec skeleton is not).
- **NO PAIRED RULES — rule content lives in skills.** This repo retired the fat per-area glob rules — invariants and workflow live in the matching skill (`api-testing`, `selectors`, `page-objects`, `test-standards`, etc.). The always-on rule file is `~/.claude/CLAUDE.md` (orchestrator with MUST/SHOULD/WON'T tables and the Routed Skill Index); `api-tests.mdc` / `ui-tests.mdc` exist only as thin glob routers (folder maps + skill pointers). New skills must NOT introduce new paired glob rules with rule content; consolidate everything into the skill.
- **CROSS-REFERENCES MUST BE VERIFIED AND BIDIRECTIONAL.** When you cite a sibling skill in `See Also`, confirm the sibling exists (not a TBD placeholder), and update that sibling's `See Also` to mention the new skill back when relevant. Stale TBD references and one-way cross-links are the #1 source of audit churn.
- **NO DRIFT TRIGGERS in any code example.** No `Zod 4` syntax in a Zod 3 codebase. No `field-field-` when frontend emits `schema-field-`. No bare `process.env.X` propagation when the canonical access is `!`. No `??` defaulting at call sites when defaults belong in `config/util/<service>.ts`. Verify every snippet against `type-safety` skill conventions and the actual codebase.
- **FRONTMATTER `description` IS THE DISCOVERABILITY GATE.** Third person, "pushy" verbs, WHAT + WHEN + 3-7 quoted trigger phrases, "Do NOT use for X (use the `<other>` skill)" disclaimers at the end. The hook blocks writes with empty descriptions; nothing blocks weak descriptions — that's on the author.
- **NEW SKILLS START FROM `assets/SKILL-template.md`.** The template encodes the standardized structure. Copying from another skill is acceptable but you must verify every section is present.
- **UPDATE `~/.claude/CLAUDE.md § Routed Detail Index`** in the same edit batch when adding, renaming, or removing a skill. The orchestrator's Routed Detail Index is the live human-readable map; if it drifts, every model loading the orchestrator routes wrong.

## What's in each file (read this before reaching for another file)

The skill folder splits across three layers: **rules** (this `SKILL.md` + `references/checklist.md` + `references/patterns.md` + `assets/SKILL-template.md`) used on every authoring session, and **measurement tooling** (`scripts/`, `agents/`, `eval-viewer/`, `references/schemas.md`, `assets/eval_review.html`) used only when running quantitative evals (Phase 9, optional).

### Authoring layer (always)

| File | Purpose | Read when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, workflow, decisions, anti-patterns. Teaches the model how to think about authoring a skill. | Always, on any skill-authoring task. Invoked manually via `/skill-creator`. |
| **[`references/patterns.md`](references/patterns.md)** | Catalog of body-text patterns (Workflow checklist / Examples / Conditional decision / Feedback-loop) with project examples. Pick the patterns that fit Phase 5 (author body). | Phase 5 — choosing how to structure the body. |
| **[`references/checklist.md`](references/checklist.md)** | Quality gates the skill must pass: hook-enforced (automatic), body quality (manual), project fit (manual), discoverability (subagent test), pre-merge. The single source of truth for "is this skill ready to ship". | Phase 8 — verification. Also for any "is this skill done?" question. |
| **[`assets/SKILL-template.md`](assets/SKILL-template.md)** | Copy-paste starter for a new skill. Encodes the standardized structure (Critical / What's in each file / workflow / Anti-patterns / Self-review / Examples / Troubleshooting / See Also). | Phase 3 — drafting the new skill. |

### Measurement layer (Phase 9, optional — Anthropic's eval pipeline)

| File / dir | Purpose | Read when |
|------------|---------|-----------|
| **[`scripts/run_eval.py`](scripts/run_eval.py)** | Spawns with-skill + baseline runs for each test case in `evals/evals.json`. | Phase 9 — running quantitative evals. |
| **[`scripts/aggregate_benchmark.py`](scripts/aggregate_benchmark.py)** | Aggregates per-eval results into `benchmark.json` and `benchmark.md` (pass-rate, time, tokens, mean ± stddev, deltas). | Phase 9 — after grading. |
| **[`scripts/improve_description.py`](scripts/improve_description.py)** | Description-optimizer — runs 20 trigger-eval queries, iterates on the description until trigger accuracy converges. | Phase 9 — when discoverability is failing or under-tuned. |
| **[`scripts/run_loop.py`](scripts/run_loop.py)**, **[`generate_report.py`](scripts/generate_report.py)**, **[`package_skill.py`](scripts/package_skill.py)**, **[`quick_validate.py`](scripts/quick_validate.py)**, **[`utils.py`](scripts/utils.py)** | Iteration / reporting / packaging helpers. | Phase 9 — as referenced. |
| **[`agents/grader.md`](agents/grader.md)**, **[`agents/analyzer.md`](agents/analyzer.md)**, **[`agents/comparator.md`](agents/comparator.md)** | Subagent prompt files for grading per-eval output, analyzing aggregate benchmarks, and blind-comparing two skill versions. | Phase 9 — when grading runs / running the analyst pass / blind comparison. |
| **[`eval-viewer/generate_review.py`](eval-viewer/generate_review.py)** + **[`eval-viewer/viewer.html`](eval-viewer/viewer.html)** | HTML review UI: outputs tab + benchmark tab, supports per-iteration diffing. | Phase 9 — to show the user qualitative + quantitative results. |
| **[`references/schemas.md`](references/schemas.md)** | Schemas for `evals.json`, `eval_metadata.json`, `grading.json`, `benchmark.json`, `feedback.json`. | Phase 9 — when authoring assertions or interpreting tool output. |
| **[`assets/eval_review.html`](assets/eval_review.html)** | Static / standalone review HTML for headless environments. | Phase 9 — when `webbrowser.open()` is unavailable. |

**Boundary rule:** the authoring layer is loaded on every session; the measurement layer is opt-in for Phase 9 only. Don't load the measurement files unless the user wants quantitative validation. New `references/<topic>.md` files are added only when SKILL.md exceeds 380 lines or content is rarely-read background. **No nested `references/foo/bar.md`** — the hook blocks it.

## Standardized SKILL.md structure

Every skill in this repo follows this exact section order. The template encodes it; the checklist verifies it; the hook does not yet enforce it (manual review is the gate). When you author or refactor a skill, the structure below is mandatory — Tier 1 audits caught dozens of inconsistencies because earlier skills predated this standardization.

| Section | Required? | Purpose |
|---------|-----------|---------|
| **Frontmatter** (`name`, `description`, `metadata.category`, optional `disable-model-invocation`) | Yes | Discoverability gate. `description` includes WHAT + WHEN + 3-7 quoted trigger phrases + "Do NOT use for X" disclaimers. |
| **Opener** (1 paragraph, optional companion-plan callout) | Yes | What surface this skill covers, who pairs with it, single sentence on the failure mode it prevents. |
| **`## Critical`** | Yes | 5-9 hard rules in `**ALWAYS**` / `**NEVER**` form. Each rule is enforceable, not aspirational. Drawn from real incidents. |
| **`## What's in each file`** | When multi-file | Mini-index table mapping `SKILL.md` / `reference.md` / `templates.md` / `<topic>.md` to purpose. Includes the "boundary rule" callout. |
| **Workflow / phases / architecture / decision tree** | Usually | The skill's substance: numbered checklist (Workflow pattern), worked examples (Examples pattern), branched decision (Conditional pattern), or validate-loop (Feedback-loop pattern). Pick from `references/patterns.md`. |
| **`## Anti-patterns`** | Yes | Bulleted ❌ list of mistakes that real authors hit. Each anti-pattern names what to do instead. |
| **`## Self-review checklist`** | Yes | Checkboxes the model walks through before declaring done. High-level; deep checklist for skill-creator itself lives in `references/checklist.md`. |
| **`## Examples`** | Yes (2-3) | Worked walkthroughs that cite the workflow steps. Use REAL names from this codebase, never placeholders. |
| **`## Troubleshooting`** | Yes | Table: symptom → cause → fix. Lists real failure modes a future author will hit. |
| **`## Gotchas`** | Optional, session-grown | Dated bullets of non-obvious environment quirks, API surprises, and workarounds discovered during real sessions (`- **YYYY-MM-DD:** <gotcha>`). Agents append here when a session hits one (the stop hook reminds them). Promote a gotcha into `## Critical` / `## Troubleshooting` once it recurs or stabilizes; prune entries that a fix upstream made obsolete. |
| **`## See Also`** | Yes | Cross-skill links (paired rule, sibling skills in cluster, orchestration doc). Must be verified — no TBD references for now-populated skills. |

**Why this structure is non-negotiable:** every Tier 1 audit found drift caused by skills that used a different structure. Models reading skills route by section name; deviations break routing. The hook does not enforce section presence today — manual review is the gate.

## Frontmatter spec (inline so you never need to leave this file)

| Field | Required | Constraint |
|-------|----------|-----------|
| `name` | yes | Lowercase + hyphens, ≤ 64 chars, equals folder name, no `anthropic`/`claude`, no XML angle brackets. Hook blocks violations. |
| `description` | yes | ≤ 1024 chars, third person, includes WHAT + WHEN + 3-7 quoted trigger phrases + "Do NOT use for X (use the `<other>` skill)" disclaimers at the end. The "Do NOT" disclaimers prevent over-routing — without them, the skill catches false positives. |
| `metadata.category` | project | One of `authoring | running | domain | cross-cutting`. Maps to topology subgraphs in [orchestration doc §6.2.4](../../../docs/cursor-skills-orchestration.md). |
| `disable-model-invocation` | optional | `true` for manual-only (`/skill-name`) workflows. Default false. Skills with `true` skip the Phase 6 subagent test (discoverability is trivially "selected when typed"). |
| `license`, `compatibility` | optional | Use only when needed. |

The hook ([skill-validate.py](../../hooks/skill-validate.py)) enforces the hard items on write.

## Description recipe

Four parts in order, third person, deliberately "pushy" because Cursor agents undertrigger:

1. **WHAT** — verb-led summary (no filler). "Authors / Generates / Validates / Investigates …"
2. **WHEN** — user intents that should trigger this. "Use when adding X, refactoring Y, or generating Z."
3. **PROACTIVE TRIGGERS** — situations the agent should reach for it on its own.
4. **EXPLICIT PHRASES** — 3-7 `"quoted phrases"` users would actually type.
5. **DO NOT USE disclaimers** — list 2-4 adjacent intents that route to a different skill, e.g. "Do NOT use for selector strategy (use the `selectors` skill). Do NOT use for env var declaration (use the `config` skill)."

Pushy verbs that work: "Use when…", "Reach for this when…", "Apply this skill if…". Don't lie — pushy is about scope clarity, not over-claiming.

| Style | Effect |
|-------|--------|
| Passive ("This skill helps with X") | Undertriggered. |
| Neutral ("Use for X") | Picked when explicit, missed otherwise. |
| **Pushy with disclaimers** ("Reach for this whenever the user mentions X, Y, or Z. Do NOT use for A — that's the `<other>` skill.") | Reliable across paraphrasings AND avoids false positives. |

This file's own description is a worked example.

## Workflow — 8 phases

```
- [ ] 1. Capture intent  (5 questions)
- [ ] 2. Position in topology  (layer + paired-rule + cluster)
- [ ] 3. Draft from the template  (frontmatter + body skeleton)
- [ ] 4. Progressive disclosure decisions  (need references/, assets/, scripts/?)
- [ ] 5. Author the body  (pick patterns from references/patterns.md, follow standardized structure)
- [ ] 6. Test via subagent  (3 prompts; discoverability + quality)
- [ ] 7. Cross-link  (paired rule, sibling skills, orchestration doc, rules.mdc Routed Detail Index)
- [ ] 8. Verify  (run references/checklist.md; hook errors zero)
```

### Phase 1: Capture intent

Five questions. Use `AskQuestion` only when more than one answer is genuinely ambiguous; otherwise infer from context.

1. **What** is the skill's job in one sentence? (Verb-led, no filler.)
2. **When** should the agent reach for it?
3. **Where** does it land — populating an existing empty placeholder ([orchestration §6.2.2](../../../docs/cursor-skills-orchestration.md)), creating a new folder, or refactoring a rule via `/migrate-to-skills`?
4. **Paired rule** — this repo has no fat per-area glob rules (they were consolidated into the matching skills; `api-tests.mdc` / `ui-tests.mdc` survive only as thin routers with folder maps). Do NOT introduce new paired glob rules with rule content; everything lives in the skill. The always-on rule file is `~/.claude/CLAUDE.md`.
5. **Output shape** — what does success look like (scaffolded spec / diagnostic / decision / refactor)?

If the user asks "what skills do we still need", route directly to [orchestration §6.2.2](../../../docs/cursor-skills-orchestration.md) and the empty `~/.claude/skills/*` folders — that **is** the answer. The live list of populated skills is the Routed Detail Index in [`~/.claude/CLAUDE.md`](../../../~/.claude/CLAUDE.md).

### Phase 2: Position in topology

Almost everything lands at **Layer 2** (agent-decides skill). Layer 0 is reserved for `~/.claude/CLAUDE.md` (the always-on orchestrator); Layer 1 for the glob-attached test rules.

Pick the **cluster** for cross-linking siblings:

- **API authoring** — `scaffold-spec → api-testing → data-strategy → helpers → fixtures → type-safety`.
- **UI authoring** — `scaffold-spec → selectors → page-objects → playwright-cli → frontend-cross-check → enums → fixtures`.
- **Domain orientation** — `master-context → metrics-api-tests-context → test-case-generation`.
- **Failure investigation** — `debugging → playwright-cli → frontend-cross-check`.
- **Repo hygiene** — `refactor-values → skill-creator → ai-native-workflow`.

Set `metadata.category` accordingly.

### Phase 3: Draft from the template

1. Create the folder `~/.claude/skills/<name>/` (forward slashes, lowercase + hyphens, equals future `name`).
2. Copy [`assets/SKILL-template.md`](assets/SKILL-template.md) → `~/.claude/skills/<name>/SKILL.md`.
3. Fill the frontmatter using the spec table above. Apply the description recipe — read it back; if it sounds passive, rewrite. Add the "Do NOT use for X" disclaimers.
4. Pick the freedom level: **High** for judgment-heavy tasks (PR review, debugging), **Medium** for templated authoring (`scaffold-spec`), **Low** for fragile / consistency-critical operations.

The hook will block on save if frontmatter is invalid; let it.

### Phase 4: Progressive disclosure decisions

Default is **single SKILL.md**. Bias is to keep skills as one file until length forces a split.

| Subdir | Add when | Don't add when |
|--------|----------|----------------|
| `references/` | Body would exceed 380 lines, OR content is rarely-read background catalog (helper inventory, testid taxonomy, env var list). | Body fits and content is rule / decision / pattern. |
| `templates.md` (sibling, not subdir) | Skill prescribes copy-paste skeletons (full spec, full schema file, full helper file). Pull the skeletons here so SKILL.md stays rules-only. | Skill is purely decisional with no skeleton output. |
| `<topic>.md` (sibling, e.g. `http-method-coverage.md`) | One dimension of the skill grows large enough to dwarf the rest of SKILL.md (per-verb playbook, per-monitor-type recipe). | The dimension fits in a single SKILL.md table. |
| `assets/` | The skill ships a literal file artifact (template, fixture, JSON sample). | The skill is purely procedural — no artifact to ship. |
| `scripts/` | Deterministic CLI step (eval harness, repeatable command). | The agent already runs `npx playwright test` natively — no wrapper needed. |

Anthropic constraints: each `references/<file>.md` is **one level deep**; reference files > 100 lines start with a `## Contents` block. The hook checks both.

### Phase 5: Author the body

**Mandatory structure** (see § Standardized SKILL.md structure for the rationale):

1. Opener (1 paragraph)
2. `## Critical` block (5-9 rules)
3. `## What's in each file` table (when multi-file)
4. Workflow / phases / decision tables
5. `## Anti-patterns`
6. `## Self-review checklist`
7. `## Examples` (2-3 worked walkthroughs with REAL codebase names)
8. `## Troubleshooting` (symptom → cause → fix)
9. `## See Also`

**Pick body patterns** from [`references/patterns.md`](references/patterns.md):

- Multi-step procedure → **Workflow checklist** (§1).
- Output shape matters more than rules → **Examples** (§2).
- Branching on input → **Conditional decision** with mermaid (§3).
- Verifiable output → **Feedback loop** (§4).

**Add the project signature** (every populated skill in this repo has one):

- **Architecture map** or **storage location map** (table).
- **Mermaid decision tree** when the skill picks between modes.
- **Paired-rule callout** in the opener: "Read that rule first."
- **Companion-plan citation** with section numbers if the skill describes work in flight.

**Drift-prevention while authoring:**

- Every codebase claim → grep first. `grep -rn "<helper-name>" <sibling-repos>/automation/helpers/` before claiming a helper exists. `head <sibling-repos>/automation/<file>` before claiming a file's shape.
- Every code snippet → match `type-safety` conventions. `process.env.X!` not bare. `z.strictObject()` for new schemas. No `Zod 4` syntax in a Zod 3 codebase.
- Every cross-reference → verify the target exists and is populated. No `(TBD)` markers for now-populated skills. No broken markdown links.
- Every drift-callout → name the deviation explicitly with "fix on next touch", never bake it in as the rule.

### Phase 6: Test via subagent

Modern alternative to a manual fresh-chat smoke test. Spawn three `generalPurpose` readonly subagents in parallel and grade their responses in-turn.

Author **three** prompts:

1. **Direct trigger** — uses a verbatim phrase from the description.
2. **Paraphrased trigger** — same intent, different wording.
3. **Negative case** — adjacent intent that should *not* select the new skill.

Then invoke the Task tool three times in parallel with this prompt template:

```text
You are simulating fresh-chat skill discovery in this repo.

A user types: "<TEST PROMPT>"

Read the skill descriptions in ~/.claude/skills/*/SKILL.md (frontmatter only).
Do NOT read bodies. Do NOT execute the request. Do NOT edit files.

Return a JSON-like report:
- selected_skills: <skill names you would load, in priority order>
- reasoning: <one sentence per selected skill, citing the matching trigger phrase or scope clause>
- new_skill_status: "selected" | "not_selected" | "ambiguous"
  (where new_skill is "<NEW SKILL NAME>")
```

Pass criteria:

| Prompt | `new_skill_status` must be |
|--------|---------------------------|
| Direct | `selected` |
| Paraphrased | `selected` |
| Negative | `not_selected` |

Failure → return to Phase 3 description, sharpen, re-test. Common fixes: missing trigger phrases, passive description, scope too broad, missing "Do NOT use for X" disclaimers.

If `disable-model-invocation: true`, skip Phase 6 — the skill fires only on `/<name>` and discoverability is trivially "selected when typed". Run only the Phase 8 checklist.

### Phase 7: Cross-link

**In the same edit batch as the new SKILL.md write:**

1. **Update [`~/.claude/CLAUDE.md § Routed Detail Index`](../../../~/.claude/CLAUDE.md)** — add the skill row with task signal + skill name + (optional) "Pairs with" rule. Mark TBD skills as **(TBD)** so the model doesn't route to empty placeholders. This is the single human-readable index.
2. **Update siblings' `## See Also`** — when the new skill belongs to a cluster (per Phase 2), the existing cluster siblings should mention the new skill in their See Also. Cross-references are bidirectional.
3. **Update [orchestration doc §6.2.2](../../../docs/cursor-skills-orchestration.md)** — if a previously-empty placeholder is now populated, flip the row's status. Also update §6.4 cross-reference matrix if cluster relationships changed.
5. **If migrating from a rule**, leave a one-line breadcrumb in the original rule pointing at the new skill (mirrors `/migrate-to-skills`).

In the new SKILL.md `## See Also` section:

- Paired rule (or `(none)` explicitly).
- Sibling skills in the chosen cluster from Phase 2 — verify each is **populated** (not TBD).
- Orchestration doc — always cite [`docs/cursor-skills-orchestration.md`](../../../docs/cursor-skills-orchestration.md) §6.4 cross-reference matrix.
- Companion plan — `docs/framework-alignment-plan.md` §N if applicable.

### Phase 8: Verify

Run [`references/checklist.md`](references/checklist.md) end-to-end. The hook will have already enforced structural items on every save; the checklist covers what the hook can't (Critical block presence, Examples / Troubleshooting / See Also presence, drift-trigger absence, cross-reference verification).

Ship only when all gates pass and the hook reports zero errors. If any gate fails, return to the relevant phase.

### Phase 9 (optional): Quantitative measurement

For most skills, Phases 1–8 are sufficient — the subagent test in Phase 6 covers discoverability, the checklist in Phase 8 covers quality. **Phase 9 is the deeper layer**: it runs real with-skill vs baseline evals, aggregates pass-rate / time / token metrics, surfaces them in a side-by-side review UI, and (optionally) optimizes the description against trigger-eval queries.

**Use Phase 9 when:** the user asks "is this skill actually working?", you suspect undertriggering, you want quantitative validation before merging, or you're A/B-comparing two skill versions.

**Skip Phase 9 when:** the skill is `disable-model-invocation: true` (manual-only — discoverability is moot), the skill output is subjective (writing style, design judgment — quantitative grading doesn't apply), or the user just wants to vibe-test.

**Workflow (high-level):**

1. **Author 2-3 realistic test prompts** and save them to `evals/evals.json` (see `references/schemas.md` for the schema).
2. **Run with-skill + baseline pairs** in parallel via `scripts/run_eval.py`. Capture timing data from each subagent's completion notification. Save outputs to `<skill-name>-workspace/iteration-N/eval-<id>/{with_skill,without_skill}/outputs/`.
3. **Grade each run** using `agents/grader.md` (subagent or inline). Save to `grading.json`. Use the field names `text`, `passed`, `evidence` — the viewer depends on those exactly.
4. **Aggregate the benchmark**: `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>` produces `benchmark.json` and `benchmark.md`.
5. **Run the analyst pass** (`agents/analyzer.md`) to surface non-discriminating assertions, high-variance evals, and time/token tradeoffs.
6. **Launch the viewer**: `python <skill-creator-path>/eval-viewer/generate_review.py <workspace>/iteration-N --skill-name <name> --benchmark <workspace>/iteration-N/benchmark.json`. For headless environments, use `--static <output_path>`. The user reviews qualitative outputs and quantitative metrics, leaves feedback in the textbox.
7. **Read `feedback.json`** when the user is done. Empty feedback = good. Specific complaints → address in the next iteration.
8. **Iterate**: improve the skill, re-run all evals into `iteration-(N+1)/`, launch the viewer with `--previous-workspace` for diffing. Repeat until the user is happy or feedback is uniformly empty.

**Description optimization (sub-loop):**

When discoverability is the issue (the skill undertriggers in Phase 6), use `scripts/improve_description.py`:

1. Generate 20 trigger-eval queries (~10 should-trigger, ~10 should-not-trigger near-misses). Realistic phrasings — file paths, casual speech, partial intents.
2. Review with the user.
3. Run the optimizer loop. It iterates on the description until trigger accuracy converges.
4. Apply the result; re-run Phase 6 to confirm.

**Blind comparison (advanced):**

For "is the new version actually better than the old?", use `agents/comparator.md` to give two outputs to an independent agent without telling it which is which. Most skills don't need this; the human review loop is usually sufficient.

**Where to read more:** the full pipeline (per-step subagent prompts, exact JSON schemas, troubleshooting headless environments) is documented in this skill's measurement layer — `scripts/`, `agents/`, `eval-viewer/`, `references/schemas.md`. Read them when you actually run Phase 9; don't load them speculatively.

## Updating an existing skill

Abbreviated loop:

1. **Diagnose** — which gate from [`checklist.md`](references/checklist.md) is failing? Most common: structural drift (missing `## Critical` / `## Examples` / `## Troubleshooting` / `## See Also`), discoverability (description weak), cluster fit (cross-references stale), boundary violation (code blocks > 5 lines in SKILL.md).
2. **Pinpoint** — read only the failing section + the relevant inline guide above (frontmatter spec, description recipe, structural template, or [`patterns.md`](references/patterns.md)).
3. **Edit** — minimum diff. Don't rewrite working sections.
4. **Re-test** — re-run Phase 6 subagents against the affected gate.
5. **Re-verify** — full checklist + hook clean.

Refactors that exceed 30% of the original `SKILL.md` line count usually mean the skill is mis-scoped — split into two or merge into a sibling.

## Migrating a rule to a skill

When the source is `.cursor/rules/<name>.mdc`:

1. Confirm the rule is **apply-intelligently** (no `globs:`, `alwaysApply: false`). Always-apply and glob-attached rules stay rules — those modes don't exist for skills.
2. Run the built-in `/migrate-to-skills` skill — copies frontmatter, drafts the new SKILL.md, updates references.
3. Resume **Phase 4** here: migrated bodies usually exceed 380 lines and need a `references/` split.
4. Update the rule disposition row in [orchestration §6.2.2](../../../docs/cursor-skills-orchestration.md).
5. Run Phases 6-8.

## Anti-patterns

Each ❌ below was caught in real Tier 1 audits. The fix is named.

- ❌ **Authoring a SKILL.md without `## Critical` block at top.** The model scans the rules in 30 seconds before reading the workflow; missing this block wastes that scan. Add it — 5-9 hard rules in `**ALWAYS**` / `**NEVER**` form.
- ❌ **Writing claims about the codebase without grep verification.** Wrong file paths, wrong helper names, wrong testid prefixes (e.g. claiming `field-field-` when the frontend emits `schema-field-`). Verify by grep before writing.
- ❌ **Baking drift into the rule.** "Match the neighbor forever" perpetuates the legacy. Instead: name the canonical going-forward rule, mark the legacy as drift to migrate on next touch.
- ❌ **Code blocks > 5 lines in SKILL.md.** Move to `templates.md`. SKILL.md is the rule layer; only ≤5-line code-IS-the-rule snippets stay (e.g. `expect(SchemaName.parse(body)).toBeTruthy()` or `process.env.X!`).
- ❌ **Cross-reference to a TBD / empty placeholder skill** without the `(TBD)` marker and a fallback note. Models route based on the Skill Index; pointing at empty skills wastes their effort.
- ❌ **One-way cross-reference.** Adding a new skill to another's `See Also` without updating the new skill's `See Also` to mention the other. Cross-references are bidirectional.
- ❌ **Stale "until populated" or "when populated" phrasing** for a now-populated skill. Re-read the See Also section after every Tier-N completion.
- ❌ **Description without quoted trigger phrases.** Discoverability fails. Add 3-7 `"quoted phrases"` users would type.
- ❌ **Description without "Do NOT use for X" disclaimers.** Skill catches false positives on adjacent tasks. Add 2-4 disclaimers at the end.
- ❌ **Description in second person ("You should use this when…")** — undertriggers. Always third person.
- ❌ **Folder name ≠ `name` field.** Cursor refuses to load. Hook catches this on save.
- ❌ **Paired rule duplicated in skill body.** Invariants belong in the rule (≤ 120 lines, glob-attached). Skill says "Read that rule first" and references rule sections; it does not restate them.
- ❌ **`references/` more than one level deep** (`references/foo/bar.md`). Breaks Anthropic's progressive disclosure model. Hook catches this.
- ❌ **Skill replicates a built-in** (e.g., a project skill that just re-wraps `/migrate-to-skills`). If the skill adds no project-specific structure on top, it shouldn't exist.
- ❌ **Skill body over 380 lines on first draft** — usually two skills. Split before authoring further.
- ❌ **Reference proliferation** — > 4 reference files for a single skill is almost always the wrong shape. Inline first; split only when length forces it.
- ❌ **Skipping `~/.claude/CLAUDE.md § Routed Detail Index` update** when adding a skill. The orchestrator's index is the live route map — if it drifts, every model loading the orchestrator routes wrong.
- ❌ **Pre-emptive bulk drift fix in a single PR** ("rewrite all camelCase helpers to kebab-case in one go"). The skill should mark drift as "fix on next touch" — not as a standalone refactor.
- ❌ **Examples that use placeholder names** (`MyResource`, `<resource>`). Use REAL names from this codebase — `synthetics`, `probes`, `adminTenants`, etc. The model extrapolates better from real examples.

## Self-review checklist

High-level. The full gate is in [`references/checklist.md`](references/checklist.md).

- [ ] Frontmatter: `name` matches folder, `description` ≤ 1024 chars third-person pushy with WHAT + WHEN + 3-7 trigger phrases + "Do NOT use for X" disclaimers, `metadata.category` set.
- [ ] Opener: one paragraph, paired-rule callout if applicable, companion-plan citation if applicable.
- [ ] `## Critical` block present at top — 5-9 hard rules in `**ALWAYS**` / `**NEVER**` form.
- [ ] `## What's in each file` table present when the skill has reference / templates / topic siblings.
- [ ] Workflow / decisions / patterns body — uses one or more of the four patterns from `references/patterns.md`. Project signature device (table / mermaid / numbered checklist) present.
- [ ] `## Anti-patterns` section with ❌ list — each anti-pattern names the fix.
- [ ] `## Self-review checklist` — checkboxes the model walks through.
- [ ] `## Examples` — 2-3 worked walkthroughs with REAL codebase names (no placeholders).
- [ ] `## Troubleshooting` — symptom → cause → fix table.
- [ ] `## See Also` — paired rule, sibling skills (verified populated, not TBD), orchestration doc, companion plan.
- [ ] No code blocks > 5 lines in SKILL.md (boundary rule). Skeletons live in `templates.md` if needed.
- [ ] Every codebase claim verified by grep (helpers, paths, testids, env vars, npm scripts, schemas).
- [ ] Every code snippet matches `type-safety` conventions (`process.env.X!`, `z.strictObject()`, no Zod 4 in Zod 3 codebase, no `field-field-`).
- [ ] No drift baked in as the rule — drift is named explicitly with "fix on next touch".
- [ ] `~/.claude/CLAUDE.md § Routed Detail Index` updated in same edit batch.
- [ ] Cluster siblings' `See Also` updated to mention the new skill back (bidirectional cross-links).
- [ ] Phase 6 subagent test passed (direct + paraphrased = `selected`, negative = `not_selected`) — skip if `disable-model-invocation: true`.
- [ ] Hook reports zero errors on the latest save.

## Examples

### Example 1 — Authoring a new skill (`page-objects`) for an existing empty placeholder

User says: *"Populate the `page-objects` skill folder."*

1. **Phase 1 (intent)** — WHAT: governs POM class structure (constructor, locator sections, action methods, JSDoc rules, fixture registration). WHEN: editing `pages/**`. No paired rule (this repo retired per-area glob rules). Output shape: ~370-line SKILL.md + `reference.md` for the POM key-method catalog.
2. **Phase 2 (topology)** — Layer 2 (agent-decides). Cluster: UI authoring (siblings: `selectors`, `playwright-cli`, `frontend-cross-check`, `fixtures`).
3. **Phase 3 (draft)** — copy `assets/SKILL-template.md`, fill frontmatter with disclaimers ("Do NOT use for selector strategy (use `selectors`). Do NOT use for fixture authoring (use `fixtures`). Do NOT use for UI exploration (use `playwright-cli`)."), apply description recipe with pushy verbs and trigger phrases.
4. **Phase 4 (progressive disclosure)** — single SKILL.md to start. Add `references/method-standards.md` only if body exceeds 380 lines.
5. **Phase 5 (author body)** — opener cites the always-on `~/.claude/CLAUDE.md` for framework invariants (no paired glob rule). `## Critical` block: 10 rules (PascalCase filename in `pages/app/`, extends `BasePage`, constructor takes `page: Page`, locator getters return `Locator` synchronously, action methods include post-condition assertion, JSDoc on action methods only, register in `page-object-fixture.ts`, never `new SyntheticsPage(page)` in spec, no `waitForTimeout`, exploration-first via `playwright-cli`). Pick patterns from `patterns.md`: Workflow (Adding a new POM), Conditional (when to use anchor + drill, sub-component scoping). Add `## Anti-patterns`, `## Self-review checklist`, `## Examples` (use REAL POM names: `SyntheticsPage`, `CreateMonitorPage`, `ProbesPage`), `## Troubleshooting`, `## See Also`.
6. **Phase 6 (subagent test)** — three prompts: "Add a page object for the new alerts page" (direct → `selected`), "Wire up a POM for the dashboard" (paraphrased → `selected`), "Fix a flaky locator" (negative → `not_selected`, should route to `selectors` or `debugging`).
7. **Phase 7 (cross-link)** — update `~/.claude/CLAUDE.md § Routed Detail Index` (remove `(TBD)` marker on the `page-objects` row, fill in description). Update `selectors`, `playwright-cli`, `fixtures`, `frontend-cross-check`, `debugging`, `ai-native-workflow` See Also sections to mention `page-objects` (no longer TBD). Update `orchestration §6.2.2` row to "populated".
8. **Phase 8 (verify)** — run `references/checklist.md` end-to-end. Confirm hook is green.

### Example 2 — Fixing a structural drift in an existing skill

User says: *"`enums/SKILL.md` is missing the `## Examples` section."*

1. **Phase 1 (diagnose)** — checklist gate failing: project-fit (signature device may be present, but Examples section absent).
2. **Phase 5 only** — open the skill, identify the right insertion point (after `## Self-review checklist`, before `## Troubleshooting`). Author 2-3 worked walkthroughs using REAL enum names from `enums/app/qase-suites.ts` (`SUITES.API_SYNTHETICS`) and `enums/util/statuses.ts` (`Status.ACTIVE`, `UserStatus.PENDING_VERIFICATION`).
3. **Phase 7 (cross-link)** — no orchestrator-level changes (the skill was already in the index). No sibling-See-Also updates needed (the skill name is unchanged).
4. **Phase 8 (verify)** — re-run checklist; confirm `## Examples` is now present, hook is green.

### Example 3 — Migrating an apply-intelligently rule to a skill

User says: *"Move `metrics-api-tests-context.mdc` (apply-intelligently rule) into a skill."* (Historical example — this conversion has already happened. Use as a template for the next manual-only domain skill.)

1. **Phase 1 (intent)** — confirm the rule is apply-intelligently (frontmatter shows no `globs:`, `alwaysApply: false`). Confirm via `head <sibling-repos>/automation/.cursor/rules/<rule>.mdc`.
2. **Phase 2 (topology)** — Layer 2. Cluster: API authoring or domain orientation depending on scope.
3. **Run `/migrate-to-skills`** — drafts the new `SKILL.md`, copies frontmatter, suggests references.
4. **Phase 4 (progressive disclosure)** — migrated bodies usually exceed 380 lines; split out a `references/<topic>.md` per Anthropic's one-level-deep rule.
5. **Phase 5 (author body)** — re-shape into the standardized structure (`## Critical`, Examples, Troubleshooting, See Also). The original rule was MUST-style; the skill needs WORKFLOW + EXAMPLES on top.
6. **Phase 7 (cross-link)** — leave a one-line breadcrumb in the original rule (e.g. "Migrated to `~/.claude/skills/<name>/SKILL.md`"). Update `~/.claude/CLAUDE.md § Routed Detail Index`. Update orchestration §6.2.2 row to flip the rule disposition.
7. **Phase 8 (verify)** — run the full checklist + Phase 6 subagent test.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hook reports `name "X" must equal folder name "Y"` | Folder name ≠ frontmatter `name` field | Rename the folder OR fix the `name` field. Cursor refuses to load mismatched skills. |
| Hook reports `description NN chars exceeds 1024 limit` | Description too long | Tighten — keep WHAT + WHEN + 3-7 trigger phrases + "Do NOT use for X" disclaimers. Strip filler. |
| Hook reports `description appears to use first/second person` | "You should use this when…" or "We use this for…" | Rewrite in third person: "Authors / Generates / Reach for this when…". |
| Hook reports `no signature device detected` | Body missing table / mermaid / numbered checklist | Add the project signature: an architecture map, decision tree, or numbered workflow checklist. Mirror `api-testing` / `selectors` / `data-strategy`. |
| Hook reports `SKILL.md body is NN lines (project guideline 380)` | Skill is too long | Move catalog content to `references/<topic>.md`; move skeletons to `templates.md`. Apply boundary discipline. |
| Subagent test: direct prompt fails (`new_skill_status: not_selected`) | Description fundamentally broken | Rewrite description: more pushy, more trigger phrases, sharper WHAT clause. |
| Subagent test: paraphrased fails | Trigger phrases too narrow | Add 2-3 more `"quoted phrases"` covering paraphrases the user might actually type. |
| Subagent test: negative trips (`new_skill_status: selected` on adjacent task) | Scope too wide; missing "Do NOT use for X" disclaimers | Add disclaimers at the end of the description. Tighten the WHEN clause. |
| `~/.claude/CLAUDE.md` and the new skill disagree on a route or rule | Drift between orchestrator and skill | `~/.claude/CLAUDE.md` wins. Surface the disagreement; reconcile in the same edit. |
| Sibling skill's `See Also` references the new skill but the new skill's `See Also` doesn't reciprocate | One-way cross-reference | Cross-references are bidirectional. Update the new skill's See Also too. |
| Skill claims a helper / file / testid that doesn't exist | Author didn't grep before writing | Grep now: `grep -rn "<claim>" <sibling-repos>/automation/`. If absent, fix the skill. Future authoring: grep first, write second. |
| Skill teaches `field-field-` (or `Zod 4` in Zod 3 codebase, or bare `process.env.X` propagation) | Drift trigger baked into a code example | Replace with the canonical pattern. Add a drift-callout if the legacy still exists in the codebase. |

## See Also

**Sibling skills (populated, standardized structure — mirror their shape):** `scaffold-spec`, `api-testing`, `selectors`, `data-strategy`, `enums`, `config`, `type-safety`, `refactor-values`, `debugging`, `fixtures`, `helpers`, `playwright-cli`, `frontend-cross-check`, `ai-native-workflow`.

**TBD placeholders (do NOT route to — author them via this skill):** `page-objects`, `test-standards`, `common-tasks`.

**This skill's bundled resources:**

- [`references/patterns.md`](references/patterns.md) — body-text patterns, Phase 5
- [`references/checklist.md`](references/checklist.md) — quality gates, Phase 8
- [`references/schemas.md`](references/schemas.md) — JSON schemas for evals / grading / benchmark / feedback (Phase 9)
- [`assets/SKILL-template.md`](assets/SKILL-template.md) — Phase 3 starter
- [`scripts/`](scripts/), [`agents/`](agents/), [`eval-viewer/`](eval-viewer/) — Phase 9 measurement pipeline
- [`.cursor/hooks/skill-validate.py`](../../hooks/skill-validate.py) — automatic frontmatter / structure validation on save

**Orchestration:**

- [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — always-on orchestrator. § Routed Detail Index lives here; every new skill updates it.
- [`docs/cursor-skills-orchestration.md`](../../../docs/cursor-skills-orchestration.md) — orchestration master. §4 layered model, §6.2 final shape, §6.4 cross-reference matrix.
- [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) — companion plan, drift inventory, sequenced fix order.
- [`AGENTS.md`](../../../AGENTS.md) — repo-root cross-tool entrypoint.

**Built-ins:**

- `~/.cursor/skills-cursor/create-skill/` — generic Cursor skill format. This skill layers project-specific conventions on top.
- `/migrate-to-skills` — built-in for rule → skill migration.
