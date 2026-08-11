import { faker } from '@faker-js/faker';
import { z } from 'zod';

import { expect, test } from '../../../fixtures/pom/test-options';
import { appConfig } from '../../../config/app';
import { SUITES } from '../../../enums/app/qase-suites';

/**
 * Coverage plan — /projects lifecycle (happy path only; negative matrix lives in projects-negative.spec.ts)
 *
 * POST   /projects        201 — covered here
 * GET    /projects/{id}   200 — covered here
 * PATCH  /projects/{id}   200 — covered here
 * DELETE /projects/{id}   204 — covered here
 * GET    /projects/{id}   404 — covered here (post-delete confirmation)
 */

const ProjectSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const ErrorSchema = z.strictObject({
  statusCode: z.number(),
  message: z.string(),
});

test.describe('Projects — full CRUD lifecycle', () => {
  test('creates, reads, updates and deletes a project @api', async ({ apiRequest }) => {
    qase.suite(SUITES.PROJECTS);
    // qase.id(0);

    const createdName = faker.company.name();
    const updatedName = faker.company.name();
    const description = faker.lorem.sentence();

    let projectId = '';
    let deleted = false;

    try {
      await test.step('GIVEN a project is created via POST /projects', async () => {
        const response = await apiRequest.post(appConfig.api.projects, {
          data: { name: createdName, description },
        });

        expect(response.status()).toBe(201);

        const body: unknown = await response.json();
        const project = ProjectSchema.parse(body);
        expect(project).toBeTruthy();
        expect(project.name).toBe(createdName);

        projectId = project.id;
      });

      await test.step('WHEN the project is read back via GET /projects/{id}', async () => {
        const response = await apiRequest.get(`${appConfig.api.projects}/${projectId}`);

        expect(response.status()).toBe(200);

        const body: unknown = await response.json();
        const project = ProjectSchema.parse(body);
        expect(project).toBeTruthy();
        expect(project.id).toBe(projectId);
        expect(project.name).toBe(createdName);
      });

      await test.step('WHEN the name is updated via PATCH /projects/{id}', async () => {
        const response = await apiRequest.patch(`${appConfig.api.projects}/${projectId}`, {
          data: { name: updatedName },
        });

        expect(response.status()).toBe(200);

        const body: unknown = await response.json();
        const project = ProjectSchema.parse(body);
        expect(project).toBeTruthy();
        expect(project.name).toBe(updatedName);
        expect(project.description).toBe(description);
      });

      await test.step('WHEN the project is deleted via DELETE /projects/{id}', async () => {
        const response = await apiRequest.delete(`${appConfig.api.projects}/${projectId}`);

        expect(response.status()).toBe(204);
        deleted = true;
      });

      await test.step('THEN the project is no longer retrievable', async () => {
        const response = await apiRequest.get(`${appConfig.api.projects}/${projectId}`);

        expect(response.status()).toBe(404);

        const body: unknown = await response.json();
        expect(ErrorSchema.parse(body)).toBeTruthy();
      });
    } finally {
      // Safety net: the delete step is the assertion under test, but if any earlier
      // step throws the created project must not leak into the environment.
      if (projectId !== '' && !deleted) {
        await apiRequest.delete(`${appConfig.api.projects}/${projectId}`);
      }
    }
  });
});
