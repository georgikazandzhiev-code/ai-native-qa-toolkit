# Third-Party Notices

This toolkit vendors the third-party components below. Each remains under its own upstream
licence, which governs that component regardless of anything stated elsewhere in this
repository.

Provenance and file hashes are tracked in [`skills-lock.json`](skills-lock.json) and verified
on every run of `npm run validate`. A local edit to a vendored file fails the build until it is
either reverted or recorded deliberately — see `scripts/skills-lock.mjs`.

---

## skill-creator — evaluation harness, grader agents, eval viewer

| | |
|---|---|
**Paths** | `.claude/skills/skill-creator/scripts/`, `eval-viewer/`, `agents/`, `assets/eval_review.html` |
**Source** | [anthropics/skills](https://github.com/anthropics/skills) (`skills/skill-creator`) |
**Licence** | Apache License 2.0 — full text in [`.claude/skills/skill-creator/LICENSE.txt`](.claude/skills/skill-creator/LICENSE.txt) |
**Copyright** | Anthropic, PBC |
**Provenance** | Established by filename match against upstream, not by byte comparison. `npm run skills:lock -- --verify-upstream` reports whether upstream has moved since. |

**Not vendored, and deliberately excluded from that entry:** `SKILL.md`, `references/` and
`assets/SKILL-template.md` are this repository's own work. They carry the paired-rule pattern,
the layered topology, the SKILL.md structure contract and the boundary discipline, none of
which exist upstream. Tracking them as vendored would both misattribute them and make every
legitimate edit fail the provenance check.

---

## Playwright

[Playwright](https://playwright.dev/) and `@playwright/test` are open-source projects by
Microsoft Corporation, consumed here as npm dependencies under the Apache License 2.0. This
project is not affiliated with, endorsed by, or sponsored by Microsoft.

The `playwright-cli` skill folder is named after the third-party `@playwright/cli` package for
historical reasons only. Its content is this repository's own methodology and it teaches
`npx playwright open`, which ships inside `@playwright/test`. No `@playwright/cli` code is
vendored here.

---

## Everything else

All other skills, the ESLint plugin, the validation and gate scripts, the governance documents
and the constitution are original work in this repository.
