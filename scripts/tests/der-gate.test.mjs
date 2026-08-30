#!/usr/bin/env node
/**
 * Fault injection for the defect-escape-rate gate. `npm run test:der`
 *
 * A gate that has never been run against a real violation is a hypothesis. This drives the DER
 * script against a fake Jira and asserts the exit code for each scenario it is supposed to
 * decide — including the one an absolute threshold gets wrong.
 *
 * No network, no credentials, no dependencies: a local HTTP server answers the two endpoints
 * the script calls, with counts this file controls.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SCRIPT = join('scripts', 'defect-escape-rate.mjs');
const HISTORY = join(ROOT, 'quality', 'der-history.json');

let counts = {};

/** Map an incoming JQL to one of the five buckets the script asks for. */
function bucket(jql) {
  const esc = jql.includes('prod-escape');
  const int = jql.includes('qa-bug');
  const notEsc = /NOT \(labels in \("prod-escape"/.test(jql);
  const notInt = /NOT \(labels in \("qa-bug"/.test(jql);
  if (esc && notInt) return 'escaped';
  if (int && notEsc) return 'internal';
  if (esc && int) return 'both';
  if (notEsc && notInt) return 'neither';
  return 'all';
}

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const jql = JSON.parse(body || '{}').jql || '';
    const n = counts[bucket(jql)] ?? 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      req.url.includes('approximate-count')
        ? JSON.stringify({ count: n })
        : JSON.stringify({ issues: Array.from({ length: n }, (_, i) => ({ key: `DEMO-${i + 1}` })) })
    );
  });
});

const run = (args) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        JIRA_URL: `http://127.0.0.1:${server.address().port}`,
        JIRA_EMAIL: 'test@example.invalid',
        JIRA_API_TOKEN: 'not-a-real-token',
      },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

const CASES = [
  {
    name: '1 escape of 31 — healthy',
    counts: { escaped: 1, internal: 30, both: 0, neither: 1, all: 32 },
    exit: 0,
  },
  {
    name: '5 escapes of 25 — 20%, critical',
    counts: { escaped: 5, internal: 20, both: 0, neither: 1, all: 26 },
    exit: 1,
  },
  {
    name: '20 of 26 unclassified — rate not reportable',
    counts: { escaped: 1, internal: 5, both: 4, neither: 16, all: 26 },
    exit: 1,
  },
  {
    name: 'no bugs at all — no divide by zero',
    counts: { escaped: 0, internal: 0, both: 0, neither: 0, all: 0 },
    exit: 0,
  },
];

server.listen(0, async () => {
  mkdirSync(dirname(HISTORY), { recursive: true });
  if (existsSync(HISTORY)) unlinkSync(HISTORY);

  console.log('');
  console.log('Defect escape rate — gate behaviour');
  console.log('');

  let failed = 0;
  for (const c of CASES) {
    counts = c.counts;
    const { code, out } = await run(['DEMO', '--release', 'v1.0']);
    const der = (out.match(/DER\s+([\d.]+)%/) || [])[1] ?? '?';
    const ok = code === c.exit;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(44)} DER ${String(der).padStart(6)}%   exit ${code}`
    );
  }

  // The case an absolute threshold gets wrong: still under the 5% line, but twice as bad as
  // last release. A gate that only knows thresholds calls this green.
  counts = { escaped: 1, internal: 60, both: 0, neither: 1, all: 62 };
  await run(['DEMO', '--release', 'v1.0', '--record']);
  counts = { escaped: 3, internal: 60, both: 0, neither: 1, all: 64 };
  const r = await run(['DEMO', '--release', 'v1.1']);
  const caught = /WORSE by/.test(r.out) && r.code === 1;
  if (!caught) failed++;
  console.log('');
  console.log(
    `  ${caught ? 'OK  ' : 'FAIL'} 1.6% -> 4.8%: under the 5% line, still a regression   exit ${r.code}`
  );

  if (existsSync(HISTORY)) unlinkSync(HISTORY);
  console.log('');
  if (failed) {
    console.log(`  ${failed} case(s) did not behave as specified`);
    server.close();
    process.exit(1);
  }
  console.log('  the gate decides every case as specified');
  server.close();
});
