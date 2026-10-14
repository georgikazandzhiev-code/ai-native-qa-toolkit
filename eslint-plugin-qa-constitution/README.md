# eslint-plugin-qa-constitution

Turns the mechanically checkable half of the [QA engineering constitution](../.claude/CLAUDE.md) into **18 enforceable ESLint rules**.

The rest of this toolkit is prose that an agent is asked to follow. This is the part a pipeline can refuse to merge. Governance without an enforcement mechanism is advice.

## Install

```bash
npm i -D eslint eslint-plugin-qa-constitution @typescript-eslint/parser
```

Flat config (`eslint.config.js`):

```js
import tsParser from '@typescript-eslint/parser';
import qa from 'eslint-plugin-qa-constitution';

export default [
  { ignores: ['node_modules/', 'playwright-report/', 'test-results/', 'dist/'] },
  { files: ['**/*.ts', '**/*.mts', '**/*.cts'], languageOptions: { parser: tsParser }, ...qa.configs.recommended },
];
```

The parser is not optional: without it ESLint reads TypeScript as JavaScript, and every type annotation is a parse error.

Lint every TypeScript file, not only `tests/`, `pages/` and `fixtures/`. `standard-layout` can only fail a misplaced spec or page object that it is shown, and `helpers/` and `config/` carry rules too (`no-process-env-outside-config`). Keep build output out with `ignores`. `standard-layout` reads paths from the repo root: the nearest folder above each file that holds an `eslint.config.*`, or failing that a `package.json`. So the result is the same whichever folder ESLint is started from, and a k6 sub-project's own `tests/perf/package.json` doesn't move it. Set `root` only when the layout starts below that, such as a `qa/` folder.

`configs.strict` adds the core and typescript-eslint rules the constitution also mandates (`no-console`, `no-explicit-any`, `ban-ts-comment`) — it expects `@typescript-eslint/eslint-plugin` to be configured by you.

## The rules

| Rule | Constitution clause | Fires on |
|------|--------------------|----------|
| `no-direct-playwright-import` | MUST Imports | `import { test } from '@playwright/test'` in a spec file — bypasses fixture injection |
| `no-pom-instantiation-in-test` | MUST Dependency Injection | `new SettingsPage(page)` inside a test body |
| `single-tag-on-test` | MUST Tags | Zero tags, two tags, a non-whitelisted tag, or a tag on `describe()` |
| `require-strict-object` | MUST Schemas | `z.object(` — **autofixable** to `z.strictObject(` |
| `schema-parse-idiom` | MUST Response Validation | `Schema.parse(body)` whose result is discarded instead of asserted, and `expect.soft(Schema.parse(body))`, which isn't soft (the loop form is `expect.soft(Schema.safeParse(body).success, label).toBe(true)`) |
| `no-process-env-outside-config` | MUST Sources of Truth | Any `process.env` read outside the config module (`config/`, `playwright.config.*`). A write, such as the setup project storing a run-time token, is allowed. Replaces `require-env-non-null`, whose `!` idiom only silenced the compiler |
| `no-xpath` | WON'T No XPath | `locator('//…')`, `locator('xpath=…')`, `locator('(//…')` |
| `no-hard-waits` | WON'T No hard waits | `waitForTimeout(…)` |
| `no-page-evaluate` | WON'T No page.evaluate | `page.evaluate`, `$eval`, `$$eval` for DOM work |
| `no-conditional-in-test` | WON'T No conditional test logic | `if` / ternary / `switch` / `test.skip()` inside a test body |
| `no-try-catch-in-test` | WON'T No try/catch in tests | `try` in a test body, unless marked with the cleanup-capture comment |
| `no-not-tothrow` | WON'T No `.not.toThrow()` | `expect(…).not.toThrow()` / `.not.rejects` |
| `no-jsdoc-on-locator-getter` | WON'T No JSDoc on locator getters | JSDoc above a `get` accessor returning a locator chain |
| `commented-test-needs-ticket` | WON'T No silent coverage drops | A commented-out `test(` block with no `TODO` / `FIXME` / `BUG` marker |
| `no-disabled-test` | WON'T No silent coverage drops | `test.skip` / `test.fixme` / `test.fail` and `describe.skip`/`.fixme`, in any form — comment the test out under `// TODO: FIXME: <TICKET>` instead |
| `require-assertion-in-test` | DoD § 2 False-Green | A test containing **no assertion at all** — it runs, it passes, it proves nothing |
| `standard-layout` | § Standard repo layout and naming | A spec (`*.spec.ts`, or `*.test.ts`) outside `tests/app/{api,e2e,functional}/<service>/` or not `kebab-case.spec.ts`; a setup file outside `tests/app/`; the barrel anywhere but `fixtures/pom/test-options.ts`; a `*-fixture.ts` outside `fixtures/{pom,api,services}/`; a class extending `BasePage` or `DataTableBase` outside `pages/{app,util,baseClasses}/` or not `PascalCase.ts`; a k6 script outside `tests/perf/<test type>/` or `tests/perf/lib/`. Helpers, enums, schemas and test data can't be recognised from one file and are not judged |
| `no-empty-catch` | DoD § 2 False-Green | An empty `catch` anywhere (spec, helper or page object), including one holding only a comment |

### Options worth setting

```js
rules: {
  'qa-constitution/no-direct-playwright-import': ['error', {
    barrel: 'fixtures/pom/test-options',   // your barrel path, for the message
    specPattern: '\\.spec\\.ts$',          // which files count as specs
  }],
  'qa-constitution/single-tag-on-test': ['error', {
    whitelist: ['@critical', '@smoke', '@sanity', '@regression', '@api', '@integration', '@e2e'],  // the standard tags (test-standards); a repo that kept its own set lists that set here; a repo still on the toolkit's earlier @App-* set keeps its @App-* whitelist until its move PR changes it
  }],
  'qa-constitution/no-pom-instantiation-in-test': ['error', {
    pattern: '(Page|Component|Client)$',   // what counts as an injectable
  }],
  'qa-constitution/standard-layout': ['error', {
    drift: ['e2e/', 'src/pages/', 'auth.setup.ts'], // your drift table: folders or single files that haven't moved yet
    pageBases: ['BasePage', 'DataTableBase'], // the classes a page object extends (the default)
    root: 'qa',                            // only if the layout starts below the repo root; relative to it, or absolute
  }],
  'qa-constitution/no-process-env-outside-config': ['error', {
    allow: '(^|/)config/|(^|/)playwright\\.config\\.[cm]?[jt]s$|/src/config\\.ts$', // the default, plus a legacy config module until the Config move
  }],
}
```

`single-tag-on-test` with no `whitelist` still enforces *exactly one* tag; add the whitelist to also enforce which ones. A setup file (`*.setup.ts`) is exempt from it and from `require-assertion-in-test`: its steps are declared with `test()`, but they are setup, carry no tag (`test-standards`) and have nothing to assert. The exemption goes by file name, so a real test must never be named `*.setup.ts`; `standard-layout` still fails one outside `tests/app/`.

`standard-layout` and the drift table: a `drift` entry excuses only a file that is out of place. A file inside its standard folder is always judged, so `drift: ['pages/']` for a legacy `pages/` tree does not switch off `pages/app/`. A new file never goes on the list: the constitution sends it to the standard location. The rule judges what it can recognise from one file — specs (`*.spec.ts`, and `*.test.ts` named as a spec should be), setup files, the barrel, `*-fixture.ts`, a class extending a page base (also through a named import under another name, `import { BasePage as Base }`), and k6 scripts (not `.d.ts` files or type-only imports). It cannot see a legacy barrel with another name (`support/fixtures.ts`), a page object that extends another page object, or helpers, enums, schemas and test data; those stay a review responsibility.

During a migration the config module is often still a root `config.ts`. `no-process-env-outside-config` doesn't read the drift table: widen its `allow` pattern for that file until Config moves, which is why the constitution moves Config first.

## False-green detection

Two of the rules exist specifically to enforce `definition_of_done.md` § 2 — *"Empty runs or non-asserting dry-runs are flagged as False-Green defects"* — which until now was written down with nothing to enforce it.

`require-assertion-in-test` walks the whole test body, so an assertion nested inside a `test.step`, a loop or a callback still counts. It recognises `expect`, `expect.soft`, `expect.poll`, `assert`, and page-object assertion helpers matching `expectX` / `assertX` / `verifyX`. When a test genuinely asserts through a helper the rule cannot see into, opt out explicitly:

```ts
// eslint-asserts-via-helper: assertProjectMatches does the checking
test('@api creates a project', async ({ apiRequest }) => {
  await assertProjectMatches(apiRequest, expected);
});
```

`no-empty-catch` is stricter than core `no-empty`, which permits a catch containing only a comment. A comment does not re-throw, so an "// ignore" catch is exactly the swallowed failure this rule exists to stop.

**Measured on real generated code:** across 1,158 lines produced by two independent arms in the lint-gate eval, both rules reported **zero** violations — no false positives. That is the number worth knowing about a rule that blocks a merge.

## The one sanctioned escape hatch

The constitution allows exactly one `try`/`catch` in a test: capturing an accidentally created resource id so cleanup can delete it. Mark it and the rule stands down:

```ts
// eslint-allow-cleanup-capture: keep the id so afterEach can delete the leaked row
try { id = await create(payload); } catch { id = null; }
```

Configurable via `{ allowComment: '…' }`. It is a named, greppable exception rather than a blanket disable — you can audit every use of it in one command.

## What this cannot enforce

Stated plainly, because a linter that claims more than it checks is worse than no linter.

| Constitution clause | Why a linter cannot decide it |
|---|---|
| Selector priority hierarchy | Requires knowing whether a role-based locator *would have worked* on the real DOM. Static analysis cannot see the page. |
| Coverage plan completeness | Presence of a comment block is checkable; whether it enumerates every status code in the contract is not. |
| Cleanup adequacy | Requires knowing which resources a test created and whether teardown reverses all of them. |
| Explore before generate | A process step, not a code property. |
| Search before creating | Same. |
| No hardcoded secrets | Entropy detection belongs to a secret scanner (gitleaks, trufflehog), not an AST linter. |
| Verification | Whether the tests were actually *run* is a CI fact, not a source fact. |

Roughly half the constitution is enforceable this way. The other half stays a review responsibility — which is the honest division, and the reason `pr-review` remains a skill rather than a rule.

## CI gate

```yaml
- name: QA constitution
  run: npx eslint . --max-warnings 0   # the whole repo, so a misplaced file is seen; build output is in `ignores`
```

Pair it with branch protection so a violation blocks the merge rather than merely annotating it. Without the gate this plugin is a suggestion box.

## Tests

18 rules, 30 `RuleTester` suites, plus valid cases per rule. Twelve of the suites are regression suites, each holding code that a rule once got wrong. Four of them lock in the same `test.step` fix, one each for `single-tag-on-test`, `require-assertion-in-test`, `no-conditional-in-test` and `no-try-catch-in-test`.

```bash
npm test
```

The suite has been **fault-injected to prove it bites** — disabling a rule's report produces `Should have 1 error but had 0`, and corrupting the `require-strict-object` autofix produces `Output is incorrect`. A green run means the rules fire, not merely that the file parses.

`node tests/fault-injection.test.mjs` repeats that through the real ESLint CLI on every push: each rule must fire on the known-bad tree (`smoke/tests/`), stay silent on the compliant tree (`smoke/good/`), and stop reporting when its visitor is emptied. It also pins the exact reports, rule and line, on `smoke/tests/app/ui/steps.spec.ts`: a `test.step` inside a hook must draw no report, the untagged, assertion-free test around a step must draw both test-level reports, and an `if` and a `try`/`catch` in a step inside a test must each still be reported.

The rules also hold the toolkit's own teaching to account. `node tests/skill-snippets.test.mjs` checks every TypeScript example in `.claude/skills/` against every rule except `standard-layout`, which judges where a repo's files sit, not what a snippet says: an agent copies those examples, so an example that breaks a rule teaches every session to break it. At the time of writing it finds 244 blocks and lints 194 of them; the first line of each run prints the current counts.

- **Every block must parse**, including the ones that are not linted.
- **Counter-examples are parsed, not linted.** A block is one when its first comment line, the prose line just above it, or the heading or bold label it sits under starts with a wrong-label: ❌, BAD, WRONG, FORBIDDEN or ANTI-PATTERN, followed by the end of the line or a delimiter such as `:` or `—`. "Bad request (400)" and "Forbidden: 403" do not count, and a first comment line that starts with GOOD / CORRECT / FIX wins. Every counter-example is printed with the line that labelled it.
- **A block that cannot be linted on its own** carries `<!-- snippet-lint: skip — <reason> -->`. The reason must be a real one, not a placeholder, and it is printed on every run.
- **An inline `eslint-disable` needs a `-- reason`**, and each finding it suppresses is printed on every run. Inline rule configuration (`/* eslint <rule>: off */` with the rule name bare or quoted, `/* eslint-env */`, `/* global */`) fails the run, because it would switch a rule off without leaving a trace.
- **A test-body fragment** (a block that calls `expect()`, declares no function, class or export, and declares no test or hook — `test.step(...)` calls are allowed, because a step is not a test) is linted a second time inside a tagged `test()`, so the rules that need an enclosing test (no conditionals, no try/catch, no page-object instantiation) apply to it. A fragment that also declares a function is linted as a helper module, so those rules do not reach its body.
- Fences follow CommonMark. An unclosed fence fails the run, and so does a run that finds no block at all.

`node tests/skill-snippets.harness.test.mjs` tests that lint itself: 124 cases at the time of writing, with planted defects that must fail next to labelled ones that must pass. `node tests/skill-snippets.mutation.test.mjs` measures how strong those cases are instead of trusting them: 75 mutants at the time of writing, each breaking one condition of the lint, and the harness must fail against every one. A surviving mutant, or one whose target text no longer exists, fails the run. A pass means every listed mutant is killed. It does not prove that every branch of the lint is tested, only the conditions on the list.

## License

MIT.
