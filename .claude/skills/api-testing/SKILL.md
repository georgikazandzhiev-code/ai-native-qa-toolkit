---
name: api-testing
description: Write and maintain API specs under tests/app/api/**, Zod schemas in fixtures/api/schemas/, and API helpers. Use for apiRequest calls, response validation, the negative-test matrix (400/401/403/404/405/409), seeding, and cleanup. Triggers — "API test", "endpoint", "schema", "status code". Not for UI selectors (selectors) or POMs (page-objects).
---

# API Testing Skill

This framework runs API tests with Playwright's `APIRequestContext` wrapped by the project-specific `apiRequest` fixture, and validates every response with Zod. Specs are deterministic, fixture-driven, schema-asserted, Qase-tagged, and clean up after themselves.

This skill is the **single source of truth** for API-test invariants and workflow — the previous paired rule (`api-tests.mdc`) was consolidated into this `SKILL.md` + `reference.md` + `http-method-coverage.md` + `templates.md`. Always-on framework invariants (imports, type-safety, schemas) live in `~/.claude/CLAUDE.md`; everything API-specific is here.

## What's in each file (read this before reaching for another file)

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | **Rules, workflow, decisions, anti-patterns.** Teaches the model how to think about API tests. | **Always** — on any API-testing task. |
| **`reference.md`** | **Catalog of facts.** Helper inventory by resource, token catalog, URL catalog, response shape catalog, error envelope schemas, schema patterns by data type, decision tree, Mailpit recipe, cross-tenant patterns, form-encoded recipe, common request recipes. | **Load During Phase 2** (Coverage Plan) and on lookups — "What helpers exist for synthetics?" / "What's the shape of a list response?" / "Which token for 403?" |
| **`templates.md`** | **Copy-paste skeletons.** Full CRUD spec, schema file, helper file, body builder, test-data JSON, E2E flow, cross-tenant isolation spec, per-monitor-type body shapes. | **Load During Phase 4** (Scaffold) — scaffolding a new spec, schema, helper, or test-data file. |
| **`http-method-coverage.md`** | **Per-verb coverage methodology.** GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS/405 playbook with what-to-test, what-not-to-test, anti-patterns, and self-review checklists per verb. Includes resource × method matrix. | **Load During Phase 3** (Negative Matrix) — "What do I owe for this verb on this resource?" — open after the workflow tells you to author tests for a specific endpoint × method. |

**Boundary rule:** decisions, rules, and anti-patterns live in `SKILL.md`. Catalogs of "what exists" live in `reference.md`. Skeletons live in `templates.md`. Per-verb playbooks live in `http-method-coverage.md`. If you find rule content in a catalog file (or vice versa), it's drift — fix it.

> **Source-of-truth philosophy.** The patterns described here are based on the reliable, battle-tested patterns of the upstream framework (`the upstream reference framework`), adapted to this project's domain (single `app/` area, multi-tenant network monitoring, no response envelope, Mailpit instead of Mailhog). When the current codebase deviates from a upstream pattern, this skill encodes the **upstream-correct pattern** (e.g. shared error/pagination schemas in `util/common.ts`, `z.string().uuid()` by default, full barrel re-exports, assertion-style helpers for setup) and flags the local deviation as drift to converge. Do **not** treat the current state of the codebase as canonical; treat it as the starting point for the next consolidation pass.
>
> **Companion plan.** The full inventory of drift, severity ranking, fix sequence, and verification commands live in [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md). When this skill says "drift" or "planned", it cites a numbered section of that plan; the plan is the canonical roadmap from current state → upstream-aligned state. Anything new authored through this skill must already match the plan's target state — never add new code that re-creates a documented drift item.

## Critical

These rules are non-negotiable. Violating any of them breaks the framework's contract.

- **NEVER** hardcode API URLs, tokens, emails, passwords, paths, or uuids. Sources of truth: `process.env.*` (URLs/credentials), `appConfig.api.X` / `config/app.ts` (paths), `test-data/app/*.json` (static ids/boundaries), `enums/app/*` (route + message constants).
- **ALWAYS** validate response bodies with Zod using the exact pattern `expect(SchemaName.parse(body)).toBeTruthy();`. Type generics alone are insufficient. `Schema.parse(body)` without the `expect(...).toBeTruthy()` wrapper is insufficient. **Named exception:** assertion-style setup helpers (§ Two helper styles, Style A) call a bare `Schema.parse(body)` and return the typed payload — the parse *is* the assertion at the helper boundary, and the caller receives a validated entity. The `expect(...).toBeTruthy()` wrapper is required in **test bodies**, not inside setup helpers that return the parsed value.
- **ALWAYS** wrap each API call in `test.step()` when a test contains 2+ API calls.
- **NEVER** silently drop a test because the API misbehaves. Write the test as the contract says, then **comment out** the entire `test(...)` block and add `// TODO: FIXME: <TICKET> <description>` directly above. **Do NOT use `test.skip`** — it corrupts Qase ID mappings. Every status code in the OpenAPI spec must be a passing test, a failing test, or a commented-out test with a ticket reference.
- **NEVER** stop at empty-body (`{}`) validation. Every request-body endpoint requires per-field omission tests AND per-field invalid-type loops (see § The negative test matrix).
- **ALWAYS** fuzz path parameters with the invalid-format data-driven loop, regardless of whether OpenAPI mentions it.
- **ALWAYS** call `apiRequest` directly in specs by default. Promote to a helper only on reuse (2+ specs), multi-step flows, or precondition setup unrelated to the test under inspection.

## Architecture map

The full layer-by-layer map (spec / fixture / schema / config / helper / test-data / generator / Qase / Mailpit paths and responsibilities, including the shared-schema layout under `fixtures/api/schemas/util/`) lives in [reference.md § Architecture map](reference.md#architecture-map). Key invariants: specs import `test`/`expect` from `fixtures/pom/test-options.ts`; schemas live only under `fixtures/api/schemas/`; body builders (`buildCreate<X>Body`) live in the resource helper file.

## Authoring a new API spec — workflow

Follow these steps in order. Stop at any step if the artifact already exists; **reuse over duplication**.

```
- [ ] 1. Confirm method/path lives in config/app.ts under `api`. Add it if missing.
- [ ] 2. Schema: before creating, check for an existing one — error/pagination/auth shapes are reused
        across resources. Default to `z.strictObject()` (rejects extras, catches API regressions).
        Default to `z.string().uuid()` for ids; loosen to `z.string()` only when verified non-UUID.
- [ ] 3. Helper: only add when the call is reused, multi-step, or sets up preconditions. Single-spec
        happy-path GETs are clearer with a direct `apiRequest({...})` call.
- [ ] 4. Body builder (`buildCreate<X>Body` / `buildUpdate<X>Body`) using faker. Names always carry a
        `qa-` prefix and a faker suffix to be greppable in DB cleanups.
- [ ] 5. Add `SUITES.API_<RESOURCE>` to enums/app/qase-suites.ts if it does not exist.
- [ ] 6. Add static fixtures (`invalidId`, `nonExistentId`, …) to test-data/app/<resource>.json if needed.
- [ ] 7. Author the spec from templates.md. Test name format (per `docs/framework-alignment-plan.md` § 6.6):
        `Verify <METHOD> <path> returns <status> [with <reason>]` — endpoint-shaped, used in 100% of
        specs today (e.g. `Verify GET /synthetics returns 200 with valid schema and default pagination`).
        Keep `<reason>` short and behavior-focused; omit it when the status alone is unambiguous (e.g.
        `Verify DELETE /synthetics/:id returns 200`).
- [ ] 8. Cover the negative matrix (see § The negative test matrix).
- [ ] 9. Wire cleanup (afterEach/afterAll DELETE through the helper). For synthetics-with-probes use
        `cleanupProbesAndSynthetics` — synthetics MUST be deleted before probes (409 otherwise).
- [ ] 10. Run: `npx playwright test <spec> --grep-invert "@App-E2E"` (or `--grep "@App-API"`) and read lints.
```

## The `apiRequest` contract

Full TypeScript signature, parameter usage table, and `headers` overload semantics live in [reference.md § ApiRequestFn signature](reference.md). Read that before authoring a new helper or spec.

**Rules:**

- **Never call `request.get/post/...` directly in a spec.** Always go through `apiRequest`.
- **Direct `apiRequest({...})` in the spec is the default.** Reach for a helper only when the call is reused across 2+ specs, is multi-step, or sets up a precondition unrelated to the test under inspection.
- **Omit `headers` entirely for unauthenticated requests** — never pass an empty string.
- **`baseUrl` is `appConfig.apiUrl`** for app endpoints; override only for non-app services (Keycloak, public gateway).

## Zod schema conventions

This API does **not** use a global response envelope. Responses are direct or resource-keyed.

1. **One file per resource** under `fixtures/api/schemas/app/<resource>.ts`. **There is no `fixtures/api/schemas/app/index.ts` barrel** — specs deep-import from the resource file (`fixtures/api/schemas/app/synthetic.ts`, etc.). A shared-schema barrel does exist at `fixtures/api/schemas/util/index.ts` (re-exports `./common` and `./keycloak`). **Name-collision rule:** never dodge collisions with `as <Alias>` re-exports; pick distinct names at definition. The `UserSchema` collision is **still live today** (`tenant.ts:170` and `user.ts:32` both export a `UserSchema`) — the `UserSchema` → `AdminUserSchema` rename remains unresolved (plan § 5.4).
2. **Reusable shared schemas live in `fixtures/api/schemas/util/common.ts` — importing from there is correct and recommended.** It exports `PageInfoSchema` (`z.strictObject`), `APIErrorSchema` (`z.strictObject`), and `JSONSchemaResponseSchema`. `synthetic.ts` and `policy.ts` import/re-export from it; `alert.ts` flows through `policy.ts`; `probe.ts` and `data.ts` flow through `synthetic.ts`. Local copies of `APIErrorSchema` still remain in `tenant.ts`, `user.ts`, and `tenant-schema.ts` (the `tenant-schema.ts` copy has a divergent `details` shape); `GatewayErrorSchema` is not yet centralized (local `z.strictObject` copies in `tenant.ts`, `user.ts`, `policy.ts`). When touching any duplicating file, centralize through `util/common.ts` rather than duplicating again — full inventory in `reference.md § Error catalog`.
3. Always export both the schema and the inferred type:

```typescript
export const SyntheticSchema = z.strictObject({ /* ... */ });
export type Synthetic = z.infer<typeof SyntheticSchema>;
```

4. **Use `z.strictObject()` for every new schema** — rejects unexpected fields, catches additive API drift, matches upstream's default. The strict migration is **essentially complete**: ~93 `z.strictObject` definitions across `fixtures/api/schemas/` vs 5 lax ones, all intentional or non-response shapes (2 in `data.ts` `VMResponseSchema` with an inline "intentional" comment — VictoriaMetrics responses may include extra fields; 2 credential-input schemas in `util/keycloak.ts`; 1 deliberate `.passthrough()` on `TenantSchemaResponseSchema` in `tenant-schema.ts`, whose extra keys are the point of the endpoint). Do not author new lax `z.object` schemas.
5. Response shape catalog (no envelope):
   - **List** (paginated): `{ pageInfo: PageInfoSchema, <resourcePlural>: z.array(<Resource>Schema) }`.
   - **Single (GET by id)**: `{ <resource>: <Resource>Schema }` (e.g. `{ tenant }`, `{ synthetic }`, `{ user }`).
   - **Create / Modify**: `{ <resource>Id: string, status: StatusSchema | string }`. The id field name varies (`tenantId`, `syntheticId`, `userId`, `probeId`). `status` is `StatusSchema = z.enum(["created", "updated", "deleted", "logged out"])` for tenant/user/realm endpoints; some endpoints (probes, synthetics) return plain `z.string()` — match the actual API.
   - **Update / Delete**: `{ status: StatusSchema }` only, OR `{ <resource>Id, status, <resource>?: <Resource>Schema }` when the API echoes the updated entity (see `UpdateSyntheticResponseSchema`).
6. Reuse error schemas before inventing new ones (see § Error envelopes).
7. Datetime: use `z.string().datetime()` for `Z` style, `z.string().datetime({ offset: true })` for `+00:00`.
8. **UUIDs — default to `z.string().uuid()`.** Only loosen to `z.string()` when you have empirically verified the API returns a non-UUID id (rare; document the case inline). Several existing `id: z.string()` fields in the codebase should be tightened on the next pass — encode the right pattern here, not the lax one.
9. **Optional vs nullable — interrogate every modifier.** A schema is a contract assertion, not a transcription of what the API happens to return today. Lazy `.optional()` / `.nullable()` hides regressions: the parser shrugs at `null`, the test passes, and a real bug ships. Default to strict; loosen **only** when a named condition justifies it.

   **Strictness ladder — pick the tightest level the contract truly allows:**

   | Level | When | Pattern | Required follow-up |
   |-------|------|---------|--------------------|
   | Strict (default) | Field is always present and always has a value | `z.string()` / `z.number().int()` | None |
   | Nullable | Field is always present but value may be `null` (e.g. `lastLoginAt` before first login, `updatedAt` before first edit, `tests: null` when no tests configured for the synthetic) | `z.string().nullable()` | Add a test that exercises the null branch so the tolerance is verified — not assumed |
   | Optional | Field is conditionally absent (e.g. traceroute metrics only when `config.enableTraceroute: true`; `parentId` only on child tenants) | `z.string().optional()` | Comment the condition in the schema AND add tests for both branches (present + absent) |
   | Both (rare smell) | Both states are independently valid and meaningful | `z.string().optional().nullable()` | One-line comment justifying why absence and `null` are distinct states; otherwise tighten one |

   **Before adding `.optional()` / `.nullable()` ask:**
   1. **Under what specific condition is the field absent / `null`?** If you can't name the condition in one sentence, the schema is wrong — tighten it.
   2. **Does an existing test exercise that condition?** If not, the modifier is unverified theory — write the test or remove the modifier.
   3. **Is the OpenAPI / docs claim actually true?** Hit the endpoint with the trigger condition and check. Many APIs document fields as optional that are in fact always returned (and the inverse — fields documented as required that the API silently drops). The schema should encode the **observed-and-justified contract**, not the doc.
   4. **Would a downstream consumer crash if this field went missing/null?** If yes, it shouldn't be optional — make the schema strict so the test fails first, before production.

   **Anti-patterns:**
   - ❌ Defaulting to `.optional()` for everything "to be safe" — every schema is then a no-op.
   - ❌ Adding `.nullable()` to silence a flaky parse error without finding what is actually returning `null`.
   - ❌ Mirroring an OpenAPI spec verbatim when the OpenAPI itself was lazy.
   - ❌ Combining `.optional().nullable()` without a one-line comment justifying both states.
   - ❌ Marking `id`, `createdAt`, or any audit field optional/nullable. These are contract invariants.

   **Project examples (currently in `SyntheticSchema`):**
   - `tests: z.array(SyntheticTestSchema).nullable()` — ✅ justified: `null` when no tests are configured for the synthetic. A test asserts both list items with populated tests and items with `null`.
   - `healthStatus: z.string().optional()` — ⚠ revisit: is the field really sometimes absent, or always present (perhaps with an `"unknown"` / `"pending"` sentinel during initial probe)? If always present, tighten to `z.string()` (or `z.enum([...])`) so the next contract drift fails loudly.
   - `updatedAt: z.string()` — ✅ strict; even on a fresh resource the API echoes a timestamp (verified). Resist the temptation to add `.nullable()` "just in case".

For deeper schema patterns, the response/error catalog, and helper inventory, see [reference.md](reference.md).

## Error envelopes

This API does **not** use ASP.NET ProblemDetails. Use these three patterns:

| Status | Pattern | Schema | Where it lives |
|--------|---------|--------|----------------|
| 400, 404, 409, 500 | `{ message: string, details?: string }` | `APIErrorSchema` | canonical: `fixtures/api/schemas/util/common.ts` (re-exported by `synthetic.ts` and `policy.ts`). Legacy local copies remain in `tenant.ts`, `user.ts`, `tenant-schema.ts` — centralize when next touched |
| 401 | `{ error: string }` | `GatewayErrorSchema` | duplicated `z.strictObject` copies in `tenant.ts`, `user.ts`, `policy.ts` — not yet in `util/common.ts` (request hits the API gateway before reaching the app). Exception: the policy service returns the `APIErrorSchema` shape for 401 — see the comment in `policy.ts` |
| 403 | empty body | `expect(body).toBeNull()` | n/a — body is `null` |
| 405 | empty body | `expect(body).toBeNull()` | n/a |

Centralization status of `util/common.ts` is covered in § Zod schema conventions item 2 — importing the shared schemas from `util/common.ts` is the recommended pattern.

## Helpers — when to write one, and how

Add a helper when, and only when, one of the following holds:
- The same call is used in **2+ specs**, OR
- It involves multiple chained requests, OR
- It sets up preconditions unrelated to the test under inspection (e.g. seed a probe before testing a synthetic).

Otherwise, call `apiRequest({...})` directly inside the spec. Wrapping a single one-shot request in a helper adds a layer that obscures the assertion.

### Three callable shapes — pick the right one

| Approach | When | Example | Lifecycle |
|----------|------|---------|-----------|
| **`apiRequest` directly in the spec** (default) | Single one-shot calls in tests, `beforeEach`/`afterEach` setup that runs once per test, anything not yet reused | `apiRequest({ method: "GET", url: appConfig.api.SYNTHETICS, baseUrl: appConfig.apiUrl, headers: process.env.USER_ACCESS_TOKEN_FULL! })` inside `test()` | Manual — caller controls everything |
| **Helper function** (passthrough or assertion-style) | Reused across **2+ specs**, multi-step flows, or precondition seeding | `createSyntheticMonitor(apiRequest, body, headers)`, `setupTestUser(apiRequest, mailpit, tenantId, password, lastName)` | Manual — caller decides when to call cleanup |
| **Helper fixture** (Playwright fixture wrapping helpers) | Critical setup/teardown reused across **3+ files** that needs guaranteed lifecycle (auto-cleanup on test failure) | `mailpit` fixture, `loginUser` fixture in `fixtures/pom/test-options.ts` | Automatic — Playwright invokes setup before `use()` and teardown after, even on failure |

**Rule of thumb:** start with `apiRequest` directly. Promote to a helper function on the second use (or when chaining ≥ 2 calls). Promote to a helper fixture only when 3+ specs need the same setup with guaranteed teardown — fixtures pay a complexity tax that's only worth it for cross-spec reuse with lifecycle guarantees.

### Two helper styles — pick by use case

The codebase uses both. Both are valid; the choice depends on whether the helper is a **happy-path assertion** (one shape only) or a **CRUD wrapper** (used across positive AND negative tests).

> **Principle (per `docs/framework-alignment-plan.md` § 6.6 — upstream-aligned):** a helper that creates an entity and is used for setup MUST `Schema.parse` the response body before returning the typed payload. This is the assertion-style contract — every caller gets a validated entity, no caller redoes the validate-then-cast dance, and a missing field surfaces at the schema boundary instead of as `undefined` deep in a downstream assertion. Passthrough helpers (`{ status, body }`) are still allowed for negative-test reuse.

**Style A — assertion-style** (parse internally, return typed payload). Use when the helper exists to seed a precondition and the caller only cares about the parsed entity. The helper asserts `status` and runs `Schema.parse(body)` once; the caller gets a typed value back. **Skeleton:** [templates.md § 18](templates.md) (Helper styles). **Existing examples:** `setupTestUser` / `teardownTestUser` in `helpers/app/adminUsers.ts`. **Planned** (plan § 4.2): `setupSynthetic`, `setupProbe`, `setupUser`, `setupTenant`.

> Note: `appConfig.api.ADMIN_TENANT` is **singular** (`/admin/tenants`) — the constant name does not pluralize even though the path does. Always grep `config/app.ts` before guessing.

**Style B — passthrough** (return `{ status, body }`; caller asserts). Use when the same helper is exercised across multiple status codes (201, 400, 401, 403, 404, 409). Status-asserting inside would crash the negative tests. **Skeleton:** [templates.md § 18](templates.md). **Existing examples:** every CRUD function in `helpers/app/synthetics.ts`, `probes.ts`, `adminTenants.ts`, `users.ts`.

### Helper signature rules (project-wide)

- First arg is always `apiRequest: ApiRequestFn` (typed from `fixtures/api/api-types`).
- Last optional arg is always `headers?: string` (the token). Pass `undefined`/omit for anonymous-call testing.
- For URL building with query strings, expose a sibling `buildList<X>Url(params)` that takes a typed param object (see `helpers/app/synthetics.ts:buildListSyntheticsUrl`).
- Cleanup helpers (e.g. `cleanupProbes`, `cleanupProbesAndSynthetics`) use `Promise.allSettled` and tolerate 404.
- **Never declare a Zod schema inside a helper.** Schemas live only under `fixtures/api/schemas/app/`.

Before writing a new helper, check the full inventory in [reference.md § Helper catalog](reference.md#helper-catalog-already-exists--reuse-before-writing-new). Canonical examples: `helpers/app/synthetics.ts` (passthrough CRUD + builders + cleanup), `helpers/app/adminUsers.ts` (both styles, incl. assertion-style `setupTestUser`).

## Test data

- **Static** (deterministic ids, strings, numbers): `test-data/app/<resource>.json`. Import and destructure: `import probeData from "../../../test-data/app/probe.json"; const { invalidId, nonExistentId } = probeData;` (the `invalidId` / `nonExistentId` keys live in resource-specific files like `probe.json`; cross-cutting numeric tables live in `synthetic-common.json`).
- **Filename convention (per `docs/framework-alignment-plan.md` § 6.7): hyphen-case** — `mcp-synthetic.json`, `dns-synthetic.json`, `synthetic-common.json`. Three legacy camelCase files (`httpSyntheticValidation.json`, `mcpSyntheticValidation.json`, `sslSyntheticValidation.json`) are drift; do not add new camelCase JSON files. New validation tables go in `<type>-synthetic-validation.json`.
- **Dynamic** (random per-run): `faker` inside body builders (`buildCreateSyntheticBody`, `buildCreateProbeBody`, …). Names always carry a `qa-` prefix and a faker-suffix to be greppable in DB cleanups (e.g. `qa-icmp-${faker.string.alphanumeric(8).toLowerCase()}`).
- Never invent new uuid/tokens — read from JSON or `faker.string.uuid()`.

### Invalid-value arrays — three-tier rule

Where invalid values live drives whether the next reviewer can find them. Pick the right tier:

| Tier | What | Where | Example |
|------|------|-------|---------|
| **1. Universal type-mismatch** | Values that are wrong for any field of a given primitive type (any required string field, any integer field, …) | `fixtures/api/invalid-types.ts` (the constants below) | `invalidString` for any required string field |
| **2. Domain-specific curated** | Project-specific invalid sets (invalid email formats, password-policy violations, monitor-type-specific bad configs) | `test-data/app/<resource>.json` (e.g. `httpSyntheticValidation.json`) | `invalidEmails`, `invalidIcmpConfigs` |
| **3. Field-specific boundary / range** | Out-of-range numerics that are wrong for exactly one field (e.g. `checkInterval` outside `15..3600`) | Inline `const` in the spec, only when the set is meaningful to one field and used in one place | `const outOfRangeIntervals = [-1, 0, 14, 3601, 999999];` |

If a tier-3 inline set appears in 2+ specs, promote it to tier 2.

### Universal arrays in `fixtures/api/invalid-types.ts`

Import and iterate. **Never redefine inline.** Each array is curated for what the API actually accepts; do not "improve" by adding values without verifying against the contract. The full array-by-array catalog (which array for which field type, exact value listings) lives in [reference.md § Invalid-type arrays](reference.md#invalid-type-arrays--when-to-use-which). Rules of thumb: `invalidString`/`invalidBoolean`/`invalidInteger`/`invalidObject` for **required** fields (include `null`/`undefined`/`""`), the `*Types` variants for **optional** fields (wrong types only), `specialChars` for path/query injection, `boundaryString` for length-bounded strings.

### Per-field invalid-type loop (spread-and-override)

Use a valid payload as the base and override one field at a time. This isolates the field under test.

**Convention: loop INSIDE `test()`, never outside.** One `test()` per validation concern; the loop iterates invalid values inside the test body. Wrap each iteration in `test.step()` so the trace shows which value broke. Use `expect.soft()` for inner-loop assertions so the loop continues past failures and the trace lists *every* invalid value the API mishandled in one run — not just the first. The test still fails at the end if any soft assertion failed.

This matches the project's 405 catch-all pattern (see `http-method-coverage.md` for the full per-verb playbook) and avoids the per-value test explosion that the loop-outside form produces.

Two shapes:
- **Single-field form** — one `test()` per field, loop iterates invalid values inside. Easier to read when a resource has 1–3 validated fields. **Skeleton:** [templates.md § 9](templates.md).
- **Nested compact form** — one `test()` covers all fields; outer loop over `{ field: invalidArray }`, inner loop over values, both inside the test. Denser when 4+ fields share the same pattern. **Skeleton:** [templates.md § 10](templates.md).

### Per-field omission (destructure + rest)

To prove each required field independently triggers a 400 when missing, omit one field at a time using the `const { [field]: _, ...rest } = validBody` pattern. **Loop inside the test**, one `test.step` per omitted field, `expect.soft` for assertions. **Skeleton:** [templates.md § 11](templates.md).

### Path parameter fuzzing

Every endpoint with a path parameter (`/synthetics/:id`, `/admin/tenants/:id`, `/probes/:id`) requires invalid-format coverage — regardless of whether the OpenAPI spec mentions it. Use labeled cases (`{ description, value }`) so each `test.step` reads cleanly. **Loop inside the test**, `expect.soft` for assertions. Wrap `value` in `encodeURIComponent` to keep the URL well-formed. **Skeleton:** [templates.md § 12](templates.md).

For the **non-existent-but-well-formed-uuid** case (the 404 path), use `nonExistentId` from `test-data/app/<resource>.json` — it's a separate test, not part of this loop.

## The negative test matrix

Every CRUD spec covers these scenarios. Use the matrix as a checklist when authoring. For the deeper per-verb breakdown — including pagination, per-field isolation on PATCH, idempotency-as-404 on DELETE, the 405 catch-all loop, and a resource × method coverage map — see [http-method-coverage.md](http-method-coverage.md).

| Status | Trigger | Schema / Body assertion | Notes |
|--------|---------|-------------------------|-------|
| `200/201` | Happy path with full body | `<Resource>Schema.parse(body)` + field assertions | Synthetics `POST` returns **201**, admin tenants/users `POST` returns **200** — match the actual endpoint |
| `400` | Invalid payload, invalid path id, missing required field, empty body `{}` | `APIErrorSchema.parse(body)` | One `test()` per validation concern; loop over `invalidString`/`invalidIntegerTypes`/etc. **inside** the test with `expect.soft`. See § Per-field invalid-type loop |
| `401` | Omit `headers` entirely | `GatewayErrorSchema.parse(body)` | Do NOT pass an empty string token; **omit the property** |
| `401` | Wrong-realm / wrong-issuer token | `GatewayErrorSchema.parse(body)` | Distinct from "no token" — both return 401 with the gateway shape |
| `403` | Valid token without required scope (`USER_ACCESS_TOKEN_ZERO`) | `expect(body).toBeNull()` | Only when ZERO env var is provisioned for the test environment |
| `404` | Non-existent uuid (`test-data/app/<resource>.json` `nonExistentId`) | `APIErrorSchema.parse(body)` | Distinct from 400 invalid-format id |
| `405` | Wrong verb on a real path (loop **inside** a single test, not outside) | `expect(body).toBeNull()` | See `tests/app/api/tenant-service/admin-realms.spec.ts` for the canonical loop |
| `409` | Duplicate name / conflicting state (e.g. probe still bound to synthetic) | `APIErrorSchema.parse(body)` | Synthetics-then-probes cleanup ordering exists because of this |

Project-specific quirks:
- `PATCH /synthetics/:id`: an invalid body fails validation **before** the resource lookup (400), while a valid body with a non-existent uuid returns 404 — both branches are covered by an active test in `icmp-synthetic-monitor.spec.ts`.
- Sort tests: assert the endpoint accepts the params and returns valid results — **do NOT assert exact ordering** (DB collation differs from JS).

### Skipping a test for a real backend bug

When the API's actual behavior diverges from the documented contract:

- **Do not loosen the schema** to make the test pass
- **Do not delete the test** — coverage drops silently
- **Do not silently change the expected status** to match the bug

Write the test the way the contract says it should work, then **comment out** the entire `test(...)` block and add directly above:

```typescript
// TODO: FIXME: PROJ-1234 — backend returns 200 instead of 400 for empty name
// test(
//   "Verify POST /synthetics returns 400 with empty name",
//   ...
// );
```

**Do NOT use `test.skip`.** Skipped tests corrupt Qase ID mappings — Qase records the test as "skipped" against its case ID, polluting pass/fail history and making it impossible to distinguish "not yet mapped" from "deliberately deferred". Commenting out removes the test from Playwright's runner entirely, so Qase never sees it.

**`test.describe` with all tests commented out.** When every test in a describe is blocked (e.g., all depend on an unavailable service), comment out the individual tests and add `// TODO: FIXME: <TICKET>` at the describe level. Do not comment out the `beforeAll`/`afterAll` hooks — they won't run with no tests, but keeping them visible makes it clear what the describe was supposed to set up.

**Skeleton:** [templates.md § 13](templates.md).

## Cleanup patterns

Track ids in a describe-scoped array, push after create, drain in `afterAll`. **Cleanup is the one place where the dedicated helper (`cleanupProbesAndSynthetics`, `cleanupProbes`) is preferred over raw `apiRequest`** — the helper tolerates 404, runs deletions in parallel via `Promise.allSettled`, and enforces the synthetics-before-probes ordering. **Skeleton:** [templates.md § 14](templates.md).

**When to use which hook:**
- PATCH-style suites that mutate a single resource per test → `beforeEach` (create) + `afterEach` (delete)
- Seeded GET-by-id suites that share one resource → `beforeAll` (create once) + `afterAll` (delete)
- POST suites that create N resources → push ids in each test, drain in `afterAll`

See `tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts` for both patterns.

**Defensive guards:**
- If a 400/422 negative test unexpectedly returns 201, capture the id into the cleanup array anyway — the test asserts the failure but cleanup must succeed.
- For UI-driven cleanup (synthetic created from a Page Object), use `cleanupUiCreatedSyntheticMonitors` — it resolves id-by-name with retry and tolerates 404.

**Seed completeness:** every assertion in the test body must have its data precondition satisfied by the `beforeAll` seed. A list-ordering test that asserts `length > 1` needs at least 2 seeded entities — not ambient data from other tests or prior runs. Audit each assertion against the seed: if the assertion would fail in an empty environment, the seed is incomplete.

### Setup-restore pattern (non-destructive tests on shared state)

When tests modify pre-existing state (toggling a feature, changing settings), capture initial state in `beforeAll` and restore it in `afterAll`. **Skeleton:** [templates.md § 15](templates.md).

## Setup timeouts (`beforeAll` / `beforeEach`)

Keycloak user creation and tenant provisioning are slow on resource-constrained environments (15–25 s per Keycloak user op). Size `test.setTimeout()` inside `beforeAll` per the lookup table in [reference.md § Setup timeout table](reference.md#setup-timeout-table). Tests that chain 2+ Keycloak user creations need `test.setTimeout(60_000)` in the test body.

**Cascading failure pattern:** when a `beforeAll` hook times out, Playwright reports every nested test as failed (often with misleading 401 / "Request context disposed" errors). A cluster of 401s from one describe → check the `beforeAll` timeout first.

## Common request recipes

Catalog of per-need request snippets (auth tokens, form bodies, query strings, path params, Mailpit, email-loop signup) lives in [reference.md § Common request recipes](reference.md#common-request-recipes). Includes the `USER_ACCESS_TOKEN_ZERO` provisioning caveat for 403 tests.

## Step grouping

When a test makes 2+ API calls, **each must be wrapped in `test.step("<message>", async () => { … })`** with its assertions inside the step. Failures localize to the step in the trace; the report shows the named flow.

**Single-call exception:** if a test contains exactly one API call, `test.step` is optional but encouraged for consistency with multi-call peers.

**Skeleton (correct vs forbidden):** [templates.md § 16](templates.md). See also `http-method-coverage.md` § PATCH and `tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts`.

## Qase tagging

- `qase.suite(SUITES.<NAME>)` is the **first body line** of every test. Imported from `enums/app/qase-suites.ts`. Use `\t` (tab character) inside the value for nested suites (e.g. `"API\tSynthetics"`).
- For tests without a mapped Qase id yet, **leave `qase.suite(...)` and comment out `qase.id(...)`** — do not delete them.
- Tags drive runtime selection (one tag per test, never combined):
  - `@App-API` — single-endpoint API specs (default for `tests/app/api/**`)
  - `@App-E2E` — multi-endpoint end-to-end API flows (e.g. tenant onboarding)

**Skeleton:** [templates.md § 17](templates.md).

## Multi-step & E2E API tests

- E2E onboarding tests use the `@App-E2E` tag, both `{ apiRequest, mailpit }` fixtures, and explicit timeouts (`test.setTimeout(60_000)` or `90_000`).
- Email tests **must** use `@<your-test-domain>` recipient domain — Mailpit catches only that domain on the test infra.
- Mailpit pattern: `await mailpit.deleteEmailsForRecipient(email)` **before** triggering the action and again **after** the test finishes; then `const message = await mailpit.getLastEmail(email, 10, 2000)`. **`getLastEmail` returns `MailMessage | null`** — guard with `expect(message).not.toBeNull()` before dereferencing, then read `message!.Content.Body`.
- For invite-style flows, prefer `getInviteLinkFromEmail(mailpit, email)` from `helpers/util/mailpit.ts` — it already retries, asserts non-null, and runs the body through `extractLinkFromEmail`.
- `extractLinkFromEmail(emailBody)` takes a **single** argument and matches any URL containing `action-token`. There is no hint/keyword overload — if you need to discriminate links, post-filter the matched URL.
- For per-test user setup, reuse `setupTestUser` / `teardownTestUser` from `helpers/app/adminUsers.ts`. **What `setupTestUser` actually does** (avoid the temptation to assume more): generates a `@<your-test-domain>` email, creates the user via the admin API, sets the password directly via the Keycloak admin client (bypassing the invite-link / email-reset flow), purges Mailpit for the recipient, and returns `{ email, userId }`. It does **not** mint or return access tokens, and it does **not** exercise the invite-link UX. For tests that need to drive the invite-link flow end-to-end, write the steps inline (purge → create user → `getInviteLinkFromEmail` → follow the link) rather than reaching for `setupTestUser`.
- Cleanup order for onboarding: Mailpit emails → Users → Tenant. Guard each step with `if (tenantId)` / `if (userIds.length)`.

## Anti-patterns

Avoid these — they correspond to common reviewer findings and the upstream anti-pattern list adapted to this codebase:

- ❌ Calling `request.get` / `request.post` / `request.fetch` directly inside a spec or helper. Always go through `apiRequest`.
- ❌ Defining a `z.object({...})` inside a spec or helper file. Schemas live only under `fixtures/api/schemas/app/`.
- ❌ Authoring a **new** schema as `z.object({...})` instead of `z.strictObject({...})`. New schemas must be strict; lax-object drift is being closed in plan § 5.3.
- ❌ Defaulting ids to `z.string()`. Use `z.string().uuid()` unless you have empirically verified the API returns a non-UUID and documented the case inline (plan § 5.3).
- ❌ Asserting only `status` without `Schema.parse(body)` (or vice-versa) on success responses.
- ❌ Adding a new local copy of `PageInfoSchema` / `APIErrorSchema` instead of importing from `fixtures/api/schemas/util/common.ts` — the shared definitions live there now (the old upstream-port schemas were deleted); import or re-export them.
- ❌ Hardcoded uuids, tokens, base URLs, or paths in specs. Pull from `process.env`, `appConfig.api.X`, or `test-data/app/*.json`.
- ❌ Creating resources without a matching `test.afterEach` / `test.afterAll` cleanup hook.
- ❌ Importing `test`/`expect` from `@playwright/test` — always from `fixtures/pom/test-options`.
- ❌ Defaulting Zod fields to `.optional()` / `.nullable()` without a named condition AND a verification test (see § Zod schema conventions, item 9).
- ❌ Duplicating shared error / pagination / auth schemas across resource files instead of centralizing in `fixtures/api/schemas/util/common.ts`.
- ❌ Aliasing schemas in re-exports with `as <Alias>` to dodge name collisions. Pick distinct names at definition (e.g. `UserSchema` vs `AdminUserSchema` — the `UserSchema` collision between `tenant.ts` and `user.ts` is still live; plan § 5.4).
- ❌ Mailpit recipient outside `@<your-test-domain>` (the test infra only catches that domain). `@automation.test` and `@<alt-test-domain>` are silently dropped — the helpers that emit them (`generateUserPayload`, `buildCreateUserBody`) are bugs in plan § 4.1.
- ❌ New test-data JSON files in camelCase (`fooBarValidation.json`). Use hyphen-case (`foo-bar-validation.json`) per plan § 6.7.
- ❌ Empty `config: {}` body for synthetics — synthetic POST requires the per-monitor-type config keys (icmp, http, tcp, dns, ssl, websocket, mcp); empty `config` returns 400.
- ❌ Deleting probes before synthetics — returns 409 because the synthetic still references the probe. Always cleanup synthetics first (use `cleanupProbesAndSynthetics`).
- ❌ Asserting exact ordering on sort tests — DB collation differs from JavaScript string sort. Assert that the endpoint accepts the sort param and returns valid items.
- ❌ Wrapping a single one-shot request in a helper "for tidiness" — reach for a helper only on reuse / multi-step / preconditions.
- ❌ Test names with `should` / `it` prefixes, free-form titles, or upstream's behavior-shaped `Verify <action>` form. This project uses `Verify <METHOD> <path> returns <status> [with <reason>]` — see plan § 6.6.
- ❌ `for...of` loop **outside** `test()` for invalid-value validation (one-test-per-value pattern). Loop INSIDE `test()` with `test.step` + `expect.soft` per § Per-field invalid-type loop. The loop-outside form generates dozens of nearly-identical tests, hammers the API with extra auth cycles, and clutters Qase reporting.
- ❌ Hard `expect()` inside an in-test validation loop. Use `expect.soft()` so all iterations report — a failing first iteration must not silence the rest.
- ❌ Asserting on **exact error message text** (`expect(body.error).toBe("Resource not found")`) unless the message is part of the documented API contract. Assert on status code + envelope schema shape; brittle copy comparisons fail every time the backend tweaks wording.
- ❌ Inline `setTimeout` / `await new Promise((r) => setTimeout(r, 1000))` polling inside a spec. Use Playwright's built-in retry mechanisms (`expect.toPass({ timeout })`, `expect.poll`) or a helper that polls with explicit timeout + interval (mirror `Mailpit.getLastEmail(email, 10, 2000)`).

## Self-review checklist

Before declaring a spec done, verify:

- [ ] Imports `test`/`expect` from `fixtures/pom/test-options`, **not** `@playwright/test`.
- [ ] Every `apiRequest` is typed with the response generic and parsed with the matching schema.
- [ ] `qase.suite(SUITES.API_<RESOURCE>)` is the first body line of every test (or commented if pending mapping).
- [ ] Each test carries `{ tag: "@App-API" }` (or `@App-E2E` for multi-endpoint flows).
- [ ] Test names follow `Verify <METHOD> <path> returns <status> [with <reason>]` (project convention per plan § 6.6 — e.g. `Verify GET /synthetics returns 200 with valid schema and default pagination`). Free-form titles, upstream-style action-only titles, and "should" / "it" prefixes are forbidden.
- [ ] All created entities have a matching cleanup in `afterEach`/`afterAll` via the helper.
- [ ] Synthetics-with-probes specs use `cleanupProbesAndSynthetics` (synthetics first, probes second).
- [ ] No hardcoded uuids, tokens, base URLs, or paths — everything from `process.env` / `appConfig.api.X` / `test-data/app/*.json`.
- [ ] Negative matrix (400/401/403/404/405) covered for every CRUD endpoint; PATCH covers per-field isolation; PUT covers full-replace.
- [ ] All invalid-value / per-field-omission / path-parameter loops run **inside** `test()` with `test.step` per iteration and `expect.soft` for inner assertions. No `for...of` outside `test()` generating per-value tests.
- [ ] Error assertions use `APIErrorSchema` (400/404/409), `GatewayErrorSchema` (401), or `expect(body).toBeNull()` (403/405) — never raw text matching.
- [ ] Helpers that exist only to seed a precondition are assertion-style (parse internally, return typed payload). Helpers used across positive and negative tests are passthrough.
- [ ] New schemas use `z.strictObject({...})` (not `z.object`) and `z.string().uuid()` for ids unless the API has been verified to return non-UUIDs.
- [ ] Every `.optional()` / `.nullable()` modifier is justified inline (named condition + branch test) per the strictness ladder.
- [ ] No new duplicate copies of `APIErrorSchema` / `GatewayErrorSchema` / `PageInfoSchema` — import `APIErrorSchema` / `PageInfoSchema` from `fixtures/api/schemas/util/common.ts` (or re-export through an existing resource file like `synthetic.ts` / `policy.ts`); re-export `GatewayErrorSchema` from an existing strict copy.
- [ ] New test-data JSON files use **hyphen-case** filenames (`<type>-synthetic-validation.json`), never camelCase — per plan § 6.7.
- [ ] Mailpit recipients use `@<your-test-domain>` — never `@automation.test`, `@<alt-test-domain>`, or any other domain (the test infra catches only `@<your-test-domain>`).
- [ ] Specs that exercise 403 from a no-permission token: if `USER_ACCESS_TOKEN_ZERO` is not provisioned, comment out the test with `// TODO: FIXME: re-enable when RBAC token is added`.
- [ ] No `test.fixme()` without a linked `// BUG:` annotation.
- [ ] Linter passes for the spec, schema, helper, and test-data files.

## Examples

### Example 1 — Adding a brand-new endpoint (synthetic-monitor extension)

User says: _"Add API tests for `POST /api/v1/synthetics/{id}/pause`."_

Walk the workflow:

1. **Confirm route in `config/app.ts`** — add `SYNTHETICS_PAUSE: "/api/v1/synthetics/:id/pause"` if missing.
2. **Schema** — open `fixtures/api/schemas/app/synthetic.ts`. Add `PauseSyntheticResponseSchema = z.strictObject({ syntheticId: z.string().uuid(), status: StatusSchema })`. Specs deep-import from the resource file (there is no `app/` schema barrel).
3. **Helper** — only if ≥ 2 specs need it. Likely not yet, so call `apiRequest` directly.
4. **Coverage Plan** (§ Critical) — comment block at the top of the spec listing every status code: 200 happy path, 400 invalid id format, 401 (no token), 403 (admin token on tenant endpoint), 404 (non-existent uuid), 405 (wrong verbs), 409 (already paused).
5. **Spec** — author `tests/app/api/monitoring-service/synthetics/synthetic-pause.spec.ts` from `templates.md § 1`. Test names follow `Verify <METHOD> <path> returns <status> [with <reason>]`.
6. **Negative matrix** — apply: per-field validation isn't needed (no request body), but path-parameter fuzzing is mandatory (§ Path parameter fuzzing). 405 catch-all loop. 401/403 auth coverage.
7. **Cleanup** — pause is reversible via unpause; restore in `afterAll`.
8. **Run** — `npx playwright test tests/app/api/monitoring-service/synthetics/synthetic-pause.spec.ts --grep "@App-API"`. Verify lints clean.

### Example 2 — Verifying a multi-step PATCH-then-GET flow

User says: _"Verify that PATCH /synthetics/:id with only `name` preserves all other fields."_

1. **`test.step` mandatory** (§ Critical) — three steps: GET-before, PATCH, GET-after.
2. **Style** — single test, three `test.step`s, parsed schema in each step.
3. **Assertion shape** — capture `before` from GET-before, then in GET-after assert `after.name === newName` and every other field equals `before[<field>]`. Example pattern is in `tests/app/api/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts` (§ PATCH per-field isolation in `templates.md`).
4. **Loop required fields** — if you're proving the pattern for *every* updatable field, write one `test()` per field with the same three-step pattern. Don't collapse into a `for...of` of steps inside a single test — that hides which field broke.

### Example 3 — Locking down validation for a request body

User says: _"We only have `{}` → 400 for `POST /probes`. Add full per-field validation."_

1. **Open the spec** — `tests/app/api/monitoring-service/probes/probes.spec.ts`. Find the empty-body test; keep it (it's part of coverage, not a substitute).
2. **Build `validBody`** — call `buildCreateProbeBody()` once at describe scope.
3. **Per-field invalid-type loops** (loop INSIDE `test()` per § convention) — one `test()` per field, iterating the matching universal array inside the body with `expect.soft` (`invalidString` for `name`/`location`, `invalidStringTypes` for any optional string, `invalidIntegerTypes` for any integer field). Test name: `Verify POST /probes returns 400 for invalid <field> values`.
4. **Per-field omission loop** — one `test()`, loop required-field names inside the body using the destructure-and-omit pattern (§ Per-field omission). Test name: `Verify POST /probes returns 400 when required fields are missing`.
5. **Path-parameter fuzz** — N/A on POST without a path param. Add it on `GET /probes/:id` and `DELETE /probes/:id` if not already present.
6. **Run** — `npx playwright test tests/app/api/monitoring-service/probes/probes.spec.ts --grep "@App-API"`. Coverage goes from 1 test (empty body) to N tests (one per validation concern), each running a soft loop across multiple invalid values internally.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `expect(Schema.parse(body)).toBeTruthy()` throws `ZodError` | API response disagrees with the schema (extra/missing field, wrong type, wrong nullability) | If OpenAPI is the source of truth, treat as a contract violation: keep the schema strict, **comment out** the test with `// TODO: FIXME: <TICKET>`, report the bug. **Do not loosen the schema** — see § Skipping a test for a real backend bug. If no docs exist, re-inspect the live response and update the schema; never relax to `z.any()`. |
| `Schema.parse(body)` throws `ZodError` on a 401 or 403 test | These responses have empty bodies (`null`); calling `.parse()` on `null` against an object schema fails | For 401: use `GatewayErrorSchema` (the gateway DOES return a body for 401). For 403/405: assert `expect(body).toBeNull()`, no schema needed. See § Error envelopes. |
| `playwright/no-skipped-test` ESLint failure on a `test.skip` | The rule catches skips; `test.skip` also corrupts Qase IDs | **Comment out** the test instead and add `// TODO: FIXME: <TICKET>` above. No eslint-disable needed because the test is commented out, not skipped. |
| 401 returns `{ error: "..." }` but `APIErrorSchema` was used | Wrong schema for 401 — the API gateway returns a different shape than app errors | Use `GatewayErrorSchema` (`{ error: string }`) for 401. Use `APIErrorSchema` (`{ message, details? }`) for 400/404/409. See the table in § Error envelopes. |
| Cleanup fails with 409 Conflict deleting a probe | The probe is still bound to a synthetic | Delete synthetics first, probes second. Use `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, token)` which enforces the order automatically. |
| Mailpit `getLastEmail` returns `null` | Wrong recipient domain (`@automation.test`, `@example.com`) — Mailpit on the test infra catches only `@<your-test-domain>` | Switch the recipient to `@<your-test-domain>`. For e2e onboarding, use `setupTestUser` which generates the correct domain. |
| 403 test fails because the env var is undefined | `USER_ACCESS_TOKEN_ZERO` is not yet provisioned in this environment | Comment out the test with `// TODO: FIXME: re-enable when RBAC token is added`. Do not silently drop the 403 row from the matrix. |
| A test fails locally but passes elsewhere — or vice versa | Flake, isolation issue, environment drift | Stop iterating blindly. Load the `debugging` skill — it covers UI Mode (`npx playwright test --ui`), Trace Viewer, Inspector, the failure-mode taxonomy. Do not raise timeouts, wrap in `try/catch`, or weaken assertions to make it green. |

## See Also

- **`type-safety`** — Zod 3 schemas, `z.strictObject()`, the `expect(Schema.parse(body)).toBeTruthy()` pattern, type inference (`z.infer<typeof X>`), and the canonical `process.env.X!` access pattern.
- **`data-strategy`** — when to use JSON, faker, env, or API-seeded data; the three-tier rule for negative-test arrays.
- **`enums`** — `SUITES.API_*`, route constants, message constants used in assertions.
- **`fixtures`** — `apiRequest`, `mailpit`, `loginUser`, helper-fixture authoring.
- **`helpers`** — auth bootstrap (`createStorageState`, login flows), helper-vs-fixture decision.
- **`test-standards`** — tag whitelist, `test.step` requirements, single-tag rule, structure conventions.
- **`refactor-values`** — workflow when an enum value, route constant, or static `test-data/` value needs to change.
- **`scaffold-spec`** — sibling skill for greenfield spec scaffolding (templates and conventions).
- **`debugging`** — failure-mode taxonomy, UI Mode / Trace Viewer / Inspector, CI-only-failure replay.
- **`owasp-security-testing`** — layers OWASP access-control / auth / injection negative tests on this matrix (BOLA/BFLA/BOPLA, second-principal tests, SSRF, misconfiguration surface). Reach for it when a spec needs security coverage, not just functional coverage.
- **[~/.claude/CLAUDE.md](~/.claude/CLAUDE.md)** — always-on framework invariants (imports, type-safety, MUST/SHOULD/WON'T tables). API-specific rules live in this skill.
- **`~/.claude/CLAUDE.md`** — root orchestrator with MUST/SHOULD/WON'T tables.

## Additional resources

- [reference.md](reference.md) — response/error schema catalog, token catalog, helper inventory, schema patterns by data type, Mailpit recipe, decision tree.
- [templates.md](templates.md) — copy-paste skeletons: full CRUD spec, schema file, helper file, body builder, test-data JSON, PATCH per-field isolation, E2E API flow.
- [http-method-coverage.md](http-method-coverage.md) — per-verb coverage playbook (GET/POST/PUT/PATCH/DELETE/405) with resource × method matrix and self-review checklists. Read this when the question is **"what do I owe for this verb on any resource?"**.
- [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) — drift inventory, severity ranking, sequenced fix plan with verification commands. Cited inline throughout this skill (e.g. plan § 4.1, § 5.1, § 6.6) — every "drift" / "planned" reference points to a numbered section there.
