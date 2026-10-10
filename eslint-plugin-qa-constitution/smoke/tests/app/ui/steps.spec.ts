// Deliberately non-compliant fixture. Nothing here is an example to copy.
//
// tests/fault-injection.test.mjs pins the exact reports on this file, rule and line, so it locks in
// one fix through the real ESLint CLI: `test.step(...)` declares no test.
//   - The steps in the two hooks are setup and teardown. They need no tag and no assertion, and
//     setup may fail fast with an `if` and teardown may catch. All four rules must stay silent there.
//   - The first test has no tag and no assertion, and the step inside it must not hide that:
//     single-tag-on-test and require-assertion-in-test must both report it.
//   - The second test is tagged and asserts, but its step holds an `if` and a try/catch. A step
//     inside a test is still test code: no-conditional-in-test and no-try-catch-in-test must both
//     report it.
import { test, expect } from 'fixtures/pom/test-options';

let projectId: string;

test.beforeAll(async ({ api }) => {
  await test.step('GIVEN: a seeded project', async () => {
    const created = await api.createProject('seeded');
    if (!created.id) throw new Error('seeding returned no project id');
    projectId = created.id;
  });
});

test.afterAll(async ({ api }) => {
  await test.step('cleanup: delete the seeded project', async () => {
    try {
      await api.deleteProject(projectId);
    } catch (error) {
      throw new Error(`cleanup failed for project ${projectId}`, { cause: error });
    }
  });
});

test('opens the seeded project', async ({ page }) => {
  await test.step('WHEN: the project page is opened', async () => {
    await page.goto(`/projects/${projectId}`);
  });
});

test('@App-API archives the seeded project', async ({ api }) => {
  await test.step('WHEN: the project is archived', async () => {
    const response = await api.archive(projectId);
    if (response.status() === 409) return;
    try { expect(response.status()).toBe(200); } catch (error) {
      throw new Error(`archive failed for project ${projectId}`, { cause: error });
    }
  });
});
