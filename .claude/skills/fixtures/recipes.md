# Fixtures — Recipes

End-to-end wiring scenarios for the most common fixture-related changes. Each recipe is anchored to a real file in this repo. Rules and decisions live in `SKILL.md`; the catalog of what exists lives in `reference.md`.

---

## Recipe 1 — Add a new page-object fixture

Trigger: a new POM class lands under `pages/app/<X>.ts` (or `pages/util/`) and a spec wants to consume it.

Steps:

1. Confirm the POM follows the `page-objects` / `selectors` skills (extends `BasePage`, constructor takes `Page`).
2. Open [`fixtures/pom/page-object-fixture.ts`](../../../fixtures/pom/page-object-fixture.ts).
3. Add the import, grouped with its siblings.
4. Add the fixture to the `FrameworkFixtures` type.
5. Add the fixture body to the `base.extend<FrameworkFixtures>({...})` block — identical shape to every other entry.

```typescript
// 1. import
import { AlertsPage } from '../../pages/app/AlertsPage';

// 2. type entry
export type FrameworkFixtures = {
    /* ...existing... */
    alertsPage: AlertsPage;
};

// 3. extend body entry
export const test = base.extend<FrameworkFixtures>({
    /* ...existing... */
    alertsPage: async ({ page }, use) => {
        await use(new AlertsPage(page));
    },
});
```

No change to `test-options.ts` — the whole `pageObjectFixture` module is already merged. If TypeScript complains about an unknown property on the test args, you forgot the `FrameworkFixtures` entry. Consume it as `test('...', async ({ alertsPage }) => { ... })` — never `new AlertsPage(page)` in a spec.

---

## Recipe 2 — Seed via `apiRequest` in `beforeAll`, clean up in `afterAll` (UI spec)

The most common UI-spec shape: seed a resource over the API, drive the UI against it, delete it after. This does **not** need a fixture (see `SKILL.md` § When a fixture, when a helper).

```typescript
import { expect, test } from '../../../fixtures/pom/test-options';
import { appConfig } from '../../../config/app';
import {
    buildCreateSSLSyntheticBody,
    createSyntheticMonitor,
    cleanupProbesAndSynthetics,
} from '../../../helpers/app/synthetics';
import { buildCreateProbeBody, createProbe } from '../../../helpers/app/probes';
import { faker } from '@faker-js/faker';

// No token aliases — use process.env.USER_ACCESS_TOKEN_* directly (see data-strategy §1.6).

test.describe('SSL monitor detail view', () => {
    const createdSyntheticIds: string[] = [];
    let probeId: string;

    test.beforeAll(async ({ apiRequest }) => {
        const probe = await createProbe(
            apiRequest,
            buildCreateProbeBody(),
            process.env.USER_ACCESS_TOKEN_FULL!
        );
        expect(probe.status).toBe(201);
        probeId = probe.body.probeId;

        const name = `qa-ssl-view-${faker.string.alphanumeric(8).toLowerCase()}`;
        const { status, body } = await createSyntheticMonitor(
            apiRequest,
            buildCreateSSLSyntheticBody([probeId], { name }),
            process.env.USER_ACCESS_TOKEN_FULL!
        );
        expect(status).toBe(201);
        createdSyntheticIds.push(body.syntheticId);
    });

    test.afterAll(async ({ apiRequest }) => {
        test.setTimeout(60_000);
        await cleanupProbesAndSynthetics(
            apiRequest,
            [probeId],
            createdSyntheticIds,
            process.env.USER_ACCESS_TOKEN_FULL!
        );
    });

    test('detail view renders the seeded monitor', async ({ syntheticsPage }) => {
        /* drive the UI via the POM */
    });
});
```

Why this shape:
- `apiRequest` is destructured in the hook signature, exactly as in test signatures — UI POM fixtures and `apiRequest` co-exist on the same surface.
- Cleanup collects ids into an array and deletes unconditionally (no `if (id)` guard). `cleanupProbesAndSynthetics` tolerates 404 and deletes synthetics-before-probes to avoid 409.
- Token is always `process.env.USER_ACCESS_TOKEN_FULL!` at the call site — no aliasing (see `data-strategy` §1.6).

---

## Recipe 3 — Read a mailbox with the `mailpit` fixture

Trigger: a flow that sends email (invite, password reset). The `mailpit` fixture builds its own `Basic`-auth `APIRequestContext` and disposes it after the test.

```typescript
import { expect, test } from '../../../fixtures/pom/test-options';

test.describe('Invite email loop', () => {
    const recipient = `qa+${Date.now()}@<your-test-domain>`;

    test.afterEach(async ({ mailpit }) => {
        await mailpit.deleteEmailsForRecipient(recipient);
    });

    test('user receives an invite email', async ({ mailpit /*, page objects */ }) => {
        /* trigger the flow that emails `recipient` */
        const email = await mailpit.getLastEmail(recipient);
        expect(email).not.toBeNull();
        expect(email!.Content.Body).toContain('action-token');
    });
});
```

Notes:
- `mailpit` is a fixture — destructure it in every hook/test that uses it; do not store it past the test boundary (its context is disposed on teardown).
- `getLastEmail(email, retries, interval)` already polls (default 5×1s). For invite links use the `getInviteLinkFromEmail(mailpit, email)` plain helper (`helpers/util/mailpit.ts`), which polls 10×2s and extracts the `action-token` URL.
- Use an `@<your-test-domain>` recipient. Clean the mailbox in `afterEach` so parallel runs stay isolated.

---

## Recipe 4 — Guest flow with `resetStorageState`

Trigger: a spec must start logged-out (login negative cases, unauthenticated navigation).

```typescript
import { expect, test } from '../../../fixtures/pom/test-options';

test.describe('Guest navigation', () => {
    test.beforeEach(async ({ resetStorageState, loginPage }) => {
        await resetStorageState();
        await loginPage.open();
    });

    test('guest sees the login form', async ({ loginPage }) => {
        await expect(loginPage.emailInput).toBeVisible();
    });
});
```

`resetStorageState` clears cookies + permissions in the test's `context`, dropping the project's default logged-in session. It does **NOT** clear `localStorage` / `sessionStorage` — if the app persists state there, clear it explicitly. To run as a *different* logged-in user instead of guest, use Recipe 5.

---

## Recipe 5 — Override storage state per `describe`

Trigger: one block of tests needs a different persona than the project default.

```typescript
test.describe('Admin-only view', () => {
    test.use({ storageState: '.auth/app/appMainUserSession.json' });

    test('renders admin controls', async ({ dashboardPage }) => {
        /* ... */
    });
});
```

Rules:
- The override applies to the whole `describe`. The storage-state file must already exist (produced by `tests/app/login.setup.ts` — see Recipe 6).
- Allowed `test.use(...)` keys here: `storageState`, `viewport`, `locale`, `timezoneId`. Do not override `baseURL` / `extraHTTPHeaders` here.
- To drop auth entirely, use `resetStorageState` (Recipe 4), not `test.use({ storageState: undefined })`.

---

## Recipe 6 — Add a persona (storage state, env token, or both)

Trigger: a test needs a user that doesn't exist yet.

Decision:
- **UI persona** → storage state: user logs into the UI, session JSON saved, a project attaches it.
- **API persona** → env token: user authenticates via Keycloak, bearer token stored in `process.env.USER_ACCESS_TOKEN_<PERSONA>`, used as the `headers` value of `apiRequest`.
- **Both** → the persona appears in UI tests and seeds via API.

Steps:

1. Add credentials to [`env/.env.example`](../../../env/.env.example) and your local `env/.env.<environment>`.
2. For an **env token**, extend the `tenantTokens` block in [`tests/app/login.setup.ts`](../../../tests/app/login.setup.ts):

```typescript
const tenantTokens = {
    full: { /* ...existing... */ },
    readonly: {
        name: 'READONLY',
        email: process.env.APP_READONLY!,
        password: process.env.APP_READONLY_PASSWORD!,
        totpSecret: process.env.APP_READONLY_SECRET_KEY!,
        realm: process.env.KEYCLOAK_REALM!,
    },
};
```

The existing loop populates `process.env.USER_ACCESS_TOKEN_READONLY`.

3. For a **storage state**, extend the `users` block; the loop calls `createAppStorageState({...})` and writes the `storageStatePath`.
4. Each setup test **must** call `qase.ignore()` (setup tests are not real test cases) and import `test` from `fixtures/pom/test-options`.
5. Personas are **not** fixtures — do not add a fixture surface entry.

---

## Recipe 7 — Add a domain fixture that owns an `APIRequestContext`

Trigger: a genuine cross-cutting concern owning a connection/client per test (rare). If the need is "seed data" use a helper (Recipe 2); if it's "authenticate" use a persona (Recipe 6).

```typescript
// fixtures/services/myservice-fixture.ts
import { test as base, request } from '@playwright/test';
import { MyServiceClient } from '../../helpers/util/myService';

export const test = base.extend<{ myService: MyServiceClient }>({
    myService: async ({}, use) => {
        const ctx = await request.newContext({
            baseURL: process.env.MY_SERVICE_URL!,
            extraHTTPHeaders: { 'X-Api-Key': process.env.MY_SERVICE_KEY! },
        });
        await use(new MyServiceClient(ctx));
        await ctx.dispose();          // teardown — runs even on failure
    },
});
```

Wire it into [`test-options.ts`](../../../fixtures/pom/test-options.ts): add `import { test as myServiceFixture } from '../services/myservice-fixture';` and append `myServiceFixture` to `mergeTests(...)`. Declare the env vars in `env/.env.example` and add the fixture to `reference.md § 1.2`. This mirrors how `mailpit` builds and disposes its own context.

---

## Recipe 8 — Add a fixture that depends on `apiRequest`

Trigger: a typed sub-API reused across many specs *and* helpers (rare — the framework prefers helpers; `loginUser` is the only example and is currently unused).

```typescript
// fixtures/services/somecall-fixture.ts
import { test as baseApiRequestFixture } from '../api/api-request-fixture';
import type { ApiRequestResponse, SomePayload } from '../api/api-types';

type SomeCallFn = (id: string) => Promise<ApiRequestResponse<SomePayload>>;

export const test = baseApiRequestFixture.extend<{ someCall: SomeCallFn }>({
    someCall: async ({ apiRequest }, use) => {
        await use((id) =>
            apiRequest<SomePayload>({
                method: 'GET',
                url: `some/${id}`,
                baseUrl: process.env.API_URL as string,
                headers: process.env.USER_ACCESS_TOKEN_FULL,
            })
        );
    },
});
```

Critical: extend `baseApiRequestFixture`, NOT `base` from `@playwright/test` — the fixture must inherit `apiRequest` so the merged dependency graph resolves to a single `apiRequest` source. This is a one-way dependency (`someCall → apiRequest`); never make `apiRequest` depend back on a higher fixture (see `SKILL.md` § Composition).

---

## Recipe 9 — Compose a new fixture module via `mergeTests`

Adding a fixture module under `fixtures/`:

1. `import { test as fooFixture } from '../services/foo-fixture';` in [`test-options.ts`](../../../fixtures/pom/test-options.ts).
2. Append `fooFixture` to the `mergeTests(...)` call. Order does not matter.
3. Run one spec that consumes it.

Fixture names are **global** on the merged surface. If two modules declare the same name, `mergeTests` fails at runtime with the conflicting name — rename one.

---

## Recipe 10 — Helper with an embedded `cleanup` callback (middle ground)

When the same "create X, delete X" appears across specs but does not clear the fixture bar, use a helper that returns its own cleanup — no fixture, no copy-pasted teardown.

```typescript
// helpers/app/seed-synthetic.ts
import type { ApiRequestFn } from '../../fixtures/api/api-types';

export async function seedSynthetic(
    apiRequest: ApiRequestFn,
    token: string
): Promise<{ syntheticId: string; cleanup: () => Promise<void> }> {
    /* create via apiRequest, capture id */
    return {
        syntheticId,
        cleanup: async () => {
            /* delete via apiRequest, tolerate 404 */
        },
    };
}
```

```typescript
let seeded: Awaited<ReturnType<typeof seedSynthetic>>;
test.beforeEach(async ({ apiRequest }) => { seeded = await seedSynthetic(apiRequest, process.env.USER_ACCESS_TOKEN_FULL!); });
test.afterEach(async () => { await seeded.cleanup(); });
```

Promote to a **fixture** only when cleanup must run unconditionally on failure and simple `afterEach` can't express it (see `SKILL.md` § When a fixture, when a helper).

---

## Recipe 11 — Debug "fixture not registered" and related errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error: Fixture "X" has not been registered.` | Test destructures a name not on the merged surface | Add to the right `fixtures/**` module + (for POMs) `FrameworkFixtures`; ensure the module is in `mergeTests` |
| TS: `Property 'X' does not exist on type ...` | Missing type entry | Add to `FrameworkFixtures` (POM) or the local generic on `extend<{...}>` (API/service) |
| `mergeTests` runtime conflict | Two modules declared the same fixture name | Rename one — names are global |
| `APIRequestContext was disposed` | A ref to `mailpit` (or a service client) is held past the test | Destructure freshly per hook/test; never store it outside test scope |
| `Cannot find module '.../fixtures/pom/test-options'` | Relative path mismatch | Recompute `../` depth; `tests/app/<kind>/<domain>/<x>.spec.ts` → `../../../../fixtures/pom/test-options` |

---

## See Also

- `SKILL.md` — the rules these recipes implement (composition DAG, keep-body-trivial, teardown-on-failure decision).
- `reference.md` — the inventory these recipes reference.
- `api-testing` skill § Three callable shapes — `apiRequest` vs helper vs fixture.
- `data-strategy` skill — where the seed data in Recipe 2 / 10 comes from.
