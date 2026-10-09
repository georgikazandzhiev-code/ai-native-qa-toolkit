# Data Strategy — Pattern Examples

Side-by-side good/bad examples for every pattern in [SKILL.md](SKILL.md). All examples are drawn from real files in this repo. The "BAD" snippets reflect anti-patterns currently present or easy to slip in.

## Pattern 1 — Inline literal

### Good

```typescript
test('rejects empty job name', async ({ page }) => {
    const jobName = `qa-export-${faker.string.alphanumeric(8).toLowerCase()}`;
    await page.getByLabel('Name').fill(jobName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
});
```

- Single test usage, faker for uniqueness, no shared state.

### Bad

```typescript
let counter = 0;
test('foo', async () => {
    const name = `qa-worker-${counter++}`;        // module-level counter, parallel-unsafe
});
```

```typescript
test('non-existent worker returns 404', async ({ apiRequest }) => {
    const id = '00000000-0000-0000-0000-000000000000'; // hardcoded sentinel
});
```

Fix: pull `nonExistentId` from `test-data/app/worker.json` (Pattern 5).

## Pattern 2 — Typed factory with `Partial<T>` overrides

### Good — target shape (planned)

```typescript
export type WorkerData = {
    name: string;
    location: string;
    region: string;
};

export function createWorkerData(
    options: Partial<WorkerData> = {}
): WorkerData {
    return {
        name: `qa-worker-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...options,
    };
}
```

- Exported `WorkerData` type, `Partial<WorkerData> = {}` defaulted, `...options` last.

Test consumes with overrides:

```typescript
const worker = createWorkerData({ region: 'EU' });
```

### Drift today — `Record<string, unknown>` instead of typed factory (`helpers/app/workers.ts`)

```typescript
export function buildCreateWorkerBody(
    overrides?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        name: `qa-worker-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...overrides,
    };
}
```

The shape is right (defaults + spread overrides last) but the return type is `Record<string, unknown>` rather than an exported `WorkerData`. Refactor playbook § 3 covers the migration to typed factories paired with assertion-style setup helpers.

### Bad — Inline faker in spec when builder exists

```typescript
test('Creates worker', async ({ apiRequest }) => {
    const body = {
        name: `qa-worker-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
    }; // ← duplicates buildCreateWorkerBody
});
```

Fix: `import { buildCreateWorkerBody } from '../../../helpers/app/workers';` and call `buildCreateWorkerBody({ region: 'EU' })`.

### Bad — Forking the builder instead of adding overrides

Hypothetical drift to watch for:

```typescript
export function buildCreateWorkerBody(): Record<string, unknown> { /* … */ }
export function buildCreateWorkerBodyForUI(): Record<string, unknown> { /* same shape, hard-coded location */ }
```

Fix: one `buildCreateWorkerBody(overrides?: Partial<WorkerData>)`; UI variant becomes Pattern 3 (Object Mother).

## Pattern 3 — Object Mother on top of factory

### Good — target shape

```typescript
export function createWorkerForRegion(region = 'EU'): WorkerData {
    return createWorkerData({
        region,
        location: `${region}-${faker.location.city()}`,
    });
}

export function createMatchedWorkerAndJobPair(): {
    workerData: WorkerData;
    jobData: JobData;
} {
    const workerData = createWorkerData();
    return {
        workerData,
        jobData: createJobData({ /* workerIds populated after seeding */ }),
    };
}
```

- Mothers delegate to base factories. No re-declaration.

### Bad — Mother re-implements the factory

```typescript
export function createOnlineWorkerInEU(): WorkerData {
    return {
        name: `qa-worker-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: 'EU-Amsterdam',
        region: 'EU',
    };
}
```

Fix: `return createWorkerData({ region: 'EU', location: 'EU-Amsterdam' });`.

## Pattern 4 — JSON validation matrix

### Good (`test-data/app/httpJobValidation.json` — legacy camelCase name; new files use `<resource>-validation.json`)

```json
{
    "invalidNames": ["   ", "  "],
    "invalidTargets": ["not-a-url", "ftp://wrong-protocol.com", "just some text", "   "],
    "validMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"]
}
```

```typescript
import httpJobValidation from '../../../test-data/app/httpJobValidation.json';

for (const invalidName of httpJobValidation.invalidNames) {
    test(`rejects invalid name: '${invalidName}'`, async ({ apiRequest }) => {
        // ...
    });
}
```

### Bad — Matrix declared inline in the spec

```typescript
const invalidTargets = ['not-a-url', 'ftp://wrong-protocol.com', 'just some text', '   ']; // duplicated in another spec
```

Fix: move to `test-data/app/<resource>-validation.json` and import. The JSON is the single source of truth for boundary lists.

## Pattern 5 — JSON lookup / sentinel

### Good (`test-data/app/worker.json`)

```json
{
    "invalidId": "not-a-uuid-!!!",
    "nonExistentId": "00000000-0000-0000-0000-000000000000",
    "sqlInjectionId": "'; DROP TABLE workers; --",
    "xssId": "<script>alert(1)</script>"
}
```

```typescript
import workerData from '../../../test-data/app/worker.json';

await apiRequest({
    url: `${appConfig.api.WORKERS}/${workerData.nonExistentId}`,
    /* ... */
});
```

### Bad — Hardcoded "non-existent" id

```typescript
const id = '00000000-0000-0000-0000-000000000000'; // magic; can't grep across the suite
```

Fix: every "non-existent" or "invalid" sentinel lives in `test-data/app/<resource>.json` under `nonExistentId` / `invalidId`.

## Pattern 6 — API seeder

### Good (the shape we want — assertion-style)

```typescript
// helpers/app/testDataGenerators.ts (factory — Pattern 2)
export type WorkerData = { name: string; location: string; region: string };
export function createWorkerData(overrides: Partial<WorkerData> = {}): WorkerData {
    return {
        name: `qa-worker-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...overrides,
    };
}

// helpers/app/workers.ts (seeder — Pattern 6)
export async function setupTestWorker(
    apiRequest: ApiRequestFn,
    headers: string,
    overrides?: Partial<WorkerData>,
): Promise<CreateWorkerResponse> {
    const { status, body } = await apiRequest<CreateWorkerResponse>({
        method: 'POST',
        url: appConfig.api.WORKERS,
        baseUrl: appConfig.apiUrl,
        headers,
        body: createWorkerData(overrides),
    });
    expect(status).toBe(201);
    return CreateWorkerResponseSchema.parse(body);
}

export async function teardownTestWorker(
    apiRequest: ApiRequestFn,
    id: string,
    headers: string,
): Promise<void> { /* matches setupTestWorker */ }
```

- Factory + seeder in two files; seeder consumes the factory; create + delete are paired.

Test usage:

```typescript
const workerIds: string[] = [];

test('seeded worker path', async ({ apiRequest }) => {
    const worker = await setupTestWorker(apiRequest, process.env.USER_ACCESS_TOKEN_FULL!);
    workerIds.push(worker.workerId);
    // ...
});

test.afterAll(async ({ apiRequest }) => {
    for (const id of workerIds) await teardownTestWorker(apiRequest, id, process.env.USER_ACCESS_TOKEN_FULL!);
});
```

### Drift today — passthrough seeder + body builder (`helpers/app/workers.ts`)

```typescript
export async function createWorker<T = CreateWorkerResponse>(
    apiRequest: ApiRequestFn,
    body: Record<string, unknown>,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: 'POST',
        url: appConfig.api.WORKERS,
        baseUrl: appConfig.apiUrl,
        headers,
        body,
    });
}
```

Why this is interim:
- Seeder does one thing (HTTP only). Factory + seeder are NOT yet integrated into a single setup helper.
- No `expect(status).toBe(201)` inside the helper → every spec must re-assert.
- No Zod parse → every spec must re-parse.

Fix: see [refactor-playbook §3](refactor-playbook.md#3-move-job--worker--tenant--user-seeders-to-assertion-style-setup-helpers).

### Bad — Spec-inlined POST instead of using a seeder

```typescript
const { body } = await apiRequest({
    method: 'POST',
    url: appConfig.api.WORKERS,
    baseUrl: appConfig.apiUrl,
    headers: process.env.USER_ACCESS_TOKEN_FULL,
    body: { /* worker payload */ },
});
```

Fix: `import { createWorker, buildCreateWorkerBody } from '../../../helpers/app/workers';` then `await createWorker(apiRequest, buildCreateWorkerBody(), process.env.USER_ACCESS_TOKEN_FULL);`.

## Pattern 7 — Per-test user via admin-API + Keycloak + Mailpit

### Good (`helpers/app/adminUsers.ts` shape)

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

Fix: only `tests/app/login.setup.ts` writes `process.env.USER_ACCESS_TOKEN_*`. Specs READ.

## Lifecycle: id-array drain (the canonical leak guard)

### Good (`tests/app/api/jobs-service/workers/workers.spec.ts` pattern)

```typescript
test.describe('POST /workers', () => {
    const workerIds: string[] = [];

    test('creates a worker', async ({ apiRequest }) => {
        const { body, status } = await apiRequest<CreateWorkerResponse>({
            method: 'POST',
            url: appConfig.api.WORKERS,
            baseUrl: appConfig.apiUrl,
            headers: process.env.USER_ACCESS_TOKEN_FULL,
            body: buildCreateWorkerBody(),
        });
        expect(status).toBe(201);
        const parsed = CreateWorkerResponseSchema.parse(body);
        workerIds.push(parsed.workerId);
    });

    test.afterAll(async ({ apiRequest }) => {
        for (const id of workerIds) {
            await apiRequest<null>({
                method: 'DELETE',
                url: `${appConfig.api.WORKERS}/${id}`,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL,
            });
        }
    });
});
```

### Bad — Cleanup inside the same test

```typescript
test('creates a worker', async ({ apiRequest }) => {
    const created = await createWorker(...);
    /* assertions */
    await deleteWorker(apiRequest, created.workerId);   // skipped if assertion fails earlier
});
```

Fix: push the id to `workerIds` immediately after the POST. Cleanup runs in `afterAll` regardless of test outcome.

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
import workerStub from '../../../test-data/app/worker.json';
await page.route('**/api/v1/workers/123', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify(workerStub) })
);
```

### Bad — using a mock JSON as if it described a real backend resource

```typescript
import workerStub from '../../../test-data/app/worker.json';
const { body } = await apiRequest({ url: `${path}/${workerStub.nonExistentId}`, /* ... */ });
expect(body.name).toBe(workerStub.name); // backend may have drifted
```

Fix: seed via Pattern 6 + Pattern 7 (`setupTestUser` then call the resource API), then assert against the values you just seeded. See [refactor-playbook §4](refactor-playbook.md#4-replace-mockedcustomerjson-usage-with-real-seeding).

> Note: this project has no mock-JSON fixtures today; the rule is preserved for future use.

## Random amounts

### Good

```typescript
const amount = faker.number.float({ min: 1, max: 100000, multipleOf: 0.01 });
```

### Bad (`helpers/util/dataGenerator.ts`)

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
