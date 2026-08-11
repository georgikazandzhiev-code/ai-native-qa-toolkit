import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";
import { appConfig } from "../../../config/app";
import { faker } from "@faker-js/faker";
import { z } from "zod";
import type { ApiRequestFn, ApiRequestResponse } from "../../../fixtures/api/api-types";
import { APIErrorSchema } from "../../../fixtures/api/schemas/util/common";
import { GatewayErrorSchema } from "../../../fixtures/api/schemas/app/tenant";
import {
    invalidString,
    invalidStringTypes,
    specialChars,
} from "../../../fixtures/api/invalid-types";

// ═══════════════════════════════════════════════════════════════
// COVERAGE PLAN — POST /api/v1/projects
// Request body: { name: string (required), description?: string, ownerId: uuid (required) }
// Success: 201 with the created project. Endpoint is authenticated (tenant-scoped).
//
// 201 — valid body with description                                    → covered
// 201 — valid body WITHOUT the optional description                    → covered (optional branch)
// 400 — empty body {}                                                  → covered
// 400 — each required field omitted (name, ownerId)                    → covered (loop, expect.soft)
// 400 — invalid name values (required string)                          → covered (invalidString)
// 400 — invalid ownerId values (required string)                       → covered (invalidString)
// 400 — malformed ownerId (well-formed string, not a uuid)             → covered (labeled + specialChars)
// 400 — invalid description types (optional string)                    → covered (invalidStringTypes)
// 401 — Authorization header omitted entirely                          → covered
// 401 — admin (wrong-realm) token on a tenant-scoped endpoint          → covered
// 403 — token without permissions (USER_ACCESS_TOKEN_ZERO)             → written + commented out below
//       (env var not provisioned — see api-testing reference § Token catalog)
// 405 — unsupported verbs on the /projects collection path             → covered
// SKIP: 404 — no path parameter on POST /projects; the 404 row belongs to
//       GET/PATCH/DELETE /projects/{id}, which are out of scope for this spec.
// SKIP: 409 — the contract documents no uniqueness constraint on `name`
//       (or on any other create field), so there is no conflict state to trigger.
//       Add the test the moment the contract declares one.
// SKIP: 400/404 for a well-formed-but-non-existent ownerId — the contract does not
//       state which of the two the API returns. Do not guess a status; confirm
//       against the OpenAPI, then add the test.
// TODO: GET-after-create persistence verification lives in the GET /projects/{id}
//       spec (not yet authored). The 201 body is the created project, so the
//       echoed-field assertions below are the contract check for this endpoint.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Schemas
//
// NOTE — deliberate, requested deviation from the framework layout: schemas
// normally live in `fixtures/api/schemas/app/<resource>.ts` (api-testing §
// Zod schema conventions) and specs deep-import from there. They are inlined
// here because the task asked for a single self-contained file.
// TODO: move ProjectSchema / CreateProjectResponseSchema to
// fixtures/api/schemas/app/project.ts and import them from this spec.
//
// The shared error shapes are NOT redeclared — APIErrorSchema is imported from
// fixtures/api/schemas/util/common.ts and GatewayErrorSchema is re-used from the
// existing strict copy in fixtures/api/schemas/app/tenant.ts.
// ═══════════════════════════════════════════════════════════════

export const ProjectSchema = z.strictObject({
    id: z.string().uuid(),
    name: z.string(),
    // Optional condition: `description` is absent when the create body omits it
    // (it is not documented as nullable). Both branches are exercised — see the
    // "with description" and "without the optional description" tests below.
    description: z.string().optional(),
    ownerId: z.string().uuid(),
    // Audit fields are contract invariants — never optional, never nullable.
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export const CreateProjectResponseSchema = z.strictObject({
    project: ProjectSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Body builder + request wrappers
//
// TODO: promote buildCreateProjectBody / createProject / deleteProject /
// cleanupProjects to helpers/app/projects.ts on the second consuming spec
// (api-testing § Helpers — reuse threshold is 2+ specs).
// ═══════════════════════════════════════════════════════════════

type CreateProjectBody = {
    name: string;
    description?: string;
    ownerId: string;
};

/**
 * Builds a valid POST /projects payload. `ownerId` must reference an existing
 * user, so it comes from the environment — a faker uuid would not resolve.
 * Declare APP_FULL_PERMISSIONS_USER_ID in env/.env.example per the `config` skill.
 */
function buildCreateProjectBody(overrides?: Partial<CreateProjectBody>): CreateProjectBody {
    return {
        name: `qa-project-${faker.string.alphanumeric(8).toLowerCase()}`,
        description: faker.lorem.sentence(),
        ownerId: process.env.APP_FULL_PERMISSIONS_USER_ID!,
        ...overrides,
    };
}

async function createProject<T = CreateProjectResponse>(
    apiRequest: ApiRequestFn,
    body: Record<string, unknown> | null,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "POST",
        url: appConfig.api.PROJECTS,
        baseUrl: appConfig.apiUrl,
        headers,
        body,
    });
}

async function deleteProject<T = unknown>(
    apiRequest: ApiRequestFn,
    projectId: string,
    headers?: string,
): Promise<ApiRequestResponse<T>> {
    return apiRequest<T>({
        method: "DELETE",
        url: `${appConfig.api.PROJECTS}/${projectId}`,
        baseUrl: appConfig.apiUrl,
        headers,
    });
}

/** Drains the created-project ids; tolerates 404 so a partial run still cleans up. */
async function cleanupProjects(
    apiRequest: ApiRequestFn,
    projectIds: string[],
    headers?: string,
): Promise<void> {
    await Promise.allSettled(projectIds.map((id) => deleteProject(apiRequest, id, headers)));
}

// ═══════════════════════════════════════════════════════════════
// POST /projects — Create
// ═══════════════════════════════════════════════════════════════

test.describe("POST /projects — Create", () => {
    const createdProjectIds: string[] = [];

    /**
     * Captures an id from a response that was expected to fail but created a
     * resource anyway, so afterAll still cleans the environment.
     */
    function captureUnexpectedProject(body: unknown): void {
        const parsed = CreateProjectResponseSchema.safeParse(body);
        if (parsed.success) {
            createdProjectIds.push(parsed.data.project.id);
        }
    }

    test(
        "Verify POST /projects returns 201 with valid name, description and ownerId",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(<id>);

            const payload = buildCreateProjectBody();

            const { status, body } = await createProject(
                apiRequest,
                { ...payload },
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(201);
            createdProjectIds.push(body.project.id);
            expect(CreateProjectResponseSchema.parse(body)).toBeTruthy();
            expect(body.project.name).toBe(payload.name);
            expect(body.project.description).toBe(payload.description);
            expect(body.project.ownerId).toBe(payload.ownerId);
        },
    );

    test(
        "Verify POST /projects returns 201 without the optional description",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            const payload = buildCreateProjectBody();
            const payloadWithoutDescription: Record<string, unknown> = { ...payload };
            delete payloadWithoutDescription.description;

            const { status, body } = await createProject(
                apiRequest,
                payloadWithoutDescription,
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            expect(status).toBe(201);
            createdProjectIds.push(body.project.id);
            expect(CreateProjectResponseSchema.parse(body)).toBeTruthy();
            expect(body.project.name).toBe(payload.name);
            expect(body.project.description).toBeUndefined();
        },
    );

    test(
        "Verify POST /projects returns 400 with empty body",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            const { status, body } = await createProject(
                apiRequest,
                {},
                process.env.USER_ACCESS_TOKEN_FULL!,
            );

            captureUnexpectedProject(body);
            expect(status).toBe(400);
            expect(APIErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify POST /projects returns 400 when required fields are missing",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            const validBody = buildCreateProjectBody();
            const requiredFields = ["name", "ownerId"] as const;

            for (const field of requiredFields) {
                await test.step(`omit ${field}`, async () => {
                    const payload: Record<string, unknown> = { ...validBody };
                    delete payload[field];

                    const { status, body } = await createProject(
                        apiRequest,
                        payload,
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    captureUnexpectedProject(body);
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

            const validBody = buildCreateProjectBody();

            for (const invalid of invalidString) {
                await test.step(`name = ${JSON.stringify(invalid)}`, async () => {
                    const payload: Record<string, unknown> = { ...validBody, name: invalid };

                    const { status, body } = await createProject(
                        apiRequest,
                        payload,
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    captureUnexpectedProject(body);
                    expect.soft(status, `name = ${JSON.stringify(invalid)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `name = ${JSON.stringify(invalid)}`)
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

            const validBody = buildCreateProjectBody();

            for (const invalid of invalidString) {
                await test.step(`ownerId = ${JSON.stringify(invalid)}`, async () => {
                    const payload: Record<string, unknown> = { ...validBody, ownerId: invalid };

                    const { status, body } = await createProject(
                        apiRequest,
                        payload,
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    captureUnexpectedProject(body);
                    expect.soft(status, `ownerId = ${JSON.stringify(invalid)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `ownerId = ${JSON.stringify(invalid)}`)
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

            const validBody = buildCreateProjectBody();
            const malformedOwnerIds: { description: string; value: string }[] = [
                { description: "non-uuid string", value: "not-a-uuid" },
                { description: "numeric string", value: "12345" },
                { description: "uuid missing a segment", value: "12345678-1234-1234-123456789abc" },
                { description: "uuid with trailing whitespace", value: `${faker.string.uuid()} ` },
                ...specialChars.map((value, index) => ({
                    description: `special chars #${index + 1}`,
                    value,
                })),
            ];

            for (const { description, value } of malformedOwnerIds) {
                await test.step(`ownerId = ${description}`, async () => {
                    const payload: Record<string, unknown> = { ...validBody, ownerId: value };

                    const { status, body } = await createProject(
                        apiRequest,
                        payload,
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    captureUnexpectedProject(body);
                    expect.soft(status, `ownerId = ${description}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `ownerId = ${description}`)
                        .toBeTruthy();
                });
            }
        },
    );

    test(
        "Verify POST /projects returns 400 for invalid description values",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            const validBody = buildCreateProjectBody();

            // `invalidStringTypes` (wrong types only) is the right array for an
            // OPTIONAL string — null / undefined / "" may legitimately be accepted.
            for (const invalid of invalidStringTypes) {
                await test.step(`description = ${JSON.stringify(invalid)}`, async () => {
                    const payload: Record<string, unknown> = {
                        ...validBody,
                        description: invalid,
                    };

                    const { status, body } = await createProject(
                        apiRequest,
                        payload,
                        process.env.USER_ACCESS_TOKEN_FULL!,
                    );

                    captureUnexpectedProject(body);
                    expect.soft(status, `description = ${JSON.stringify(invalid)}`).toBe(400);
                    expect
                        .soft(APIErrorSchema.parse(body), `description = ${JSON.stringify(invalid)}`)
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

            // `headers` is omitted entirely — never pass an empty string.
            const { status, body } = await createProject<unknown>(apiRequest, {
                ...buildCreateProjectBody(),
            });

            captureUnexpectedProject(body);
            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    test(
        "Verify POST /projects returns 401 with admin token (tenant-scoped endpoint)",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            const { status, body } = await createProject<unknown>(
                apiRequest,
                { ...buildCreateProjectBody() },
                process.env.USER_ACCESS_TOKEN_ADMIN!,
            );

            captureUnexpectedProject(body);
            expect(status).toBe(401);
            expect(GatewayErrorSchema.parse(body)).toBeTruthy();
        },
    );

    // TODO: FIXME: re-enable when the RBAC token is added — USER_ACCESS_TOKEN_ZERO
    // is not provisioned in the test environment (api-testing reference § Token catalog).
    // test(
    //     "Verify POST /projects returns 403 for token without permissions",
    //     { tag: "@App-API" },
    //     async ({ apiRequest }) => {
    //         qase.suite(SUITES.API_PROJECTS);
    //
    //         const { status, body } = await createProject<null>(
    //             apiRequest,
    //             { ...buildCreateProjectBody() },
    //             process.env.USER_ACCESS_TOKEN_ZERO!,
    //         );
    //
    //         expect(status).toBe(403);
    //         expect(body).toBeNull();
    //     },
    // );

    test.afterAll(async ({ apiRequest }) => {
        await cleanupProjects(
            apiRequest,
            createdProjectIds,
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
        createdProjectIds.length = 0;
    });
});

// ═══════════════════════════════════════════════════════════════
// 405 — Unsupported methods on the /projects collection path
// ═══════════════════════════════════════════════════════════════

test.describe("405 Method Not Allowed — Unsupported HTTP methods", () => {
    const UNSUPPORTED_COLLECTION = ["PUT", "PATCH", "DELETE"] as const;

    test(
        "Verify unsupported methods on /projects return 405",
        { tag: "@App-API" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);

            for (const method of UNSUPPORTED_COLLECTION) {
                await test.step(`${method} /projects`, async () => {
                    const { status } = await apiRequest({
                        method,
                        url: appConfig.api.PROJECTS,
                        baseUrl: appConfig.apiUrl,
                        headers: process.env.USER_ACCESS_TOKEN_FULL!,
                        // Body on non-DELETE verbs keeps the 405 deterministic —
                        // some gateways return 400 before the method check.
                        body: method === "DELETE" ? undefined : {},
                    });

                    expect.soft(status, `${method} /projects`).toBe(405);
                });
            }
        },
    );
});
