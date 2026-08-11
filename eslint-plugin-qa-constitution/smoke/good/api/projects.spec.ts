// Compliant reference fixture. Every rule in the plugin must stay SILENT on this file.
//
// It also exercises all three escape hatches end to end, which nothing else does outside of unit
// tests: the ticket marker on a commented-out test, `eslint-allow-cleanup-capture` on the one
// sanctioned try/catch, and `eslint-asserts-via-helper` on a test whose assertion is delegated.
// An escape hatch that has never been exercised through the CLI is a claim, not a feature.
import { expect, test } from 'fixtures/pom/test-options';
import { z } from 'zod';

const Project = z.strictObject({
  id: z.string(),
  name: z.string(),
});

const token = process.env.API_TOKEN!;

async function assertProjectListShape(body: unknown): Promise<void> {
  expect(z.array(Project).parse(body)).toBeTruthy();
}

// TODO: FIXME: QA-118 — re-enable once archiving twice returns 409 instead of 500.
// test('@App-API archiving a project twice returns 409', async ({ api }) => {
//   const second = await api.archive(projectId);
//   expect(second.status()).toBe(409);
// });

test('@App-API creates a project and returns the created record', async ({ request }) => {
  const response = await request.post('/api/v1/projects', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'contract check' },
  });

  expect(response.status()).toBe(201);
  expect(Project.parse(await response.json())).toBeTruthy();
});

test('@App-API rejects each required field when it is omitted', async ({ request }) => {
  for (const field of ['name'] as const) {
    const response = await request.post('/api/v1/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    // expect.soft keeps the loop running so every field is reported, not just the first.
    expect.soft(response.status(), `omitting ${field}`).toBe(400);
  }
});

test('@App-Integration keeps the id of a project whose creation response failed', async ({ request }) => {
  let createdId: string | undefined;

  // eslint-allow-cleanup-capture — the id is needed for teardown even when the call throws.
  try {
    const response = await request.post('/api/v1/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: 'aborted' },
    });
    createdId = Project.parse(await response.json()).id;
  } catch {
    createdId = undefined;
  }

  expect(createdId).toBeDefined();
});

// eslint-asserts-via-helper — the assertion lives in assertProjectListShape().
test('@App-Sanity the project list matches the contract', async ({ api }) => {
  await assertProjectListShape(await api.listProjects());
});

test('@App-Smoke renames the profile', async ({ settingsPage }) => {
  await settingsPage.rename('renamed');
  await settingsPage.expectSaved();
});
