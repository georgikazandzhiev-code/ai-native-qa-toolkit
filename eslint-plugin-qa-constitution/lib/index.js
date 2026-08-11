/**
 * eslint-plugin-qa-constitution
 *
 * Turns the mechanically checkable half of the QA engineering constitution into
 * ESLint rules. Rules that require judgement (selector priority, coverage-plan
 * completeness, cleanup adequacy) are deliberately absent — see README § What this
 * cannot enforce. A rule here fires only when it can be certain, because a linter
 * that cries wolf gets disabled, and a disabled linter enforces nothing.
 */
'use strict';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Lifecycle hooks — setup/teardown, never a test. */
const HOOKS = new Set(['beforeAll', 'afterAll', 'beforeEach', 'afterEach']);

/** Playwright/Vitest test-declaring callees: test(), it(), test.only(), it.each()`...` */
function isTestCall(node) {
  if (node.type !== 'CallExpression') return false;
  let c = node.callee;
  // unwrap it.each(...)`tpl` and test.each([...])(...)
  if (c.type === 'CallExpression') c = c.callee;
  if (c.type === 'TaggedTemplateExpression') c = c.tag;
  while (c.type === 'MemberExpression') {
    const prop = c.property.name;
    // describe is NOT a test; skip/todo/fixme declare no runnable body we police
    if (prop === 'describe') return false;
    // Lifecycle hooks are setup/teardown, not tests. They carry no tag, and the
    // constitution explicitly REQUIRES seeding (and therefore branching) in them.
    if (HOOKS.has(prop)) return false;
    c = c.object;
  }
  return c.type === 'Identifier' && (c.name === 'test' || c.name === 'it');
}

function isDescribeCall(node) {
  if (node.type !== 'CallExpression') return false;
  let c = node.callee;
  while (c.type === 'MemberExpression') c = c.object;
  return c.type === 'Identifier' && c.name === 'describe';
}

/** True for a lifecycle hook call in either form: beforeAll(...) or test.beforeAll(...). */
function isHookCall(node) {
  if (node.type !== 'CallExpression') return false;
  const c = node.callee;
  if (c.type === 'Identifier') return HOOKS.has(c.name);
  if (c.type === 'MemberExpression') return HOOKS.has(c.property.name);
  return false;
}

/**
 * Nearest enclosing test() call, or null. Stops at a lifecycle hook: code inside
 * beforeAll/afterEach is setup, and setup is allowed to branch and to catch.
 */
function enclosingTest(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (isHookCall(n)) return null;
    if (isTestCall(n)) return n;
  }
  return null;
}

/** Flatten a member expression to dotted text: page.waitForTimeout -> "page.waitForTimeout" */
function memberPath(node) {
  const parts = [];
  let n = node;
  while (n && n.type === 'MemberExpression') {
    parts.unshift(n.property.name ?? n.property.value ?? '?');
    n = n.object;
  }
  if (n && n.type === 'Identifier') parts.unshift(n.name);
  else if (n && n.type === 'ThisExpression') parts.unshift('this');
  else if (n && n.type === 'CallExpression') parts.unshift('()');
  return parts.join('.');
}

function stringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) return node.quasis[0].value.cooked;
  return null;
}

const meta = (description, extra = {}) => ({
  type: 'problem',
  docs: { description, url: 'https://github.com/georgikazandzhiev-code/ai-native-qa-toolkit' },
  schema: extra.schema ?? [],
  messages: extra.messages,
  fixable: extra.fixable,
});

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

const rules = {};

/** MUST — Imports: spec files import test/expect from the fixtures barrel. */
rules['no-direct-playwright-import'] = {
  meta: meta('Import test/expect from the project fixtures barrel, never directly from @playwright/test in a spec file.', {
    messages: { direct: "Import '{{names}}' from the fixtures barrel ('{{barrel}}'), not from '@playwright/test'. Direct imports bypass fixture dependency injection." },
    schema: [{
      type: 'object',
      properties: {
        barrel: { type: 'string' },
        specPattern: { type: 'string' },
        guarded: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const barrel = opt.barrel ?? 'fixtures/pom/test-options';
    const specPattern = new RegExp(opt.specPattern ?? '\\.spec\\.ts$');
    const guarded = new Set(opt.guarded ?? ['test', 'expect']);
    const filename = context.filename ?? context.getFilename();
    if (!specPattern.test(filename.replace(/\\/g, '/'))) return {};
    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@playwright/test') return;
        const hit = node.specifiers
          .filter((s) => s.type === 'ImportSpecifier' && guarded.has(s.imported.name))
          .map((s) => s.imported.name);
        if (hit.length) {
          context.report({ node, messageId: 'direct', data: { names: hit.join(', '), barrel } });
        }
      },
    };
  },
};

/** WON'T — No XPath. */
rules['no-xpath'] = {
  meta: meta('Never use XPath locators; use the locator priority hierarchy.', {
    messages: { xpath: 'XPath locator is forbidden. Use getByRole / getByLabel / getByText, or a test-id as a last resort.' },
  }),
  create(context) {
    function check(node) {
      const v = stringValue(node);
      if (v === null) return;
      const s = v.trim();
      if (s.startsWith('xpath=') || s.startsWith('//') || s.startsWith('(//') || s.startsWith('./')) {
        context.report({ node, messageId: 'xpath' });
      }
    }
    return {
      CallExpression(node) {
        const path = node.callee.type === 'MemberExpression' ? memberPath(node.callee) : '';
        if (/\.locator$/.test(path) || path === 'locator') check(node.arguments[0]);
      },
    };
  },
};

/** WON'T — No hard waits. */
rules['no-hard-waits'] = {
  meta: meta('Never use waitForTimeout; web-first assertions auto-retry.', {
    messages: { hardWait: 'waitForTimeout is forbidden. Use a web-first assertion, waitForResponse for a known XHR, or expect.toPass for a genuinely flaky read.' },
  }),
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.property.name === 'waitForTimeout') {
          context.report({ node, messageId: 'hardWait' });
        }
      },
    };
  },
};

/** WON'T — No page.evaluate for DOM work. */
rules['no-page-evaluate'] = {
  meta: meta('Use Playwright locators rather than page.evaluate for DOM work.', {
    messages: { evaluate: '{{path}} is forbidden for DOM work. Use Playwright locators — they auto-wait and report properly on failure.' },
  }),
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const prop = node.callee.property.name;
        if (prop !== 'evaluate' && prop !== 'evaluateHandle' && prop !== '$$eval' && prop !== '$eval') return;
        const path = memberPath(node.callee);
        if (/^(page|frame|locator|this\.page)\b/.test(path) || /\.(page|locator)\.[a-zA-Z$]+$/.test(path)) {
          context.report({ node, messageId: 'evaluate', data: { path } });
        }
      },
    };
  },
};

/** MUST — Tags: exactly one per test(), never on describe(). */
rules['single-tag-on-test'] = {
  meta: meta('Exactly one tag per test(); never tag a describe block.', {
    messages: {
      onDescribe: 'Tags belong on test(), never on describe(). Move "{{tag}}" to each test.',
      none: 'This test has no tag. Every test carries exactly one tag from the whitelist.',
      many: 'This test has {{count}} tags ({{tags}}). Exactly one is allowed.',
      notWhitelisted: 'Tag "{{tag}}" is not in the whitelist: {{whitelist}}.',
    },
    schema: [{
      type: 'object',
      properties: { whitelist: { type: 'array', items: { type: 'string' } }, requireTag: { type: 'boolean' } },
      additionalProperties: false,
    }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const whitelist = opt.whitelist ?? [];
    const requireTag = opt.requireTag !== false;

    /** Tags come from the title string (@Foo) and/or the `tag` option. */
    function tagsOf(node) {
      const found = [];
      const title = stringValue(node.arguments[0]);
      if (title) for (const m of title.matchAll(/@[\w-]+/g)) found.push(m[0]);
      for (const arg of node.arguments.slice(1)) {
        if (arg.type !== 'ObjectExpression') continue;
        for (const p of arg.properties) {
          if (p.type !== 'Property' || (p.key.name ?? p.key.value) !== 'tag') continue;
          const one = stringValue(p.value);
          if (one) found.push(one);
          if (p.value.type === 'ArrayExpression') {
            for (const el of p.value.elements) {
              const s = stringValue(el);
              if (s) found.push(s);
            }
          }
        }
      }
      return found;
    }

    return {
      CallExpression(node) {
        if (isDescribeCall(node)) {
          const t = tagsOf(node);
          if (t.length) context.report({ node: node.arguments[0] ?? node, messageId: 'onDescribe', data: { tag: t[0] } });
          return;
        }
        if (!isTestCall(node)) return;
        if (enclosingTest(node)) return; // nested helper call, not a declaration
        const t = tagsOf(node);
        if (t.length === 0) {
          if (requireTag) context.report({ node: node.arguments[0] ?? node, messageId: 'none' });
          return;
        }
        if (t.length > 1) {
          context.report({ node: node.arguments[0] ?? node, messageId: 'many', data: { count: t.length, tags: t.join(', ') } });
          return;
        }
        if (whitelist.length && !whitelist.includes(t[0])) {
          context.report({ node: node.arguments[0] ?? node, messageId: 'notWhitelisted', data: { tag: t[0], whitelist: whitelist.join(', ') } });
        }
      },
    };
  },
};

/** WON'T — No conditional logic inside a test body. */
rules['no-conditional-in-test'] = {
  meta: meta('No if/else, ternary, logical short-circuit or test.skip inside a test body; seed preconditions in setup.', {
    messages: {
      conditional: '{{kind}} inside a test body is forbidden — it steers around missing data and produces a false green. Seed the precondition in beforeAll/beforeEach.',
      skip: 'test.skip() inside a test body is forbidden. A skip gives a false green and corrupts test-management signal. Comment the block out with a // TODO: FIXME: <TICKET> marker instead.',
    },
  }),
  create(context) {
    return {
      IfStatement(node) {
        if (enclosingTest(node)) context.report({ node, messageId: 'conditional', data: { kind: 'An if statement' } });
      },
      ConditionalExpression(node) {
        if (!enclosingTest(node)) return;
        // A ternary used to SHAPE a value — an object property, a call argument, a
        // template placeholder — is data construction, not conditional test logic.
        // The rule targets control flow that steers around missing state, e.g.
        // `const x = maybe ? await create() : existing;` at statement level.
        const p = node.parent;
        const shaping =
          (p.type === 'Property' && p.value === node) ||
          (p.type === 'CallExpression' && p.arguments.includes(node)) ||
          p.type === 'TemplateLiteral' ||
          (p.type === 'ArrayExpression');
        if (shaping) return;
        context.report({ node, messageId: 'conditional', data: { kind: 'A ternary' } });
      },
      SwitchStatement(node) {
        if (enclosingTest(node)) context.report({ node, messageId: 'conditional', data: { kind: 'A switch statement' } });
      },
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const path = memberPath(node.callee);
        if (path !== 'test.skip' && path !== 'it.skip') return;
        // test.skip() as a declaration modifier is a different (also discouraged) thing;
        // only the in-body imperative form is reported here.
        if (enclosingTest(node)) context.report({ node, messageId: 'skip' });
      },
    };
  },
};

/** WON'T — No try/catch in tests, except to capture a leaked resource id for cleanup. */
rules['no-try-catch-in-test'] = {
  meta: meta('Let assertions throw; the only sanctioned try/catch captures an accidentally created resource id for cleanup.', {
    messages: { tryCatch: 'try/catch inside a test body suppresses failures. Let the assertion throw. The one exception — capturing an accidentally created resource id for cleanup — must be marked with a "{{marker}}" comment.' },
    schema: [{ type: 'object', properties: { allowComment: { type: 'string' } }, additionalProperties: false }],
  }),
  create(context) {
    const marker = context.options[0]?.allowComment ?? 'eslint-allow-cleanup-capture';
    const src = context.sourceCode ?? context.getSourceCode();
    return {
      TryStatement(node) {
        if (!enclosingTest(node)) return;
        const before = src.getCommentsBefore(node).map((c) => c.value).join(' ');
        const inside = src.getCommentsInside(node).map((c) => c.value).join(' ');
        if ((before + ' ' + inside).includes(marker)) return;
        context.report({ node, messageId: 'tryCatch', data: { marker } });
      },
    };
  },
};

/** WON'T — No await expect(...).not.toThrow(). */
rules['no-not-tothrow'] = {
  meta: meta('Do not assert .not.toThrow(); just call the function.', {
    messages: { notToThrow: 'expect(...).not.toThrow() asserts nothing useful — if the call throws, the test already fails. Call the function directly.' },
  }),
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const p = memberPath(node.callee);
        if (/\.not\.(toThrow|toThrowError|rejects)$/.test(p)) {
          context.report({ node, messageId: 'notToThrow' });
        }
      },
    };
  },
};

/** MUST — Schemas: new Zod object schemas use z.strictObject. */
rules['require-strict-object'] = {
  meta: meta('Declare Zod object schemas with z.strictObject so an unexpected response field fails the test.', {
    messages: { loose: 'Use z.strictObject() instead of z.object(). A loose schema accepts extra fields, so a changed response shape passes silently.' },
    fixable: 'code',
  }),
  create(context) {
    const src = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        if (memberPath(node.callee) !== 'z.object') return;
        context.report({
          node: node.callee,
          messageId: 'loose',
          fix: (fixer) => fixer.replaceText(node.callee.property, 'strictObject'),
        });
      },
    };
  },
};

/** MUST — Response Validation: a Schema.parse(body) result is asserted, not discarded. */
rules['schema-parse-idiom'] = {
  meta: meta('Wrap a schema parse in the canonical assertion: expect(Schema.parse(body)).toBeTruthy().', {
    messages: { bare: 'A bare {{name}}.parse(...) result is discarded. Use the canonical idiom: expect({{name}}.parse(body)).toBeTruthy();' },
  }),
  create(context) {
    /**
     * Is this parse() call an argument of an expect-family call that ends in .toBeTruthy()?
     * Accepts expect(...), and the soft/poll variants: a negative-case loop uses
     * `expect.soft(Schema.parse(body), label).toBeTruthy()` so one bad input does not
     * abort the remaining iterations. Rejecting that form was a rule defect caught by
     * the lint-gate eval on 2026-08-11.
     */
    function insideExpectToBeTruthy(node) {
      const call = node.parent;
      if (!call || call.type !== 'CallExpression') return false;
      const cal = call.callee;
      const isExpectFamily =
        (cal.type === 'Identifier' && cal.name === 'expect') ||
        (cal.type === 'MemberExpression' &&
          cal.object.type === 'Identifier' &&
          cal.object.name === 'expect' &&
          ['soft', 'poll'].includes(cal.property.name));
      if (!isExpectFamily) return false;
      // walk out to find .toBeTruthy on the expect chain
      for (let n = call.parent; n; n = n.parent) {
        if (n.type === 'MemberExpression') {
          if (n.property.name === 'toBeTruthy') return true;
          continue;
        }
        if (n.type === 'CallExpression') continue;
        break;
      }
      return false;
    }
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.property.name !== 'parse') return;
        const obj = node.callee.object;
        // only flag SchemaName.parse(...) — PascalCase identifier, the project convention
        if (obj.type !== 'Identifier' || !/^[A-Z]/.test(obj.name)) return;
        if (insideExpectToBeTruthy(node)) return;
        // assigning the parsed value is a legitimate different intent
        if (node.parent && (node.parent.type === 'VariableDeclarator' || node.parent.type === 'AssignmentExpression')) return;
        context.report({ node, messageId: 'bare', data: { name: obj.name } });
      },
    };
  },
};

/** WON'T — No JSDoc on locator getters. */
rules['no-jsdoc-on-locator-getter'] = {
  meta: meta('JSDoc belongs on action methods; a locator getter needs none.', {
    messages: { jsdoc: 'Remove the JSDoc from locator getter "{{name}}". A comment restating what the locator returns is noise; JSDoc belongs on action methods.' },
  }),
  create(context) {
    const src = context.sourceCode ?? context.getSourceCode();
    return {
      MethodDefinition(node) {
        if (node.kind !== 'get') return;
        const text = src.getText(node.value);
        // only locator getters: body returns a Playwright locator chain
        if (!/\b(getBy[A-Z]\w*|locator|frameLocator)\s*\(/.test(text)) return;
        const hasJsdoc = src.getCommentsBefore(node).some((c) => c.type === 'Block' && c.value.startsWith('*'));
        if (hasJsdoc) {
          context.report({ node: node.key, messageId: 'jsdoc', data: { name: node.key.name ?? '(computed)' } });
        }
      },
    };
  },
};

/** MUST — Dependency Injection: no page-object instantiation inside a test. */
rules['no-pom-instantiation-in-test'] = {
  meta: meta('Inject page objects and API clients through fixtures; never instantiate them inside a test.', {
    messages: { instantiate: 'Do not instantiate {{name}} inside a test. Register it as a fixture and inject it, so setup stays uniform and the object is disposed with the test.' },
    schema: [{ type: 'object', properties: { pattern: { type: 'string' } }, additionalProperties: false }],
  }),
  create(context) {
    const re = new RegExp(context.options[0]?.pattern ?? '(Page|Component|Client|ApiClient)$');
    return {
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || !re.test(node.callee.name)) return;
        if (!enclosingTest(node)) return;
        context.report({ node, messageId: 'instantiate', data: { name: node.callee.name } });
      },
    };
  },
};

/** MUST — Sources of Truth: process.env access uses the non-null idiom. */
rules['require-env-non-null'] = {
  meta: meta('Access process.env.X with the project non-null idiom rather than defaulting at the call site.', {
    messages: {
      bare: "process.env.{{key}} is possibly undefined here. Use the project idiom process.env.{{key}}! so a missing variable fails loudly at startup.",
      defaulted: "Do not default process.env.{{key}} at the call site with ?? or ||. Defaults belong in the config module; a silent fallback hides a misconfigured environment.",
    },
  }),
  create(context) {
    return {
      MemberExpression(node) {
        if (memberPath(node.object) !== 'process.env') return;
        const key = node.property.name ?? node.property.value ?? 'X';
        const p = node.parent;
        if (!p) return;
        if (p.type === 'TSNonNullExpression') return;
        if (p.type === 'LogicalExpression' && ['??', '||'].includes(p.operator) && p.left === node) {
          context.report({ node, messageId: 'defaulted', data: { key } });
          return;
        }
        // `in` checks and typeof guards are legitimate presence tests
        if (p.type === 'BinaryExpression' || p.type === 'UnaryExpression') return;
        context.report({ node, messageId: 'bare', data: { key } });
      },
    };
  },
};

/** WON'T — No silent coverage drops: a commented-out test carries a ticket marker. */
rules['commented-test-needs-ticket'] = {
  meta: meta('A commented-out test must carry a TODO/FIXME ticket marker so the coverage gap stays visible.', {
    messages: { noTicket: 'This commented-out test has no ticket marker. Annotate it "// TODO: FIXME: <TICKET>" so the dropped coverage is tracked, or delete it.' },
    schema: [{ type: 'object', properties: { markers: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
  }),
  create(context) {
    const markers = context.options[0]?.markers ?? ['TODO', 'FIXME', 'BUG'];
    const src = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        const comments = src.getAllComments();
        // group consecutive line comments into blocks so the marker may sit on any line
        const blocks = [];
        let cur = null;
        for (const c of comments) {
          if (cur && c.type === 'Line' && cur.type === 'Line' && c.loc.start.line === cur.endLine + 1) {
            cur.text += '\n' + c.value;
            cur.endLine = c.loc.end.line;
            continue;
          }
          cur = { node: c, type: c.type, text: c.value, endLine: c.loc.end.line };
          blocks.push(cur);
        }
        for (const b of blocks) {
          if (!/^\s*(await\s+)?(test|it)\s*(\.\w+)?\s*\(/m.test(b.text)) continue;
          if (markers.some((m) => b.text.includes(m))) continue;
          context.report({ node: b.node, messageId: 'noTicket' });
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// configs
// ---------------------------------------------------------------------------

const plugin = { meta: { name: 'eslint-plugin-qa-constitution', version: '0.1.0' }, rules };

/** Every rule at error, plus the core/TS rules the constitution also mandates. */
const all = Object.fromEntries(Object.keys(rules).map((r) => [`qa-constitution/${r}`, 'error']));

plugin.configs = {
  /** Flat config, recommended: the plugin's own rules only. */
  recommended: {
    plugins: { 'qa-constitution': plugin },
    rules: all,
  },
  /**
   * Flat config, strict: adds the core and typescript-eslint rules that cover the
   * remaining lintable constitution items (no any, no ts-ignore, no console).
   * Requires @typescript-eslint/eslint-plugin to be configured by the consumer.
   */
  strict: {
    plugins: { 'qa-constitution': plugin },
    rules: {
      ...all,
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
};

module.exports = plugin;
