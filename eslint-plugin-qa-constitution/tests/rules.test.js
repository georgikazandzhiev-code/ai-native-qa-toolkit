'use strict';

const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');
const plugin = require('../lib/index.js');

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: false } },
  },
});

const SPEC = 'tests/app/api/projects.spec.ts';
const POM = 'pages/app/SettingsPage.ts';

// ---------------------------------------------------------------------------

tester.run('no-direct-playwright-import', plugin.rules['no-direct-playwright-import'], {
  valid: [
    { filename: SPEC, code: `import { test, expect } from '../../../fixtures/pom/test-options';` },
    // a non-spec file may legitimately import from @playwright/test (e.g. the barrel itself)
    { filename: 'fixtures/pom/test-options.ts', code: `import { test as base, expect } from '@playwright/test';` },
    // importing a type, not the guarded runtime bindings
    { filename: SPEC, code: `import type { Page } from '@playwright/test';` },
  ],
  invalid: [
    { filename: SPEC, code: `import { test, expect } from '@playwright/test';`, errors: [{ messageId: 'direct' }] },
    { filename: SPEC, code: `import { expect } from '@playwright/test';`, errors: [{ messageId: 'direct' }] },
  ],
});

tester.run('no-xpath', plugin.rules['no-xpath'], {
  valid: [
    `page.getByRole('button', { name: 'Save' });`,
    `page.locator('[data-state="checked"]');`,
    `row.locator('input');`,
  ],
  invalid: [
    { code: `page.locator('//div[@id="x"]');`, errors: [{ messageId: 'xpath' }] },
    { code: `page.locator('xpath=//button');`, errors: [{ messageId: 'xpath' }] },
    { code: `card.locator('(//tr)[1]');`, errors: [{ messageId: 'xpath' }] },
  ],
});

tester.run('no-hard-waits', plugin.rules['no-hard-waits'], {
  valid: [
    `await expect(row).toBeVisible();`,
    `await page.waitForResponse((r) => r.url().includes('/api/v1/projects'));`,
  ],
  invalid: [{ code: `await page.waitForTimeout(2000);`, errors: [{ messageId: 'hardWait' }] }],
});

tester.run('no-page-evaluate', plugin.rules['no-page-evaluate'], {
  valid: [
    `await expect(el).toHaveText('x');`,
    // not a Playwright surface
    `schema.evaluate(input);`,
  ],
  invalid: [
    { code: `await page.evaluate(() => document.title);`, errors: [{ messageId: 'evaluate' }] },
    { code: `await this.page.evaluate(() => 1);`, errors: [{ messageId: 'evaluate' }] },
  ],
});

tester.run('single-tag-on-test', plugin.rules['single-tag-on-test'], {
  valid: [
    `test('@App-regression creates a project', async () => { await go(); });`,
    { code: `test('creates a project', { tag: '@App-regression' }, async () => {});`, options: [{ whitelist: ['@App-regression'] }] },
    // describe with no tag is fine
    `describe('projects', () => { test('@smoke a', async () => {}); });`,
  ],
  invalid: [
    { code: `test('creates a project', async () => {});`, errors: [{ messageId: 'none' }] },
    { code: `test('@a @b creates', async () => {});`, errors: [{ messageId: 'many' }] },
    { code: `describe('@App-regression projects', () => {});`, errors: [{ messageId: 'onDescribe' }] },
    {
      code: `test('@nope creates', async () => {});`,
      options: [{ whitelist: ['@App-regression', '@smoke'] }],
      errors: [{ messageId: 'notWhitelisted' }],
    },
  ],
});

tester.run('no-conditional-in-test', plugin.rules['no-conditional-in-test'], {
  valid: [
    `test('@t a', async () => { await expect(x).toBe(1); });`,
    // conditionals outside a test body are fine (helpers, setup)
    `beforeAll(async () => { if (!seeded) await seed(); });`,
    `function pick(a) { return a ? 1 : 2; }`,
  ],
  invalid: [
    { code: `test('@t a', async () => { if (x) await y(); });`, errors: [{ messageId: 'conditional' }] },
    { code: `test('@t a', async () => { const v = x ? 1 : 2; });`, errors: [{ messageId: 'conditional' }] },
    { code: `test('@t a', async () => { test.skip(); });`, errors: [{ messageId: 'skip' }] },
    { code: `test('@t a', async () => { switch (x) { default: break; } });`, errors: [{ messageId: 'conditional' }] },
  ],
});

tester.run('no-try-catch-in-test', plugin.rules['no-try-catch-in-test'], {
  valid: [
    `test('@t a', async () => { await expect(x).toBe(1); });`,
    `test('@t a', async () => {
       // eslint-allow-cleanup-capture: keep the id so afterEach can delete the leaked row
       try { id = await create(); } catch { id = null; }
     });`,
    // outside a test body
    `afterEach(async () => { try { await cleanup(); } catch {} });`,
  ],
  invalid: [
    { code: `test('@t a', async () => { try { await expect(x).toBe(1); } catch {} });`, errors: [{ messageId: 'tryCatch' }] },
  ],
});

tester.run('no-not-tothrow', plugin.rules['no-not-tothrow'], {
  valid: [`expect(() => f()).toThrow();`, `await doThing();`],
  invalid: [
    { code: `expect(() => f()).not.toThrow();`, errors: [{ messageId: 'notToThrow' }] },
    { code: `await expect(p).not.rejects();`, errors: [{ messageId: 'notToThrow' }] },
  ],
});

tester.run('require-strict-object', plugin.rules['require-strict-object'], {
  valid: [`const S = z.strictObject({ id: z.string() });`, `const A = z.array(z.string());`],
  invalid: [
    {
      code: `const S = z.object({ id: z.string() });`,
      output: `const S = z.strictObject({ id: z.string() });`,
      errors: [{ messageId: 'loose' }],
    },
  ],
});

tester.run('schema-parse-idiom', plugin.rules['schema-parse-idiom'], {
  valid: [
    `expect(ProjectResponse.parse(body)).toBeTruthy();`,
    // assigning the parsed value is a different, legitimate intent
    `const parsed = ProjectResponse.parse(body);`,
    // lowercase receiver is not a schema by convention
    `payload.parse(raw);`,
  ],
  invalid: [
    { code: `ProjectResponse.parse(body);`, errors: [{ messageId: 'bare' }] },
    // still caught, now under its own message: the value IS asserted, just not with the idiom
    { code: `expect(ProjectResponse.parse(body)).toBeDefined();`, errors: [{ messageId: 'matcher' }] },
  ],
});

tester.run('no-jsdoc-on-locator-getter', plugin.rules['no-jsdoc-on-locator-getter'], {
  valid: [
    { filename: POM, code: `class P { get saveButton() { return this.page.getByRole('button', { name: 'Save' }); } }` },
    // JSDoc on an action method is correct
    {
      filename: POM,
      code: `class P {
        /** Fills the form and submits it. */
        async save(v) { await this.input.fill(v); await this.saveButton.click(); }
      }`,
    },
  ],
  invalid: [
    {
      filename: POM,
      code: `class P {
        /** The save button. */
        get saveButton() { return this.page.getByRole('button', { name: 'Save' }); }
      }`,
      errors: [{ messageId: 'jsdoc' }],
    },
  ],
});

tester.run('no-pom-instantiation-in-test', plugin.rules['no-pom-instantiation-in-test'], {
  valid: [
    `test('@t a', async ({ settingsPage }) => { await settingsPage.save(); });`,
    // instantiation inside a fixture is exactly right
    `const settingsPage = new SettingsPage(page);`,
  ],
  invalid: [
    {
      code: `test('@t a', async ({ page }) => { const p = new SettingsPage(page); });`,
      errors: [{ messageId: 'instantiate' }],
    },
  ],
});

tester.run('no-process-env-outside-config', plugin.rules['no-process-env-outside-config'], {
  valid: [
    // the config module is the one reader
    { code: `export const env = EnvSchema.parse(process.env);`, filename: 'config/env.ts' },
    { code: `const v = process.env[name];`, filename: '/repo/config/env.ts' },
    // the runner config reads ENVIRONMENT and CI from the shell
    { code: `const ci = !!process.env.CI;`, filename: 'playwright.config.ts' },
    // the setup project writes a run-time token: an assignment is not a read
    { code: `process.env.USER_ACCESS_TOKEN_ADMIN = token;`, filename: 'tests/app/login.setup.ts' },
    // everything else imports from config
    { code: `const t = tokens.admin(); const u = env.API_URL;`, filename: 'tests/app/api/jobs/jobs.spec.ts' },
  ],
  invalid: [
    { code: `const token = process.env.API_TOKEN!;`, filename: 'tests/app/api/jobs/jobs.spec.ts', errors: [{ messageId: 'outside' }] },
    { code: `const token = process.env.API_TOKEN;`, filename: 'helpers/app/jobs.ts', errors: [{ messageId: 'outside' }] },
    { code: `const url = process.env.BASE_URL ?? 'http://localhost';`, filename: 'pages/app/JobsPage.ts', errors: [{ messageId: 'outside' }] },
    { code: `if (!process.env.X) throw new Error('x');`, filename: 'tests/app/api/jobs/jobs.spec.ts', errors: [{ messageId: 'outside' }] },
    { code: `const all = process.env;`, filename: 'fixtures/api/x.ts', errors: [{ messageId: 'outside' }] },
  ],
});

tester.run('commented-test-needs-ticket', plugin.rules['commented-test-needs-ticket'], {
  valid: [
    `// TODO: FIXME: PROJ-123 API returns 500 on empty body
     // test('@t a', async () => { await go(); });
     const x = 1;`,
    `// a plain explanatory comment about tests
     const x = 1;`,
  ],
  invalid: [
    {
      code: `// test('@t a', async () => { await go(); });
             const x = 1;`,
      errors: [{ messageId: 'noTicket' }],
    },
    {
      code: `/* test('@t b', async () => {}); */
             const x = 1;`,
      errors: [{ messageId: 'noTicket' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Regression suite — each case below is a FALSE POSITIVE the lint-gate eval
// exposed on 2026-08-11. A generated spec was reported as non-compliant when it
// was in fact correct; these lock the fixes in.
// ---------------------------------------------------------------------------

tester.run('regression/hooks-are-not-tests', plugin.rules['single-tag-on-test'], {
  valid: [
    // test.beforeAll / afterAll are setup, not tests — they carry no tag
    `test.beforeAll(async ({ apiRequest }) => { await seed(apiRequest); });`,
    `test.afterAll(async ({ apiRequest }) => { await cleanup(apiRequest); });`,
    `test.beforeEach(async () => { await reset(); });`,
    `beforeAll(async () => { await seed(); });`,
    // Playwright configuration calls are not tests either (false positive found 2026-10-07):
    // a describe-level test.setTimeout / test.use was reported as "This test has no tag".
    `test.describe('journey', () => {
       test.setTimeout(appConfig.timeouts.e2eJourney);
       test.use({ storageState: { cookies: [], origins: [] } });
       test.slow();
     });`,
    `test.setTimeout(60_000);`,
    `const extended = test.extend({ settingsPage: async ({ page }, use) => { await use(new SettingsPage(page)); } });`,
    `test('@App-Smoke reads test info', async () => { expect(test.info().title).toBeTruthy(); });`,
  ],
  invalid: [],
});

tester.run('regression/setup-may-branch', plugin.rules['no-conditional-in-test'], {
  valid: [
    // the constitution REQUIRES seeding preconditions in setup, and fail-fast there
    `test.beforeAll(async ({ apiRequest }) => {
       const { body } = await listUsers(apiRequest);
       if (body.users.length === 0) throw new Error('needs at least one user');
       ownerId = body.users[0].id;
     });`,
    // guarded cleanup in teardown is the sanctioned pattern
    `test.afterAll(async ({ apiRequest }) => { if (tenantId) await deleteTenant(apiRequest, tenantId); });`,
    // a ternary that SHAPES data is construction, not conditional test logic
    `test('@App-API a', async ({ apiRequest }) => {
       await apiRequest({ method, url: u, body: method === 'DELETE' ? undefined : {} });
     });`,
    `test('@App-API a', async () => { await f(cond ? 'a' : 'b'); });`,
    `test('@App-API a', async () => { const s = \`x\${cond ? 1 : 2}\`; });`,
  ],
  invalid: [
    // control flow that steers around missing state is still forbidden
    { code: `test('@App-API a', async () => { if (existing) await use(existing); else await create(); });`, errors: [{ messageId: 'conditional' }] },
    { code: `test('@App-API a', async () => { const id = maybe ? await create() : existing; });`, errors: [{ messageId: 'conditional' }] },
  ],
});

tester.run('regression/setup-may-catch', plugin.rules['no-try-catch-in-test'], {
  valid: [
    `test.afterAll(async () => { try { await cleanup(); } catch {} });`,
    `test.beforeAll(async () => { try { await seed(); } catch (e) { throw e; } });`,
  ],
  invalid: [],
});

console.log('regression suite passed');

/**
 * Reversed 2026-10 (#5 PR 3). This suite used to hold expect.soft(Schema.parse(body)) as VALID —
 * eval run 3 called it "the correct negative-loop form". It is not soft: parse throws a ZodError
 * before expect.soft receives anything, so the loop stops at the first bad response. The loop
 * form is expect.soft(Schema.safeParse(body).success, label).toBe(true), the constitution's
 * carve-out.
 */
tester.run('regression/expect-soft-parse-is-not-soft', plugin.rules['schema-parse-idiom'], {
  valid: [
    // the carve-out: safeParse returns { success } and never throws, so every iteration reports
    "expect.soft(APIErrorSchema.safeParse(body).success, `omit ${field}`).toBe(true);",
    "expect.soft(APIErrorSchema.safeParse(body).success, 'label').toBe(true);",
    "expect.poll(() => 1).toBeTruthy(); expect(ErrSchema.parse(b)).toBeTruthy();",
  ],
  invalid: [
    { code: "expect.soft(APIErrorSchema.parse(body), `omit ${field}`).toBeTruthy();", errors: [{ messageId: 'soft' }] },
    { code: `expect.soft(APIErrorSchema.parse(body), 'label').toBeTruthy();`, errors: [{ messageId: 'soft' }] },
    // the matcher doesn't matter: the parse throws before any matcher runs
    { code: `expect.soft(APIErrorSchema.parse(body), 'x').toBeDefined();`, errors: [{ messageId: 'soft' }] },
  ],
});

/**
 * Found by tests/fault-injection.test.mjs on its first run, 2026-08-11, against the compliant
 * fixture. The rule used an allowlist of accepted parent node types — VariableDeclarator,
 * AssignmentExpression, and an expect chain — so every other way of USING a parsed value read as
 * "discarded". `Schema.parse(body).id`, which reads a field off the parse on the spot, was
 * reported. The rule now asks the question it actually means: is the value read by nobody?
 *
 * Third defect in this one rule, all with the same cause. An allowlist enumerates the forms its
 * author thought of; the forms they did not think of become false positives on correct code.
 */
tester.run('regression/a-used-parse-is-not-discarded', plugin.rules['schema-parse-idiom'], {
  valid: [
    // the original find: a field read straight off the parse
    `const id = Project.parse(body).id;`,
    `createdId = Project.parse(await response.json()).id;`,
    // every other shape of "used" the old allowlist missed
    `return Project.parse(body);`,
    `await handle(Project.parse(body));`,
    `const list = [Project.parse(body)];`,
    `const wrapped = { project: Project.parse(body) };`,
    `if (Project.parse(body).id) { done(); }`,
    `const parsed = (Project.parse(body) as Parsed);`,
    // a property assertion on a parsed value is a business assertion, not this rule's business
    `expect(Project.parse(body).name).toBe('x');`,
  ],
  invalid: [
    // the genuine false green survives: validated, then thrown away
    { code: `Project.parse(body);`, errors: [{ messageId: 'bare' }] },
    { code: `await Project.parse(body);`, errors: [{ messageId: 'bare' }] },
    // discarded via the comma operator, where only the last value survives
    { code: `(Project.parse(body), other());`, errors: [{ messageId: 'bare' }] },
  ],
});

// ---------------------------------------------------------------------------
// False-green detection — enforces definition_of_done.md § 2
// ---------------------------------------------------------------------------

tester.run('require-assertion-in-test', plugin.rules['require-assertion-in-test'], {
  valid: [
    `test('@App-API a', async () => { expect(status).toBe(200); });`,
    // soft assertions in a negative-case loop
    `test('@App-API a', async () => { for (const f of fields) expect.soft(S.safeParse(b).success, f).toBe(true); });`,
    // assertion nested inside a step or a loop still counts
    `test('@App-API a', async () => { await test.step('check', async () => { expect(x).toBe(1); }); });`,
    // a page-object assertion helper counts
    `test('@App-E2E a', async ({ p }) => { await p.expectSaved(); });`,
    `test('@App-E2E a', async ({ p }) => { await p.verifyToastVisible(); });`,
    // explicit opt-out for a test that genuinely asserts through a helper
    `// eslint-asserts-via-helper: assertProjectMatches does the checking
     test('@App-API a', async () => { await assertProjectMatches(body); });`,
    // hooks need no assertion
    `test.beforeAll(async () => { await seed(); });`,
    // a declaration with no body
    `test.skip('@App-API not yet');`,
  ],
  invalid: [
    // the false green: it runs, it passes, it proves nothing
    { code: `test('@App-API a', async ({ apiRequest }) => { await createProject(apiRequest); });`, errors: [{ messageId: 'none' }] },
    { code: `test('@App-E2E a', async ({ page }) => { await page.goto('/'); await page.getByRole('button').click(); });`, errors: [{ messageId: 'none' }] },
  ],
});

tester.run('no-empty-catch', plugin.rules['no-empty-catch'], {
  valid: [
    `try { await f(); } catch (e) { throw e; }`,
    `try { await f(); } catch (e) { logger.warn(e); }`,
    `try { id = await create(); } catch { id = null; }`,
  ],
  invalid: [
    { code: `try { await f(); } catch {}`, errors: [{ messageId: 'empty' }] },
    { code: `try { await f(); } catch (e) {}`, errors: [{ messageId: 'empty' }] },
    // a comment is not handling — core no-empty allows this, we do not
    { code: `try { await f(); } catch { /* ignore */ }`, errors: [{ messageId: 'empty' }] },
  ],
});

tester.run('no-disabled-test', plugin.rules['no-disabled-test'], {
  valid: [
    `test('@App-API a', async () => { expect(1).toBe(1); });`,
    // the sanctioned form: commented out under the one marker
    `// TODO: FIXME: QA-123 API returns 500 on empty body
// test('@App-API b', async () => {});`,
    // test.skip inside a body is no-conditional-in-test's report — not reported twice
    `test('@App-API a', async () => { test.skip(); expect(1).toBe(1); });`,
    // a page object's own skip() method is not Playwright's
    `await player.skip();`,
  ],
  invalid: [
    { code: `test.skip('@App-API a', async () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.fixme(true, 'broken');`, errors: [{ messageId: 'disabled' }] },
    { code: `test.skip(process.env.CI !== undefined, 'not in CI');`, errors: [{ messageId: 'disabled' }] },
    { code: `test.describe.skip('area', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.describe.fixme('area', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `it.skip('a', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.fail('@App-API a', async () => {});`, errors: [{ messageId: 'fail' }] },
    { code: `test('@App-API a', async () => { test.fail(); expect(1).toBe(1); });`, errors: [{ messageId: 'fail' }] },
    { code: `test('@App-API a', async () => { test.fixme(); expect(1).toBe(1); });`, errors: [{ messageId: 'disabled' }] },
  ],
});

/**
 * Found linting the #5 PR 2 templates, 2026-10-07: a describe-level test.fixme(true, '...') was
 * reported by single-tag-on-test as "This test has no tag". It must fail, but as a disabled test
 * (no-disabled-test) — the "no tag" message sent the author to add a tag to a skip.
 */
tester.run('regression/disabled-tests-are-not-untagged', plugin.rules['single-tag-on-test'], {
  valid: [
    `test.describe('area', () => { test.fixme(true, 'broken'); test('@App-API a', async () => {}); });`,
    `test.skip(process.env.CI !== undefined, 'not in CI');`,
    `test.fail('known bug', async () => {});`,
  ],
  invalid: [
    // a real test without a tag is still reported
    { code: `test.describe('area', () => { test.fixme(true, 'x'); test('a', async () => {}); });`, errors: [{ messageId: 'none' }] },
  ],
});

console.log('all rule tests passed');
