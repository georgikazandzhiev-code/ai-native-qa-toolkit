# Toolkit review — findings

> **Temporary file. Delete it before merging this PR, or right after.** It exists so the findings can be reviewed alongside the diff. Once the open items have tickets or follow-up PRs, it has no further use in the repo.

**Reviewer:** Ivaylo Ilchev · **Started:** 2026-09-30 · **Branch:** `ivaylo-changes` · **Last updated:** 2026-10-01

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
| 6 | Jira-writing commands can be triggered by the agent itself | Medium | Open |
| 7 | `selectors` 2.0.0 needs re-measuring | — | Owed |
| 8 | Testability constitutions have no version stamp once copied | Low | Open |
| 9 | `name:` in command frontmatter is ignored | Low | Open |
| 10 | No accessibility-testing skill | — | Suggestion |
| 11 | Skills teach `test.skip`, which the constitution forbids | High | Fixed · `e49acec` |
| 12 | `ai-native-workflow` is out of date with the repo | Medium | Fixed · `7297f8b` |
| 13 | Skills cite constitution sections that don't exist | Low | Fixed · `e1851ae`, `7297f8b` |
| 14 | `common-tasks` example contradicts its own tag-casing rule | Low | Fixed · `e1851ae` |
| 15 | `common-tasks` hardcodes one project's layout | Medium | Open |
| 16 | 31 links to a `docs/framework-alignment-plan.md` that doesn't exist | Low | Open |
| 17 | AC writer's examples break its own keyword-casing rule | Low | Fixed · `5c6459b` |
| 18 | **Nothing kept cross-references in sync — the root cause of 12, 13 and 19** | High | Fixed · `de28998` (new validator check 15) |
| 19 | `skill-creator` points at an orchestration doc and index columns that don't exist | Low | Fixed · `de28998` |
| 20 | `npm run test:der` crashes on Windows with Node 24 | Medium | Fixed · `f57a1ca` |
| 21 | Two different tag whitelists (7 tags vs 4) | Medium | Fixed · `3e13ede` |
| 22 | `type-safety` still taught `test.skip` after finding 11 | High | Fixed · `3e13ede` |
| 23 | `api-testing` put route constants in `enums` | Low | Fixed · `3e13ede` |
| 24 | Two skills disagreed about where `try/catch` is allowed | Medium | Wording fixed · `3570abf`; alternative Open |
| 25 | `refactor-values` assumed the default branch is `master` | Low | Fixed · `3570abf` |
| 26 | No testability constitution for backend / API developers | Medium | Open — proposal |
| 27 | `fixtures` claimed `afterEach` can be skipped when a test fails | Low | Fixed · see below |

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

## 6. Jira-writing commands can be started by the agent itself — Open

In current Claude Code, commands and skills are merged, and the agent can invoke either one based on its description unless the file sets `disable-model-invocation: true`. None of the four files in `.claude/commands/` set it.

**Why it matters.** `bug-helper`, `test-case-helper` and `requirement-analyst` can post to Jira. Each one asks for confirmation before writing, which is good, but that's the only safeguard.

**Proposed fix.** Add `disable-model-invocation: true` to those three. It's one line each, and it gives a second, independent safeguard. `acceptance-criteria-writer` only produces text, so it matters less there.

---

## 7. `selectors` 2.0.0 needs re-measuring — Owed

`GOVERNANCE.md` requires a re-measurement and an `evals/history.json` entry for a major bump. I couldn't run the eval harness, so `validate` now warns: "declares v2.0.0 but the newest eval history entry is v1.2.0." The practical change is small (label/placeholder above text in the constitution, alt/title above test-id in the skills), but under the governance rules the measurement is still owed.

---

## 8. The testability constitutions have no version stamp once copied — Open

The `constitutions/` files are meant to be copied into product repos as their `CLAUDE.md`. Unlike `.claude/CLAUDE.md`, they carry no `toolkit-version` stamp, so `npm run audit` can't tell which frontend or mobile repos are running an old copy.

**Options.** Add a stamp so the audit can see copies. Better still, distribute them as a versioned package or Claude Code plugin, have each product repo's `CLAUDE.md` import the file with `@path`, and add a CI check that warns when a copy is behind. The key rules could also be backed with frontend lint (for example `eslint-plugin-jsx-a11y`), so they're enforced rather than only instructed.

---

## 9. `name:` in command frontmatter is ignored — Open

Claude Code uses the file name as the command name, and ignores `name:` in `.claude/commands/*.md`. It's harmless, but it suggests the field does something. Either remove it, or keep it with a comment that it's documentation only.

---

## 10. No accessibility-testing skill — Suggestion

Accessibility comes up in several places (the web constitution's a11y section, the role-first locator rationale), but there's no skill for actually testing it. An `accessibility-testing` skill built on `@axe-core/playwright` would fill that gap. I'm happy to draft it as a separate PR.

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

## 15. `common-tasks` hardcodes one project's layout — Open

The constitution says it "never hardcodes one repo's layout as universal truth," and that repo-specific facts belong in each repo's own `CLAUDE.md` or a repo-context skill. `common-tasks`, which is shipped as a generic skill, hardcodes a specific project: the tag whitelist (`@App-API | @App-E2E | @App-Smoke | @App-regression`), paths like `fixtures/pom/test-options.ts` and `enums/app/qase-suites.ts`, and env vars like `USER_ACCESS_TOKEN_FULL`. Several other skills probably do the same, which I'll check as the review continues.

**Why it matters.** When the toolkit is adopted in another repo, the router will send agents to paths and tags that don't exist there. That undercuts the toolkit's main selling point, that the skills "apply on top without modification."

**Proposed fix.** Move the project-specific facts into a repo-context skill or a project `CLAUDE.md` template, and have `common-tasks` refer to "the project's tag whitelist" and "the project's fixtures barrel" instead. This is a bigger design change, so it's worth discussing before anyone starts.


---

## 16. 31 links point to a document that doesn't exist — Open

`docs/framework-alignment-plan.md` is linked 31 times across 15 skill files (`api-testing`, `common-tasks`, `data-strategy`, `page-objects`, `skill-creator`, `test-standards`, `ai-native-workflow` and their supporting files), often as "plan § 6.2" to justify a rule. The file isn't in this repo. It belongs to the project the toolkit was extracted from. `common-tasks` also links to its own `reference.md`, marked TBD, which doesn't exist either.

**Why it's open rather than fixed.** This is the same root cause as finding 15: project-specific content shipped in generic skills. Deleting 31 references mechanically would lose the reasoning some of them carry. The cleaner route is to resolve it together with finding 15. Either the rules that matter get restated in the skills and the plan references go, or the plan moves into a repo-context layer where a project can supply it.

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

## 26. No testability constitution for backend / API developers — Open (proposal)

`constitutions/` gives the frontend and mobile teams' coding agents a testability standard, but the backend has none. The API-testing rules all assume a trustworthy OpenAPI contract: coverage plans are built from it, and "the contract is truth, live requests only when no docs exist." Nothing asks the backend team to provide one. In a code-first team the spec is generated from the code after it's written, so it records whatever was built, bugs included, and the API tests end up being checked against the implementation instead of the agreement.

**Proposal.** Add `constitutions/api-testability.md` for the backend repos, making the contract a product requirement. It would say:
- **Schema-first.** New or changed endpoints go into the OpenAPI spec right after grooming, before implementation, and the spec change is reviewed like code.
- **Complete contracts.** Every endpoint documents every status code it can return and its body. Errors follow one shared error schema.
- **Test hooks.** There are stable identifiers and dedicated seeding and cleanup endpoints for test data, so tests don't have to drive the UI to set up state.
- **Enforcement, not only instructions.** CI validates real responses against the spec, and a spec-diff tool (for example oasdiff) blocks breaking changes that aren't announced.

On the QA side, the natural pairing is to generate the API client, the types and, ideally, the Zod schemas from that spec (OpenAPI Generator, openapi-zod-client or orval), instead of hand-writing them. Hand-written schemas are another copy of the contract, and copies drift.

This comes from direct experience with a schema-first process, where the spec was updated right after grooming and the QA client was regenerated from it, so tests couldn't drift from the contract. I'm happy to draft the constitution as a follow-up PR.

---

## 27. `fixtures` claimed `afterEach` can be skipped when a test fails — Fixed

The Critical block of `fixtures` gave, as "the decisive reason" to prefer a fixture, that "a manual `afterEach` can be skipped in some failure modes." That isn't accurate. Playwright runs `afterEach` after a failed test, just as it runs a fixture's teardown. A skill that teaches a wrong reason teaches agents to make the right choice for the wrong reason, and to argue it wrongly in review.

**Fix.** The rule now gives the real reasons. A fixture makes setup and teardown one self-contained unit: no shared `let` variable links two hooks. If setup throws, `use` is never reached, so teardown never tries to delete something that was never created. Only tests that request the fixture pay for it. And any spec reuses it by name instead of copying both hooks. The recommendation itself (prefer a fixture for failure-safe cleanup) is unchanged. `fixtures` 1.0.0 → 1.0.1.
---

## Validator warnings already present (not introduced here)

`npm run validate` reports warnings that were there before this review. Six skills are over the 380-line budget (`api-testing`, `page-objects`, `scaffold-spec`, `selectors`, `skill-creator`, `test-standards`), and five skill descriptions lack a "Do NOT use for X" line (`common-tasks`, `debugging`, `pr-review`, `scaffold-spec`, `test-case-generation`). There are also two informational ones: `.cursor/mcp.json` and `.cursor/rules` aren't present, so those checks are skipped. They're listed here only for completeness.

This branch adds one warning (the `selectors` v2.0.0 eval-history one from finding 7) and removes one (the README's check count is now a digit that check 7 can verify). That leaves 14 warnings and 0 errors. All nine suites pass locally on Windows: `validate`, `test:xref`, `test:rules-owned`, `test:lock`, `test:stamp`, `test:der`, `test:memory`, `test:rules` and `test:faults`.
