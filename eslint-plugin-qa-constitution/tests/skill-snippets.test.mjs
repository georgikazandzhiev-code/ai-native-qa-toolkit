/**
 * Lint every TypeScript example in the skills. `npm run test:snippets`
 *
 * A skill is read by an agent and copied. An example that breaks a rule does not cause one bad test —
 * every session that loads the skill writes the same mistake, with the authority of "the skill said
 * so". The memory file has been held to the plugin's rules since it was written (memory-snippets);
 * the skills, which teach far more code, never were. #5 found ~60 contradictions between skills, and
 * many were examples that broke the rules their own skill states.
 *
 * What is linted: every ```ts / ```typescript block under .claude/skills/, with the plugin's smoke
 * config (all rules at error, the real tag whitelist).
 *
 * What is NOT linted, by design:
 *  - Counter-examples. A block whose first comment line, or the line just above the fence, marks it
 *    as wrong (❌, BAD, WRONG, FORBIDDEN, "Don't") teaches by contrast and is meant to fail.
 *  - Type checking. Snippets import modules that exist only in an adopting repository, so a real
 *    `tsc` run cannot resolve them. Syntax IS checked: the TypeScript parser must accept the block.
 *
 * How a snippet becomes lintable:
 *  - Placeholders (`<resource>`, `Create<Resource>Schema`, `/<id>`) become identifiers; generics
 *    (`Promise<void>`, `apiRequest<T>(`) are left alone.
 *  - A fragment that does not parse on its own is retried inside a class body, then as object
 *    properties — a class member or a `headers: …,` line is a legitimate example. Plain statements
 *    need no wrapper: the parser accepts top-level `await` and `return`. (A function-body wrapper
 *    existed and was removed when mutation testing showed no snippet ever needed it.)
 *  - A block that teaches by putting two files side by side (a page-object method, then its caller)
 *    cannot parse as one unit; it carries `<!-- snippet-lint: skip — <reason> -->` above the fence.
 *    The reason is required and every skip is printed on every run.
 *  - The file name matters to some rules: a block whose first line names its path (`// config/env.ts`)
 *    is linted as that path; a block that declares tests is a spec; one that extends BasePage is a
 *    page object; anything else is a helper.
 */

import { ESLint } from 'eslint';
import { readFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
// The skills tree to lint. Overridable (first argument) so the harness's own fault-injection suite
// can run it against a throwaway tree with one planted defect.
const SKILLS = process.argv[2] ?? fileURLToPath(new URL('../../.claude/skills', import.meta.url));

function mdFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? mdFiles(p) : f.endsWith('.md') ? [p] : [];
  });
}

/** Fenced ts/typescript blocks with the fence line and the nearest non-empty line above it. */
export function snippets(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let open = null;
  let buf = [];
  let above = '';
  let indent = 0; // a fence nested in a list item is indented; its content is indented the same
  for (let i = 0; i < lines.length; i++) {
    const fence = /^(\s*)```(\w*)\s*$/.exec(lines[i]);
    if (fence) {
      if (open === null) {
        indent = fence[1].length;
        open = /^(ts|typescript|tsx)$/.test(fence[2]) ? i + 1 : -1;
        buf = [];
        // The context that labels this block: walk back to the nearest heading, bold label or
        // ❌/✅ line, stopping at it (inclusive). Earlier code blocks are skipped over, because a
        // Bad block is often followed directly by its Good counterpart under one heading.
        const ctx = [];
        let inFence = false;
        for (let j = i - 1; j >= 0 && ctx.length < 40; j--) {
          if (/^\s*```/.test(lines[j])) {
            inFence = !inFence;
            continue;
          }
          if (inFence || !lines[j].trim()) continue;
          ctx.push(lines[j]);
          if (/^#{2,6} |^\s*\*\*[^*]+\*\*|^\s*(?:- )?(?:❌|✅)/.test(lines[j])) break;
        }
        above = ctx.join('\n');
      } else {
        if (open > 0) out.push({ line: open, code: buf.join('\n'), above });
        open = null;
      }
      continue;
    }
    if (open !== null) buf.push(lines[i].replace(new RegExp(`^ {0,${indent}}`), ''));
  }
  return out;
}

const WRONG = /❌|\bBAD\b|\bWRONG\b|\bFORBIDDEN\b|\bWrong\b|\bBad\b|\bForbidden\b|\bDon'?t\b|\bAvoid\b|[Aa]nti-pattern|\bSymptoms?\b/;
const RIGHT = /✅|\bGOOD\b|\bGood\b|\bCORRECT\b|\bCorrect\b|\bFIX\b|\bFix\b|\bRIGHT\b/;

/**
 * A counter-example is marked wrong. The block's own first comment line decides first (a
 * `// GOOD` block under an "Anti-patterns" heading is still a good example); otherwise the
 * nearest line above it, then the label it sits under (heading, bold label, ❌/✅ line).
 */
export function isCounterExample({ code, above }) {
  const first = code.split('\n').find((l) => l.trim()) ?? '';
  if (/^\s*\/[/*]/.test(first)) {
    if (RIGHT.test(first)) return false;
    if (WRONG.test(first)) return true;
  }
  const ctx = above.split('\n');
  for (const line of [ctx[0] ?? '', ctx.at(-1) ?? '']) {
    if (RIGHT.test(line)) return false;
    if (WRONG.test(line)) return true;
  }
  return false;
}

/** Type arguments the snippets really use — everything else in angle brackets is a placeholder. */
const GENERIC =
  /^(?:void|string|number|boolean|unknown|never|any|null|undefined|object|T|K|V|U|Locator|Page|Response|APIResponse|Record|Partial|Array|Promise)$|(?:Response|Request|Schema|Body|Payload|Options|Fixtures|Config|Result|Args|Entity)$/;

/** Placeholders → identifiers (`<resource>`, `Create<Resource>Schema`, `create<Resource>,`); generics untouched. */
export function fillPlaceholders(code) {
  return code.replace(/<([A-Za-z][\w-]*)>(?=(\w)?)/g, (m, word, glued, offset, s) => {
    const before = s[offset - 1] ?? '';
    const typeArgument = /[\w$]/.test(before) && glued === undefined && GENERIC.test(word);
    return typeArgument ? m : `X${word.replace(/-/g, '_')}`;
  });
}

/** A ```ts block written as a diff (`- old` / `+ new`) is linted as its "after" side. */
export function afterSideOfDiff(code) {
  const lines = code.split('\n').filter((l) => l.trim());
  const marked = lines.filter((l) => /^[+-] /.test(l)).length;
  if (marked === 0 || marked < lines.length / 2) return code;
  return code
    .split('\n')
    .filter((l) => !/^- /.test(l))
    .map((l) => l.replace(/^[+ ] /, ''))
    .join('\n');
}

/** The path a snippet is linted as. */
export function virtualPath(code) {
  const head = /^\s*\/\/\s*([\w./-]+\.(?:ts|mts))\b/m.exec(code.split('\n').slice(0, 3).join('\n'));
  if (head) return head[1];
  if (/\b(test|it)(\.\w+)?\s*\(/.test(code) || /test\.describe\s*\(/.test(code)) return 'tests/app/api/snippet/snippet.spec.ts';
  if (/extends\s+BasePage\b/.test(code)) return 'pages/app/SnippetPage.ts';
  return 'helpers/app/snippet.ts';
}

// The smoke config, plus eslint-plugin-playwright registered (rules off): a snippet may carry an
// `eslint-disable` for one of its rules, and an unregistered rule in a directive is itself an error.
const { default: playwright } = await import('eslint-plugin-playwright');
const eslint = new ESLint({
  cwd: PLUGIN_DIR,
  overrideConfigFile: 'smoke/eslint.config.mjs',
  overrideConfig: [
    { files: ['**/*.ts'], plugins: { playwright }, linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ],
});

/** `<!-- snippet-lint: skip — <reason> -->` on the line above the fence. The reason is required. */
export function skipReason(above) {
  const m = /<!--\s*snippet-lint:\s*skip\s*[—-]\s*(.+?)\s*-->/.exec(above.split('\n')[0] ?? '');
  return m ? m[1] : null;
}

async function lintAs(code, path) {
  const [r] = await eslint.lintText(code, { filePath: join(PLUGIN_DIR, '.skill-snippets', path) });
  const msgs = r?.messages ?? [];
  return { fatal: msgs.find((m) => m.fatal), real: msgs.filter((m) => !m.fatal) };
}

/**
 * Lint as written; if it does not parse, retry as class members, then as object-literal
 * properties (a `headers: tokens.full(),` fragment).
 */
export async function lintSnippet(code) {
  const filled = fillPlaceholders(afterSideOfDiff(code));
  const path = virtualPath(filled);
  const tries = [
    [filled, 0],
    [`class __Snippet {\n${filled}\n}`, 1],
    [`const __snippet = {\n${filled}\n};`, 1],
  ];
  let firstFatal = null;
  for (const [src, shift] of tries) {
    const { fatal, real } = await lintAs(src, path);
    if (fatal) {
      firstFatal ??= fatal;
      continue;
    }
    return { path, real: real.map((m) => ({ ...m, line: m.line - shift })) };
  }
  return { path, parse: firstFatal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(PLUGIN_DIR, '.skill-snippets'), { recursive: true });
  const report = { linted: 0, skipped: 0, marked: [], parse: [], violations: [] };
  for (const file of mdFiles(SKILLS)) {
    const rel = relative(join(SKILLS, '..', '..'), file).replace(/\\/g, '/');
    for (const block of snippets(readFileSync(file, 'utf8'))) {
      const reason = skipReason(block.above);
      if (reason) {
        report.marked.push(`${rel}:${block.line}  ${reason}`);
        continue;
      }
      if (isCounterExample(block)) {
        report.skipped++;
        continue;
      }
      report.linted++;
      const res = await lintSnippet(block.code);
      if (res.parse) report.parse.push(`${rel}:${block.line}  ${res.parse.message}`);
      else if (res.real.length)
        report.violations.push(
          `${rel}:${block.line} (as ${res.path})\n` +
            res.real.map((m) => `      +${m.line}  ${m.ruleId?.replace('qa-constitution/', '')} — ${m.message}`).join('\n')
        );
    }
  }
  rmSync(join(PLUGIN_DIR, '.skill-snippets'), { recursive: true, force: true });
  console.log(
    `\nSkill snippets — ${report.linted} linted, ${report.skipped} counter-examples skipped, ${report.marked.length} marked skip\n`
  );
  // Every explicit skip is printed with its reason, every run — an opt-out stays visible.
  for (const m of report.marked) console.log(`  SKIP     ${m}`);
  if (report.marked.length) console.log('');
  for (const p of report.parse) console.log(`  PARSE    ${p}`);
  for (const v of report.violations) console.log(`  VIOLATES ${v}`);
  const failed = report.parse.length + report.violations.length;
  console.log('');
  if (failed) {
    console.log(`  ${failed} snippet(s) in the skills break the syntax or the rules the skills teach.`);
    process.exit(1);
  }
  console.log('  every skill snippet parses and complies with the constitution it teaches');
}
