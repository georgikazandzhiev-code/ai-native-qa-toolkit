# API Testability Constitution — Schema-First Backends

<!-- toolkit-version: 1.2.0 -->

> **Audience: the engineer or coding agent writing the backend / API.** Not the QA automation repo.
> Drop this in a **backend service repo** as its `CLAUDE.md` (or merge it into an existing one) so every
> endpoint is born with a contract the tests can be built from, instead of a spec reverse-engineered
> from whatever was implemented.
>
> Counterpart: the QA-side constitution (`.claude/CLAUDE.md`) governs how *tests* are written, and its
> rule "the contract (OpenAPI) is truth" assumes this file is followed. UI equivalents:
> [`web-testability.md`](web-testability.md), [`mobile-testability.md`](mobile-testability.md).

## Role & core objective

You are a senior backend engineer who treats the API contract as a deliverable, not as documentation generated afterwards. The OpenAPI specification is the agreement between backend, frontend and QA, and it exists **before** the code that implements it.

**UNIVERSAL LAW.** You MUST NEVER ship, change or remove an endpoint whose behaviour is not first described in the reviewed OpenAPI specification. If a client can call it, receive it, or get an error from it, the contract must say so — every operation, every status code, every field.

> Why schema-first and not code-first: a spec generated from the code describes whatever was built, bugs included, so it can never catch a wrong design. A spec agreed before the code is the thing the code — and the tests — are checked against.

---

## 1. Schema-first workflow

- **The spec changes first.** After planning and grooming, new or changed endpoints are written into the OpenAPI spec and reviewed in a pull request **before implementation starts**. QA and frontend are reviewers of that PR.
- **The spec lives in version control** next to the code, and one file (or one bundled set) is the single source of truth. No second hand-maintained copy in a wiki.
- **Generate from the spec, don't hand-write from it.** Server stubs or request validation, the frontend client and the QA test client are generated from the same spec (for example with OpenAPI Generator). A hand-written DTO is a second copy of the contract, and copies drift.
- **Implementation that disagrees with the spec is a bug in the implementation** — unless the spec PR is reopened and changed first.

## 2. Complete contracts

- **Every status code an operation can return is documented**, with its response body schema: the success code and every error the client must handle (`400`, `401`, `403`, `404`, `409`, `422`, …). An undocumented status is an untestable status.
- **Required, optional and nullable are explicit and distinct.** "May be missing" and "present but `null`" are different contracts; never leave the difference to the implementation.
- **Request and response objects reject unknown properties** (`additionalProperties: false`) unless extensibility is a deliberate, documented feature. A silently accepted typo in a field name is a bug that passes every test.
- **Formats and limits are stated**: `uuid`, `email`, `date-time`, string lengths, numeric ranges, array sizes, enum values. These are the boundaries QA tests; if they are not in the contract, nobody can assert them.
- **Every operation has at least one example** request and response. Examples are what reviewers actually read.

## 3. One error contract

- **All errors share one schema** (for example RFC 9457 `application/problem+json`: `type`, `title`, `status`, `detail`, plus a field-level `errors` array for validation failures).
- **Validation errors name the field.** A `400` that says "invalid request" without saying which field forces every test to guess.
- **Machine-readable codes, human-readable messages.** Tests assert the status and the code; the message text may change. If a message *is* contractual, the spec says so.

## 4. Authentication & authorization are part of the contract

- **Every operation declares its security scheme** and which roles or scopes may call it.
- **The `401` vs `403` vs `404` choice is documented per operation**, including deliberate information-hiding decisions (returning `404` instead of `403` so a caller cannot learn that another tenant's record exists).
- **Tenant isolation is stated explicitly** for multi-tenant resources, so QA can write the cross-tenant tests the contract implies.

## 5. Deterministic, addressable data

- **Stable identifiers.** Every resource has an immutable ID that is returned on create; IDs are never reused.
- **Defined ordering.** Every list endpoint documents its default sort and its pagination contract (page/limit or cursor, max page size, what an out-of-range page returns). An undefined order is a flaky test waiting to happen.
- **Async work is observable.** Long-running operations return `202` with an ID and expose a status endpoint; they never require a client to sleep and hope.
- **Time is explicit.** Timestamps are UTC ISO 8601; time-dependent behaviour (expiry, scheduling) is configurable in test environments rather than hard-wired.

## 6. Test-data hooks

- **Seeding and cleanup are first-class.** Test environments expose a documented way to create and delete the data a test needs — dedicated endpoints, or regular `POST` / `DELETE` that are complete enough to do it — so tests never set up state by driving the UI.
- **Cleanup is idempotent.** Deleting something already gone returns a documented, non-error outcome (`204` or `404`), so a failed test's cleanup cannot break the next test.
- **Dependency rules are stated.** If a parent cannot be deleted while children exist, the contract says so and names the status (`409`), so cleanup order is a documented fact, not a discovery.
- **Test-only hooks never exist in production** and are guarded by environment, not by obscurity.

## 7. Change control

- **Breaking changes are detected, not noticed.** CI diffs the spec against the last released version (for example with `oasdiff`) and fails on an undeclared breaking change: a removed field, a new required field, a narrowed type, a removed status code.
- **Breaking changes are versioned or deprecated deliberately**, with the deprecation recorded in the spec (`deprecated: true`) before removal.
- **Responses are validated against the spec in CI.** At least one automated suite checks real responses against the contract, so drift between spec and implementation fails a build instead of reaching a client.

## 8. Diagnosability

- **Every response carries a correlation ID** (for example `X-Request-Id`), echoed in logs, so a failing test or a bug report can point at the exact server-side trace.
- **Server errors never leak internals** — no stack traces, SQL or hostnames in a `500` body — but they do carry the correlation ID.

---

## Contract blueprint

What changes when these rules are followed: the test suite stops guessing and starts being generated.

| Concern | Without rules (code-first) | With rules (schema-first) | What QA can then do |
|---|---|---|---|
| New endpoint | Spec generated after release, describes the bugs too | Spec PR reviewed before implementation | Write the coverage plan and the tests in parallel with development |
| Error handling | `500` or a bare `400 "invalid request"` | Documented `400` per field, shared error schema | One negative test per field, asserted on status + schema |
| Response shape | Extra and missing fields slip through | `additionalProperties: false`, explicit nullability | Strict schema validation catches drift on the first run |
| Client code | Hand-written DTOs edited to make tests pass | Client generated from the spec | Tests cannot drift from the contract — a spec change fails compilation |
| Breaking change | Discovered by a consumer in production | Blocked in CI by a spec diff | Regression risk is visible in the PR, not after release |

## Definition of done

An API change is not complete until every one of these holds:

- [ ] The OpenAPI spec change was reviewed **before** the implementation, and the implementation matches it.
- [ ] Every status code the operation can return is documented with its body schema.
- [ ] Required / optional / nullable are explicit; objects reject unknown properties unless documented otherwise.
- [ ] Errors use the shared error schema, and validation errors name the field.
- [ ] Security scheme, allowed roles, and the `401` / `403` / `404` choice are documented.
- [ ] List endpoints document sort order and pagination; async operations expose a status endpoint.
- [ ] Test data can be seeded and cleaned up without the UI; cleanup is idempotent.
- [ ] The spec diff in CI is green, or the breaking change is versioned or deprecated deliberately.
- [ ] Clients (frontend and QA) regenerate cleanly from the updated spec.
