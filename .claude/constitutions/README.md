# Product-side testability constitutions

Three constitutions for the **application** repositories, not for the automation repository: two for the UI, one for the API.

The QA constitution (`.claude/CLAUDE.md`) governs how tests are written. These govern how the product is written **so those tests can exist at all** — the shift-left half of the same contract. A UI that cannot be addressed reliably cannot be tested reliably, and an API without a trustworthy contract cannot be tested against anything but itself, no matter how disciplined the test suite is.

| File | Stack | Test framework | Contract it enforces |
|------|-------|----------------|----------------------|
| [`web-testability.md`](web-testability.md) | Web frontend (HTML / React) | Playwright | Semantic roles and labels first, kebab-case `data-testid` as fail-safe |
| [`mobile-testability.md`](mobile-testability.md) | Flutter | LeanCode Patrol | Centralised `Key`s — never visible or localised text |
| [`api-testability.md`](api-testability.md) | Backend / API services | Any API test stack (generated client + schema validation) | Schema-first OpenAPI: the spec is reviewed before the code, documents every status code, and is diffed in CI |

## How to use them

Drop the matching file into the **product** repo as its `CLAUDE.md`, or merge it into an existing one:

```bash
cp web-testability.md    <frontend-repo>/CLAUDE.md
```

```bash
cp mobile-testability.md <flutter-repo>/CLAUDE.md
```

```bash
cp api-testability.md    <backend-repo>/CLAUDE.md
```

Then the coding agent building the UI is held to the locator contract at authoring time, instead of QA discovering an unaddressable component after the feature is merged. The agent building an API is held to the contract-first workflow: the OpenAPI spec changes, and is reviewed, before the endpoint does.

Each file carries a `<!-- toolkit-version: x.y.z -->` stamp under its title, written by `npm run stamp` and checked by `npm run validate` (check 14). The stamp travels with the copy, so a product repo's `CLAUDE.md` says which version of the testability rules it took, and a stale copy can be spotted by comparing it with this repo's `VERSION`. If you merge the file into an existing `CLAUDE.md` instead of replacing it, keep the stamp line.

## Why they are separate from the skills

The skills in `.claude/skills/` are loaded by whoever is **writing tests**. These constitutions are loaded by whoever is **writing the application** — a different repository, a different agent, a different task. Mixing them would put frontend build rules in front of an agent authoring a spec, and the QA rules in front of an agent building a form. Keeping them in their own folder makes the audience unambiguous.

## Shared principles

The two UI documents encode the same four ideas, expressed in each stack's idiom:

1. **Nothing user-reachable may be unaddressable.** If a person can see it, click it, or read an error on it, the test framework must be able to find it.
2. **Never key on anything that changes for cosmetic reasons.** Not CSS classes, not layout position, not visible or localised text.
3. **Every collection row is keyed on its business ID, never a loop index.** An index-based key silently points at a different record after the first sort, filter, or page change — and the test keeps passing while asserting the wrong thing.
4. **Loading, empty, and error states are first-class, visible, and addressable.** A state with no hook is a state no test can wait for or assert.

The API document applies the same thinking to the contract instead of the screen: nothing a client can call or receive may be undocumented, the contract exists before the code, every error is predictable and names its cause, and test data can be created and removed without going through the UI.

## Provenance

The web and mobile constitutions are adapted from the internal *QA rules* document, restructured into two standalone constitutions with a definition-of-done checklist added to each. The API constitution was added during the October 2026 review, drawing on direct experience with a schema-first process: the OpenAPI spec was updated right after grooming, and the QA client was regenerated from it so tests could not drift from the contract.
