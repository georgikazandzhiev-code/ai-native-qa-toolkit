# Pre-release security review gate

A condensed pass/flag checklist across both OWASP lists, for auditing a feature or PR **without writing tests**. Walk it against the diff or the story. Mark each line **PASS** (covered / not applicable with reason), **FLAG** (gap a QA test should close — point at the recipe), or **OUT OF SCOPE** (needs SAST / dependency scan / crypto / pen-test — name the tooling). Pair with the `pr-review` skill for the full pre-push gate.

## Access control (highest weight — most findings live here)
- [ ] Every endpoint that takes an object id enforces ownership — a cross-principal request returns `403/404`, not `200` (BOLA / A01). → `api-top10.md` API1
- [ ] Every privileged/admin operation denies lower-role callers (`403`) (BFLA / A01). → API5
- [ ] Responses don't over-expose properties for lower-privileged principals; create/update ignore privileged fields (BOPLA / mass assignment). → API3
- [ ] No forced-browsing / direct-navigation path reaches a route the role shouldn't see.

## Authentication & session
- [ ] Missing / expired / wrong-issuer / malformed tokens → `401` (A07 / API2).
- [ ] Logout invalidates the session; protected routes reject the stale token afterwards.
- [ ] Password / reset-token policy enforced (length, complexity, expiry, single-use).

## Input handling
- [ ] User-supplied text fields covered by injection/XSS payload loops — reject branch AND safe-render branch (A03).
- [ ] URL/host/webhook params reject internal/loopback/metadata targets (SSRF — A10 / API7).
- [ ] Business-logic guards hold — no step-skipping, replay, or price/quantity/state tampering (A04 / API6).
- [ ] Client-supplied-but-server-trusted values (role, tenantId, price, ids) can't be tampered (A08).

## Configuration & surface
- [ ] Security headers present (CSP, `X-Content-Type-Options`, HSTS); CORS doesn't reflect arbitrary origins (A05 / API8).
- [ ] Errors return the typed envelope with no stack trace / framework-version / verbose leak.
- [ ] Disabled verbs → `405`; no default credentials work.
- [ ] Known deprecated/older-version/debug routes are gone or still enforce authz (API9).
- [ ] Traffic is HTTPS; sensitive fields not returned in cleartext; cookies `Secure`/`HttpOnly` (A02 surface only).

## Out-of-QA-automation scope — flag with the owning tooling, never fake
- [ ] Cryptographic strength / key management / at-rest encryption → security review (A02).
- [ ] Vulnerable & outdated components → dependency scanning / SCA in the pipeline (A06).
- [ ] Security logging & monitoring / alerting coverage → observability + security team (A09).
- [ ] Supply-chain / CI-CD artifact signing → DevSecOps (A08).
- [ ] Volumetric rate-limit / DoS / brute-force at scale → `k6-load-testing` with thresholds (A04 / API4).

## Reporting
- [ ] Every FLAG has an owner: a QA test to author (link the recipe) or a bug already filed.
- [ ] Confirmed findings are filed via `bug-helper`, not left as review prose.
- [ ] OUT OF SCOPE items are named explicitly in the review so nothing reads as silently covered.
