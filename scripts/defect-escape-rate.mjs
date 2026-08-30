#!/usr/bin/env node
/**
 * Defect Escape Rate. `node scripts/defect-escape-rate.mjs <PROJECT> --release <fixVersion>`
 *
 *   DER = production escapes / (internal defects + production escapes)
 *
 * Four things this refuses to do, each one a defect in the version it replaces:
 *
 *  1. It will not exit 0 when the gate fails. The previous version computed `passed` and then
 *     ignored it, so it could report CRITICAL and still let a pipeline through. A gate that
 *     cannot say no is not a gate.
 *
 *  2. It will not report a rate it cannot stand behind. Bugs are classified from an explicit
 *     field, and anything that matches BOTH phases or NEITHER is counted and surfaced. A bug
 *     matching neither silently shrinks the denominator and flatters the result — so if
 *     unclassified exceeds a threshold, the run fails on data quality rather than publishing a
 *     number built on a guess.
 *
 *  3. It will not read `total` from the search response. Atlassian removed GET
 *     /rest/api/3/search (410 Gone since October 2025) and the replacement is cursor-paginated
 *     with no `total` field. Reading it yields undefined, which coerces to 0, which reports a
 *     0% escape rate — a metric that can only ever be green. Counts come from
 *     /search/approximate-count, and issue keys from real pagination.
 *
 *  4. It will not treat 5% as a law of nature. Absolute thresholds are a starting position;
 *     what gates is a REGRESSION against your own recorded history. The same argument the
 *     mutation-testing skill makes against an arbitrary 80% target applies here.
 *
 * Env: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const API = '/rest/api/3';

// Starting positions, not laws. A team with a mature suite and one that just started testing
// should not be held to the same absolute number — which is why § history below matters more.
const ABSOLUTE = { good: 5.0, warn: 10.0 };

// If more than this share of bugs cannot be classified as internal or escaped, the rate is not
// reportable: the denominator is missing an unknown amount.
const MAX_UNCLASSIFIED_SHARE = 0.15;

const HISTORY = 'quality/der-history.json';

// ── args ────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const project = argv.find((a) => !a.startsWith('--') && argv.indexOf(a) === 0) ?? null;
const release = flag('release');
const since = flag('since');
const asJson = has('json');
const record = has('record');

if (!project || has('help')) {
  console.log(`
Defect Escape Rate

  node scripts/defect-escape-rate.mjs <PROJECT> [options]

  --release <fixVersion>   scope to one release (strongly recommended)
  --since <yyyy-mm-dd>     scope by creation date instead
  --record                 append the result to ${HISTORY}
  --json                   machine-readable output

Scope it. An all-time DER compares last year's production bugs with this month's QA bugs and
means nothing.

Env: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN
`);
  process.exit(project ? 0 : 2);
}

const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
if (!JIRA_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  const msg = 'Missing JIRA_URL, JIRA_EMAIL or JIRA_API_TOKEN.';
  console.error(asJson ? JSON.stringify({ error: msg }) : `ERROR: ${msg}`);
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const base = JIRA_URL.replace(/\/+$/, '');

// ── Jira ────────────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 410) {
    throw new Error(
      `410 Gone on ${path}. The old search endpoints were removed in October 2025; this script ` +
        `already uses the replacement, so a 410 here means the path itself is wrong.`
    );
  }
  if (!res.ok) throw new Error(`Jira ${res.status} on ${path}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Jira returned non-JSON from ${path}`);
  }
}

/** Exact count via the endpoint that exists for it. `total` no longer comes back from search. */
const countOf = async (jql) => (await post(`${API}/search/approximate-count`, { jql })).count ?? 0;

/** Cursor pagination — the replacement API has no offsets and no total. */
async function keysOf(jql, cap = 500) {
  const keys = [];
  let token;
  do {
    const page = await post(`${API}/search/jql`, {
      jql,
      maxResults: 100,
      fields: ['key'],
      ...(token ? { nextPageToken: token } : {}),
    });
    for (const i of page.issues ?? []) keys.push(i.key);
    token = page.nextPageToken;
  } while (token && keys.length < cap);
  return { keys, truncated: Boolean(token) };
}

// ── JQL ─────────────────────────────────────────────────────────────────────────
//
// `sprint` is deliberately absent: on a project without the field, naming it makes the WHOLE
// query fail validation rather than just that clause. Scope by fixVersion or by date.

const scope = [
  `project = "${project}"`,
  'issuetype = Bug',
  release ? `fixVersion = "${release}"` : null,
  since ? `created >= "${since}"` : null,
].filter(Boolean).join(' AND ');

const ESCAPED = `(labels in ("prod-escape", "production-bug") OR environment ~ "production")`;
const INTERNAL = `(labels in ("qa-bug", "internal-qa") OR environment ~ "qa" OR environment ~ "staging")`;

const Q = {
  all: scope,
  escaped: `${scope} AND ${ESCAPED} AND NOT ${INTERNAL}`,
  internal: `${scope} AND ${INTERNAL} AND NOT ${ESCAPED}`,
  both: `${scope} AND ${ESCAPED} AND ${INTERNAL}`,
  neither: `${scope} AND NOT ${ESCAPED} AND NOT ${INTERNAL}`,
};

// ── run ─────────────────────────────────────────────────────────────────────────

function verdict(der, prev) {
  const abs = der > ABSOLUTE.warn ? 'CRITICAL' : der > ABSOLUTE.good ? 'WARNING' : 'GOOD';
  if (prev === null) return { abs, trend: 'FIRST RUN', regressed: false };
  const delta = +(der - prev).toFixed(2);
  // Movement inside a point is noise at the volumes most teams have per release.
  if (Math.abs(delta) <= 1.0) return { abs, trend: `flat (${delta >= 0 ? '+' : ''}${delta})`, regressed: false };
  return delta > 0
    ? { abs, trend: `WORSE by ${delta} points`, regressed: true }
    : { abs, trend: `better by ${Math.abs(delta)} points`, regressed: false };
}

try {
  const [all, escaped, internal, both, neither] = await Promise.all(
    [Q.all, Q.escaped, Q.internal, Q.both, Q.neither].map(countOf)
  );

  const classified = escaped + internal;
  const unclassified = both + neither;
  const share = all > 0 ? unclassified / all : 0;
  const der = classified > 0 ? +((escaped / classified) * 100).toFixed(2) : 0;

  let prev = null;
  if (existsSync(HISTORY)) {
    const h = JSON.parse(readFileSync(HISTORY, 'utf8'));
    const rows = (h.entries ?? []).filter((e) => e.project === project);
    prev = rows.length ? rows[rows.length - 1].der : null;
  }
  const v = verdict(der, prev);

  const dataFailed = all > 0 && share > MAX_UNCLASSIFIED_SHARE;
  const gateFailed = v.abs === 'CRITICAL' || v.regressed || dataFailed;

  const { keys, truncated } = escaped > 0 ? await keysOf(Q.escaped) : { keys: [], truncated: false };

  const out = {
    project,
    scope: release ? `fixVersion ${release}` : since ? `created >= ${since}` : 'ALL TIME — not comparable',
    der,
    counts: { escaped, internal, classified, bothPhases: both, unclassified: neither, allBugs: all },
    dataQuality: {
      unclassifiedShare: +(share * 100).toFixed(1),
      limit: MAX_UNCLASSIFIED_SHARE * 100,
      reportable: !dataFailed,
    },
    verdict: v,
    previous: prev,
    escapedKeys: keys,
    keysTruncated: truncated,
    gate: gateFailed ? 'FAIL' : 'PASS',
  };

  if (record && !dataFailed) {
    const h = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : { entries: [] };
    h.entries.push({ project, scope: out.scope, der, escaped, internal, date: out.scope });
    writeFileSync(HISTORY, JSON.stringify(h, null, 2) + '\n');
  }

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('');
    console.log(`Defect escape rate — ${project} (${out.scope})`);
    console.log('');
    console.log(`  escaped to production   ${escaped}`);
    console.log(`  caught internally       ${internal}`);
    console.log(`  ------------------------------`);
    console.log(`  DER                     ${der}%   [${v.abs}]`);
    console.log(`  vs previous             ${v.trend}`);
    console.log('');
    if (both || neither) {
      console.log(`  UNCLASSIFIED            ${unclassified} of ${all} bugs (${out.dataQuality.unclassifiedShare}%)`);
      if (both) console.log(`    ${both} match both phases — double counted if summed naively`);
      if (neither) console.log(`    ${neither} match neither — invisible to the rate above`);
      console.log('');
    }
    if (dataFailed) {
      console.log(`  DATA QUALITY FAILURE: more than ${MAX_UNCLASSIFIED_SHARE * 100}% of bugs are unclassified.`);
      console.log(`  The denominator is missing an unknown amount, so this rate is not reportable.`);
      console.log(`  Fix the labelling, not the threshold.`);
      console.log('');
    }
    if (keys.length) {
      console.log(`  escapes: ${keys.join(', ')}${truncated ? ' … (more, capped)' : ''}`);
      console.log('');
    }
    console.log(`  ${out.gate}`);
    console.log('');
  }

  process.exit(gateFailed ? 1 : 0);
} catch (e) {
  console.error(asJson ? JSON.stringify({ error: e.message }) : `ERROR: ${e.message}`);
  process.exit(1);
}
