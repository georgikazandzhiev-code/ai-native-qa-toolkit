---
name: owasp-security-testing
version: 1.0.0
description: Apply the OWASP Top 10 (2021, web) and OWASP API Security Top 10 (2023) as concrete QA test targets and a pre-release security review gate — authorization, authentication, injection, and misconfiguration coverage layered on the existing negative-test matrix. Use when adding access-control / auth / injection tests to API or UI specs, when reviewing a feature or PR for security gaps, or when a story touches roles, tenants, permissions, or user-supplied input. Reach for this whenever the user mentions security testing, OWASP, access control, BOLA/BFLA, injection, XSS, SSRF, or "is this endpoint safe". Trigger phrases — "OWASP", "security test", "access control test", "BOLA", "auth bypass", "injection test", "security review". Do NOT use for load / DoS / rate-limit performance work (use the `k6-load-testing` skill). Do NOT use for the general API negative-matrix mechanics (use the `api-testing` skill). Do NOT use for filing the resulting bug (use the `bug-helper` command).
metadata:
  category: cross-cutting
---

# OWASP Security Testing Skill

This skill turns the two OWASP Top 10 lists into **QA-automatable test targets** and a **pre-release review gate**. Functional tests prove the happy path works; this skill proves the app says *no* to the wrong caller, the wrong input, and the wrong scope. The failure mode it prevents: shipping an authorization or injection hole because every existing test authenticated as a full-permission user and sent only valid data. It layers on the `api-testing` negative matrix — a security test is a negative test written with an attacker's intent — so read that skill first for the mechanics (fixtures, `apiRequest`, schema assertions, cleanup).

## Critical

Non-negotiable. Each rule below is what separates a real security test from security theatre.

- **ALWAYS test authorization from a second principal's point of view.** The single highest-value API test is: seed an object as principal A, request it as principal B (different tenant / lower role / `USER_ACCESS_TOKEN_ZERO`), and assert `403` or `404` — never `200`. Broken Object/Function Level Authorization (BOLA/BFLA) tops the API list precisely because functional suites only ever call as the owner.
- **NEVER loosen a test, schema, or assertion to make a security check pass.** A security finding is a **bug to report**, not a test to fix. Write the test as the contract demands, comment out the `test(...)` block with `// TODO: FIXME: <TICKET>`, and file the finding (`bug-helper`). Mirrors `api-testing` § Skipping a test for a real backend bug.
- **NEVER run destructive, DoS, mass-enumeration, or unauthorized attacks.** QA security tests run only against an **authorized test environment** with **seeded** data. No credential stuffing against real accounts, no volumetric floods (that is `k6-load-testing` with explicit thresholds), no testing systems you were not asked to test.
- **ALWAYS seed both a privileged and an under-privileged principal in setup.** Access-control tests need a real "should-not" identity — a second tenant's token, a lower-role token, or the no-scope `USER_ACCESS_TOKEN_ZERO`. If that identity is not provisioned, comment the test out with `// TODO: FIXME:` — do not fake the assertion or drop the row.
- **NEVER assert on exact error text.** Assert **status + schema shape** (401 gateway shape, 403 empty body, 404 error envelope) per `api-testing` § Error envelopes. Leaked stack traces or verbose errors are themselves a finding — capture the leak, don't pin the wording.
- **ALWAYS know the automatable boundary.** QA automates access-control, injection-payload, auth-flow, security-header/misconfiguration-surface, and object-property-exposure tests. Dependency scanning, static crypto review, and full penetration testing belong to **other tooling** — flag the gap explicitly, never fake coverage. See § Automatable-by-QA decision.
- **NEVER put real secrets, PII, or production data into payloads, fixtures, or AI prompts.** Use faker and synthetic data (`data-strategy`). Hardcoded tokens/PII are both a framework violation and the exact leak these tests exist to catch.
- **ALWAYS extend the existing suite, not a parallel one.** Security tests are negative tests — they use the same fixtures, tags, and cleanup as `api-testing` / UI specs. Do not invent a `@security` tag unless it is first added to the project tag whitelist (`test-standards`).

## What's in each file (read this before reaching for another file)

| File | Purpose | Read when |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, the automatable-by-QA decision, the coverage workflow, anti-patterns. How to think about security tests. | Always, on any security-testing or security-review task. |
| **[`web-top10.md`](web-top10.md)** | Catalog: OWASP Top 10 (2021, web) — each risk → what QA can test → concrete API/UI angle → what needs other tooling. | Reviewing a web feature/PR, or picking which web risks apply to a story. |
| **[`api-top10.md`](api-top10.md)** | Catalog: OWASP API Security Top 10 (2023) — each risk → concrete negative-test recipe built on the `api-testing` matrix. | Adding security coverage to an API endpoint. |
| **[`review-checklist.md`](review-checklist.md)** | Pre-release security review gate — a condensed pass/flag checklist across both lists, for auditing a feature or PR without writing tests. | Doing a security review rather than authoring tests. |

**Boundary rule:** rules, decisions, and anti-patterns live in `SKILL.md`. Per-risk catalogs live in the `*-top10.md` files. The review gate lives in `review-checklist.md`. No code blocks longer than ~5 lines here — the test mechanics live in `api-testing` § templates.

## Automatable-by-QA decision

Not every OWASP category is a QA-automation target. Route each risk before writing anything.

| OWASP category | QA-automatable? | Where it belongs |
|----------------|-----------------|------------------|
| Broken Access Control · BOLA · BFLA · BOPLA | ✅ Yes — the core of this skill | Negative tests, second principal (`api-top10.md` API1/API3/API5) |
| Injection (SQLi, NoSQLi, cmd) · XSS | ✅ Yes — payload-driven negative tests | Per-field payload loop (`web-top10.md` A03) |
| Identification & Authentication failures | ✅ Partly — token/session/flow tests | Auth-flow tests (`api-top10.md` API2) |
| Security Misconfiguration · missing headers · verbose errors | ✅ Partly — response-surface assertions | Header / error-leak checks (`web-top10.md` A05) |
| Unrestricted Resource Consumption (rate limits) | ⚠️ Boundary — functional "limit returns 429" only | `k6-load-testing` for volumetric; this skill only asserts the limit exists |
| Cryptographic Failures · Vulnerable Components · Integrity failures | ❌ No — not functional QA | SAST / dependency scanning / crypto review — **flag, don't fake** |
| Logging & Monitoring failures | ❌ Mostly no — observability, not black-box QA | Flag to the team; assert only user-visible pieces |

If a risk lands in ❌, name it in the review as "out of QA-automation scope — needs `<tooling>`". Silent omission reads as "covered".

## Workflow — add security coverage for an endpoint or feature

Follow in order. Reuse the `api-testing` mechanics at every step; this skill only adds the attacker's intent.

```
- [ ] 1. Identify principals — who SHOULD access (owner / admin / tenant A) and who SHOULD NOT (other tenant / lower role / no-scope). Confirm both tokens are provisioned.
- [ ] 2. Map the objects & functions — object ids the endpoint exposes (BOLA), privileged operations (BFLA), and which response properties are sensitive (BOPLA).
- [ ] 3. Pick the risks that apply — scan api-top10.md (API endpoint) and/or web-top10.md (UI feature); most CRUD endpoints owe API1/API2/API3/API5 at minimum.
- [ ] 4. Author the negative tests — reuse the api-testing matrix: seed as A, act as B, assert 403/404 + schema. Payload loops for injection reuse the invalid-value loop-inside-test pattern.
- [ ] 5. Run — `npx playwright test <spec> --grep "@App-API"` (or the feature's tag). Read lints.
- [ ] 6. Report findings — any 200-where-403-expected, reflected payload, or leaked field is a bug: comment out the test with // TODO: FIXME: <TICKET> and file it. Never adjust the assertion to green.
```

For a **review instead of tests**, skip to `review-checklist.md` and walk the gate against the diff.

## Anti-patterns

- ❌ **Testing only as the owner/admin.** Every existing spec already does this. Without a second, under-privileged principal there is no access-control test — add the "should-not" identity in setup.
- ❌ **Asserting the attack "does not throw".** `await expect(...).not.toThrow()` proves nothing. Assert the concrete deny: status `403/404`, empty/typed error body, and (for BOPLA) that the sensitive field is **absent**.
- ❌ **Turning a finding green.** Changing an expected `403` to `200` because "that's what the API returns" hides the vulnerability. Report it (§ Critical), comment the test out with a ticket.
- ❌ **A parallel security suite with its own fixtures/tag.** Security tests are negative tests; they belong beside the CRUD specs with the same fixtures and the project's existing tag. New tag only after `test-standards` whitelist update.
- ❌ **Injection tests that only check for a 400.** A stored-XSS test must assert the payload is neutralised where it is *rendered/returned*, not just rejected on input. Cover both the reject path and the safe-render path (`web-top10.md` A03).
- ❌ **Pinning exact error strings** (`expect(body.message).toBe("Forbidden")`). Brittle and beside the point — assert status + schema shape. A verbose leaked message is a separate finding to capture, not to encode.
- ❌ **Volumetric / brute-force loops inside a Playwright spec** to "test rate limiting". That is a load test — use `k6-load-testing` with thresholds. Here, assert only that a documented limit returns `429`.
- ❌ **Claiming crypto / dependency / logging coverage.** These are not black-box QA. Flag them as out-of-scope with the tooling that owns them; never write a hollow test to tick the box.
- ❌ **Real credentials or PII in payloads/fixtures.** Use faker + synthetic data. This is both a framework rule and the leak the tests hunt for.

## Self-review checklist

- [ ] Every access-controlled endpoint has a BOLA test (owner-seeded object requested by a different principal → `403/404`).
- [ ] Every privileged operation has a BFLA test (lower-role principal → `403`).
- [ ] Responses are checked for over-exposed properties (BOPLA) — sensitive fields absent from the schema for the wrong principal.
- [ ] The "should-not" principal is real (second tenant / lower role / `USER_ACCESS_TOKEN_ZERO`), provisioned, and seeded in `beforeAll`/`beforeEach`.
- [ ] Injection/XSS coverage asserts both rejection on input AND safe handling where the value is returned/rendered.
- [ ] Auth tests cover missing token (`401`), wrong-issuer/expired token (`401`), and no-scope token (`403`) — status + schema shape only.
- [ ] No exact-error-text assertions; verbose-error / stack-trace leaks captured as findings.
- [ ] Findings are reported as bugs (commented-out test + `// TODO: FIXME: <TICKET>`), never assertion-massaged to green.
- [ ] No real secrets/PII/prod data anywhere; faker + synthetic only.
- [ ] Out-of-QA-scope categories (crypto, components, logging) are explicitly flagged, not silently skipped.
- [ ] Tests reuse the project fixtures, tag whitelist, and cleanup; no parallel suite.

## Examples

### Example 1 — BOLA on a GET-by-id endpoint

User says: _"Make sure a tenant can't read another tenant's synthetic monitor."_

1. **Principals** — tenant A (`USER_ACCESS_TOKEN_FULL`) owns the object; tenant B has a valid token but no access to A's data.
2. **Seed** — in `beforeAll`, create a synthetic as tenant A, capture `syntheticId`.
3. **Risk** — API1 (BOLA), from `api-top10.md`.
4. **Test** — `Verify GET /synthetics/:id returns 404 for a cross-tenant caller`: call the endpoint with tenant B's token and A's `syntheticId`, assert status is `404` (existence hidden) or `403`, and `APIErrorSchema.parse(body)`. A `200` with A's data is the bug.
5. **Cleanup** — delete the synthetic as tenant A in `afterAll`.
6. **If it returns 200** — comment the test out with `// TODO: FIXME: PROJ-XXXX — cross-tenant read exposes synthetic`, file via `bug-helper`.

### Example 2 — BFLA on an admin-only operation

User says: _"A regular user shouldn't be able to hit the admin tenant-create endpoint."_

1. **Principals** — admin token (should work), regular `USER_ACCESS_TOKEN_FULL` (should be denied at the function level).
2. **Risk** — API5 (BFLA).
3. **Test** — `Verify POST /admin/tenants returns 403 for a non-admin token`: send a valid `buildCreateTenantBody()` payload with the regular token, assert `403` and empty body (`expect(body).toBeNull()` per the 403 envelope). The functional suite already proves the admin path returns `200` — this proves the deny path.
4. **Guard** — if no non-admin token is provisioned, comment out with `// TODO: FIXME:` rather than skipping.

### Example 3 — Stored XSS on a UI-created resource name

User says: _"Check the monitor-name field is safe against XSS."_

1. **Risk** — A03 Injection/XSS, from `web-top10.md`.
2. **Input path** — create a synthetic whose `name` is an XSS payload (e.g. an `<img onerror>` string from a curated payload array in `test-data/`), via API or the Page Object.
3. **Reject branch** — if the contract rejects it, assert `400` + `APIErrorSchema`.
4. **Safe-render branch** — if it's accepted, navigate to where the name renders and assert the payload appears as **inert text**, not an executed script: the text is visible via `getByText(rawPayload)` and no dialog/script fired. Never use `page.evaluate` to probe the DOM (framework rule) — assert through locators.
5. **Finding** — a rendered/executed payload is a bug; capture and report.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cross-tenant test returns `200` with the other tenant's data | Real BOLA vulnerability | Do not adjust the assertion. Comment out + `// TODO: FIXME: <TICKET>`, report via `bug-helper`. This is the win, not a test failure. |
| BFLA test can't run — no non-admin token | Under-privileged principal not provisioned | Comment out with `// TODO: FIXME: re-enable when a non-admin/no-scope token is added` (mirrors the `USER_ACCESS_TOKEN_ZERO` 403 caveat in `api-testing`). Never assert against the admin token instead. |
| `Schema.parse(body)` throws on a 403 security test | 403 has an empty body; parsing `null` against an object schema fails | Assert `expect(body).toBeNull()` for 403/405; use `GatewayErrorSchema` for 401. See `api-testing` § Error envelopes. |
| Injection test passes but you're unsure it proved anything | Only the input-reject branch was asserted | Add the safe-handling branch: assert the payload is neutralised where it is returned/rendered, not just rejected. |
| Team asks for "OWASP crypto / dependency coverage" in Playwright | Category is not black-box QA-automatable | Route to SAST / dependency scanning / crypto review; document the gap in the review. Do not write a hollow test. |
| Rate-limit test is flaky / hammers the API | Volumetric testing inside a functional spec | Move to `k6-load-testing` with explicit thresholds. Keep only a single "limit returns 429" functional assertion here. |

## See Also

- **`api-testing`** — the negative-test matrix (400/401/403/404/405/409), `apiRequest`, error envelopes, cleanup, and the comment-out-with-ticket bug convention. Security tests are negative tests; read this first.
- **`selectors`** — locator priority and safe DOM assertions for the UI/XSS render-branch checks (no `page.evaluate`).
- **`data-strategy`** — faker + synthetic payloads, curated invalid/malicious value arrays, no real PII.
- **`test-standards`** — tag whitelist (reuse the existing tag; add a security tag here first if the project wants one), `test.step`, placement.
- **`type-safety`** — `z.strictObject` schemas and the `expect(Schema.parse(body)).toBeTruthy()` idiom used in every assertion.
- **`k6-load-testing`** — the boundary for rate-limit / resource-consumption (API4) and any volumetric work.
- **`debugging`** — when a security test fails in a way that looks like flake rather than a finding.
- **`pr-review`** — the pre-push gate; pair with `review-checklist.md` for a security pass on the diff.
- **`bug-helper`** — filing a confirmed finding as a triaged bug.
- **[~/.claude/CLAUDE.md](~/.claude/CLAUDE.md)** — always-on framework invariants; this skill routes from its Routed Skill Index.
