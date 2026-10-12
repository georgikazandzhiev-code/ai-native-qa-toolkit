export const meta = {
  name: 'review-pr',
  description: 'Independent review of a pull request: critic lenses look for problems, a skeptic tries to refute each finding, and a synthesizer gives the merge verdict',
  whenToUse: 'Before you request review on your own PR (the PR template\'s "Independent review" section), or when you review a teammate\'s PR. Pass { pr: 65 }; optional: repo ("owner/name"), scope (what the PR deliberately leaves out), lenses (extra { key, prompt } critics).',
  phases: [
    { title: 'Prepare', detail: 'fresh clone of the PR head, the checks CI runs' },
    { title: 'Review', detail: 'one critic per lens' },
    { title: 'Verify', detail: 'one skeptic per finding tries to refute it' },
    { title: 'Synthesize', detail: 'verdict, confirmed fixes, the numbers for the PR template' },
  ],
}

// Read-only by design: no agent edits, commits, pushes, comments or merges. The verdict goes to
// whoever ran the workflow, and acting on it (fix, merge, comment) stays their decision.

const input = typeof args === 'object' && args !== null ? args : { pr: args }
const PR = Number(input.pr)
if (!Number.isInteger(PR) || PR <= 0) {
  throw new Error('review-pr needs the PR number, e.g. args: { pr: 65 } or args: 65')
}
const SCOPE = typeof input.scope === 'string' && input.scope.trim() ? input.scope.trim() : ''
const EXTRA_LENSES = Array.isArray(input.lenses)
  ? input.lenses
      .map((l, i) => (typeof l === 'string' ? { key: `extra-${i + 1}`, prompt: l } : l))
      .filter((l) => l && typeof l.prompt === 'string')
  : []

const PREP = {
  type: 'object',
  properties: {
    repo: { type: 'string', description: 'owner/name' },
    clone: { type: 'string', description: 'absolute path of the fresh clone, PR head checked out' },
    base: { type: 'string' },
    head_sha: { type: 'string' },
    title: { type: 'string' },
    author: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'string' }, description: 'commands CI runs, runnable from the clone root' },
    review_rules: { type: 'array', items: { type: 'string' }, description: 'repo files that define review rules: PR template, CONTRIBUTING, GOVERNANCE, CLAUDE.md' },
    problems: { type: 'string', description: 'anything that failed during setup' },
  },
  required: ['repo', 'clone', 'base', 'head_sha', 'files', 'checks'],
}

phase('Prepare')
const prep = await agent(`Prepare an independent review of pull request #${PR}.
1. Repository: ${input.repo ? `\`${input.repo}\`` : 'the one the current directory belongs to (`gh repo view --json nameWithOwner`)'}.
2. Read the PR: \`gh pr view ${PR} --repo <repo> --json title,author,baseRefName,headRefOid,files,body\`.
3. Make a FRESH clone in a new, empty directory under the OS temp directory (\`mktemp -d\`). Do not reuse or touch any existing checkout. Fetch \`pull/${PR}/head\` into a local branch \`review/pr${PR}\` and check it out. Retry network commands a few times if they fail.
4. If there is a package.json, install dependencies with scripts disabled (\`npm ci --ignore-scripts\`, or \`npm install --ignore-scripts --no-package-lock\` without a lockfile). Do the same in any sub-package that CI installs.
5. List the commands CI runs (read .github/workflows/*, package.json scripts), as commands runnable from the clone root. Skip deploy/publish steps.
6. List the files that define this repo's review rules: the PR template, CONTRIBUTING, GOVERNANCE, the root and .claude CLAUDE.md, CODEOWNERS — whichever exist.
Never edit tracked files, commit, push, comment or merge.`, { label: 'prepare', phase: 'Prepare', schema: PREP })

if (!prep || !prep.clone) {
  return { error: 'Setup failed: no clone of the PR head was prepared.', prep }
}

const BASE = `
You are part of an independent review of PR #${PR} "${prep.title || ''}" in ${prep.repo}${prep.author ? `, by ${prep.author}` : ''}.
A fresh clone with the PR head checked out is at ${prep.clone} (branch review/pr${PR}, head ${prep.head_sha}). The change is \`git diff origin/${prep.base}...HEAD\`. Read the PR description with \`gh pr view ${PR} --repo ${prep.repo}\`.
This repo's review rules live in: ${(prep.review_rules || []).join(', ') || 'no dedicated file — use common sense'}. Judge the PR by those rules, not by your own taste.${SCOPE ? `\nDeclared scope — the PR deliberately leaves this out; don't report it as a defect unless the PR makes it worse:\n${SCOPE}` : ''}
RULES: read-only. Never edit files, commit, push, comment, approve or merge. Every finding needs evidence: file:line on the PR branch, or command output. Severity: "blocking" = breaks CI, leaks a secret or a name that must not be published, or loses data; "must-fix" = someone following the changed text or code would do the wrong thing, a contradiction, a broken reference, a repo rule violated; "nice" = wording or polish. Report nothing that you only suspect: no finding beats a weak one.
`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'must-fix', 'nice'] },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
        required: ['id', 'title', 'file', 'severity', 'claim', 'evidence', 'suggested_fix'],
      },
    },
    checks_run: { type: 'string', description: 'each command run and its result' },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    corrected_severity: { type: 'string', enum: ['blocking', 'must-fix', 'nice', 'none'] },
    reason: { type: 'string' },
  },
  required: ['refuted', 'corrected_severity', 'reason'],
}

const LENSES = [
  {
    key: 'claims',
    prompt: `LENS: is every claim true? List each factual statement in the PR description (what changed, numbers, check results, "X now does Y", scope statements) and in any changed docs or comments that describe behaviour. Verify each against the branch: read the code, run the command, count the thing. A claim you can't verify is not a finding; a claim you can show is false is. Prefix ids with CL.`,
  },
  {
    key: 'coherence',
    prompt: `LENS: coherence. Read every changed file in full, not only the hunks. Does the changed text or code contradict itself, the rest of the file, or the repo's existing rules? Do cross-references, links, anchors, index or routing entries and counts still resolve after the change (git grep for anything renamed or removed)? Prefix ids with CO.`,
  },
  {
    key: 'reader',
    prompt: `LENS: the reader who follows it literally. Play whoever consumes this change — an agent loading a changed instruction, a developer calling changed code, a team installing a changed file into another repository. Follow the changed artifacts literally in two or three realistic situations, including one where an assumption doesn't hold. Where would they stall, contradict themselves, invent facts, or get a wrong result? Then compare the removed lines with the added ones: was a rule, a reason, a step, a test or a safeguard dropped without a replacement? Prefix ids with RE.`,
  },
  {
    key: 'rules-and-checks',
    prompt: `LENS: repo rules and checks.
1. Run every check from this list in the clone and report each result: ${JSON.stringify(prep.checks)}. A failure is a finding only if it fails on the PR branch and not on origin/${prep.base}; check the base before you report it. For a check that takes more than about five minutes (a mutation sweep, a full test suite), read its result from CI on this head instead (\`gh pr checks ${PR} --repo ${prep.repo}\`, \`gh run view\`) and say so; run it locally only if CI didn't.
2. Read the review-rule files. Does the PR meet them: change class, version bumps, required evidence, one logical change per PR, ownership of protected paths?
3. If the PR adds or changes a check (validator, lint rule, test, gate): does it misfire in either direction? Try an input it should reject and one it should accept.
4. Leak audit on the added lines (\`git diff origin/${prep.base}...HEAD | grep '^+'\`): secrets, tokens, internal hosts, ticket keys, names the repo's rules say must not be published.
Prefix ids with RC.`,
  },
  ...EXTRA_LENSES.map((l, i) => ({ key: l.key || `extra-${i + 1}`, prompt: `LENS: ${l.prompt} Prefix ids with X${i + 1}.` })),
]

const reviewed = await pipeline(
  LENSES,
  (l) => agent(`${BASE}\n${l.prompt}`, { label: `critic:${l.key}`, phase: 'Review', schema: FINDINGS }),
  (r, l) => {
    if (!r) return null
    return parallel(
      r.findings.map((f) => () =>
        agent(`${BASE}
You are a SKEPTIC. Try hard to REFUTE this finding. Re-read the cited lines yourself on the PR branch and their surroundings. Refute it if the PR handles it elsewhere, if it already exists on origin/${prep.base} and the PR doesn't make it worse, if it falls outside the PR's declared scope, or if the evidence doesn't show what the finding says. If it survives, give the correct severity. Set refuted=true only with concrete counter-evidence.

FINDING (${l.key} lens):
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Verify', schema: VERDICT }).then((v) => ({ ...f, lens: l.key, verdict: v })),
      ),
    ).then((fs) => ({ lens: l.key, checks: r.checks_run || '', findings: fs.filter(Boolean) }))
  },
)

const lensResults = reviewed.filter(Boolean)
const failedLenses = LENSES.map((l) => l.key).filter((k) => !lensResults.some((r) => r.lens === k))
if (failedLenses.length) log(`No result from: ${failedLenses.join(', ')}. The verdict says so.`)
const allFindings = lensResults.flatMap((r) => r.findings)
const unverified = allFindings.filter((f) => !f.verdict)
const confirmed = allFindings.filter((f) => f.verdict && !f.verdict.refuted && f.verdict.corrected_severity !== 'none')
const refuted = allFindings.filter((f) => f.verdict && (f.verdict.refuted || f.verdict.corrected_severity === 'none'))
log(`${confirmed.length} confirmed, ${refuted.length} refuted, ${unverified.length} unverified`)

phase('Synthesize')
const verdict = await agent(`${BASE}
You are the synthesizer. Below: every finding with its skeptic verdict, and each lens's check results. Re-check every confirmed finding against the files before you rely on it (read-only).${failedLenses.length ? `\nThese lenses produced no result, so their angle is NOT covered: ${failedLenses.join(', ')}. Say so in the verdict.` : ''}${unverified.length ? `\n${unverified.length} finding(s) have no skeptic verdict; check them yourself or list them as unverified.` : ''}

Write Markdown:
1. **Verdict** — one of: merge as-is / merge, then a follow-up PR with the fixes / don't merge yet (only for a blocking finding). One sentence why.
2. **Checks** — one line per check: pass / fail / not run.
3. **Confirmed findings**, most severe first: id, severity, file:line, the problem in one sentence, and the exact fix (the text or code to write).
4. **Refuted findings** — one line each, with the reason.
5. **For the PR template** — the line "Independent review: N findings confirmed, K refuted", with the real numbers.
6. **Questions only the owner can answer**, if any, each with your recommendation.
Lead with the verdict. No preamble.

FINDINGS AND VERDICTS:
${JSON.stringify(lensResults, null, 1)}`, { label: 'synthesize', phase: 'Synthesize' })

return {
  pr: PR,
  repo: prep.repo,
  head: prep.head_sha,
  clone: prep.clone,
  verdict,
  counts: { confirmed: confirmed.length, refuted: refuted.length, unverified: unverified.length },
  confirmed: confirmed.map((f) => ({ id: f.id, severity: f.verdict.corrected_severity, title: f.title, file: f.file, line: f.line, fix: f.suggested_fix })),
  lenses_without_result: failedLenses,
}
