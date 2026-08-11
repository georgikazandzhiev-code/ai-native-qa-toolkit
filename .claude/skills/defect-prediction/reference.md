# Defect Prediction — reference

Commands, arithmetic and record shapes. Decisions and interpretation live in [`SKILL.md`](SKILL.md).

## Exclusions (apply to every signal)

Before computing anything, exclude these or the ranking will be wrong:

| Exclude | Why |
|---------|-----|
| Merge commits (`--no-merges`) | A merge touches every file in the branch without meaningfully changing it. |
| Bulk reformat / lint-fix commits (by hash) | One Prettier run inflates churn across the whole repo uniformly. |
| Generated code, lockfiles, `dist/`, snapshots | High churn, zero defect risk from our side. |
| Test files, when ranking product code | Rank what is under test. Test instability is `flakiness-triage`'s problem. |
| Vendored / third-party directories | Not ours to fix. |

## Signal 1 — Bug-fix density (primary)

Count commits touching each file whose subject marks a fix. Match on both conventional-commit prefixes and the words teams actually use:

```bash
git log --no-merges --since="90 days ago" --name-only --pretty=format:"%s" \
  --grep="^fix" --grep="bug" --grep="hotfix" --grep="regression" -i
```

If the repo uses ticket keys, match the bug-ticket prefix instead of the words — far more reliable than message conventions.

Density = fix-commit count per file. Do **not** normalise by file size; a small file fixed five times is a genuine hotspot.

## Signal 2 — Churn

Two components, both per file over the window:

```bash
git log --no-merges --since="90 days ago" --numstat --pretty=format:"" \
  | awk 'NF==3 {add[$3]+=$1; del[$3]+=$2; n[$3]++} END {for (f in n) print n[f], add[f]+del[f], f}' \
  | sort -rn
```

Column 1 is commit count, column 2 is lines touched. Commit count is the better signal; lines touched catches large rewrites that a single commit hides.

## Signal 3 — Recency

Days since the last non-merge commit per file:

```bash
git log --no-merges -1 --format="%ad" --date=short -- <file>
```

Score inversely: touched within 7 days scores highest, then decay to zero at the window edge. A file untouched inside the window scores 0 on this signal.

## Signal 4 — Author spread

```bash
git log --no-merges --since="90 days ago" --format="%an" -- <file> | sort -u | wc -l
```

Read 1 author as low, 2–3 as moderate, 4+ as high. Cap the contribution — a file touched by twelve people is not four times riskier than one touched by three.

## Signal 5 — Co-change coupling

Files that habitually change in the same commit. Extract per-commit file sets, then count pair frequency:

```bash
git log --no-merges --since="90 days ago" --name-only --pretty=format:"---%H" \
  | awk '/^---/{c++; next} NF{print c"\t"$0}'
```

Group by commit id, emit pairs, count. A file that co-changes with many distinct others carries ripple risk — a change here lands somewhere nobody inspected.

Cheap proxy when the full pair analysis is not worth it: **average number of sibling files per commit that touches this file.**

## Signal 6 — Complexity proxy

No dedicated tool required. In descending usefulness:

| Proxy | How |
|-------|-----|
| Branch count | Count `if`, `else if`, `case`, `&&`, `||`, `?`, `catch` occurrences. |
| Max nesting depth | Deepest indentation level in the file. |
| File length | Lines, excluding imports and comments. |

Amplifier only. **Multiply into the score; never rank on it alone** — a stable complex file is not a risk.

## Signal 7 — Falsified patterns

Count `.qe-memory` patterns whose `applies_to` includes the file and which carry falsification entries. See the `qe-pattern-memory` skill. Zero when no store exists — do not substitute a guess.

## Normalisation and scoring

1. **Per signal, rank the files and convert to a percentile** (0–1). Percentiles, not raw values — raw churn and raw fix count are on incompatible scales, and one outlier file otherwise dominates the whole ranking.
2. **Multiply each percentile by its weight** from `SKILL.md § Weighting`.
3. **Sum** to a 0–1 score. Present as a rank position plus the per-signal columns — never the bare number.

Output shape (this is the deliverable, and the per-signal columns are mandatory):

| Rank | File | Fix | Churn | Recency | Authors | Coupling | Cx | Falsified | Score | Coverage | Cell |
|-----:|------|----:|------:|--------:|--------:|---------:|---:|----------:|------:|---------:|------|
| 1 | `src/billing/proration.ts` | 6 | 14 | 3d | 5 | 9 | high | 1 | 0.91 | 34% | **high risk / low coverage** |
| 2 | `src/auth/session.ts` | 4 | 9 | 11d | 3 | 6 | med | 0 | 0.78 | 81% | high risk / good coverage |

## Changeset-level variant (PR review)

For a single PR, the window is the PR itself, so churn and recency collapse. Use instead:

| Signal | Changeset form |
|--------|----------------|
| Bug-fix density | Historical fix count of each touched file (still the primary signal — pull from history, not the PR). |
| Blast radius | Coupling of each touched file — how many files usually change with it but are **absent** from this PR. Absence is the risk. |
| Size | Lines changed per file in this PR. |
| Novelty | Is this file being touched by an author who has not touched it before? |
| Coverage delta | Did coverage on the touched lines go down? |

The output of a PR-level ranking is usually **review attention**, not new tests. See `SKILL.md § Examples`, Example 2.

## Calibration record

One row per release. Three rows is the minimum that makes the weighting defensible.

| Field | Example |
|-------|---------|
| Release | 2026.08.1 |
| Ranking date | 2026-08-04 |
| Window | 90 days |
| Scope | release diff, 84 files |
| Weights | default (30/20/15/10/10/10/5) |
| Files in top quartile | 21 |
| Escaped defects | 4 |
| Escaped defects in top quartile | 3 |
| Hit rate | 75% |
| Action | weights kept |

Store it in `.qe-memory/` so the next release inherits it rather than starting from opinion. Interpretation bands are in `SKILL.md § Calibration`.

## When history is unusable

Squashed imports, a young repo, or a monorepo migration all destroy the history these signals depend on. Do not fabricate a ranking. Fall back to **requirement-risk assessment**: rank by user impact × complexity of the acceptance criteria × integration count, sourced from the spec rather than from git. State plainly which method was used — the two are not comparable, and a calibration record must not mix them.
