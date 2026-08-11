# eslint-plugin-qa-constitution

Turns the mechanically checkable half of the [QA engineering constitution](../.claude/CLAUDE.md) into **14 enforceable ESLint rules**.

The rest of this toolkit is prose that an agent is asked to follow. This is the part a pipeline can refuse to merge. Governance without an enforcement mechanism is advice.

## Install

```bash
npm i -D eslint-plugin-qa-constitution
```

Flat config (`eslint.config.js`):

```js
import qa from 'eslint-plugin-qa-constitution';

export default [
  { files: ['tests/**/*.ts', 'pages/**/*.ts', 'fixtures/**/*.ts'], ...qa.configs.recommended },
];
```

`configs.strict` adds the core and typescript-eslint rules the constitution also mandates (`no-console`, `no-explicit-any`, `ban-ts-comment`) — it expects `@typescript-eslint/eslint-plugin` to be configured by you.

## The rules

| Rule | Constitution clause | Fires on |
|------|--------------------|----------|
| `no-direct-playwright-import` | MUST Imports | `import { test } from '@playwright/test'` in a spec file — bypasses fixture injection |
| `no-pom-instantiation-in-test` | MUST Dependency Injection | `new SettingsPage(page)` inside a test body |
| `single-tag-on-test` | MUST Tags | Zero tags, two tags, a non-whitelisted tag, or a tag on `describe()` |
| `require-strict-object` | MUST Schemas | `z.object(` — **autofixable** to `z.strictObject(` |
| `schema-parse-idiom` | MUST Response Validation | `Schema.parse(body)` whose result is discarded instead of asserted |
| `require-env-non-null` | MUST Sources of Truth | `process.env.X` without `!`, or defaulted at the call site with `??` / `\|\|` |
| `no-xpath` | WON'T No XPath | `locator('//…')`, `locator('xpath=…')`, `locator('(//…')` |
| `no-hard-waits` | WON'T No hard waits | `waitForTimeout(…)` |
| `no-page-evaluate` | WON'T No page.evaluate | `page.evaluate`, `$eval`, `$$eval` for DOM work |
| `no-conditional-in-test` | WON'T No conditional test logic | `if` / ternary / `switch` / `test.skip()` inside a test body |
| `no-try-catch-in-test` | WON'T No try/catch in tests | `try` in a test body, unless marked with the cleanup-capture comment |
| `no-not-tothrow` | WON'T No `.not.toThrow()` | `expect(…).not.toThrow()` / `.not.rejects` |
| `no-jsdoc-on-locator-getter` | WON'T No JSDoc on locator getters | JSDoc above a `get` accessor returning a locator chain |
| `commented-test-needs-ticket` | WON'T No silent coverage drops | A commented-out `test(` block with no `TODO` / `FIXME` / `BUG` marker |

### Options worth setting

```js
rules: {
  'qa-constitution/no-direct-playwright-import': ['error', {
    barrel: 'fixtures/pom/test-options',   // your barrel path, for the message
    specPattern: '\\.spec\\.ts$',          // which files count as specs
  }],
  'qa-constitution/single-tag-on-test': ['error', {
    whitelist: ['@App-Critical', '@App-regression', '@smoke'],  // your tag whitelist
  }],
  'qa-constitution/no-pom-instantiation-in-test': ['error', {
    pattern: '(Page|Component|Client)$',   // what counts as an injectable
  }],
}
```

`single-tag-on-test` with no `whitelist` still enforces *exactly one* tag; add the whitelist to also enforce which ones.

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
  run: npx eslint "tests/**/*.ts" "pages/**/*.ts" --max-warnings 0
```

Pair it with branch protection so a violation blocks the merge rather than merely annotating it. Without the gate this plugin is a suggestion box.

## Tests

14 rules, 14 `RuleTester` suites, 29 invalid-case assertions plus valid cases per rule:

```bash
npm test
```

The suite has been **fault-injected to prove it bites** — disabling a rule's report produces `Should have 1 error but had 0`, and corrupting the `require-strict-object` autofix produces `Output is incorrect`. A green run means the rules fire, not merely that the file parses.

## License

MIT.
