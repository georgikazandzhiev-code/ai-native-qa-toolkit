# API Testing Templates

Copy-paste skeletons. Replace `<Resource>` (PascalCase), `<resource>` (camelCase), `<RESOURCE>` (UPPER_SNAKE matching `appConfig.api.X`), `<SUITE>` (matches `SUITES.API_*`), the field list, and the body builder name.

> Anchored on the synthetics resource because it is the most complete CRUD example and exercises every pattern (list-with-paging, single-keyed-by-resource, create-with-status-string, update-with-echoed-entity, probe dependency, per-field PATCH isolation).

> These skeletons encode the **plan-aligned target state** (see [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md)): `z.strictObject()` schemas, `z.string().uuid()` ids, hyphen-case test-data filenames, `Verify METHOD /path returns <status>` test names, assertion-style setup helpers paired with passthrough CRUD, and shared schemas centralized in `fixtures/api/schemas/util/common.ts`. Copying any template should produce code that already matches the plan; do not regress to current-state shortcuts.

> **Companion playbook:** [http-method-coverage.md](http-method-coverage.md) explains, per verb, which test scenarios the § 1 skeleton must cover (per-field PATCH isolation, idempotency-as-404 on DELETE, the 405 catch-all loop, the auth-coverage matrix). Use the templates here for **shape** and the playbook for **coverage**.

## 1. Full CRUD spec

Drop into `tests/app/api/<resource>.spec.ts`.

> **Helper vs direct `apiRequest` — pick per test.** The template below uses helpers because most CRUD specs are large and helpers de-duplicate the URL/headers boilerplate. **For single-spec one-shot calls, prefer direct `apiRequest({...})` inline** — it surfaces the request shape next to the assertion (upstream-style; see `tests/app/api/tenant-service/admin-realms.spec.ts` and `tests/app/api/shared/cross-tenant-isolation.spec.ts`). Mix freely within one file: helpers for repeated CRUD, inline `apiRequest` for one-off probes.

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { appConfig } from "../../../config/app";
import { faker } from "@faker-js/faker";
import {
    <Resource>Schema,
    Create<Resource>ResponseSchema,
    Get<Resource>ResponseSchema,
    Update<Resource>ResponseSchema,
    Delete<Resource>ResponseSchema,
    List<Resource>sResponseSchema,
    APIErrorSchema,
    GatewayErrorSchema,
    type <Resource>,
    type Create<Resource>Response,
    type Get<Resource>Response,
    type Update<Resource>Response,
    type Delete<Resource>Response,
    type List<Resource>sResponse,
    type APIError,
    type GatewayError,
} from "../../../fixtures/api/schemas/app/<resource>";
// There is no fixtures/api/schemas/app/index.ts barrel — specs deep-import
// from the resource file directly.
import {
    invalidString,
    invalidIntegerTypes,
    // specialChars, boundaryString, invalidObjectTypes — add as needed; remove unused imports.
} from "../../../fixtures/api/invalid-types";
import {
    list<Resource>s,
    create<Resource>,
    get<Resource>,
    update<Resource>,
    delete<Resource>,
    cleanup<Resource>s,
    buildCreate<Resource>Body,
    buildUpdate<Resource>Body,
} from "../../../helpers/app/<resource>";
import resourceData from "../../../test-data/app/<resource>.json";

// No token aliases — use process.env.USER_ACCESS_TOKEN_* directly at every call site.
// See data-strategy/reference.md §1.6 for rationale (grepability, no alias-name drift).
// Existing specs with aliases are tech debt; normalize when next touching the file.

// Optional: hoist the file's single tag to a const when every test in the file shares it.
// One source of truth, and re-tagging the whole file is a one-line change:
//   const TAG = { tag: "@App-API" } as const;
//   test("Verify ...", TAG, async ({ apiRequest }) => { ... });
// The inline `{ tag: "@App-API" }` form used below is equally valid — pick one per file.
// The tag whitelist + single-tag rule is owned by the `test-standards` skill.

// ═══════════════════════════════════════════════════════════════
// GET /<resource>s — List
// ═══════════════════════════════════════════════════════════════

test.describe("GET /<resource>s — List", () => {
    test(
        "Verify GET /<resource>s returns 200 with valid schema and default pagination",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);
            // qase.id(<id>);

            const { status, body } = await list<Resource>s(apiRequest, process.env.USER_ACCESS_TOKEN_FULL!);

            expect(status).toBe(200);
            expect(List<Resource>sResponseSchema.parse(body)).toBeTruthy();
            expect(body.pageInfo.page).toBe(1);
            expect(body.pageInfo.pageSize).toBe(10);
            expect(body.<resource>s.length).toBeLessThanOrEqual(body.pageInfo.pageSize);
        },
    );

    test(
        "Verify GET /<resource>s returns 401 for missing Authorization header",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { status, body } = await list<Resource>s<GatewayError>(apiRequest);

            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify GET /<resource>s returns 403 for token without permissions",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            // Guard: USER_ACCESS_TOKEN_ZERO is not always provisioned in the test env.
            test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "USER_ACCESS_TOKEN_ZERO not provisioned");
            qase.suite(SUITES.API_<SUITE>);

            // Cast generic to `null` because at 403 the body is null, not List<Resource>sResponse.
            const { status, body } = await list<Resource>s<null>(apiRequest, process.env.USER_ACCESS_TOKEN_ZERO!);

            expect(status).toBe(403);
            expect(body).toBeNull();
        },
    );
});

// ═══════════════════════════════════════════════════════════════
// POST /<resource>s — Create
// ═══════════════════════════════════════════════════════════════

test.describe("POST /<resource>s — Create", () => {
    const createdIds: string[] = [];

    test(
        "Verify POST /<resource>s with valid data returns 201",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);
            // qase.id(<id>);

            const { status, body } = await create<Resource>(
                apiRequest,
                buildCreate<Resource>Body(),
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(201); // adjust to 200 if the endpoint actually returns 200
            expect(Create<Resource>ResponseSchema.parse(body)).toBeTruthy();
            createdIds.push(body.<resource>Id);
        },
    );

    test(
        "Verify POST /<resource>s returns 400 for invalid name",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const baseBody = buildCreate<Resource>Body();

            for (const invalid of invalidString) {
                const { status, body } = await create<Resource>(
                    apiRequest,
                    { ...baseBody, name: invalid },
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );
                expect(status, `name=${JSON.stringify(invalid)}`).toBe(400);
                expect(APIErrorSchema.parse(body)).toBeTruthy();
            }
        },
    );

    test(
        "Verify POST /<resource>s returns 401 for missing Authorization header",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { status, body } = await create<Resource><GatewayError>(
                apiRequest,
                buildCreate<Resource>Body(),
            );

            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify POST /<resource>s returns 403 for token without permissions",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "USER_ACCESS_TOKEN_ZERO not provisioned");
            qase.suite(SUITES.API_<SUITE>);

            const { status, body } = await create<Resource><null>(
                apiRequest,
                buildCreate<Resource>Body(),
                process.env.USER_ACCESS_TOKEN_ZERO!,
            );

            expect(status).toBe(403);
            expect(body).toBeNull();
        },
    );

    test.afterAll(async ({ apiRequest }) => {
        await cleanup<Resource>s(apiRequest, createdIds, process.env.USER_ACCESS_TOKEN_FULL!);
    });
});

// ═══════════════════════════════════════════════════════════════
// GET /<resource>s/:id — Single
// ═══════════════════════════════════════════════════════════════

test.describe("GET /<resource>s/:id — Single", () => {
    // `!`: set in test.beforeAll.
    let seeded!: <Resource>;
    const createdIds: string[] = [];

    test.beforeAll(async ({ apiRequest }) => {
        const { status, body } = await create<Resource>(
            apiRequest,
            buildCreate<Resource>Body(),
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
        expect(status).toBe(201);
        const fetched = await get<Resource>(apiRequest, body.<resource>Id, process.env.USER_ACCESS_TOKEN_FULL!);
        expect(fetched.status).toBe(200);
        seeded = fetched.body.<resource>;
        createdIds.push(seeded.id);
    });

    test(
        "Verify GET /<resource>s/:id returns 200",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { status, body } = await get<Resource>(apiRequest, seeded.id, process.env.USER_ACCESS_TOKEN_FULL!);

            expect(status).toBe(200);
            expect(Get<Resource>ResponseSchema.parse(body)).toBeTruthy();
            expect(body.<resource>.id).toBe(seeded.id);
        },
    );

    test(
        "Verify GET /<resource>s/:id returns 400 for invalid id format",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { invalidId } = resourceData;
            const { status, body } = await get<Resource><APIError>(apiRequest, invalidId, process.env.USER_ACCESS_TOKEN_FULL!);

            expect(status).toBe(400);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify GET /<resource>s/:id returns 404 for non-existent id",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { nonExistentId } = resourceData;
            const { status, body } = await get<Resource><APIError>(apiRequest, nonExistentId, process.env.USER_ACCESS_TOKEN_FULL!);

            expect(status).toBe(404);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test.afterAll(async ({ apiRequest }) => {
        await cleanup<Resource>s(apiRequest, createdIds, process.env.USER_ACCESS_TOKEN_FULL!);
    });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /<resource>s/:id — Per-field isolation
// ═══════════════════════════════════════════════════════════════

test.describe("PATCH /<resource>s/:id — Per-field isolation", () => {
    // `!` (definite assignment) is required because the variable is set inside test.beforeEach,
    // which TypeScript's flow analysis does not see when strict mode is on. Same pattern as
    // `let probeId: string;` in tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts.
    let resource!: <Resource>;
    const createdIds: string[] = [];

    test.beforeEach(async ({ apiRequest }) => {
        const { status, body } = await create<Resource>(
            apiRequest,
            buildCreate<Resource>Body(),
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
        expect(status).toBe(201);
        const fetched = await get<Resource>(apiRequest, body.<resource>Id, process.env.USER_ACCESS_TOKEN_FULL!);
        expect(fetched.status).toBe(200);
        resource = fetched.body.<resource>;
        createdIds.push(resource.id);
    });

    test(
        "Verify PATCH /<resource>s/:id updates ONLY name and preserves all other fields",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const newName = `qa-<resource>-upd-${faker.string.alphanumeric(8).toLowerCase()}`;
            // `!` is needed for the same reason — `before` is set inside the first test.step.
            let before!: <Resource>;

            await test.step("GET before PATCH", async () => {
                const { status, body } = await get<Resource>(apiRequest, resource.id, process.env.USER_ACCESS_TOKEN_FULL!);
                expect(status).toBe(200);
                before = body.<resource>;
            });

            await test.step("PATCH with only name", async () => {
                const { status, body } = await update<Resource>(
                    apiRequest,
                    resource.id,
                    { name: newName },
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );
                expect(status).toBe(200);
                expect(Update<Resource>ResponseSchema.parse(body)).toBeTruthy();
            });

            await test.step("GET after PATCH and verify name changed, all other fields preserved", async () => {
                const { status, body } = await get<Resource>(apiRequest, resource.id, process.env.USER_ACCESS_TOKEN_FULL!);
                expect(status).toBe(200);
                expect(body.<resource>.name).toBe(newName);
                // Assert every other field matches `before` — repeat per project field list:
                expect(body.<resource>.target).toBe(before.target);
                expect(body.<resource>.checkInterval).toBe(before.checkInterval);
                expect(body.<resource>.timeout).toBe(before.timeout);
                // ...
            });
        },
    );

    // Repeat the test above for: target, checkInterval, timeout, status, config (one per updatable field).

    test.afterEach(async ({ apiRequest }) => {
        await cleanup<Resource>s(apiRequest, createdIds, process.env.USER_ACCESS_TOKEN_FULL!);
        createdIds.length = 0;
    });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /<resource>s/:id — Per-field invalid-type validation matrix
// (one invalid field per PATCH; PATCH allows partial bodies, so the
//  rest-valid pattern from the rule is reserved for PUT specs)
// ═══════════════════════════════════════════════════════════════

test.describe("PATCH /<resource>s/:id — Validation", () => {
    // Same `!` reasoning as the Per-field-isolation describe above.
    let resource!: <Resource>;
    const createdIds: string[] = [];

    test.beforeAll(async ({ apiRequest }) => {
        const { status, body } = await create<Resource>(
            apiRequest,
            buildCreate<Resource>Body(),
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
        expect(status).toBe(201);
        const fetched = await get<Resource>(apiRequest, body.<resource>Id, process.env.USER_ACCESS_TOKEN_FULL!);
        expect(fetched.status).toBe(200);
        resource = fetched.body.<resource>;
        createdIds.push(resource.id);
    });

    const fieldMatrix = {
        name: invalidString,
        target: invalidString,
        checkInterval: invalidIntegerTypes,
        timeout: invalidIntegerTypes,
    } as const;

    for (const [field, invalidValues] of Object.entries(fieldMatrix)) {
        for (const invalid of invalidValues) {
            test(
                `Verify PATCH /<resource>s/:id rejects invalid ${field}: ${JSON.stringify(invalid)}`,
                { tag: "@App-API" },
                async ({ apiRequest }) => {
                    qase.suite(SUITES.API_<SUITE>);

                    const { status, body } = await update<Resource>(
                        apiRequest,
                        resource.id,
                        { [field]: invalid },
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    expect(status).toBe(400);
                    expect(APIErrorSchema.parse(body)).toBeTruthy();
                },
            );
        }
    }

    test(
        "Verify PATCH /<resource>s/:id with empty body returns 400",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { status, body } = await update<Resource><APIError>(
                apiRequest,
                resource.id,
                {},
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(400);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test.afterAll(async ({ apiRequest }) => {
        await cleanup<Resource>s(apiRequest, createdIds, process.env.USER_ACCESS_TOKEN_FULL!);
    });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /<resource>s/:id
// ═══════════════════════════════════════════════════════════════

test.describe("DELETE /<resource>s/:id", () => {
    test(
        "Verify DELETE /<resource>s/:id returns 200",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const created = await create<Resource>(
                apiRequest,
                buildCreate<Resource>Body(),
                process.env.USER_ACCESS_TOKEN_FULL!,
            );
            // Fail loudly here so the DELETE assertion below never debugs a phantom id.
            expect(created.status).toBe(201);

            const { status, body } = await delete<Resource>(
                apiRequest,
                created.body.<resource>Id,
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(200);
            expect(Delete<Resource>ResponseSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify DELETE /<resource>s/:id returns 404 for non-existent id",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_<SUITE>);

            const { nonExistentId } = resourceData;
            const { status, body } = await delete<Resource><APIError>(
                apiRequest,
                nonExistentId,
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(404);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );
});

// ═══════════════════════════════════════════════════════════════
// 405 — Unsupported methods
// ═══════════════════════════════════════════════════════════════

test(
    "Verify /<resource>s rejects unsupported methods with 405",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
        qase.suite(SUITES.API_<SUITE>);

        const UNSUPPORTED = ["PUT", "PATCH"] as const; // adjust per endpoint
        for (const method of UNSUPPORTED) {
            const { status, body } = await apiRequest({
                method,
                url: appConfig.api.<RESOURCE>,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL!,
            });
            expect(status, `${method} should return 405`).toBe(405);
            expect(body).toBeNull();
        }
    },
);
```

## 2. Synthetic-with-probe spec (probe dependency)

When the spec under test depends on a probe, seed the probe in `beforeAll` and use `cleanupProbesAndSynthetics` (synthetics first, probes second).

The example below imports the **ICMP** body builder. For other monitor types, swap to the matching helper from `helpers/app/synthetics.ts` — `buildCreateHTTPSyntheticBody` / `buildCreateTCPSyntheticBody` / `buildCreateDNSSyntheticBody` / `buildCreateSSLSyntheticBody` / `buildCreateWebSocketSyntheticBody` / `buildCreateMCPSyntheticBody`. See the per-type `target` and `config` cheat sheet at the end of this file.

```typescript
import {
    cleanupProbesAndSynthetics,
    buildCreateSyntheticBody, // swap to buildCreate<Type>SyntheticBody for HTTP/TCP/DNS/SSL/WebSocket/MCP
    createSyntheticMonitor,
    deleteSyntheticMonitor,
} from "../../../helpers/app/synthetics";
import { buildCreateProbeBody, createProbe } from "../../../helpers/app/probes";

const process.env.USER_ACCESS_TOKEN_FULL! = process.env.USER_ACCESS_TOKEN_FULL!;

// `!` (definite assignment): set in test.beforeAll. Mirrors tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts.
let probeId!: string;
const createdProbeIds: string[] = [];
const createdSyntheticIds: string[] = [];

test.beforeAll(async ({ apiRequest }) => {
    if (!process.env.USER_ACCESS_TOKEN_FULL!) {
        throw new Error("USER_ACCESS_TOKEN_FULL is required for synthetic API tests.");
    }
    const probeBody = buildCreateProbeBody();
    const { status, body } = await createProbe(apiRequest, probeBody, process.env.USER_ACCESS_TOKEN_FULL!);
    if (status !== 201) {
        throw new Error(`Shared probe POST /probes expected 201, got ${status}: ${JSON.stringify(body)}`);
    }
    probeId = body.probeId;
    createdProbeIds.push(probeId);
});

// Tests use `probeId` in synthetic creation bodies and push synthetic ids into createdSyntheticIds.

// Synthetics MUST be deleted before probes (409 Conflict otherwise).
test.afterAll(async ({ apiRequest }) => {
    await cleanupProbesAndSynthetics(
        apiRequest,
        createdProbeIds,
        createdSyntheticIds,
        process.env.USER_ACCESS_TOKEN_FULL!,
    );
});
```

## 3. Schema file (`fixtures/api/schemas/app/<resource>.ts`)

> **Strictness checklist** before committing this file (see `SKILL.md` § "Optional vs nullable"):
> 1. Audit fields (`id`, `createdAt`, `updatedAt`, `tenantId`) are **strict** — never optional, never nullable.
> 2. Every `.optional()` is accompanied by a comment naming the condition that makes the field absent, AND a test that exercises both branches.
> 3. Every `.nullable()` is accompanied by a test that hits the null state.
> 4. No `.optional().nullable()` without a one-line justification.
> 5. Prefer `z.enum([...])` over `z.string()` whenever the value set is closed.
> 6. `z.strictObject()` is the default for new schemas — rejects unexpected fields and catches additive API drift.

```typescript
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Error Responses & Pagination — import the shared schemas
// ═══════════════════════════════════════════════════════════════
// fixtures/api/schemas/util/common.ts is the canonical home for shared
// schemas: PageInfoSchema, APIErrorSchema (both z.strictObject), and
// JSONSchemaResponseSchema. Import (and re-export for your consumers)
// rather than declaring local copies — synthetic.ts and policy.ts show
// the pattern.
// GatewayErrorSchema (401 shape) is not yet centralized — re-export it
// from an existing strict copy (tenant.ts / user.ts / policy.ts) instead
// of adding a new one.

export { APIErrorSchema, type APIError } from "../util/common";
import { PageInfoSchema, type PageInfo } from "../util/common";
export { PageInfoSchema, type PageInfo };

export { GatewayErrorSchema, type GatewayError } from "./tenant";

// ═══════════════════════════════════════════════════════════════
// Resource
// ═══════════════════════════════════════════════════════════════

export const <Resource>Schema = z.strictObject({
    // Default to .uuid() (upstream pattern). Loosen to z.string() ONLY if you've
    // empirically verified the API returns a non-UUID id.
    id: z.string().uuid(),
    name: z.string(),
    target: z.string(),
    type: z.string(),
    // Closed value set — strict enum, never z.string().
    status: z.enum(["enabled", "disabled"]),
    // ⚠ STRICTNESS DECISION: is `healthStatus` really sometimes absent?
    //   - If always present (perhaps with a "pending"/"unknown" sentinel right after create), tighten to `z.string()` or `z.enum([...])`.
    //   - If conditionally absent, replace `<condition>` below with the actual trigger and add a test for both branches.
    // Until verified, prefer strict and remove `.optional()`.
    healthStatus: z.string(), // .optional() — only if absence is verified under <condition>
    checkInterval: z.number().int(),
    timeout: z.number().int(),
    // Free-form per `type`. Once shapes stabilize, replace with z.discriminatedUnion("type", [...]).
    config: z.record(z.unknown()),
    // Audit fields are NEVER optional/nullable.
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

// ═══════════════════════════════════════════════════════════════
// GET /<resource>s — List
// ═══════════════════════════════════════════════════════════════
// PageInfoSchema comes from ../util/common (imported above) — never
// declare a local copy.

export const List<Resource>sResponseSchema = z.strictObject({
    pageInfo: PageInfoSchema,
    <resource>s: z.array(<Resource>Schema),
});

// ═══════════════════════════════════════════════════════════════
// POST /<resource>s — Create
// ═══════════════════════════════════════════════════════════════

export const Create<Resource>ResponseSchema = z.strictObject({
    <resource>Id: z.string().uuid(),
    status: z.string(),
});

// ═══════════════════════════════════════════════════════════════
// GET /<resource>s/:id — Single
// ═══════════════════════════════════════════════════════════════

export const Get<Resource>ResponseSchema = z.strictObject({
    <resource>: <Resource>Schema,
});

// ═══════════════════════════════════════════════════════════════
// PATCH /<resource>s/:id — Update
// ═══════════════════════════════════════════════════════════════

export const Update<Resource>ResponseSchema = z.strictObject({
    status: z.string(),
    <resource>: <Resource>Schema, // omit if the API does not echo the entity
});

// ═══════════════════════════════════════════════════════════════
// DELETE /<resource>s/:id
// ═══════════════════════════════════════════════════════════════

export const Delete<Resource>ResponseSchema = z.strictObject({
    <resource>Id: z.string().uuid(),
    status: z.string(),
});

// ═══════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════

// APIError / GatewayError / PageInfo types are already re-exported above
// alongside their schemas — do not redeclare them here.
export type <Resource> = z.infer<typeof <Resource>Schema>;
export type List<Resource>sResponse = z.infer<typeof List<Resource>sResponseSchema>;
export type Create<Resource>Response = z.infer<typeof Create<Resource>ResponseSchema>;
export type Get<Resource>Response = z.infer<typeof Get<Resource>ResponseSchema>;
export type Update<Resource>Response = z.infer<typeof Update<Resource>ResponseSchema>;
export type Delete<Resource>Response = z.infer<typeof Delete<Resource>ResponseSchema>;
```

There is **no `fixtures/api/schemas/app/index.ts` barrel** — specs deep-import from the resource file. (The `util/` side does have a barrel: `fixtures/api/schemas/util/index.ts` re-exports `./common` and `./keycloak`.)

> **Name-collision callout:** if your new resource happens to export a `UserSchema`, do **not** dodge the collision with an `as <Alias>` re-export. The existing collision is **still live today** (`tenant.ts` admin-side `UserSchema` vs `user.ts` tenant-side `UserSchema`); the planned fix (`docs/framework-alignment-plan.md` § 5.4) renames the admin-side schema to `AdminUserSchema` at the source. Pick distinctly-named schemas at definition time.

## 4. Helper file (`helpers/app/<resource>.ts`)

```typescript
import { appConfig } from "../../config/app";
import type { ApiRequestFn, ApiRequestResponse } from "../../fixtures/api/api-types";
import type {
    Create<Resource>Response,
    Delete<Resource>Response,
    Get<Resource>Response,
    List<Resource>sResponse,
    Update<Resource>Response,
} from "../../fixtures/api/schemas/app/<resource>";
import { faker } from "@faker-js/faker";

// ═══════════════════════════════════════════════════════════════
// Body builders
// ═══════════════════════════════════════════════════════════════

// TARGET SHAPE (preferred for new builders): a `Create<Resource>Body` type +
// `overrides?: Partial<Create<Resource>Body>`. The typed override gives compile-time
// safety — `buildCreate<Resource>Body({ chekInterval: 300 })` (typo) or
// `{ checkInterval: "300" }` (wrong type) fails to compile instead of silently
// producing a body the server rejects at runtime. It also makes the builder self-
// documenting: the field set is the type, not a `Record` free-for-all.
//
//   type Create<Resource>Body = {
//       name: string;
//       target: string;
//       type: string;
//       checkInterval: number;
//       timeout: number;
//       config: Record<string, unknown>;
//   };
//
//   export function buildCreate<Resource>Body(
//       overrides?: Partial<Create<Resource>Body>,
//   ): Create<Resource>Body {
//       return { name: ..., target: ..., /* ... */, ...overrides };
//   }
//
// INTERIM SHAPE (matches most existing helpers today): `Record<string, unknown>`.
// Existing `buildCreate<X>Body` builders return `Record<string, unknown>`; migrating
// them to the typed shape is tracked as a separate task (data-strategy refactor-playbook
// §§ 1 + 3). New builders should be authored in the typed shape from the start.

export function buildCreate<Resource>Body(
    overrides?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        name: `qa-<resource>-${faker.string.alphanumeric(8).toLowerCase()}`,
        target: faker.internet.url(),
        type: "<defaultType>",
        checkInterval: 300,
        timeout: 30,
        config: {},
        ...overrides,
    };
}

export function buildUpdate<Resource>Body(
    overrides?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        name: `qa-<resource>-upd-${faker.string.alphanumeric(8).toLowerCase()}`,
        target: faker.internet.url(),
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════
// URL builder (filters/sorting/paging)
// ═══════════════════════════════════════════════════════════════

export function buildList<Resource>sUrl(params?: {
    page?: number;
    pageSize?: number;
    sort?: string;
    direction?: string;
    name?: string;
    search?: string;
}): string {
    const base = appConfig.api.<RESOURCE>;
    if (!params) return base;

    const sp = new URLSearchParams();
    if (params.page !== undefined) sp.set("page", String(params.page));
    if (params.pageSize !== undefined) sp.set("pageSize", String(params.pageSize));
    if (params.sort) sp.set("sort", params.sort);
    if (params.direction) sp.set("direction", params.direction);
    if (params.name) sp.set("name", params.name);
    if (params.search) sp.set("search", params.search);

    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
}

// ═══════════════════════════════════════════════════════════════
// CRUD helpers — positional, token last
// ═══════════════════════════════════════════════════════════════

export async function list<Resource>s<T = List<Resource>sResponse>(
    apiRequest: ApiRequestFn,
    headers?: string,
    params?: Parameters<typeof buildList<Resource>sUrl>[0],
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "GET",
        url: buildList<Resource>sUrl(params),
        baseUrl: appConfig.apiUrl,
        headers,
    });
}

export async function create<Resource><T = Create<Resource>Response>(
    apiRequest: ApiRequestFn,
    body: Record<string, unknown>,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "POST",
        url: appConfig.api.<RESOURCE>,
        baseUrl: appConfig.apiUrl,
        headers,
        body,
    });
}

export async function get<Resource><T = Get<Resource>Response>(
    apiRequest: ApiRequestFn,
    <resource>Id: string,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "GET",
        url: `${appConfig.api.<RESOURCE>}/${<resource>Id}`,
        baseUrl: appConfig.apiUrl,
        headers,
    });
}

export async function update<Resource><T = Update<Resource>Response>(
    apiRequest: ApiRequestFn,
    <resource>Id: string,
    body: Record<string, unknown>,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "PATCH",
        url: `${appConfig.api.<RESOURCE>}/${<resource>Id}`,
        baseUrl: appConfig.apiUrl,
        headers,
        body,
    });
}

export async function delete<Resource><T = Delete<Resource>Response>(
    apiRequest: ApiRequestFn,
    <resource>Id: string,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "DELETE",
        url: `${appConfig.api.<RESOURCE>}/${<resource>Id}`,
        baseUrl: appConfig.apiUrl,
        headers,
    });
}

// ═══════════════════════════════════════════════════════════════
// Cleanup — tolerates 404, runs in parallel
// ═══════════════════════════════════════════════════════════════

export async function cleanup<Resource>s(
    apiRequest: ApiRequestFn,
    ids: string[],
    headers?: string,
): Promise<void> {
    await Promise.allSettled(
        ids.map((id) => delete<Resource>(apiRequest, id, headers)),
    );
}
```

### 4a. Assertion-style helper (skeleton)

When to use this style, why, and the decision rule between passthrough and assertion-style live in [SKILL.md § Two helper styles — pick by use case](SKILL.md). This is the skeleton only.

> **Imports note.** Schema must be imported as a runtime value (not `import type`) because `.parse()` is called on it: `import { <Resource>Schema, type <Resource> } from "../../fixtures/api/schemas/app/<resource>";`

```typescript
import { expect } from "../../fixtures/pom/test-options";
import { <Resource>Schema, type <Resource> } from "../../fixtures/api/schemas/app/<resource>";

export async function setup<Resource>(
    apiRequest: ApiRequestFn,
    headers: string,
    overrides?: Record<string, unknown>,
): Promise<<Resource>> {
    const { status, body } = await create<Resource>(
        apiRequest,
        buildCreate<Resource>Body(overrides),
        headers,
    );
    expect(status).toBe(201);
    const fetched = await get<Resource>(apiRequest, body.<resource>Id, headers);
    expect(fetched.status).toBe(200);
    return <Resource>Schema.parse(fetched.body.<resource>);
}
```

## 5. Test data JSON (`test-data/app/<resource>.json`)

```json
{
    "invalidId": "invalid-uuid-format",
    "nonExistentId": "12345678-1234-1234-1234-123456789abc",
    "sqlInjectionId": "1' OR '1'='1",
    "tooLongName": "qa-<resource>-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "boundaries": {
        "minNameLength": 2,
        "maxNameLength": 50,
        "maxTargetLength": 500
    }
}
```

## 6. E2E API flow (`tests/app/api/e2e-<flow>.spec.ts`)

For multi-endpoint flows that touch Mailpit. Use `@App-E2E` tag, explicit timeout. **Note**: `helpers/app/adminUsers.ts` puts `tenantId` in the URL — every helper takes `tenantId` as the second positional argument before the body / userId.

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { faker } from "@faker-js/faker";
import {
    createTenant,
    deleteTenant,
} from "../../../helpers/app/adminTenants";
import {
    createUser,
    deleteUser,
} from "../../../helpers/app/adminUsers";
import {
    extractLinkFromEmail,
    getInviteLinkFromEmail,
} from "../../../helpers/util/mailpit";

const process.env.USER_ACCESS_TOKEN_ADMIN! = process.env.USER_ACCESS_TOKEN_ADMIN!;

function generateE2EUserPayload() {
    // E2E variant — uses @<your-test-domain> domain (Mailpit-catchable on test infra).
    return {
        email: `qa-onboard-${faker.string.alphanumeric(8).toLowerCase()}@<your-test-domain>`,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
    };
}

test(
    "Verify tenant onboarding sends invitation email and link is extractable",
    { tag: "@App-E2E" },
    async ({ apiRequest, mailpit }) => {
        qase.suite(SUITES.API_E2E_TENANT_ONBOARDING);
        // qase.id(<id>);
        test.setTimeout(60_000);

        let tenantId: string | undefined;
        const userIds: string[] = [];
        const user = generateE2EUserPayload();

        try {
            await test.step("Purge previous emails for the recipient", async () => {
                await mailpit.deleteEmailsForRecipient(user.email);
            });

            await test.step("Create tenant", async () => {
                const { status, body } = await createTenant(
                    apiRequest,
                    `qa-onboard-${faker.string.alphanumeric(8).toLowerCase()}`,
                    process.env.USER_ACCESS_TOKEN_ADMIN!,
                );
                expect(status).toBe(200);
                tenantId = body.tenantId;
            });

            await test.step("Create user (triggers invitation email)", async () => {
                // adminUsers.createUser signature: (apiRequest, tenantId, body, headers)
                const { status, body } = await createUser(
                    apiRequest,
                    tenantId!,
                    user,
                    process.env.USER_ACCESS_TOKEN_ADMIN!,
                );
                expect(status).toBe(200);
                userIds.push(body.userId);
            });

            await test.step("Verify Mailpit received the invitation", async () => {
                // Option A — manual extraction (use when you need the raw message):
                const message = await mailpit.getLastEmail(user.email, 10, 2000);
                expect(message).not.toBeNull();
                const link = extractLinkFromEmail(message!.Content.Body); // single arg
                expect(link).not.toBeNull();

                // Option B — one-liner that retries + asserts + extracts:
                // const link = await getInviteLinkFromEmail(mailpit, user.email);
            });
        } finally {
            // Cleanup order: emails → users → tenant. Guard each.
            await mailpit.deleteEmailsForRecipient(user.email);
            if (tenantId) {
                for (const id of userIds) {
                    // adminUsers.deleteUser signature: (apiRequest, tenantId, userId, headers)
                    await deleteUser(apiRequest, tenantId, id, process.env.USER_ACCESS_TOKEN_ADMIN!);
                }
                await deleteTenant(apiRequest, tenantId, process.env.USER_ACCESS_TOKEN_ADMIN!);
            }
        }
    },
);
```

> Tip: when a test needs a known-credentialed user but does NOT need to exercise the invite-link UX, prefer `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken?)` from `helpers/app/adminUsers.ts`. It creates the user via the admin API, sets the password directly via the Keycloak admin client (bypassing email reset), purges Mailpit, and returns `{ email, userId }`. **It does NOT capture the invite link or return KC access tokens** — for end-to-end invite-link flows, keep the steps inline (as above). Pair with `teardownTestUser(...)` in `afterAll`.

## 7. Cross-tenant isolation spec

The contract: cross-tenant access returns **404, not 403**. There are two shapes — pick the one that matches the resource.

### Tenant-scoped resource (synthetic, probe) — token enforces isolation

The tenantA / tenantB tokens must be minted in `test.beforeAll` (see `tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts` for a real-world example that obtains tokens via Keycloak per-tenant). The variables below are placeholders for that beforeAll.

```typescript
// Module-scope state populated in test.beforeAll:
// - <resource>IdInTenantB: id of a <resource> created under TENANT_B_TOKEN
// - TENANT_A_TOKEN, TENANT_B_TOKEN: tenant-scoped tokens for two distinct tenants

test(
    "Verify Tenant A's token cannot read Tenant B's <resource>",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
        qase.suite(SUITES.API_CROSS_TENANT_ISOLATION);
        // qase.id(<id>);

        const { status, body } = await get<Resource><APIError>(
            apiRequest,
            <resource>IdInTenantB,
            TENANT_A_TOKEN,
        );

        expect(status).toBe(404);
        expect(APIErrorSchema.parse(body)).toBeTruthy();
    },
);
```

### Admin-scoped resource (admin user) — tenantId-in-path enforces isolation

```typescript
import { getUser } from "../../../helpers/app/adminUsers";
import { APIErrorSchema, type APIError } from "../../../fixtures/api/schemas/app/tenant";

// Module-scope state populated in test.beforeAll:
// - tenantA_Id, tenantB_Id: ids of two tenants created via createTenant
// - userA_Id: id of a user created under tenantA via adminUsers.createUser
// - process.env.USER_ACCESS_TOKEN_ADMIN!: process.env.USER_ACCESS_TOKEN_ADMIN (master-realm scope)

test(
    "Verify admin GET user with mismatched tenantId returns 404",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
        qase.suite(SUITES.API_CROSS_TENANT_ISOLATION);
        // qase.id(<id>);

        // Ask under Tenant B for a user that lives in Tenant A:
        const { status, body } = await getUser<APIError>(
            apiRequest,
            tenantB_Id,        // wrong tenant — gateway returns 404, not 403
            userA_Id,
            process.env.USER_ACCESS_TOKEN_ADMIN!,
        );

        expect(status).toBe(404);
        expect(APIErrorSchema.parse(body)).toBeTruthy();
    },
);
```

See `tests/app/api/shared/cross-tenant-isolation.spec.ts` (admin/users) and `tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts` (synthetics/data) for the canonical specs.

## 8. Faker-driven body builder shapes (per monitor type)

The synthetics module exports one `buildCreate<Type>SyntheticBody(probeIds, overrides?)` per monitor type. When adding a new type, mirror this shape:

```typescript
export function buildCreate<NewType>SyntheticBody(
    probeIds: string[],
    overrides?: Record<string, unknown>,
): Record<string, unknown> & { config?: Record<string, unknown> } {
    return {
        name: `qa-<newtype>-${faker.string.alphanumeric(8).toLowerCase()}`,
        // Replace with a faker call appropriate to the monitor type — examples below.
        target: faker.internet.url(),
        type: "<newtype>",
        checkInterval: DEFAULT_CHECK_INTERVAL,
        timeout: DEFAULT_TIMEOUT,
        // Replace with type-specific defaults — see the table below.
        config: {},
        probeIds,
        ...overrides,
    };
}
```

Existing per-type `target` shapes (from `helpers/app/synthetics.ts`):

| Type | `target` builder |
|------|-----------------|
| `icmp` | `faker.internet.ipv4()` |
| `http` | `` `https://${faker.internet.domainName()}` `` |
| `websocket` | `` `wss://${faker.internet.domainName()}` `` |
| `tcp` | `faker.internet.ipv4()` (host only — port lives in `config.port`) |
| `dns` | `faker.internet.domainName()` |
| `ssl` | `faker.internet.domainName()` |
| `mcp` | `faker.internet.url()` |

Monitor-type config shapes already in use:

| Type | `config` shape |
|------|----------------|
| `icmp` | `{ enableTraceroute: false }` |
| `http` | `{ verifySsl: true }` |
| `websocket` | `{ verifySsl: true }` |
| `tcp` | `{ port: 80 }` |
| `dns` | `{ recordType: "A" }` |
| `ssl` | `{ port: 443, warnDaysBeforeExpiry: 30 }` |
| `mcp` | `{ description: "" }` |

---

## 9. Per-field invalid-type loop (single-field form)

One `test()` per field. The loop runs **inside** the test, iterating the universal invalid-value array. Use `expect.soft()` for the inner assertions so a single test reports every failing value, not just the first. Wrap each iteration in `test.step()` so the trace shows which value broke.

```typescript
import { invalidString, invalidIntegerTypes } from "../../../fixtures/api/invalid-types";

test.describe("POST /synthetics — field validation", () => {
    test.beforeEach(async ({ apiRequest }) => { /* seed probe */ });

    test("Verify POST /synthetics returns 400 for invalid name values", { tag: "@App-API" }, async ({ apiRequest }) => {
        qase.suite(SUITES.API_SYNTHETICS);
        for (const value of invalidString) {
            await test.step(`name = ${JSON.stringify(value)}`, async () => {
                const body = { ...buildCreateSyntheticBody(probeIds), name: value };
                const { status, body: err } = await createSyntheticMonitor(apiRequest, body, process.env.USER_ACCESS_TOKEN_FULL!);
                expect.soft(status, `name = ${JSON.stringify(value)}`).toBe(400);
                expect.soft(APIErrorSchema.parse(err), `name = ${JSON.stringify(value)}`).toBeTruthy();
            });
        }
    });

    test("Verify POST /synthetics returns 400 for invalid checkInterval values", { tag: "@App-API" }, async ({ apiRequest }) => {
        qase.suite(SUITES.API_SYNTHETICS);
        for (const value of invalidIntegerTypes) {
            await test.step(`checkInterval = ${JSON.stringify(value)}`, async () => {
                const body = { ...buildCreateSyntheticBody(probeIds), checkInterval: value };
                const { status, body: err } = await createSyntheticMonitor(apiRequest, body, process.env.USER_ACCESS_TOKEN_FULL!);
                expect.soft(status, `checkInterval = ${JSON.stringify(value)}`).toBe(400);
                expect.soft(APIErrorSchema.parse(err), `checkInterval = ${JSON.stringify(value)}`).toBeTruthy();
            });
        }
    });
});
```

**Why `expect.soft`:** the loop continues even when an iteration fails, so the trace lists *every* invalid value the API mishandled in one run — not just the first. The test still fails at the end if any soft assertion failed.

## 10. Per-field invalid-type loop (nested compact form)

Same coverage as § 9, denser source. One `test()` covers every (field × invalid value) combination. Both loops are **inside** the test; each iteration is a `test.step` and uses `expect.soft`. Reach for this when 4+ fields share the same per-type validation pattern.

```typescript
import { invalidString, invalidIntegerTypes } from "../../../fixtures/api/invalid-types";

test("Verify POST /synthetics returns 400 for invalid field values", { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_SYNTHETICS);
    const validBody = buildCreateSyntheticBody([probeId]);

    const fields: Record<string, readonly unknown[]> = {
        name: invalidString,
        target: invalidString,
        checkInterval: invalidIntegerTypes,
        timeout: invalidIntegerTypes,
    };

    for (const [field, invalidValues] of Object.entries(fields)) {
        for (const invalid of invalidValues) {
            await test.step(`${field} = ${JSON.stringify(invalid)}`, async () => {
                const { status, body } = await createSyntheticMonitor(
                    apiRequest,
                    { ...validBody, [field]: invalid },
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );
                expect.soft(status, `${field} = ${JSON.stringify(invalid)}`).toBe(400);
                expect.soft(APIErrorSchema.parse(body), `${field} = ${JSON.stringify(invalid)}`).toBeTruthy();
            });
        }
    }
});
```

The single test reports as one entry in Qase / the HTML report; failed iterations show as failed steps inside the trace.

## 11. Per-field omission (destructure + rest)

One `test()` covers every required field. The loop runs **inside** the test; each iteration is a `test.step` and uses `expect.soft` so all missing-field cases are exercised in a single run.

```typescript
test("Verify POST /synthetics returns 400 when required fields are missing", { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_SYNTHETICS);
    const validBody = buildCreateSyntheticBody(probeIds);
    const requiredFields = ["name", "target", "type", "timeout", "probeIds"] as const;

    for (const field of requiredFields) {
        await test.step(`omit ${field}`, async () => {
            const { [field]: _, ...payloadWithoutField } = validBody;
            const { status, body } = await createSyntheticMonitor(apiRequest, payloadWithoutField, process.env.USER_ACCESS_TOKEN_FULL!);
            expect.soft(status, `omit ${field}`).toBe(400);
            expect.soft(APIErrorSchema.parse(body), `omit ${field}`).toBeTruthy();
        });
    }
});
```

## 12. Path parameter fuzzing

One `test()` covers every invalid-id case. Labeled cases (`{ description, value }`) so each `test.step` reads cleanly. Loop is **inside** the test; `expect.soft` keeps every iteration running. `encodeURIComponent` keeps the URL well-formed.

```typescript
test("Verify GET /synthetics/:id returns 400 for invalid id formats", { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_SYNTHETICS);

    const invalidIds = [
        { description: "non-uuid string", value: "not-a-uuid" },
        { description: "empty string", value: "" },
        { description: "numeric", value: "12345" },
        { description: "special chars", value: "<script>alert(1)</script>" },
        { description: "SQL-injection-shaped", value: "1 OR 1=1" },
    ];

    for (const { description, value } of invalidIds) {
        await test.step(`id = ${description}`, async () => {
            const { status, body } = await getSyntheticMonitor(apiRequest, encodeURIComponent(value), process.env.USER_ACCESS_TOKEN_FULL!);
            expect.soft(status, `id = ${description}`).toBe(400);
            expect.soft(APIErrorSchema.parse(body), `id = ${description}`).toBeTruthy();
        });
    }
});
```

For the **non-existent-but-well-formed-uuid** case (the 404 path), use `nonExistentId` from `test-data/app/<resource>.json` — separate test, not part of this loop.

## 13. Skipping a test for a real backend bug

`test.skip` is the only correct response when API behavior diverges from the documented contract. Do not loosen the schema, do not delete the test, do not silently change the expected status. The eslint-disable directive is **scoped to the single test**.

```typescript
/* eslint-disable playwright/no-skipped-test */
// FIXME: PROJ-1234 — backend returns 200 instead of 400 for empty name
test.skip(
    "Verify POST /synthetics returns 400 with empty name",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
        qase.suite(SUITES.API_SYNTHETICS);
        const { status, body } = await createSyntheticMonitor(apiRequest, buildCreateSyntheticBody([probeId], { name: "" }), process.env.USER_ACCESS_TOKEN_FULL!);
        expect(status).toBe(400);
        expect(APIErrorSchema.parse(body)).toBeTruthy();
    },
);
```

## 14. Cleanup pattern (track-then-drain)

Track ids in a describe-scoped array; drain in `afterAll` via the dedicated cleanup helper (which tolerates 404 and parallelizes via `Promise.allSettled`). Synthetics-with-probes specs **must** delete synthetics before probes.

```typescript
test.describe("POST /synthetics", () => {
    const createdProbeIds: string[] = [];
    const createdSyntheticIds: string[] = [];

    test("Verify POST /synthetics returns 201", { tag: "@App-API" }, async ({ apiRequest }) => {
        // ... POST probe, POST synthetic, push ids ...
    });

    test.afterAll(async ({ apiRequest }) => {
        await cleanupProbesAndSynthetics(
            apiRequest,
            createdProbeIds,
            createdSyntheticIds,
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
    });
});
```

## 15. Setup-restore (non-destructive shared state)

When a spec mutates pre-existing state (toggling a feature, changing settings), capture initial state in `beforeAll` and restore it in `afterAll`.

```typescript
let initialStates: Map<string, boolean>;

test.beforeAll(async ({ apiRequest }) => {
    const { body } = await listResources(apiRequest, TOKEN);
    initialStates = new Map(body.items.map((r) => [r.id, r.enabled]));
});

test.afterAll(async ({ apiRequest }) => {
    for (const [id, wasEnabled] of initialStates) {
        await updateResource(apiRequest, id, { enabled: wasEnabled }, TOKEN);
    }
});
```

## 16. Step grouping for multi-call tests (correct vs forbidden)

When a test makes 2+ API calls, each must be wrapped in `test.step()`. Failures localize to the step in the trace; assertions inside the step also localize.

**Correct:**

```typescript
test("Verify POST /tenants creates and GETs back", { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_ADMIN_TENANTS);
    const body = buildCreateTenantBody();
    let tenantId: string;

    await test.step("POST /admin/tenants", async () => {
        const { status, body: created } = await createTenant(apiRequest, body.name, process.env.USER_ACCESS_TOKEN_ADMIN!);
        expect(status).toBe(200);
        expect(CreateTenantResponseSchema.parse(created)).toBeTruthy();
        tenantId = created.tenantId;
    });

    await test.step("GET /admin/tenants/:id and verify echo", async () => {
        const { status, body: fetched } = await getTenant(apiRequest, tenantId, process.env.USER_ACCESS_TOKEN_ADMIN!);
        expect(status).toBe(200);
        expect(GetTenantResponseSchema.parse(fetched)).toBeTruthy();
        expect(fetched.tenant.name).toBe(body.name);
    });
});
```

**Forbidden — flattened, no `test.step`:**

```typescript
// FORBIDDEN: failures don't localize, trace has no structure
test("Verify POST /tenants creates and GETs back", { tag: "@App-API" }, async ({ apiRequest }) => {
    qase.suite(SUITES.API_ADMIN_TENANTS);
    const body = buildCreateTenantBody();

    const { status: createStatus, body: created } = await createTenant(apiRequest, body.name, process.env.USER_ACCESS_TOKEN_ADMIN!);
    expect(createStatus).toBe(200);
    expect(CreateTenantResponseSchema.parse(created)).toBeTruthy();

    const { status: getStatus, body: fetched } = await getTenant(apiRequest, created.tenantId, process.env.USER_ACCESS_TOKEN_ADMIN!);
    expect(getStatus).toBe(200);
    expect(GetTenantResponseSchema.parse(fetched)).toBeTruthy();
    expect(fetched.tenant.name).toBe(body.name);
});
```

## 17. Qase tagging skeleton

`qase.suite(SUITES.<NAME>)` is the first body line of every test. `qase.id(...)` is commented out until mapped in Qase.

```typescript
test(
    "Verify GET /synthetics returns 200",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
        qase.suite(SUITES.API_SYNTHETICS);
        // qase.id(123);
        // ...
    },
);
```

## 18. Helper styles (passthrough vs assertion-style — full skeletons)

The decision rule and full prose live in [SKILL.md § Helpers](SKILL.md). These are the skeletons.

**Passthrough (Style B)** — used across positive AND negative tests, returns `{ status, body }`:

```typescript
export async function createSyntheticMonitor<T = CreateSyntheticResponse>(
    apiRequest: ApiRequestFn,
    body: Record<string, unknown>,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "POST",
        url: appConfig.api.SYNTHETICS,
        baseUrl: appConfig.apiUrl,
        body,
        headers,
    });
}
```

**Assertion-style (Style A)** — used to seed a precondition, asserts internally, returns parsed entity:

```typescript
export async function setupSynthetic(
    apiRequest: ApiRequestFn,
    probeIds: string[],
    headers: string,
    overrides?: Record<string, unknown>,
): Promise<Synthetic> {
    const { status, body } = await createSyntheticMonitor(
        apiRequest,
        buildCreateSyntheticBody(probeIds, overrides),
        headers,
    );
    expect(status).toBe(201);
    const fetched = await getSyntheticMonitor(apiRequest, body.syntheticId, headers);
    expect(fetched.status).toBe(200);
    return SyntheticSchema.parse(fetched.body.synthetic);
}
```
