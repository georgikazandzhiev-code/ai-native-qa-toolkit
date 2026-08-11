/**
 * Lint every code snippet in the learned-patterns memory file. `npm run test:memory`
 *
 * The memory file is read at the start of every session, by both Claude Code and Cursor, and its
 * whole purpose is to teach. A bad pattern recorded in it does not cause one bad test — it teaches
 * every future session to write bad tests, and it carries the authority of "we learned this".
 *
 * That is not hypothetical. Two of the three snippets in the first draft of that file violated the
 * constitution: a `waitFor({ state: 'visible' })` immediately followed by the web-first assertion
 * that already waits, and a `waitForResponse` registered after the click that triggers the request.
 * Both read as expert advice. Both were wrong.
 *
 * So the memory file is held to the same 16 rules the test suite is held to. Commented-out lines
 * survive as counter-examples on purpose — a `// ❌ await page.waitForTimeout(2000)` teaches by
 * contrast and is not code. Anything not commented out is code, and code is linted.
 */

import { ESLint } from 'eslint';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
const MEMORY = fileURLToPath(new URL('../../.claude/memories/learned_patterns.md', import.meta.url));

const text = readFileSync(MEMORY, 'utf8');

/** Fenced ts/typescript blocks, with the line the fence opened on. */
function snippets(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let open = null;
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = /^```(\w*)\s*$/.exec(lines[i]);
    if (fence) {
      if (open === null) {
        open = /^(ts|typescript|tsx)$/.test(fence[1]) ? i + 1 : -1;
        buf = [];
      } else {
        if (open > 0) out.push({ line: open, code: buf.join('\n') });
        open = null;
      }
      continue;
    }
    if (open !== null) buf.push(lines[i]);
  }
  return out;
}

const blocks = snippets(text);
if (blocks.length === 0) {
  console.log('');
  console.log('  No ts snippets in the memory file — nothing to lint.');
  console.log('  If that is unexpected, the fences are not tagged `ts`.');
  process.exit(0);
}

// Inside the plugin directory, not the OS temp dir: ESLint refuses to lint a path outside its
// base path, and the refusal arrives as a message rather than an error — so the first version of
// this file reported "File ignored because outside of base path" as two rule violations.
const dir = join(PLUGIN_DIR, '.memory-snippets');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const eslint = new ESLint({
  cwd: PLUGIN_DIR,
  overrideConfigFile: 'smoke/eslint.config.mjs',
});

let failed = 0;
console.log('');
console.log(`Memory snippets — ${blocks.length} block(s) in .claude/memories/learned_patterns.md`);
console.log('');

for (const [i, block] of blocks.entries()) {
  const file = join(dir, `snippet-${i + 1}.ts`);
  writeFileSync(file, block.code, 'utf8');
  const [result] = await eslint.lintText(block.code, { filePath: file });
  const real = (result?.messages ?? []).filter((m) => !m.fatal);
  const fatal = (result?.messages ?? []).filter((m) => m.fatal);

  if (fatal.length) {
    // A snippet that does not parse cannot be trusted as an example either.
    console.log(`  PARSE   line ${block.line}: ${fatal[0].message}`);
    failed++;
    continue;
  }
  if (real.length === 0) {
    console.log(`  OK      line ${block.line}`);
    continue;
  }
  failed++;
  console.log(`  VIOLATES line ${block.line}:`);
  for (const m of real) {
    console.log(`            +${m.line}  ${m.ruleId?.replace('qa-constitution/', '')} — ${m.message}`);
  }
}

rmSync(dir, { recursive: true, force: true });

console.log('');
if (failed) {
  console.log(`  ${failed} snippet(s) in the memory file break the rules the memory file teaches.`);
  console.log('  Fix the snippet, or comment it out and label it as the counter-example it is.');
  console.log('');
  process.exit(1);
}
console.log('  every snippet complies with the constitution it teaches');
