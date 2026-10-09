# Contributing

Thanks for looking. This repository is a **governance layer**, not an app — a constitution plus on-demand skills that steer an AI coding agent through QA work. So "contributing" here means changing *rules and the instruments that enforce them*, and the bar is set accordingly: a bad rule, merged, teaches every future session to write bad tests. Read this once before your first PR.

The law of the repository is [`GOVERNANCE.md`](GOVERNANCE.md). Where this file and `GOVERNANCE.md` disagree, `GOVERNANCE.md` wins.

## What lives here, and how it ranks

Precedence, highest first — a lower layer may extend a higher one but never contradict it:

1. **`.claude/CLAUDE.md`** — the constitution. One file, always loaded, every session. A change here changes every session in the org.
2. **`.claude/skills/*/SKILL.md`** — the 30 on-demand skills. Deep how-to that loads only when its trigger fires.
3. **The enforcement layer** — `eslint-plugin-qa-constitution/` (the checkable half of the rules) and `scripts/` (the validators). These are measuring instruments; every defect found in this project so far was in one of them, not in the thing being measured, so they get the same scrutiny as the rules.

## Setup

```bash
git clone https://github.com/georgikazandzhiev-code/ai-native-qa-toolkit
cd ai-native-qa-toolkit
npm install            # only needed for the lint plugin's dev deps
npm run validate       # structure, counts, stamps, cross-references — must be 0 errors
```

`npm run validate` has **zero runtime dependencies on purpose** — it runs on a fresh clone before anything is installed. `npm install` is only for the ESLint plugin's test suite.

## The one rule that shapes every PR

**One logical change per PR** (`GOVERNANCE.md` § One logical change per PR). A PR that adds a skill *and* fixes three unrelated typos *and* bumps a lint rule is three PRs. The only exception is a set of changes that genuinely cannot pass CI on their own (e.g. a validator check and the fix that makes the tree pass it). The [pull-request template](.github/pull_request_template.md) encodes the rest — fill it in; it is a checklist, not decoration.

## Before you open a PR — run the gates

CI runs all of these; running them locally first is faster than a round trip. All must be green.

| Command | What it guards |
|---------|----------------|
| `npm run validate` | Structure, skill counts, version stamps, cross-references, rule ownership — 0 errors |
| `npm run test:rules-owned` | Every constitution rule is routed to a skill that carries it |
| `npm run test:xref` | Files that point at each other agree |
| `npm run test:stamp` · `npm run test:bump` | A stale version stamp / a forgotten bump cannot pass |
| `npm run test:lock` | Vendored provenance is intact |
| `npm run test:alternatives` · `npm run test:der` | The hooks and gates bite on the bad case and stay silent on the good one |
| `node eslint-plugin-qa-constitution/tests/rules.test.js` | *(if you touched a lint rule)* every rule has a `RuleTester` suite |
| `node eslint-plugin-qa-constitution/tests/fault-injection.test.mjs` | *(if you touched a lint rule)* every rule actually bites — and nothing cries wolf |
| `npm run eval:compare` | No eval regression beyond the noise floor |

## Change classes and versioning

Pick the class by **what happens to output that was previously correct**, not by line count (`GOVERNANCE.md` § Change classes):

- **patch** — wording, examples, cross-references. No rule changed meaning.
- **minor** — a rule or section was added. Nothing previously correct becomes incorrect.
- **major** — a rule changed meaning or was removed. Output that was correct may now be wrong. **A major on a skill with eval history owes a re-measurement**, committed as the `evals/history.json` entry, in the same PR.

Bump the `version:` in every `SKILL.md` whose rules changed. A **new skill** or a structural change bumps the toolkit `VERSION` (and the stamps `npm run stamp` writes); `npm run test:stamp` fails otherwise.

## Adding or changing a skill

A skill is authored to a fixed contract — read the [`skill-creator`](.claude/skills/skill-creator/SKILL.md) skill first; it owns the structure. In short, a new skill needs all of:

- `.claude/skills/<name>/SKILL.md` — front matter (`name` = folder, `version`, a `description` with trigger phrases **and** a `Do NOT use for …` disclaimer, under 1024 chars; `metadata.category` ∈ `authoring | running | domain | cross-cutting`), the six required sections (`## Critical`, `## Anti-patterns`, `## Self-review checklist`, `## Examples`, `## Troubleshooting`, `## See Also`), and ≤ 380 lines (split a large catalog into a `reference.md`).
- A **routing row** in `.claude/CLAUDE.md § Routed Skill Index` — `npm run validate` fails if a skill on disk is not routed.
- The **skill-count** updated in `GOVERNANCE.md` and `README.md` (total, the category breakdown, and the `3 of N` coverage denominator), cross-checked by validator check 7.
- If the skill carries a **constitution rule**, a `RULE_OWNERS` entry in `scripts/validate.mjs`. A rule-free (skill-only) skill needs none.

## Evidence discipline — the house style

Every claim in a skill, a doc, or a PR is labelled by how it is known:

- **EXECUTED** — you ran it; attach the command and its output.
- **STATIC** — read from a file (a schema, a config, a lockfile); name the source.
- **INFERRED** — reasoned, not run; never written in the voice of verified fact.

A number stated in prose must either be recomputed by a validator check or labelled in its own sentence as an estimate. "3 of 30 skills have recorded history" is the honest limit on this toolkit; do not inflate it.

## Two hard lines

- **No client, employer, or product specifics.** Examples use the invented scheduled-jobs domain (`GOVERNANCE.md` § Example domain). No real product name, internal host, ticket key, or token — the final checklist item on every PR, and a leak audit enforces it on the path to the public mirror.
- **Hooks and `settings.json` run on every adopter's machine.** A change under `.claude/hooks/` or to `.claude/settings.json` changes what an agent may do without being asked. These carry `CODEOWNERS` review for that reason.

## Honest limits

- **One maintainer.** [`CODEOWNERS`](.github/CODEOWNERS) requests review; it becomes a *requirement* only behind a protected branch with "Require review from Code Owners" enabled, which only an admin can see. The CI checks on `main`, though, are publicly verifiable — that is the enforceable half.
- **The evals measure transmission, not truth.** They test whether a skill teaches the house style, not whether the house style is right. See `GOVERNANCE.md § What this document cannot enforce`.

## Licence

By contributing you agree your contribution is licensed under the repository's [MIT License](LICENSE).
