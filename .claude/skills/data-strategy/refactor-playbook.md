# Data Strategy — Refactor Playbook

Six numbered cleanups for the duplication and inconsistency hot spots already in this codebase. Each entry is self-contained: scope, before/after, mechanical migration steps, and a verification checklist. Recommendations only — execute when scoped into a refactor task.

> Convention: each playbook leaves the framework in a consumable state at every step (no "big bang" rewrite). Run the full suite after each step.

> Sections § 2 and § 4 are **ported verbatim from the upstream `the upstream reference framework` data-strategy playbook** with no changes to body, paths, or examples. They are preserved as faithful copies for two reasons: (1) so this skill matches the upstream playbook 1:1 in section count and structure, and (2) so the rules become immediately actionable if the corresponding patterns are introduced into this project later. Each verbatim section is flagged with a "Not applicable to this project today" annotation at the top.

## 1. Stop inlining synthetic / probe payloads — consume the existing builder

### Symptoms

- [helpers/app/probes.ts](../../../helpers/app/probes.ts) defines `buildCreateProbeBody`, `buildUpdateProbeBody`, `buildListProbesUrl` with override support.
- [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) defines `buildCreateSyntheticBody` (ICMP — base) plus six sibling per-type builders (`buildCreateHTTPSyntheticBody`, `buildCreateWebSocketSyntheticBody`, `buildCreateTCPSyntheticBody`, `buildCreateDNSSyntheticBody`, `buildCreateSSLSyntheticBody`, `buildCreateMCPSyntheticBody`) and `buildUpdateSyntheticBody` / `buildListSyntheticsUrl`.
- Specs that nevertheless hand-roll the same shape with `faker.*` inline are drift. Every business-rule change to a synthetic or probe shape requires touching ≥4 places.

### Migration steps

1. `rg "faker\." tests/app/api/<resource>.spec.ts tests/app/e2e/<resource>.spec.ts tests/app/functional/<resource>.spec.ts` to enumerate offending blocks for each resource.
2. For each inline block, replace with `buildCreateProbeBody({ /* only fields the test cares about */ })` or the matching synthetic-type builder. Drop `faker` import if it becomes unused.
3. For pairing tests, prefer an Object Mother that delegates to the base builder (planned per [`docs/framework-alignment-plan.md` § 6.4](../../../docs/framework-alignment-plan.md)).
4. If a test needs a field the builder doesn't randomize (e.g., a specific check interval or region), pass it via overrides — do NOT add a new builder.
5. If a test exercises a *boundary* on a single field, the override goes in the test:
   ```typescript
   const { name: _ignored, ...rest } = buildCreateProbeBody();
   const body = { ...rest, name: tooLongString };
   ```
6. Update [`api-testing/SKILL.md`](../api-testing/SKILL.md) Anti-patterns to add a "no inline faker for entities with a builder" line if missing.

### Verification

- `rg "name:\s*\`qa-(probe|icmp|http|tcp|dns|ssl|mcp|ws)-" tests/app/` → only inside helper files (`helpers/app/probes.ts`, `helpers/app/synthetics.ts`).
- Each touched spec imports from `helpers/app/probes` or `helpers/app/synthetics` and has **no** literal `faker.helpers.arrayElement([60, 300, 600]` (those live only inside the builder).
- Suite passes locally and in CI.

## 2. Collapse asset-pair near-duplicate

> **Not applicable to this project today.** Ported verbatim from the upstream the upstream reference framework data-strategy playbook. The asset-pair concept does not exist in this codebase; the section is preserved here as a faithful copy of the upstream rule for future reference if a similar near-duplicate pair is introduced.

### Symptoms

[helpers/back/assetPairs.ts](../../../helpers/back/assetPairs.ts) exports two near-identical generators:

- `createAssetPairData()` — resolves `baseAssetId`/`quotingAssetId` via the [enums/back/assets](../../../enums/back/assets.ts) lookup.
- `createAssetPairDataForUI()` — same shape, but stores raw `blockChainId` strings; `isDisabled: false` hard-coded.

Neither accepts overrides. UI vs API divergence is implicit.

### Target shape

```typescript
export type AssetPairData = { /* unchanged */ };

export function createAssetPairData(
    overrides: Partial<AssetPairData> = {}
): AssetPairData {
    return {
        id: 'TRXBTC',
        baseAssetId:
            ASSETS.find((a) => a.blockChainId === 'TRX')?.id ?? '',
        quotingAssetId:
            ASSETS.find((a) => a.blockChainId === 'BTC')?.id ?? '',
        accuracy: faker.number.int({ min: 1, max: 8 }),
        invertedAccuracy: faker.number.int({ min: 1, max: 8 }),
        minVolume: faker.number.float({ min: 0, max: 10, multipleOf: 0.0001 }),
        minInvertedVolume: faker.number.float({ min: 0, max: 10, multipleOf: 0.0001 }),
        isDisabled: faker.datatype.boolean(),
        source: null,
        source2: null,
        ...overrides,
    };
}

// Object Mother for the UI scenario
export function createAssetPairDataForUI(): AssetPairData {
    return createAssetPairData({
        baseAssetId: 'TRX',
        quotingAssetId: 'BTC',
        isDisabled: false,
    });
}
```

### Migration steps

1. Add `overrides?: Partial<AssetPairData>` to `createAssetPairData`.
2. Re-implement `createAssetPairDataForUI` as a one-liner that delegates to `createAssetPairData(...)`.
3. `rg createAssetPairData(ForUI)? tests/` to find all consumers — confirm no call site requires changes.
4. Run the related specs (asset-pair CRUD UI + API).
5. Optional: rename `createAssetPairDataForUI` → `assetPairForUI` in a follow-up PR for naming consistency with the other Object Mothers (`createMatchedVenueMarketPair` etc.).

### Verification

- `createAssetPairDataForUI` body is at most three lines.
- Both functions are exported from a single file.
- `rg "blockChainIdBase|blockChainIdQuoting" helpers/` returns 0 (those constants now appear only inside the factory's defaults).

## 3. Move synthetic / probe / tenant / user seeders to assertion-style setup helpers

### Symptoms

Every Pattern-6 seeder in [helpers/app/](../../../helpers/app/) is currently **passthrough** — it forwards `body` and `headers` to `apiRequest` and returns `{ status, body }` raw, leaving the spec to assert status and Zod-parse the response:

```typescript
// helpers/app/probes.ts (today)
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

Consequences:
- The seeder is doing one job (HTTP only). Factory + seeder are NOT yet integrated.
- No `expect(status).toBe(201)` inside the helper → every spec must re-assert.
- No Zod parse → every spec must re-parse.
- No exported typed factory (`ProbeData` / `SyntheticData` / `TenantData` / `UserData`) — `buildCreate<X>Body` returns `Record<string, unknown>`.
- Same shape is duplicated for negative cases inside individual specs.

### Target

Per [`docs/framework-alignment-plan.md` § 4.2](../../../docs/framework-alignment-plan.md), introduce paired typed factories + assertion-style setup helpers in [helpers/app/testDataGenerators.ts](../../../helpers/app/testDataGenerators.ts) and the resource helpers:

```typescript
// helpers/app/testDataGenerators.ts (factory — Pattern 2)
export type ProbeData = {
    name: string;
    location: string;
    region: string;
};

export function createProbeData(overrides: Partial<ProbeData> = {}): ProbeData {
    return {
        name: `qa-probe-${faker.string.alphanumeric(8).toLowerCase()}`,
        location: faker.location.city(),
        region: faker.location.country(),
        ...overrides,
    };
}
```

Update each resource helper to expose an assertion-style setup that consumes the factory:

```typescript
// helpers/app/probes.ts
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
): Promise<void> {
    const { status } = await apiRequest<null>({
        method: 'DELETE',
        url: `${appConfig.api.PROBES}/${id}`,
        baseUrl: appConfig.apiUrl,
        headers: process.env.USER_ACCESS_TOKEN_FULL,
    });
    expect([200, 204, 404]).toContain(status);
}
```

Apply the same shape to `setupSynthetic` (and per-type Object Mothers `setupHttpSynthetic`, `setupTcpSynthetic`, …), `setupTenant`, and `setupUser`.

### Migration steps

1. Add typed factories (`ProbeData`, `SyntheticData`, `TenantData`, `UserData`) + matching `createXData(overrides?)` to [helpers/app/testDataGenerators.ts](../../../helpers/app/testDataGenerators.ts) (create the file).
2. Replace each `buildCreate<X>Body` body with a delegation to the new factory; keep the existing function as a thin wrapper for backward compatibility, marked `@deprecated`.
3. Add assertion-style `setup<X>` / `teardown<X>` to each resource helper file. The existing passthrough `create<X>` / `delete<X>` stays for advanced specs that need to assert non-2xx outcomes (negative tests).
4. Migrate specs one resource at a time: every `beforeAll`/`beforeEach` that does `await create<X>(...)` followed by status + parse becomes `await setup<X>(...)`. Every `afterAll`/`afterEach` cleanup becomes `await teardown<X>(...)`.
5. Replace `faker.number.float({ ..., fractionDigits: N })` with `multipleOf: 0.0001` style (faker v9 prefers `multipleOf`; `fractionDigits` is deprecated).
6. After all consumers migrate, drop the `@deprecated` wrappers.

### Verification

- `rg "create(Probe|Synthetic|Tenant|User)Data" helpers/` returns hits only in `helpers/app/testDataGenerators.ts`.
- `rg "expect\(status\)\.toBe\(201\)" tests/app/api/` count drops as setup helpers absorb the assertion.
- `rg "Schema\.parse\(body\)" tests/app/api/` count drops as setup helpers absorb the parse.
- Probe / synthetic / tenant / user CRUD specs still pass.

## 4. Replace `mockedCustomer.json` usage with real seeding

> **Not applicable to this project today.** Ported verbatim from the upstream the upstream reference framework data-strategy playbook. There are no mock-JSON fixtures (`mockedCustomer.json`, `customer.json`) in this repo today; the section is preserved here as a faithful copy of the upstream rule for the moment any front-end-only spec introduces such a stub.

### Symptoms

- [test-data/back/mockedCustomer.json](../../../test-data/back/mockedCustomer.json), [test-data/back/customer.json](../../../test-data/back/customer.json) and their `-old` siblings encode customer fields that the live backend now owns.
- Specs that compare against these files silently drift when the backend evolves.
- Pattern 6 + Pattern 7 already provide a reliable alternative: create a user via Keycloak, then read the customer back via API.

### Migration steps

1. Audit consumers: `rg "mockedCustomer|test-data/back/customer\.json" tests/`.
2. Categorize each hit:
   - **Pure stub for a route mock** (page/network intercept). Keep — that's the legitimate Pattern-5 use of a fixed payload. Mark the import with a `// stub for route.fulfill` comment.
   - **Used as the assertion source** ("expect customer.email to be `mockedCustomer.email`"). Replace with seeded user flow.
3. For (b), add a precondition:
   ```typescript
   test.beforeEach(async () => {
       userEmail = getNextTestEmail();
       await createUserByEmail(userEmail);
       customerId = (await getCustomerByEmail(apiRequest, userEmail)).id;
   });
   test.afterEach(async () => deleteUserByEmail(userEmail));
   ```
4. Replace assertions to compare against the values you just seeded (`userEmail`, `customerId`) rather than the JSON fields.
5. Once a JSON file has zero remaining "real assertion" consumers, mark it deprecated by renaming to `<file>.deprecated.json` and adding a `// TODO: remove` in the route-mock callsite. Schedule deletion for the next housekeeping PR.
6. Delete `mockedCustomer-old.json` and `customer-old.json` outright; legacy files have no consumers.

### Verification

- `rg "mockedCustomer\." tests/` only appears inside `route.fulfill(...)` callbacks.
- No spec asserts a value derived from a customer mock JSON file.
- Front-end-only specs (which are the legitimate route-stub consumers) continue to pass.

## 5. Remove token aliasing

### Symptoms

```typescript
// tests/app/api/monitoring-service/metrics/synthetic-metrics.spec.ts
const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;
const ADMIN_TOKEN = process.env.USER_ACCESS_TOKEN_ADMIN;
```

```typescript
// tests/app/api/tenant-service/tenant-schema.spec.ts
const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;
const ADMIN_TOKEN = process.env.USER_ACCESS_TOKEN_ADMIN;
```

```typescript
// tests/app/api/monitoring-service/probes/probes.spec.ts
const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;
const ADMIN_TOKEN = process.env.USER_ACCESS_TOKEN_ADMIN;
```

Module-level aliases conceal the canonical name from `rg`, encourage copy-paste into other specs, and create N+1 places to update if a token rotates. This pattern is pervasive across `tests/app/api/**`, `tests/app/e2e/**`, and `tests/app/functional/**` — refactor playbook section dedicated.

### Migration steps

1. `rg "process\.env\.(USER|ADMIN)_ACCESS_TOKEN_" tests/ helpers/ -l` to enumerate the files using tokens.
2. Within each file, `rg "const \w+_TOKEN = process\.env\.(USER|ADMIN)_ACCESS_TOKEN_"` finds the aliases.
3. Replace each alias with the canonical `process.env.<NAME>` at the call site:
   ```typescript
   - const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL;
   - // ...
   - headers: TENANT_TOKEN,
   + headers: process.env.USER_ACCESS_TOKEN_FULL,
   ```
4. Helpers that accept `headers: string` as a parameter are fine to keep (the boundary is explicit). The spec entry point still uses the canonical env var.
5. Add a `data-strategy/aliasing` rule to [`api-testing/SKILL.md`](../api-testing/SKILL.md) if not already present.

### Verification

- `rg "const \w+_TOKEN = process\.env\.(USER|ADMIN)_ACCESS_TOKEN_" tests/app/` returns 0.
- Specs still pass.
- Grepping `USER_ACCESS_TOKEN_FULL` reveals every consumer.

## 6. Replace `generateRandomAmount` with faker

### Symptoms

[helpers/util/dataGenerator.ts](../../../helpers/util/dataGenerator.ts) provides:

```typescript
export function generateRandomAmount(min = 1.0, max = 100000.0): number {
    const random = Math.random() * (max - min) + min;
    return Math.round(random * 100) / 100;
}
```

`Math.random()` is non-seedable, breaks the project's faker-everywhere convention, and the file justifies its own existence with a single utility that faker already provides.

### Migration steps

1. `rg generateRandomAmount tests/ helpers/` to enumerate consumers.
2. Replace each call:
   ```typescript
   - const amount = generateRandomAmount();
   + const amount = faker.number.float({ min: 1, max: 100000, multipleOf: 0.01 });
   ```
3. Drop the import.
4. When the last consumer is migrated, delete [helpers/util/dataGenerator.ts](../../../helpers/util/dataGenerator.ts) and remove the export from any barrel files.

### Verification

- `rg "Math\.random" helpers/ tests/` returns 0 (or only intentional, commented-out cases).
- `rg generateRandomAmount` returns 0.
- Tests using the new amount distribution still pass (the old function clamped to 2 dp; faker with `multipleOf: 0.01` does the same).

## How to track these refactors

Open one PR per playbook §. Each PR scope ≤300 LOC. Run the following before merging:

```bash
# Drift audit — applicable sections (§§ 1, 3, 5, 6)
rg "name:\s*\`qa-(probe|icmp|http|tcp|dns|ssl|mcp|ws)-" tests/app/
rg "create(Probe|Synthetic|Tenant|User)Data" helpers/

# Aliasing audit (§ 5)
rg "const \w+_TOKEN = process\.env\.(USER|ADMIN)_ACCESS_TOKEN_" tests/app/
rg "const \w+_TOKEN = process\.env\.(USER|ADMIN)_ACCESS_TOKEN_" helpers/

# Math.random audit (§ 6)
rg "Math\.random" helpers/ tests/

# Verbatim sections (§§ 2, 4) — kept as faithful copies; not actionable in this repo today
# rg "exchange:\s*'(Phemex|Coinflare|Bitmart)'" tests/   # § 2 — upstream only
# rg "mockedCustomer\." tests/ -A2 | grep -v "route.fulfill"   # § 4 — upstream only
```

## Cross-references

- [SKILL.md](SKILL.md) — the rule each refactor enforces.
- [patterns.md](patterns.md) — good/bad examples for every pattern.
- [reference.md](reference.md) — catalogs to verify "is there already a helper?".
- Sister: [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md).
