/**
 * POST /api/v1/projects — create project
 *
 * Contract coverage plan (every status from the endpoint contract):
 *   201 Created              — valid body with description                      -> covered
 *   201 Created              — valid body without optional description          -> covered
 *   400 Bad Request          — missing required `name`                          -> covered
 *   400 Bad Request          — missing required `ownerId`                       -> covered
 *   400 Bad Request          — empty body                                       -> covered
 *   400 Bad Request          — `name` wrong type (loop over invalid types)      -> covered
 *   400 Bad Request          — `ownerId` wrong type (loop over invalid types)   -> covered
 *   400 Bad Request          — `description` wrong type (loop over invalid)     -> covered
 *   400 Bad Request          — `ownerId` not a uuid                             -> covered
 *   401 Unauthorized         — no Authorization header                          -> covered
 *   401 Unauthorized         — malformed / expired bearer token                  -> covered
 *   404 Not Found            — `ownerId` is a well-formed uuid that does not exist -> covered
 *   405 Method Not Allowed   — unsupported verb on the collection route         -> covered
 *   409 Conflict             — duplicate project name for the same owner        -> covered
 *   // SKIP: 403 Forbidden   — requires a second role/tenant token which the current
 *   //       environment does not provision; re-enable once a low-privilege user
 *   //       fixture exists.
 *   // SKIP: 500 Internal Server Error — not reproducible from a black-box client.
 */

import { faker } from '@faker-js/faker';
import { z } from 'zod';

import { test, expect } from '../../../fixtures/pom/test-options';
import { appConfig } from '../../../config/app';
import { SUITES } from '../../../enums/app/qase-suites';
import { deleteProject } from '../../../helpers/app/projects';

/** Response body of POST /api/v1/projects (201) and GET /api/v1/projects/{id}. */
export const ProjectSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type Project = z.infer<typeof ProjectSchema>;

/** Error envelope returned by the API for 4xx responses. */
export const ApiErrorSchema = z.strictObject({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
});

interface CreateProjectBody {
  name?: unknown;
  description?: unknown;
  ownerId?: unknown;
}

const PROJECTS_PATH = appConfig.api.projects;

const buildProjectBody = (overrides: CreateProjectBody = {}): CreateProjectBody => ({
  name: `${faker.company.name()}-${faker.string.alphanumeric(8)}`,
  description: faker.lorem.sentence(),
  ownerId: process.env.PROJECT_OWNER_ID!,
  ...overrides,
});

const INVALID_TYPES: ReadonlyArray<{ label: string; value: unknown }> = [
  { label: 'number', value: 12345 },
  { label: 'boolean', value: true },
  { label: 'array', value: ['a', 'b'] },
  { label: 'object', value: { nested: 'value' } },
  { label: 'null', value: null },
];

test.describe('POST /api/v1/projects', () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async ({ apiRequest }) => {
    while (createdProjectIds.length > 0) {
      const projectId = createdProjectIds.pop()!;
      await deleteProject(apiRequest, projectId);
    }
  });

  test('creates a project with all fields and returns 201', { tag: '@api' }, async ({
    apiRequest,
  }) => {
    // qase.id(0);
    const body = buildProjectBody();

    await test.step('WHEN a project is created with name, description and ownerId', async () => {
      const response = await apiRequest.post(PROJECTS_PATH, { data: body });

      expect(response.status()).toBe(201);

      const project = ProjectSchema.parse(await response.json());
      expect(ProjectSchema.parse(project)).toBeTruthy();
      createdProjectIds.push(project.id);

      expect(project.name).toBe(body.name);
      expect(project.description).toBe(body.description);
      expect(project.ownerId).toBe(body.ownerId);
    });

    await test.step('THEN the project is retrievable by id', async () => {
      const projectId = createdProjectIds[createdProjectIds.length - 1];
      const response = await apiRequest.get(`${PROJECTS_PATH}/${projectId}`);

      expect(response.status()).toBe(200);
      expect(ProjectSchema.parse(await response.json())).toBeTruthy();
    });
  });

  test('creates a project without the optional description and returns 201', {
    tag: '@api',
  }, async ({ apiRequest }) => {
    // qase.id(0);
    const body = buildProjectBody();
    delete body.description;

    const response = await apiRequest.post(PROJECTS_PATH, { data: body });

    expect(response.status()).toBe(201);

    const project = ProjectSchema.parse(await response.json());
    expect(ProjectSchema.parse(project)).toBeTruthy();
    createdProjectIds.push(project.id);

    expect(project.description).toBeNull();
  });

  test('returns 400 when required fields are omitted', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const requiredFields: ReadonlyArray<keyof CreateProjectBody> = ['name', 'ownerId'];

    for (const field of requiredFields) {
      await test.step(`WHEN "${field}" is omitted THEN the API returns 400`, async () => {
        const body = buildProjectBody();
        delete body[field];

        const response = await apiRequest.post(PROJECTS_PATH, { data: body });

        expect(response.status()).toBe(400);
        expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
      });
    }
  });

  test('returns 400 for an empty request body', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const response = await apiRequest.post(PROJECTS_PATH, { data: {} });

    expect(response.status()).toBe(400);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });

  test('returns 400 when fields have an invalid type', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const fields: ReadonlyArray<keyof CreateProjectBody> = ['name', 'description', 'ownerId'];

    for (const field of fields) {
      for (const { label, value } of INVALID_TYPES) {
        await test.step(`WHEN "${field}" is a ${label} THEN the API returns 400`, async () => {
          const response = await apiRequest.post(PROJECTS_PATH, {
            data: buildProjectBody({ [field]: value }),
          });

          expect(response.status()).toBe(400);
          expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
        });
      }
    }
  });

  test('returns 400 when ownerId is not a valid uuid', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const response = await apiRequest.post(PROJECTS_PATH, {
      data: buildProjectBody({ ownerId: 'not-a-uuid' }),
    });

    expect(response.status()).toBe(400);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });

  test('returns 400 when name is an empty string', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const response = await apiRequest.post(PROJECTS_PATH, {
      data: buildProjectBody({ name: '' }),
    });

    expect(response.status()).toBe(400);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });

  test('returns 404 when ownerId does not exist', { tag: '@api' }, async ({ apiRequest }) => {
    // qase.id(0);
    const response = await apiRequest.post(PROJECTS_PATH, {
      data: buildProjectBody({ ownerId: faker.string.uuid() }),
    });

    expect(response.status()).toBe(404);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });

  test('returns 409 when a project name is duplicated for the same owner', {
    tag: '@api',
  }, async ({ apiRequest }) => {
    // qase.id(0);
    const body = buildProjectBody();

    await test.step('GIVEN a project already exists', async () => {
      const response = await apiRequest.post(PROJECTS_PATH, { data: body });

      expect(response.status()).toBe(201);

      const project = ProjectSchema.parse(await response.json());
      expect(ProjectSchema.parse(project)).toBeTruthy();
      createdProjectIds.push(project.id);
    });

    await test.step('WHEN the same name is submitted again THEN the API returns 409', async () => {
      const response = await apiRequest.post(PROJECTS_PATH, { data: body });

      expect(response.status()).toBe(409);
      expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
    });
  });
});

test.describe('POST /api/v1/projects — authentication', () => {
  test('returns 401 without an Authorization header', { tag: '@api' }, async ({ request }) => {
    // qase.id(0);
    const response = await request.post(`${process.env.API_BASE_URL!}${appConfig.api.projects}`, {
      data: {
        name: faker.company.name(),
        ownerId: process.env.PROJECT_OWNER_ID!,
      },
    });

    expect(response.status()).toBe(401);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });

  test('returns 401 for a malformed bearer token', { tag: '@api' }, async ({ request }) => {
    // qase.id(0);
    const response = await request.post(`${process.env.API_BASE_URL!}${appConfig.api.projects}`, {
      headers: { Authorization: `Bearer ${faker.string.alphanumeric(32)}` },
      data: {
        name: faker.company.name(),
        ownerId: process.env.PROJECT_OWNER_ID!,
      },
    });

    expect(response.status()).toBe(401);
    expect(ApiErrorSchema.parse(await response.json())).toBeTruthy();
  });
});

test.describe('POST /api/v1/projects — method handling', () => {
  test('returns 405 for an unsupported verb on the collection route', {
    tag: '@api',
  }, async ({ apiRequest }) => {
    // qase.id(0);
    const response = await apiRequest.fetch(PROJECTS_PATH, { method: 'PUT', data: {} });

    expect(response.status()).toBe(405);
  });
});
