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

// Playwright configuration calls on `test`: they declare no test, so they carry no tag and no
// assertion. Without this, a describe-level `test.setTimeout(...)` or `test.use(...)` was reported
// as "This test has no tag" — a false alarm on correct code.
// `step` belongs here too: `test.step(...)` groups work inside a test or hook and declares no test.
// Inside a test it was hidden (enclosingTest skips it), but a step in a beforeAll was reported as an
// untagged, assertion-free test — found by the skill-snippet lint, October 2026.
const CONFIG_CALLS = new Set(['setTimeout', 'use', 'slow', 'info', 'extend', 'step']);

// Calls that disable a test: test.skip / test.fixme / test.fail, in declaration or modifier form,
// and the same on describe. They are reported by no-disabled-test, so they are not tests to the
// other rules — otherwise a describe-level `test.fixme(true, '...')` was reported as "no tag",
// which sends the author to fix the wrong thing.
const DISABLE_CALLS = new Set(['skip', 'fixme', 'fail']);

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
    if (CONFIG_CALLS.has(prop)) return false;
    if (DISABLE_CALLS.has(prop)) return false;
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

/** A Playwright setup file (`<name>.setup.ts`): it declares setup steps with test(), but they are not tests. */
function isSetupFile(context) {
  return /\.setup\.[cm]?ts$/.test(context.filename ?? context.getFilename());
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

/**
 * The toolkit's tag taxonomy (`test-standards` § Tag taxonomy). A test carries exactly one type tag,
 * which says what it is, and any suite or trait tags it needs, which say which runs include it and
 * what it is like. CI jobs select tests with tag expressions, so the categories, not the job names,
 * define the tags. A repo or an organisation plugin extends a category through the `categories`
 * option; it never replaces the type tags.
 */
const STANDARD_TAGS = {
  type: ['@api', '@functional', '@e2e', '@integration'],
  suite: ['@smoke', '@sanity', '@regression'],
  trait: ['@critical', '@slow'],
};

/**
 * MUST — Tags. The id predates composable tags and is kept so existing configs keep working.
 * Composable mode (the default, or `categories`): exactly one type tag, any declared suite and
 * trait tags, nothing undeclared, nothing twice. Single-tag mode (`whitelist`): exactly one tag
 * from the list — for a repo that kept its own set or is still on `@App-*`. Never on describe().
 */
rules['single-tag-on-test'] = {
  meta: meta('Tag every test() with one type tag plus any declared suite or trait tags (or, with a whitelist, exactly one tag); never tag a describe block.', {
    messages: {
      onDescribe: 'Tags belong on test(), never on describe(). Move "{{tag}}" to each test.',
      none: 'This test has no tag. {{need}}',
      many: 'This test has {{count}} tags ({{tags}}). Exactly one is allowed.',
      notWhitelisted: 'Tag "{{tag}}" is not in the whitelist: {{whitelist}}.',
      noType: 'This test has no type tag. It needs exactly one of {{types}}, next to {{tags}}.',
      manyTypes: 'This test has {{count}} type tags ({{tags}}). A test is exactly one type.',
      unknown: 'Tag "{{tag}}" is in no declared category. Declared: {{declared}}. Add it to the `categories` option (and the repo\'s tag list) first.',
      duplicate: 'Tag "{{tag}}" appears more than once on this test.',
    },
    schema: [{
      type: 'object',
      properties: {
        whitelist: { type: 'array', items: { type: 'string' } },
        // Extends the standard suite and trait categories; the type tags are fixed and not configurable.
        categories: {
          type: 'object',
          properties: {
            suite: { type: 'array', items: { type: 'string' } },
            trait: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        requireTag: { type: 'boolean' },
      },
      // A kept set's whitelist and the taxonomy's categories are two models; a config may choose one.
      not: { required: ['whitelist', 'categories'] },
      additionalProperties: false,
    }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const whitelist = opt.whitelist ?? [];
    const requireTag = opt.requireTag !== false;
    const single = whitelist.length > 0;
    const ext = opt.categories ?? {};
    const types = new Set(STANDARD_TAGS.type);
    const declared = new Set([...STANDARD_TAGS.type, ...STANDARD_TAGS.suite, ...STANDARD_TAGS.trait, ...(ext.suite ?? []), ...(ext.trait ?? [])]);
    const need = single
      ? 'Every test carries exactly one tag from the whitelist.'
      : `Every test carries exactly one type tag (${STANDARD_TAGS.type.join(', ')}), plus any suite or trait tags it needs.`;
    // A setup file (tests/app/<name>.setup.ts) runs in the setup project and carries no tag (test-standards).
    if (isSetupFile(context)) return {};

    /**
     * Tags come from the title string (@Foo) and/or the `tag` option. `dynamic` is true when the
     * title is a template literal with expressions, or the option holds something the rule cannot
     * read (a variable, a member, a spread); it only skips the missing-type check, and a test with no
     * readable tag is still reported as having none.
     */
    function tagsOf(node) {
      const found = [];
      let dynamic = false;
      const title = stringValue(node.arguments[0]);
      if (title) for (const m of title.matchAll(/@[\w-]+/g)) found.push(m[0]);
      // `@functional supports ${m}`: the type tag may sit in a part the rule cannot read.
      else if (node.arguments[0] && node.arguments[0].type === 'TemplateLiteral') dynamic = true;
      for (const arg of node.arguments.slice(1)) {
        if (arg.type !== 'ObjectExpression') continue;
        for (const p of arg.properties) {
          if (p.type !== 'Property' || (p.key.name ?? p.key.value) !== 'tag') continue;
          const one = stringValue(p.value);
          if (one) found.push(one);
          else if (p.value.type === 'ArrayExpression') {
            for (const el of p.value.elements) {
              const s = stringValue(el);
              if (s) found.push(s);
              else dynamic = true;
            }
          } else dynamic = true;
        }
      }
      return { found, dynamic };
    }

    return {
      CallExpression(node) {
        if (isDescribeCall(node)) {
          const { found: t } = tagsOf(node);
          if (t.length) context.report({ node: node.arguments[0] ?? node, messageId: 'onDescribe', data: { tag: t[0] } });
          return;
        }
        if (!isTestCall(node)) return;
        if (enclosingTest(node)) return; // nested helper call, not a declaration
        const { found: t, dynamic } = tagsOf(node);
        const at = node.arguments[0] ?? node;
        if (t.length === 0) {
          // A tag hoisted into a variable reads as no tag, as the api-testing templates say: keep tags inline.
          if (requireTag) context.report({ node: at, messageId: 'none', data: { need } });
          return;
        }
        if (single) {
          if (t.length > 1) {
            context.report({ node: at, messageId: 'many', data: { count: t.length, tags: t.join(', ') } });
            return;
          }
          if (!whitelist.includes(t[0])) {
            context.report({ node: at, messageId: 'notWhitelisted', data: { tag: t[0], whitelist: whitelist.join(', ') } });
          }
          return;
        }
        const seen = new Set();
        for (const tag of t) {
          if (seen.has(tag)) {
            context.report({ node: at, messageId: 'duplicate', data: { tag } });
            continue;
          }
          seen.add(tag);
          if (!declared.has(tag)) context.report({ node: at, messageId: 'unknown', data: { tag, declared: [...declared].join(', ') } });
        }
        const typed = [...seen].filter((tag) => types.has(tag));
        if (typed.length === 0) {
          // A tag the rule cannot read may be the type tag; say nothing rather than guess.
          if (!dynamic) context.report({ node: at, messageId: 'noType', data: { types: STANDARD_TAGS.type.join(', '), tags: [...seen].join(', ') } });
        } else if (typed.length > 1) {
          context.report({ node: at, messageId: 'manyTypes', data: { count: typed.length, tags: typed.join(', ') } });
        }
      },
    };
  },
};

/** WON'T — No conditional logic inside a test body. */
rules['no-conditional-in-test'] = {
  meta: meta('No if/else, switch, control-flow ternary or test.skip inside a test body; seed preconditions in setup.', {
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
    messages: {
      bare: 'A bare {{name}}.parse(...) result is discarded. Use the canonical idiom: expect({{name}}.parse(body)).toBeTruthy();',
      soft: 'expect.soft({{name}}.parse(body)) is not soft: parse throws a ZodError before expect.soft receives anything, so a negative-matrix loop still stops at the first bad response. Use expect.soft({{name}}.safeParse(body).success, label).toBe(true) — the constitution carve-out.',
      matcher: 'expect({{name}}.parse(body)) must end in .toBeTruthy() — the project idiom. Any other matcher asserts something about the parsed value instead of the parse, which the constitution already covers.',
    },
  }),
  create(context) {
    /**
     * Is the parse result DISCARDED — read by nobody?
     *
     * That is the whole defect this rule exists to catch: `Schema.parse(body);` as a statement
     * validates the shape and throws the proof away, so a changed response passes silently. Any
     * use of the value — asserted, assigned, returned, member-read, passed on — is a legitimate
     * intent and none of this rule's business.
     *
     * This replaced an allowlist of accepted parent node types, which was the wrong shape. It
     * accepted `const x = Schema.parse(b)` and `expect(Schema.parse(b)).toBeTruthy()` and
     * rejected everything else, so `Schema.parse(b).id` — a parse whose field is read on the
     * spot — was reported as discarded. The fault-injection harness caught that on its first run
     * against the compliant fixture, 2026-08-11. Two earlier defects in this same rule had the
     * same root cause: an allowlist only ever enumerates the forms its author thought of, and
     * every form it missed becomes a false positive on correct code.
     *
     * Note what this deliberately stops policing: whether the assertion wrapping the parse is
     * `.toBeTruthy()` rather than `.toEqual(...)`. The constitution's WON'T table already forbids
     * redundant assertions after a parse, so which matcher wraps a *used* value is a review
     * question, not a false-green one.
     */
    function isDiscarded(node) {
      let child = node;
      for (let p = node.parent; p; child = p, p = p.parent) {
        switch (p.type) {
          // Transparent wrappers — they do not consume the value themselves.
          case 'AwaitExpression':
          case 'ChainExpression':
          case 'TSNonNullExpression':
          case 'TSAsExpression':
          case 'TSSatisfiesExpression':
            continue;
          case 'ExpressionStatement':
            return true;
          case 'SequenceExpression':
            // Only the last element's value survives the comma operator.
            if (p.expressions[p.expressions.length - 1] !== child) return true;
            continue;
          default:
            return false;
        }
      }
      return false;
    }

    /** The expect(...) / expect.soft(...) / expect.poll(...) call this parse is a DIRECT argument of. */
    function expectFamilyWrapper(node) {
      const call = node.parent;
      if (!call || call.type !== 'CallExpression' || !call.arguments.includes(node)) return null;
      const c = call.callee;
      if (c.type === 'Identifier' && c.name === 'expect') return call;
      if (
        c.type === 'MemberExpression' &&
        c.object.type === 'Identifier' &&
        c.object.name === 'expect' &&
        ['soft', 'poll'].includes(c.property.name)
      ) {
        return call;
      }
      return null;
    }

    /** Does the assertion chain hanging off this call end in .toBeTruthy()? */
    function chainEndsInToBeTruthy(call) {
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

        // The false green: nobody reads the result.
        if (isDiscarded(node)) {
          context.report({ node, messageId: 'bare', data: { name: obj.name } });
          return;
        }

        // The house idiom: when the parse IS the asserted value, the matcher is toBeTruthy.
        // Note `expect(Schema.parse(body).name).toBe('x')` is not caught here and must not be —
        // there the asserted value is a property, which is a business assertion, not this parse.
        const wrapper = expectFamilyWrapper(node);
        // expect.soft(Schema.parse(body)) looks soft and is not: the parse throws first. This form
        // was accepted until 2026-10 — eval run 3 called it "the correct negative-loop form" — and
        // #5 PR 3 found it stops the loop it was written for.
        if (wrapper && wrapper.callee.type === 'MemberExpression' && wrapper.callee.property.name === 'soft') {
          context.report({ node, messageId: 'soft', data: { name: obj.name } });
          return;
        }
        if (wrapper && !chainEndsInToBeTruthy(wrapper)) {
          context.report({ node, messageId: 'matcher', data: { name: obj.name } });
        }
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

// ---------------------------------------------------------------------------
// The layout root, shared by the rules that read a file's place in the repo
// ---------------------------------------------------------------------------

/** A path with forward slashes and an upper-case drive letter, so `c:` and `C:` compare equal. */
const normPath = (p) => p.replace(/\\/g, '/').replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const nodePath = require('node:path');
const nodeFs = require('node:fs');
const FLAT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'];
const nearest = new Map();
/** The nearest folder at or above `dir` holding one of `names`, or null. Cached per folder and name list. */
function nearestHolding(dir, names) {
  const key = `${names[0]}|${dir}`;
  if (nearest.has(key)) return nearest.get(key);
  const parent = nodePath.dirname(dir);
  const found = names.some((n) => nodeFs.existsSync(nodePath.join(dir, n))) ? dir : parent === dir ? null : nearestHolding(parent, names);
  nearest.set(key, found);
  return found;
}
/** The repo root for a folder: its nearest ESLint flat config, else its nearest package.json, else null. */
const repoRootOf = (dir) => nearestHolding(dir, FLAT_CONFIGS) ?? nearestHolding(dir, ['package.json']);
/**
 * The file's path from the layout root, with forward slashes and no leading slash, or null when the
 * file sits outside it. The repo root is the nearest folder above the file that holds an ESLint flat
 * config (where the gate is configured), else a `package.json`, so the result does not depend on
 * where ESLint was started; with neither above the file, the working directory is the root. `root`
 * moves the start, absolute or relative to that repo root.
 */
function layoutPath(context, root) {
  const cwd = normPath(context.cwd ?? context.getCwd()).replace(/\/+$/, '');
  // The ESLint class and CLI pass absolute names; Linter#verify and RuleTester pass relative ones, or
  // <input> when there is none, read from the working directory.
  const file = normPath(nodePath.resolve(cwd, context.filename ?? context.getFilename()));
  const found = repoRootOf(nodePath.dirname(file));
  const base = found ? normPath(found) : cwd;
  const rootDir = root !== undefined ? normPath(nodePath.resolve(base, root)) : base;
  const prefix = `${rootDir.replace(/\/+$/, '')}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : null;
}

/**
 * MUST — Sources of Truth: only the config module reads process.env.
 *
 * Replaces `require-env-non-null` (#5): the `process.env.X!` idiom it enforced only silenced the
 * compiler — a missing variable still failed later, at the point of use — and its message claimed
 * otherwise. The approved design is that `config/env.ts` reads process.env once and validates it
 * with Zod at load, and everything else imports `env` / `tokens` / `appConfig`.
 *
 * Writes are not reads: the setup project assigns run-time tokens (`process.env.X = token`), so an
 * assignment target is allowed. Files matching `allow` (the config module, playwright.config.ts,
 * which must read ENVIRONMENT and CI from the shell) may read freely. `allow` is matched against the
 * path from the layout root (layoutPath), so only the top-level `config/` counts: a service folder
 * named `config`, or a checkout path that contains `/config/`, does not open the gate. A file
 * outside a declared `root` is not judged.
 */
rules['no-process-env-outside-config'] = {
  meta: meta('Read environment variables only in the config module; everything else imports env / tokens / appConfig.', {
    messages: {
      outside:
        'process.env{{key}} read outside the config module. Import it instead: env.X for a value known at start, tokens.x() for a run-time token, appConfig for URLs. config/env.ts reads process.env once and validates it at load, so a missing variable fails the run at startup.',
    },
    schema: [{ type: 'object', properties: { allow: { type: 'string' }, root: { type: 'string' } }, additionalProperties: false }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const allow = new RegExp(opt.allow ?? '^config/|^playwright\\.config\\.[cm]?[jt]s$');
    const rel = layoutPath(context, opt.root);
    if (rel === null || allow.test(rel)) return {};
    return {
      MemberExpression(node) {
        if (memberPath(node) !== 'process.env') return;
        // process.env.X = token — the setup project writing a run-time token is not a read.
        const p = node.parent;
        if (p && p.type === 'MemberExpression' && p.object === node) {
          const gp = p.parent;
          if (gp && gp.type === 'AssignmentExpression' && gp.left === p) return;
        }
        const key = p && p.type === 'MemberExpression' && p.object === node ? `.${p.property.name ?? p.property.value ?? 'X'}` : '';
        context.report({ node, messageId: 'outside', data: { key } });
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

/**
 * DoD § 2 — "The test contains clear semantic assertions. Empty runs or non-asserting
 * dry-runs are flagged as False-Green defects." This is the enforcement for that line.
 */
rules['require-assertion-in-test'] = {
  meta: meta('Every test must contain at least one assertion; a passing test that asserts nothing is a false green.', {
    messages: {
      none: 'This test contains no assertion. A test that runs without asserting is a false green — it proves the code executes, not that it is correct. Add an {{names}} on the behaviour the requirement describes.',
    },
    schema: [{
      type: 'object',
      properties: {
        assertFunctionNames: { type: 'array', items: { type: 'string' } },
        allowComment: { type: 'string' },
      },
      additionalProperties: false,
    }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const names = new Set(opt.assertFunctionNames ?? ['expect', 'assert']);
    const marker = opt.allowComment ?? 'eslint-asserts-via-helper';
    const src = context.sourceCode ?? context.getSourceCode();
    // A setup file produces storage state and tokens; it proves nothing, so it has nothing to assert.
    if (isSetupFile(context)) return {};

    /** expect(...), expect.soft(...), expect.poll(...), assert(...), this.expectX(...) */
    function isAssertion(node) {
      let c = node.callee;
      if (c.type === 'MemberExpression') {
        // walk to the root object: expect.soft(...) -> expect
        let root = c;
        while (root.type === 'MemberExpression') root = root.object;
        if (root.type === 'Identifier' && names.has(root.name)) return true;
        // a page-object assertion helper: page.expectSaved(), this.assertVisible()
        const prop = c.property.name ?? '';
        if (/^(expect|assert|verify)[A-Z]/.test(prop)) return true;
        return false;
      }
      return c.type === 'Identifier' && names.has(c.name);
    }

    return {
      CallExpression(node) {
        if (!isTestCall(node)) return;
        if (enclosingTest(node)) return; // a nested call, not a declaration
        const body = node.arguments.find((a) =>
          a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression');
        if (!body) return; // test.skip('title') and friends declare no body

        // opt-out for a test whose assertions genuinely live in a helper
        const cmts = [...src.getCommentsBefore(node), ...src.getCommentsInside(node)];
        if (cmts.some((c) => c.value.includes(marker))) return;

        let found = false;
        const walk = (n) => {
          if (found || !n || typeof n.type !== 'string') return;
          if (n.type === 'CallExpression' && isAssertion(n)) { found = true; return; }
          for (const k of Object.keys(n)) {
            if (k === 'parent') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === 'string' && walk(x));
            else if (v && typeof v.type === 'string') walk(v);
          }
        };
        walk(body.body);
        if (!found) {
          context.report({
            node: node.arguments[0] ?? node,
            messageId: 'none',
            data: { names: [...names].map((n) => n + '()').join(' / ') },
          });
        }
      },
    };
  },
};

/**
 * A swallowed exception anywhere — spec, helper or page object. Core `no-empty` permits a
 * catch containing only a comment; a comment does not re-throw, so this is stricter on purpose.
 */
rules['no-empty-catch'] = {
  meta: meta('Never swallow an exception; an empty catch hides the failure it caught.', {
    messages: {
      empty: 'This catch block swallows the exception. Either handle it, re-throw it, or let the call throw — a silent catch turns a failure into a false green.',
    },
  }),
  create(context) {
    return {
      CatchClause(node) {
        const stmts = node.body.body;
        if (stmts.length > 0) return;
        context.report({ node, messageId: 'empty' });
      },
    };
  },
};

/** WON'T — No silent coverage drops: a disabled test is commented out under one marker, never skipped. */
rules['no-disabled-test'] = {
  meta: meta('No test.skip / test.fixme / test.fail; comment the test out under // TODO: FIXME: <TICKET>.', {
    messages: {
      disabled: '{{path}}() disables a test, and a disabled test reads as green in the report and in test management. Comment the whole test(...) block out under // TODO: FIXME: <TICKET> and report the ticket.',
      fail: '{{path}}() keeps a known failure in the suite as a pass. Comment the whole test(...) block out under // TODO: FIXME: <TICKET> and report the bug — one marker for every disabled test, so one search finds them all.',
    },
  }),
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return;
        const path = memberPath(node.callee);
        const m = /^(?:test|it|describe)(?:\.describe)?\.(skip|fixme|fail)$/.exec(path);
        if (!m) return;
        // test.skip() inside a test body is no-conditional-in-test's report; don't say it twice.
        if (m[1] === 'skip' && enclosingTest(node)) return;
        context.report({ node, messageId: m[1] === 'fail' ? 'fail' : 'disabled', data: { path } });
      },
    };
  },
};

/**
 * Constitution § Standard repo layout and naming: a file of a kind the layout table lists sits in
 * its standard place, under its standard name. The rule judges only kinds it can identify for
 * certain — specs, setup files, fixtures, the barrel, page objects (a class extending a page base)
 * and k6 scripts. Helpers, enums, schemas and test data are not recognisable from one file, so
 * they are left alone rather than guessed at.
 *
 * Paths are read from the layout root (layoutPath, above): the nearest folder above the file that
 * holds an ESLint flat config, or failing that a `package.json`, so a k6 sub-project's own
 * package.json in tests/perf/ does not move it as long as the repo root holds an `eslint.config.*`. With `--config <other
 * name>`, or a config inside tests/perf/, the nearest package.json or config wins, so such a repo
 * sets `root` to its own folder. `root` sets where the layout starts, absolute or relative to
 * that repo root; a file outside it is not judged. The repo's
 * drift table goes in `drift`, relative to the root: a folder (`e2e/`) or a single file
 * (`auth.setup.ts`). An entry excuses a file that is out of place, and a misnamed file only when
 * its own path is listed — a file inside its standard folder is otherwise always judged, so
 * `drift: ['pages/']` cannot switch off `pages/app/`.
 * An area leaves the list the moment its move PR deletes the entry.
 */
const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** Vitest and node:test share the `*.test.ts` name, so one is a Playwright spec only when it imports Playwright or the barrel. */
const PLAYWRIGHT_SOURCE = /^@playwright\/test$|(?:^|\/)test-options(?:\.[cm]?[jt]s)?$/;
const importsPlaywright = (program) => program.body.some((n) => n.type === 'ImportDeclaration' && PLAYWRIGHT_SOURCE.test(String(n.source.value)));
rules['standard-layout'] = {
  meta: meta('Keep each file the layout standard recognises in its standard place, under its standard name.', {
    messages: {
      place: "{{kind}} belongs in {{where}} (constitution § Standard repo layout and naming). Move it there. Only a file that was already there when the repo adopted the toolkit may wait, listed on the drift table and in this rule's `drift` option.",
      name: '{{kind}} must be named {{pattern}} (constitution § Standard repo layout and naming).',
    },
    schema: [{
      type: 'object',
      properties: {
        root: { type: 'string' },
        drift: { type: 'array', items: { type: 'string' } },
        pageBases: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
  }),
  create(context) {
    const opt = context.options[0] ?? {};
    const rel = layoutPath(context, opt.root);
    if (rel === null) return {};
    const drift = (opt.drift ?? []).map((d) => d.replace(/\\/g, '/').replace(/^\.\//, ''));
    const onDrift = drift.some((d) => (d.endsWith('/') ? rel.startsWith(d) : rel === d || rel.startsWith(`${d}/`)));
    // A misnamed file inside its standard folder waits only when its own path is listed.
    const exactDrift = drift.includes(rel);
    const pageBases = new Set(opt.pageBases ?? ['BasePage', 'DataTableBase']);
    const base = rel.split('/').pop();

    function check(node, kind, where, placeRe, nameRe, pattern) {
      if (!placeRe.test(rel)) {
        if (!onDrift) context.report({ node, messageId: 'place', data: { kind, where } });
      } else if (nameRe && !nameRe.test(base) && !exactDrift) context.report({ node, messageId: 'name', data: { kind, pattern } });
    }

    return {
      Program(node) {
        if (/\.spec\.[cm]?ts$/.test(base) || (/\.test\.[cm]?ts$/.test(base) && importsPlaywright(node))) {
          check(node, 'A spec', '`tests/app/{api,e2e,functional}/<service>/`', /^tests\/app\/(?:api|e2e|functional)\/[^/]+\/(?:[^/]+\/)*[^/]+$/,
            new RegExp(`^${KEBAB}\\.spec\\.ts$`), '`kebab-case.spec.ts`');
        } else if (/\.setup\.[cm]?ts$/.test(base)) {
          check(node, 'A setup file', '`tests/app/`', /^tests\/app\/[^/]+$/, /\.setup\.ts$/, '`<name>.setup.ts`');
        } else if (base === 'test-options.ts') {
          check(node, 'The fixtures barrel', '`fixtures/pom/test-options.ts`', /^fixtures\/pom\/test-options\.ts$/);
        } else if (base.endsWith('-fixture.ts')) {
          check(node, 'A fixture', '`fixtures/pom/`, `fixtures/api/` or `fixtures/services/`', /^fixtures\/(?:pom|api|services)\/(?:[^/]+\/)*[^/]+$/,
            new RegExp(`^${KEBAB}-fixture\\.ts$`), '`kebab-case-fixture.ts`');
        }
      },
      ImportDeclaration(node) {
        // A page base imported under another name (`import { BasePage as Base }`) is still a page base.
        for (const s of node.specifiers) {
          if (s.type === 'ImportSpecifier' && pageBases.has(s.imported.name ?? s.imported.value)) pageBases.add(s.local.name);
        }
        const src = node.source.value;
        if (src !== 'k6' && !String(src).startsWith('k6/')) return;
        // A declaration file, or a file with only type imports from k6, uses k6's types; it is not a k6 script.
        if (base.endsWith('.d.ts')) return;
        // `import type {…}` and `import { type A, type B }` bring in only types.
        const typesOnly = (n) => n.importKind === 'type' || (n.specifiers.length > 0 && n.specifiers.every((s) => s.importKind === 'type'));
        const isK6 = (n) => n.type === 'ImportDeclaration' && !typesOnly(n) && (n.source.value === 'k6' || String(n.source.value).startsWith('k6/'));
        if (node !== node.parent.body.find(isK6)) return;
        check(node, 'A k6 load test', '`tests/perf/<test type>/` (shared helpers in `tests/perf/lib/`)', /^tests\/perf\/[^/]+\/(?:[^/]+\/)*[^/]+$/,
          new RegExp(`^${KEBAB}\\.ts$`), '`kebab-case.ts`');
      },
      'ClassDeclaration, ClassExpression'(node) {
        const sup = node.superClass;
        if (!sup || sup.type !== 'Identifier' || !pageBases.has(sup.name)) return;
        check(node, 'A page object', '`pages/app/`, `pages/util/` or `pages/baseClasses/`', /^pages\/(?:app|util|baseClasses)\/(?:[^/]+\/)*[^/]+$/,
          /^[A-Z][A-Za-z0-9]*\.ts$/, '`PascalCase.ts`');
      },
    };
  },
};

// ---------------------------------------------------------------------------
// configs
// ---------------------------------------------------------------------------

// Read from package.json so the two can't drift (they did: 0.2.0 here, 0.3.0 there).
const plugin = { meta: { name: 'eslint-plugin-qa-constitution', version: require('../package.json').version }, rules };

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
