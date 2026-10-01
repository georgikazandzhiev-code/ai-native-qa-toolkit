# Toolkit review — findings

> **Temporary file. Delete it before merging this PR, or right after.** It exists so the findings can be reviewed alongside the diff. Once the open items have tickets or follow-up PRs, it has no further use in the repo.

**Reviewer:** Ivaylo Ilchev · **Started:** 2026-09-30 · **Branch:** `ivaylo-changes` · **Last updated:** 2026-10-01 (second session)

This is a running log of what came up while reading the toolkit end to end, starting with `.claude/`. Each finding says what's wrong, where, why it matters, and its status. Contradictions and wrong statements are fixed directly on `ivaylo-changes` and marked **Fixed** with their commit. Items marked **Open** are design choices or new work, and they need your decision first.

Covered so far: `CLAUDE.md`, `commands/`, `memories/`, `constitutions/`, the routing skills (`common-tasks`, `ai-native-workflow`), and the framework-core skills (`test-standards`, `api-testing`, `type-safety`, `data-strategy`, `config`, `enums`, `selectors`, `page-objects`, `fixtures`, `helpers`, `refactor-values`), plus the files the fixes touched. For the framework-core skills, the Critical blocks were reviewed against the constitution and against each other. Their long reference and template files were only searched for known contradiction patterns. Still to review: exploration, effectiveness and risk, non-functional, and skill-authoring skills.

---

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | AC writer invents details that the requirement analyst forbids inventing | Medium | Fixed · `5c6459b` |
| 2 | Locator priority stated three different ways | High | Fixed · `4c7c5ea` |
| 3 | Table-row locator example contradicts the memory file | Medium | Fixed · `4c7c5ea` |
| 4 | `npm run test:memory` referenced but missing | Low | Fixed · `d3c45b5` |
| 5 | Validators fail on a clean Windows checkout (CRLF) | Medium | Fixed · `f818b4c` |
| 6 | Jira-writing commands can be triggered by the agent itself | Medium | Fixed · `5203f49` |
| 7 | `selectors` 2.0.0 needs re-measuring | — | Owed |
| 8 | Testability constitutions have no version stamp once copied | Low | Fixed · `8f0f861` |
| 9 | `name:` in command frontmatter is ignored | Low | Fixed · `5203f49` |
| 10 | No accessibility-testing skill | — | Added · `403a6de` |
| 11 | Skills teach `test.skip`, which the constitution forbids | High | Fixed · `e49acec` |
| 12 | `ai-native-workflow` is out of date with the repo | Medium | Fixed · `7297f8b` |
| 13 | Skills cite constitution sections that don't exist | Low | Fixed · `e1851ae`, `7297f8b` |
| 14 | `common-tasks` example contradicts its own tag-casing rule | Low | Fixed · `e1851ae` |
| 15 | Generic skills carry one project's layout, names and paths | High | Decided · follow-up PR planned |
| 16 | 416 links to files this repository has never contained | High | Fixed · `76a0b72` (and now caught by check 15) |
| 17 | AC writer's examples break its own keyword-casing rule | Low | Fixed · `5c6459b` |
| 18 | **Nothing kept cross-references in sync — the root cause of 12, 13 and 19** | High | Fixed · `de28998` (new validator check 15) |
| 19 | `skill-creator` points at an orchestration doc and index columns that don't exist | Low | Fixed · `de28998` |
| 20 | `npm run test:der` crashes on Windows with Node 24 | Medium | Fixed · `f57a1ca` |
| 21 | Two different tag whitelists (7 tags vs 4) | Medium | Fixed · `3e13ede` |
| 22 | `type-safety` still taught `test.skip` after finding 11 | High | Fixed · `3e13ede` |
| 23 | `api-testing` put route constants in `enums` | Low | Fixed · `3e13ede` |
| 24 | Two skills disagreed about where `try/catch` is allowed | Medium | Wording fixed · `3570abf`; alternative Open |
| 25 | `refactor-values` assumed the default branch is `master` | Low | Fixed · `3570abf` |
| 26 | No testability constitution for backend / API developers | Medium | Added · `09dc8f7` |
| 27 | `fixtures` claimed `afterEach` can be skipped when a test fails | Low | Fixed · `044cd07` |
| 28 | Six See Also entries still called written skills "(TBD)" | Medium | Fixed · `403a6de` (and now caught by check 15) |
| 29 | `skill-creator` described a validation hook that never existed, and required "real codebase names" in examples | Medium | Fixed · `76a0b72` |
| 30 | About 60 contradictions between skills, in 12 themes | High | Open · planned follow-up PR |
| 31 | No prerequisites anywhere; personas pointed at "install notes" that don't exist | Medium | Fixed · `af77f70` |
| 32 | How protected are the shared files? CI gate confirmed; code-owner review and agent-side locks unconfirmed | Medium | Partly fixed · needs owner action |

---

## 1. The AC writer and the requirement analyst disagreed about missing information — Fixed (`5c6459b`)

`.claude/commands/acceptance-criteria-writer.md` told the agent: "If details are missing from the input, make logical professional assumptions consistent with standard UI/UX patterns." `.claude/commands/requirement-analyst.md` says the opposite: "**Never invent UI specifics** not present in the requirement" and "**Never paper over a gap**."

**Why it mattered.** The two personas cover neighbouring stages of the same flow: story → ACs → review. The AC writer quietly filled gaps with plausible guesses that then read like confirmed requirements, which is exactly what the analyst exists to catch. By the time the analyst ran on the writer's output, the gaps were already hidden.

**Fix.** The AC writer can still draft from thin input, but it now tags every assumed detail inline as `[ASSUMPTION: …]` and ends with an "Assumptions to confirm" list for the PO. The analyst's Gate B now flags any unconfirmed `[ASSUMPTION]` tag and turns it into a clarifying question, so the two personas hand off to each other correctly.

---

## 2. Locator priority was stated three different ways — Fixed (`4c7c5ea`)

| Where | Order it stated |
|---|---|
| `CLAUDE.md`, `learned_patterns.md`, `selectors/evals/evals.json` | role > **text > label** > placeholder > alt > title > testid |
| `selectors`, `page-objects`, `pr-review` skills | role > label > placeholder > text > **testid > alt/title** > css |
| `skill-creator/references/patterns.md` | role > label > text > title > testid |

**Why it matters.** An agent following the constitution and an agent following the skill would rank the same element differently. `pr-review` could pass or fail the same locator depending on which file it trusted. The skills also ranked test-ids above alt/title while calling test-ids "the last resort."

**Fix.** Every file now states the Testing Library order, which matches every file's own "test-id is the last resort" wording:

`getByRole > getByLabel > getByPlaceholder > getByText > getByAltText > getByTitle > getByTestId > page.locator(css)`

The Radix exception is unchanged: a test-id can still move up to priority 4, just above `getByText`, per element only.

**Versions.** `selectors` 1.2.1 → 2.0.0, and `page-objects` and `pr-review` 1.0.0 → 2.0.0. The rank of alt/title versus test-id changed, which is a meaning change under `GOVERNANCE.md`. See finding 7.

---

## 3. The web testability example contradicted the memory file on table rows — Fixed (`4c7c5ea`)

The selector blueprint in `constitutions/web-testability.md` showed rows located with `getByTestId('ticket-row-9823')`. `learned_patterns.md` prescribes `getByRole('row').filter({ has: getByRole('cell', { name: id, exact: true }) })`, with the test-id only as a fallback.

**Fix.** The example now shows the role-based locator, and uses the test-id only when the ID isn't rendered in a cell. A sentence now explains that the product ships both hooks (semantic markup and a business-ID test-id) and the test picks the strongest one. The memory file's row test-id name now matches (`<entity>-row-<id>`).

A related point I checked is *not* a contradiction: the web constitution requires a `data-testid` on every interactive component, while the QA constitution ranks test-ids last. The product provides both, and the test chooses. The new sentence says so explicitly.

---

## 4. `npm run test:memory` was referenced but didn't exist — Fixed (`d3c45b5`)

`CLAUDE.md` tells every session that `npm run test:memory` lints the snippets in `learned_patterns.md`, but `package.json` had no such script, so running it gave "Missing script." CI wasn't affected, because it calls the test file directly.

**Fix.** Added the script. Like `test:rules` and `test:faults`, it needs the plugin's dev dependencies installed (`npm install` inside `eslint-plugin-qa-constitution/`). With them installed, the memory lint passes (2/2 snippets), and so do the rule tests and all 16 fault-injection cases.

A small onboarding note: `npm install` at the repo root installs nothing, because the root has no dependencies by design. Someone new can easily think they've installed the tooling when they haven't. It might be worth one line in the README.

---

## 5. Validators failed on a clean Windows checkout — Fixed (`f818b4c`)

With `core.autocrlf=true`, git checks text files out with CRLF. On a clean, unmodified tree:

- `npm run validate` failed check 12, because all 14 vendored `skill-creator` files hashed as "modified locally";
- `npm run test:rules-owned` failed 3 of 5 cases, because its `\n`-anchored patterns couldn't find the MUST/WON'T tables.

The repo content was fine. A fresh LF clone of the branch had `validate` at 0 errors, and rule-ownership, lock and stamp all passed, the same as Linux CI.

**Fix.** Added a `.gitattributes` with `* text=auto eol=lf`. Renormalizing changed no committed file. Local Windows results now match CI.

---

## 6. Jira-writing commands could be started by the agent itself — Fixed (`5203f49`)

In current Claude Code, commands and skills are merged, and the agent can start a command by itself, based on its description, unless the file sets `disable-model-invocation: true`. None of the four files in `.claude/commands/` set it.

**Why it mattered.** `bug-helper`, `test-case-helper` and `requirement-analyst` can post to Jira. Each asks for confirmation before writing, which is good, but that was the only safeguard, and the agent itself enforces it.

**Fix.** Those three now set `disable-model-invocation: true`, with a one-line comment saying why, so only a person can start them. That's a second safeguard, independent of the first. `acceptance-criteria-writer` only produces text, so the agent may still start it.

---

## 7. `selectors` 2.0.0 needs re-measuring — Owed

`GOVERNANCE.md` requires a re-measurement and an `evals/history.json` entry for a major bump. I couldn't run the eval harness, so `validate` now warns: "declares v2.0.0 but the newest eval history entry is v1.2.0." The practical change is small (label/placeholder above text in the constitution, alt/title above test-id in the skills), but under the governance rules the measurement is still owed.

---

## 8. The testability constitutions had no version stamp once copied — Fixed (`8f0f861`)

The `constitutions/` files are copied into product repos as their `CLAUDE.md`. Unlike `.claude/CLAUDE.md`, they carried no `toolkit-version` stamp, so once copied, nobody could tell which version of the testability rules a frontend or mobile repo had, or that it had fallen behind.

**Fix.** The existing stamping mechanism now covers them, rather than a new one being invented. `npm run stamp` writes the same `<!-- toolkit-version: x.y.z -->` line under their title, and check 14 in `npm run validate` fails if either is missing its stamp or disagrees with `VERSION`. `scripts/tests/version-stamp.test.mjs` has three new cases (agreeing stamps pass, a stale stamp fails, a missing stamp fails), and its idempotency case now covers a product constitution too. `constitutions/README.md` explains the stamp and asks anyone merging a file into an existing `CLAUDE.md` to keep the stamp line.

**Still open, as a follow-up.** `npm run audit` only scans repos that contain the toolkit's skills, so it doesn't report product repos yet. Now that the stamp exists, teaching the audit to read it from a product repo's `CLAUDE.md` is a small next step. The larger option from the original proposal, distributing the constitutions as a versioned package or Claude Code plugin, stays a discussion point.

---

## 9. `name:` in command frontmatter was ignored — Fixed (`5203f49`)

Claude Code uses the file name as the command name and ignores `name:` in `.claude/commands/*.md`. All four command files carried it, which suggested a setting that didn't exist. Removed from all four.

---

## 10. No accessibility-testing skill — Added (`403a6de`)

Accessibility came up in several places (the web constitution's a11y section, the role-first locator rationale), but there was no skill for actually testing it.

**Added.** `.claude/skills/accessibility-testing/` covers:
- **The scans.** `@axe-core/playwright` scans come from a `makeAxeBuilder` fixture that owns the WCAG A/AA tags and exclusions. Every meaningful state is scanned (dialogs open, validation errors shown, empty and error states), each after a web-first assertion that the state is on screen. The assertion is strict, `expect(results.violations).toEqual([])`, with the full results attached to the report.
- **Known violations.** Never `disableRules`. Known violations go in one list, each with a ticket and an expiry, which mirrors the quarantine policy in `flakiness-triage`.
- **What automation can't see.** Keyboard-path, dialog-focus and `toMatchAriaSnapshot` checks, plus the rule that a clean scan is not a claim of WCAG compliance.
- **Product defects.** A missing accessible name is filed as a product defect, never routed around with a test-id.

`SKILL.md` holds the rules, and `templates.md` holds the skeletons. It is registered in the Routed Skill Index, the README and GOVERNANCE, with bidirectional See Also from `selectors` and `owasp-security-testing`.

**Evidence: STATIC.** The examples follow Playwright's accessibility-testing guide and the `@axe-core/playwright` API, but haven't been run against an app from this repository. The skill says so, and asks for the first real run to be recorded in `memories/learned_patterns.md`. It also has no eval cases yet, like 23 of the other skills.

**Worth noting.** Check 15 flagged the missing Routed Skill Index row, and check 7 the stale skill counts in README and GOVERNANCE, on the first `validate` run after the skill was created. Both new checks did their job on a real change.

---

## 11. Skills taught `test.skip`, which the constitution forbids — Fixed (`e49acec`)

The constitution is explicit. Its WON'T table forbids `test.skip()` in test bodies, and for an API that doesn't match its docs it says: "comment out the whole `test(...)` block with `// TODO: FIXME: <TICKET>` … Never `test.skip`." `test-standards`, `flakiness-triage` and `api-testing/SKILL.md` all agreed. Seven other places taught the opposite:

- `common-tasks`, in its **Critical block**: "Use `test.skip` + `// FIXME: <ticket>` + `/* eslint-disable … */`". Its checklist allowed `.skip` with a FIXME too.
- `api-testing/templates.md` § 13: "`test.skip` is the only correct response", with a `test.skip` skeleton. `api-testing/SKILL.md` says "**Do NOT use `test.skip`**" and links to that same section as its skeleton.
- The `api-testing` templates, `http-method-coverage.md` and `reference.md`, plus `data-strategy/reference.md`: a conditional `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, …)` guard. That's exactly what pre-edit checklist question 1 forbids.
- `config`: the same conditional guard, in Example 1 and in Troubleshooting.
- `debugging`: an anti-pattern that allowed `.skip` with an eslint-disable, contradicting its own checklist two sections later.
- `pr-review`: checklist lines that accepted `.skip` with a ticket.
- `test-standards`: an anti-pattern that recommended `describe.skip` for the blocked describes.

**Why it mattered.** This was the highest-impact contradiction in the review. `common-tasks` is the router every "add a test" request goes through, and the template is what agents copy. An agent following them would produce skipped tests, which show up as false greens and orphaned Qase cases. That's exactly what the constitution was written to prevent. Precedence says the constitution wins, but only if the agent notices the conflict.

**Fix.** Every place now gives the constitution's instruction. A test waiting on an unprovisioned token is written and commented out with a ticket, not skipped conditionally. No conditional-skip guidance remains in `.claude/`.

**Versions.** `common-tasks` 1.0.0 → 2.0.0, because a Critical rule changed meaning. `api-testing` and `data-strategy` 1.1.0 → 1.1.1, and `debugging`, `config` and `test-standards` 1.0.0 → 1.0.1: each already stated the correct rule, and the fix removed text that contradicted it.

---

## 12. `ai-native-workflow` was out of date with the repo — Fixed (`7297f8b`)

This skill orients agents, but it kept its own copy of the routing index, and that copy had drifted:

- It said `common-tasks`, `page-objects` and `test-standards` were empty placeholders that must not be routed to. All three are fully written, so an agent that believed this would avoid the three main authoring skills.
- Its "populated skills" matrix listed `master-context` and `metrics-api-tests-context`, which don't exist here. It left out `mutation-testing`, `defect-prediction`, `qe-pattern-memory` and `owasp-security-testing`, which do.
- Its "three-layer model" had two rows and described "detail rule files", "scoped rule files matched by glob" and `.cursor/rules/`. None of these exist, and its precedence line didn't match the constitution.

**Fix.** The matrix and skill list are replaced by a pointer to the one real index, `CLAUDE.md § Routed Skill Index`, with a note on why no copy is kept. The three-layer model now has its three layers: constitution, skills and personas. The precedence line and lifecycle step 2 match the constitution. The conversation contract and the seven-phase lifecycle, the parts that duplicate nothing, are unchanged. Version 1.0.0 → 2.0.0.

---

## 13. Skills cited constitution sections that don't exist — Fixed (`e1851ae`, `7297f8b`)

Nine files referred to `CLAUDE.md § Routed Detail Index`, but the section is called **Routed Skill Index**. The nine were `ai-native-workflow`, `common-tasks`, `frontend-cross-check`, `page-objects`, `pr-review`, `test-case-generation`, `test-standards`, and `skill-creator`'s template and checklist. `ai-native-workflow` also cited `§ Code Generation Tasks` and `§ Skill File Structure`, and neither exists.

**Fix.** All references are renamed, and the two nonexistent sections are removed along with the stale text around them. The validator now catches this class of mistake automatically. See finding 18.

---

## 14. A `common-tasks` example contradicted its own tag-casing rule — Fixed (`e1851ae`)

Example 1 tagged the spec `@App-regression`, correctly lowercase. One step later the same example said "Tag is Title-case." That's the exact mistake the skill warns, a few lines earlier, will silently drop the test from CI. The line now names the tag and explains why its casing matters.

---

## 15. Generic skills carry one project's layout, names and paths — Decided, in progress

The constitution says it "never hardcodes one repo's layout as universal truth," and that repo-specific facts belong in each repo's own `CLAUDE.md` or a repo-context skill. The skills don't follow that. This first showed up in `common-tasks`, and finding 16 showed how wide it goes: `api-testing`, `data-strategy`, `helpers`, `fixtures`, `page-objects`, `selectors` and `test-standards` all describe one product. They name its page objects (`SyntheticsPage`, `ProbesPage`), its helpers (`helpers/app/probes.ts`), its monitor types, its spec files, its test-data files and its tag whitelist, as if every repository had them.

**Why it matters.** When the toolkit is adopted in another repo, agents get sent to files, tags and helpers that don't exist there. That undercuts the toolkit's main selling point, that the skills "apply on top without modification."

**Decision.** The toolkit is a standalone skeleton that can be installed in any repository or built on. It must not link to, or name as if present, anything it doesn't contain. Rules stay. Project facts become generic, clearly illustrative examples, and the place for a real project's facts is that project's own `CLAUDE.md`, as the constitution's "Adopting this in a new repo" section already says.

**Two more cases found while taking stock.** Seven files, including two persona commands, tell agents to use terminology from a `master-context` skill, but no such skill exists. It's a dead reference that check 15(d) can't see, because it's a name in prose, not a link. And the tag-casing rules cite `app-regression` and `app-all` scripts in `package.json` that this repository's `package.json` doesn't have. Both are part of the rewrite below.

**Done so far.** The dead links are gone (finding 16). The authoring rule that produced this, "use REAL codebase names, no placeholders," has been replaced (finding 29). **Not done in this PR, on purpose.** The rewrite touches about 2,000 lines across 50 files, and it would bury this PR's fixes. **Settled: nothing depends on the product content.** The repository is a boilerplate meant to be built on, and no product uses these skills, so the product material can be rewritten directly. Nothing needs to be moved anywhere first.

**Plan (follow-up PRs):**
1. A pilot PR that rewrites `test-standards` around one neutral example app, to agree the style.
2. The remaining skills, one per commit. Heaviest first: `api-testing`, `data-strategy`, `selectors`, `page-objects`, `helpers`, `test-case-generation`. Also remove the `master-context` references.
3. A validator check that fails if the old product's names come back.

**Before this file is deleted,** open a tracking issue for this plan, so it outlives the report.

---

## 16. 416 links pointed at files this repository has never contained — Fixed (`76a0b72`, and now caught by check 15)

This started as "a plan document that doesn't exist," cited about sixty times (links and plain-text "plan § 6.2" mentions, including in `helpers`, which the first count missed), plus one link to `docs/keycloak-dev-setup.md`. Checking every relative link in every markdown file found **416** that lead nowhere. Besides the plan, they pointed at the project's page objects, helpers, specs, test data, `playwright.config.ts`, `env/.env.example`, a validation hook and `AGENTS.md`.

**None of them were ever here.** `git log --all` shows no commit on any branch has ever contained `docs/`, `helpers/`, `pages/` or those spec files, and the links are already in the first commit (`8abc855`). The skills were written inside the product repository, where every link worked, and copied into this one without the files they point to.

**Fix.**
- **Plan and Keycloak citations** are removed. Each sentence keeps the rule it states, and only the citation goes. The "companion plan" slot is gone from the skill template, the authoring checklist and the See Also requirements, so new skills stop inheriting it.
- **Links into product code** are now plain code text. Rewriting those examples is finding 15.
- **Links to a wrong path inside the toolkit** are fixed. The hook links point at `scripts/validate.mjs` instead (finding 29), and the `common-tasks` row for an unwritten `reference.md` is removed.

**Prevention.** Check 15(d) now fails on any relative link, in `.claude/` or the root docs, whose target file doesn't exist. Code, URLs, `~/` paths, `<placeholder>` targets and `*-template.md` files are exempt, because their links aren't paths into this tree. Run against the tree from before the fix, it reports all 416. `scripts/tests/cross-references.test.mjs` adds three cases: a dead link fails, a real link stays silent, and placeholders, code and URLs stay silent. That brings it to 11 cases, 6 blocking.

**Worth noting.** `skill-creator`'s checklist already said "No broken markdown links — every `[text](path)` resolves to a real file." As a box for a reviewer to tick, it held for none of the 416. As a check, it can't be skipped.

---

## 17. The AC writer's examples broke its own keyword-casing rule — Fixed (`5c6459b`)

`acceptance-criteria-writer` requires the Gherkin keywords in bold capitals (**GIVEN** / **WHEN** / **THEN** / **AND**), but its own style examples used **Given** / **When** / **Then**. Agents copy examples more readily than they follow rules, so the examples now follow the rule.

---

## 18. Nothing kept cross-references in sync — Fixed (`de28998`, new validator check 15)

**This is the root cause behind findings 12, 13 and 19, and the most important change in this PR.** Fixing each stale reference by hand only fixes today's; this finding is about why they appeared at all.

**What was missing.** Skills, personas and the constitution cite each other constantly: "see `CLAUDE.md § X`", "load skill Y", "the persona `/Z`". They were written at different times. When one file changed (a section was renamed, a placeholder skill was finally written), the files that described it kept saying the old thing. Each one was true when it was written. Nothing re-checked it afterwards. That's how we ended up with nine files citing a section by a name it no longer had, an orientation skill telling agents that three fully written skills were empty, and a skill list that named skills that didn't exist and missed four that did.

**Why a rule in the constitution wouldn't fix it.** The obvious fix is a new law: "agents must keep cross-references in sync." But the constitution is instructions to an AI agent, and instructions get followed most of the time, not every time. Findings 11 and 12 show exactly that: the constitution already said "never `test.skip`", and seven places still taught it. A mistake that only happens when someone forgets a rule isn't prevented by adding another rule to forget. It's prevented by a check that runs every time and fails the build.

**What was added.** `npm run validate` has a new **check 15, "files that point at each other still agree"**. It verifies two things:

- every `CLAUDE.md § <section>` reference anywhere in `.claude/` names a heading, or a MUST / SHOULD / WON'T rule, that actually exists in the constitution;
- the Routed Skill Index lists exactly the skills that exist on disk, and the persona line lists exactly the files in `.claude/commands/`, in both directions. A skill nobody routes to fails, and so does an index row for a skill that doesn't exist.

**Why it's deliberately narrow.** Both of those can be resolved exactly, so the check never reports a correct reference as broken. I tried a broader version first, which fuzzy-matched every `§` in every file against every heading. It flagged around 38 references, and many were fine, just phrased in ways the matcher didn't expect. A gate that cries wolf gets switched off. The repo's own memory file records that lesson (case #003). So the check only covers what it can decide with certainty. Broader coverage, such as references between skills and links to files, can be added later in the same style.

**Proof that it works.** A check nobody has seen fail is only a hypothesis, so it ships with a fault-injection suite, `scripts/tests/cross-references.test.mjs`, which runs in CI as `npm run test:xref`. It breaks the repo on purpose in four ways and confirms each one fails the build: a stale section reference, a skill folder the index doesn't route to, an index row for a missing skill, and a persona with no command file. A fifth case confirms that a *correct* reference stays silent. On its first run against the real tree, the check found one more genuine broken reference (finding 19).

**In one sentence:** documentation that other files depend on drifts the way code does, so it is now tested the way code is.

---

## 19. `skill-creator` pointed at a document and index columns that don't exist — Fixed (`de28998`)

Caught by check 15 on its first run. `skill-creator` told skill authors to update "`CLAUDE.md` §6.4 cross-reference matrix" and `docs/cursor-skills-orchestration.md § 6.2.2`. Both come from the original project's orchestration document, and neither exists here. It also told authors to "flip the row's status" in the Routed Skill Index, which has no status column. The skill, its checklist and its template now point at the Routed Skill Index. The checklist now also says that check 15 must pass. `skill-creator` 1.1.1 → 1.1.2.

---

## 20. `npm run test:der` crashed on Windows with Node 24 — Fixed (`f57a1ca`)

Every case of the defect-escape-rate suite failed locally with exit code 3221226505 (`0xC0000409`), on a clean `main` too, while CI stayed green. The script computed and printed the correct result, then crashed on the way out with a libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`). That's a known Node 24 behaviour on Windows when `process.exit()` runs while `fetch`'s sockets are still closing. CI uses Node 20 on Linux, so it never saw it.

**Fix.** The final exit points set `process.exitCode` and let Node shut down normally. The exit codes are unchanged, and all five cases now pass on Windows. Together with finding 5, every validator and test suite in the repo now gives the same result on a Windows laptop as in CI.

---

## 21. Two different tag whitelists — Fixed (`3e13ede`)

`test-standards` owns the tag whitelist, and the lint configs and the eval harness use its seven tags: `@App-Critical`, `@App-Smoke`, `@App-Sanity`, `@App-regression`, `@App-API`, `@App-Integration`, `@App-E2E`. `common-tasks` (in its Critical block, an anti-pattern and its checklist) and `pr-review` (its checklist) each kept a shorter copy with only four of those tags.

**Why it mattered.** A correct `@App-Critical`, `@App-Sanity` or `@App-Integration` test would fail the self-review in `common-tasks` and `pr-review`. It's another duplicated list that drifted from its owner, the same failure as the skill index in finding 12.

**Fix.** Those places now point at the `test-standards` whitelist and keep no copy of their own. The casing warning stays, because it's the part people get wrong: every tag is Title-case except lowercase `@App-regression`.

---

## 22. `type-safety` still taught `test.skip` — Fixed (`3e13ede`)

After finding 11, the Critical block of `type-safety` still said: when a `ZodError` reveals contract drift, "Investigate the divergence and `test.skip` with `// FIXME:`". Its Troubleshooting table said the same, with an eslint-disable. My search for finding 11 missed it because of the wording ("`test.skip` with …"). Both now say to comment the test out with a ticket.

**Worth noting.** This is exactly why finding 18 prefers mechanical checks: a manual search depends on guessing every way a sentence can be phrased. A skill-content check that flags any recommendation of `test.skip` could be a follow-up, but deciding whether a sentence recommends or forbids something is fuzzy, so it would need to be a warning, not an error.

---

## 23. `api-testing` put route constants in `enums` — Fixed (`3e13ede`)

The Critical block of `api-testing` listed `enums/app/*` as the home of "route + message constants". The constitution ("Endpoint/route paths from a central config module"), `enums` ("**NEVER** put endpoint paths, route strings … in `enums/`") and `config` all say paths live in `appConfig`. The line now reads "message, suite and status constants — never paths".

---

## 24. Two skills disagreed about where `try/catch` is allowed — Wording fixed (`3570abf`), alternative Open

`debugging` said "the only `try/catch` allowed is capturing an accidentally-created resource id for cleanup". `page-objects` documents a second one in its Critical block, the Radix trigger-swallow retry: `try { click + expect(item).toBeVisible({ timeout: 5_000 }) } catch { click({ force: true }) + expect visible }`. It calls this "the one accepted `try/catch` in a POM action method". The lint rule `no-try-catch-in-test` only covers test bodies, so neither skill was *mechanically* wrong. They just disagreed.

**Fixed now.** `debugging` says its rule is about test bodies and names the page-object exception, so the two skills agree.

**Open proposal.** Whether the exception should exist is a separate question. The retry uses `force: true`, which skips Playwright's actionability checks, and an inline `5_000` timeout, which the constitution's "no magic numbers" rule forbids. Playwright's built-in retry, `await expect(async () => { await trigger.click(); await expect(item).toBeVisible({ timeout: … }); }).toPass()`, retries the same click-and-check with no `try/catch`, no force-click, and a timeout that can come from config. `page-objects` already recommends `expect.toPass` for "genuinely-flaky reads". I haven't made this change because it alters runtime behaviour, and it needs to be verified against the real Radix components with `npx playwright open` first.

---

## 25. `refactor-values` assumed the default branch is `master` — Fixed (`3570abf`)

It warned against leaving "`master` in a broken state". This repository's default branch is `main`, and a toolkit meant for any repo shouldn't assume either name. Both mentions now say "the default branch".

---

## 26. No testability constitution for backend / API developers — Added (`09dc8f7`)

`constitutions/` gave the frontend and mobile teams' coding agents a testability standard, but the backend had none. Yet every API-testing rule assumes a trustworthy OpenAPI contract: coverage plans are built from it, and "the contract is truth, live requests only when no docs exist." Nothing asked the backend team to produce that contract first. In a code-first team the spec is generated from the code after it's written, so it records whatever was built, bugs included, and the API tests end up checked against the implementation instead of the agreement.

**Added.** `constitutions/api-testability.md` is copied into backend repos as their `CLAUDE.md`, like the other two. Its universal law: no endpoint ships, changes or is removed unless the reviewed OpenAPI spec describes it first. It covers eight areas:

1. A schema-first workflow. The spec PR is reviewed before implementation, and the server, frontend and QA clients are generated from it.
2. Complete contracts. Every status code is documented, required, optional and nullable are distinct, unknown properties are rejected, and formats and limits are stated.
3. One shared error schema, with field-level validation errors.
4. Authentication and the `401` / `403` / `404` choice as part of the contract, including tenant isolation.
5. Deterministic data: stable IDs, defined ordering and pagination, and observable async work.
6. Test-data hooks: seeding, idempotent cleanup, and documented dependency rules.
7. Change control: a spec diff in CI (for example `oasdiff`) and response validation against the spec.
8. Correlation IDs for diagnosability.

It ends with a code-first vs schema-first blueprint and a definition of done. It's stamped and checked by check 14, like the UI constitutions, and described in the constitutions README and the main README.

This comes from direct experience with a schema-first process, where the spec was updated right after grooming and the QA client was regenerated from it, so tests couldn't drift from the contract.

**Natural follow-up on the QA side.** The toolkit hand-writes its Zod schemas, which are another copy of the contract. They could be generated from the spec (for example with openapi-zod-client or orval), so runtime validation stays in step with it.

---

## 27. `fixtures` claimed `afterEach` can be skipped when a test fails — Fixed

The Critical block of `fixtures` gave, as "the decisive reason" to prefer a fixture, that "a manual `afterEach` can be skipped in some failure modes." That isn't accurate. Playwright runs `afterEach` after a failed test, just as it runs a fixture's teardown. A skill that teaches a wrong reason teaches agents to make the right choice for the wrong reason, and to argue it wrongly in review.

**Fix.** The rule now gives the real reasons. A fixture makes setup and teardown one self-contained unit: no shared `let` variable links two hooks. If setup throws, `use` is never reached, so teardown never tries to delete something that was never created. Only tests that request the fixture pay for it. And any spec reuses it by name instead of copying both hooks. The recommendation itself (prefer a fixture for failure-safe cleanup) is unchanged. `fixtures` 1.0.0 → 1.0.1.

---

## 28. Six See Also entries still called written skills "(TBD)" — Fixed (`403a6de`, and now caught by check 15)

Found while registering the accessibility skill. Six See Also entries in five skills still called `page-objects` or `common-tasks` "(TBD)", although both are fully written: `selectors` (twice), `debugging`, `fixtures` and `playwright-cli` (twice). One said "until populated, follow patterns in existing `pages/app/*`", which steers agents away from the skill that holds those patterns. It's the same drift as finding 12: each label was true when it was written, and nothing re-checked it.

**Fix.** The labels are removed. Because this one can be checked exactly, **check 15 now fails when any file marks an existing skill "(TBD)"**, while a TBD label for a skill that really isn't written yet stays allowed. `scripts/tests/cross-references.test.mjs` has two new cases: a stale label fails, and a label for an unwritten skill stays silent (8 cases, 5 blocking).

---

## 29. `skill-creator` described a validation hook that never existed, and required "real codebase names" in examples — Fixed (`76a0b72`)

Found while fixing finding 16. Two things in the skill-authoring guidance didn't match reality:

- **A hook that never existed.** The checklist, the patterns reference and the skill template said a `postToolUse` hook (`.cursor/hooks/skill-validate.py`) validates every skill on save, and linked to it. No such file exists, and `skill-creator/SKILL.md` itself says validation is "a command, not a hook." Validator check 8 was added for exactly this claim, but it only scans `SKILL.md` files, so the claim lived on in the reference files. The checklist also said required sections were "not yet enforced," although the validator checks them. All of these now describe `npm run validate` and what it really checks, and list separately the items it doesn't (Contents blocks, backslash paths, reference depth, signature devices).
- **A rule that caused finding 15.** The checklist required examples to use "REAL codebase names (no placeholders)." Inside one product that's good advice. In a toolkit meant for many repositories, it put that product's paths into every skill. It now asks for concrete, realistic names that read as illustrations, never as a path the reader is expected to find.

---

## 30. About 60 contradictions between skills, in 12 themes — Open, planned follow-up PR

Finding 2 (five locator orders) wasn't a one-off. A full audit on 2026-10-01 compared every skill, the constitution, the commands and the memory file topic by topic, and found about 60 places that tell an agent to do incompatible things. The high-impact ones were checked against the files by hand. They're listed in one place here so they can be fixed together, in their own PR after this one, one commit per theme.

1. **Locators.** The Radix exception is narrow in `selectors` but widened in three other files, including the `pr-review` checklist. Many "good" examples use a test-id where a role or label would work.
2. **Waits.** `page-objects` marks a `waitForResponse` registered after the click as correct, and the memory file rightly calls that a race. Three skills recommend `expect.toPass({ timeout })`, which isn't a real Playwright API.
3. **Timeouts.** The constitution bans magic-number timeouts and raising them. The templates require `test.setTimeout(300_000)` and an `MS = { … }` block in every spec, and one troubleshooting row says to raise the timeout.
4. **Disabled tests.** There are three different markers (`// TODO: FIXME:`, `// FIXME:`, `// SKIP:`). One skill allows `test.fixme`, and two specs presented as canonical examples skip themselves.
5. **Conditionals in tests.** `scaffold-spec` calls an `if` in a test body "ACCEPTABLE", which the constitution and a lint rule both forbid. One template wraps a whole test in `try/finally`. The lint's real cleanup-capture escape hatch is undocumented.
6. **The parse idiom.** It's called "exact" but has three unnamed variants. One of them doesn't work: `expect.soft(Schema.parse(x))` can't keep a loop running, because `parse` throws first. The memory file records it as a proven lesson.
7. **API rules.** The skills disagree on:
   - whether data-driven loops go inside or outside the test;
   - test-name and step-label formats;
   - where `qase.id` goes;
   - which token produces 403;
   - whether cross-tenant access returns 403 or 404.

   The 405 template breaks three rules at once, and `toBe(401 | 403)` is a bitwise OR that means `403`.
8. **Tokens and env vars.** Two template lines aren't valid TypeScript (`const process.env.X! = …`). Templates alias tokens and helpers read env vars, both against stated rules. `type-safety` claims `!` crashes at startup, but TypeScript erases it at compile time.
9. **Where things live.** The skills give conflicting answers on:
   - endpoint paths, UI strings and fixed constants;
   - when a helper becomes a fixture, and which folder it goes in;
   - whether a schema barrel exists;
   - the naming style for test-data files;
   - whether spec placement is flat or in subfolders.
10. **Test data.** One skill borrows "the first existing user", while the constitution says to seed. A template pushes into a shared array from `beforeAll`.
11. **Process.**
    - Parallel vs always one worker: the single-worker claim cites a memory entry that doesn't exist.
    - Four different "green runs before merge" counts.
    - Flaky-test examples that skip `flakiness-triage`.
    - A routing loop between `bug-helper` and `flakiness-triage`.
    - A committed `console.log`.
    - `scaffold-spec` exploring in ways the constitution forbids.
12. **Meta.**
    - A fourth evidence label (CONJECTURE) that the constitution doesn't know.
    - `skill-creator`'s structure contract doesn't match most skills.
    - The acceptance-criteria writer lacks the manual-only flag.
    - Two lint claims don't match the lint.

**Proposed resolutions, all standard practice:**
- Named timeout budgets in config.
- UI data-driven cases as separate tests, and API negative matrices as one test with steps, soft assertions and `safeParse`.
- Required env vars validated once, when config loads.
- A parallel-safe suite, with a single worker for diagnosis only.
- App UI strings always from enums.

Where a mechanical check can prevent a theme from coming back, it'll be added with the fix.

---

## 31. No prerequisites anywhere; the personas pointed at "install notes" that don't exist — Fixed (`af77f70`)

Nothing told a new user what to install before starting. The README's Install section was a clone and three copy commands. The only stated prerequisite was `"node": ">=18"` in `package.json`. Missing:

- Claude Code itself.
- The lint plugin's dependencies, which must be installed inside `eslint-plugin-qa-constitution`. A root `npm install` installs nothing, which this review ran into on day one.
- The Playwright, Zod, faker and ESLint stack the skills assume in the adopting repo.
- The `.env` file.
- The optional Atlassian MCP connection.

Three things were also out of date:

- The three Jira personas said "configure via `claude mcp` — see the install notes", but there are no install notes.
- `GOVERNANCE.md` gated public-mirror pushes on `python scripts/build-public.py`, a script from the source project that this repository doesn't contain.
- `GOVERNANCE.md` said 25 of 28 skills have no eval history. The real figure is 24 of 27.

**Fix.**
- The README has a new **Prerequisites** section. It lists what's needed to use the toolkit, to run this repository's own checks, and in the test repository it's adopted into. It also covers the optional integrations, and the product-side practices that are recommended but not required (testability constitutions, a schema-first OpenAPI spec, test-ids published as a shared package). It states that no Python is needed and that Windows users should use Git Bash.
- Install now runs `npm run validate` right after cloning.
- The personas point at the new section.
- The governance row now names the PR template's real public-mirror checklist instead of the missing script, and the count is corrected.

---

## 32. How protected are the shared files? — Partly fixed, needs owner action

The constitution and skills steer every agent session, so a careless edit pollutes everyone's work. Here's what was checked.

**Confirmed in place.** GitHub's public API (`GET /repos/georgikazandzhiev-code/ai-native-qa-toolkit/branches/main`) shows `main` as `"protected": true`. The three CI jobs (Toolkit structure, Lint plugin rules, Skill eval regression) are required status checks with enforcement level `everyone`, so a red pipeline blocks a merge, administrators included. `CODEOWNERS` routes all the shared files to the owner.

**Corrected.** `CODEOWNERS` and `GOVERNANCE.md` both said code-owner review "is unavailable on a free-plan private repository", and concluded that here the file only routes and doesn't gate. The repository is public, so the setting is available. Both now say that, and record what the public API shows.

**Needs the owner (only an admin can see or change these):**
1. Confirm that `main` requires a pull request and **review from Code Owners**. The public API doesn't show review settings.
2. Update the repository's About description on GitHub. It still says "26 on-demand skills" (there are 27), and it lives in the GitHub settings, where check 7 can't see it.

**Proposed (not done yet).** Installed copies of the toolkit should stop the agent from editing its own instruction files, using `permissions.deny` rules in Claude Code's `settings.json`. That's least privilege applied to the agent. It belongs in the copies, not in this source repository, where editing the skills is the work itself. A verified snippet will be added to the README's adoption section once the path syntax has been checked against Claude Code's documentation, because a deny rule with a wrong pattern looks safe and protects nothing.
---

## Validator warnings already present (not introduced here)

`npm run validate` reports warnings that were there before this review. Six skills are over the 380-line budget (`api-testing`, `page-objects`, `scaffold-spec`, `selectors`, `skill-creator`, `test-standards`), and five skill descriptions lack a "Do NOT use for X" line (`common-tasks`, `debugging`, `pr-review`, `scaffold-spec`, `test-case-generation`). There are also two informational ones: `.cursor/mcp.json` and `.cursor/rules` aren't present, so those checks are skipped. They're listed here only for completeness.

This branch adds one warning (the `selectors` v2.0.0 eval-history one from finding 7) and removes one (the README's check count is now a digit that check 7 can verify). That leaves 14 warnings and 0 errors. All nine suites pass locally on Windows: `validate`, `test:xref`, `test:rules-owned`, `test:lock`, `test:stamp`, `test:der`, `test:memory`, `test:rules` and `test:faults`.
