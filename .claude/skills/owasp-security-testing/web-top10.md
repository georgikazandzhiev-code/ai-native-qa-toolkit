# OWASP Top 10 (2021, web) — QA test angles

## Contents
- A01 Broken Access Control
- A02 Cryptographic Failures
- A03 Injection (incl. XSS)
- A04 Insecure Design
- A05 Security Misconfiguration
- A06 Vulnerable & Outdated Components
- A07 Identification & Authentication Failures
- A08 Software & Data Integrity Failures
- A09 Security Logging & Monitoring Failures
- A10 Server-Side Request Forgery (SSRF)

Each entry: **what it is → what QA can automate → concrete angle → boundary (what needs other tooling)**. For API-shaped access-control (BOLA/BFLA/BOPLA) the deeper recipes are in [`api-top10.md`](api-top10.md).

---

## A01 — Broken Access Control  ✅ automatable (highest value)
- **Is:** users acting outside their intended permissions — reading/editing others' data, reaching admin functions, forced browsing, path/ID tampering.
- **QA automates:** the second-principal test. Seed as principal A, act as principal B (other tenant / lower role / no-scope), assert `403`/`404`, never `200`. Also test URL/param tampering (change an id in the request to one you don't own) and direct navigation to a route the role shouldn't reach.
- **Angle:** every access-controlled route owes a deny test. See BOLA (API1), BFLA (API5), BOPLA (API3) in `api-top10.md`.
- **Boundary:** none — this is the core QA target.

## A02 — Cryptographic Failures  ❌ mostly not black-box QA
- **Is:** weak/misused crypto, secrets in transit or at rest, TLS gaps.
- **QA automates:** thin surface only — assert traffic is HTTPS (no downgrade to `http://`), sensitive fields aren't returned in cleartext in API responses, cookies carry `Secure`/`HttpOnly`.
- **Boundary:** cipher strength, key management, at-rest encryption → security review / infra scan. **Flag, don't fake.**

## A03 — Injection (SQLi, NoSQLi, command) + XSS  ✅ automatable
- **Is:** untrusted input interpreted as code/query; XSS renders attacker markup in a victim's browser.
- **QA automates:** per-field payload loops (reuse `api-testing` invalid-value loop-inside-`test()`). Feed injection/XSS strings from a curated array in `test-data/`; assert either a clean `400` reject **or** safe handling where the value is returned/rendered.
- **Angle (two branches, both required for stored XSS):** (1) reject branch — payload → `400` + error schema; (2) safe-render branch — payload accepted, then at the render site assert it appears as inert text (`getByText(rawPayload)`) with no dialog/script firing. Never probe the DOM with `page.evaluate`.
- **Boundary:** blind/second-order injection needing DB inspection → deeper security testing.

## A04 — Insecure Design  ⚠️ partial
- **Is:** missing security controls by design (no rate limit on a sensitive flow, guessable reset tokens, business-logic abuse).
- **QA automates:** business-logic negative tests — skip a required step, replay a one-time action, tamper with a price/quantity/state transition and assert it's rejected. Ties to API6 (sensitive business flows).
- **Boundary:** threat modelling and design review are upstream of QA — surface as clarifying questions (`requirement-analyst`).

## A05 — Security Misconfiguration  ✅ partly automatable
- **Is:** default creds, verbose errors, missing security headers, unnecessary methods/endpoints enabled, directory listing.
- **QA automates:** response-surface assertions — security headers present (`Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`), errors don't leak stack traces/framework versions, disabled verbs return `405` (reuse the `api-testing` 405 catch-all loop), no default credentials work.
- **Boundary:** server/container/cloud config hardening → infra review.

## A06 — Vulnerable & Outdated Components  ❌ not black-box QA
- **Is:** known-CVE libraries/frameworks in the stack.
- **QA automates:** nothing at the black-box level.
- **Boundary:** dependency scanning (SCA — e.g. `npm audit`, Dependabot, Snyk). **Flag it belongs to the pipeline, don't write a test.**

## A07 — Identification & Authentication Failures  ✅ partly automatable
- **Is:** weak auth — credential stuffing tolerance, weak session handling, broken logout, missing token expiry/validation.
- **QA automates:** token/session tests — missing token → `401`, expired/wrong-issuer token → `401`, logout invalidates the session, password-policy enforced on registration/reset (reuse per-field validation loops). See API2 in `api-top10.md`.
- **Boundary:** high-volume brute-force simulation → `k6-load-testing`; MFA/identity-provider internals → integration/security review.

## A08 — Software & Data Integrity Failures  ⚠️ partial
- **Is:** unverified updates, insecure deserialization, unsigned CI/CD artifacts, tampering with data in transit.
- **QA automates:** integrity of client-supplied-but-server-trusted data — tamper with a signed/opaque token or a hidden field and assert rejection; assert the server does not trust client-provided price/role/id fields.
- **Boundary:** supply-chain / pipeline signing → DevSecOps.

## A09 — Security Logging & Monitoring Failures  ❌ mostly not QA
- **Is:** attacks not logged/alerted, so breaches go unnoticed.
- **QA automates:** only user-visible pieces (e.g. an account-lockout message after N failures, if part of the contract).
- **Boundary:** log/alert coverage is observability — flag to the team.

## A10 — Server-Side Request Forgery (SSRF)  ✅ automatable where a fetch exists
- **Is:** the server fetches an attacker-controlled URL (webhook, image-import, callback), reaching internal resources.
- **QA automates:** if an endpoint takes a URL/host, submit internal/loopback/metadata targets (`http://localhost`, `http://169.254.169.254/…`, private ranges) and assert they're rejected/blocked — not fetched.
- **Boundary:** confirming the internal request was actually blocked at the network layer → security review; QA asserts the endpoint's documented reject behaviour. See API7 in `api-top10.md`.
