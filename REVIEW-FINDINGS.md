# Toolkit review — findings

> **Temporary file. Delete it before merging this PR, or right after.** It exists so the findings can be reviewed alongside the diff. Once the open items have tickets or follow-up PRs, it has no further use in the repo.

**Reviewer:** Ivaylo Ilchev · **Started:** 2026-09-30 · **Branch:** `ivaylo-changes` · **Last updated:** 2026-10-01

This is a running log of what came up while reading the toolkit end to end, starting with `.claude/`. Each finding says what's wrong, where, why it matters, and its status. Items marked **Fixed** are committed on `ivaylo-changes`. Items marked **Open** need your decision before anything changes.

Covered so far: `CLAUDE.md`, `commands/`, `memories/`, `constitutions/`, plus the files the fixes touched. `skills/` has not been reviewed in full yet.

---

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | AC writer invents details that the requirement analyst forbids inventing | Medium | Open |
| 2 | Locator priority stated three different ways | High | Fixed · `4c7c5ea` |
| 3 | Table-row locator example contradicts the memory file | Medium | Fixed · `4c7c5ea` |
| 4 | `npm run test:memory` referenced but missing | Low | Fixed · `d3c45b5` |
| 5 | Validators fail on a clean Windows checkout (CRLF) | Medium | Fixed · `f818b4c` |
| 6 | Jira-writing commands can be triggered by the agent itself | Medium | Open |
| 7 | `selectors` 2.0.0 needs re-measuring | — | Owed |
| 8 | Testability constitutions have no version stamp once copied | Low | Open |
| 9 | `name:` in command frontmatter is ignored | Low | Open |
| 10 | No accessibility-testing skill | — | Suggestion |

---

## 1. The AC writer and the requirement analyst disagree about missing information — Open

`.claude/commands/acceptance-criteria-writer.md:25` says:

> If details are missing from the input, make logical professional assumptions consistent with standard UI/UX patterns.

`.claude/commands/requirement-analyst.md:69-70` says the opposite:

> **Never invent UI specifics** not present in the requirement.
> **Never paper over a gap** — … Surface everything; let the PO decide what's out of scope.

**Why it matters.** The two personas cover neighbouring stages of the same flow: story → ACs → review. The AC writer quietly fills gaps with plausible guesses, and those guesses then look like confirmed requirements. That's exactly what the analyst exists to catch. If the analyst runs on the writer's output, the gaps are already hidden.

**Proposed fix.** Keep the AC writer's ability to draft from thin input, but make every assumption visible. Tag it inline as `[ASSUMPTION: …]` and add an "Assumptions to confirm" list at the end. The analyst's Gate B would then treat any `[ASSUMPTION]` as unconfirmed, not as acceptance criteria. I haven't changed this yet, because it changes how the persona behaves.

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

## Validator warnings already present (not introduced here)

`npm run validate` reports warnings that were there before this review. Six skills are over the 380-line budget (`api-testing`, `page-objects`, `scaffold-spec`, `selectors`, `skill-creator`, `test-standards`), and five skill descriptions lack a "Do NOT use for X" line (`common-tasks`, `debugging`, `pr-review`, `scaffold-spec`, `test-case-generation`). There are also three informational ones: `.cursor/mcp.json` and `.cursor/rules` aren't present (the checks are skipped), and the README's "Fourteen checks:" is written as a word, so check 7 can't cross-check it against the real count. Writing it as "14 checks" would bring it under the check. They're listed here only for completeness.

The only warning this branch adds is the `selectors` v2.0.0 eval-history one from finding 7, which makes 15 warnings in total, with 0 errors.
