import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { faker } from "@faker-js/faker";
import { SUITES } from "../../../enums/app/qase-suites";
import {
    APIErrorSchema,
    CreateProjectResponseSchema,
    DeleteProjectResponseSchema,
    GetProjectResponseSchema,
    UpdateProjectResponseSchema,
    type APIError,
} from "../../../fixtures/api/schemas/app/project";
import {
    buildCreateProjectBody,
    cleanupProjects,
    createProject,
    deleteProject,
    getProject,
    updateProject,
} from "../../../helpers/app/projects";

// ═══════════════════════════════════════════════════════════════
// Coverage plan — /projects lifecycle
// This spec owns the multi-endpoint happy-path lifecycle only.
// The per-endpoint negative matrix lives in projects.spec.ts.
//
// POST   /projects        201 — covered here
// GET    /projects/:id    200 — covered here
// PATCH  /projects/:id    200 — covered here
// DELETE /projects/:id    200 — covered here
// GET    /projects/:id    404 — covered here (post-delete confirmation)
//
// SKIP: 400 (invalid payload / invalid id format)  — owned by projects.spec.ts
// SKIP: 401 (missing Authorization header)         — owned by projects.spec.ts
// SKIP: 403 (token without permissions)            — owned by projects.spec.ts
// SKIP: 405 (unsupported verbs on /projects)       — owned by projects.spec.ts
// SKIP: 409 (duplicate project name)               — owned by projects.spec.ts
// ═══════════════════════════════════════════════════════════════

test.describe("Projects — full lifecycle (create → read → update → delete)", () => {
    // Safety net: the DELETE step is the assertion under test, so on a green run this
    // array is already drained by the API. If an earlier step fails, afterAll removes
    // the project so the environment is left exactly as it was found.
    const createdProjectIds: string[] = [];

    test(
        "Verify /projects lifecycle creates, reads, renames, and deletes a project",
        { tag: "@App-E2E" },
        async ({ apiRequest }) => {
            qase.suite(SUITES.API_PROJECTS);
            // qase.id(0);
            test.setTimeout(60_000);

            const createBody = buildCreateProjectBody();
            const updatedName = `qa-project-upd-${faker.string.alphanumeric(8).toLowerCase()}`;
            // `!` (definite assignment): set inside the first test.step.
            let projectId!: string;

            await test.step("GIVEN: POST /projects creates the project", async () => {
                const { status, body } = await createProject(
                    apiRequest,
                    createBody,
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );

                expect(status).toBe(201);
                expect(CreateProjectResponseSchema.parse(body)).toBeTruthy();

                projectId = body.projectId;
                createdProjectIds.push(projectId);
            });

            await test.step("AND: GET /projects/:id reads the project back", async () => {
                const { status, body } = await getProject(
                    apiRequest,
                    projectId,
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );

                expect(status).toBe(200);
                expect(GetProjectResponseSchema.parse(body)).toBeTruthy();
                expect(body.project.id).toBe(projectId);
                expect(body.project.name).toBe(createBody.name);
                expect(body.project.description).toBe(createBody.description);
            });

            await test.step("WHEN: PATCH /projects/:id updates only the name", async () => {
                const { status, body } = await updateProject(
                    apiRequest,
                    projectId,
                    { name: updatedName },
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );

                expect(status).toBe(200);
                expect(UpdateProjectResponseSchema.parse(body)).toBeTruthy();
                expect(body.project.name).toBe(updatedName);
                expect(body.project.description).toBe(createBody.description);
            });

            await test.step("AND: DELETE /projects/:id removes the project", async () => {
                const { status, body } = await deleteProject(
                    apiRequest,
                    projectId,
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );

                expect(status).toBe(200);
                expect(DeleteProjectResponseSchema.parse(body)).toBeTruthy();
            });

            await test.step("THEN: GET /projects/:id returns 404 for the deleted project", async () => {
                const { status, body } = await getProject<APIError>(
                    apiRequest,
                    projectId,
                    process.env.USER_ACCESS_TOKEN_FULL!,
                );

                expect(status).toBe(404);
                expect(APIErrorSchema.parse(body)).toBeTruthy();
            });
        },
    );

    test.afterAll(async ({ apiRequest }) => {
        await cleanupProjects(
            apiRequest,
            createdProjectIds,
            process.env.USER_ACCESS_TOKEN_FULL!,
        );
        createdProjectIds.length = 0;
    });
});
