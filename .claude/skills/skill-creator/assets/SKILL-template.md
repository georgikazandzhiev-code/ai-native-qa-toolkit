<!--
  Starter template for a new project skill. Copy this file to
  ~/.claude/skills/<your-skill>/SKILL.md and replace the placeholders.

  This template encodes the STANDARDIZED STRUCTURE mandated by skill-creator.
  Every section header below is required (or marked "(when applicable)" /
  "(when multi-file)"). Do NOT delete sections — fill them or mark them
  explicitly absent. The checklist (references/checklist.md) gates on
  presence; the hook (skill-validate.py) gates on frontmatter + length.

  IMPORTANT: All relative paths below are written from the perspective of the
  destination (~/.claude/skills/<your-skill>/SKILL.md), NOT from this template's
  own location. Link-checkers run against the asset path will report some
  paths as broken — that is expected and not a defect.
-->
---
# REQUIRED. Lowercase, numbers, hyphens only. Max 64 chars. Must equal the
# parent folder name. Cannot contain "anthropic" or "claude".
name: <folder-name>

# REQUIRED. Third person. Max 1024 chars. Must include:
#   1. WHAT the skill does (verb-led summary, no filler)
#   2. WHEN to use it (specific contexts, file globs, user intents)
#   3. PROACTIVE TRIGGERS the agent should reach for on its own
#   4. 3-7 EXPLICIT QUOTED PHRASES users would actually type
#   5. "Do NOT use for X (use the `<other>` skill)" DISCLAIMERS — 2-4 of them.
#      Adjacent intents that route to a different skill. Without disclaimers,
#      the skill catches false positives on adjacent tasks.
# Be deliberately "pushy" so the agent does not undertrigger.
# The description is the ONLY thing the agent sees when deciding which skill
# to load — invest here.
# See SKILL.md § Description recipe.
description: <one-paragraph WHAT + WHEN>. Use when <user intent A>, <intent B>, or <intent C>. Trigger phrases — "<phrase 1>", "<phrase 2>", "<phrase 3>", "<phrase 4>", "<phrase 5>". Do NOT use for <adjacent task A> (use the `<other-skill-A>` skill). Do NOT use for <adjacent task B> (use the `<other-skill-B>` skill).

# REQUIRED. Categorize for the orchestration doc topology subgraphs.
# Pick one: authoring | running | domain | cross-cutting
metadata:
  category: <authoring|running|domain|cross-cutting>

# OPTIONAL. Set to true for manual-only skills invoked via /<skill-name>.
# Skips Phase 6 subagent test (discoverability is moot for manual-only).
# disable-model-invocation: true
---

# <Skill Title>

<!--
One-paragraph opener: what surface this skill covers, who pairs with it, and
the single sentence that captures the failure mode this skill prevents. This
is the agent's first read after the description.
-->

The paired rule at [.cursor/rules/<rule>.mdc](../../rules/<rule>.mdc) captures
non-negotiable invariants. **Read that rule first** if it exists. This skill
orchestrates the full authoring workflow on top of it.
<!-- If no paired rule exists, replace the line above with:
"This skill has no paired rule (rule disposition: skill-only)." -->

> **Companion plan.** When this skill cites "drift" or "planned", it points at
> a numbered section of [docs/framework-alignment-plan.md](../../../docs/framework-alignment-plan.md).
> Delete this callout if the skill has no companion plan.

## Critical

<!--
REQUIRED. 5-9 hard rules in **ALWAYS** / **NEVER** form. Each rule must be
enforceable, not aspirational. Drawn from real incidents, not theory.

The Critical block is the #1 thing future authors of this skill rely on —
it's what the model scans in 30 seconds before reading the workflow.

Format each rule as:
- **ALWAYS / NEVER <imperative>.** <One sentence on why this matters and
  what breaks if violated.>

Cover the load-bearing rules of the skill's domain. For project skills,
many will mirror skill-creator's own Critical block adapted to the domain
(project-truthful first, surface drift never perpetuate, standardized
structure mandatory, boundary discipline, cross-refs bidirectional, no
drift triggers in code, etc.).

Examples to model:
- api-testing/SKILL.md § Critical (8 rules — schemas, envelopes, helpers,
  cleanup, coverage)
- selectors/SKILL.md § Critical (9 rules — locator priority, Radix
  exception, anchor-and-drill, no codegen)
- type-safety/SKILL.md § Critical (7 rules — no any, strictObject, ! for
  process.env, etc.)
-->

- **ALWAYS** <rule 1>. <Why / what breaks.>
- **NEVER** <rule 2>. <Why / what breaks.>
- **ALWAYS** <rule 3>. <Why / what breaks.>
- ... (5–9 total)

## What's in each file (read this before reaching for another file)

<!--
REQUIRED when the skill has supplementary files (references/, templates.md,
<topic>.md, assets/). DELETE this entire section if the skill is a single
SKILL.md with no siblings.

Format as a table mapping each file to (Purpose, Read when). Include the
"boundary rule" callout below the table.
-->

| File | Purpose | Read when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, decisions, anti-patterns. Teaches the model how to think about <domain>. | Always, on any <domain> task. |
| **[`reference.md`](reference.md)** | Catalog of facts (helper inventory, testid taxonomy, env var list, schema shapes). | Looking up "what exists" — `grep -r` from here as needed. |
| **[`templates.md`](templates.md)** | Copy-paste skeletons (full file shapes the model adapts). | Scaffolding a new <artifact>. |
| **[`<topic>.md`](<topic>.md)** | Deep playbook for one dimension (per-verb coverage, per-resource recipe, …). | When the question is "what do I owe for <dimension>?" |

**Boundary rule:** decisions / rules / anti-patterns live in `SKILL.md`. Catalogs of "what exists" live in `reference.md`. Copy-paste skeletons live in `templates.md`. Per-dimension playbooks live in their own `<topic>.md`. **No code blocks longer than ~5 lines in `SKILL.md` unless the code IS the rule** (a 1-2 line idiom that defines a contract is fine; a 30-line skeleton is not). If you find rule content in a catalog file (or vice versa), it is drift — fix it.

## <Architecture map | Storage location map | Decision tree>

<!--
Pick the project-signature device that fits the domain:

- **Architecture map** (table: Layer | Path | Responsibility) when the skill
  describes a system with several layers. Example: api-testing/SKILL.md.
- **Storage location map** (table: Kind of data | Lives in | Owner pattern |
  Example) when the skill is about *where* things go. Example: data-strategy.
- **Decision tree** (mermaid flowchart) when the skill picks between several
  patterns based on inputs. Example: data-strategy decision tree, selectors
  decision tree.

You can include more than one. The hook flags missing signature devices.
-->

## Workflow — <verb the artifact>

<!--
REQUIRED for skills that produce or modify artifacts. SKIP for pure
diagnostic / decision skills.

Pick a body pattern from references/patterns.md (Workflow checklist /
Examples / Conditional / Feedback loop). Combine when useful.

For multi-step procedures, lead with a fenced-code numbered checklist, then
expand each step under an H3.
-->

Follow these steps in order. Stop at any step where the artifact already exists; reuse over duplication.

```
- [ ] 1. <First step — usually a precondition check / search-before-creating>
- [ ] 2. <Second step>
- [ ] 3. <Third step>
- [ ] N. <Last step — usually verification or cross-link>
```

### Step 1: <Title>

<!-- Imperative mood. Show the smallest example that makes the step concrete. -->

### Step 2: <Title>

...

## Anti-patterns

<!--
REQUIRED. Bulleted ❌ list of mistakes that real authors hit (or would hit
without this skill). Each anti-pattern names the fix.

Drawn from real incidents in this codebase or in skills that ship into it —
not theory. The Tier 1 audit caught 11 categories of drift; mirror that
specificity.

Format: ❌ **<short title>.** <One sentence on what it looks like and why
it's wrong.> <One sentence naming the fix and pointing at the right
section / sibling skill.>
-->

- ❌ **<anti-pattern 1>.** <What it looks like.> <Fix and routing.>
- ❌ **<anti-pattern 2>.** <What it looks like.> <Fix and routing.>
- ... (5+ total)

## Self-review checklist

<!--
REQUIRED. Checkboxes the model walks through before declaring the task done.
High-level — the deep checklist for skill-creator itself lives in its own
references/checklist.md. For domain skills, this is the operational checklist
for the artifact under construction.

Cover the load-bearing items: presence of structural sections, naming, link
verification, drift triggers absent, tests pass, linter clean.
-->

- [ ] <check 1>
- [ ] <check 2>
- [ ] <check 3>
- ... (8+ total)

## Examples

<!--
REQUIRED. 2-3 worked walkthroughs that cite the workflow steps.

Use REAL codebase names — never placeholders. The Tier 1 audit caught skills
using `MyResource` / `<resource>` placeholders; the model extrapolates better
from real names (`synthetics`, `probes`, `adminTenants`, `SyntheticsPage`,
`schema-field-monitorName`, etc.).

Each example should:
1. Open with a quoted user request
2. Walk the workflow steps that apply
3. Show what the output looks like (or links to where it would land)
-->

### Example 1 — <real-domain task>

User says: *"<realistic user request>"*

1. **<Step name>** — <what to do>
2. **<Step name>** — <what to do>
3. ...

### Example 2 — <real-domain task>

...

### Example 3 — <real-domain task>

...

## Troubleshooting

<!--
REQUIRED. Symptom → cause → fix table. Lists real failure modes a future
author will hit while applying this skill.

The Troubleshooting section catches issues the Workflow / Anti-patterns
sections don't address: things that go wrong AFTER the author tried to
follow the rules.

Each row should be specific enough to be searchable — generic
"investigate the issue" is not a fix.
-->

| Symptom | Cause | Fix |
|---------|-------|-----|
| <specific failure message or behavior> | <root cause> | <concrete remediation, link to section / sibling skill> |
| <…> | <…> | <…> |
| <…> | <…> | <…> |

## See Also

<!--
REQUIRED. Cross-skill links. Must be VERIFIED:
- Sibling skills must exist as populated SKILL.md (not TBD placeholder
  folders). Mark TBD ones as *(TBD)* with a fallback note.
- The cross-reference is BIDIRECTIONAL — when you cite a sibling skill here,
  update that sibling's See Also to mention this skill back.
- The paired rule (if any) is named explicitly. If no paired rule, write
  "(none)" so the absence is intentional.

Cluster siblings (pick the cluster from skill-creator Phase 2):
- API authoring: scaffold-spec, api-testing, data-strategy, helpers, fixtures, type-safety
- UI authoring: scaffold-spec, selectors, page-objects, playwright-cli, frontend-cross-check, enums, fixtures
- Domain orientation: master-context, metrics-api-tests-context, test-case-generation
- Failure investigation: debugging, playwright-cli, frontend-cross-check
- Repo hygiene: refactor-values, skill-creator, ai-native-workflow
-->

- **Paired rule:** [.cursor/rules/<rule>.mdc](../../rules/<rule>.mdc) — non-negotiable invariants for this domain. <!-- Or: "No paired rule (skill-only)." -->
- **Sibling cluster (<cluster name>):** [`<sibling-1>`](../<sibling-1>/SKILL.md), [`<sibling-2>`](../<sibling-2>/SKILL.md), [`<sibling-3>`](../<sibling-3>/SKILL.md).
- **Orchestration:** [`docs/cursor-skills-orchestration.md`](../../../docs/cursor-skills-orchestration.md) §6.4 cross-reference matrix.
- **Companion plan:** [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) §<N>. <!-- Delete if no plan section applies. -->
- **Orchestrator:** [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Routed Detail Index lists this skill.
