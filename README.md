# AI-Native QA Toolkit

A governance layer for AI-assisted quality engineering: **26 on-demand skills** and a written engineering constitution that define what "done" means *before* an agent writes a line of test code.

Built for [Claude Code](https://claude.com/claude-code); the skills are plain Markdown and port to any agent harness that supports on-demand instruction loading.

---

## The problem this solves

An agent with no rules does not save time. It produces confidently wrong code and tests that pass while proving nothing — and it does so faster than a human can review. Speed without governance ships the defect sooner.

So the interesting question is not *how do we get AI to write tests*. It is **what has to be true before we trust the output.** That is what this repository answers.

## See it work — one requirement traced to a passing test

Before reading 16,000 lines of rules, read the **[worked example](examples/README.md)**. A real feature built through the full loop: 14 requirements → 29 documented test cases → 66 tasks → 49 passing tests, with one security requirement traced end to end from a single sentence in the spec to six named, green tests.

The short version of why it matters: `FR-009` said a user must not learn that another user's record exists. That became a documented decision to return `404` rather than `403`, which is now mechanically verifiable in the API contract — `openapi.yaml` documents `404` on every affected operation and contains **zero** occurrences of `403`. One sentence, one decision, six tests, all greppable.

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

## Does it work? Measured, not asserted

The toolkit argues that AI output must be proven rather than asserted, so the skills were measured the same way — three times, with the method itself corrected between runs.

**The metric that finally worked is a machine one.** Both arms generate a real `.ts` file from an identical prompt; the score is the violation count from `eslint-plugin-qa-constitution`. No rubric, no LLM grader, no grader variance. The prompts deliberately withhold the fixtures-barrel path and the tag whitelist, because whether the skill transmits house conventions is the thing being measured.

| Task | Baseline | With skill |
|---|---:|---:|
| API endpoint spec | **12** | **0** |
| Settings page object | **2** | **0** |
| Four-call lifecycle spec | **3** | **0** |
| **Total** | **17** violations / 416 lines | **0** violations / 742 lines |

The skill arm produced 78% more code and broke no rule. The baseline invented a tag that does not exist in the whitelist, put JSDoc on locator getters, used `try`/`catch` in a test body, and left a test untagged — conventions it had no way to know.

**The earlier runs found no lift, and that result stands as published.** Two LLM-graded runs over 45 written expectations tied at 40/45, because most of those expectations measured general competence rather than house convention. Run 2 also caught a real content defect in `selectors` — it was reaching for `data-testid` against its own priority hierarchy — which is fixed and documented.

**The harness was wrong six times before it was right.** The first pass of run 3 reported the skill arm as *worse*; every extra finding turned out to be a defect in the linter or the eval config, not in the skill. The most consequential: five "discarded schema parse" findings were `expect.soft(Schema.parse(body), label).toBeTruthy()` — the correct form for a negative-case loop. Published as first reported, this repository would have claimed authoritatively that its own skill violates the rule it exists to enforce. What prevented that is a metric which names a file and a line, and a line that said the opposite when opened. **A report is not evidence; the line is.** All six defects are fixed and locked in with regression suites.

Full per-case detail, every defect, and the remaining work: **[BENCHMARK.md](BENCHMARK.md)**. Machine-readable results at `.claude/skills/<skill>/evals/`.

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

## Self-validation

```bash
npm run validate
```

Zero dependencies, so it runs on a fresh clone before anything is installed. Nine checks:

| # | Check | Why it is here |
|---|---|---|
| 1 | Every skill has a parseable `SKILL.md` with `name` matching its folder, a non-empty `description` under 1024 chars, a semver `version`, and a canonical `metadata.category` | 16 skills were missing `metadata.category` and 5 more carried a non-canonical one — 21 of 28, and nothing noticed |
| 2 | No duplicate skill names | |
| 3 | All six required sections present (`Critical`, `Anti-patterns`, `Self-review checklist`, `Examples`, `Troubleshooting`, `See Also`) | |
| 4 | `mcp.json` is valid JSON, BOM-free, every server has a `command` or `url`, and no literal secret sits in `env` | |
| 5 | `.cursor/rules/*.mdc` have front matter with a `description` unless `alwaysApply: true` | |
| 6 | `.cursorignore` exists and excludes `node_modules` and `.env` | |
| 7 | **Stated numbers match recomputed facts**, in `README.md`, `BENCHMARK.md` and `GOVERNANCE.md` alike — skills, commands, lint rules, rule suites, invalid-case assertions, measured-skill coverage with its denominator, over-length skills, this script's own check count, and every repo-relative link | The README claimed 25 skills while 28 shipped. Then, in one day, it drifted on eight more numbers — including a coverage denominator of 28 in a repository shipping 26 |
| 8 | **Every script the docs link to actually exists** | `skill-creator` asserted a `postToolUse` validation hook at `.cursor/hooks/skill-validate.py` for months. That file never existed, so nothing was validated — which is how checks 1 and 7 came to fail silently |
| 9 | **Governance artifacts exist and bind** — `GOVERNANCE.md` is present, every `### Phase` in it states both an `**Exit:**` and a `**Stop:**` criterion, `CODEOWNERS` routes skills, the plugin and the scripts to a named owner, and the PR template exists | A rollout phase with no exit criterion advances on whoever is most confident that day, and one with no stop criterion cannot be rolled back |

Errors fail the run; warnings never do. First run on this repository: **24 errors, 17 warnings.** Now: **0 errors.**

What closing that gap involved, because none of it was cosmetic:

- Sixteen skills had no `metadata.category` and five carried a non-canonical one (`workflow` is not in the set). Mechanical, fixed.
- `scaffold-spec` was not missing content at all — it had `Checklist`, `Incorrect Usage` and `Edge Cases & Gotchas`, which are three required sections under non-canonical headings. Renamed, then `Critical`, `Examples` and `See Also` written.
- `data-strategy` and `k6-load-testing` genuinely lacked sections; they are written. `k6` also went from 412 lines to 334 by moving four catalogs into a `reference.md`, which fixed the length warning at the same time.
- The validator supports **declared exemptions, never silent ones.** A skill that is genuinely a catalog (a folder map, a test-id inventory) or a pointer into another project may declare `metadata.structure: catalog|pointer`. It is still required to carry `See Also`, must state in its body why the full structure does not apply, and is **listed in every validation run** so the exemption cannot hide. The two skills using it in the internal toolkit are client-specific and are not shipped here.
- The validator found two bugs in itself along the way: it read `description: >-` as the literal two-character value `>-` and reported a good three-line description as "only 2 chars", and it needed to be pointed at the synced repo copy rather than the live `~/.claude/skills`.

Now that it is green it runs in CI as a **blocking** gate (`.github/workflows/validate.yml`), alongside the plugin's 21 rule suites, the fault-injection harness, and two smoke tests — one asserting that a deliberately non-compliant fixture is still rejected, the other that a compliant one still passes clean. A gate is only worth wiring once it is green — one that is red on arrival gets disabled within a week.

## Skill versions and regression tracking

Every skill declares a `version` in its front matter, and the meaning of a bump is fixed:

| Bump | Means |
|---|---|
| **major** | a rule changes meaning or is removed — output that was previously correct may now be wrong |
| **minor** | a rule or section is added — nothing previously correct becomes incorrect |
| **patch** | wording, examples, cross-references — no rule changes |

Skills that have been measured carry an append-only `evals/history.json`: one entry per version per metric, with the score, the baseline arm's score in the same run, and a note on what changed.

```bash
npm run eval:compare
```

Compares the two most recent entries for each metric and reports **IMPROVED / REGRESSION / WITHIN NOISE / FIRST RUN**. It exits non-zero only on a regression that clears the noise floor, so it can gate a merge.

Two things it deliberately refuses to do, both learned from getting them wrong:

- **It will not call a small delta an improvement.** When `selectors` moved 12 → 13 after a fix, the *baseline* arm also moved 14 → 15 with nothing changed on its side. At two cases, ±1 is run-to-run variance. The noise floor is ±2 below three cases, ±1 below five, and 0 at five or more — so that result reads `WITHIN NOISE`, which is what it is.
- **It will not assume a direction.** `expectations-met` improves upward; `lint-gate-violations` improves downward. Each metric declares its own direction, because hardcoding one silently inverts the verdict for the other.

It also reports which skills are measured **only** by LLM rubric and have no machine metric yet — those rubrics tied twice and are known to measure general competence rather than house convention, so a score from them should not be cited as evidence the skill works.

Verified by fault injection rather than assumption: a 13 → 6 drop across six cases is reported as `REGRESSION` and exits 1; the same direction at −1 across two cases is reported as `WITHIN NOISE` and exits 0; and a version in `SKILL.md` that disagrees with the newest history entry is reported as a bookkeeping problem.

`npm run check:bump` is the advisory companion — it warns when a `SKILL.md` changed against the base ref while its `version` did not. Never blocking: failing CI over a forgotten patch bump trains people to bump meaninglessly. What it prevents is the version quietly ceasing to describe the file, which is the point at which eval history starts to lie.

**Current coverage: 3 of 26 skills have recorded history.** That is the honest limit on any claim about the toolkit as a whole.

## Enforcement — the rules a pipeline can refuse to merge

Everything above is prose an agent is asked to follow. **[`eslint-plugin-qa-constitution/`](eslint-plugin-qa-constitution/)** is the half a CI job can enforce: **16 ESLint rules** derived from the MUST and WON'T tables plus the Definition of Done's false-green clause.

| Enforced mechanically | Stays a review responsibility |
|---|---|
| Fixtures-barrel imports · page-object injection · exactly one whitelisted tag · `z.strictObject` · the `expect(Schema.parse(body)).toBeTruthy()` idiom · `process.env.X!` · no XPath · no hard waits · no `page.evaluate` · no conditionals or `test.skip` in a test body · no `try`/`catch` in tests · no `.not.toThrow()` · no JSDoc on locator getters · no commented-out test without a ticket · **no test without an assertion** · **no empty catch anywhere** | Selector priority (needs the real DOM) · coverage-plan completeness · cleanup adequacy · explore-before-generate · search-before-creating · secret detection (use a secret scanner) · whether the tests were actually run (a CI fact) |

Roughly half the constitution is mechanically checkable. The plugin claims exactly that half and says so — a linter that claims more than it checks is worse than none.

```yaml
- name: QA constitution
  run: npx eslint "tests/**/*.ts" "pages/**/*.ts" --max-warnings 0
```

Pair it with branch protection and a violation blocks the merge instead of annotating it. **Governance without an enforcement mechanism is advice.**

The rules ship with 21 `RuleTester` suites and 40 invalid-case assertions. That proves each rule reports on a string of source handed straight to it, which is a weaker claim than it sounds: it says nothing about whether the rule still fires through the real ESLint CLI, on a real file, with the other fifteen rules loaded alongside it.

So the claim is now asserted rather than stated. `tests/fault-injection.test.mjs` runs on every push and makes three assertions per rule:

| | Assertion | Why it is not redundant |
|---|---|---|
| 1 | **Bites** — lint the known-bad tree with only this rule on, expect ≥ 1 error | The rule works end to end, not just in a unit harness |
| 2 | **Silent** — lint the compliant tree with only this rule on, expect exactly 0 | The one that decides whether anyone leaves the gate switched on |
| 3 | **Attributed** — lint the bad tree again with the rule's visitor emptied, expect exactly 0 | Assertion 1 alone passes for the wrong reason if a parse error or a leaked config produced the message |

All 16 rules pass all three. A rule with no fixture case **fails** here rather than being skipped, so a new rule cannot land without something to catch and something to leave alone.

**It found a defect on its first run** — the third in one rule, and the same root cause each time. `schema-parse-idiom` reported `Project.parse(body).id`, a parse whose field is read on the spot and therefore not discarded at all. The rule had been written as an allowlist of accepted parent node types, so every shape of *using* a parsed value that its author had not enumerated read as *discarding* it. It now asks the question it actually means — is this value read by nobody? — with the house idiom on `.toBeTruthy()` split into its own message so nothing was traded away. Assertion 2 is in the harness because of exactly this: five of the six defects in the eval harness were also rules firing on correct code, and a rule that cries wolf gets the whole gate turned off within a week.

The harness is verified the same way it verifies the rules. Neuter a rule and it reports `NO BITE` and exits 1; add a violation to the compliant tree and it reports `FALSE +` and exits 1; delete a fixture tree and it fails hard rather than passing an empty run.

## Product-side constitutions (web + mobile)

The skills govern how *tests* are written. Two further constitutions govern how the *application* is written, so those tests can exist at all — the shift-left half of the same contract:

| File | Stack | Framework | Locator contract |
|---|---|---|---|
| `.claude/constitutions/web-testability.md` | Web frontend (HTML / React) | Playwright | Semantic roles and labels first, kebab-case `data-testid` as fail-safe |
| `.claude/constitutions/mobile-testability.md` | Flutter | LeanCode Patrol | Centralised `Key`s — never visible or localised text |

Drop the matching file into the **product** repo as its `CLAUDE.md`. The coding agent building the UI is then held to the locator contract at authoring time, instead of QA discovering an unaddressable component after merge. Both encode the same four ideas in their own idiom: nothing user-reachable may be unaddressable; never key on anything cosmetic; every collection row keyed on a business ID and never a loop index; loading, empty and error states first-class and addressable.

See `.claude/constitutions/README.md`.

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
