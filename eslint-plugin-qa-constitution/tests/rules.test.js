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
    `test('@regression creates a project', async () => { await go(); });`,
    { code: `test('creates a project', { tag: '@regression' }, async () => {});`, options: [{ whitelist: ['@regression'] }] },
    // describe with no tag is fine
    `describe('projects', () => { test('@smoke a', async () => {}); });`,
  ],
  invalid: [
    { code: `test('creates a project', async () => {});`, errors: [{ messageId: 'none' }] },
    { code: `test('@a @b creates', async () => {});`, errors: [{ messageId: 'many' }] },
    { code: `describe('@regression projects', () => {});`, errors: [{ messageId: 'onDescribe' }] },
    // the whitelist is case-sensitive: a stray capital is not the standard tag
    { code: `test('@Regression a', async () => {});`, options: [{ whitelist: ['@regression'] }], errors: [{ messageId: 'notWhitelisted' }] },
    {
      code: `test('@nope creates', async () => {});`,
      options: [{ whitelist: ['@regression', '@smoke'] }],
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
    // the lint allows the whole top-level config/ folder; only config/env.ts should read process.env (config skill), the rest is review
    { code: `export const env = EnvSchema.parse(process.env);`, filename: 'config/env.ts' },
    { code: `const v = process.env[name];`, filename: 'config/util/jobs-service.ts' },
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
    `test('@smoke reads test info', async () => { expect(test.info().title).toBeTruthy(); });`,
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
    `test('@api a', async ({ apiRequest }) => {
       await apiRequest({ method, url: u, body: method === 'DELETE' ? undefined : {} });
     });`,
    `test('@api a', async () => { await f(cond ? 'a' : 'b'); });`,
    `test('@api a', async () => { const s = \`x\${cond ? 1 : 2}\`; });`,
  ],
  invalid: [
    // control flow that steers around missing state is still forbidden
    { code: `test('@api a', async () => { if (existing) await use(existing); else await create(); });`, errors: [{ messageId: 'conditional' }] },
    { code: `test('@api a', async () => { const id = maybe ? await create() : existing; });`, errors: [{ messageId: 'conditional' }] },
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
    `test('@api a', async () => { expect(status).toBe(200); });`,
    // soft assertions in a negative-case loop
    `test('@api a', async () => { for (const f of fields) expect.soft(S.safeParse(b).success, f).toBe(true); });`,
    // assertion nested inside a step or a loop still counts
    `test('@api a', async () => { await test.step('check', async () => { expect(x).toBe(1); }); });`,
    // a page-object assertion helper counts
    `test('@e2e a', async ({ p }) => { await p.expectSaved(); });`,
    `test('@e2e a', async ({ p }) => { await p.verifyToastVisible(); });`,
    // explicit opt-out for a test that genuinely asserts through a helper
    `// eslint-asserts-via-helper: assertProjectMatches does the checking
     test('@api a', async () => { await assertProjectMatches(body); });`,
    // hooks need no assertion
    `test.beforeAll(async () => { await seed(); });`,
    // a declaration with no body
    `test.skip('@api not yet');`,
  ],
  invalid: [
    // the false green: it runs, it passes, it proves nothing
    { code: `test('@api a', async ({ apiRequest }) => { await createProject(apiRequest); });`, errors: [{ messageId: 'none' }] },
    { code: `test('@e2e a', async ({ page }) => { await page.goto('/'); await page.getByRole('button').click(); });`, errors: [{ messageId: 'none' }] },
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
    `test('@api a', async () => { expect(1).toBe(1); });`,
    // the sanctioned form: commented out under the one marker
    `// TODO: FIXME: QA-123 API returns 500 on empty body
// test('@api b', async () => {});`,
    // test.skip inside a body is no-conditional-in-test's report — not reported twice
    `test('@api a', async () => { test.skip(); expect(1).toBe(1); });`,
    // a page object's own skip() method is not Playwright's
    `await player.skip();`,
  ],
  invalid: [
    { code: `test.skip('@api a', async () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.fixme(true, 'broken');`, errors: [{ messageId: 'disabled' }] },
    { code: `test.skip(process.env.CI !== undefined, 'not in CI');`, errors: [{ messageId: 'disabled' }] },
    { code: `test.describe.skip('area', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.describe.fixme('area', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `it.skip('a', () => {});`, errors: [{ messageId: 'disabled' }] },
    { code: `test.fail('@api a', async () => {});`, errors: [{ messageId: 'fail' }] },
    { code: `test('@api a', async () => { test.fail(); expect(1).toBe(1); });`, errors: [{ messageId: 'fail' }] },
    { code: `test('@api a', async () => { test.fixme(); expect(1).toBe(1); });`, errors: [{ messageId: 'disabled' }] },
  ],
});

/**
 * Found by the skill-snippet lint, October 2026: `test.step(...)` was treated as a test
 * declaration. Inside a test it was hidden, but a step in a hook — legitimate setup — was reported
 * as an untagged test with no assertion.
 */
tester.run('regression/steps-are-not-tests', plugin.rules['single-tag-on-test'], {
  valid: [
    `test.beforeAll(async () => { await test.step('GIVEN: a seeded worker', async () => {}); });`,
    `await test.step('GIVEN: the page is open', async () => {});`,
  ],
  invalid: [],
});
tester.run('regression/steps-are-not-tests (assertions)', plugin.rules['require-assertion-in-test'], {
  valid: [`test.beforeAll(async () => { await test.step('seed', async () => { await seed(); }); });`],
  invalid: [
    // the test around the steps still needs its assertion
    { code: `test('@api a', async () => { await test.step('act', async () => { await act(); }); });`, errors: [{ messageId: 'none' }] },
  ],
});
tester.run('regression/steps-are-not-tests (conditionals)', plugin.rules['no-conditional-in-test'], {
  valid: [`test.beforeAll(async () => { await test.step('seed', async () => { if (!seeded) await seed(); }); });`],
  invalid: [
    // a step inside a test is still part of the test body
    { code: `test('@api a', async () => { await test.step('act', async () => { if (x) await act(); }); });`, errors: [{ messageId: 'conditional' }] },
  ],
});
tester.run('regression/steps-are-not-tests (try/catch)', plugin.rules['no-try-catch-in-test'], {
  valid: [`test.beforeAll(async () => { await test.step('seed', async () => { try { await seed(); } catch {} }); });`],
  invalid: [
    { code: `test('@api a', async () => { await test.step('act', async () => { try { await act(); } catch {} }); });`, errors: [{ messageId: 'tryCatch' }] },
  ],
});

/**
 * Found linting the #5 PR 2 templates, 2026-10-07: a describe-level test.fixme(true, '...') was
 * reported by single-tag-on-test as "This test has no tag". It must fail, but as a disabled test
 * (no-disabled-test) — the "no tag" message sent the author to add a tag to a skip.
 */
tester.run('regression/disabled-tests-are-not-untagged', plugin.rules['single-tag-on-test'], {
  valid: [
    `test.describe('area', () => { test.fixme(true, 'broken'); test('@api a', async () => {}); });`,
    `test.skip(process.env.CI !== undefined, 'not in CI');`,
    `test.fail('known bug', async () => {});`,
  ],
  invalid: [
    // a real test without a tag is still reported
    { code: `test.describe('area', () => { test.fixme(true, 'x'); test('a', async () => {}); });`, errors: [{ messageId: 'none' }] },
  ],
});

/**
 * A setup file declares its steps with test(), but they are setup: test-standards gives Setup no
 * tag, and storage-state generation has nothing to assert. Found by an adopter run, October 2026:
 * a tests/app/login.setup.ts written as the skills prescribe failed the gate (under the old
 * `tests/**` scope too).
 */
const SETUP = `import { test } from '../../fixtures/pom/test-options';\nqase.ignore();\ntest('authenticate as admin', async ({ page }) => { await page.goto('/'); });`;
tester.run('regression/setup-files-carry-no-tag', plugin.rules['single-tag-on-test'], {
  valid: [
    { filename: 'tests/app/login.setup.ts', code: SETUP, options: [{ whitelist: ['@api'] }] },
    { filename: 'tests/app/login.setup.mts', code: SETUP, options: [{ whitelist: ['@api'] }] },
  ],
  invalid: [{ filename: 'tests/app/login.spec.ts', code: SETUP, errors: [{ messageId: 'none' }] }],
});
tester.run('regression/setup-files-need-no-assertion', plugin.rules['require-assertion-in-test'], {
  valid: [{ filename: 'tests/app/login.setup.ts', code: SETUP }, { filename: 'tests/app/login.setup.mts', code: SETUP }],
  invalid: [{ filename: 'tests/app/login.spec.ts', code: SETUP, errors: [{ messageId: 'none' }] }],
});

// standard-layout cases use absolute file names.
// Every case sits in tests/fixtures/nested-repo, a folder with its own eslint.config.mjs: the rule
// reads paths from the nearest folder holding a flat config, not from where the tests were started.
// Its tests/perf/package.json stands for a k6 sub-project, which must not move that root.
const NESTED = require('node:path').join(__dirname, 'fixtures', 'nested-repo').replace(/\\/g, '/');
const at = (rel) => `${NESTED}/${rel}`;
// A repo with a package.json but no flat config above it: the root falls back to the package.json.
// It must sit outside this repository, whose own eslint.config.mjs would be found first.
const BARE = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'bare-repo-')).replace(/\\/g, '/');
require('node:fs').writeFileSync(`${BARE}/package.json`, '{ "private": true }');
process.on('exit', () => require('node:fs').rmSync(BARE, { recursive: true, force: true }));
const BODY = `const a = 1;`;
const POM_CLASS = `export class SettingsPage extends BasePage {}`;
const K6 = `import http from 'k6/http';\nimport { sleep } from 'k6';\nexport default function () { http.get('x'); sleep(1); }`;
// A *.test.ts is judged as a spec only when it imports Playwright or the barrel.
const PW = `import { test } from '../fixtures/pom/test-options';\nconst a = 1;`;
// A repo whose k6 sub-project has its own package.json and no flat config above it, so its root is declared.
const PERF = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'perf-repo-')).replace(/\\/g, '/');
require('node:fs').mkdirSync(`${PERF}/tests/perf/load`, { recursive: true });
require('node:fs').writeFileSync(`${PERF}/package.json`, '{ "private": true }');
require('node:fs').writeFileSync(`${PERF}/tests/perf/package.json`, '{ "private": true }');
process.on('exit', () => require('node:fs').rmSync(PERF, { recursive: true, force: true }));

tester.run('standard-layout', plugin.rules['standard-layout'], {
  valid: [
    { filename: at('tests/app/api/jobs-service/workers/workers.spec.ts'), code: BODY },
    { filename: at('tests/app/e2e/tenant-service/login-smoke.spec.ts'), code: BODY },
    { filename: at('tests/app/functional/jobs-service/job-list.spec.ts'), code: BODY },
    { filename: at('tests/app/login.setup.ts'), code: BODY },
    // a setup file is named <name>.setup.ts; the standard sets no case for <name>
    { filename: at('tests/app/adminLogin.setup.ts'), code: BODY },
    { filename: at('fixtures/pom/test-options.ts'), code: BODY },
    { filename: at('fixtures/pom/page-object-fixture.ts'), code: BODY },
    { filename: at('fixtures/api/api-request-fixture.ts'), code: BODY },
    { filename: at('fixtures/services/login-fixture.ts'), code: BODY },
    { filename: at('pages/app/SettingsPage.ts'), code: POM_CLASS },
    { filename: at('pages/util/LoginPage.ts'), code: `export class LoginPage extends BasePage {}` },
    { filename: at('pages/baseClasses/DataTableBase.ts'), code: `export abstract class DataTableBase extends BasePage {}` },
    { filename: at('tests/perf/load/jobs-list.ts'), code: K6 },
    // subfolders under a standard folder are allowed
    { filename: at('pages/app/jobs/JobsPage.ts'), code: `export class JobsPage extends BasePage {}` },
    { filename: at('fixtures/api/jobs/jobs-fixture.ts'), code: BODY },
    { filename: at('tests/perf/load/jobs/list.ts'), code: K6 },
    // a unit test (Vitest, node:test) is not a Playwright spec
    { filename: at('helpers/util/retry.test.ts'), code: `import { describe, it } from 'vitest';\ndescribe('retry', () => { it('retries', () => {}); });` },
    // kinds the rule cannot recognise from one file are not judged
    { filename: at('src/utils/whatever.ts'), code: BODY },
    { filename: at('lib/Thing.ts'), code: `export class Thing extends Base {}` },
    // a file outside the root is not judged
    { filename: at('e2e/login.spec.ts'), code: BODY, options: [{ root: at('qa') }] },
    // inside a declared root, the layout is read from that root
    { filename: at('qa/tests/app/api/x/a.spec.ts'), code: BODY, options: [{ root: at('qa') }] },
    { filename: at('qa/tests/app/api/x/a.spec.ts'), code: BODY, options: [{ root: 'qa' }] },
    // Windows-only: on Linux a backslash root is not a path, and this case passes because the file is outside it
    { filename: at('qa/tests/app/api/x/a.spec.ts'), code: BODY, options: [{ root: at('qa').replace(/\//g, '\\') }] },
    // a k6 sub-project's package.json with no flat config above it: the declared root keeps the layout
    { filename: `${PERF}/tests/perf/load/jobs-load.ts`, code: K6, options: [{ root: PERF }] },
    // an area on the drift table is skipped until its move PR deletes the entry
    { filename: at('e2e/login.spec.ts'), code: BODY, options: [{ drift: ['e2e'] }] },
    { filename: at('e2e/login.spec.ts'), code: BODY, options: [{ drift: ['e2e\\'] }] },
    { filename: at('src/pages/fooPage.ts'), code: `export class FooPage extends BasePage {}`, options: [{ drift: ['./src/pages/'] }] },
    // a repo's own page base, declared
    { filename: at('pages/app/Shell.ts'), code: `export class Shell extends AppShell {}`, options: [{ pageBases: ['AppShell'] }] },
    // a single file on the drift table
    { filename: at('auth.setup.ts'), code: BODY, options: [{ drift: ['auth.setup.ts'] }] },
    // a misnamed file waits when its own path is listed (constitution: it may stay on the drift table)
    { filename: at('tests/app/api/orders/createOrder.spec.ts'), code: BODY, options: [{ drift: ['tests/app/api/orders/createOrder.spec.ts'] }] },
    // k6 helpers live in tests/perf/lib/
    { filename: at('tests/perf/lib/http-helpers.ts'), code: K6 },
    // a k6 sub-project's own package.json doesn't move the root
    { filename: at('tests/perf/stress/jobs-burst.ts'), code: K6 },
    // k6's types are not a k6 script
    { filename: at('helpers/util/perf-thresholds.ts'), code: `import { type Options, type Threshold } from 'k6/options';\nexport const t: Options = {};` },
    { filename: at('helpers/util/perf-options.ts'), code: `import type { Options } from 'k6/options';\nexport const options: Options = {};` },
    { filename: at('types/k6-extras.d.ts'), code: `import { Counter } from 'k6/metrics';\nexport declare const c: Counter;` },
  ],
  invalid: [
    { filename: at('e2e/login.spec.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('tests/app/api/projects.spec.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('tests/app/ui/x/projects.spec.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('tests/app/api/jobs-service/createJob.spec.ts'), code: BODY, errors: [{ messageId: 'name' }] },
    { filename: at('tests/app/auth/login.setup.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('tests/app/login.setup.mts'), code: BODY, errors: [{ messageId: 'name' }] },
    { filename: at('support/test-options.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('support/login-fixture.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('fixtures/pom/loginFixture-fixture.ts'), code: BODY, errors: [{ messageId: 'name' }] },
    { filename: at('src/pages/SettingsPage.ts'), code: POM_CLASS, errors: [{ messageId: 'place' }] },
    { filename: at('pages/SettingsPage.ts'), code: POM_CLASS, errors: [{ messageId: 'place' }] },
    { filename: at('pages/app/settingsPage.ts'), code: POM_CLASS, errors: [{ messageId: 'name' }] },
    { filename: at('src/Grid.ts'), code: `export class Grid extends DataTableBase {}`, errors: [{ messageId: 'place' }] },
    { filename: at('perf/jobs-list.ts'), code: K6, errors: [{ messageId: 'place' }] },
    { filename: at('tests/perf/load/jobsList.ts'), code: K6, errors: [{ messageId: 'name' }] },
    // the drift option skips only what it names
    { filename: at('api-tests/x.spec.ts'), code: BODY, options: [{ drift: ['e2e'] }], errors: [{ messageId: 'place' }] },
    { filename: at('e2e-old/x.spec.ts'), code: BODY, options: [{ drift: ['e2e'] }], errors: [{ messageId: 'place' }] },
    // a declared page base is judged like BasePage
    { filename: at('src/Shell.ts'), code: `export class Shell extends AppShell {}`, options: [{ pageBases: ['AppShell'] }], errors: [{ messageId: 'place' }] },
    // inside a declared root, the layout is read from that root
    { filename: at('qa/e2e/login.spec.ts'), code: BODY, options: [{ root: at('qa') }], errors: [{ messageId: 'place' }] },
    { filename: at('qa/e2e/login.spec.ts'), code: BODY, options: [{ root: './qa/' }], errors: [{ messageId: 'place' }] },
    // an absolute root is used as given, not appended to the working directory
    { filename: at('e2e/login.spec.ts'), code: BODY, options: [{ root: NESTED }], errors: [{ messageId: 'place' }] },
    // with no flat config above it, the nearest package.json is the root
    { filename: `${BARE}/e2e/login.spec.ts`, code: BODY, errors: [{ messageId: 'place' }] },
    // a class expression extending a page base is a page object too
    { filename: at('src/Inline.ts'), code: `export const Inline = class extends BasePage {};`, errors: [{ messageId: 'place' }] },
    // misplaced and misnamed: one report, the place — the name is fixed when the file moves
    { filename: at('e2e/Login.spec.ts'), code: BODY, errors: [{ messageId: 'place' }] },
    // a drift entry excuses only what is out of place: a standard folder under it is still judged
    { filename: at('pages/app/ordersPage.ts'), code: `export class OrdersPage extends BasePage {}`, options: [{ drift: ['pages/'] }], errors: [{ messageId: 'name' }] },
    { filename: at('tests/app/e2e/orders/CreateOrder.spec.ts'), code: BODY, options: [{ drift: ['tests/'] }], errors: [{ messageId: 'name' }] },
    // a single-file drift entry covers that file only
    { filename: at('global.setup.ts'), code: BODY, options: [{ drift: ['auth.setup.ts'] }], errors: [{ messageId: 'place' }] },
    // Playwright's other spec names are specs too, when the file imports Playwright or the barrel
    { filename: at('integration/orders.test.ts'), code: PW, errors: [{ messageId: 'place' }] },
    { filename: at('integration/raw.test.ts'), code: `import { test } from '@playwright/test';\nconst a = 1;`, errors: [{ messageId: 'place' }] },
    { filename: at('tests/app/api/orders/orders.test.ts'), code: PW, errors: [{ messageId: 'name' }] },
    { filename: at('tests/app/api/orders/orders.spec.mts'), code: BODY, errors: [{ messageId: 'name' }] },
    // a page base under another name is still a page base
    { filename: at('src/admin/ReportsPage.ts'), code: `import { BasePage as Base } from '../base';\nexport class ReportsPage extends Base {}`, errors: [{ messageId: 'place' }] },
    // a type import first does not hide the script's value import
    { filename: at('perf/jobs.ts'), code: `import type { Options } from 'k6/options';\n${K6}`, errors: [{ messageId: 'place' }] },
    // a k6 script needs its test-type folder
    { filename: at('tests/perf/smoke.ts'), code: K6, errors: [{ messageId: 'place' }] },
    // a drive letter in another case is the same path (Windows editors mix them; on Linux these are
    // ordinary cases, so they get file names of their own — RuleTester rejects duplicate cases)
    { filename: at('e2e/drive-letter.spec.ts').replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`), code: BODY, errors: [{ messageId: 'place' }] },
    { filename: at('e2e/drive-letter-root.spec.ts').replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`), code: BODY, options: [{ root: NESTED }], errors: [{ messageId: 'place' }] },
  ],
});

/**
 * `allow` is matched against the path from the layout root (the repo root, or `root` when set), not the absolute path (#83). The old
 * default, `(^|/)config/` on the absolute path, let a spec in a service folder named `config`, or
 * any file in a checkout whose path contains `/config/`, read process.env.
 */
const ENV_READ = `const token = process.env.API_TOKEN;`;
// A checkout under a folder named config: a package.json root with no flat config above it.
const CKOUT = `${require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'ckout-')).replace(/\\/g, '/')}/config/repo`;
require('node:fs').mkdirSync(CKOUT, { recursive: true });
require('node:fs').writeFileSync(`${CKOUT}/package.json`, '{ "private": true }');
process.on('exit', () => require('node:fs').rmSync(CKOUT.replace(/\/config\/repo$/, ''), { recursive: true, force: true }));
tester.run('regression/env-allow-reads-the-repo-root-path', plugin.rules['no-process-env-outside-config'], {
  valid: [
    { filename: at('config/env.ts'), code: `export const env = EnvSchema.parse(process.env);` },
    { filename: at('playwright.config.ts'), code: `const ci = !!process.env.CI;` },
    { filename: at('playwright.config.mts'), code: ENV_READ },
    { filename: at('playwright.config.js'), code: ENV_READ },
    // a declared root moves the config module with the layout
    { filename: at('qa/config/env.ts'), code: ENV_READ, options: [{ root: 'qa' }] },
    // a file outside a declared root is not judged
    { filename: at('tools/seed.ts'), code: ENV_READ, options: [{ root: 'qa' }] },
    // a legacy config module, allowed by its path from the repo root until Config moves
    { filename: at('src/config.ts'), code: ENV_READ, options: [{ allow: '^src/config\\.ts$' }] },
    { filename: `${CKOUT}/config/env.ts`, code: ENV_READ },
  ],
  invalid: [
    // a service folder named config is not the config module
    { filename: at('tests/app/api/config/config.spec.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    { filename: at('helpers/app/config/jobs.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    // the runner config is the one at the root
    { filename: at('tests/app/playwright.config.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    // nor is a checkout whose path contains /config/
    { filename: `${CKOUT}/tests/app/api/jobs/jobs.spec.ts`, code: ENV_READ, errors: [{ messageId: 'outside' }] },
    // a legacy config module needs its allow entry
    { filename: at('src/config.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    // inside a declared root, the layout is read from that root
    { filename: at('qa/tests/app/api/jobs/jobs.spec.ts'), code: ENV_READ, options: [{ root: 'qa' }], errors: [{ messageId: 'outside' }] },
    { filename: at('qa/config/env.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    // only the config/ folder and playwright.config.{js,ts,mjs,mts,cjs,cts} at the root
    { filename: at('config.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    { filename: at('configs/x.ts'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
    { filename: at('playwright.config.tsx'), code: ENV_READ, errors: [{ messageId: 'outside' }] },
  ],
});

console.log('all rule tests passed');
