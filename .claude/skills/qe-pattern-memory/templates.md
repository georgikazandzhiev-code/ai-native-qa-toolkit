# Pattern Memory — copy-paste templates

Skeletons only. Rules and lifecycle live in [`SKILL.md`](SKILL.md).

## Pattern file — `.qe-memory/patterns/<slug>.md`

```markdown
---
id: <kebab-case-slug>              # must equal the filename
domain: api | ui | flake | data | perf | security | build
tier: candidate                    # candidate | active | canonical | retired
evidence: EXECUTED                 # EXECUTED | STATIC | INFERRED | CONJECTURE
uses: 1
successes: 1
failures: 0
success_rate: 1.00                 # successes / uses, 2 decimals
created: 2026-08-11                # absolute date, never "today"
last_used: 2026-08-11
applies_to:                        # globs or paths this pattern constrains
  - tests/app/e2e/**
  - pages/**
---

## Claim

<One falsifiable sentence. What is true about this codebase.>

## Why it matters

<What breaks if a future session does not know this. One or two sentences.>

## How to apply

<The concrete action. Reference a skill rather than restating it.>

## Evidence

- **Class:** EXECUTED
- **Command:** `<the exact command>`
- **Output:** <the relevant excerpt, trimmed>
- **Date:** 2026-08-11

## Falsifications

<None yet.>
```

## `INDEX.md` — one line per non-retired pattern

Sorted by domain, then slug. The line must carry the **claim**, not the slug restated.

```markdown
# QE Pattern Memory — Index

Read this file before exploring. Open a pattern body only when it touches your task.
Lifecycle, scoring and promotion rules: `qe-pattern-memory` skill.

| Pattern | Tier | Domain | Claim |
|---------|------|--------|-------|
| [probe-delete-before-synthetic-409](patterns/probe-delete-before-synthetic-409.md) | canonical | api | A probe cannot be deleted while a synthetic references it — delete the synthetic first or the API returns 409. |
| [radix-dropdown-anchor-and-drill](patterns/radix-dropdown-anchor-and-drill.md) | active | ui | Radix dropdown items re-render after their data XHR; address the container first, then drill, or the click hits a stale node. |
| [list-meta-total-absent-on-empty](patterns/list-meta-total-absent-on-empty.md) | candidate | api | `meta.total` is omitted rather than zero when a list endpoint returns no rows. |
```

## Falsification entry — append under `## Falsifications`

Never overwrite an earlier entry. Append, and update the counters in frontmatter in the same edit.

```markdown
### 2026-08-11 — demoted canonical → active

- **Expected:** `meta.total` present on every list response.
- **Observed:** absent when the result set is empty.
- **Artifact:** `GET /api/v1/synthetics?name=zzz-none` → `200 {"data":[]}` (no `meta`).
- **Action:** demoted to `active`; filed <TICKET> against the API contract.
- **Claim now reads:** `meta.total` is present whenever `data` is non-empty.
```

## Retirement — move to `.qe-memory/retired/<slug>.md`

Keep the whole file. Add the two fields, remove the `INDEX.md` line.

```markdown
---
id: <slug>
tier: retired
retired: 2026-08-11
retired_reason: Superseded by <other-slug> after the API added a stable meta envelope in v2.
# ... all original frontmatter fields kept as-is for the record ...
---
```

## Bootstrapping a store in a repo that has none

```bash
mkdir -p .qe-memory/patterns .qe-memory/retired
```

Then create `INDEX.md` from the template above with an empty table, and commit it with the first pattern — never empty on its own.
