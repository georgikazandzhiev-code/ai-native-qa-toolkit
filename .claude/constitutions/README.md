# Product-side testability constitutions

Two constitutions for the **application** repository, not for the automation repository.

The QA constitution (`.claude/CLAUDE.md`) governs how tests are written. These govern how the product is written **so those tests can exist at all** — the shift-left half of the same contract. A UI that cannot be addressed reliably cannot be tested reliably, no matter how disciplined the test suite is.

| File | Stack | Test framework | Locator contract |
|------|-------|----------------|------------------|
| [`web-testability.md`](web-testability.md) | Web frontend (HTML / React) | Playwright | Semantic roles and labels first, kebab-case `data-testid` as fail-safe |
| [`mobile-testability.md`](mobile-testability.md) | Flutter | LeanCode Patrol | Centralised `Key`s — never visible or localised text |

## How to use them

Drop the matching file into the **product** repo as its `CLAUDE.md`, or merge it into an existing one:

```bash
cp web-testability.md    <frontend-repo>/CLAUDE.md
```

```bash
cp mobile-testability.md <flutter-repo>/CLAUDE.md
```

Then the coding agent building the UI is held to the locator contract at authoring time, instead of QA discovering an unaddressable component after the feature is merged.

## Why they are separate from the skills

The skills in `.claude/skills/` are loaded by whoever is **writing tests**. These constitutions are loaded by whoever is **writing the application** — a different repository, a different agent, a different task. Mixing them would put frontend build rules in front of an agent authoring a spec, and the QA rules in front of an agent building a form. Keeping them in their own folder makes the audience unambiguous.

## Shared principles

Both documents encode the same four ideas, expressed in each stack's idiom:

1. **Nothing user-reachable may be unaddressable.** If a person can see it, click it, or read an error on it, the test framework must be able to find it.
2. **Never key on anything that changes for cosmetic reasons.** Not CSS classes, not layout position, not visible or localised text.
3. **Every collection row is keyed on its business ID, never a loop index.** An index-based key silently points at a different record after the first sort, filter, or page change — and the test keeps passing while asserting the wrong thing.
4. **Loading, empty, and error states are first-class, visible, and addressable.** A state with no hook is a state no test can wait for or assert.

## Provenance

Adapted from the internal *QA rules* document (web + mobile), restructured into two standalone constitutions with a definition-of-done checklist added to each.
