#!/usr/bin/env node
/**
 * Alternatives gate — the constitution's "Alternatives, not questions" rule, enforced.
 *
 *   node .claude/hooks/alternatives-gate.mjs ask    PreToolUse hook on AskUserQuestion
 *   node .claude/hooks/alternatives-gate.mjs stop   Stop hook
 *
 * Why it exists: an agent left to work unattended came back with questions instead of work —
 * "one PR or two?", "approach A or B?" — and every one of them cost a round trip. The rule is
 * that when the task is clear but there are several ways to do it, the agent builds every way,
 * each on its own local `alt/<topic>/<option>` branch, and asks only which to keep.
 *
 * A question may still be asked when building cannot answer it. The agent then says why, with
 * a marker the gate can read: `[human-only: outward]` (push, PR, comment, merge, delete —
 * anything that leaves the machine or cannot be undone), `[human-only: fact]` (something only a
 * person knows: a ticket key, what a reviewer said), `[human-only: requirement]` (what to build
 * is unclear, so building every guess is waste).
 *
 * What each mode checks:
 *   ask  — every question in the call either carries a marker, or its options name at least two
 *          `alt/...` branches that exist locally (git is asked, not trusted). That second form is
 *          the "which one do you keep?" question the rule ends with.
 *   stop — the final message contains no choice question ("should I", "do you want", "which
 *          option", …) unless it carries a marker or names two existing `alt/...` branches. It
 *          blocks once: when `stop_hook_active` is set the agent has already been told, and a
 *          second block would only loop.
 *
 * It fails OPEN. Unreadable input, no git, an unknown mode: exit 0 and stay out of the way. A
 * gate that breaks a session over its own bug gets switched off, and a switched-off gate
 * enforces nothing.
 */
import { spawnSync } from 'node:child_process';

const MARKER = /\[human-only:\s*(outward|fact|requirement)\b[^\]]*\]/i;
const ANY_MARKER = /\[human-only:[^\]]*\]/i;
const BRANCH = /\balt\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g;
const CHOICE =
  /\b(should (?:I|we)|shall (?:I|we)|do you want|would you (?:like|prefer)|do you prefer|want me to|or should|which (?:one|option|approach|solution|version|variant)s?)\b/i;

const RULE =
  'Constitution § Alternatives, not questions (the build-alternatives skill): when the task is ' +
  'clear but there are several ways to do it, build every way — each on a local ' +
  '`alt/<topic>/<option>` branch, never pushed — then ask only which to keep, naming the branches. ' +
  'If building cannot answer it, say why with [human-only: outward|fact|requirement].';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function existingBranches(text, cwd) {
  const named = [...new Set(text.match(BRANCH) ?? [])];
  const exist = [];
  const missing = [];
  for (const b of named) {
    const p = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], { cwd, encoding: 'utf8' });
    (p.status === 0 ? exist : missing).push(b);
  }
  return { exist, missing };
}

function checkQuestion(q, cwd) {
  const options = (q.options ?? []).map((o) => `${o.label ?? ''} ${o.description ?? ''}`).join('\n');
  const text = `${q.header ?? ''}\n${q.question ?? ''}\n${options}`;
  if (MARKER.test(text)) return null;
  if (ANY_MARKER.test(text)) {
    return `"${q.question}" has a [human-only: …] marker with a reason the rule doesn't know. The reasons are outward, fact and requirement.`;
  }
  const { exist, missing } = existingBranches(text, cwd);
  if (exist.length >= 2) return null;
  if (missing.length) {
    return `"${q.question}" names ${missing.join(', ')}, which ${missing.length === 1 ? 'does' : 'do'} not exist locally. Build each alternative before offering it.`;
  }
  return `"${q.question}" offers choices that were not built.`;
}

function ask(input) {
  const cwd = input.cwd || process.cwd();
  const problems = (input.tool_input?.questions ?? []).map((q) => checkQuestion(q, cwd)).filter(Boolean);
  if (!problems.length) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${problems.join(' ')} ${RULE}`,
      },
    })
  );
}

function stop(input) {
  if (input.stop_hook_active) return;
  const msg = input.last_assistant_message;
  if (typeof msg !== 'string' || !msg.includes('?')) return;
  const questions = msg.split(/(?<=\?)|\n/).filter((s) => s.trim().endsWith('?'));
  const choices = questions.filter((s) => CHOICE.test(s));
  if (!choices.length) return;
  if (MARKER.test(msg)) return;
  if (existingBranches(msg, input.cwd || process.cwd()).exist.length >= 2) return;
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `Your reply ends with a choice for the human ("${choices[0].trim()}") and nothing was built for it. ` +
        `Build the alternatives now, or mark the question with why only a person can answer it. ${RULE}`,
    })
  );
}

const mode = process.argv[2];
let input;
try {
  input = JSON.parse(await readStdin());
} catch {
  process.exit(0);
}
try {
  if (mode === 'ask') ask(input);
  else if (mode === 'stop') stop(input);
} catch (e) {
  process.stderr.write(`alternatives-gate: ${e.message} — allowing\n`);
}
process.exit(0);
