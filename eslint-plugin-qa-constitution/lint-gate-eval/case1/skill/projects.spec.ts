// ═══════════════════════════════════════════════════════════════
// Canonical placement — tests/app/api/project-service/projects.spec.ts
//
// DEVIATION NOTICE (explicit task constraint: "single complete file"):
// per `api-testing` § Zod schema conventions, `ProjectSchema` and the
// `CreateProjectResponseSchema` below belong in
// `fixtures/api/schemas/app/project.ts`, and `buildCreateProjectBody` /
// `cleanupProjects` belong in `helpers/app/projects.ts`. They are inlined here
// only because this file must stand alone; move them on the first real commit
// (schemas in a spec are an anti-pattern in this framework).
//
// Framework prerequisites this spec assumes (add before running):
//   1. `config/app.ts` → `api.PROJECTS: "/projects"` (`appConfig.apiUrl`
//      already carries the `/api/v1` base — see the appConfig path catalog).
//   2. `enums/app/qase-suites.ts` → `API_PROJECTS: "API\tProjects"`.
//   3. `test-data/app/project.json` → `nonExistentId` (used once the by-id
//      endpoints get their own spec).
//
// ───────────────────────────────────────────────────────────────
// COVERAGE PLAN — POST /api/v1/projects (authenticated, tenant-scoped)
// Request: { name: string (required), description?: string, ownerId: uuid (required) }
// ───────────────────────────────────────────────────────────────
// 201 — valid body with description                     → covered
// 201 — valid body without optional description         → covered (optional branch)
// 400 — empty body {}                                   → covered
// 400 — each required field omitted (name, ownerId)     → covered (loop inside test)
// 400 — invalid `name` values                           → covered (invalidString)
// 400 — invalid `ownerId` types                         → covered (invalidString)
// 400 — malformed `ownerId` uuid formats                → covered (labeled cases)
// 400 — invalid `description` types (optional field)    → covered (invalidStringTypes)
// 401 — Authorization header omitted                    → covered
// 401 — admin token on a tenant-scoped endpoint         → covered
// 403 — valid token without permissions                 → commented out below;
//        USER_ACCESS_TOKEN_ZERO is not provisioned in this environment
//        (api-testing § Token catalog). Not silently dropped.
// 405 — unsupported verbs on the /projects collection   → covered (loop inside one test)
// SKIP: 404 — POST on a collection path has no path parameter. Whether an
//        unknown-but-well-formed `ownerId` yields 400 or 404 is NOT documented
//        in the contract; confirm with backend, then add the test here.
// SKIP: 409 — no uniqueness constraint on `name` is documented for this
//        endpoint. Add a duplicate-name test once the contract states one.
// SKIP: boundary lengths for `name` / `description` — no min/max documented;
//        add via `boundaryString` once the contract publishes the bounds.
// ═══════════════════════════════════════════════════════════════

import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { appConfig } from "../../../config/app";
import { faker } from "@faker-js/faker";
import { z } from "zod";
import type { ApiRequestFn } from "../../../fixtures/api/api-types";
// Shared error envelopes — never re-declare these locally
// (api-testing § Error envelopes).
import { APIErrorSchema, type APIError } from "../../../fixtures/api/schemas/util/common";
import { GatewayErrorSchema, type GatewayError } from "../../../fixtures/api/schemas/app/tenant";
import { invalidString, invalidStringTypes } from "../../../fixtures/api/invalid-types";
import { listUsers } from "../../../helpers/app/users";

// ═══════════════════════════════════════════════════════════════
// Schemas — target home: fixtures/api/schemas/app/project.ts
// ═══════════════════════════════════════════════════════════════

export const ProjectSchema = z.strictObject({
    id: z.string().uuid(),
    name: z.string(),
    // `.optional()` condition: the API echoes `description` only when the
    // create payload supplied it. Both branches are exercised — see
    // "returns 201 with description" and "returns 201 without description".
    description: z.string().optional(),
    ownerId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

// The contract states POST returns the created project, so this follows the
// single-resource response shape (`{ <resource>: <Resource>Schema }`) rather
// than the `{ <resource>Id, status }` create shape used elsewhere in this API.
export const CreateProjectResponseSchema = z.strictObject({
    project: ProjectSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Body builder + cleanup — target home: helpers/app/projects.ts
// ═══════════════════════════════════════════════════════════════

type CreateProjectBody = {
    name: string;
    description: string;
    ownerId: string;
};

function buildCreateProjectBody(
    ownerId: string,
    overrides?: Partial<CreateProjectBody>,
): CreateProjectBody {
    return {
        name: `qa-project-${faker.string.alphanumeric(8).toLowerCase()}`,
        description: faker.lorem.sentence(),
        ownerId,
        ...overrides,
    };
}

async function cleanupProjects(
    apiRequest: ApiRequestFn,
    projectIds: string[],
    headers?: string,
): Promise<void> {
    await Promise.allSettled(
        projectIds.map((id) =>
            apiRequest({
                method: "DELETE",
                url: `${appConfig.api.PROJECTS}/${id}`,
                baseUrl: appConfig.apiUrl,
                headers,
            }),
        ),
    );
}

// ═══════════════════════════════════════════════════════════════
// POST /projects — Create
// ═══════════════════════════════════════════════════════════════

test.describe("POST /projects — Create", () => {
    // `!` (definite assignment): resolved in test.beforeAll.
    let ownerId!: string;
    const createdIds: string[] = [];

    test.beforeAll(async ({ apiRequest }) => {
        // `ownerId` must reference a real tenant user — resolve it instead of
        // hardcoding a uuid (no hardcoded ids per the Sources-of-Truth rule).
        const { status, body } = await listUsers(apiRequest, process.env.USER_ACCESS_TOKEN_FULL!);
        expect(status).toBe(200);
        if (body.users.length === 0) {
            throw new Error(
                "POST /projects needs at least one tenant user to own the project; the tenant returned zero users.",
            );
        }
        ownerId = body.users[0].id;
    });

    // Defensive capture: a negative test that unexpectedly succeeds must still
    // be cleaned up (api-testing § Cleanup patterns → Defensive guards).
    function trackIfCreated(body: unknown): void {
        const parsed = CreateProjectResponseSchema.safeParse(body);
        if (parsed.success) {
            createdIds.push(parsed.data.project.id);
        }
    }

    test(
        "Verify POST /projects returns 201 with valid name, description and ownerId",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const payload = buildCreateProjectBody(ownerId);

            const { status, body } = await apiRequest<CreateProjectResponse>({
                method: "POST",
                url: appConfig.api.PROJECTS,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL!,
                body: payload,
            });

            expect(status).toBe(201);
            expect(CreateProjectResponseSchema.parse(body)).toBeTruthy();
            createdIds.push(body.project.id);
            expect(body.project.name).toBe(payload.name);
            expect(body.project.description).toBe(payload.description);
            expect(body.project.ownerId).toBe(payload.ownerId);
        },
    );

    test(
        "Verify POST /projects returns 201 when the optional description is omitted",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const { description: _description, ...payload } = buildCreateProjectBody(ownerId);

            const { status, body } = await apiRequest<CreateProjectResponse>({
                method: "POST",
                url: appConfig.api.PROJECTS,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL!,
                body: payload,
            });

            expect(status).toBe(201);
            expect(CreateProjectResponseSchema.parse(body)).toBeTruthy();
            createdIds.push(body.project.id);
            expect(body.project.name).toBe(payload.name);
            expect(body.project.description).toBeUndefined();
        },
    );

    test(
        "Verify POST /projects returns 400 for an empty body",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const { status, body } = await apiRequest<APIError>({
                method: "POST",
                url: appConfig.api.PROJECTS,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_FULL!,
                body: {},
            });

            expect(status).toBe(400);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify POST /projects returns 400 when required fields are missing",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const validBody = buildCreateProjectBody(ownerId);
            const requiredFields = ["name", "ownerId"] as const;

            for (const field of requiredFields) {
                await test.step(`omit ${field}`, async () => {
                    const { [field]: _omitted, ...payloadWithoutField } = validBody;

                    const { status, body } = await apiRequest<APIError>({
                        method: "POST",
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        body: payloadWithoutField,
                    });

                    trackIfCreated(body);
                    expect.soft(status, `omit ${field}`).toBe(400);
                    expect.soft(APIErrorSchema.parse(body), `omit ${field}`).toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 400 for invalid name values",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const validBody = buildCreateProjectBody(ownerId);

            for (const value of invalidString) {
                await test.step(`name = ${JSON.stringify(value)}`, async () => {
                    const { status, body } = await apiRequest<APIError>({
                        method: "POST",
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        body: { ...validBody, name: value },
                    });

                    trackIfCreated(body);
                    expect.soft(status, `name = ${JSON.stringify(value)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `name = ${JSON.stringify(value)}`)
                        .toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 400 for invalid ownerId values",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const validBody = buildCreateProjectBody(ownerId);

            for (const value of invalidString) {
                await test.step(`ownerId = ${JSON.stringify(value)}`, async () => {
                    const { status, body } = await apiRequest<APIError>({
                        method: "POST",
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        body: { ...validBody, ownerId: value },
                    });

                    trackIfCreated(body);
                    expect.soft(status, `ownerId = ${JSON.stringify(value)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `ownerId = ${JSON.stringify(value)}`)
                        .toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 400 for malformed ownerId uuid formats",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const validBody = buildCreateProjectBody(ownerId);
            const malformedOwnerIds = [
                { description: "non-uuid string", value: "not-a-uuid" },
                { description: "numeric string", value: "12345" },
                { description: "uuid missing a segment", value: "12345678-1234-1234-123456789abc" },
                { description: "uuid with invalid hex chars", value: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz" },
                { description: "script injection shaped", value: "<script>alert(1)</script>" },
                { description: "SQL injection shaped", value: "1' OR '1'='1" },
            ];

            for (const { description, value } of malformedOwnerIds) {
                await test.step(`ownerId = ${description}`, async () => {
                    const { status, body } = await apiRequest<APIError>({
                        method: "POST",
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        body: { ...validBody, ownerId: value },
                    });

                    trackIfCreated(body);
                    expect.soft(status, `ownerId = ${description}`).toBe(400);
                    expect.soft(APIErrorSchema.parse(body), `ownerId = ${description}`).toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 400 for invalid description values",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const validBody = buildCreateProjectBody(ownerId);

            // `description` is optional, so null / undefined / "" may be legal —
            // only wrong types are asserted (api-testing § Invalid-type arrays).
            for (const value of invalidStringTypes) {
                await test.step(`description = ${JSON.stringify(value)}`, async () => {
                    const { status, body } = await apiRequest<APIError>({
                        method: "POST",
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        body: { ...validBody, description: value },
                    });

                    trackIfCreated(body);
                    expect.soft(status, `description = ${JSON.stringify(value)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `description = ${JSON.stringify(value)}`)
                        .toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 401 for missing Authorization header",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            // `headers` is omitted entirely — never passed as an empty string.
            const { status, body } = await apiRequest<GatewayError>({
                method: "POST",
                url: appConfig.api.PROJECTS,
                baseUrl: appConfig.apiUrl,
                body: buildCreateProjectBody(ownerId),
            });

            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify POST /projects returns 401 for an admin token on a tenant-scoped endpoint",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            const { status, body } = await apiRequest<GatewayError>({
                method: "POST",
                url: appConfig.api.PROJECTS,
                baseUrl: appConfig.apiUrl,
                headers: process.env.USER_ACCESS_TOKEN_ADMIN!,
                body: buildCreateProjectBody(ownerId),
            });

            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    // TODO: FIXME: re-enable when the RBAC token is added — USER_ACCESS_TOKEN_ZERO
    // is not provisioned in this environment (api-testing § Token catalog).
    // Kept in place rather than dropped so the 403 row of the negative matrix
    // stays visible; `test.skip` is forbidden (it corrupts Qase id mappings).
    // test(
    //     "Verify POST /projects returns 403 for a token without permissions",
    //     { tag: "@App-API" },
    //     async ({ apiRequest }) => {
    //         qase.suite(SUITES.API_PROJECTS);
    //
    //         const { status, body } = await apiRequest<null>({
    //             method: "POST",
    //             url: appConfig.api.PROJECTS,
    //             baseUrl: appConfig.apiUrl,
    //             headers: process.env.USER_ACCESS_TOKEN_ZERO!,
    //             body: buildCreateProjectBody(ownerId),
    //         });
    //
    //         expect(status).toBe(403);
    //         expect(body).toBeNull();
    //     },
    // );

    test.afterAll(async ({ apiRequest }) => {
        await cleanupProjects(apiRequest, createdIds, process.env.USER_ACCESS_TOKEN_FULL!);
        createdIds.length = 0;
    });
});

// ═══════════════════════════════════════════════════════════════
// 405 — Unsupported methods on the /projects collection
// (the /projects/:id resource path is covered by the by-id spec)
// ═══════════════════════════════════════════════════════════════

test.describe("405 Method Not Allowed — Unsupported HTTP methods", () => {
    const UNSUPPORTED_COLLECTION = ["PUT", "PATCH", "DELETE"] as const;

    test(
        "Verify unsupported methods on /projects return 405",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);

            for (const method of UNSUPPORTED_COLLECTION) {
                const { status } = await apiRequest({
                    method,
                    url: appConfig.api.PROJECTS,
                    baseUrl: appConfig.apiUrl,
                    headers: process.env.USER_ACCESS_TOKEN_FULL!,
                    body: method === "DELETE" ? undefined : {},
                });

                expect(status, `${method} /projects`).toBe(405);
            }
        },
    );
});
