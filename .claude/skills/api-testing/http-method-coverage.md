# HTTP Method Coverage Playbook

Per-verb test-coverage rules for every API spec under `tests/app/api/**`. Resource-agnostic — the structure below applies whether you are testing synthetics (any of the 7 monitor types: ICMP, HTTP, TCP, DNS, SSL, WebSocket, MCP), probes, admin tenants, admin users, tenant-side users, admin realms, tenant-schema, synthetic / data metrics, or any future resource.

> **Read first:** [SKILL.md](SKILL.md) for the workflow, source-of-truth philosophy, and `apiRequest` contract.
> **Companion plan:** [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md). Drift / planned items in this playbook cite numbered sections of that plan (e.g. "plan § 5.1") so you can trace each rule back to its convergence target.
> **Related:**
>
> - [reference.md](reference.md) — error catalogs, helper inventory, schema decision tree.
> - [templates.md](templates.md) — copy-paste skeletons (the CRUD spec template already wires up most of the shapes below).
> - [SKILL.md § Test Coverage Checklist](SKILL.md) — the canonical coverage list this playbook expands (sections 6, 8, 13, 14, 16).

This document is verb-keyed, not resource-keyed. There is **one** playbook for each method; the same rules apply to every resource. Pick the verb section that matches the endpoint under test, then walk the checklist.

## Index

- [§ 1. Universal coverage axes](#1-universal-coverage-axes)
- [§ 2. Mapping verb → coverage axes](#2-mapping-verb--coverage-axes)
- [§ 3. GET (collection / list)](#3-get-collection--list)
- [§ 4. GET (single / by-id)](#4-get-single--by-id)
- [§ 5. POST (create)](#5-post-create)
- [§ 6. POST (query-by-body — non-create)](#6-post-query-by-body--non-create)
- [§ 7. PUT (full replace)](#7-put-full-replace)
- [§ 8. PATCH (partial update)](#8-patch-partial-update)
- [§ 9. DELETE](#9-delete)
- [§ 10. HEAD / OPTIONS](#10-head--options)
- [§ 11. 405 catch-all](#11-405-catch-all)
- [§ 12. Cross-cutting axes](#12-cross-cutting-axes)
- [§ 13. Resource × method coverage matrix](#13-resource--method-coverage-matrix)
- [§ 14. Test-name templates per verb](#14-test-name-templates-per-verb)
- [§ 15. Per-verb anti-patterns](#15-per-verb-anti-patterns)
- [§ 16. Self-review checklist (per verb)](#16-self-review-checklist-per-verb)

---

## 1. Universal coverage axes

Every method, on every resource, is tested along the same eight axes. Methods differ only in **which** axes apply and **how**. Keep these axes in mind when reading any verb section below.

| Axis | Question it answers | Default assertion shape |
|------|---------------------|------------------------|
| **Status** | Does the endpoint return the right HTTP status for this scenario? | `expect(status).toBe(<n>)` |
| **Body schema** | Does the response body match the contract? | `expect(<Schema>.parse(body)).toBeTruthy()` |
| **Field semantics** | Did the right fields change / persist / get echoed? | `expect(body.<resource>.<field>).toBe(<value>)` |
| **Identity** | Is the entity the one we asked about (no cross-tenant leak, no mistaken id)? | `expect(body.<resource>.id).toBe(<expected>)` plus cross-tenant 404 contract |
| **Authentication** | Does each token / no-token scenario return the right status? | `expect(status).toBe(401 \| 403)` per token shape |
| **Idempotency / state** | Does repeating the call do the right thing (idempotent for GET/PUT/DELETE; non-idempotent but conflict-aware for POST/PATCH)? | scenario-specific — see verb sections |
| **Side effects** | What did this call mutate (Mailpit, downstream resource, cascade)? | follow-up GET / Mailpit assertion |
| **Method allowance** | Does the path reject the verbs it doesn't support? | `expect(status).toBe(405)` (see § 11) |

The `negative test matrix` in [SKILL.md § The negative test matrix](SKILL.md) enumerates which **status codes** every CRUD spec must cover. This playbook tells you which axes each **verb** must drive.

---

## 2. Mapping verb → coverage axes

Use this table to know up front what you owe before writing a spec. Each `✓` is a required test (or a required step inside a multi-step test); each `~` is conditional on the endpoint shape; `—` means the axis does not apply.

| Axis | GET-list | GET-by-id | POST-create | POST-query | PUT | PATCH | DELETE |
|------|:--------:|:---------:|:-----------:|:----------:|:---:|:-----:|:------:|
| 200/201 happy + schema | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pagination / sort / filter / search | ✓ | — | — | ~ | — | — | — |
| Field-by-field validation (loop) | — | — | ✓ | ~ | ✓ | ✓ | — |
| Empty body → 400 | — | — | ✓ | ✓ | ✓ | ✓ | — |
| Per-field isolation round-trip | — | — | — | — | — | ✓ | — |
| Full-replace verification | — | — | — | — | ✓ | — | — |
| Immutable-field rejection | — | — | ~ | — | ✓ | ✓ | — |
| State toggle (`enabled` ⇄ `disabled`) | — | — | — | — | — | ~ | — |
| Invalid id format → 400 | — | ✓ | — | — | ✓ | ✓ | ✓ |
| Non-existent id → 404 | — | ✓ | — | — | ✓ | ✓ | ✓ |
| Conflict / duplicate → 409 | — | — | ✓ | — | ~ | ✓ | ~ |
| Idempotency — repeat call | — | — | — | — | ✓ | — | ✓ (re-DELETE → 404) |
| Side-effect — GET-after | — | — | ✓ | — | ✓ | ✓ | ✓ (GET → 404) |
| Side-effect — Mailpit | — | — | ~ | — | — | — | — |
| Side-effect — cascade | — | — | — | — | — | — | ~ |
| 401 (no token) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 401 (wrong issuer / wrong realm) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 403 (`USER_ACCESS_TOKEN_ZERO`, scope-guarded) | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| 405 (this verb is wrong on this path) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

`~` rows are not optional — they are conditional on the endpoint:

- **Field-by-field validation (POST-query):** only when the request body has validatable fields (e.g. `POST /data/metrics` with `metrics`, `timeframe`, `aggregation`).
- **Immutable-field rejection (POST-create):** only when create accepts a field that is server-assigned (e.g. sending `id` / `tenantId` in the body).
- **Conflict (PUT):** only when the resource has a unique constraint that PUT could violate.
- **State toggle (PATCH):** only when the resource has a boolean / status enum the API exposes (`enabled` ⇄ `disabled`, `status: "enabled" \| "disabled"`).
- **Conflict (DELETE):** only when the resource is a parent in a 409-cascade (e.g. probe with bound synthetic).
- **Mailpit side-effect (POST-create):** only on resources whose creation triggers email (admin-users invite, tenant onboarding).
- **Cascade (DELETE):** only on parents whose children must follow (tenant → users; never the reverse — synthetic / probe ordering is the opposite, see § 9).
- **403 (ZERO):** every spec should cover **conceptually**, but guard with `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "ZERO token not provisioned")` per plan § 6.2 until the env var is provisioned (see [reference.md § Token catalog](reference.md#token-catalog)).

---

## 3. GET (collection / list)

**Intent:** read a paged collection of a resource scoped by token / path. Idempotent and safe.

**Examples in repo:** `GET /synthetics` ([icmp-synthetic-monitor.spec.ts:795](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)), `GET /probes` ([probes.spec.ts:324](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `GET /admin/tenants` ([admin-tenants.spec.ts:36](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)), `GET /admin/tenants/{id}/users` ([admin-users.spec.ts:41](../../../tests/app/api/tenant-service/admin-users.spec.ts)), `GET /users` ([user.spec.ts:48](../../../tests/app/api/tenant-service/user.spec.ts)).

### What to test

1. **Happy path** — `expect(status).toBe(200); expect(List<Resource>sResponseSchema.parse(body)).toBeTruthy();` — exercises both the envelope and the resource shape inside the array.
2. **Default pagination** — assert `body.pageInfo.page === 1`, `pageInfo.pageSize === 10` (project default), `body.<resourcePlural>.length <= pageInfo.pageSize`.
3. **Custom pagination** — pass `?page=N&pageSize=M`, assert echoed values and that `length === Math.min(M, totalElements)` and `totalPages === Math.ceil(totalElements / pageSize)`.
4. **Boundary pageSize** — happy path at the documented max (e.g. `pageSize=50` on synthetics) AND a 400 just past it (`pageSize=51`).
5. **Beyond-last-page** — `?page=999999` returns `200` with `length === 0`. Do **not** assert 404; the contract is "empty page, not error."
6. **Sort** — `?sort=<field>&direction=asc` and `direction=desc` each return 200 with valid items. **Do NOT assert exact ordering** — DB collation differs from JS string sort (see [SKILL.md § Anti-patterns](SKILL.md)).
7. **Filter / search** — at least one exact-match filter (`?name=<created>`) and one partial filter (substring) per filterable field; one cross-field search (`?search=...`) when supported.
8. **Empty result for non-matching filter** — `?name=nonexistent-<faker>` returns 200, `length === 0`, `totalElements === 0`.
9. **Auth coverage**:
   - 401 without token (omit `headers` entirely — never empty string).
   - 401 with admin token on a tenant-scoped list (synthetics rejects `USER_ACCESS_TOKEN_ADMIN` because admin has no tenant scope).
   - 403 with `USER_ACCESS_TOKEN_ZERO` if provisioned (skip-guarded otherwise).
10. **405** — at minimum, one wrong-verb on this collection path (covered by the spec's dedicated 405 block per § 11; do not duplicate inline).

### Don't test

- Exact ordering of sort results.
- Total-element counts (`totalElements === N`) — other tests in the same dev environment add and remove rows in parallel; assert relative invariants (`>= 1`, `<= pageSize`) instead.

### Skeleton

```typescript
test(
  "Verify GET /<resource>s returns 200 with valid schema and default pagination",
  { tag: "@App-API" },
  async ({ apiRequest }) => {
    qase.suite(SUITES.API_<RESOURCE>);
    const { status, body } = await list<Resource>s(apiRequest, process.env.USER_ACCESS_TOKEN_FULL!);
    expect(status).toBe(200);
    expect(List<Resource>sResponseSchema.parse(body)).toBeTruthy();
    expect(body.pageInfo.page).toBe(1);
    expect(body.pageInfo.pageSize).toBe(10);
    expect(body.<resource>s.length).toBeLessThanOrEqual(body.pageInfo.pageSize);
  },
);
```

---

## 4. GET (single / by-id)

**Intent:** read one resource by its server-assigned id. Idempotent.

**Examples in repo:** `GET /synthetics/{id}` ([icmp-synthetic-monitor.spec.ts:1111](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)), `GET /probes/{id}` ([probes.spec.ts:566](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `GET /admin/tenants/{id}` ([admin-tenants.spec.ts:672](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)), `GET /admin/tenants/{id}/users/{userId}` ([admin-users.spec.ts:808](../../../tests/app/api/tenant-service/admin-users.spec.ts)), `GET /probes/{id}/config` ([probes.spec.ts:1218](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `GET /tenants/schema` ([tenant-schema.spec.ts:21](../../../tests/app/api/tenant-service/tenant-schema.spec.ts)).

### What to test

1. **Happy path** — `200` + `Get<Resource>ResponseSchema.parse(body)` + every echoed field equals the request payload (see § 12 for setup-then-read).
2. **Identity** — `expect(body.<resource>.id).toBe(<resourceId>)` so a cross-tenant or wrong-id leak fails loudly.
3. **Invalid id format** — loop over `["!@#$%", "null", "<script>"]` (or use `invalidString` from [`fixtures/api/invalid-types`](../../../fixtures/api/invalid-types.ts)). Each must return **400** with `APIErrorSchema.parse(body)`.
4. **Non-existent id** — use `nonExistentId` from `test-data/app/<resource>.json` (or a fresh `faker.string.uuid()`). Returns **404** with `APIErrorSchema.parse(body)`.
5. **Cross-tenant access** — Tenant A's token on Tenant B's resource → **404, not 403**. See [`tests/app/api/shared/cross-tenant-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-isolation.spec.ts) and [`tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts) for both shapes (tenant-scoped via token, admin-scoped via tenantId-in-path).
6. **Auth coverage** — 401 (no token), 401 (admin token on tenant-scoped resource), 403 (ZERO if provisioned).
7. **GET-after-DELETE** — covered by the DELETE spec (see § 9), not duplicated here.

### Don't test

- 400 invalid id at the same time as 404 non-existent — they must be **distinct** tests. Same status both ways means the API can't distinguish "malformed input" from "lookup miss," which is a real bug worth flagging if observed.

---

## 5. POST (create)

**Intent:** create a new resource and return its id (and sometimes the created entity).

**Examples in repo:** `POST /synthetics` (× 7 monitor types — [icmp](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts:117) / [http](../../../tests/app/api/monitoring-service/synthetics/http-synthetic-monitor.spec.ts:72) / [tcp](../../../tests/app/api/monitoring-service/synthetics/tcp-synthetic-monitor.spec.ts:60) / [dns](../../../tests/app/api/monitoring-service/synthetics/dns-synthetic-monitor.spec.ts:59) / [ssl](../../../tests/app/api/monitoring-service/synthetics/ssl-synthetic-monitor.spec.ts:67) / [websocket](../../../tests/app/api/monitoring-service/synthetics/websocket-synthetic-monitor.spec.ts:72) / [mcp](../../../tests/app/api/monitoring-service/synthetics/mcp-synthetic-monitor.spec.ts:58)), `POST /probes` ([probes.spec.ts:96](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `POST /admin/tenants` ([admin-tenants.spec.ts:401](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)), `POST /admin/tenants/{id}/users` ([admin-users.spec.ts:457](../../../tests/app/api/tenant-service/admin-users.spec.ts)), `POST /admin/realms` ([admin-realms.spec.ts:105](../../../tests/app/api/tenant-service/admin-realms.spec.ts)).

> **Status mapping varies.** Synthetics + probes return `201`; admin-tenants / admin-users / admin-realms return `200`. Match the actual endpoint — never hardcode.

### What to test

1. **Happy path** — assert the right status (`201` for synthetics/probes, `200` for admin-side), parse `Create<Resource>ResponseSchema`, push the returned id into `createdIds[]` for `afterAll` cleanup. Push **before** the GET-after step in case GET fails.
2. **GET-after-create** — fetch the created entity by id and assert each field of the request payload was persisted (`name`, `target`, `type`, `checkInterval`, `timeout`, `status: "enabled"`, etc.). For synthetics, assert `body.synthetic.tests[0].probeId === probeId` and `body.synthetic.tests[0].type === <monitorType>`.
3. **Cross-list verification** — at least one POST test that confirms the new entity appears in `GET /<resource>s?name=<created>`. See [`icmp-synthetic-monitor.spec.ts:168`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts).
4. **Body-shape variants** — for resources with multiple shapes, write one happy-path per shape (synthetics by monitor type, probe by deployment kind, etc.). Mirror the per-type config: ICMP target = IPv4, HTTP target = `https://...`, WebSocket target = `wss://...`, etc. (see [templates.md § 8](templates.md)).
5. **Empty body** → 400 + `APIErrorSchema`.
6. **Missing each required field** — write one test per required field, deleting it from a valid payload. (Synthetics: `name`, `target`, `type`, `probeIds`, `config`, `checkInterval`, `timeout`. Admin user: `email`, `firstName`, `lastName`. Admin tenant: `name`.)
7. **Invalid type per field** — loop over `invalidString` / `invalidIntegerTypes` / `specialChars` / `boundaryString` from [`fixtures/api/invalid-types`](../../../fixtures/api/invalid-types.ts) for each field. Each invalid value → 400 + `APIErrorSchema`.
8. **Duplicate / conflict** → 409 + `APIErrorSchema`. Examples: tenant with existing name; probe with existing name; user invite with existing email.
9. **Auth coverage** — 401 (no token), 401 (admin token on tenant-scoped POST), 403 (ZERO if provisioned).
10. **405** — covered by the dedicated 405 block per § 11.

### Side effects

- **Mailpit-bearing creates** (`POST /admin/tenants/{id}/users`, tenant-onboarding flows): purge the recipient's mailbox **before** the POST, then assert one email arrives via `getInviteLinkFromEmail(mailpit, email)` or `mailpit.getLastEmail`. Recipient must be `@<your-test-domain>` per [SKILL.md § Anti-patterns](SKILL.md). `generateUserPayload()` currently emits `@automation.test` (broken — plan § 4.1); for E2E build the payload locally with `@<your-test-domain>`.
- **Probe-bound creates** (`POST /synthetics`): the synthetic body must include valid `probeIds`. Empty `config: {}` returns 400 — every monitor type requires its type-specific config keys (see [reference.md](reference.md) and [templates.md § 8](templates.md)).
- **Cascading registrations** (`POST /admin/tenants` triggers realm creation in Keycloak): no separate test, but cleanup must call `deleteTenant` to remove the realm.

### Don't test

- Server-assigned fields in the request body. If the API silently ignores `id`, that is a separate (immutability) test, not a happy-path test.
- The exact `body.status` string from the modify envelope unless your schema asserts it via `z.enum([...])`. Otherwise it's assertion brittleness.

---

## 6. POST (query-by-body — non-create)

**Intent:** a `POST` whose body is a query payload, not a create payload. The response is data, not a created entity. Common when the query is too rich for query-string params (large id arrays, nested filters, complex aggregations).

**Examples in repo:** `POST /probes/list` ([probes.spec.ts:1097](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) — fetch probes by id array), `POST /data/metrics` ([data-metrics.spec.ts:149](../../../tests/app/api/monitoring-service/metrics/data-metrics.spec.ts) — query aggregated metrics across monitor types).

### What to test

1. **Happy path per shape** — one test per body variant (per monitor type, per timeframe, per aggregation). `200` + result-set schema.
2. **Result correctness** — assert the response only contains rows matching the request (e.g. all returned probes are in the requested id array; all returned metrics carry the requested testId).
3. **Empty result** — query for ids that don't exist or a timeframe with no data → 200 + empty result set (not 404).
4. **Empty body** → 400.
5. **Each required field missing** → 400 (e.g. omit `metrics`, `timeframe`, `aggregation`).
6. **Invalid type per field** — bad enum values for `aggregation`, malformed timeframe strings, non-uuid ids → 400.
7. **Auth coverage** — 401 (no token), 403 (ZERO if provisioned).
8. **Cross-tenant** — Tenant A queries Tenant B's `testId` → 200 with empty result OR 404 (depending on contract). For data-metrics the contract is "no leak" — see [`cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts).
9. **405** — `GET /data/metrics` and `PATCH /data/metrics` (etc.) → 405. Covered by the 405 block.

### Don't test

- 201. POST-query never creates anything; success is **200**, not 201.
- Pagination params unless the endpoint actually supports them — most query-by-body endpoints return the full result and rely on the body filter to bound size.

---

## 7. PUT (full replace)

**Intent:** replace the entire resource. Sending a partial body must fail.

> **No PUT endpoints exist in this API at the time of writing** — every "update" endpoint is `PATCH`. This section is the playbook to use **when** PUT is added (or if you need to test 405 against PUT on a path that only supports PATCH). The shape mirrors upstream's PUT specs ([assetsCRUD.spec.ts:350](<upstream-repo>/tests/back/api/assetsCRUD.spec.ts), [assetsPairs.spec.ts:321](<upstream-repo>/tests/back/api/assetsPairs.spec.ts)).

### What to test

1. **Happy path with full body** — send every required field, `200` + `Update<Resource>ResponseSchema.parse(body)`. Then `GET /<resource>/{id}` and assert **every** field equals the new body (not the old state).
2. **Field-by-field replacement** — one test per field: send all required fields but vary one. GET-after to prove only that field changed and the rest match the new body.
3. **Cleared fields** — fields **not** in the PUT body must be reset / cleared (the distinguishing PUT trait vs PATCH). Verify with GET-after.
4. **Missing required field** → 400 (PUT requires the complete object).
5. **Invalid type per field** — loop per field with `invalidString` / `invalidIntegerTypes`; all → 400.
6. **Empty body** → 400.
7. **Invalid id format** → 400.
8. **Non-existent id** → 404.
9. **Immutable fields** — fields like `id`, `email`, `type` must be unchanged after PUT even when sent with a different value. GET-after verifies.
10. **Conflict** → 409 if the resource has a uniqueness constraint (renaming to an existing name).
11. **Auth coverage** — 401 (no token / wrong issuer), 403 (ZERO).
12. **405** — covered by the 405 block when the path only supports PATCH.

### Don't test

- Partial-body happy path (that's PATCH semantics — must return 400 here).
- Field preservation (that's PATCH semantics — fields not in PUT body must be cleared).

---

## 8. PATCH (partial update)

**Intent:** update one or more fields of a resource without sending the rest. Unchanged fields must persist.

**Examples in repo:** `PATCH /synthetics/{id}` ([icmp-synthetic-monitor.spec.ts:1253](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) and one PATCH block per other monitor type), `PATCH /probes/{id}` ([probes.spec.ts:676](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `PATCH /admin/tenants/{id}` ([admin-tenants.spec.ts:825](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)), `PATCH /admin/tenants/{id}/users/{userId}` ([admin-users.spec.ts:1001](../../../tests/app/api/tenant-service/admin-users.spec.ts)), `PATCH /users/{id}` ([user.spec.ts:1032](../../../tests/app/api/tenant-service/user.spec.ts)), `PATCH /admin/realms` ([admin-realms.spec.ts:211](../../../tests/app/api/tenant-service/admin-realms.spec.ts)).

### What to test

1. **Per-field isolation — one test per updatable field.** This is the most rigorous shape and the most-cited project gotcha. Each test follows the GET-PATCH-GET pattern:
   1. **GET-before**: snapshot the current entity into `before`.
   2. **PATCH** with `{ <singleField>: <newValue> }` (only that field). Assert `200` + `Update<Resource>ResponseSchema`.
   3. **GET-after**: assert `body.<field> === <newValue>` AND every other field equals `before.<field>`.

   See [`icmp-synthetic-monitor.spec.ts:1311–1518`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) for the canonical implementation across `name`, `target`, `checkInterval`, `timeout`, `status`. Repeat the pattern for every updatable field on the resource.

2. **PATCH preserves unchanged fields explicitly** — at least one test where a single PATCH is followed by a GET that asserts every non-touched field is unchanged from `before`. (Some specs combine this with the per-field tests; either is fine.)

3. **State toggle round-trip** — for resources with `enabled` ⇄ `disabled` (or any boolean / enum state), PATCH to the off-state, GET to confirm, PATCH back to on-state, GET to confirm. See [`icmp-synthetic-monitor.spec.ts:1459`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts).

4. **Empty body** → 400 + `APIErrorSchema`. (`PATCH /admin/realms` now enforces this — `admin-realms.spec.ts` has active 400 tests for empty body, `settings: null`, wrong-type `settings`, and unknown keys.)

5. **"One invalid + rest valid" per field** — for each field, send a valid full body with one field replaced by an invalid value (loop `invalidString` / `invalidIntegerTypes` / `specialChars`). Each combo → 400. This isolates per-field validation in the way [SKILL.md](SKILL.md) prescribes.

6. **Immutable fields** — sending `id`, `type`, `email`, `tenantId`, etc. must either be silently ignored (assert via GET-after-unchanged) **or** rejected (assert 400). Do not assume — observe the contract per resource.

7. **Invalid id format** → 400. Loop `["!@#$%", "null", "<script>"]`.

8. **Non-existent id** → 404. Send a **valid** body — an invalid body fails validation first and returns 400 before the resource lookup (`PATCH /synthetics/{id}` covers both branches in an active test in `icmp-synthetic-monitor.spec.ts`).

9. **Conflict** → 409 (renaming to an existing name; for tenants and admin-tenants this is exercised — see [`admin-tenants.spec.ts:924`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)).

10. **Cross-tenant** — Tenant A's token PATCH on Tenant B's resource → **404, not 403**.

11. **PATCH on already-DELETEd entity** → 404 (covered by the DELETE spec, see § 9 and [`admin-tenants.spec.ts:1178`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)).

12. **Auth coverage** — 401 (no token), 401 (admin token on tenant-scoped PATCH), 403 (ZERO; for admin-scoped PATCH, also test tenant-scoped tokens are rejected — see [`admin-tenants.spec.ts:1012`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)).

13. **405** — wrong verb on `/<resource>` collection (no `:id`) → 405. Covered by the 405 block.

### GET-merge-PATCH for `allOf` schemas

When the API uses JSON-Schema `allOf` discriminated by a field (synthetics dispatch on `type`), a partial PATCH that omits the discriminator can be **rejected** because the body is validated against the wrong branch. Solution: merge the partial fields into a fresh GET response and resend the union (see `patchPartial` helper at [`icmp-synthetic-monitor.spec.ts:1258`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)). This is a project-specific quirk — encode it inline in the per-resource helper, do not push it into a generic shared helper.

### Don't test

- "PATCH + GET" without a separate before-snapshot — half the PATCH semantic guarantee is "untouched fields persist." Without `before`, you cannot prove that.
- The same field's per-isolation case twice (once in a "PATCH name" test and again inside a "PATCH everything" test). Pick one shape per field.

---

## 9. DELETE

**Intent:** remove a resource by id. Idempotent at the contract level (re-DELETE returns 404, not 200).

**Examples in repo:** `DELETE /synthetics/{id}` ([icmp-synthetic-monitor.spec.ts:1797](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)), `DELETE /probes/{id}` ([probes.spec.ts:967](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)), `DELETE /admin/tenants/{id}` ([admin-tenants.spec.ts:1043](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)), `DELETE /admin/tenants/{id}/users/{userId}` ([admin-users.spec.ts:1324](../../../tests/app/api/tenant-service/admin-users.spec.ts)), `DELETE /users/sessions/{sessionId}` ([user.spec.ts:730](../../../tests/app/api/tenant-service/user.spec.ts)).

### What to test

1. **Happy path** — `200` + `Delete<Resource>ResponseSchema.parse(body)` + `body.<resource>Id === <deletedId>` + `body.status === "deleted"`. Capture into a multi-step test that also covers items 2–3.
2. **GET-after-DELETE** → 404 + `APIErrorSchema` (the entity is gone).
3. **Re-DELETE same id** → 404 + `APIErrorSchema` (idempotency-as-404, not idempotency-as-200). See [`icmp-synthetic-monitor.spec.ts:1847`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) and [`admin-tenants.spec.ts:1139`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts).
4. **Invalid id format** → 400. Loop `["!@#$%", "null", "<script>"]`.
5. **Non-existent id** → 404 + `APIErrorSchema` (distinct test from re-DELETE — different semantic).
6. **Cross-tenant** — Tenant A's token DELETE on Tenant B's resource → **404, not 403**.
7. **PATCH-after-DELETE** → 404 (covers a missed-cache class of bug; one test in admin-tenants — see [`admin-tenants.spec.ts:1178`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts)).
8. **Cascade** — for resources whose deletion must propagate, write a dedicated cascade spec. Today: `DELETE /admin/tenants/{id}` cascades to its users — see [`tenant-cascade.spec.ts:26`](../../../tests/app/api/tenant-service/tenant-cascade.spec.ts) (after tenant DELETE, GET each user → 404 and GET user list → 404).
9. **Conflict** — for resources that are referenced by another (probe still bound to a synthetic) → **409**. Cleanup ordering exists exactly because of this: `cleanupProbesAndSynthetics` deletes synthetics first, probes second. See [SKILL.md § Cleanup patterns](SKILL.md).
10. **Auth coverage** — 401 (no token), 401 (admin token on tenant-scoped DELETE — see [`icmp-synthetic-monitor.spec.ts:1895`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)), 403 (ZERO).
11. **405** — wrong verb on the collection path (e.g. DELETE on `/synthetics` without `:id`) → 405. Covered by the 405 block.

### Don't test

- 204 status — this API uses **200 with a body** for DELETE, not 204 No Content. Match the actual contract.
- DELETE in a `try { … } finally { delete } catch { … }` shape inside a positive-DELETE test. The positive-DELETE test **is** the cleanup; do not delete twice.

---

## 10. HEAD / OPTIONS

**Intent:** HEAD returns headers without the body; OPTIONS returns allowed methods (CORS preflight).

> **No HEAD or OPTIONS endpoints exist in this API today.** No specs need to test them. Two exceptions:
>
> - **CORS preflight via OPTIONS** is exercised implicitly by the browser when `tests/app/e2e/**` runs against the UI. No API spec needs to check it.
> - **HEAD on a real path** to probe for existence — not used in the contract; do not invent it.

If a future endpoint adds HEAD/OPTIONS, the playbook is:

- **HEAD** — `200` with `body === null`. Headers must match the GET equivalent (no extra `Content-Length` enforcement — Playwright normalizes).
- **OPTIONS** — `200`/`204` + `Allow` header listing the supported methods. Assert each documented method appears in `Allow`.

In every spec, HEAD and OPTIONS are still exercised by the **405 catch-all** (see § 11) — when the path doesn't support them, the loop will fail loudly because the response is 200/204 instead of 405. That is a real signal worth investigating, not a flake.

---

## 11. 405 catch-all

**Intent:** prove every wrong verb on every supported path returns `405 Method Not Allowed`.

**Examples in repo:** `405 Method Not Allowed - Unsupported HTTP methods` block in [`icmp-synthetic-monitor.spec.ts:1918`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) and [`probes.spec.ts:1384`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts). Other specs inline a 405 row in their PATCH/DELETE block.

### Pattern — single test, loop INSIDE

The non-negotiable shape: **one** test that loops over the unsupported methods, with the loop **inside** `test()`. Do **not** loop outside `test()` — that creates one separate test per method and inflates the report without adding signal.

```typescript
test.describe("405 Method Not Allowed - Unsupported HTTP methods", () => {
  const UNSUPPORTED_COLLECTION = ["PUT", "PATCH", "DELETE"] as const;
  const UNSUPPORTED_RESOURCE = ["POST"] as const;

  test(
    "Verify unsupported methods on /<resource>s return 405",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
      qase.suite(SUITES.API_<RESOURCE>);
      for (const method of UNSUPPORTED_COLLECTION) {
        const { status } = await apiRequest({
          method,
          url: appConfig.api.<RESOURCE>,
          baseUrl: appConfig.apiUrl,
          headers: process.env.USER_ACCESS_TOKEN_FULL!,
          body: method !== "DELETE" ? {} : undefined,
        });
        expect(status, `${method} /<resource>s`).toBe(405);
      }
    },
  );

  test(
    "Verify unsupported methods on /<resource>s/{id} return 405",
    { tag: "@App-API" },
    async ({ apiRequest }) => {
      qase.suite(SUITES.API_<RESOURCE>);
      for (const method of UNSUPPORTED_RESOURCE) {
        const { status } = await apiRequest({
          method,
          url: `${appConfig.api.<RESOURCE>}/${faker.string.uuid()}`,
          baseUrl: appConfig.apiUrl,
          headers: process.env.USER_ACCESS_TOKEN_FULL!,
          body: {},
        });
        expect(status, `${method} /<resource>s/{id}`).toBe(405);
      }
    },
  );
});
```

### Coverage rules

- **Always two tests:** one for the **collection** path (no `:id`) and one for the **resource** path (with `:id`). The supported methods differ between them — list collection rejects PUT/PATCH/DELETE; resource path rejects POST.
- **Resource-path id can be a real id or `faker.string.uuid()`.** Both work; the verb gate is hit before the lookup. Synthetics uses `faker.string.uuid()` ([icmp:1953](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)); probes uses a real `sharedProbeId` ([probes:1420](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)). Either is fine — pick whichever simplifies setup in your spec.
- **Pass `body: {}` for non-DELETE verbs (defensive).** Probes does not ([probes:1418](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)) and works; synthetics does ([icmp:1935](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts)) and works. New code should pass `body: {}` to make the 405 deterministic across gateway implementations and avoid a class of "silent 400 instead of 405" bug.
- **`expect(status, "<method> /<path>")`** — pass the descriptive message so the failure log says `"PATCH /synthetics: expected 405, received 200"` instead of an anonymous status mismatch.
- **`body === null`** — don't bother asserting; 405 responses don't carry a structured body. The status alone is the contract.
- **Run on the canonical token** (`USER_ACCESS_TOKEN_FULL` for tenant-scoped, `USER_ACCESS_TOKEN_ADMIN` for admin-scoped) — the request must reach the method-allowance check, not be rejected at auth.

### Per-resource scope (today)

| Resource | Collection forbidden | Resource forbidden | Spec block |
|----------|---------------------|--------------------|-----------|
| `/synthetics` | `PUT`, `PATCH`, `DELETE` | `POST` | [`icmp-synthetic-monitor.spec.ts:1918`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) |
| `/probes` | `PUT`, `PATCH`, `DELETE` | `PUT`, `POST` | [`probes.spec.ts:1384`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) |
| `/admin/tenants` | `PUT`, `PATCH`, `DELETE` | `POST`, `PUT` | [`admin-tenants.spec.ts`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts) §405 |
| `/admin/tenants/{id}/users` | `PUT`, `PATCH`, `DELETE` | `POST`, `PUT` | [`admin-users.spec.ts`](../../../tests/app/api/tenant-service/admin-users.spec.ts) §405 |
| `/users` | `DELETE`, `PATCH`, `PUT` | `DELETE`, `POST`, `PUT` | [`user.spec.ts`](../../../tests/app/api/tenant-service/user.spec.ts) §405 |
| `/admin/realms` | `PUT`, `DELETE` | — (no by-id endpoint) | [`admin-realms.spec.ts`](../../../tests/app/api/tenant-service/admin-realms.spec.ts) §405 |

> **Resolved (2026-06-24):** all four previously-drifting resources now have a dedicated 405 block — `user` was the last, closed in this PR. No 405 drift remains in `tests/app/api/**`. `/users` also covers `/users/sessions/{sessionId}` (forbidden: `POST`). The probe block ([`probes.spec.ts:1384`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts)) remains the cleanest copy-target for new resources.

---

## 12. Cross-cutting axes

These cut across every method. Document them once per resource; don't fold them into individual verb tests.

### 12.1 Cross-tenant isolation

**Contract:** every endpoint scoped by tenant must return **404, not 403** when accessed across tenants. This is the contract because 403 leaks the existence of the resource; 404 doesn't.

- Tenant-scoped resources (synthetic, probe, tenant-side user, metrics) — the **token enforces** tenancy. Tenant A's token on Tenant B's resource → 404. See [`cross-tenant-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-isolation.spec.ts).
- Admin-scoped resources (admin user) — **`tenantId`-in-path enforces** tenancy. Asking under Tenant B for a user that lives in Tenant A → 404. See [`cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts) and [templates.md § 7](templates.md).

Cover **GET, PATCH, DELETE** at minimum. POST cross-tenant is implicit (you can only POST under your own token). The spec is dedicated, not folded into the per-resource CRUD spec.

### 12.2 Authentication coverage matrix

The contract distinguishes **wrong realm** (401, gateway rejects) from **wrong scope** (403, app rejects after the gateway lets the request through). Tenant-scoped paths reject the admin token as 401; admin-scoped paths reject the tenant-scoped token as 403. Encode each row that applies per-method per-spec.

| Token | What it represents | Tenant-scoped path | Admin-scoped path |
|-------|--------------------|-------------------|-------------------|
| no `headers` | Unauthenticated | 401 + `APIErrorSchema` / `GatewayErrorSchema` | 401 + `APIErrorSchema` / `GatewayErrorSchema` |
| `process.env.USER_ACCESS_TOKEN_FULL` | Valid tenant-scoped token | 2xx happy path | **403** (wrong scope — see [`admin-tenants.spec.ts:348`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts) `... returns 403 for tenant-scoped user`) |
| `process.env.USER_ACCESS_TOKEN_ADMIN` | Admin / master-realm token | **401** (wrong realm — see [`probes.spec.ts:549`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) `... returns 401 with admin token (tenant-scoped endpoint)`) | 2xx happy path |
| `process.env.USER_ACCESS_TOKEN_ZERO` | Valid token, no permissions | 403 + `expect(body).toBeNull()` (where applicable) | 403 |
| Wrong-realm / wrong-issuer | Real token, wrong issuer | 401 + `GatewayErrorSchema` | 401 + `GatewayErrorSchema` |

**Required rows per spec:**

- **No-token 401** — every method, every spec.
- **Wrong-realm 401 (admin → tenant path)** — every method on every tenant-scoped spec. Use the `... returns 401 with admin token (tenant-scoped endpoint)` test-name shape.
- **Wrong-scope 403 (tenant → admin path)** — every method on every admin-scoped spec. Use the `... returns 403 for tenant-scoped user` test-name shape.
- **403 ZERO** — every method, every spec, **once provisioned**. Until then, guard with `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "ZERO token not provisioned")` per plan § 6.2 ([reference.md § Token catalog](reference.md#token-catalog)).
- **Wrong-issuer 401** — at minimum once per spec; cover thoroughly in the dedicated cross-tenant specs ([`cross-tenant-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-isolation.spec.ts), [`cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts)). Skip with a drift note if no canned wrong-realm token exists.

### 12.3 Cascade & dependency rules

| Resource pair | Rule | Cleanup ordering |
|---------------|------|------------------|
| Synthetic ⤴ Probe | Synthetic references probe; deleting probe first → 409 | Synthetics-first, probes-second (`cleanupProbesAndSynthetics`) |
| Tenant ⤴ Users | Deleting tenant cascades to its users (GET each user → 404) | Tenant DELETE handles user removal; explicit user-cleanup is redundant after tenant DELETE — see [`tenant-cascade.spec.ts`](../../../tests/app/api/tenant-service/tenant-cascade.spec.ts) |
| Tenant onboarding ⤴ Mailpit | POST user triggers an invite email | Cleanup order in E2E: emails → users → tenant — see [templates.md § 6](templates.md) |

### 12.4 Side-effect verification

Every method that mutates state owes a follow-up GET (or Mailpit assertion):

- **POST-create:** GET-after to confirm persistence. Mailpit-after when invite email is part of the contract.
- **PATCH:** GET-after to confirm the field changed AND others persisted (per § 8).
- **PUT:** GET-after to confirm full-replace AND non-sent fields are cleared (per § 7).
- **DELETE:** GET-after to confirm 404 (per § 9).

A status-200 alone is **never** sufficient evidence that the call did what it claims.

---

## 13. Resource × method coverage matrix

State of `tests/app/api/**` today. Use as a gap report when planning new specs.

| Resource | Spec | List | By-id | POST-create | POST-query | PUT | PATCH | DELETE | 405 (dedicated) | Cascade |
|----------|------|:----:|:-----:|:-----------:|:----------:|:---:|:-----:|:------:|:----:|:-------:|
| Synthetics — collection | [`icmp-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts) | ✓ | ✓ | ✓ (icmp) | — | — | ✓ | ✓ | ✓ | ✓ (probe-bound) |
| Synthetics — HTTP | [`http-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/http-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Synthetics — TCP | [`tcp-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/tcp-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Synthetics — DNS | [`dns-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/dns-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Synthetics — SSL | [`ssl-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/ssl-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Synthetics — WebSocket | [`websocket-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/websocket-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Synthetics — MCP | [`mcp-synthetic-monitor.spec.ts`](../../../tests/app/api/monitoring-service/synthetics/mcp-synthetic-monitor.spec.ts) | (shared) | (shared) | ✓ | — | — | ✓ | (shared) | (shared) | (shared) |
| Probe | [`probes.spec.ts`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) | ✓ | ✓ | ✓ | ✓ (`/probes/list`) | — | ✓ | ✓ | ✓ | ✓ (synthetic-bound) |
| Probe deploy config | [`probes.spec.ts § GET /probes/:id/config`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) | — | ✓ | — | — | — | — | — | — | — |
| Probe DTO schema | [`probes.spec.ts § GET /probes/schema`](../../../tests/app/api/monitoring-service/probes/probes.spec.ts) | ✓ (singleton) | — | — | — | — | — | — | — | — |
| Admin tenant | [`admin-tenants.spec.ts`](../../../tests/app/api/tenant-service/admin-tenants.spec.ts) | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ (→ users) |
| Admin user | [`admin-users.spec.ts`](../../../tests/app/api/tenant-service/admin-users.spec.ts) | ✓ | ✓ | ✓ (Mailpit) | — | — | ✓ | ✓ | ✓ | (parent: tenant) |
| Tenant-side user | [`user.spec.ts`](../../../tests/app/api/tenant-service/user.spec.ts) | ✓ | ✓ | ✓ | — | — | ✓ | ✓ session | ✓ | — |
| Admin realm | [`admin-realms.spec.ts`](../../../tests/app/api/tenant-service/admin-realms.spec.ts) | ✓ (singleton) | — | ✓ | — | — | (~ commented destructive) | — | ✓ | — |
| Tenant DTO schema | [`tenant-schema.spec.ts`](../../../tests/app/api/tenant-service/tenant-schema.spec.ts) | ✓ (singleton) | — | — | — | — | — | — | — | — |
| Synthetic metric definitions | [`synthetic-metrics.spec.ts`](../../../tests/app/api/monitoring-service/metrics/synthetic-metrics.spec.ts) | ✓ (per id) | — | — | — | — | — | — | — | — |
| Data metrics | [`data-metrics.spec.ts`](../../../tests/app/api/monitoring-service/metrics/data-metrics.spec.ts) | — | — | — | ✓ (`/data/metrics`) | — | — | — | — | — |
| Data query | [`data-query.spec.ts`](../../../tests/app/api/monitoring-service/metrics/data-query.spec.ts) | ✓ (predefined) | — | — | — | — | — | — | — | — |
| Cross-tenant isolation | [`cross-tenant-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-isolation.spec.ts) | (verifies 404 cross-tenant on synthetic / probe) | | | | | | | | |
| Cross-tenant metrics | [`cross-tenant-metrics-isolation.spec.ts`](../../../tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts) | (verifies 404 cross-tenant on data + metrics) | | | | | | | | |
| Tenant onboarding (E2E) | [`e2e-tenant-onboarding-flow.spec.ts`](../../../tests/app/api/tenant-service/e2e-tenant-onboarding-flow.spec.ts) | (multi-step POST tenant + POST user + Mailpit + extract link) | | | | | | | | |
| Tenant cascade (E2E) | [`tenant-cascade.spec.ts`](../../../tests/app/api/tenant-service/tenant-cascade.spec.ts) | (DELETE tenant → 404 on each user) | | | | | | | | |

**405 drift — resolved (2026-06-24).** All four specs that previously lacked a dedicated 405 block (`admin-tenants`, `admin-users`, `user`, `admin-realms`) now have one; `user` was the last, closed in this PR. No 405 drift remains across `tests/app/api/**`.

---

## 14. Test-name templates per verb

The project's convention (per plan § 6.6, encoded in [SKILL.md](SKILL.md)) is:

```
Verify <METHOD> <path> returns <status> [with <reason>]
```

`<reason>` is short and behavior-focused; omit when status alone is unambiguous.

| Verb | Template | Concrete example |
|------|----------|------------------|
| GET-list | `Verify GET /<resource>s returns <status> [with <reason>]` | `Verify GET /synthetics returns 200 with valid schema and default pagination` |
| GET-by-id | `Verify GET /<resource>s/{id} returns <status> [with <reason>]` | `Verify GET /probes/{id} returns 404 for non-existent probe` |
| POST-create happy | `Verify POST /<resource>s creates <resource> and GET reflects it` (or `... returns 201 with valid schema`) | `Verify POST /synthetics creates ICMP monitor with all required fields and returns 201` |
| POST-create negative | `Verify POST /<resource>s returns <status> with <reason>` | `Verify POST /synthetics returns 400 with empty body` |
| POST-query | `Verify POST /<resource>s/<query-action> returns <status> for <subject>` | `Verify POST /data/metrics returns 200 for each monitor type` |
| PUT | `Verify PUT /<resource>s/{id} <semantic>` | `Verify PUT /assets/{id} replaces all fields and clears omitted ones` (when added) |
| PATCH per-field | `Verify PATCH /<resource>s/{id} updates <field> and GET reflects change` | `Verify PATCH /synthetics/{id} updates checkInterval and GET reflects change` |
| PATCH state-toggle | `Verify PATCH /<resource>s/{id} can <action> and re-<action> a <resource>` | `Verify PATCH /synthetics/{id} can deactivate and re-activate a monitor` |
| PATCH negative | `Verify PATCH /<resource>s/{id} returns <status> with <reason>` | `Verify PATCH /admin/tenant/{id} with empty body returns 400` |
| DELETE happy + 404 | `Verify DELETE /<resource>s/{id} deletes the <resource>, GET returns 404[, and re-delete returns 404]` | `Verify DELETE /synthetics/{id} deletes the monitor, GET returns 404, and re-delete returns 404` |
| DELETE cascade | `Verify DELETE <parent> cascades to its <children>` | `Verify DELETE tenant cascades to its users (GET users returns 404 after tenant deletion)` |
| 405 catch-all | `Verify unsupported methods on /<resource>s[/{id}] return 405` | `Verify unsupported methods on /synthetics return 405` |
| Cross-tenant | `Verify <ActorTenant>'s token cannot <verb> <Other>'s <resource>` | `Verify Tenant A's token cannot read Tenant B's synthetic` |

**Forbidden shapes** (per [SKILL.md § Anti-patterns](SKILL.md)):

- `should ...` / `it ...` prefixes.
- Free-form narrative titles ("monitor created and visible to user").
- Upstream's behavior-shaped `Verify <action> returns <status> with <reason>` form (used in upstream but not in this project).

---

## 15. Per-verb anti-patterns

### GET-list

- ❌ Asserting `pageInfo.totalElements === <fixed number>` — flaky on a shared dev environment.
- ❌ Asserting exact ordering on sort tests — DB collation differs from JS string sort.
- ❌ Listing 405 cases inline (`PATCH /synthetics`) instead of in the dedicated 405 block.

### GET-by-id

- ❌ Folding the 400-invalid-id case into the 404-non-existent test — they are distinct semantics and must be separate tests.
- ❌ Reading `body.<resource>.<field>` without first parsing through `Get<Resource>ResponseSchema` — the parse is the contract, not an extra.

### POST-create

- ❌ Hardcoding the expected status (`201` vs `200`). Match the actual endpoint — admin-tenants returns `200`, synthetics returns `201`.
- ❌ Skipping the GET-after step "to keep the test short." The GET-after **is** the persistence proof.
- ❌ Pushing the created id onto `createdIds[]` only inside the success branch. Push **before** GET-after — if GET-after fails, the entity still exists and `afterAll` must clean it.
- ❌ Using `@automation.test` or `@<alt-test-domain>` for Mailpit-bearing creates — Mailpit on test infra catches **only** `@<your-test-domain>` (plan § 4.1).

### POST-query

- ❌ Asserting `201`. Query-by-body is **200**, not 201.
- ❌ Treating an empty result as 404. Query-by-body returns `200` + empty result set.

### PUT

- ❌ Sending a partial body and expecting 200 — that's PATCH semantics. PUT requires the complete object.
- ❌ Asserting field preservation after PUT — fields not in the PUT body must be **cleared**, not preserved.

### PATCH

- ❌ Combined "PATCH all fields at once" tests without per-field isolation. The per-field tests are the **only** way to catch a bug where two fields overwrite each other server-side.
- ❌ Skipping the GET-before snapshot. Without `before`, "untouched fields persist" is unprovable.
- ❌ Sending the discriminator field (e.g. `type` for synthetics) inside the partial body without merging from a fresh GET. The `allOf` schema may dispatch on the wrong branch and reject. Use the `patchPartial` helper pattern (§ 8).

### DELETE

- ❌ Asserting `204` — this API uses `200` with a body.
- ❌ Calling DELETE inside both the test body and the cleanup. Remove the duplicate — the test body **is** the cleanup for the positive-DELETE case.
- ❌ Deleting probes before synthetics — 409. Use `cleanupProbesAndSynthetics`.

### 405

- ❌ Looping outside `test()` — creates one test per method and bloats the report.
- ❌ Sending the wrong-verb call without a body — some servers reject before the method check, returning a misleading 400. Pass `body: {}` for non-DELETE.
- ❌ Asserting a structured error body for 405 — there is none; 405 carries `body === null` (don't bother; the status is the contract).

---

## 16. Self-review checklist (per verb)

Before declaring a CRUD spec done, walk this list. Tick boxes only when the test exists **and** runs green locally.

### GET (list)

- [ ] Default pagination assertion (page 1, pageSize 10, length ≤ pageSize).
- [ ] Custom pagination round-trip and `totalPages` math.
- [ ] pageSize boundary happy path AND just-past-boundary 400.
- [ ] Sort asc + sort desc (no exact-ordering assertions).
- [ ] One filter (exact + partial) and one cross-field search.
- [ ] Empty-result for non-matching filter.
- [ ] 401 (no token) and 401 (admin token on tenant-scoped list).
- [ ] 403 (ZERO) — guard with `test.skip` if not provisioned.

### GET (by-id)

- [ ] 200 + schema + identity (`body.<resource>.id === id`).
- [ ] 400 invalid id format (loop).
- [ ] 404 non-existent id (`nonExistentId` from `test-data/app/<resource>.json`).
- [ ] Cross-tenant 404 (in the dedicated cross-tenant spec, not duplicated here).
- [ ] 401 (no token), 401 (wrong issuer / admin token), 403 (ZERO).

### POST (create)

- [ ] 200/201 happy path matching the actual endpoint.
- [ ] GET-after-create echoes every field of the request payload.
- [ ] Push `createdId` onto cleanup array **before** the GET-after step.
- [ ] One happy path per body shape (per monitor type, per probe kind, etc.).
- [ ] Empty body → 400.
- [ ] Each required field missing → 400 (one test per field).
- [ ] Each field with invalid type → 400 (loop `invalidString` / `invalidIntegerTypes`).
- [ ] 409 duplicate / conflict where applicable.
- [ ] Mailpit purge-before + assertion-after when email is part of the contract; recipient is `@<your-test-domain>`.
- [ ] 401 (no token), 401-or-403 per § 12.2 wrong-realm/wrong-scope row (admin token on tenant path → 401; tenant token on admin path → 403), 403 (ZERO), 405 (covered in 405 block).

### POST (query-by-body)

- [ ] 200 happy path per shape (per type, per timeframe, per aggregation).
- [ ] Empty result → 200 (not 404).
- [ ] Empty body → 400.
- [ ] Each required field missing → 400.
- [ ] Cross-tenant query returns no leak (empty result or 404 — match the contract).

### PUT

- [ ] 200 with full body + GET-after asserts the full replacement.
- [ ] One test per field (vary one, full body around it) + GET-after.
- [ ] Fields **not** in PUT body are cleared (verified via GET-after).
- [ ] Missing required field → 400.
- [ ] Each field with invalid type → 400.
- [ ] Empty body → 400.
- [ ] Invalid id format → 400; non-existent id → 404.
- [ ] Immutable fields unchanged via GET-after.
- [ ] 401 (no token), 401-or-403 per § 12.2 wrong-realm/wrong-scope row, 403 (ZERO), 405 (covered in 405 block when path only supports PATCH).

### PATCH

- [ ] One test per updatable field with GET-before + PATCH + GET-after (per-field isolation).
- [ ] At least one test asserts ALL non-touched fields equal `before`.
- [ ] State toggle round-trip when applicable.
- [ ] Empty body → 400 (annotate the realm-quirk if applicable).
- [ ] "One invalid + rest valid" per field → 400.
- [ ] Immutable fields rejected or silently ignored (assert via GET-after).
- [ ] Invalid id format → 400; non-existent id → 404 (annotate the synthetics-quirk if applicable).
- [ ] 409 conflict where applicable.
- [ ] Cross-tenant 404 (in the dedicated cross-tenant spec).
- [ ] PATCH-after-DELETE → 404 (one test in the DELETE block).
- [ ] 401 (no token), 401-or-403 per § 12.2 wrong-realm/wrong-scope row, 403 (ZERO), 405 (collection path covered in 405 block).
- [ ] `allOf` discriminator merged from fresh GET when partial body is partial across the discriminator.

### DELETE

- [ ] 200 happy path + GET-after returns 404 + re-DELETE returns 404 (idempotency-as-404).
- [ ] Invalid id format → 400.
- [ ] Non-existent id → 404 (distinct test from re-DELETE).
- [ ] Cross-tenant 404 (in the dedicated cross-tenant spec).
- [ ] PATCH-after-DELETE → 404 (one test in this block).
- [ ] Cascade verified for parent resources (separate cascade spec, see [`tenant-cascade.spec.ts`](../../../tests/app/api/tenant-service/tenant-cascade.spec.ts)).
- [ ] 409 conflict for child-still-bound parent (probe-with-synthetic) — and `cleanupProbesAndSynthetics` is wired in `afterAll`.
- [ ] 401 (no token), 401-or-403 per § 12.2 wrong-realm/wrong-scope row, 403 (ZERO), 405 (collection path covered in 405 block).

### 405 (catch-all block)

- [ ] One test for the **collection** path (no `:id`) looping unsupported verbs.
- [ ] One test for the **resource** path (with `:id`) looping unsupported verbs.
- [ ] Loop is **inside** `test()`, not outside.
- [ ] `body: {}` passed for non-DELETE verbs.
- [ ] `expect(status, "<METHOD> <path>")` carries the method-and-path label.

---

## See also

- [SKILL.md](SKILL.md) — workflow, source-of-truth philosophy, `apiRequest` contract, negative test matrix, helper styles.
- [reference.md](reference.md) — error catalogs, helper inventory, schema decision tree, token catalog (incl. ZERO-token caveat).
- [templates.md](templates.md) — copy-paste skeletons for full CRUD spec (§ 1), synthetic-with-probe (§ 2), schema file (§ 3), helper file (§ 4), assertion-style setup helper (§ 4a), test-data JSON (§ 5), E2E API flow (§ 6), cross-tenant isolation (§ 7), faker-driven body builders (§ 8).
- [SKILL.md § Test Coverage Checklist](SKILL.md) — the canonical checklist this playbook expands (sections 6, 8, 13, 14, 16).
- [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) — drift inventory + sequenced fix plan. Drift items in this playbook (e.g. "missing 405 block on admin-tenants") will be tracked there going forward.
