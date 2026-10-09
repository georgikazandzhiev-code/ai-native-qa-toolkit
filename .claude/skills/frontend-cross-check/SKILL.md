---
name: frontend-cross-check
version: 1.0.6
description: Verify testids, message strings, routes, and component structure against the frontend source repo at <sibling-repos>/frontend (git pull first — it is the source of truth for UI contracts). Use before authoring or modifying any selector, page object, UI test, or message constant. Triggers — "does this testid exist", "what string does the UI show", "frontend source". Not for runtime behavior (playwright-cli) or API contracts (api-testing).
metadata:
  category: cross-cutting
---

# Frontend Cross-Check

## Critical

- **`git pull` `<sibling-repos>/frontend` BEFORE every cross-check.** Stale local clones produce wrong assumptions. Per `~/.claude/CLAUDE.md` Routed Skill Index: when investigating frontend behavior, always pull first.
- **The frontend repo is the source of truth** for stable artifacts: testids, route paths, component structure, message strings emitted in source, schema-form field names, route file conventions. When a skill (e.g. `selectors`, `enums`) makes a claim about how the frontend works, **verify it by grepping the source** — do not rely on the skill's example values without confirmation.
- **Use `npx playwright open` for runtime / dynamic behavior** — state-dependent text (`Refreshing…`), toast timing, post-click DOM, network races. Source code does not show these. (See the `playwright-cli` skill.)
- **Pair the two sources.** Stable artifact (testid, route, component shape) → frontend source. Runtime behavior (state changes, timing) → live app via `npx playwright open`. Do not pick one and ignore the other.
- **When the frontend source contradicts a skill,** surface the drift in the same edit — fix the skill text, do not silently work around the contradiction. (Example: if `selectors` says `field-field-${path}` and the source emits `schema-field-${name}`, the skill is wrong, not the source.)
- **Do not edit the frontend repo.** This skill is read-only — grep, read, audit, report. Frontend changes go through the frontend owners.
- **Frontend lives at** `<sibling-repos>/<frontend-repo>`. Read its `package.json` before grepping: the component conventions, i18n library and toast library decide where testids and strings actually come from.

## When to cross-check

Open the frontend before authoring or modifying any of these, every time:

| Author / modify | Cross-check what in frontend |
|------------------|--------------------------------|
| **Selector / page object** (`pages/**`) | `data-testid` emissions; component structure (Radix vs plain HTML); accessible roles and labels; `disabled` / loading state attributes |
| **UI message constant** (`enums/app/messages.ts`, when created) | Message keys in the i18n message catalog (e.g. `messages/en.json`); inline string literals in `src/components/**`; toast strings; validation messages |
| **Route reference** in a UI test | File-based routes in the app's route folder (e.g. `src/routes/`; file → URL mapping) |
| **Storage-state path / auth setup** | Frontend's auth flow, Keycloak realm name, redirect targets |
| **Schema-form field selector** | The schema-form component's emission pattern (testid prefix, error testid prefix) |
| **Toast assertion** | Toast call sites (e.g. Sonner's `toast.success(...)`) — does the call pass a literal or a catalog message key? |
| **Form / input by label** | Whether the input has a real `<label>` association or only a placeholder |
| **API client / endpoint string in a UI test** | The frontend's API client (`src/lib/api/**`) — endpoint shape may differ from OpenAPI |

If the answer to any of these isn't in the QA repo's existing skill or the frontend source — **do not guess**. `git pull`, grep, confirm.

## Workflow

### Phase 1 — Pull

Always start with:

```
cd <sibling-repos>/frontend && git pull --rebase
```

If this fails (uncommitted local changes, network issue), **stop and notify the human**. Do not work against a stale clone.

### Phase 2 — Targeted grep

Pick the right grep for the question. Examples:

| Question | Grep |
|----------|------|
| What testids are emitted by component X? | `grep -rE 'data-testid' <sibling-repos>/frontend/src/components/<area>/` |
| Does testid `<name>` exist? | `grep -rn "<name>" <sibling-repos>/frontend/src/` |
| What's the schema-form field emission pattern? | `grep -nE "data-testid" <sibling-repos>/frontend/src/components/schema-form/schema-form.tsx` |
| What strings does `<component>.tsx` emit? | Read the file directly: `cat <sibling-repos>/frontend/src/components/<area>/<file>.tsx` |
| What message keys exist? | `cat <sibling-repos>/frontend/messages/en.json` (point it at the app's i18n message catalog; the path depends on the i18n library) |
| What route file maps to URL `/jobs/:id`? | `ls <sibling-repos>/frontend/src/routes/` (file-based routing — `jobs.$jobId.tsx` → `/jobs/:jobId`; swap in the app's route folder) |
| What Radix primitives are imported? | `grep -rnE "from ['\"][^'\"]*radix" <sibling-repos>/frontend/src/` (narrow to the app's shared-component folder once you know it) |
| Does the app use Sonner? | `grep -rn "from 'sonner'" <sibling-repos>/frontend/src/` |

Do **not** load the entire frontend repo into context. Targeted greps only.

### Phase 3 — Apply findings

When findings contradict an existing skill, **fix the skill in the same edit**. Do not silently work around drift.

When findings confirm an existing skill, no action needed — proceed with authoring.

When findings reveal something the skill doesn't say (e.g. a new testid prefix pattern), surface it to the human:

- "I found that `src/components/<X>/<file>.tsx` emits `<pattern>`. The `selectors` skill doesn't mention this — should I add it to `selectors/reference.md § 4 Framework testid taxonomy`?"

### Phase 4 — Note pairing with `npx playwright open`

For things the source can't tell you (does the toast actually appear? what does the button text become while loading?), pair the source check with a live exploration via `npx playwright open`. The two together cover what each one alone misses.

## Anti-patterns

- ❌ Skipping `git pull` and using a 3-week-old local clone. Frontend changes daily; stale claims propagate into stale skills.
- ❌ Loading the entire frontend into context. Targeted greps only; the repo has hundreds of files.
- ❌ Editing the frontend repo from here. This skill is read-only.
- ❌ Treating the frontend's test files (`*.test.tsx`, `*.stories.tsx`) as the source of truth for production behavior. The component file (`<name>.tsx`) is canonical; tests and stories may use stub data.
- ❌ Confirming a claim against the i18n message catalog (e.g. `messages/en.json`) only. A frontend can have a catalog and still emit inline English literals — both sources matter.
- ❌ Treating routes as URLs. With a file-based router, `jobs.$jobId.tsx` is the route file, **`/jobs/:jobId`** is the URL. Translate carefully.
- ❌ Assuming the QA orchestrator's claim about the frontend is correct without verification. The orchestrator was authored before this skill existed; cross-checks may catch drift.
- ❌ Confirming a Radix primitive by checking `package.json` `@radix-ui/*` deps only. Primitives often arrive indirectly — wrapped by a component kit, or under a package name other than `@radix-ui/*` — check the import lines, not just the manifest.

## Self-review checklist

- [ ] `git pull` ran successfully on `<sibling-repos>/frontend` before any check.
- [ ] Targeted grep was used, not a full-repo scan.
- [ ] The component file (`<name>.tsx`) was the source of truth, not the test or stories file.
- [ ] If the finding contradicts an existing skill (`selectors`, `enums`, `playwright-cli`, `~/.claude/CLAUDE.md`, etc.), the skill was fixed in the same edit.
- [ ] If the finding revealed something new, the human was asked whether to fold it into the matching skill / reference.
- [ ] Runtime behavior was paired with `npx playwright open` exploration where source code was insufficient.
- [ ] No frontend files were modified.

## Examples

### Example 1 — Verify the schema-form testid pattern before authoring a page object

User says: *"Add a page object for the new notification-rule form."*

1. **`git pull` frontend.**
2. **Grep:** `grep -nE "data-testid" <sibling-repos>/frontend/src/components/schema-form/schema-form.tsx`.
3. Observe: schema-form emits `schema-field-${fieldName}` on each field wrapper, `field-field-${fieldPath}` on the input or trigger inside it, and `error-${fieldName}` for validation errors.
4. **Cross-check against `selectors` skill:** if the skill says something different (e.g. that `schema-field-${fieldName}` is the input itself), the skill is **wrong** — fix the skill in this edit. (The frontend source is canonical.)
5. Author the page object with the correct testid pattern, as the fallback behind `getByLabel`: `getByTestId('field-field-name')` for the input (its wrapper is `schema-field-name`), `getByTestId('error-name')` for the error, etc.
6. For dynamic state (loading, errors during submit) → pair with `npx playwright open` (see the `playwright-cli` skill).

### Example 2 — Capture an exact UI message before adding it to `enums/app/messages.ts`

User says: *"Centralize the 'Worker registered successfully' toast text."*

1. **`git pull` frontend.**
2. **Grep:** `grep -rn "Worker registered" <sibling-repos>/frontend/src/`.
3. Observe: `src/components/settings/workers/register-worker-sheet.tsx` calls `toast.success('Worker registered successfully')` with the inline literal — **not** a catalog message key.
4. **Decide source:** since this is an inline literal (not a catalog message key), capture the exact string from the source: `"Worker registered successfully"`. No quotes, no period, exact case.
5. Add to `enums/app/messages.ts` per the `enums` skill (when that file exists). Cross-reference the source path in the JSDoc so the next maintainer can verify.
6. **Optional:** open the live app and trigger the action to confirm the rendered text matches the source — an i18n layer or formatter may transform some strings at render time, even ones written as literals.

### Example 3 — Confirm a route exists before writing a UI test

User says: *"Write an e2e for the notifications history page."*

1. **`git pull` frontend.**
2. **List routes:** `ls <sibling-repos>/frontend/src/routes/`.
3. Observe: `notifications.history.tsx` exists → URL is `/notifications/history` (file-based routing with flat file names: dot = path separator).
4. Confirm by reading the route file: `cat <sibling-repos>/frontend/src/routes/notifications.history.tsx | head -20` — look for the route declaration (a path string the file registers with the router); that string is the URL. If the router has no in-file declaration, read the generated route tree / route manifest (or the router's naming-convention docs) instead.
5. Author the test using `/notifications/history` (or whatever the file confirms). Don't guess from the skill or the orchestrator — the route file is canonical.

### Example 4 — Cross-check a Radix primitive claim before writing a selector

User says: *"The `selectors` skill says the create-job button is wrapped in a Radix `<Select>` — is that right, and does it change the locator?"*

1. **`git pull` frontend.**
2. **Grep:** `grep -rn "create-job-button" <sibling-repos>/frontend/src/`.
3. Read the component file and follow its imports. A Radix import (e.g. `import * as SelectPrimitive from '@radix-ui/react-select'`), in the file itself or in the component-kit wrapper it imports, confirms a Radix primitive.
4. Either way, start with Playwright's default order (`getByRole` first, test-id as fallback). Knowing it's Radix only tells you the accessible name *may* be nested or unstable. The `selectors` exception applies only if the role or label locator then fails for one of its two named reasons. A plain `<button>` from React makes that even less likely.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `git pull` fails: "Your local changes to the following files would be overwritten" | Uncommitted local changes in the frontend clone | `cd <sibling-repos>/frontend && git status` — surface the dirty files to the human; do not stash or reset without asking. |
| `git pull` fails: network / unreachable | Bitbucket / GitHub / VPN issue | Stop and notify the human. Working against a stale clone is not OK; do not "just proceed for now". |
| `grep -rn` returns thousands of hits | Search term too broad (e.g. `data-testid`) | Scope by directory (`src/components/<area>/`) or by exact match (`'data-testid="schema-field-'`). |
| The testid I'm looking for doesn't appear in source | Either testid was never added (FE didn't agree to it), OR it's dynamically composed (template literal) | Search for partial pattern (`job-actions-` for `job-actions-${id}`). If still nothing: the testid does not exist; ask FE to add one or pick a different selector strategy per the `selectors` skill priority hierarchy. |
| The string in the i18n message catalog (e.g. `messages/en.json`) doesn't match the rendered UI | The i18n library may apply formatting / pluralization | Open the app via `npx playwright open` and capture the rendered text. Source is the starting point; live app is the final word for translated strings. |
| The route file path doesn't translate cleanly to a URL | File-based routers have naming conventions (`.$param.tsx`, `_layout.tsx`, `index.tsx`) | Read the path string the route file registers with the router (its route declaration) — that string IS the URL. With no in-file declaration, the generated route tree / route manifest is the source. |
| Frontend uses both inline literals AND catalog message keys | The i18n message catalog covers only part of the UI | Both are valid sources of truth until every string moves to the catalog — check each string where it is actually emitted. |
| I want to verify a backend / API claim | Wrong skill | This skill covers the **frontend repo only**. For backend or API contracts, use the OpenAPI spec or read `<sibling-repos>/backend` (see `master-context` (project repo only — trimmed from this toolkit)). |

## See Also

- **`selectors`** — locator strategy. **Pair with this skill:** verify the testid exists in the frontend source before adding it to a page object.
- **`enums`** — UI message constants. **Pair with this skill:** verify the exact string in the frontend source (inline literal or catalog message key) before encoding it.
- **`playwright-cli`** — live-app exploration via `npx playwright open`. **Pair with this skill:** source for stable artifacts; live app for runtime behavior.
- **`api-testing`** — sister concern (API specs / Zod schemas). For backend contracts use OpenAPI; this skill is frontend-only.
- **`refactor-values`** — when a value cascades because of a frontend rename, use this skill to confirm the new value, then `refactor-values` to update QA-side consumers.
- **`master-context` (project repo only — trimmed from this toolkit)** — cross-repo platform encyclopedia + the `git pull` rule for sibling repos. This skill is the frontend-specific application.
