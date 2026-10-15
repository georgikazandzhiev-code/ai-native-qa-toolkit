#!/usr/bin/env node
/**
 * Writes `scripts/product-vocabulary.json` from a plain list kept outside this repository.
 *
 *   node scripts/hash-product-vocabulary.mjs <plain-list.json>
 *
 * Check 16 refuses the original product's names, but publishing those names to refuse them would
 * put the product map back on main (CONTRIBUTING: no client, employer or product specifics). So the
 * repository holds only their SHA-256 digests, grouped by kind, and check 16 hashes every token it
 * scans. The plain list — `{ "identifiers": [...], "pageObjects": [...], "stack": [...], "skills": [...] }`
 * — stays with the maintainers; to add a name, add it there and run this script.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts', 'product-vocabulary.json');
const KINDS = ['identifiers', 'pageObjects', 'stack', 'skills'];
// A token as check 16 sees it: a run of letters, digits, `_` and `-`, with no hyphen at either end.
const TOKEN = /^[\w](?:[\w-]*\w)?$/;

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/hash-product-vocabulary.mjs <plain-list.json>');
  process.exit(2);
}
const plain = JSON.parse(readFileSync(src, 'utf8'));
const sha256 = {};
let bad = 0;
for (const kind of KINDS) {
  const names = plain[kind];
  if (!Array.isArray(names) || !names.length) {
    console.error(`${kind}: missing or empty in ${src}`);
    bad++;
    continue;
  }
  for (const n of names.filter((n) => typeof n !== 'string' || !TOKEN.test(n))) {
    console.error(`${kind}: "${n}" is not a single token check 16 can match`);
    bad++;
  }
  sha256[kind] = [...new Set(names.map((n) => createHash('sha256').update(n).digest('hex')))].sort();
}
if (bad) process.exit(1);

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
writeFileSync(OUT, JSON.stringify({ why: previous.why, source: previous.source, sha256 }, null, 2) + '\n');
console.log(`wrote ${OUT}: ` + KINDS.map((k) => `${k} ${sha256[k].length}`).join(', '));
