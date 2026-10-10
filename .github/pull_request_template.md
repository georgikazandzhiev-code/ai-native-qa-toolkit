## What changes, and what it makes true that was not

<!-- One or two sentences. Not a file list — the diff already is one. -->

## Scope

- [ ] This PR is **one logical change** that can ship on its own (`GOVERNANCE.md` § One logical change per PR). If it isn't, say why it can't be split:

## Change class

<!-- Pick one. GOVERNANCE.md § Change classes decides by what happens to output that was
     previously correct, not by how many lines moved. -->

- [ ] **patch** — wording, examples, cross-references. No rule changed meaning.
- [ ] **minor** — a rule or section was added. Nothing previously correct becomes incorrect, because: <!-- say why -->
- [ ] **major** — a rule changed meaning or was removed. Output that was correct may now be wrong.
- [ ] **new skill** / **new lint rule** / **tooling only** / **docs only**

## Evidence

- [ ] `npm run validate` — 0 errors
- [ ] `node eslint-plugin-qa-constitution/tests/rules.test.js` — if a rule changed
- [ ] `version:` moved in every `SKILL.md` whose rules changed
- [ ] **major only:** the skill was re-measured and this PR contains the `evals/history.json` entry
- [ ] **new skill only:** a routing row exists in `.claude/CLAUDE.md § Routed Skill Index`
- [ ] **new lint rule only:** it has a `RuleTester` suite **and** a fault-injection case
- [ ] Every number this PR states in prose is either recomputed by a validator check or labelled in its own sentence as unverified

## Independent review

<!-- Before asking for review, have the change reviewed by someone — or an agent — that did not
     write it: several angles (does a new check misfire in either direction; is every claim in this
     description true; do the doc or example edits break a rule the lint can't see), then a skeptic
     pass that tries to refute each finding. The author is the worst-placed person to see their own
     blind spots; the numbers below make a skipped review visible instead of silent. -->

- [ ] Independent review run before review was requested — **N** findings confirmed, **M** fixed, **K** refuted. Paste the confirmed list or link it; say why any confirmed finding was not fixed
- [ ] **new or changed check** (validator check, lint rule, test harness): run against a reference implementation on inputs chosen to break it, and every branch mutated — kill ratio **x / y**, survivors named. "Every branch is tested" is a number here, not a sentence

## If this PR touches a pattern in `.qe-memory/`

- [ ] Nothing was promoted to `tier: canonical` by an agent — promotion is a human act, in review
- [ ] Any pattern that did not hold has a `## Falsifications` entry and a demoted tier in the same commit

## Before pushing to the public mirror

- [ ] No client or repository-specific name, no internal host, no ticket key, no token
