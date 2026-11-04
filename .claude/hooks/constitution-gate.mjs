#!/usr/bin/env node
/**
 * Constitution gate — the checkable half of the constitution, enforced when a file is written,
 * not only when CI lints it.
 *
 *   node .claude/hooks/constitution-gate.mjs write      PreToolUse hook on Write|Edit|MultiEdit|NotebookEdit
 *   node .claude/hooks/constitution-gate.mjs shell      PreToolUse hook on Bash|PowerShell
 *   node .claude/hooks/constitution-gate.mjs explored   run by a person, in the repository, after exploring the app
 *
 * Why it exists: the lint plugin refuses a violation at CI time, after the agent has written the
 * file, built on it and reported done. Refused at write time, the same violation costs one retry,
 * and the agent is told which rule it broke while the file is still in front of it.
 *
 * What each mode checks:
 *   write — three checks, in this order.
 *           1. Protected paths. The agent may not write `.claude/hooks/` (this gate, and the
 *              exploration record under `.claude/hooks/.state/`), `.claude/settings.json` or
 *              `.claude/settings.local.json`, in any repository: they decide what the agent is
 *              allowed to do, and an agent that may edit them may switch the gate off. A person
 *              edits them; a person who wants the agent to, starts Claude Code with
 *              QA_GATE_ALLOW_PROTECTED=1.
 *           2. Explore before generate. In a repository that uses the lint plugin, a NEW page object
 *              (`pages/app/`, `pages/util/`) or UI spec (`tests/app/e2e/`, `tests/app/functional/`)
 *              needs an exploration recorded for that repository in the last 240 minutes
 *              (QA_GATE_EXPLORE_MAX_AGE_MIN). Editing an existing file needs none.
 *           3. The lint plugin. In a repository that lists eslint-plugin-qa-constitution in its
 *              package.json, the file the tool call would produce is linted with the repository's
 *              own ESLint and config, and the call is denied when it adds a finding of the plugin's
 *              rules that the file did not already have. A violation already in the file does not
 *              block an unrelated edit: the drift table and CI deal with that one.
 *   shell — denies a command that writes a protected path (a redirect, cp, mv, rm, sed -i,
 *           Set-Content, …) or runs `constitution-gate.mjs explored`, which is a person's
 *           statement; and records an exploration when the command runs `npx playwright open`.
 *   explored — a person explored the app in their own terminal; this records it for the repository
 *           the command runs in.
 *
 * Honest limits: the shell check reads the command text, so a write it doesn't recognise (an
 * interpreter one-liner, an alias) gets through. The exploration record says that
 * `npx playwright open` was started for the repository, not that it reached the app or what was
 * seen there. Base classes and components under `pages/baseClasses/` need no exploration.
 *
 * It fails OPEN, like the alternatives gate. Unreadable input, no package.json, no ESLint in the
 * repository, a config that does not load, an Edit whose old text is not in the file: exit 0 and
 * stay out of the way. A gate that breaks a session over its own bug gets switched off, and a
 * switched-off gate enforces nothing. CI still lints everything this gate lets through.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const PLUGIN = 'eslint-plugin-qa-constitution';
const LINTED = /\.(?:[cm]?[jt]s|tsx)$/i;
const NEEDS_EXPLORATION = /^(?:pages\/(?:app|util)\/.+\.ts|tests\/app\/(?:e2e|functional)\/.+\.spec\.ts)$/;
const PROTECTED_PATH = /(?:^|\/)\.claude\/(?:hooks(?:\/|$)|settings(?:\.local)?\.json$)/i;
const PROTECTED_IN_COMMAND = /\.claude[\\/]+(?:hooks\b|settings(?:\.local)?\.json\b)/i;
const WRITE_COMMAND =
  /(?:^|[\s;&|({])(?:cp|mv|rm|rmdir|touch|tee|ln|chmod|chown|install|truncate|dd|sed\s+-\S*i\S*|perl\s+-\S*i\S*|Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Remove-Item|Copy-Item|Move-Item|Rename-Item|ni|del|erase|copy|move|ren|sc|ac|git\s+(?:checkout|restore|rm|mv))(?=\s)|\bwriteFile(?:Sync)?\b|\bWriteAll(?:Text|Lines|Bytes)\b/i;
// A redirect counts only when its target is the protected path: `grep … .claude/hooks/x 2>/dev/null` reads.
const REDIRECT_TO_PROTECTED = />{1,2}\s*["']?[^\s"'|;&<>]*\.claude[\\/]+(?:hooks\b|settings(?:\.local)?\.json\b)/i;
const EXPLORE_COMMAND = /\bplaywright(?:\.cmd)?["']?\s+open\b/i;
const FORGED_EXPLORATION = /constitution-gate(?:\.mjs)?["']?\s+explored\b/i;
const MAX_AGE_MIN = Number(process.env.QA_GATE_EXPLORE_MAX_AGE_MIN) || 240;
const STATE_DIR = process.env.QA_GATE_STATE_DIR || join(homedir(), '.claude', 'hooks', '.state');
const ALLOW_PROTECTED = process.env.QA_GATE_ALLOW_PROTECTED === '1';
const GATE = process.argv[1];

const PROTECTED_RULE =
  'Hook scripts, their exploration record and Claude Code settings decide what an agent may do, so an ' +
  'agent may not change them. Describe the change to the person, who makes it, or who starts Claude ' +
  'Code with QA_GATE_ALLOW_PROTECTED=1 to let the agent do it.';

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(''));
  });
}

const slash = (p) => p.split(sep).join('/').replace(/\\/g, '/');

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${reason} (constitution-gate)` },
    })
  );
}

/** The nearest folder at or above `dir` that holds a package.json, or null. */
function projectRoot(dir) {
  for (let d = resolve(dir); ; d = dirname(d)) {
    if (existsSync(join(d, 'package.json'))) return d;
    if (dirname(d) === d) return null;
  }
}

function usesPlugin(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return ['dependencies', 'devDependencies', 'optionalDependencies'].some((k) => pkg[k]?.[PLUGIN] !== undefined);
  } catch {
    return false;
  }
}

const stateFile = (root) => join(STATE_DIR, `explored-${createHash('sha256').update(slash(root).toLowerCase()).digest('hex').slice(0, 16)}.json`);

function recordExploration(root, by) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(stateFile(root), JSON.stringify({ root: slash(root), at: new Date().toISOString(), by }) + '\n');
}

/** Minutes since the last exploration recorded for `root`, or null when there is none. */
function explorationAge(root) {
  try {
    const at = Date.parse(JSON.parse(readFileSync(stateFile(root), 'utf8')).at);
    return Number.isNaN(at) ? null : (Date.now() - at) / 60000;
  } catch {
    return null;
  }
}

/** The text the tool call would leave in the file, or null when it can't be worked out here. */
function resultOf(tool, input, current) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null;
  const edits = tool === 'MultiEdit' ? input.edits : tool === 'Edit' ? [input] : null;
  if (!Array.isArray(edits)) return null;
  let text = current;
  // The agent sees a CRLF file with LF line ends, so its old text matches only once converted back.
  const crlf = (s) => (text.includes('\r\n') ? s.replace(/\r?\n/g, '\r\n') : s);
  for (const e of edits) {
    if (typeof e?.old_string !== 'string' || typeof e.new_string !== 'string') return null;
    if (e.old_string === '') {
      if (text !== '') return null;
      text = e.new_string;
      continue;
    }
    const [from, to] = text.includes(e.old_string) ? [e.old_string, e.new_string] : [crlf(e.old_string), crlf(e.new_string)];
    if (!text.includes(from)) return null;
    text = e.replace_all ? text.split(from).join(to) : text.replace(from, () => to);
  }
  return text;
}

/** Findings of the plugin's rules in `after` that `before` did not have, matched by rule and message. */
async function addedFindings(root, file, before, after) {
  const require = createRequire(join(root, 'package.json'));
  let eslintModule;
  try {
    eslintModule = require('eslint');
  } catch {
    return [];
  }
  const ESLint = eslintModule.loadESLint ? await eslintModule.loadESLint({ cwd: root }) : eslintModule.ESLint;
  const eslint = new ESLint({ cwd: root });
  if (await eslint.isPathIgnored(file)) return [];
  const config = await eslint.calculateConfigForFile(file);
  // The plugin is found by its own name, so a repository may register it under any prefix.
  const prefixes = Object.entries(config?.plugins ?? {})
    .filter(([, p]) => p?.meta?.name === PLUGIN)
    .map(([key]) => `${key}/`);
  if (!prefixes.length) return [];
  const findings = async (text) =>
    ((await eslint.lintText(text, { filePath: file, warnIgnored: false }))[0]?.messages ?? []).filter(
      (m) => m.ruleId && prefixes.some((p) => m.ruleId.startsWith(p))
    );
  const now = await findings(after);
  if (!now.length || !before) return now;
  const had = new Map();
  for (const m of await findings(before)) had.set(`${m.ruleId}\0${m.message}`, (had.get(`${m.ruleId}\0${m.message}`) ?? 0) + 1);
  return now.filter((m) => {
    const key = `${m.ruleId}\0${m.message}`;
    const left = had.get(key) ?? 0;
    if (left) had.set(key, left - 1);
    return !left;
  });
}

async function write(input) {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  const target = args.file_path ?? args.notebook_path;
  if (typeof target !== 'string' || !target) return;
  const file = resolve(input.cwd || process.cwd(), target);

  if (!ALLOW_PROTECTED && PROTECTED_PATH.test(slash(file))) {
    return deny(`${target} is a protected path. ${PROTECTED_RULE}`);
  }
  if (tool === 'NotebookEdit') return;

  const root = projectRoot(dirname(file));
  if (!root || !usesPlugin(root)) return;
  const rel = slash(relative(root, file));
  const isNew = !existsSync(file);

  if (isNew && NEEDS_EXPLORATION.test(rel)) {
    const age = explorationAge(root);
    if (age === null || age > MAX_AGE_MIN) {
      return deny(
        `${rel} is a new page object or UI spec, and no exploration of the live app is recorded for this ` +
          `repository in the last ${MAX_AGE_MIN} minutes. Constitution § Explore Before Generate: explore with ` +
          '`npx playwright open` per the playwright-cli skill first; running it through the shell tool records ' +
          'the exploration. If the person explored the app in their own terminal, they record it by running ' +
          `\`node "${GATE}" explored\` in the repository. An agent may not run that.`
      );
    }
  }

  if (!LINTED.test(file)) return;
  const before = isNew ? '' : readFileSync(file, 'utf8');
  const after = resultOf(tool, args, before);
  if (after === null) return;
  const added = await addedFindings(root, file, before, after);
  if (!added.length) return;
  const list = added.map((m) => `  - ${m.ruleId} (line ${m.line}): ${m.message}`).join('\n');
  deny(
    `${rel}: this ${tool} adds ${added.length} finding${added.length === 1 ? '' : 's'} of the constitution's lint plugin:\n${list}\n` +
      'Fix the content, never the gate or the lint config: each rule is a constitution MUST or WON\'T, and the skill that owns it says how.'
  );
}

function shell(input) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return;
  if (!ALLOW_PROTECTED) {
    if (FORGED_EXPLORATION.test(command)) {
      return deny(
        '`constitution-gate.mjs explored` records that a person explored the app; an agent may not run it. ' +
          'Explore with `npx playwright open` per the playwright-cli skill, which records the exploration itself.'
      );
    }
    if (REDIRECT_TO_PROTECTED.test(command) || (PROTECTED_IN_COMMAND.test(command) && WRITE_COMMAND.test(command))) {
      return deny(`This command looks like it writes a protected path. ${PROTECTED_RULE}`);
    }
  }
  if (EXPLORE_COMMAND.test(command)) {
    const root = projectRoot(input.cwd || process.cwd());
    if (root) recordExploration(root, 'npx playwright open');
  }
}

function explored() {
  const root = projectRoot(process.argv[3] ?? process.cwd());
  if (!root) {
    process.stderr.write('constitution-gate: no package.json at or above this folder, so there is no repository to record\n');
    process.exit(1);
  }
  recordExploration(root, 'a person');
  process.stdout.write(`Exploration recorded for ${slash(root)}; a new page object or UI spec may be written for ${MAX_AGE_MIN} minutes.\n`);
}

const mode = process.argv[2];
if (mode === 'explored') {
  explored();
  process.exit(0);
}
let input;
try {
  input = JSON.parse(await readStdin());
} catch {
  process.exit(0);
}
try {
  if (mode === 'write') await write(input);
  else if (mode === 'shell') shell(input);
} catch (e) {
  process.stderr.write(`constitution-gate: ${e.message} — allowing\n`);
}
process.exit(0);
