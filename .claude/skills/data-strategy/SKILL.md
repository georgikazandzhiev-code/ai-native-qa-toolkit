---
name: data-strategy
version: 2.0.0
description: Decide where every piece of test data comes from — JSON files vs faker vs env vs API seeding, per-test users, storage states. Use when a spec or helper creates payloads, seeds entities, picks credentials, or loads JSON; check here before adding any new generator. Triggers — "test data", "faker", "seed", "payload", "credentials", "test-data/". Not for env config/tokens (config) or changing existing cascading values (refactor-values).
metadata:
  category: domain
---

# Data Strategy Skill

Single source of truth for **where test data comes from** in this framework. Sister skill to `api-testing` (which covers **how API responses are asserted**). Cross-link: see [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md) when the data feeds an API spec.

## What's in each file

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | **Rules, decisions, anti-patterns.** Storage-location map, seven blessed patterns, decision tree, forbidden locations. | **Always** — on any test-data / helper / fixture / payload task. |
| **`reference.md`** | **Catalog of facts.** Inventory of existing factories, JSON files, Mailpit fixture, faker calls in use, env-token catalog. | **Load on lookup** — "Does a factory for X already exist?" / "Which JSON file holds boundary values?" |
| **`patterns.md`** | **Pattern recipes with code.** Full skeletons for each of the seven blessed patterns. | **Load During Authoring** — when picking and writing a specific pattern. |
| **`refactor-playbook.md`** | **Migration playbook** for moving existing test data into the canonical pattern. | **Load only when refactoring** existing data wiring (not for new data). |

## Critical

- **NEVER** redefine universal type-mismatch arrays (`[123, true, null, undefined]`, etc.) inline in a spec, helper, or schema. Import from `fixtures/api/invalid-types.ts` (`invalidString`, `invalidStringTypes`, `invalidNumber`, etc.). Why: every API spec needs the same negative coverage; inlining duplicates the contract and produces drift across resources.
- **NEVER** re-declare an array or constant that already exists in `test-data/app/*.json`. Import it (`import notificationsData from "../../../../test-data/app/notifications.json"`) and reference the property (e.g. `notificationsData.severities`). Before adding a local constant, search `test-data/app/` for the value. Why: duplicated constants diverge silently when only one copy is updated.
- **NEVER** generate app-defined strings with Faker — error messages, button labels, toast text, page headings, validation messages all live in `enums/app/*`. Why: Faker output is random; app-defined strings are contracts the UI emits verbatim. Encoding them in `enums/` keeps spec assertions in sync with the running UI.
- **NEVER** hardcode test content strings (names, emails, todo text, job names, descriptions) in a spec. Generate with `faker.<...>` (e.g., `faker.string.alphanumeric(6)`) for uniqueness — required for parallel safety. Why: hardcoded names collide when specs run concurrently (`fullyParallel: true`) and with a previous run's leftovers.
- **NEVER** hardcode a fixed expected value in a test, even one used in a single assertion. Fixed values come from the resource's `test-data/app/*.json` file (constitution: never hardcode). Why: an inline literal cannot be found, reviewed or updated with its siblings (`invalidId`, `nonExistentId`, boundary matrices), and drifts silently when the contract changes.
- **NEVER** introduce magic numbers (timeouts, retry counts, page-size limits, polling intervals) inline in helpers or specs. Route through `playwright.config.ts` for test-suite tuning, test-data JSON for domain-level limits (e.g. `test-data/app/worker.json` `defaultPageSize`), or `appConfig.timeouts.X` from `config/app.ts`. Why: scattered magic numbers can't be tuned centrally and rot independently.
- **ALWAYS** validate factory output with `Schema.parse(...)` and return the Zod-inferred type. Why: a factory that drifts from the API contract produces happy-path data that fails request validation in CI but passes locally — the worst kind of flake.
- **ALWAYS** load the [`refactor-values`](../refactor-values/SKILL.md) skill **before** editing any existing static-data file (`test-data/app/*.json`) or enum value. Why: these edits cascade through every assertion and data-driven loop that consumes them; an uncoordinated edit can silently invalidate dozens of tests.

## Core principle

> Every test creates its own data with the highest-isolation pattern that fits, and removes whatever it created. Shared mutable state across tests is a defect.

## Storage location map — where every kind of data lives

One canonical home per kind of data. Adding a file outside these locations is a smell — search inside the matching folder first.

| Kind of data | Lives in | Owner pattern | Example |
|--------------|----------|---------------|---------|
| **Static — boundary / validation matrices** | `test-data/app/<resource>-validation.json` | Pattern 4 | `test-data/app/httpJobValidation.json`, `test-data/app/backupJobValidation.json`, `test-data/app/webhookJobValidation.json` (legacy camelCase names — drift; new files use hyphen-case) |
| **Static — sentinels & lookup ids** | `test-data/app/<resource>.json` (keys: `invalidId`, `nonExistentId`, `sqlInjectionId`, `xssId`, etc.) | Pattern 5 | `test-data/app/worker.json`, `test-data/app/job-common.json`, `test-data/app/http-job.json`, `test-data/app/email-job.json` |
| **Static — frontend mock payloads** | `test-data/app/<resource>.json` (used in `route.fulfill`) | Pattern 5 (route stub) | No mock-JSON fixtures in this project today; reserved for future use — see `refactor-playbook.md §4` |
| **Static loader (JSON + transformation)** | `helpers/app/<topic>Loader.ts` (or `testDataLoader.ts`) | Pattern 5 wrapper | No loader helpers in this project today; reserved for future use |
| **Dynamic — typed factory (`createXData`)** | `helpers/app/test-data-generators.ts` (planned), OR co-located in `helpers/app/<topic>.ts` for topic-specific data today | Pattern 2 | `helpers/app/workers.ts` (`buildCreateWorkerBody`, `buildUpdateWorkerBody`), `helpers/app/jobs.ts` (`buildCreateJobBody` + 6 sibling per-type builders), `helpers/app/adminUsers.ts` (`generateUserPayload`) |
| **Dynamic — Object Mother (named scenarios)** | Same file as the base factory | Pattern 3 | Planned alongside the centralized `test-data-generators.ts` (e.g. `createWorkerForRegion`, `createMatchedWorkerAndJobPair`); none today |
| **Dynamic — request-shape builders (URLs / query strings)** | `helpers/app/<topic>.ts` | Pattern 2 (request shaping) | `helpers/app/workers.ts` (`buildListWorkersUrl`), `helpers/app/jobs.ts` (`buildListJobsUrl`) |
| **API seeder (`createX` + `deleteX`)** | `helpers/app/<topic>.ts` (paired) | Pattern 6 | `helpers/app/workers.ts`, `helpers/app/jobs.ts`, `helpers/app/adminTenants.ts`, `helpers/app/adminUsers.ts` |
| **Per-test user lifecycle (admin-API + Keycloak)** | `helpers/app/adminUsers.ts` (`setupTestUser` / `teardownTestUser`); password reset via `helpers/util/keyCloak.ts` (`getAuthenticatedKcAdminClient`, `getUserIdByEmail`, `resetUserPasswordById`) | Pattern 7 | `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken)` |
| **Per-test user emails (Mailpit plus-addressing)** | `helpers/util/mailpit.ts` | Pattern 7 | `getNextTestEmail(baseEmail)`, `MailpitHelper` |
| **Personas — UI session (storage state JSON)** | `.auth/app/<persona>Session.json` (generated; not committed) | Pattern (persona) | `.auth/app/appMainUserSession.json` |
| **Personas — UI session generator** | `helpers/app/createStorageState.ts` | Pattern (persona) | `createAppStorageState({ email, password, totpSecret, storageStatePath })` |
| **Personas — bearer tokens** | `tokens.full()` / `.admin()` / `.zero()` from `config/env.ts`, reading the `USER_ACCESS_TOKEN_*` values that `tests/app/login.setup.ts` writes into `process.env` | Pattern (persona) | `USER_ACCESS_TOKEN_FULL`, `USER_ACCESS_TOKEN_ADMIN` |
| **Persona credentials (email/password/TOTP)** | `env/.env.<environment>` (shape in `env/.env.example`); read only inside `login.setup.ts` | Pattern (persona) | See [reference.md §1.3](reference.md#13-user-credentials-email--password--totp-secret-triplets) |
| **URLs and endpoint paths** | `config/app.ts` (`appConfig.apiUrl`, `appConfig.api.JOBS`, `appConfig.api.WORKERS`, …) | n/a | `appConfig.api.ADMIN_TENANT`, `appConfig.api.JOBS`, `appConfig.api.WORKERS` |
| **Reference enums (Qase suites, job types)** | `enums/app/<topic>.ts` | n/a | `enums/app/qase-suites.ts` |
| **Zod request/response schemas (the contract)** | `fixtures/api/schemas/app/<resource>.ts` | n/a | `fixtures/api/schemas/app/job.ts`, `fixtures/api/schemas/app/worker.ts`, `fixtures/api/schemas/app/tenant.ts` |

### Forbidden locations

- JSON test data outside `test-data/` → move it under `test-data/app/`.
- Faker payloads inline in a spec when an entity already has a builder → move to `helpers/app/<topic>.ts` or call the existing `buildCreate<X>Body` / `buildUpdate<X>Body`.
- `process.env.USER_ACCESS_TOKEN_*` written outside `tests/app/login.setup.ts` → forbidden.
- New env vars added without a matching entry in `env/.env.example` → must be documented.
- Storage-state JSON committed to git → these belong in `.auth/` (gitignored), produced by `login.setup.ts` per environment.

For the full enumeration of every file in each location, see [reference.md](reference.md). The decision tree below picks the right cell of this table for any new piece of data.

## Quick reference — the seven blessed patterns

| # | Pattern | Speed | Isolation | When to use |
|---|---------|-------|-----------|-------------|
| 1 | Inline literal | Instant | Perfect | One-off value, never reused; uniqueness via `faker.string.uuid()` or `Date.now()` |
| 2 | Typed factory with `Partial<T>` overrides | Instant | Perfect | Same shape used in 2+ tests, or a shape that has business rules |
| 3 | Object Mother on top of factory | Instant | Perfect | Named scenarios (e.g. "matched worker+job pair", "online worker in EU") |
| 4 | JSON validation matrix | Instant | Perfect | Boundary lists for negative tests (`<resource>-validation.json`; legacy camelCase `httpJobValidation.json`, `backupJobValidation.json` are drift) |
| 5 | JSON lookup / sentinel | Instant | Perfect | Fixed `invalidId`/`nonExistentId`, env-pinned ids (`worker.json`, `job-common.json`) |
| 6 | API seeder helper | Fast | Perfect | An entity must exist in the system before the test runs (worker, job, tenant, user) |
| 7 | Per-test user via admin-API + Keycloak + Mailpit | Fast | Perfect | Tests that need a fresh user (registration, reset-password, invitation, brute-force) |

Personas (main / full / admin / zero) are NOT a separate pattern — they are pre-baked storage states + env tokens; see [reference.md](reference.md) "Storage state catalog" and "Env-token catalog".

## Decision tree — pick a pattern

```mermaid
flowchart TD
    Start[Test needs data] --> Q1{Authenticated session<br/>or token?}
    Q1 -->|Yes - persona| Persona["Use storage state<br/>+ env token<br/>(see reference.md)"]
    Q1 -->|Yes - fresh user| FreshUser["Pattern 7:<br/>per-test user"]
    Q1 -->|No| Q2{Server entity<br/>must exist?}
    Q2 -->|Yes| Q3{Helper already<br/>seeds it?}
    Q3 -->|Yes| ReuseSeeder["Pattern 6:<br/>reuse helpers/app/X.ts"]
    Q3 -->|No| WriteSeeder["Pattern 6:<br/>add helpers/app/X.ts<br/>(create + delete pair)"]
    Q2 -->|No| Q4{Boundary list<br/>or sentinel id?}
    Q4 -->|Boundary list| ValidationJson["Pattern 4:<br/>test-data/app/X-validation.json"]
    Q4 -->|Fixed id / lookup| LookupJson["Pattern 5:<br/>test-data/app/X.json"]
    Q4 -->|Random payload| Q5{Used in 2+<br/>specs?}
    Q5 -->|Yes| Q6{Factory already<br/>exists?}
    Q6 -->|Yes| ReuseFactory["Pattern 2:<br/>reuse helpers/app/<topic>.ts<br/>or buildCreateXBody"]
    Q6 -->|No| WriteFactory["Pattern 2:<br/>add createXData(overrides)"]
    Q5 -->|No, just one test| Inline["Pattern 1:<br/>inline literal"]
    Q3 -->|Several named<br/>variants needed| ObjectMother["Pattern 3:<br/>add Object Mother on top<br/>(matchedX, activeX)"]
```

If you reach a leaf node and the cited file does not exist, that means the seeder/factory is missing — create it, do not inline. See "Search-before-write" below.

## The seven patterns — rules

Code for every pattern (good vs bad, current-drift examples) lives in [patterns.md](patterns.md) — this section carries only the rules.

### Pattern 1 — Inline literal (last resort)

Rules ([patterns.md § Pattern 1](patterns.md)):
- Allowed only when the value is used in exactly one test and has no business rules.
- Uniqueness comes from `faker.string.uuid()`, `faker.string.alphanumeric(N)`, or `Date.now()` — never from a counter at module scope (parallel-unsafe).
- The moment a second spec needs the same shape, promote to Pattern 2.

### Pattern 2 — Typed factory with `Partial<T>` overrides (default)

Target shape — code in [patterns.md § Pattern 2](patterns.md). Mandatory shape:
- Exported `type X` next to the factory; or import it from the matching schema file.
- Function returns the type, takes `Partial<T> = {}` last.
- Defaults are realistic and pass server validation.
- `...options` spread must be the LAST property (overrides win).
- One factory per entity. Per-entity files in `helpers/app/test-data-generators.ts` (target) or in the topic-specific helper today (e.g. `buildCreateWorkerBody` in `helpers/app/workers.ts`, `buildCreateJobBody` + 6 sibling per-type builders in `helpers/app/jobs.ts`).

> Drift today: existing `buildCreate<X>Body` builders return `Record<string, unknown>` instead of an exported `XData` type. Refactor playbook §§ 1 + 3 cover the migration.

### Pattern 3 — Object Mother on top of factory

Named scenarios that delegate to the base factory; never re-declare fields. Code in [patterns.md § Pattern 3](patterns.md). Rules:
- An Object Mother MUST call the underlying factory; copy-pasting fields creates drift.
- Object Mothers are pure — no API calls, no Playwright, no env reads.
- Name them by the scenario, not the shape: `createMatchedWorkerAndJobPair`, `createWorkerForRegion`, `disabledJob`.
- Live in the same file as the base factory.

### Pattern 4 — JSON validation matrix

For boundary lists driving parametrized negative tests. Code in [patterns.md § Pattern 4](patterns.md). Rules:
- Path is `test-data/app/<resource>-validation.json` (hyphen-case; for jobs `<type>-job-validation.json`). The camelCase `httpJobValidation.json` / `backupJobValidation.json` / `webhookJobValidation.json` are legacy drift — do not add new camelCase files.
- Top-level keys describe the negative case (`invalidNames`, `invalidTargets`, `validMethods`, `methodsWithBody`).
- Values are arrays of primitives. No partial objects (those belong in code, not JSON).
- Use only when the same matrix is reused in 2+ specs OR when the matrix is large enough to obscure the test.

### Pattern 5 — JSON lookup / sentinel

For fixed ids and environment-pinned references (`worker.json` sentinels like `invalidId` / `nonExistentId`, `job-common.json` boundaries). Code in [patterns.md § Pattern 5](patterns.md). Rules:
- Every spec that needs `invalidId` or `nonExistentId` MUST import from JSON; never inline a fake uuid.
- Each `test-data/app/<resource>.json` file owns the sentinels for that resource. Add new keys here rather than introducing a new file.
- Never put PII or production ids here. The convention is `nonExistentId: "00000000-0000-0000-0000-000000000000"`.

### Pattern 6 — API seeder helper

Target shape (assertion-style `setupX`/`teardownX` pair); current passthrough `createWorker` is interim — code and drift examples in [patterns.md § Pattern 6](patterns.md), migration in `refactor-playbook.md § 3`. Mandatory shape:
- Always exposed as a pair: `setupX` (or `createX`) + `teardownX` (or `deleteX`). The pair lives in the same file.
- **Accepts `overrides?: Partial<T>` and forwards them to the factory** (`body: createXData(overrides)`). A seeder with no override parameter is a refactor target: a test that needs a specific field value (e.g. a fixed `name` to assert on, or a `status: 'disabled'` seed state) cannot use it without forking into a second seeder. Overrides are what make a single seeder reusable across scenarios.
- Body is built by a Pattern-2 factory (`createXData`), never inline. If the factory does not exist, create it first.
- Response is Zod-parsed before return.
- Token comes from `tokens.full()` (or the documented persona's accessor), called at the call site — never hardcoded, never aliased.
- Used by tests in `beforeAll`/`beforeEach` and matched in `afterAll`/`afterEach`. See "Lifecycle map" below.

### Pattern 7 — Per-test user via admin-API + Keycloak + Mailpit

For flows that require a brand new user. This project provisions users through the tenant admin API (`POST /admin/tenants/{id}/users`), which creates a Keycloak-backed user under the hood; password reset goes through the Keycloak admin client. `setupTestUser`/`teardownTestUser` hook code in [patterns.md § Pattern 7](patterns.md). Rules:
- `getNextTestEmail(baseEmail)` produces `local+<8-char>@domain` from the supplied base email. All plus-addresses route to one Mailpit inbox — parallel-safe.
- `getNextTestEmail` is **synchronous**. Do not `await` it.
- Pair every `setupTestUser` with `teardownTestUser` in `afterEach`/`afterAll`. When the test itself may have deleted the user already, make the teardown tolerate it — treat a 404 as success (e.g. `Promise.allSettled` in the helper) — never an empty `try {} catch {}`, which the lint rejects and which would hide a real failure.
- For pre-existing personas (main, full, admin, zero) use the storage state + env token instead — see [reference.md](reference.md).

## Lifecycle map — when to seed and when to clean up

```mermaid
flowchart LR
    BA[beforeAll] -->|"Seed what the tests read,<br/>record its id<br/>e.g. create the worker a GET reads"| BodySeed
    BE[beforeEach] -->|"Mutable resource per test:<br/>worker, job, tenant<br/>OR per-test user"| BodyMut
    BodySeed --> Test
    BodyMut --> Test
    Test --> AE[afterEach]
    Test --> AA[afterAll]
    AE -->|"Mirrors beforeEach:<br/>delete the resource"| Done
    AA -->|"Drain ids[] array<br/>from beforeAll + POST tests"| Done
```

Rules:
- `beforeAll` **seeds** what the describe's tests only read (e.g. creates the worker a GET-by-id test reads), records each id it creates in the describe's cleanup array, and `afterAll` deletes them. Never borrow existing data ("the first worker in the list") — it may not exist after an environment reset. Pushing `beforeAll`'s own ids into the cleanup array is correct; what must not happen is a test depending on another test's side effects.
- `beforeEach` for resources that the test mutates or that must be unique per test run.
- `afterEach` mirrors `beforeEach`; `afterAll` drains a `workerIds: string[]` array filled by `beforeAll` and by POST tests.
- The id-array pattern is the canonical leak guard for POST suites:

```typescript
test.describe('POST /workers', () => {
    const workerIds: string[] = [];

    test('Create worker', async ({ apiRequest }) => {
        const { body } = await apiRequest<CreateWorkerResponse>({ /* ... */ });
        workerIds.push(body.workerId);
    });

    test.afterAll(async ({ apiRequest }) => {
        for (const id of workerIds) {
            await apiRequest<null>({
                method: 'DELETE',
                url: `${appConfig.api.WORKERS}/${id}`,
                baseUrl: appConfig.apiUrl,
                headers: tokens.full(),
            });
        }
    });
});
```

## Per-test user lifecycle (Pattern 7 detail)

```mermaid
flowchart LR
    Email["getNextTestEmail(baseEmail)<br/>local+aBc12345@domain"] --> Setup["setupTestUser<br/>(POST /admin/tenants/{id}/users)"]
    Setup --> Reset[resetUserPasswordById]
    Reset --> ClearInbox["mailpit.deleteEmailsForRecipient(email)"]
    ClearInbox --> Test[Run test]
    Test --> MailpitCheck{Email-driven<br/>flow?}
    MailpitCheck -->|Yes| Inbox["mailpit.getLastEmail(email)<br/>extractLinkFromEmail / extractOtpFromEmail"]
    Inbox --> Cleanup
    MailpitCheck -->|No| Cleanup
    Cleanup[teardownTestUser] --> InboxClean["mailpit.deleteEmailsForRecipient(email)<br/>(in teardown)"]
```

## Parallel-safety rules

When the suite runs in parallel (`fullyParallel: true` in `playwright.config.ts` — the repository's own `CLAUDE.md` states whether its suite is parallel-safe), data must be independent per Playwright worker AND per test. Write it that way even on a suite that still runs with `--workers=1`, so it can move to parallel without a rewrite.

1. **Uniqueness sources** — `faker.string.uuid()`, `faker.string.alphanumeric(N)`, `Date.now()`, `getNextTestEmail(baseEmail)`. Module-level counters (`let counter = 0`) are forbidden.
2. **No mutable module state** — factories and Object Mothers are pure functions of their inputs.
3. **Faker seeding** — the framework does not globally seed faker. If you need a reproducible failure, seed at the start of the test with `faker.seed(testInfo.testId.split('').reduce((a, c) => a + c.charCodeAt(0), 0))`. Do not seed in factories themselves.
4. **`process.env` writes** — only `tests/app/login.setup.ts` may write `process.env.USER_ACCESS_TOKEN_*` (the setup project is part of the config boundary for that one purpose). Specs and helpers never write env vars, and read them only through `config/env.ts` (`env.X`, `tokens.full()`).
5. **Per-test user emails** are intrinsically parallel-safe via plus-addressing.
6. **Storage states** are read-only files; multiple Playwright workers can share them. Personas that need to mutate user attributes during a test must use Pattern 7, not a shared storage state.
7. **Don't share helper-returned objects** — if `createWorker` returns `body`, the consuming test owns it; don't cache it across describes.

## Search-before-write — the DRY enforcement loop

Before adding ANY of: a faker payload in a spec, a new factory, a new API helper, a new env token reference, or a new JSON file — run these searches.

```bash
# Is there already a factory for this entity?
rg "create<Entity>Data|generate<Entity>Data|build<Entity>Body" helpers/

# Is there already an API seeder?
rg "create<Entity>\b|delete<Entity>\b" helpers/app/

# Is the same JSON sentinel already declared?
rg "<Entity>" test-data/

# Is the persona already covered by an env token?
rg "USER_ACCESS_TOKEN_|ADMIN_ACCESS_TOKEN_" env/.env.example tests/ helpers/
```

Decision rules:
- A hit on factory or seeder = consume it. Do NOT duplicate. If it lacks an override you need, ADD an override; do not fork.
- A hit on env token = call its accessor (`tokens.full()`) at the call site; never alias it to `const token = tokens.full()` at module level (see `type-safety` § Environment variables).
- A hit on JSON = add a key to the existing file; do not create a parallel file.

For per-area scopes, see the catalogs in [reference.md](reference.md).

## SOLID checklist for data code

- **SRP** — One factory per entity, one API seeder per entity, one storage-state creator per area. The minute a helper does two unrelated things, split it.
- **OCP** — Factories accept `Partial<T>` overrides. Add new scenarios via Object Mothers or new overrides; don't edit the factory's defaults to satisfy a single test.
- **LSP** — Object Mother return types must be assignable to the base factory's return type (use the same `Type` everywhere).
- **ISP** — Don't pass a "god params" object to a helper. `createWorker(apiRequest, body, headers)` + `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken)` is better than one mega-helper that does everything.
- **DIP** — Helpers depend on the `ApiRequestFn` abstraction (from `fixtures/api/api-types.ts`), never on `request` directly.

## Anti-patterns catalog

| Anti-pattern | Why it's wrong | Fix |
|--------------|----------------|-----|
| Inline `faker` payload in a spec for an entity that has a builder | Drift; rule changes hit one place but not others | Import the builder; if the builder lacks a field, add `Partial<T>` override |
| Two near-identical generators (e.g. `createXData` + `createXDataForUI`) | Drift, more places to update | One factory + one Object Mother variant |
| Module-level counter for uniqueness (`let n = 0`) | Parallel-unsafe; collides across Playwright workers | `faker.string.uuid()`, `faker.string.alphanumeric(N)` |
| `const token = process.env.USER_ACCESS_TOKEN_X` aliased then passed around | Hides the canonical name; grep misses it; read outside `config/env.ts` | Call `tokens.full()` / `.admin()` / `.zero()` directly at the call site |
| Hardcoded uuid in a spec for "non-existent" id | Magic value; can't be updated centrally | `test-data/app/<resource>.json` `nonExistentId` |
| `await getNextTestEmail()` | The function is synchronous; await produces noise | Drop the `await` |
| `Math.random()` based amount generators (`helpers/util/dataGenerator.ts` `generateRandomAmount`) | Bypasses the project's faker-everywhere convention | `faker.number.float({ min, max, multipleOf: 0.01 })` |
| API seeder that builds its body inline with faker | Couples seeding (HTTP) and shaping (factory) — violates SRP | Body comes from a Pattern-2 factory; seeder only POSTs and parses |
| Storage state mutated during a test | Breaks isolation for parallel Playwright workers | Pattern 7 (per-test user) or a fresh persona |
| Mock JSON used as if it described a live backend resource | Drift between mock JSON and real backend | Pattern 6 + Pattern 7; keep mocks only for purely-frontend assertions |

## Self-review checklist (10 items)

Before finishing any data-related change, confirm:

- [ ] Every faker call in a spec is for a value used in only that spec; reusable shapes live in a factory.
- [ ] Every token is read through its `tokens` accessor (`tokens.full()` etc., see [reference.md](reference.md)) at the call site, not aliased locally.
- [ ] Every entity created in the test has a matching delete in `afterEach` or `afterAll`.
- [ ] Every JSON import points to `test-data/app/<resource>.json`; no JSON files live elsewhere.
- [ ] No module-level mutable state (counters, caches, ids) outside of `describe`-scoped arrays drained in `afterAll`.
- [ ] No `Math.random()`; use `faker.*`.
- [ ] No fake uuids inline; sentinels come from JSON or `faker.string.uuid()`.
- [ ] If you wrote a new factory or seeder, you ran the search-before-write commands and confirmed nothing already does this.
- [ ] If your test needs a fresh user, it uses Pattern 7. If it needs a fixed persona, it uses storage state + env token.
- [ ] Object Mothers delegate to factories; factories have not been duplicated to fit a scenario.

## Examples

### Example 1 — a new endpoint needs a payload, and the temptation is a fixture file

**Ask:** "add the create-project API tests; the body needs `name`, `description`, `ownerId`."

The instinct is a `test-data/app/projects.json` with a ready payload. That is the wrong default here, and the seven patterns say why:

1. **`name` must be unique per test run.** Two Playwright workers, or one rerun before cleanup, and a fixed name collides on the 409 path. Faker, not JSON.
2. **`ownerId` must reference a row that actually exists.** A hardcoded uuid is a hardcoded id — forbidden, and it rots the first time the environment is reset. Borrowing one ("list users and take the first") fails the same way. Create the owner in `beforeAll` (e.g. `setupTestUser`), use its id, and delete it in `afterAll` (`teardownTestUser`).
3. **`description` is genuinely fixed** — it is not asserted on and not unique. A constant is fine as the body builder's **default payload value** (overridable like any field), not in its own file. That is a builder default, not a test constant: once a test asserts on it, the expected value comes from `test-data/` per § Critical.
4. **The token comes from `tokens.x()`** (`config/env.ts`), never a file.

The finished shape: a body builder in `helpers/app/` that takes the resolved `ownerId` and a faker name, plus one `beforeAll` that creates the owner and one `afterAll` that deletes it. No new JSON file — which is what § Search-before-write is for.

### Example 2 — two specs start failing on each other

**Symptom:** `projects-crud.spec.ts` passes alone and fails in the suite with a `409` on create.

**Cause, per § Parallel-safety rules:** both specs create a project with a name taken from the same fixed JSON value. Playwright worker A's row still exists when Playwright worker B creates, so B collides. The suite is green with a single Playwright worker and red in CI, which is the signature of shared fixed data.

**Fix:** the name becomes faker-generated per test; the fixed JSON value is deleted rather than renamed, so nothing can reach for it again. Cleanup stays as it was — the bug was never in teardown, it was in the data being shared in the first place.

**Verify:** 5 consecutive isolated runs plus one full-tag run, per `flakiness-triage`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `409 Conflict` on create, only in CI or only at parallelism | A fixed name from JSON, shared across Playwright workers | Faker per test. Delete the JSON value so it cannot be reused. |
| A hardcoded uuid stops resolving after an environment reset | An id was treated as fixed data; ids are environment state, not data | Resolve it at runtime in `beforeAll` and fail loudly when the lookup returns nothing. |
| Test passes locally, `401` in CI | Credentials read from a file, or a storage state older than its token TTL | Tokens come from `tokens.x()` (`config/env.ts`). Re-run the auth setup project before assuming a code bug. |
| Faker produced a value the API rejects | Unconstrained generator against a validated field — a name too long, an email shape the backend refuses | Constrain the generator to the contract, do not loosen the assertion. |
| Two JSON files hold the same constant | § Search-before-write was skipped | Grep before adding. Consolidate into one, then update both consumers atomically per `refactor-values`. |
| Cleanup deletes a row another spec is mid-read on | Data is shared where it should be per-test | Per-test data is the fix; ordering teardown around a shared row only moves the race. |
| A seeded entity survives the test run | Creation is not paired with teardown for the failure path | Capture the id at creation and delete in `afterEach`, so an assertion failure still cleans up. |

## See Also

- [`api-testing`](../api-testing/SKILL.md) — where the payloads this skill decides about are consumed, and the cleanup rules that pair with seeding.
- [`helpers`](../helpers/SKILL.md) — body builders and CRUD wrappers are the right home for generated data; signature shape and cleanup ordering live there.
- [`fixtures`](../fixtures/SKILL.md) — per-test users and storage states are injected, not constructed in a test.
- [`config`](../config/SKILL.md) — environment variables and URLs; this skill covers data, that one covers configuration.
- [`enums`](../enums/SKILL.md) — repeated strings belong there, not in a test-data file.
- [`refactor-values`](../refactor-values/SKILL.md) — read before changing any existing fixed value; consumers must update atomically.
- [`flakiness-triage`](../flakiness-triage/SKILL.md) — shared fixed data is a leading cause of the cross-test interference that skill diagnoses.
- Orchestrator: [`~/.claude/CLAUDE.md`](../../CLAUDE.md) — § Sources of Truth and the WON'T rule against hardcoded ids both constrain every decision here.
## Additional resources

- [reference.md](reference.md) — env-token catalog, JSON file catalog, helper catalog, storage state catalog, faker recipes.
- [patterns.md](patterns.md) — side-by-side good/bad examples for each pattern.
- [refactor-playbook.md](refactor-playbook.md) — ordered refactors for the duplication hot spots already in the codebase.
- Sister skill: [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md) — how API responses are asserted with Zod (this skill answers "where does the request body come from?").
