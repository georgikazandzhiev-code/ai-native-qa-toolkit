# OWASP API Security Top 10 (2023) — QA test recipes

## Contents
- API1 Broken Object Level Authorization (BOLA)
- API2 Broken Authentication
- API3 Broken Object Property Level Authorization (BOPLA)
- API4 Unrestricted Resource Consumption
- API5 Broken Function Level Authorization (BFLA)
- API6 Unrestricted Access to Sensitive Business Flows
- API7 Server-Side Request Forgery (SSRF)
- API8 Security Misconfiguration
- API9 Improper Inventory Management
- API10 Unsafe Consumption of APIs

Every recipe builds on the `api-testing` negative matrix — same `apiRequest`, fixtures, schema assertions, cleanup, and the comment-out-with-`// TODO: FIXME: <TICKET>` bug convention. A security test is a negative test with a second, wrong principal or a hostile payload. Most CRUD endpoints owe **API1 + API2 + API3 + API5** at minimum.

---

## API1 — Broken Object Level Authorization (BOLA)  ✅ top priority
- **Is:** an endpoint returns/mutates an object by id without checking the caller owns it. The most common, most damaging API flaw.
- **Recipe:** seed object as principal A (`beforeAll`). Request `GET/PUT/PATCH/DELETE /resource/:id` with principal B's token (different tenant / lower role). Assert `403` or `404` (404 preferred — hides existence) + `APIErrorSchema.parse(body)`. A `200`/`204` is the finding.
- **Test name:** `Verify GET /synthetics/:id returns 404 for a cross-tenant caller`.
- **Principal source:** a second tenant token, or `USER_ACCESS_TOKEN_ZERO`. If unprovisioned, comment out with a ticket.

## API2 — Broken Authentication  ✅ automatable
- **Is:** flawed token/session handling — accepts missing/expired/forged tokens, weak credential or reset flows.
- **Recipe:** missing token → omit `headers` → `401` + `GatewayErrorSchema`. Expired/wrong-issuer token → `401`. Malformed `Authorization` header → `401`. Password policy on register/reset → per-field validation loop → `400`. Logout invalidates the token (call a protected route after logout → `401`).
- **Note:** "no token" and "wrong-realm token" are distinct `401` tests — both belong.

## API3 — Broken Object Property Level Authorization (BOPLA)  ✅ automatable
- **Is:** endpoint exposes properties the caller shouldn't see (excessive data exposure), or lets them write properties they shouldn't (mass assignment).
- **Recipe (exposure):** assert the response schema for a lower-privileged principal **omits** sensitive fields (password hash, internal flags, other tenants' ids). `z.strictObject` helps — an unexpected field fails the parse.
- **Recipe (mass assignment):** send a create/update body with a privileged field the caller shouldn't set (`role: "admin"`, `tenantId: <other>`, `isVerified: true`); assert it's ignored or `400` — then GET and confirm the field did **not** change.

## API4 — Unrestricted Resource Consumption  ⚠️ boundary
- **Is:** no limits on rate, payload size, page size → DoS / cost abuse.
- **Recipe (functional only):** assert a documented limit exists — oversized page-size param is capped/rejected, oversized body → `413`, a documented rate limit returns `429`.
- **Boundary:** actual volumetric/throughput testing → `k6-load-testing` with thresholds. Do **not** loop floods inside a Playwright spec.

## API5 — Broken Function Level Authorization (BFLA)  ✅ high priority
- **Is:** a lower-role caller reaches an admin/privileged operation (often just a different verb or an `/admin` path).
- **Recipe:** call the privileged operation (`POST /admin/tenants`, `DELETE /users/:id`, an admin-only verb) with a regular/lower-role token. Assert `403` (empty body → `expect(body).toBeNull()`). The functional suite already proves the admin path works; this proves the deny path.
- **Test name:** `Verify POST /admin/tenants returns 403 for a non-admin token`.

## API6 — Unrestricted Access to Sensitive Business Flows  ⚠️ partial
- **Is:** a flow (signup, purchase, invite, vote) automatable at scale without throttling/anti-automation.
- **Recipe (functional):** assert business-logic guards — one-time actions can't be replayed, a required prior step can't be skipped, quantity/limit constraints hold. Assert the guard, not the volume.
- **Boundary:** anti-bot/scale abuse → security review + `k6-load-testing`.

## API7 — Server-Side Request Forgery (SSRF)  ✅ where a fetch exists
- **Is:** endpoint fetches a client-supplied URL, reaching internal/cloud-metadata resources.
- **Recipe:** for any URL/host/webhook param, submit internal targets (`http://localhost`, `http://127.0.0.1`, `http://169.254.169.254/latest/meta-data/`, private CIDRs, `file://`) and assert the endpoint rejects them per contract (`400`/validation) — not a `200` proving it dialled out.

## API8 — Security Misconfiguration  ✅ partly automatable
- **Is:** missing headers, verbose errors, CORS too open, unnecessary verbs enabled, default creds.
- **Recipe:** assert security headers present; errors return the typed envelope with **no** stack trace/version leak; disabled verbs → `405` (reuse the 405 catch-all loop); CORS doesn't reflect an arbitrary `Origin`; default credentials fail.
- **Boundary:** infra/container hardening → infra review.

## API9 — Improper Inventory Management  ⚠️ partial
- **Is:** undocumented/old/`/v1`/`/debug`/staging endpoints still live and unprotected.
- **Recipe:** assert deprecated/older-version routes are gone (`404`/`410`) or still enforce authz; assert non-prod/debug endpoints are unreachable in the target environment.
- **Boundary:** discovering shadow APIs → security review / API gateway inventory. QA verifies the **known** ones behave.

## API10 — Unsafe Consumption of APIs  ⚠️ partial
- **Is:** the app trusts third-party/upstream API data too much (no validation of downstream responses, following their redirects blindly).
- **Recipe:** where the app integrates an upstream service, assert it validates that response before use (malformed/hostile upstream payload is handled, not propagated). Often needs a mock/stub of the upstream.
- **Boundary:** full third-party trust-boundary analysis → integration/security review.
