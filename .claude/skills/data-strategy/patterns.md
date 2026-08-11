# Data Strategy — Pattern Examples

Side-by-side good/bad examples for every pattern in [SKILL.md](SKILL.md). All examples are drawn from real files in this repo. The "BAD" snippets reflect anti-patterns currently present or easy to slip in.

## Pattern 1 — Inline literal

### Good

```typescript
test('rejects empty synthetic name', async ({ page }) => {
    const monitorName = `qa-icmp-${faker.string.alphanumeric(8).toLowerCase()}`;
    await page.getByLabel('Name').fill(monitorName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
});
```

- Single test usage, faker for uniqueness, no shared state.

### Bad

```typescript
let counter = 0;
test('foo', async () => {
    const name = `qa-probe-${counter++}`;        // module-level counter, parallel-unsafe
});
```

```typescript
test('non-existent probe returns 404', async ({ apiRequest }) => {
    const id = '00000000-0000-0000-0000-000000000000'; // hardcoded sentinel
});
```

Fix: pull `nonExistentId` from [test-data/app/probe.json](../../../test-data/app/probe.json) (Pattern 5).

## Pattern 2 — Typed factory with `Partial<T>` overrides

### Good — target shape (planned per [`docs/framework-alignment-plan.md` § 6.4](../../../docs/framework-alignment-plan.md))

```typescript
export type ProbeData = {
    name: string;
    location: string;
    region: string;
};

export function createProbeData(
    options: Partial<ProbeData> = {}
): ProbeData {
    return {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...options,
    };
}
```

- Exported `ProbeData` type, `Partial<ProbeData> = {}` defaulted, `...options` last.

Test consumes with overrides:

```typescript
const probe = createProbeData({ region: 'EU' });
```

### Drift today — `Record<string, unknown>` instead of typed factory ([helpers/app/probes.ts](../../../helpers/app/probes.ts))

```typescript
export function buildCreateProbeBody(
    overrides?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...overrides,
    };
}
```

The shape is right (defaults + spread overrides last) but the return type is `Record<string, unknown>` rather than an exported `ProbeData`. Refactor playbook § 3 covers the migration to typed factories paired with assertion-style setup helpers.

### Bad — Inline faker in spec when builder exists

```typescript
test('Creates probe', async ({ apiRequest }) => {
    const body = {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
    }; // ← duplicates buildCreateProbeBody
});
```

Fix: `import { buildCreateProbeBody } from '../../../helpers/app/probes';` and call `buildCreateProbeBody({ region: 'EU' })`.

### Bad — Forking the builder instead of adding overrides

Hypothetical drift to watch for:

```typescript
export function buildCreateProbeBody(): Record<string, unknown> { /* … */ }
export function buildCreateProbeBodyForUI(): Record<string, unknown> { /* same shape, hard-coded location */ }
```

Fix: one `buildCreateProbeBody(overrides?: Partial<ProbeData>)`; UI variant becomes Pattern 3 (Object Mother).

## Pattern 3 — Object Mother on top of factory

### Good — target shape

```typescript
export function createProbeForRegion(region = 'EU'): ProbeData {
    return createProbeData({
        region,
        location: `${region}-${faker.location.city()}`,
    });
}

export function createMatchedProbeAndSyntheticPair(): {
    probeData: ProbeData;
    syntheticData: SyntheticData;
} {
    const probeData = createProbeData();
    return {
        probeData,
        syntheticData: createSyntheticData({ /* probeIds populated after seeding */ }),
    };
}
```

- Mothers delegate to base factories. No re-declaration.

### Bad — Mother re-implements the factory

```typescript
export function createOnlineProbeInEU(): ProbeData {
    return {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: 'EU-Amsterdam',
        region: 'EU',
    };
}
```

Fix: `return createProbeData({ region: 'EU', location: 'EU-Amsterdam' });`.

## Pattern 4 — JSON validation matrix

### Good ([test-data/app/httpSyntheticValidation.json](../../../test-data/app/httpSyntheticValidation.json))

```json
{
    "invalidNames": ["   ", "  "],
    "invalidTargets": ["not-a-url", "ftp://wrong-protocol.com", "just some text", "   "],
    "validMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"]
}
```

```typescript
import httpSyntheticValidation from '../../../test-data/app/httpSyntheticValidation.json';

for (const invalidName of httpSyntheticValidation.invalidNames) {
    test(`rejects invalid name: '${invalidName}'`, async ({ apiRequest }) => {
        // ...
    });
}
```

### Bad — Matrix declared inline in the spec

```typescript
const invalidTargets = ['not-a-url', 'ftp://wrong-protocol.com', 'just some text', '   ']; // duplicated in another spec
```

Fix: move to `test-data/app/<resource>Validation.json` and import. The JSON is the single source of truth for boundary lists.

## Pattern 5 — JSON lookup / sentinel

### Good ([test-data/app/probe.json](../../../test-data/app/probe.json))

```json
{
    "invalidId": "not-a-uuid-!!!",
    "nonExistentId": "00000000-0000-0000-0000-000000000000",
    "sqlInjectionId": "'; DROP TABLE probes; --",
    "xssId": "<script>alert(1)</script>"
}
```

```typescript
import probeData from '../../../test-data/app/probe.json';

await apiRequest({
    url: `${appConfig.api.PROBES}/${probeData.nonExistentId}`,
    /* ... */
});
```

### Bad — Hardcoded "non-existent" id

```typescript
const id = '00000000-0000-0000-0000-000000000000'; // magic; can't grep across the suite
```

Fix: every "non-existent" or "invalid" sentinel lives in `test-data/app/<resource>.json` under `nonExistentId` / `invalidId`.

## Pattern 6 — API seeder

### Good (the shape we want — assertion-style per [`docs/framework-alignment-plan.md` § 4.2](../../../docs/framework-alignment-plan.md))

```typescript
// helpers/app/testDataGenerators.ts (factory — Pattern 2)
export type ProbeData = { name: string; location: string; region: string };
export function createProbeData(overrides: Partial<ProbeData> = {}): ProbeData {
    return {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...overrides,
    };
}

// helpers/app/probes.ts (seeder — Pattern 6)
export async function setupProbe(
    apiRequest: ApiRequestFn,
    overrides?: Partial<ProbeData>,
): Promise<CreateProbeResponse> {
    const { status, body } = await apiRequest<CreateProbeResponse>({
        method: 'POST',
        url: appConfig.api.PROBES,
        baseUrl: appConfig.apiUrl,
        headers: process.env.USER_ACCESS_TOKEN_FULL,
        body: createProbeData(overrides),
    });
    expect(status).toBe(201);
    return CreateProbeResponseSchema.parse(body);
}

export async function teardownProbe(
    apiRequest: ApiRequestFn,
    id: string,
): Promise<void> { /* matches setupProbe */ }
```

- Factory + seeder in two files; seeder consumes the factory; create + delete are paired.

Test usage:

```typescript
const probeIds: string[] = [];

test('seeded probe path', async ({ apiRequest }) => {
    const probe = await setupProbe(apiRequest);
    probeIds.push(probe.probeId);
    // ...
});

test.afterAll(async ({ apiRequest }) => {
    for (const id of probeIds) await teardownProbe(apiRequest, id);
});
```

### Drift today — passthrough seeder + body builder ([helpers/app/probes.ts](../../../helpers/app/probes.ts))

```typescript
export async function createProbe<T = CreateProbeResponse>(
    apiRequest: ApiRequestFn,
    body: Record<string, unknown>,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: 'POST',
        url: appConfig.api.PROBES,
        baseUrl: appConfig.apiUrl,
        headers,
        body,
    });
}
```

Why this is interim:
- Seeder is doing one job (HTTP only). Factory + seeder are NOT yet integrated into a single setup helper.
- No `expect(status).toBe(201)` inside the helper → every spec must re-assert.
- No Zod parse → every spec must re-parse.

Fix: see [refactor-playbook §3](refactor-playbook.md#3-move-synthetic--probe--tenant--user-seeders-to-assertion-style-setup-helpers).

### Bad — Spec-inlined POST instead of using a seeder

```typescript
const { body } = await apiRequest({
    method: 'POST',
    url: appConfig.api.PROBES,
    baseUrl: appConfig.apiUrl,
    headers: process.env.USER_ACCESS_TOKEN_FULL,
    body: { /* probe payload */ },
});
```

Fix: `import { createProbe, buildCreateProbeBody } from '../../../helpers/app/probes';` then `await createProbe(apiRequest, buildCreateProbeBody(), process.env.USER_ACCESS_TOKEN_FULL);`.

## Pattern 7 — Per-test user via admin-API + Keycloak + Mailpit

### Good ([helpers/app/adminUsers.ts](../../../helpers/app/adminUsers.ts) shape)

```typescript
import { setupTestUser, teardownTestUser } from '../../../helpers/app/adminUsers';

const adminToken = process.env.USER_ACCESS_TOKEN_ADMIN!;
const tenantId = process.env.TENANT_ID!;
const password = process.env.APP_RESET_PASSWORD!;

let userEmail: string;
let userId: string;

test.beforeEach(async ({ apiRequest, mailpit }) => {
    ({ email: userEmail, userId } = await setupTestUser(
        apiRequest,
        mailpit,
        tenantId,
        password,
        'QA',
        adminToken,
    ));
});

test.afterEach(async ({ apiRequest, mailpit }) => {
    if (userEmail) {
        await teardownTestUser(
            apiRequest,
            mailpit,
            tenantId,
            userEmail,
            userId,
            adminToken,
        );
    }
});
```

- One user per test, plus-addressed for parallel safety, mirrored cleanup.

### Bad — Sharing a fresh user across tests

```typescript
let userEmail: string;
test.beforeAll(async () => {
    userEmail = getNextTestEmail(process.env.APP_MAIN_EMAIL!); // created once
    // setupTestUser(...)
});
test('A', async () => { /* mutates userEmail's state */ });
test('B', async () => { /* depends on A having mutated state */ });
test.afterAll(async () => { /* teardownTestUser(...) */ });
```

Fix: every test that mutates user state must be in its own `beforeEach`/`afterEach` lifecycle. Shared users only for purely read-only paths.

### Bad — Awaiting `getNextTestEmail`

```typescript
const userEmail = await getNextTestEmail(baseEmail); // noise; function is sync
```

Fix: drop the `await`.

### Bad — Spec writes a `process.env` token

```typescript
process.env.USER_ACCESS_TOKEN_TEMP = await getClientToken(kcClient); // forbidden in specs
```

Fix: only [tests/app/login.setup.ts](../../../tests/app/login.setup.ts) writes `process.env.USER_ACCESS_TOKEN_*`. Specs READ.

## Lifecycle: id-array drain (the canonical leak guard)

### Good ([tests/app/api/monitoring-service/probes/probes.spec.ts](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) pattern)

```typescript
test.describe('POST /probes', () => {
    const probeIds: string[] = [];

    test('creates a probe', async ({ apiRequest }) => {
        const { body, status } = await apiRequest<CreateProbeResponse>({
            method: 'POST',
            url: appConfig.api.PROBES,
            baseUrl: appConfig.apiUrl,
            headers: process.env.USER_ACCESS_TOKEN_FULL,
            body: buildCreateProbeBody(),
        });
        expect(status).toBe(201);
        const parsed = CreateProbeResponseSchema.parse(body);
        probeIds.push(parsed.probeId);
    });

    test.afterAll(async ({ apiRequest }) => {
        for (const id of probeIds) {
            await apiRequest<null>({
                method: 'DELETE',
                url: `${appConfig.api.PROBES}/${id}`,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL,
            });
        }
    });
});
```

### Bad — Cleanup inside the same test

```typescript
test('creates a probe', async ({ apiRequest }) => {
    const created = await createProbe(...);
    /* assertions */
    await deleteProbe(apiRequest, created.probeId);   // skipped if assertion fails earlier
});
```

Fix: push the id to `probeIds` immediately after the POST. Cleanup runs in `afterAll` regardless of test outcome.

## Token usage

### Good

```typescript
headers: process.env.USER_ACCESS_TOKEN_FULL,
```

### Bad — Aliased

```typescript
const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;
// ...
headers: TENANT_TOKEN,
```

Why it's wrong:
- Hides the canonical name. `rg USER_ACCESS_TOKEN_FULL` no longer reveals every consumer.
- Easy to copy-paste into a different spec and silently use the wrong token.

Fix: drop the alias; use `process.env.USER_ACCESS_TOKEN_FULL` directly. See [refactor-playbook §5](refactor-playbook.md#5-remove-token-aliasing).

## Mock JSON vs real seeding

### Good — purely-frontend assertion against a stub response

```typescript
import probeStub from '../../../test-data/app/probe.json';
await page.route('**/api/v1/probes/123', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(probeStub) })
);
```

### Bad — using a mock JSON as if it described a real backend resource

```typescript
import probeStub from '../../../test-data/app/probe.json';
const { body } = await apiRequest({ url: `${path}/${probeStub.nonExistentId}`, /* ... */ });
expect(body.name).toBe(probeStub.name); // backend may have drifted
```

Fix: seed via Pattern 6 + Pattern 7 (`setupTestUser` then call the resource API), then assert against the values you just seeded. See [refactor-playbook §4](refactor-playbook.md#4-replace-mockedcustomerjson-usage-with-real-seeding).

> Note: this project has no mock-JSON fixtures today; the rule is preserved for future use.

## Random amounts

### Good

```typescript
const amount = faker.number.float({ min: 1, max: 100000, multipleOf: 0.01 });
```

### Bad ([helpers/util/dataGenerator.ts](../../../helpers/util/dataGenerator.ts))

```typescript
export function generateRandomAmount(min = 1.0, max = 100000.0): number {
    const random = Math.random() * (max - min) + min;
    return Math.round(random * 100) / 100;
}
```

Why it's wrong:
- Re-implements something faker does in one line.
- `Math.random` is not seedable for diagnostics.
- Establishes a precedent for non-faker generators.

Fix: see [refactor-playbook §6](refactor-playbook.md#6-replace-generaterandomamount-with-faker).

## Cross-references

- [SKILL.md](SKILL.md)
- [reference.md](reference.md)
- [refactor-playbook.md](refactor-playbook.md)
- Sister: [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md)
