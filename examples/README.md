# Worked example — one requirement, traced to a passing test

The rules in this repository claim that spec-driven, Test-First delivery makes AI-written code traceable and reviewable. This page is the evidence: a real feature built through the full loop, with the artifacts quoted verbatim.

**Feature:** a Todo Management API — TypeScript, Fastify, Prisma, Zod, Vitest.
**Built by:** GitHub Spec Kit driving Claude Code, under the constitution in this repo.
**Cost:** roughly two hours end to end, including implementation and tests.

## The numbers

| Stage | Artifact | Count |
|---|---|---|
| What & why | `spec.md` | **14** functional requirements, zero technology mentioned |
| How | `plan.md` + `contracts/openapi.yaml` | stack chosen here, not earlier; API contract fixed |
| Tests **before** code | `test-plan.md` | **29** documented test cases, each mapped to requirements |
| Work breakdown | `tasks.md` | **66** dependency-ordered tasks |
| Executable result | `tests/**/*.spec.ts` | **16** files, **49** passing tests, ~18s |

Every documented test case carries an ID, and **all 29 IDs appear in executable test names.** That is the property that makes the chain checkable rather than asserted.

---

## The chain, traced on one requirement

Pick the requirement with the most security weight and follow it all the way down.

### 1. It starts as one sentence in the spec

`spec.md`, line 98 — no technology, no implementation, readable by a non-engineer:

> **FR-009**: System MUST ensure a user can only view, update, complete, or delete todos they own, and MUST deny access to todos owned by other users **without disclosing their existence**.

### 2. The clarify step forced a real security decision

The phrase "without disclosing their existence" did not survive as prose. It became a resolved ambiguity, recorded in `test-plan.md`:

> **Foreign-todo response is 404, not 403 — RESOLVED**: fixed by `research.md` Decision 6 and codified in `contracts/openapi.yaml`.

A `403` tells an attacker the record exists. A `404` does not. That decision is now **mechanically verifiable in the contract** — `openapi.yaml` documents `404` on every `/todos/{id}` operation and contains **zero** occurrences of `403`.

### 3. It becomes six test cases, before any code exists

`test-plan.md` expands one requirement into six cases across the whole surface:

| Case | What it pins down |
|---|---|
| TC-09 | List returns only the caller's todos |
| TC-12 | Reading another user's todo → 404, non-disclosing |
| TC-15 | Updating another user's todo → 404, and nothing changes |
| TC-20 | Completing another user's todo → 404, target untouched |
| TC-23 | Deleting another user's todo → 404, target remains |
| TC-27 | A create body carrying `ownerId` or `status` is rejected |

TC-27 is the one a human would have missed: ownership can also be broken by *letting the client set the owner*, not only by reading someone else's row.

### 4. The coverage matrix binds it to work items

One row of `test-plan.md`, generated before implementation:

```
FR-009 | TC-09, TC-12, TC-15, TC-20, TC-23, TC-27
       | T031, T037, T039, T047, T049, T056 → T032, T040, T041, T050, T051, T057, T058, T063
```

Fourteen of the 66 tasks exist because of this single requirement. One of them is a standing invariant rather than a feature:

> **T063** — Audit `src/todos/todo.repository.ts` so every query is `ownerId`-scoped, and add a regression test for the invariant.

### 5. It ends as tests whose names carry the case IDs

From `tests/integration/todos-isolation.spec.ts` and siblings:

```
TC-09  lists all and only the caller's todos
TC-12  returns 404 — not 403 — when reading another user's todo
TC-15  returns 404 and changes nothing when updating another user's todo
TC-20  returns 404 and leaves another user's todo untouched
TC-23  returns 404 and keeps another user's todo
TC-27  owns a validly created todo by the caller
```

The chain closes: **one sentence → a named security decision → six cases → fourteen tasks → six named, passing tests.** Any link can be checked by grep. Nothing has to be taken on trust.

---

## Why 29 documented cases became 49 tests

One documented case often splits into several executable tests — different inputs, different status codes, different actors. TC-12 alone runs as separate Alice-reads-Bob and Bob-reads-Alice assertions. The mapping is deliberately one-to-many downward and never many-to-one upward: **every executable test traces to exactly one documented case**, so a failure names the requirement it broke.

## What the same loop produced on two other toolchains

The feature was rebuilt through two more spec-driven toolchains to test whether the discipline or the tool was doing the work.

| Toolchain | Tests | Notable outcome |
|---|---|---|
| **GitHub Spec Kit** | 49 passing | The walkthrough above. |
| **OpenSpec** | 39 passing | Change/delta model — the spec is edited as a diff and archived on completion. |
| **BMAD** (v6 + TEA Test Architect) | 39 passing | **Quality gate returned `CONCERNS` with every test green.** |

That last row is the most useful result in the whole exercise. Full coverage, all tests passing, and the gate still refused a clean pass — because two security items were open **by explicit decision**, with a named reviewer, a stated reason, and a remediation date. `"The tests pass"` and `"we are ready to ship"` are different claims, and only one of them is a gate.

## If you have five minutes

Read these three things, in this order:

1. **`spec.md` FR-009** — one sentence, no technology.
2. **The `test-plan.md` coverage-matrix row for FR-009** — the same sentence, expanded into six cases and fourteen tasks, before a line of code existed.
3. **The six test names above** — the same six IDs, now executable and green.

If the first and the last agree, the loop held.

---

## A note on access

The three demo repositories are internal, so this page **excerpts** the artifacts rather than linking them. Everything quoted here is verbatim from `specs/001-todo-management-api/` — the requirement text, the resolved-ambiguity note, the coverage-matrix row, the task text, and the test names.

To reproduce the loop on your own feature, the sequence is: `constitution → specify → clarify → plan → test-plan → tasks → implement`, with a human approving each artifact before the next step runs. The gates are the approvals, not a separate tool.
