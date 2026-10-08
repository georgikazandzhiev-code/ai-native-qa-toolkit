---
name: scaffold-spec
version: 1.3.2
description: >-
  Scaffold new Playwright test spec files following project conventions. Use when
  creating a new API spec, E2E spec, or functional spec file, or when the user
  asks to add tests for a new endpoint, feature, or job type.
metadata:
  category: authoring
---

# Scaffold Test Spec Files

Generate new Playwright spec files that follow the project's established conventions. This skill covers API tests, E2E tests, and functional UI tests.

## Why This Skill Exists

Every spec file in this project follows a strict structure: specific imports, tags, Qase integration, cleanup patterns, and naming conventions. When you scaffold by hand (or let the agent freestyle), you get inconsistency — wrong imports, missing cleanup, forgotten Zod validation, incorrect tags. Then someone has to fix it in review.

This skill exists so that **every new spec starts identical** regardless of who (or what) creates it. The templates below are not suggestions — they're the canonical starting point. Deviation means bugs that slip past CI.

The steps are ordered deliberately: determine type → read the rule → study a real example → generate → create supporting files → update the rule. Skipping "study an existing spec" (Step 3) is the #1 cause of specs that look right but violate project patterns in subtle ways.

## Critical

Non-negotiable. A scaffolded spec that breaks any of these is worse than no spec, because it looks finished.

- **NEVER scaffold from memory of the conventions — read them.** The spec type decides which rule applies, and the rules differ per type. Guessing produces a file that lints clean and violates the framework.
- **NEVER scaffold a UI spec before exploring the live app.** Locators invented from a description are placeholders wearing the costume of real selectors. Use `npx playwright open` per the `playwright-cli` skill; if it cannot reach the app, stop and say so rather than shipping guesses.
- **ALWAYS study an existing spec of the same type first.** The scaffold must match what is already there — import paths, tag, `qase.suite` placement, cleanup shape — not a generic template.
- **ALWAYS enumerate the coverage plan before writing test bodies** for an API spec: every status code from the contract, as a comment block at the top. A scaffold that covers only the happy path has silently redefined "done".
- **NEVER leave a scaffolded spec with placeholder assertions.** `expect(true).toBe(true)`, an empty body, or a TODO where an assertion belongs is a false green — the `require-assertion-in-test` lint rule will reject it, and it should.
- **ALWAYS run the spec before reporting the scaffold complete.** A scaffold that has never executed is a draft. See the constitution's Verification Standard.

## Step 1: Determine Spec Type

Ask the user (or infer from context) which type of spec to create:

| Type | Directory | Tag | Rule |
|------|-----------|-----|------|
| **API** | `tests/app/api/<domain>/` | `@App-API` | `api-tests.mdc` |
| **E2E** | `tests/app/e2e/<domain>/` | `@App-E2E` | `ui-tests.mdc` |
| **Functional** | `tests/app/functional/<domain>/` | `@App-regression` | `ui-tests.mdc` |

Specs are grouped into **service-domain subfolders** (mirroring the API Hub): `tenant-service/`, `jobs-service/`, `notification-service/`, `shared/`. Within a domain, add a sub-subfolder (`jobs/`, `workers/`, `run-stats/`) only when that domain has 10+ specs in one test type — `jobs-service/` uses these in all three test types. Place a new spec in the folder matching its domain; e.g. `tests/app/api/jobs-service/jobs/http-job.spec.ts`, `tests/app/functional/notification-service/notification-rules-page.spec.ts`.

## Step 2: Read the Convention Rule

When the repository provides a repo-context skill, read its matching router (`api-router.md` or `ui-router.md`) before generating any code, and follow it exactly. In any other repo, read that repo's own conventions (its `CLAUDE.md` / project rules and existing sibling specs) instead.

## Step 3: Explore First

Before writing any test code, understand the current state of what you're testing:

- **API tests**: Make a real API request (GET the endpoint, POST with sample data) to see the actual response shape, status codes, and field names. Don't assume the API matches the docs — verify it.
- **E2E tests**: Navigate to the page in the browser. Look at the actual elements, test IDs, form fields, and component structure. Use `page.goto()` and inspect before writing locators.
- **Functional tests**: Open the form/sheet you'll be testing. Check what fields exist, what validation messages appear, and what the default state looks like.

This step prevents writing tests against an imagined API or UI that doesn't match reality.

## Step 4: Study an Existing Spec

Read a comparable existing spec to match the established patterns:

| For this type... | Read this reference file... |
|------------------|-----------------------------|
| API (jobs) | `tests/app/api/jobs-service/jobs/email-job.spec.ts` |
| API (admin) | `tests/app/api/tenant-service/admin-tenants.spec.ts` |
| E2E (jobs) | `tests/app/e2e/jobs-service/jobs/http-job-crud.spec.ts` |
| E2E (auth flows) | `tests/app/e2e/tenant-service/login-smoke.spec.ts` |
| Functional | `tests/app/functional/jobs-service/jobs/http-create-edit-job.spec.ts` |

## Step 5: Generate the Spec

### API Spec Template

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { appConfig } from "../../../config/app";
import { faker } from "@faker-js/faker";
// Import Zod schemas from fixtures/api/schemas/app/<resource>
// Import helpers from helpers/app/<resource>
// Import invalid-type arrays from fixtures/api/invalid-types

// Coverage plan — <METHOD> <path>, every status code in the OpenAPI contract:
// 200 — happy path, schema + business values
// 400 — per-field omission loop, per-field invalid-type loop, invalid id format
// 401 — no token; admin token on a tenant-scoped path (wrong realm)
// 403 — USER_ACCESS_TOKEN_ZERO (commented out under // TODO: FIXME: <TICKET> while unprovisioned)
// 404 — non-existent id
// 405 — unsupported verbs (dedicated 405 block)
// SKIP: 500 — cannot be produced on purpose

const ADMIN_TOKEN = process.env.USER_ACCESS_TOKEN_ADMIN;
// OR for tenant-scoped endpoints:
// const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;

// ═══════════════════════════════════════════════════════════════
// METHOD /path — Description
// ═══════════════════════════════════════════════════════════════

test.describe("METHOD /path - Description", () => {
  const createdIds: Array<string | undefined> = [];

  test.afterAll(async ({ apiRequest }) => {
    for (const id of createdIds.filter((x): x is string => x !== undefined)) {
      // cleanup via the DELETE helper, tolerating 404 (already gone)
    }
  });

  test(
    "Verify <METHOD> <path> returns <status> [with <reason>]",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
      qase.suite(SUITES.API_<RESOURCE>);
      // qase.id(N);
      const { status, body } = await getResource(apiRequest, TOKEN, id);
      expect(status).toBe(200);
      expect(ResourceSchema.parse(body)).toBeTruthy();
      // assert business logic values only — Zod already proved the shape
      expect(body.name).toBe(expectedName);
    },
  );
});
```

### E2E Spec Template

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { appConfig } from "../../../config/app";
import { qase } from "playwright-qase-reporter";
import { faker } from "@faker-js/faker";
import { SUITES } from "../../../enums/app/qase-suites";
// Import API helpers for cleanup

const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL!;

test.describe("E2E — <Feature> CRUD", () => {
  test.setTimeout(appConfig.timeouts.e2eJourney); // explicit waits also come from appConfig.timeouts
  const createdNames: string[] = [];

  test.afterAll(async ({ apiRequest }) => {
    // API-only cleanup using createdNames
  });

  test(
    "Create, verify, edit, and delete <resource>",
    { tag: "@App-E2E" },
    async ({ page, sideNavigation, jobsPage, createJobPage, apiRequest }) => {
      qase.suite(SUITES.APP_<RESOURCE>);
      // qase.id(N);
      const name = `qa-${faker.string.alphanumeric(8).toLowerCase()}`;
      createdNames.push(name);

      await test.step("GIVEN: User navigates to page", async () => {
        // navigation via page-object actions
      });

      await test.step("WHEN: User creates resource", async () => {
        // creation via page-object actions, using `name`
      });

      await test.step("THEN: Resource appears in grid", async () => {
        await expect(jobsPage.getRowByName(name)).toBeVisible({ timeout: appConfig.timeouts.persist });
      });
    },
  );
});
```

### Functional Spec Template

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { faker } from "@faker-js/faker";

test.describe("<Feature> — Form Validation", () => {
  test.beforeEach(
    async ({ page, sideNavigation, jobsPage, createJobPage }) => {
      await test.step("GIVEN: User is on the configure form", async () => {
        await page.goto("/");
        await sideNavigation.navigateToJobs();
        await jobsPage.verifyPageLoaded();
        // navigate to form
      });
    },
  );

  test(
    "Validation scenario description",
    { tag: "@App-regression" },
    async ({ createJobPage }) => {
      qase.suite(SUITES.APP_<RESOURCE>);
      // qase.id(N);
      // validation test body
      // close sheet at end to leave clean state
    },
  );
});
```

## Step 6: Create Supporting Files (if needed)

For a new resource/endpoint, you may also need:

| File | When |
|------|------|
| `fixtures/api/schemas/app/<resource>.ts` | New API resource — Zod schemas for all responses |
| `helpers/app/<resource>.ts` | New API resource — helper functions (CRUD + cleanup) |
| `config/app.ts` | New API path constant |
| `enums/app/qase-suites.ts` | New Qase suite ID |
| `pages/app/<Resource>Page.ts` | New UI page — page object class |
| `fixtures/pom/page-object-fixture.ts` | New page object — register fixture |
| `test-data/app/<resource>.json` | Shared test data (validation rules, dropdown options) |

## Step 7: Update the Rule File

After creating the spec, update the matching router in the repository's repo-context skill (`api-router.md` or `ui-router.md`) with:
- New endpoint context section (if adding a new resource)
- Test inventory (describe blocks + test count)
- Helpers and schemas created
- Known bugs found

## Self-review checklist

- [ ] Imports follow the project pattern exactly
- [ ] Tags match the spec type (`@App-API`, `@App-E2E`, `@App-regression`)
- [ ] `qase.suite()` is the first line in every test
- [ ] Cleanup in `test.afterAll` — API-only for E2E, helper-based for API
- [ ] Zod schema validation on every API response
- [ ] API test names follow `Verify <METHOD> <path> returns <status> [with <reason>]` (variants: `api-testing/http-method-coverage.md` § 14); E2E names describe the flow
- [ ] No `any` types — explicit generics on `apiRequest<T>()`
- [ ] `test.step` used for multi-phase tests with GIVEN/WHEN/THEN

## Anti-patterns

### Wrong: Cleanup inside the test body

```typescript
// BAD — if the test fails before this line, the resource is never deleted
test("Create resource", async ({ apiRequest }) => {
  const { body } = await createResource(apiRequest, TOKEN, data);
  // ... assertions ...
  await deleteResource(apiRequest, TOKEN, body.id); // orphaned on failure
});
```

```typescript
// CORRECT — afterAll always runs, even if tests fail
const createdIds: string[] = [];
test.afterAll(async ({ apiRequest }) => {
  for (const id of createdIds) {
    await deleteResource(apiRequest, TOKEN, id);
  }
});
```

### Wrong: try/catch silencing failures

```typescript
// BAD — if status is 500, this test passes silently
test("Create resource", async ({ apiRequest }) => {
  try {
    const { status, body } = await createResource(apiRequest, TOKEN, data);
    expect(status).toBe(201);
  } catch {
    console.log("Request failed");
  }
});
```

```typescript
// CORRECT — let it throw, Playwright reports the actual error
test("Create resource", async ({ apiRequest }) => {
  const { status, body } = await createResource(apiRequest, TOKEN, data);
  expect(status).toBe(201);
  expect(ResourceSchema.parse(body)).toBeTruthy();
});

// ACCEPTABLE — the one sanctioned try/catch: capturing the id of a resource a bug created, for teardown.
// No `if` in the body (the constitution forbids it); the marker comment is what the lint accepts.
test("Verify invalid payload returns 400", async ({ apiRequest }) => {
  const { status, body } = await createResource(apiRequest, TOKEN, invalidData);
  let createdId: string | undefined;
  // eslint-allow-cleanup-capture — if a bug creates the resource anyway, teardown must delete it.
  try {
    createdId = ResourceSchema.parse(body).id;
  } catch {
    createdId = undefined; // the expected error body: nothing was created
  }
  createdIds.push(createdId);
  expect(status).toBe(400);
});
```

### Wrong: Missing Zod validation

```typescript
// BAD — status 200 with garbage body passes
test("Get resource", async ({ apiRequest }) => {
  const { status } = await getResource(apiRequest, TOKEN, id);
  expect(status).toBe(200);
});
```

```typescript
// CORRECT — Zod proves the response shape is what we expect
test("Get resource", async ({ apiRequest }) => {
  const { status, body } = await getResource(apiRequest, TOKEN, id);
  expect(status).toBe(200);
  expect(ResourceSchema.parse(body)).toBeTruthy();
  expect(body.name).toBe(expectedName);
});
```

### Wrong: UI cleanup instead of API cleanup

```typescript
// BAD — fragile, slow, breaks if UI changes
test.afterAll(async ({ page, jobsPage }) => {
  for (const name of createdNames) {
    await jobsPage.searchByName(name);
    await jobsPage.openRowActionMenu(row, "Delete");
    // ... click confirm, wait for toast ...
  }
});
```

```typescript
// CORRECT — fast, reliable, UI-independent
test.afterAll(async ({ apiRequest }) => {
  const { body } = await listJobs(apiRequest, TOKEN);
  for (const name of createdNames) {
    const match = body.items.find((j) => j.name === name);
    if (match) await deleteJob(apiRequest, TOKEN, match.id);
  }
});
```

### Wrong: Redundant field assertions after Zod parse

```typescript
// BAD — Zod already proved all of this
test("Verify GET returns resource", async ({ apiRequest }) => {
  const { status, body } = await getResource(apiRequest, TOKEN, id);
  expect(status).toBe(200);
  expect(ResourceSchema.parse(body)).toBeTruthy();
  expect(body.id).toBeTruthy();           // redundant — Zod proved id exists
  expect(body.name).toBeDefined();         // redundant — Zod proved name exists
  expect(typeof body.id).toBe("string");   // redundant — Zod proved the type
  expect(Number.isInteger(body.port)).toBe(true); // redundant — Zod proved it
});
```

```typescript
// CORRECT — Zod validates shape, then assert only business logic values
test("Verify GET returns resource", async ({ apiRequest }) => {
  const { status, body } = await getResource(apiRequest, TOKEN, id);
  expect(status).toBe(200);
  expect(ResourceSchema.parse(body)).toBeTruthy();
  expect(body.name).toBe(expectedName);     // business logic — expected value
  expect(body.status).toBe("enabled");      // business logic — expected state
});
```

### Wrong: Conditional logic in tests

```typescript
// BAD — non-deterministic, hides branches that never execute
test("Verify status", async ({ apiRequest }) => {
  const { status, body } = await getResource(apiRequest, TOKEN, id);
  if (status === 200) {
    expect(body.name).toBe(expectedName);
  } else {
    expect(status).toBe(404);
  }
});
```

```typescript
// CORRECT — separate tests for separate behaviors
test("Verify GET returns 200 for existing resource", async ({ apiRequest }) => {
  const { status, body } = await getResource(apiRequest, TOKEN, existingId);
  expect(status).toBe(200);
  expect(body.name).toBe(expectedName);
});

test("Verify GET returns 404 for non-existent resource", async ({ apiRequest }) => {
  const { status } = await getResource(apiRequest, TOKEN, nonExistentId);
  expect(status).toBe(404);
});
```

### Wrong: 405 loop outside the test block

```typescript
// BAD — one test per method: the report and Qase fill up with near-identical tests
const UNSUPPORTED = ["PUT", "PATCH", "DELETE"] as const;
for (const method of UNSUPPORTED) {
  test(`Verify ${method} /<resource>s returns 405`, { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_<RESOURCE>);
    // qase.id(N);
    const { status } = await apiRequest({
      method,
      url: appConfig.api.<RESOURCE>,
      baseUrl: appConfig.apiUrl,
      headers: process.env.USER_ACCESS_TOKEN_FULL!,
    });
    expect(status).toBe(405);
  });
}
```

```typescript
// CORRECT — one test, loop inside, a step and soft assertions per verb.
// Full skeleton (collection + {id} paths, request bodies): api-testing/http-method-coverage.md § 11.
test("Verify unsupported methods on /<resource>s return 405", { tag: "@App-API" }, async ({ apiRequest }) => {
  qase.suite(SUITES.API_<RESOURCE>);
  // qase.id(N);
  const UNSUPPORTED = [
    { method: "PUT", requestBody: {} },
    { method: "PATCH", requestBody: {} },
    { method: "DELETE", requestBody: undefined },
  ] as const;
  for (const { method, requestBody } of UNSUPPORTED) {
    await test.step(`${method} /<resource>s`, async () => {
      const { status, body } = await apiRequest({
        method,
        url: appConfig.api.<RESOURCE>,
        baseUrl: appConfig.apiUrl,
        headers: process.env.USER_ACCESS_TOKEN_FULL!,
        body: requestBody,
      });
      expect.soft(status, `${method} /<resource>s`).toBe(405);
      expect.soft(body, `${method} /<resource>s body`).toBeNull();
    });
  }
});
```

## Troubleshooting

Things that will bite you if you don't account for them upfront:

### Resource dependencies

Some resources can't be created in isolation. A job needs a worker to exist first. If your new resource has a dependency, the spec needs:
- `beforeAll`: create the dependency (e.g. a worker)
- `afterAll`: delete in reverse order — **dependents first, then dependencies** (delete jobs, then workers)

If you get the cleanup order wrong, deletes will fail with 409 (conflict) and orphan resources in the environment.

### Endpoints that don't support DELETE

Not every resource has a DELETE endpoint (e.g. realms). For these:
- You can't clean up what you create — so **don't create in tests** unless you can guarantee idempotency
- Use PATCH tests against pre-existing resources instead
- Document in the endpoint context section: "No DELETE endpoint — tests must be non-destructive"

### Validation tests that accidentally succeed (201 instead of 400)

When testing invalid input, the API might accept it due to a bug. If you don't capture the ID, you've created an orphan:

```typescript
const { status, body } = await createResource(apiRequest, TOKEN, invalidData);
let createdId: string | undefined;
// eslint-allow-cleanup-capture — if a bug creates the resource anyway, teardown must delete it.
try {
  createdId = ResourceSchema.parse(body).id;
} catch {
  createdId = undefined; // the expected error body: nothing was created
}
createdIds.push(createdId);
expect(status).toBe(400);
```

Add this capture to validation tests for POST endpoints. It is the constitution's one `try/catch` exception, marked with `eslint-allow-cleanup-capture` so the lint accepts it, and it needs no `if` in the test body: `createdIds` holds `undefined` when nothing was created, and the teardown hook skips those.

### Shared fixtures across `test.describe` blocks

If multiple `test.describe` blocks in the same file need the same resource, create it in a **file-level** `test.beforeAll` — not inside a describe. But be careful: file-level `afterAll` runs after ALL describes, so cleanup timing can surprise you.

### Auth token scope mismatch

Admin endpoints use `USER_ACCESS_TOKEN_ADMIN`. Tenant endpoints use `USER_ACCESS_TOKEN_FULL`. Using the wrong one doesn't always return 401 — some endpoints return 404 (the resource exists but is invisible to that token's scope). Check the endpoint context in `api-tests.mdc` for the correct token.

### Sorting tests: don't assert exact order

Database collation differs from JavaScript's `localeCompare`. When testing sort endpoints, verify the response is valid and contains expected items — but **do not assert the exact order** of results. The API might sort `"A"` before `"a"` differently than your test expects.

### E2E timeouts

E2E CRUD journeys set `test.setTimeout(appConfig.timeouts.e2eJourney)` at the describe level, and email-based flows use `asyncFlow` / `asyncFlowHeavy` (the `config` skill § Timeout budgets). A budget sizes a long journey; it is never the fix for a test that times out — investigate with the `debugging` skill first.

### Functional tests: always close the sheet

Every functional test that opens a form/sheet must close it at the end — even if the test fails partway through. Use `test.afterEach` or ensure the `beforeEach` navigation resets state. Leaving a sheet open breaks the next test's navigation.

## Examples

### Example 1 — API spec for a new endpoint

**Ask:** "scaffold the spec for POST /api/v1/projects."

1. **Type** — API spec, so it lands under `tests/app/api/` and takes `@App-API`.
2. **Conventions** — read `api-testing` and `test-standards` before writing anything.
3. **Contract first** — the OpenAPI document is the source of truth; enumerate 201, 400, 401, 403/404, 409 as a coverage-plan comment block.
4. **Study a sibling** — open the nearest existing API spec and copy its shape: barrel import, one tag, `qase.suite(...)` as the first body line, `expect(Schema.parse(body)).toBeTruthy()`.
5. **Negative matrix** — one test per required field omitted, plus an invalid-type loop. Not a single empty-body test.
6. **Cleanup** — every created project deleted in `afterEach`/`afterAll`.
7. **Run it.** Then report.

The scaffold is finished when `npx eslint` is clean and the spec has executed — not when the file exists.

### Example 2 — UI spec where exploration is blocked

**Ask:** "scaffold the E2E spec for the settings screen."

`npx playwright open` cannot reach the environment — auth fails. **Stop.** Do not scaffold locators from the ticket description.

Report the blocker with the exact failure, and offer what can be done without the live app: the spec skeleton with its tag, describe block, fixture wiring and cleanup, with the locator layer explicitly left unwritten and the page object not created. That is an honest partial deliverable. A file full of `getByTestId('save-button')` guesses is not — it will pass review, fail on first run, and cost more to debug than it saved.

## See Also

- [`test-standards`](../test-standards/SKILL.md) — spec-file conventions: barrel imports, the single-tag whitelist, Qase wiring, placement by type. Read before scaffolding anything.
- [`api-testing`](../api-testing/SKILL.md) — the negative matrix, schema validation idiom and cleanup rules an API scaffold must satisfy.
- [`selectors`](../selectors/SKILL.md) — locator priority for any UI scaffold.
- [`page-objects`](../page-objects/SKILL.md) — when the scaffold needs a POM alongside the spec.
- [`playwright-cli`](../playwright-cli/SKILL.md) — the mandatory explore-before-generate step for UI work.
- [`fixtures`](../fixtures/SKILL.md) — registering a new page object for injection.
- [`pr-review`](../pr-review/SKILL.md) — run before pushing the scaffold.
- Orchestrator: [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — the pre-edit checklist and the Verification Standard both apply to a scaffold.
