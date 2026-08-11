# Quality checklist

The shipping gate for any new (or refactored) skill in this repo. Run all sections before merging. The `postToolUse` hook ([.cursor/hooks/skill-validate.py](../../../hooks/skill-validate.py)) enforces the structural items it can on every save (frontmatter, length, signature device); the rest is human (or subagent) review.

This checklist gates on the **standardized SKILL.md structure** mandated by skill-creator. Every section is required (or marked "(when applicable)"). Skills authored before this standardization are TBD-tracked separately and migrate during their next legitimate edit.

## Contents

- [1. Hook-enforced (automatic on save)](#1-hook-enforced-automatic-on-save)
- [2. Frontmatter (manual review)](#2-frontmatter-manual-review)
- [3. Required sections (manual review)](#3-required-sections-manual-review)
- [4. Body quality (manual review)](#4-body-quality-manual-review)
- [5. Drift-trigger absence (manual review)](#5-drift-trigger-absence-manual-review)
- [6. Cross-reference verification (manual review)](#6-cross-reference-verification-manual-review)
- [7. Project fit (manual review)](#7-project-fit-manual-review)
- [8. Discoverability (subagent test, unless `disable-model-invocation: true`)](#8-discoverability-subagent-test-unless-disable-model-invocation-true)
- [9. Pre-merge](#9-pre-merge)

---

## 1. Hook-enforced (automatic on save)

These run on every `Write` / `StrReplace` into `~/.claude/skills/**/*.md`. The hook reports errors as `additional_context` to the agent in the same turn.

- [ ] `name` field present, lowercase + hyphens, ≤ 64 chars, equals folder name, no `anthropic`/`claude`, no XML angle brackets.
- [ ] `description` field present, ≤ 1024 chars.
- [ ] `metadata.category` is one of `authoring | running | domain | cross-cutting`.
- [ ] YAML frontmatter parses.
- [ ] `SKILL.md` body ≤ 500 lines (Anthropic ceiling); ≤ 380 lines is the project guideline (warning above 380).
- [ ] Reference files > 100 lines start with a `## Contents` block.
- [ ] No Windows-style backslash paths.
- [ ] `references/` exactly one level deep — no `references/foo/bar.md`.
- [ ] At least one signature device present (table / mermaid / numbered checklist).

If any item here fails, the hook surfaces the diff inline. Fix and re-save.

---

## 2. Frontmatter (manual review)

The hook validates structure; the human validates *content*.

- [ ] **WHAT + WHEN both visible** in the description's first 2 sentences.
- [ ] **3-7 quoted trigger phrases** in the description (`"phrase 1"`, `"phrase 2"`, …).
- [ ] **"Do NOT use for X (use the `<other>` skill)" disclaimers** present at the end of the description — 2–4 of them, naming adjacent intents that route elsewhere. Without these, the skill catches false positives on adjacent tasks (Tier 1 audit caught this pattern repeatedly).
- [ ] **Pushy verb** ("Use when…", "Reach for this when…", "Apply this skill if…"). Passive ("This skill helps with X") undertriggers.
- [ ] **Third person**. Not "you" or "we" or "I".
- [ ] **No time-sensitive language** ("currently", "as of now", "recently") outside an explicit `<details>` block. Skills outlive the moment of authoring.
- [ ] **`metadata.category` set** — `authoring`, `running`, `domain`, or `cross-cutting`.
- [ ] **`disable-model-invocation: true`** if and only if the skill is manual-only (`/<skill-name>` invocation).

---

## 3. Required sections (manual review)

The standardized SKILL.md structure mandates every section below. The hook does not yet enforce section presence — manual review is the gate. Skills missing any section are not ready to ship.

- [ ] **Opener** — one paragraph, paired-rule callout (or "(none)" explicitly), companion-plan citation if applicable.
- [ ] **`## Critical`** block at top — 5–9 hard rules in `**ALWAYS**` / `**NEVER**` form. Each rule enforceable, not aspirational. Drawn from real incidents.
- [ ] **`## What's in each file`** table when the skill has supplementary files (`reference.md`, `templates.md`, `<topic>.md`, `assets/`). Skip when single-file.
- [ ] **Workflow / phases / decision tables / architecture map** — the skill's substance. Use one or more body patterns from [`patterns.md`](patterns.md).
- [ ] **`## Anti-patterns`** with bulleted ❌ list. Each anti-pattern names the fix.
- [ ] **`## Self-review checklist`** with checkboxes the model walks through.
- [ ] **`## Examples`** — 2–3 worked walkthroughs using REAL codebase names (no placeholders like `<resource>`, `MyResource`).
- [ ] **`## Troubleshooting`** — symptom → cause → fix table, listing real failure modes.
- [ ] **`## See Also`** — paired rule, sibling cluster, orchestration doc, identity, companion plan.

---

## 4. Body quality (manual review)

Anthropic + Cursor fundamentals the hook can't catch.

- [ ] **Concise** — no filler ("This skill helps you…", "In this section we will…").
- [ ] **Imperative body** — "Open the file", "Run the test", not "You should open" or "We open".
- [ ] **Right freedom level** — High (judgment) / Medium (template) / Low (fragile script). Match the body shape to the freedom level.
- [ ] **Why behind rules** — explain *why* important, not just "ALWAYS X". Heavy-handed MUSTs without reasoning age badly.
- [ ] **Naming** — gerund or compound-noun, not vague (`utils`, `helper`, `tools`).
- [ ] **No anti-patterns from skill-creator** — no "voodoo constants", no "punt to Claude", no time-sensitive language outside `<details>`.
- [ ] **Boundary discipline** — no code blocks > 5 lines in `SKILL.md` unless the code IS the rule (a 1–2 line idiom that defines a contract is fine; a 30-line skeleton is not). Long skeletons live in `templates.md`; long catalogs live in `reference.md`.

---

## 5. Drift-trigger absence (manual review)

Specific drift categories the Tier 1 audit caught. Every code example, every claim about the codebase, every cross-reference must be verified. These checks are the difference between "ships immediately" and "needs a rewrite in 3 weeks".

- [ ] **No `Zod 4` syntax** (`z.uuid()`, `z.email()`, `z.url()`, `z.int()` top-level forms) when the codebase is Zod 3 (`^3.x.x`). Use chained forms (`z.string().uuid()`).
- [ ] **No `field-field-` testid prefix** in any code example. The frontend emits `schema-field-<fieldName>` (verified at `src/components/schema-form/schema-form.tsx:100`).
- [ ] **No bare `process.env.X` propagation** in code examples. Canonical access is `process.env.X!` (matches upstream reference framework). Defaults belong in `config/util/<service>.ts`, not at call sites.
- [ ] **No `??` / `||` defaulting at call sites** in helpers / specs / fixtures / pages. Allowed only inside `playwright.config.ts` at the config boundary.
- [ ] **No `as string` casts on `process.env.X`** — lies to TypeScript, masks missing vars.
- [ ] **No `z.object()` for new schemas** — use `z.strictObject()`. Existing `z.object` is legacy drift; do not perpetuate.
- [ ] **No `z.any()`** to silence ZodError on `Schema.parse(body)`. Real divergences: comment out the test with `// TODO: FIXME: <TICKET>` (api-testing § Skipping). Never `test.skip` — corrupts Qase IDs.
- [ ] **No XPath selectors** in any UI code example.
- [ ] **No `page.waitForTimeout(...)`** in test code examples.
- [ ] **No `try/catch` wrapping `expect()`** — except for the cleanup-only exception documented in `api-testing` skill.
- [ ] **No `npx playwright codegen`** as a substitute for `npx playwright open` in exploration workflow code.
- [ ] **No camelCase filenames in `helpers/` examples for NEW files** — kebab-case canonical (`admin-tenants.ts`, not `adminTenants.ts`). Existing camelCase is legacy drift; mark as "fix on next touch".
- [ ] **Every codebase claim verified by grep / ls / cat** — file paths, helper names, testid prefixes, env vars, npm scripts, schema names. Wrong claims produce models that generate broken code.

---

## 6. Cross-reference verification (manual review)

One-way and stale cross-references were the #1 source of audit churn in Tier 1.

- [ ] **`See Also` lists exist** — each cited skill has a populated `SKILL.md` (not an empty placeholder folder).
- [ ] **TBD references explicit** — when a sibling skill is intentionally not yet authored, its mention carries `*(TBD)*` and a fallback note.
- [ ] **Bidirectional cross-references** — when this skill cites a sibling, that sibling's `See Also` mentions this skill back (when relevant). Update both in the same edit.
- [ ] **Paired rule cited** — explicit link if it exists, "(none)" if not. No omission.
- [ ] **No broken markdown links** — every `[text](path)` resolves to a real file. Use `ls`, `cat`, or `Read` to verify.
- [ ] **`~/.claude/CLAUDE.md § Routed Detail Index` updated** in the same edit batch when adding, renaming, or removing a skill. The orchestrator's index is the live route map (and the only human-readable index — `project-identity.mdc` was retired in favor of consolidating into `~/.claude/CLAUDE.md`).
- [ ] **`docs/cursor-skills-orchestration.md § 6.2.2`** row updated if a previously-empty placeholder is now populated, or if cluster relationships changed (also update §6.4 matrix).
- [ ] **Cluster siblings' `See Also` updated** when this skill belongs to a cluster — the existing siblings should mention this skill in their `See Also` so the cluster is internally connected.

---

## 7. Project fit (manual review)

The marks that distinguish a skill that "fits this repo" from a generic skill.

- [ ] **Signature device** — at least one of: architecture map (table), storage location map (table), decision tree (mermaid), pattern catalog (numbered). Mirror `scaffold-spec` / `data-strategy` / `api-testing`.
- [ ] **Opener** answers "what does this skill cover, what's the failure mode it prevents". One paragraph max.
- [ ] **Paired-rule callout** — if a paired glob rule exists, opener says "Read that rule first" and links it. If no paired rule, `## See Also` says `(none)` explicitly.
- [ ] **Companion-plan citation** — if the skill describes work in flight, cite the relevant `docs/framework-alignment-plan.md` section by number.
- [ ] **Cluster fit** — skill belongs to one of the five named clusters (API authoring / UI authoring / domain orientation / failure investigation / repo hygiene); at least one cluster sibling is cross-linked.
- [ ] **Visible in Settings → Rules & Memories → "Agent Decides"** after Cursor reload (skip when `disable-model-invocation: true`).

---

## 8. Discoverability (subagent test, unless `disable-model-invocation: true`)

Skip this section entirely for manual-only skills (`disable-model-invocation: true`). For everything else, run the subagent test from [SKILL.md Phase 6](../SKILL.md#phase-6-test-via-subagent).

- [ ] Authored 3 prompts: direct trigger, paraphrased trigger, negative case.
- [ ] Spawned 3 `generalPurpose` readonly subagents in parallel with the test prompt template.
- [ ] **Direct prompt** → subagent reports `new_skill_status: "selected"`.
- [ ] **Paraphrased prompt** → subagent reports `selected`.
- [ ] **Negative prompt** → subagent reports `not_selected` (no false positive).
- [ ] Output quality (run prompt 1 in a fresh chat without `readonly`): result matches the project signature shape and cites the paired rule.

If direct fails: description fundamentally broken (rewrite from scratch).
If paraphrased fails: trigger phrases too narrow (broaden, add 2-3 more).
If negative trips: scope too wide OR missing "Do NOT use for X" disclaimers (tighten the WHEN clause, add disclaimers).
If output drifts: body content thin (extend with more workflow / examples per `patterns.md`).

---

## 9. Pre-merge

- [ ] Hook reports zero errors on the latest save (re-trigger by saving any skill file).
- [ ] `git status` shows only intended new files; no stray edits.
- [ ] PR description names the skill, the cluster, and the three subagent test outcomes.
- [ ] If a paired rule was added: ≤ 120 lines, glob-attached, invariants only (no workflows).
- [ ] If a placeholder folder is now populated: orchestration doc §6.2.2 row updated in the same PR.
- [ ] Branch off main; commit message follows existing repo convention.

When all sections pass, the skill is ready to merge.
