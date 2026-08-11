# Mutation Testing — reference

Catalogs and config shapes. Rules and triage live in [`SKILL.md`](SKILL.md).

## Operator catalog

What a mutant actually changes, and what a survivor in that class usually means.

| Operator | Mutates | A survivor usually means |
|----------|---------|--------------------------|
| **Arithmetic** | `+` ↔ `-`, `*` ↔ `/`, `%` | A computed value is never asserted — only that the call returned. |
| **Relational** | `<` ↔ `<=` ↔ `>` ↔ `>=` | Boundary conditions untested. The single highest-value survivor class. |
| **Equality** | `===` ↔ `!==`, `==` ↔ `!=` | A branch is exercised but its outcome is not checked. |
| **Logical** | `&&` ↔ `\|\|`, operand removal | Compound conditions tested on one combination only. |
| **Conditional boundary** | `if (x)` → `if (true)` / `if (false)` | The branch is dead in tests, or both arms produce the same observed result. |
| **Unary** | Removes `!`, flips `+x`/`-x` | Negation not asserted — common in permission and validation checks. |
| **String literal** | Replaces string content | Often benign (log text) — but a survivor on a **message that is part of an API contract** is a real gap. |
| **Array / object literal** | Empties collections | A test asserts a call happened but not what it returned. |
| **Optional chaining** | `a?.b` → `a.b` | Null-path handling untested. |
| **Assignment** | `+=` ↔ `-=`, etc. | Accumulated state never asserted. |
| **Block removal** | Empties a function body | The function is called but its effect is not observed. A survivor here is severe. |

Priority when triaging a long survivor list: **block removal → relational → equality → logical → unary**, then the rest. That order tracks how much a user would notice.

## Stryker config shape (TypeScript, vitest)

Install as a dev dependency alongside the matching runner plugin, then a scoped config. Keys that matter:

| Key | Purpose | Note |
|-----|---------|------|
| `mutate` | Glob of files to mutate | **The scoping knob.** Point it at changed files or one module — never the default. |
| `testRunner` | `vitest` or `jest` | Must match the project's actual runner. |
| `timeoutMS` / `timeoutFactor` | Per-mutant cap | Required. Without it, one infinite-loop mutant hangs the run. |
| `concurrency` | Parallel mutant workers | Start at cores − 2. Higher values make a flaky suite look blind. |
| `thresholds.break` | Fail the run below this score | Leave **unset** until a baseline exists over ≥ 3 runs. |
| `incremental` + `incrementalFile` | Reuse prior results | Turns a 2-hour re-run into minutes. Enable once the first baseline exists. |
| `disableTypeChecks` | Skip TS checks on mutated files | Usually needed — mutants frequently do not type-check. |
| `reporters` | `html`, `clear-text`, `json` | Keep `json` for baseline diffing between runs. |

Two gotchas specific to this stack:

- **A flaky suite reads as a blind suite.** Stryker cannot distinguish "test did not catch the mutant" from "test failed for its own reasons and got retried". Run `flakiness-triage` first if the suite is not stable, and set runner retries to zero for the mutation run.
- **`z.strictObject` schemas are mutation-friendly.** A loose `z.object` accepts a mutated response shape, so schema-adjacent mutants survive for the wrong reason. Tightening the schema is the fix, not excluding the operator.

## Scope selection by changed files

Derive the `mutate` glob from the branch diff rather than hand-listing paths. Filter out what produces only noise:

- Exclude: `*.d.ts`, barrels (`index.ts` that only re-exports), generated clients, config, constants and enum files, test files themselves.
- Include: services, helpers, body builders, validators, schemas, anything with branching.

A file with no conditional and no arithmetic yields few meaningful mutants; spending run time on it is waste.

## Score-band interpretation

Bands are in `SKILL.md § Score bands and gating`. Two additional readings worth knowing:

- **Score high, coverage low** → a small, well-asserted core with large untested regions. The gap is coverage, not assertion quality.
- **Coverage high, score low** → the classic false-green shape. Tests execute broadly and check little. This is the pattern the constitution's P2 pillar exists to catch.

## Baseline record

Keep the baseline where the diff is visible in review, one line per scoped run:

| Field | Example |
|-------|---------|
| Date | 2026-08-11 |
| Scope | `src/todos/**` |
| Mutants | 118 |
| Killed | 96 |
| Survived (explained) | 3 |
| Equivalent (excluded) | 1 |
| Score | 81% |
| Runtime | 22 min |

Compare the next run against this row per scope. A drop with no new-code explanation is the regression the gate is for.

## Fault-injection break catalog (black-box)

One break at a time; revert immediately. Each row is a different question about the test's oracle.

| Break | Question it answers |
|-------|---------------------|
| Invert the expected status code | Does the test check status at all, or just that a response arrived? |
| Change an expected field value to a wrong one | Does the test assert on the body, or only on the envelope? |
| Add a required field to the Zod schema that the API does not send | Is the schema actually being parsed, and is it strict? |
| Remove a field the API does send, with `z.strictObject` | Does the schema reject unexpected extras? |
| Send a payload missing a required field | Does the negative matrix exist, and does the API validate? |
| Request another user's or tenant's resource | Is the isolation assertion real? (Pairs with the `owasp-security-testing` skill.) |
| Point the request at a non-existent id | Does the 404 path have a test, or does the suite only cover the happy path? |
