/**
 * Lint every TypeScript example in the skills. `npm run test:snippets`
 *
 * A skill is read by an agent and copied. An example that breaks a rule does not cause one bad test —
 * every session that loads the skill writes the same mistake, with the authority of "the skill said
 * so". The memory file has been held to the plugin's rules since it was written (memory-snippets);
 * the skills, which teach far more code, never were.
 *
 * What is linted: every ```ts / ```typescript block under .claude/skills/, with the plugin's smoke
 * config (all rules at error, the real tag whitelist). The run fails if no block is found at all,
 * because a parser that silently finds nothing would otherwise pass.
 *
 * What is NOT linted, by design — and how each exception stays visible:
 *  - Counter-examples, which teach by contrast and are meant to fail. A block is one when
 *      1. its own first comment line says so (❌, BAD, WRONG, FORBIDDEN, DON'T, AVOID), unless that
 *         line says GOOD / CORRECT / FIX / ✅, which wins; or
 *      2. the nearest prose line above it says so; or
 *      3. it sits directly under a label that says so — a heading or bold label starting with
 *         Bad / Wrong / Forbidden / Anti-pattern, or a ❌ bullet — with no neutral prose in
 *         between once another block has intervened. ("### Bad" then a block, then "The fix:" then a
 *         block: only the first is skipped.) Headings that merely contain such a word — "Bad request
 *         (400)", "Forbidden (403)", "Avoid flaky tests" — do not count.
 *  - Blocks marked `<!-- snippet-lint: skip — <reason> -->` on the line directly above the fence.
 *    The reason must be non-empty; em dash, en dash, hyphen or `--` are accepted. Every skip is
 *    printed with its reason on every run.
 *  - Inline `eslint-disable` comments are not hidden either: each suppressed finding is printed,
 *    and one without a `-- reason` fails the run.
 *  - Type checking. Snippets import modules that exist only in an adopting repository, so a real
 *    `tsc` run cannot resolve them. Syntax IS checked: the TypeScript parser must accept the block.
 *
 * How a snippet becomes lintable:
 *  - Fences follow CommonMark: three or more backticks or tildes, any info string after the
 *    language, closed by the same character at least as long. An unclosed fence fails the run.
 *  - Placeholders become identifiers: ALL-CAPS (`<RESOURCE>`, `<SUITE>`), lowercase or kebab
 *    (`<domain>`, `<base-url>`), a small set of PascalCase placeholder words (`<Resource>`,
 *    `<Entity>`…), and any `<Word>` glued to a following identifier (`Create<Resource>Schema`) or
 *    standing after a non-identifier (`/<id>`). A `<PascalType>` directly after an identifier is a
 *    real type argument and is left alone: `Promise<Job>`, `Partial<WorkerData>`, `test.extend<Pages>(`.
 *  - A fragment that does not parse on its own is retried inside a class body, then as object
 *    properties. Plain statements need no wrapper: the parser accepts top-level `await` and `return`.
 *  - A block written as a diff (`- old` / `+ new`) is linted as its "after" side.
 *  - The file name follows the block: a first-lines comment naming a path (`// config/env.ts`), a
 *    spec when it declares tests, a page object when it extends BasePage, a helper otherwise.
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

const LABEL_LINE = /^#{2,6} |^\s*\*\*[^*]+\*\*|^\s*(?:[-*] )?(?:❌|✅)/;

/**
 * Fenced ts/typescript blocks. Each carries:
 *   line    — the fence line (1-based)
 *   nearest — the nearest non-empty line above the fence, NOT crossing another fence ('' if none)
 *   label   — the nearest heading / bold label / ❌✅ line above, walking past earlier blocks
 *   crossed — whether that walk crossed another block (the label then belongs to a sibling first)
 * Throws on an unclosed fence: silently dropping the rest of a file is the failure this prevents.
 */
export function snippets(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let open = null; // { char, len, indent, lang, line, buf }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      const close = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[2][0] === open.char && close[2].length >= open.len) {
        if (/^(ts|typescript)$/.test(open.lang)) out.push({ line: open.line, code: open.buf.join('\n'), ...context(lines, open.line - 1) });
        open = null;
      } else {
        open.buf.push(line.replace(new RegExp(`^ {0,${open.indent}}`), ''));
      }
      continue;
    }
    const opener = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (opener) open = { char: opener[2][0], len: opener[2].length, indent: opener[1].length, lang: opener[3].toLowerCase(), line: i + 1, buf: [] };
  }
  if (open) throw new Error(`unclosed code fence opened at line ${open.line}`);
  return out;
}

/** The context above the fence at index `fenceIdx`. */
function context(lines, fenceIdx) {
  let nearest = '';
  for (let j = fenceIdx - 1; j >= 0; j--) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[j])) break;
    if (lines[j].trim()) {
      nearest = lines[j];
      break;
    }
  }
  let label = '';
  let crossed = false;
  let inFence = false;
  for (let j = fenceIdx - 1, n = 0; j >= 0 && n < 60; j--, n++) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[j])) {
      inFence = !inFence;
      crossed = true;
      continue;
    }
    if (inFence || !lines[j].trim()) continue;
    if (LABEL_LINE.test(lines[j])) {
      label = lines[j];
      break;
    }
  }
  return { nearest, label, crossed };
}

// A marker word at the start of a label, not merely somewhere in it: "Bad request (400)" and
// "Forbidden (403)" are HTTP status names, and "Avoid flaky tests" is advice, not a counter-example.
const WRONG_LABEL =
  /^\s*(?:#{2,6}\s*|\*\*\s*|[-*]\s*)?(?:❌|(?:Bad|Wrong|Forbidden|Anti-?patterns?)\b(?!\s+request\b|\s*\(\d{3}\)))/i;
const RIGHT_LABEL = /^\s*(?:#{2,6}\s*|\*\*\s*|[-*]\s*)?(?:✅|(?:Good|Correct|Fix|Fixed|Right|Do)\b)/i;
// Inside a comment line or a prose sentence, the markers may appear anywhere.
const WRONG_WORD = /❌|\b(?:BAD|WRONG|FORBIDDEN|DON'?T|AVOID)\b/;
const RIGHT_WORD = /✅|\b(?:GOOD|CORRECT|FIX|FIXED|RIGHT)\b/;

/** A counter-example — see the header for the three rules and their order. */
export function isCounterExample({ code, nearest, label, crossed }) {
  const first = code.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (/^\s*\/[/*]/.test(first)) {
    if (RIGHT_WORD.test(first)) return false;
    if (WRONG_WORD.test(first)) return true;
  }
  if (nearest && nearest !== label) {
    if (RIGHT_LABEL.test(nearest) || RIGHT_WORD.test(nearest)) return false;
    if (WRONG_LABEL.test(nearest) || WRONG_WORD.test(nearest)) return true;
    // Neutral prose after an earlier block: this block is introduced afresh, not by the label.
    if (crossed) return false;
  }
  // (No separate "label says Good" check: WRONG_LABEL only matches a label that STARTS with a Bad
  // word, and a label can't start with both — mutation testing showed that branch was unreachable.)
  return WRONG_LABEL.test(label);
}

/** `<!-- snippet-lint: skip — <reason> -->` on the line directly above the fence; the reason must be real. */
export function skipReason(nearest) {
  const m = /<!--\s*snippet-lint:\s*skip\s*(?:—|–|--|-)\s*(\S.*?)\s*-->/.exec(nearest ?? '');
  return m && /[\p{L}\p{N}]/u.test(m[1]) ? m[1] : null;
}

// PascalCase words the skills use as placeholders rather than types.
const PASCAL_PLACEHOLDER = /^(?:Resource|Resources|Entity|Discriminator|HumanReadable|Dependent|Referenced|Type|Name|Field|Flow)$/;

/** Placeholders → identifiers; real type arguments untouched. */
export function fillPlaceholders(code) {
  return code.replace(/<([A-Za-z][\w-]*)>(?=(\w)?)/g, (m, word, glued, offset, s) => {
    const afterIdentifier = /[\w$]/.test(s[offset - 1] ?? '');
    const builtinType = /^(?:void|string|number|boolean|bigint|symbol|object|unknown|never|any|null|undefined)$/.test(word);
    const placeholderWord =
      !builtinType &&
      (/-/.test(word) || /^[a-z]/.test(word) || (/^[A-Z][A-Z0-9_]+$/.test(word) && word.length > 1) || PASCAL_PLACEHOLDER.test(word));
    const typeArgument = afterIdentifier && glued === undefined && !placeholderWord;
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
  // `(?<![.\w$])` so a `/re/.test(x)` call is not mistaken for a test declaration.
  if (/(?<![.\w$])(?:test|it)(?:\.\w+)?\s*\(/.test(code)) return 'tests/app/api/snippet/snippet.spec.ts';
  if (/extends\s+BasePage\b/.test(code)) return 'pages/app/SnippetPage.ts';
  return 'helpers/app/snippet.ts';
}

// The smoke config, plus eslint-plugin-playwright registered (rules off): a snippet may carry an
// `eslint-disable` for one of its rules, and an unregistered rule in a directive is itself an error.
// Unused directives are not reported (the playwright rules are off here); suppressions are, below.
const { default: playwright } = await import('eslint-plugin-playwright');
// Per process, defensively: lintText never creates this folder, but parallel runs must not share a work dir.
const WORK_DIR = `.skill-snippets-${process.pid}`;
const eslint = new ESLint({
  cwd: PLUGIN_DIR,
  overrideConfigFile: 'smoke/eslint.config.mjs',
  overrideConfig: [
    { files: ['**/*.ts'], plugins: { playwright }, linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ],
});

async function lintAs(code, path) {
  const [r] = await eslint.lintText(code, { filePath: join(PLUGIN_DIR, WORK_DIR, path) });
  const msgs = r?.messages ?? [];
  return { fatal: msgs.find((m) => m.fatal), real: msgs.filter((m) => !m.fatal), suppressed: r?.suppressedMessages ?? [] };
}

/**
 * Lint as written; if it does not parse, retry as class members, then as object-literal
 * properties (a `headers: tokens.full(),` fragment). Line numbers are mapped back to the block.
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
    const { fatal, real, suppressed } = await lintAs(src, path);
    if (fatal) {
      firstFatal ??= fatal;
      continue;
    }
    const back = (m) => ({ ...m, line: m.line - shift });
    return { path, real: real.map(back), suppressed: suppressed.map(back) };
  }
  return { path, parse: firstFatal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(PLUGIN_DIR, WORK_DIR), { recursive: true });
  const report = { linted: 0, skipped: 0, marked: [], suppressed: [], parse: [], violations: [], errors: [] };
  for (const file of mdFiles(SKILLS)) {
    const rel = relative(join(SKILLS, '..', '..'), file).replace(/\\/g, '/');
    let blocks;
    try {
      blocks = snippets(readFileSync(file, 'utf8'));
    } catch (e) {
      report.errors.push(`${rel}  ${e.message}`);
      continue;
    }
    for (const block of blocks) {
      const reason = skipReason(block.nearest);
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
      if (res.parse) {
        report.parse.push(`${rel}:${block.line}  ${res.parse.message}`);
        continue;
      }
      for (const s of res.suppressed.filter((m) => m.ruleId?.startsWith('qa-constitution/'))) {
        const why = s.suppressions?.map((x) => x.justification).find((j) => j && j.trim());
        if (why) report.suppressed.push(`${rel}:${block.line} +${s.line}  ${s.ruleId}  — ${why}`);
        else report.violations.push(`${rel}:${block.line} +${s.line}  ${s.ruleId} suppressed by an eslint-disable with no "-- reason"`);
      }
      if (res.real.length)
        report.violations.push(
          `${rel}:${block.line} (as ${res.path})\n` +
            res.real.map((m) => `      +${m.line}  ${(m.ruleId ?? 'eslint').replace('qa-constitution/', '')} — ${m.message}`).join('\n')
        );
    }
  }
  rmSync(join(PLUGIN_DIR, WORK_DIR), { recursive: true, force: true });
  console.log(
    `\nSkill snippets — ${report.linted} linted, ${report.skipped} counter-examples skipped, ${report.marked.length} marked skip, ${report.suppressed.length} suppressed with a reason\n`
  );
  // Every opt-out stays visible: explicit skips and reasoned eslint-disables, every run.
  for (const m of report.marked) console.log(`  SKIP     ${m}`);
  for (const s of report.suppressed) console.log(`  DISABLED ${s}`);
  if (report.marked.length || report.suppressed.length) console.log('');
  for (const e of report.errors) console.log(`  FENCE    ${e}`);
  for (const p of report.parse) console.log(`  PARSE    ${p}`);
  for (const v of report.violations) console.log(`  VIOLATES ${v}`);
  // Fail when no block was FOUND at all (linted, skipped or marked): a fence parser that silently
  // finds nothing would otherwise pass. A tree whose blocks are all labelled counter-examples is fine.
  const found = report.linted + report.skipped + report.marked.length;
  if (found === 0) report.errors.push('no TypeScript block was linted — the fences were not found');
  const failed = report.errors.length + report.parse.length + report.violations.length;
  console.log('');
  if (failed) {
    if (found === 0) console.log('  no TypeScript block was linted — the fences were not found');
    console.log(`  ${failed} problem(s): skill snippets break the syntax or the rules the skills teach.`);
    process.exit(1);
  }
  console.log('  every skill snippet parses and complies with the constitution it teaches');
}
