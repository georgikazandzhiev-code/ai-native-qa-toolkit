# API Testing Reference

## Architecture map

| Layer | Path | Responsibility |
|-------|------|----------------|
| Spec | `tests/app/api/<domain>/<resource>.spec.ts` | Behavior + assertions, one spec per endpoint group (CRUD, e2e flow, isolation); domain folders per `api-tests.mdc` |
| Fixture (HTTP) | `fixtures/api/api-request-fixture.ts` + `plain-function.ts` | Wraps `request` into a typed `apiRequest<T>()` returning `{ status, body }` |
| Fixture (merge) | `fixtures/pom/test-options.ts` | Merges page-object, api, login and mailpit fixtures; **specs import `test`/`expect` from here** |
| Schemas (per-resource) | `fixtures/api/schemas/app/<resource>.ts` | Zod schemas + inferred types for that resource. 8 resource files: `alert.ts`, `data.ts`, `policy.ts`, `probe.ts`, `synthetic.ts`, `tenant-schema.ts`, `tenant.ts`, `user.ts`. **No `app/index.ts` barrel exists** — specs deep-import from the resource file. |
| Schemas (shared) | `fixtures/api/schemas/util/common.ts` | **Canonical home for shared schemas — import from here.** Exports `PageInfoSchema` (`z.strictObject`), `APIErrorSchema` (`z.strictObject`), and `JSONSchemaResponseSchema`. `synthetic.ts`/`policy.ts`/`tenant.ts`/`user.ts`/`alert.ts` consume it (directly or via re-export). A barrel exists at `fixtures/api/schemas/util/index.ts` re-exporting `./common` and `./keycloak`. |
| Config | `config/app.ts`, `config/util/*.ts` | Base URLs (`appConfig.apiUrl`) + path catalog (`appConfig.api.X` for API, `appConfig.paths.X` for UI) |
| Helpers | `helpers/app/<resource>.ts` | Reusable API flows (`createSyntheticMonitor`, `cleanupProbesAndSynthetics`, `createTenant`, …) |
| Test data | `test-data/app/<resource>.json` | Static fixtures (`invalidId`, `nonExistentId`, boundary values, monitor-type configs) |
| Invalid-types | `fixtures/api/invalid-types.ts` | Reusable invalid-value arrays — see § Invalid-type arrays below |
| Generators | `helpers/app/<resource>.ts` (`buildCreate<X>Body` / `buildUpdate<X>Body`). Per-file is acceptable today; **trigger threshold (plan § 6.4):** extract to a shared `helpers/app/testDataGenerators.ts` once `synthetics.ts` reaches a 10th monitor type **or** another helper crosses 5 builders. | Unique-per-run payloads via `faker`; never hardcode names |
| Qase | `enums/app/qase-suites.ts` | `SUITES.API_*` constants used in `qase.suite()` |
| Mailpit | `helpers/util/mailpit.ts`, `fixtures/api/mailpit-fixture.ts` | Email loop tests; `@<your-test-domain>` recipient domain required |

Deep reference for response shapes, error catalog, schema patterns, helper inventory, and request recipes used in this framework.

> Read [SKILL.md](SKILL.md) first for the workflow and source-of-truth philosophy. For per-verb coverage rules ("what do I owe for GET / POST / PUT / PATCH / DELETE / 405?") see [http-method-coverage.md](http-method-coverage.md). Drift items cited here (e.g. "plan § 5.1") refer to numbered sections of [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md), the canonical roadmap from current → upstream-aligned state.

## Response shape catalog

This API does **not** use a global success envelope. Match the actual shape for each verb.

### List (paginated)

```typescript
z.object({
    pageInfo: PageInfoSchema,
    <resourcePlural>: z.array(<Resource>Schema),
});
```

`PageInfoSchema` is reused across list responses (definition under § Error catalog → `PageInfoSchema`). Examples: `ListSyntheticsResponseSchema` (`{ pageInfo, synthetics }`), `ListTenantsResponseSchema` (`{ pageInfo, tenants }`), `ListUsersResponseSchema` (`{ pageInfo, users }`), `ListProbesResponseSchema` (`{ pageInfo, probes }`).

### Single (GET by id)

```typescript
z.object({ <resource>: <Resource>Schema });
```

The body is wrapped under the singular resource name. Examples: `GetSyntheticResponseSchema` → `body.synthetic`, `GetTenantResponseSchema` → `body.tenant`, `GetUserResponseSchema` → `body.user`, `GetProbeResponseSchema` → `body.probe`.

### Create (POST)

```typescript
z.object({
    <resource>Id: z.string(),     // tenantId, syntheticId, userId, probeId
    status: StatusSchema,         // OR z.string() for some endpoints
});
```

The id field name is **resource-specific**. `status` is `StatusSchema` (the enum below) for tenant/user/realm endpoints, plain `z.string()` for synthetics/probes — match the actual API.

```typescript
export const StatusSchema = z.enum(["created", "updated", "deleted", "logged out"]);
```

### Update (PATCH)

Two flavors in this codebase, both valid — match the API:

```typescript
// Minimal (admin tenants, admin realms, admin users)
z.object({ status: StatusSchema });
z.object({ <resource>Id: z.string(), status: StatusSchema });

// With echoed entity (synthetics)
z.object({
    status: z.string(),
    synthetic: SyntheticSchema,
});
```

### Delete (DELETE)

```typescript
z.object({
    <resource>Id: z.string(),
    status: StatusSchema | z.string(),
});
```

Successful DELETE returns **200**, not 204. 404 (already-deleted) is acceptable in cleanup helpers.

## Schema file inventory (`fixtures/api/schemas/app/`)

Main exported schemas per resource file (all `z.strictObject` unless noted):

| File | Main exports |
|------|--------------|
| `synthetic.ts` | `SyntheticSchema`, `SyntheticTestSchema`, `ListSyntheticsResponseSchema`, `CreateSyntheticResponseSchema`, `GetSyntheticResponseSchema`, `UpdateSyntheticResponseSchema`, `DeleteSyntheticResponseSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` from `../util/common` |
| `probe.ts` | `ProbeStatus` (enum), `ProbeSchema`, `CreateProbeResponseSchema`, `ListProbesResponseSchema`, `GetProbeResponseSchema`, `UpdateProbeResponseSchema`, `DeleteProbeResponseSchema`, `GetProbesByIdsResponseSchema` |
| `alert.ts` | `AlertSchema`, `AlertStateSchema` / `AlertOperationStatusSchema` (enums), `ListAlertsResponseSchema`, `GetAlertResponseSchema`, `AcknowledgeAlertResponseSchema`, `ResolveAlertResponseSchema`, `BulkResolveAlertsResponseSchema`, `AlertsStatsSchema` (+ severity/state group and metrics sub-schemas), `AlertHistoryResponseSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` / `SeveritySchema` via `./policy` |
| `policy.ts` | `PolicySchema`, `ConditionSchema` / `ConditionInputSchema`, `SeverityCascadeItemSchema`, enums (`EvaluationWindowSchema`, `OperatorSchema`, `SeveritySchema`, `PolicyTypeSchema`, `PolicyStatusSchema`), `ListPoliciesResponseSchema`, `CreatePolicyResponseSchema`, `GetPolicyResponseSchema`, `UpdatePolicyResponseSchema`, `DeletePolicyResponseSchema`; local `GatewayErrorSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` from `../util/common` |
| `tenant.ts` | `TenantSchema`, `TenantSettingsSchema` (+ SMTP/email/login/token sub-schemas and `Update*` variants), `StatusSchema` (enum), tenant/realm/user CRUD response schemas (`CreateTenantResponseSchema`, `GetRealmResponseSchema`, `CreateRealmResponseSchema`, `UpdateRealmResponseSchema`, admin-side `UserSchema`, …); local `APIErrorSchema` / `GatewayErrorSchema` |
| `user.ts` | tenant-side `UserSchema`, `StatusSchema` (enum), `ListUsersResponseSchema`, `CreateUserRequest/ResponseSchema`, `GetUserResponseSchema`, `UpdateUserRequest/ResponseSchema`, `LogoutUserSessionResponseSchema`; local `APIErrorSchema` / `GatewayErrorSchema` |
| `data.ts` | `MetricSchema`, `SyntheticMetricSchema`, `CatalogMetricSchema`, `GetSyntheticMetricsResponseSchema`, `GetMetricsCatalogResponseSchema`, `ListMetricsResponseSchema`, `GetSyntheticTypesResponseSchema`; `VMResponseSchema` (intentional lax `z.object` — VictoriaMetrics responses may include extra fields) |
| `tenant-schema.ts` | `TenantSchemaResponseSchema` (deliberate `.passthrough()` — the body is a JSON-Schema document), divergent local `APIErrorSchema` (object-valued `details`), `SUPPORTED_DTO_NAMES` |

## Error catalog

### `APIErrorSchema` — generic error (400, 404, 409, 500)

Canonical definition in `fixtures/api/schemas/util/common.ts`:

```typescript
export const APIErrorSchema = z.strictObject({
    message: z.string(),
    // `details` is genuinely conditional — only present for validation errors that carry field-level context.
    // Tests must cover at least one error WITH details and one WITHOUT to keep the modifier honest.
    details: z.string().optional(),
});
```

**Current state:** `synthetic.ts` and `policy.ts` re-export the canonical schema from `../util/common` (and `alert.ts` re-exports through `policy.ts`). Local copies remain in `tenant.ts`, `user.ts`, and `tenant-schema.ts` — all `z.strictObject`. **The `tenant-schema.ts` copy is DIVERGENT:** its `details` is `z.record(z.string(), z.unknown()).optional()` (object-valued details from the schema service) vs `z.string().optional()` in `common.ts` — do not merge them blindly. When you next touch `tenant.ts` or `user.ts`, replace the local copy with the `../util/common` import; do not add a new copy.

### `GatewayErrorSchema` — auth failures (401)

```typescript
export const GatewayErrorSchema = z.strictObject({
    error: z.string(),
});
```

Not yet centralized in `util/common.ts` — duplicated in `fixtures/api/schemas/app/tenant.ts`, `user.ts`, and `policy.ts`, all as `z.strictObject(...)`. The request hits the API gateway before reaching the app, so 401 has a different shape than 400/404. Use it for both "no token" and "wrong-realm/wrong-issuer" tokens. **Exception:** the policy service returns the `APIErrorSchema` shape (`{ message }`) for 401 — see the verified comment in `policy.ts`.

### `PageInfoSchema` — pagination wrapper

Canonical definition in `fixtures/api/schemas/util/common.ts`:

```typescript
export const PageInfoSchema = z.strictObject({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalElements: z.number().int(),
    totalPages: z.number().int(),
});
```

No local duplicates remain. `synthetic.ts`, `tenant.ts`, `user.ts`, and `policy.ts` import it from `../util/common`; `probe.ts` and `data.ts` import via `./synthetic` and `alert.ts` via `./policy` (one extra hop — prefer importing from `../util/common` directly in new files).

### Empty body (403, 405)

```typescript
expect(body).toBeNull();
```

403 means the gateway accepted the token but the user lacks permissions; 405 means wrong verb on a real path. Both return empty bodies.

## ApiRequestFn signature

From `fixtures/api/api-types.ts`:

```typescript
export type ApiRequestParams = {
    method: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    baseUrl?: string;
    body?: Record<string, unknown> | null;
    headers?: string;
};

export type ApiRequestResponse<T = unknown> = {
    status: number;
    body: T;
};

export type ApiRequestFn = <T = unknown>(
    params: ApiRequestParams
) => Promise<ApiRequestResponse<T>>;
```

The `headers` field is overloaded:
- `undefined` → unauthenticated request, `Content-Type: application/json`.
- `'form-urlencoded'` → switches to form encoding, no auth (used for Keycloak token endpoints).
- any other string → treated as a Bearer token (`Authorization: Bearer <token>`).

### Parameter usage table

| Param      | Type                                              | Required | Description                                                                                                                                                            |
| ---------- | ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`   | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'` | Yes      | HTTP verb                                                                                                                                                              |
| `url`      | `string`                                          | Yes      | Relative path from `appConfig.api.X`. Append ids/query strings as template literals or via a `URLSearchParams` builder (e.g. `buildListSyntheticsUrl`).               |
| `baseUrl`  | `string`                                          | Yes      | `appConfig.apiUrl` for app endpoints. Override only for non-app services (Keycloak, public gateway).                                                                   |
| `body`     | `Record<string, unknown>` \| `null`               | No       | Plain object for verbs that take a payload. Omit or pass `null` otherwise.                                                                                             |
| `headers`  | `string`                                          | No       | Token string → `Authorization: Bearer <token>`. Pass `'form-urlencoded'` for Keycloak token requests. **Omit entirely for unauthenticated requests** — never empty string. |

The fixture parses `application/json` automatically; non-JSON returns the raw value or `null`.

## Token catalog

| Env var | Purpose | Typical 401 surface |
|---------|---------|---------------------|
| `process.env.USER_ACCESS_TOKEN_ADMIN` | Admin scope (admin/tenants, admin/realms, admin/users) | Tenant-scoped endpoints (returns 401, not 403) |
| `process.env.USER_ACCESS_TOKEN_FULL` | Tenant-scoped full permissions (synthetics, probes, users, data, metrics) | Admin endpoints |
| `process.env.USER_ACCESS_TOKEN_ZERO` | Valid token, no permissions | All scoped endpoints — returns 403 with `body === null`. **⚠ Provisioning caveat (plan § 6.2):** this env var is **not always provisioned** in the test environment; there's an open TODO to re-add it for RBAC/403 testing (see [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md)). Guard 403 specs with `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "ZERO token not provisioned")` until it is re-added; do not silently drop the 403 row from the negative matrix. |
| `process.env.FRONT_MAIN_PASSWORD` | Default password for KC users created in E2E onboarding | n/a |
| `process.env.MAILPIT_URL` | Mailpit base URL (default `http://localhost:8025`) | n/a |
| `process.env.MAILPIT_USERNAME`, `MAILPIT_PASSWORD` | Optional Basic auth for protected Mailpit deployments | n/a |
| `process.env.API_URL`, `APP_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `TENANT_ID` | Surface via `appConfig.apiUrl` / `baseUrl` / `keycloakUrl` / `keycloakRealm` / `tenantId` | n/a |
| `process.env.KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | Used by `helpers/util/keyCloak.ts` for direct KC admin operations (see `setupTestUser`) | n/a |
| `process.env.KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD` | Default `admin`/`admin`. Used by `getAuthenticatedKcAdminClient` | n/a |

Use `process.env.USER_ACCESS_TOKEN_*!` directly at every call site — **no aliasing** (see `data-strategy` §1.6 for rationale: grepability, no alias-name drift). The `!` (non-null assertion) is mandatory per the `type-safety` skill — required env vars must use `!` so the test crashes loudly at startup if missing. Never use `??` or `as string`.

```typescript
headers: process.env.USER_ACCESS_TOKEN_FULL!,
```

Existing specs with `const TENANT_TOKEN = ...` aliases are tech debt — normalize when next touching the file.

## URL/Config catalog

`config/app.ts` exports `appConfig`:

- `appConfig.apiUrl` (= `process.env.API_URL`) — base URL for all app API calls.
- `appConfig.baseUrl` (= `process.env.APP_URL`) — base URL for UI tests, **never** for API.
- `appConfig.tenantId` (= `process.env.TENANT_ID`) — default tenant for cross-tenant scoping tests.
- `appConfig.keycloakUrl` (= `process.env.KEYCLOAK_URL`) — for direct token requests.
- `appConfig.api.X` — API path constants. Use these, never `appConfig.paths.X` (that's UI routes).
- `appConfig.paths.X` — UI routes (e.g. `/synthetics`, `/settings/probes`). **For UI specs only.**

Current `appConfig.api`:

| Constant | Path | Notes |
|----------|------|-------|
| `ADMIN_TENANT` | `/admin/tenants` | Admin-scoped CRUD |
| `ADMIN_REALMS` | `/admin/realms` | No path id (realm implicit from token) |
| `LOGIN`, `LOGOUT`, `REGISTER` | `/auth/*` | Auth endpoints |
| `USERS` | `/users` | Tenant users |
| `USER` | `/user` | Self profile |
| `USER_SESSIONS` | `/users/sessions` | KC sessions |
| `TENANT_SCHEMA` | `/tenants/schema` | Schema service |
| `SYNTHETICS` | `/synthetics` | Tenant-scoped CRUD |
| `SYNTHETICS_METRICS` | `/synthetics/:id/metrics` | Replace `:id` via `.replace(":id", id)` |
| `DATA` | `/data` | PromQL-style query endpoint |
| `DATA_METRICS` | `/data/metrics` | Metric definitions |
| `PROBES` | `/probes` | Tenant-scoped CRUD; `/probes/list` for batch |

## Helper catalog (already exists — reuse before writing new)

Helpers are tagged below with their style:
- **(passthrough)** — returns `{ status, body }`; caller asserts. Used for CRUD across positive and negative tests.
- **(assertion)** — asserts internally and returns the parsed payload (upstream's preferred style for assertion-style helpers).
- **(cleanup)** — tolerates 404 / uses `Promise.allSettled`; returns nothing meaningful.
- **(builder)** — pure data builder (no `apiRequest` call).

### Synthetics — `helpers/app/synthetics.ts`
- (builder) `buildCreateSyntheticBody` (icmp default), `buildCreateHTTPSyntheticBody`, `buildCreateWebSocketSyntheticBody`, `buildCreateTCPSyntheticBody`, `buildCreateDNSSyntheticBody`, `buildCreateSSLSyntheticBody`, `buildCreateMCPSyntheticBody`, `buildUpdateSyntheticBody`.
- (builder) `buildListSyntheticsUrl({ page, pageSize, sort, direction, name, type, target, status, healthStatus, search })`.
- (passthrough) `listSynthetics`, `createSyntheticMonitor`, `getSyntheticMonitor`, `updateSyntheticMonitor`, `deleteSyntheticMonitor`.
- (cleanup) `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, headers)` — synthetics first, probes second.
- (cleanup) `cleanupUiCreatedSyntheticMonitors(apiRequest, token, refs)` — resolves id-by-name with retry.
- (assertion) `setupProbeAndSynthetic(apiRequest, headers?) → { probeId, syntheticId }` — seeds a probe + ICMP synthetic in one call, asserts both creates return 201, returns the typed ids. Use for precondition setup in specs exercising synthetic-dependent resources (policies, alerts, metrics); clean up via `cleanupProbesAndSynthetics`.
- (assertion, **planned** — plan § 4.2) `setupSynthetic(apiRequest, probeIds, headers, overrides?) → Synthetic` — seeds a synthetic, parses with `SyntheticSchema`, returns the typed entity. Use only for preconditions; passthroughs above stay for negative tests.
- Constants: `VALID_CHECK_INTERVALS`, `DEFAULT_CHECK_INTERVAL`, `DEFAULT_TIMEOUT`, `TIMEOUT_MIN/MAX`, `NAME_MIN/MAX_LENGTH`, `TARGET_MIN/MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH`.

### Probes — `helpers/app/probes.ts`
- (builder) `buildCreateProbeBody`, `buildUpdateProbeBody`, `buildListProbesUrl`.
- (passthrough) `createProbe`, `listProbes`, `getProbe`, `updateProbe`, `deleteProbe`.
- (passthrough) `getProbesByIds(apiRequest, ids[], headers)` — POST `/probes/list`.
- (passthrough) `getProbeConfig(apiRequest, probeId, type, headers)`, `getProbeSchema(apiRequest, name, headers)`.
- (cleanup) `cleanupProbes(apiRequest, probeIds, headers)`.
- (assertion, **planned** — plan § 4.2) `setupProbe(apiRequest, headers, overrides?) → Probe`.

### Admin Tenants — `helpers/app/adminTenants.ts`
- (passthrough) `createTenant(apiRequest, name, headers, parentId?)` — note: name + optional parentId are positional, not a body object.
- (passthrough) `getTenant`, `patchTenant(apiRequest, tenantId, body?, headers?)`, `deleteTenant`.
- (assertion, **planned** — plan § 4.2) `setupTenant(apiRequest, adminHeaders, overrides?) → Tenant` — seeds a tenant, parses with `TenantSchema`, returns the typed entity. Used by onboarding / cross-tenant specs.

### Admin Realms — `helpers/app/adminRealms.ts`
- (builder) `buildRealmSettings()` — valid default realm settings (login + email/smtp + tokens) for POST/PATCH bodies.
- (passthrough) `createRealm`, `patchRealm`, `getRealm`. POST always returns 409 on dev (`<realm>` realm exists).

### Admin Users — `helpers/app/adminUsers.ts`
- (builder) `generateUserPayload()` — random valid user body. **⚠ Bug (plan § 4.1):** this generator currently emits emails at `@automation.test`, which Mailpit on test infra does not catch. For any E2E flow that needs an email loop, build the payload locally with a `@<your-test-domain>` recipient (see `templates.md` § 6 `generateE2EUserPayload`) until the helper is fixed in the plan-§ 4.1 PR (one-line swap to `@<your-test-domain>`).
- (passthrough) `createUser(apiRequest, tenantId, body, headers)` — **tenantId is positional (in the path)**, not part of the body.
- (passthrough) `listUsers(apiRequest, tenantId, headers, params?)`.
- (passthrough) `getUser(apiRequest, tenantId, userId, headers)`.
- (passthrough) `updateUser(apiRequest, tenantId, userId, body, headers)`.
- (passthrough) `deleteUser(apiRequest, tenantId, userId, headers)`.
- (assertion) `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken?) → { email, userId }`. Generates a `@<your-test-domain>` email, creates the user via the admin API, **sets the password directly via the Keycloak admin client** (bypasses the invite-link / email-reset flow), purges Mailpit for the recipient. **Does not return KC tokens** and does not capture the invite link. Use it when the test needs a known-credentialed user but does not need to exercise the invite-link UX.
- (assertion) `teardownTestUser(apiRequest, mailpit, tenantId, email, userId, adminToken?)` — purges Mailpit for the recipient, then DELETEs the user via the admin API.

### Users (tenant API) — `helpers/app/users.ts`
- (builder) `buildCreateUserBody(overrides?)`, `buildUpdateUserBody(overrides?)`, `buildListUsersUrl(params?)`. **⚠ Bug (plan § 4.1):** `buildCreateUserBody` emits emails at `@<alt-test-domain>` (note the leading hyphen — **not** the same as `@<your-test-domain>`; Mailpit does not catch it). For Mailpit-catching flows, override the email field with a literal `@<your-test-domain>` address until the plan-§ 4.1 PR lands.
- (passthrough) `listUsers`, `createUser(apiRequest, body, headers)`, `getUser(apiRequest, userId, headers)`, `updateUser(apiRequest, userId, body, headers)` — these target `/users` (tenant-scoped, **no tenantId in path**).
- (passthrough) `logoutUserSession(apiRequest, sessionId, headers)` — DELETE `/users/sessions/:id`.
- (passthrough) `deleteAdminTenantUser(apiRequest, tenantId, userId, headers)` — admin-scoped DELETE under `/admin/tenants/:tenantId/users/:userId`.
- (assertion, **planned** — plan § 4.2) `setupUser(apiRequest, headers, overrides?) → User` — tenant-scoped setup helper, parses with `UserSchema`. Distinct from `setupTestUser` (which is admin-scoped, KC-credentialed, in `adminUsers.ts`).
- The two `users.ts` and `adminUsers.ts` modules cover **different APIs**: tenant-scoped (no tenantId in URL) vs admin-scoped (tenantId in URL). Pick the helper that matches the route under test.

### Mailpit utilities — `helpers/util/mailpit.ts`
- `MailpitHelper` class (constructor takes an `APIRequestContext`; instance is what the `mailpit` fixture provides). Methods: `getLastEmail(recipient, retries?, interval?) → MailMessage | null`, `deleteEmailsForRecipient(email)`, `deleteAllEmails()`.
- `getInviteLinkFromEmail(mailpit, email): Promise<string>` — retries (10×2s), asserts non-null, returns the action-token link.
- `extractLinkFromEmail(emailBody): string | null` — single arg; matches the first URL containing `action-token`.
- `extractOtpFromEmail(emailBody): string | null` — six-digit OTP.
- `getNextTestEmail(baseEmail): string` — appends `+<random>` before `@` for unique-per-run inboxes.

### Data / Metrics — `helpers/app/data.ts`
- (passthrough) `getSyntheticMetrics(apiRequest, syntheticId, headers)` — GET `/synthetics/:id/metrics`.
- (passthrough) `listMetrics(apiRequest, params?, headers)` — GET `/metrics` paginated metric catalog (`types`, `name`, `normalizedName`, `page`, `pageSize`, `sort`, `direction`).
- (assertion) `pickPolicyMetricForType(apiRequest, monitorType, headers?) → CatalogMetric` — first policy-eligible metric for a monitor type; throws if none found.
- (passthrough) `getSyntheticTypes(apiRequest, headers)` — GET `/synthetics/types`.
- (passthrough) `queryData(apiRequest, params, headers)` — **GET** `/data` with `query`, `testId`, optional `time` / `timeframe` / `last` as query params (URL built internally).
- (passthrough) `queryMetrics(apiRequest, body, headers)` — POST `/data/metrics` for aggregated queries.

### Alerts — `helpers/app/alerts.ts`
- (passthrough) `listAlerts(apiRequest, headers?, params?)` — GET `/alerts` (page/pageSize/sort/direction, `severity`, `state`, `monitorId`, `search`, `from`/`to`; note `policyId` is NOT a supported filter here).
- (passthrough) `getAlert(apiRequest, alertId, headers?)` — GET `/alerts/:id` (alert ids are **numbers**, not UUIDs).
- (passthrough) `acknowledgeAlert`, `resolveAlert` — POST `/alerts/:id/acknowledge` / `/alerts/:id/resolve`.
- (passthrough) `bulkResolveAlerts(apiRequest, alertIds, headers?)` — POST bulk-resolve.
- (passthrough) `getAlertsStats(apiRequest, headers?, params?)` — GET `/alerts/stats` (supports `groupBy`, `policyId`); `getAlertHistory(apiRequest, headers?, params?)` — GET `/alerts/history` (`timeframe` required).
- (cleanup) `cleanupAlertsForMonitor(apiRequest, monitorId, headers?)` — resolves every non-resolved alert for a monitor; best-effort.
- (assertion) `setupFiringAlertsFixture(apiRequest, monitorCount, headers?, opts?) → FiringAlertsFixture` — provisions probe → monitors → policy → firing alerts; self-cleans on failure; long-running (90–360 s). Over-provisions by `FIRING_ALERTS_DEFAULT_EXTRA_MONITORS` (3) by default.
- (cleanup) `teardownFiringAlertsFixture(apiRequest, fixture, headers?)` — drains alerts → deletes policy → deletes synthetics; tolerates partial state.
- (assertion) `claimFiringAlerts(apiRequest, count, headers?, eligibleIndex?)` — claims N same-monitor firing alerts from the environment; `eligibleIndex` lets parallel spec files pick distinct monitors.
- Shared on-disk fixture cache: `warmSharedFiringAlertsFixtureCache`, `loadSharedFiringAlertsFixture`, `clearSharedFiringAlertsFixtureCache` (+ `SHARED_FIRING_ALERTS_MONITOR_COUNT = 4`) — used by the `alerts-setup` Playwright project.

### Policies — `helpers/app/policies.ts`
- (builder) `buildTriggerCondition`, `buildCreatePolicyBody`, `buildSeverityCascade`, `buildClearCondition`, `buildCreateCascadePolicyBody`, `buildUpdatePolicyBody`, `buildSyntheticBodyForType(type, probeIds)`.
- Constants: `DEFAULT_POLICY_OPERATOR/THRESHOLD/EVALUATION_WINDOW/CONSECUTIVE_COUNT/SEVERITY/DESCRIPTION`, `DEFAULT_CASCADE_POLICY_DESCRIPTION`, `ALL_MONITOR_TYPES`.
- (passthrough) `listPolicies`, `createPolicy`, `getPolicy`, `updatePolicy`, `deletePolicy`.
- (cleanup) `cleanupPolicies(apiRequest, policyIds, headers?)` — `Promise.allSettled` over per-id deletes.
- (assertion) `setupPolicySpecFixture(apiRequest, headers?) → PolicySpecFixture` — seeds 1 probe + one synthetic per monitor type + 1 extra ICMP synthetic + a discovered metric `normalizedName` per type; throws on any seed failure.

### Policy display labels — `helpers/app/policy-display.ts`
- Pure UI-label mappers (no `apiRequest`): `POLICY_OPERATOR_DISPLAY_LABELS`, `POLICY_EVALUATION_WINDOW_LABELS`, `formatNormalizedMetricLabel`, `getPolicyOperatorDisplayLabel`, `getPolicyEvaluationWindowDisplayLabel`, `formatPolicyConditionForDetailsDisplay`. Mirrors the frontend's policy-details-sheet labels — used by UI specs asserting display text.

### Tenant schema — `helpers/app/tenant-schema.ts`
- (passthrough) `getTenantSchema(apiRequest, name?, token?)` — GET `/tenants/schema?name=<name>`. Returns the JSON-Schema for a given DTO type. Omitting `token` is the canonical 401 trigger for this endpoint.

### Storage state — `helpers/app/createStorageState.ts`
- Used by `playwright.config.ts` global setup. **Do not call from specs.**

## Schema patterns by data type

> See `SKILL.md` § "Optional vs nullable — interrogate every modifier" before reaching for `.optional()` or `.nullable()`. The patterns below are syntactic recipes, not permission to loosen the contract.

| Field | Pattern | Strictness note |
|-------|---------|-----------------|
| UUID (default) | `z.string().uuid()` | **Default for any id field.** Loosen only when empirically verified non-UUID. |
| Legacy id (verified non-UUID) | `z.string()` | Document the case inline; tighten once the API guarantees UUIDs. Several existing schemas in this repo have lax `z.string()` ids that should be tightened on the next pass. |
| Datetime UTC `Z` | `z.string().datetime()` | Strict |
| Datetime with offset (`+00:00`) | `z.string().datetime({ offset: true })` | Strict |
| Conditionally absent string | `z.string().optional()` | **Only** when a named condition makes the field absent (comment the condition; cover both branches with tests) |
| Always-present, sometimes-null string | `z.string().nullable()` | **Only** when a named state produces `null` (e.g. `lastLoginAt` before first login); cover the null branch with a test |
| Both absent and null are valid | `z.string().optional().nullable()` | Smell. Document both states or tighten one |
| Small string enum | `z.enum(["enabled", "disabled"])` | Strict — preferred over `z.string()` whenever the API has a closed value set |
| Status enum (modify responses) | `StatusSchema` — `z.enum(["created", "updated", "deleted", "logged out"])` | Strict |
| Free-form record | `z.record(z.unknown())` (e.g. `config` on synthetics) | Use sparingly; prefer a typed `z.discriminatedUnion` per `type` once shapes stabilize |
| Pagination wrapper | reuse `PageInfoSchema` from `fixtures/api/schemas/util/common.ts` (the canonical definition; resource files import or re-export it) | Strict |
| New schema, prefer strict | `z.strictObject({ ... })` (rejects extras → catches API regressions) | Strict-by-default |
| Numeric enum (rare) | `z.union([z.literal(0), z.literal(1)])` or `z.nativeEnum(MyEnum)` | Strict |
| Contract-guaranteed error string | `message: z.literal("Conflict: resource already exists")` | **Only** when the exact message is part of the documented API contract. Otherwise assert status + envelope shape (see the WON'T in `SKILL.md`). Binds the schema to the wording — a backend copy-tweak breaks the test on purpose |
| Pattern-matched contract error string | `message: z.string().refine((v) => v.includes("probe"), "must mention probe")` | Same guard as above. Use when the contract fixes a substring/keyword but not the full sentence (interpolated ids, counts). Prefer over `z.literal` when the message contains variable parts |

### Decision shortcut — should this be optional, nullable, or strict?

```
Is the field always present in every successful response?
├── Yes
│   └── Is the value ever `null`?
│       ├── No  → strict:    z.string()
│       └── Yes → nullable:  z.string().nullable()  (+ test the null branch)
└── No
    └── Under what named condition is it absent?
        ├── Can name it → optional: z.string().optional()  (+ comment the condition + test both branches)
        └── Can't name it → schema is wrong; investigate before loosening
```

Audit fields (`id`, `createdAt`, `updatedAt`, `tenantId`) are **never** optional/nullable. If a test reports the API skipping them, that is a contract bug, not a schema gap.

## Invalid-type arrays — when to use which

All arrays live in `fixtures/api/invalid-types.ts`. Import and iterate — never redefine inline. The loop *patterns* (loop inside `test()`, `test.step` + `expect.soft`) are rules and live in [SKILL.md § Per-field invalid-type loop](SKILL.md).

| Array | Use for | Values (faker calls evaluate at import time) |
|-------|---------|----------------------------------------------|
| `invalidString` | Required `string` field | `""`, `"   "`, `null`, `undefined`, `faker.number.int()`, `faker.number.float()`, `true`, `false`, `[]`, `{}` |
| `invalidStringTypes` | Optional `string` field (wrong types only — `null`/`undefined`/`""` may be valid) | `faker.number.int()`, `faker.number.float()`, `true`, `false`, `[]`, `{}` |
| `invalidBoolean` | Required `boolean` field | `""`, `"   "`, `null`, `undefined`, `faker.string.alpha(5)`, `faker.number.int()`, `faker.number.float()`, `[]`, `{}` |
| `invalidBooleanTypes` | Optional `boolean` field | `faker.string.alpha(5)`, symbol-string, `faker.number.int()`, `faker.number.float()`, `[]`, `{}` |
| `invalidInteger` | Required `integer` field | `""`, `"   "`, `null`, `undefined`, `faker.string.alpha(5)`, `faker.datatype.boolean()`, negative int, positive float, sub-1 float, `[]`, `{}` |
| `invalidIntegerTypes` | Optional `integer` field | `faker.string.alpha(5)`, symbol-string, `faker.datatype.boolean()`, positive float, sub-1 float, negative int, `[]`, `{}` |
| `invalidIntegerStrictTypes` | Integer field needing a stable, faker-free set (snapshot tests, deterministic loops) | `"abc"`, `null`, `true`, `false`, `[]`, `{}` |
| `invalidObject` | Required object/record field | `""`, `"   "`, `null`, `undefined`, `faker.string.alpha(5)`, `faker.number.int()`, `faker.number.float()`, `faker.datatype.boolean()`, `[]` |
| `invalidObjectTypes` | Optional object field | `faker.string.alpha(5)`, symbol-string, `faker.number.int()`, `faker.number.float()`, `faker.datatype.boolean()`, `[]` |
| `specialChars` | ID-format / injection tests on path or query parameters | symbol-string × 5, `"<script>alert(1)</script>"`, `"---"`, symbol-string × 10 |
| `boundaryString` | Boundary tests on string-length-bounded fields (names, descriptions) | 1-char, 255–260-char, two-word, alphanumeric+symbols, uppercase, ascii+unicode |

## Setup timeout table

Size `test.setTimeout()` inside `beforeAll` to the setup pattern (Keycloak ops run 15–25 s each on resource-constrained environments):

| Setup pattern | Recommended `test.setTimeout` |
|---------------|-------------------------------|
| 1 tenant + 0-1 users (no Keycloak admin ops) | `60_000` |
| 1 tenant + 1-2 users + Keycloak admin workflow | `90_000` |
| Cross-tenant isolation (2 tenants + users + full Keycloak admin cycle + probe + synthetic + metrics) | `120_000` |
| `setupPolicySpecFixture` (1 probe + 7 synthetics + metric discovery) | `90_000` |

## Mailpit recipe (E2E API + email loop)

```typescript
import { test, expect } from "../../../fixtures/pom/test-options";
import { extractLinkFromEmail, getInviteLinkFromEmail } from "../../../helpers/util/mailpit";

test(
    "Verify tenant onboarding sends invitation email",
    { tag: "@App-E2E" },
    async ({ apiRequest, mailpit }) => {
        test.setTimeout(60_000);

        // Recipient MUST be @<your-test-domain> (Mailpit catches that domain only on test infra).
        const email = `qa-onboard-${Date.now()}@<your-test-domain>`;

        // Always purge before triggering.
        await mailpit.deleteEmailsForRecipient(email);

        // ... create tenant, create user with `email`, trigger invitation ...

        // Option A — manual loop (when you need the raw message):
        const message = await mailpit.getLastEmail(email, /* retries */ 10, /* interval ms */ 2000);
        expect(message).not.toBeNull();                    // getLastEmail returns MailMessage | null
        const link = extractLinkFromEmail(message!.Content.Body); // single arg, matches "action-token" URLs
        expect(link).not.toBeNull();

        // Option B — one-liner that asserts non-null and extracts the link in one go:
        // const link = await getInviteLinkFromEmail(mailpit, email);

        // Always purge after — keeps the next run clean.
        await mailpit.deleteEmailsForRecipient(email);
    },
);
```

Cleanup order for onboarding-style flows: **Mailpit emails → Users → Tenant**. Guard each branch with `if (tenantId)` / `if (userIds.length)`.

## Retry recipe (eventual consistency only)

Some reads are eventually consistent — e.g. metrics/data for a synthetic appear only after a collection cycle. When (and **only** when) the OpenAPI/domain docs describe the endpoint as eventually consistent, poll with Playwright's built-in `expect.poll` (never `setTimeout`/`waitForTimeout`, never a raw `while` loop):

```typescript
await expect
    .poll(
        async () => {
            const { status, body } = await getSyntheticMetrics(
                apiRequest,
                syntheticId,
                process.env.USER_ACCESS_TOKEN_FULL,
            );
            return status === 200 && body.metrics.length > 0;
        },
        { timeout: 60_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(true);
```

Guard rails:
- **Only for documented eventual consistency.** Polling to paper over a timing bug, a slow environment, or a flaky assertion is forbidden — fix the root cause instead. If you cannot cite the eventual-consistency contract, do not add a poll.
- Bounded: always pass an explicit `timeout` + `intervals`. No unbounded loops.
- Return a boolean/value from the poll callback and assert it; do not put `expect(...)` inside the callback.
- For email propagation, prefer the existing `MailpitHelper.getLastEmail(email, retries, interval)` (it already implements a bounded poll) over a hand-rolled `expect.poll`.

## Cross-tenant isolation pattern

The contract: cross-tenant access returns **404, not 403** — the server hides resource existence across tenants. There are two cross-tenant shapes in this codebase:

### A. Tenant-scoped resource (synthetic, probe) — token-based isolation

The path has no tenantId; the token's tenant claim is the boundary.

```typescript
const { status, body } = await apiRequest<APIError>({
    method: "GET",
    url: `${appConfig.api.SYNTHETICS}/${syntheticIdInTenantB}`,
    baseUrl: appConfig.apiUrl,
    headers: TENANT_A_TOKEN,        // token belongs to Tenant A
});

expect(status).toBe(404);
expect(APIErrorSchema.parse(body)).toBeTruthy();
```

### B. Admin-scoped resource (admin user) — tenantId-in-path isolation

The admin token can talk to any tenant; isolation is enforced by tenantId in the URL.

```typescript
const { status, body } = await getUser<APIError>(
    apiRequest,
    tenantB_Id,        // ask under Tenant B
    userA_Id,          // for a user that lives in Tenant A
    process.env.USER_ACCESS_TOKEN_ADMIN!,
);

expect(status).toBe(404);
```

See `tests/app/api/shared/cross-tenant-isolation.spec.ts` (admin/users) and `tests/app/api/shared/cross-tenant-metrics-isolation.spec.ts` (synthetics/data) for the canonical patterns. Both 404, both treated as the app's primary cross-tenant contract.

## Form-encoded recipe (Keycloak token)

```typescript
const { status, body } = await apiRequest<{ access_token: string }>({
    method: "POST",
    url: `/realms/${appConfig.keycloakRealm}/protocol/openid-connect/token`,
    baseUrl: appConfig.keycloakUrl,
    headers: "form-urlencoded",
    body: {
        grant_type: "password",
        client_id: "automation-tests",
        username,
        password,
    },
});
```

## Decision tree — where does this code go?

```
Adding test logic?                    → tests/app/api/<domain>/<resource>.spec.ts
Adding a per-resource Zod shape?      → fixtures/api/schemas/app/<resource>.ts (no app barrel — specs
                                         deep-import from the resource file)
Adding a SHARED schema (error/auth/  → fixtures/api/schemas/util/common.ts
  pagination)?                          Already holds PageInfoSchema / APIErrorSchema /
                                          JSONSchemaResponseSchema — import them; add new shared
                                          shapes here (re-exported via util/index.ts).
Reusing a request elsewhere?          → helpers/app/<resource>.ts (passthrough by default;
                                         assertion-style only for setup/teardown helpers)
Single one-shot request used in 1     → no helper; call apiRequest({...}) directly inside the spec
  spec?
Static value used in 1+ specs?        → test-data/app/<resource>.json
Random per-run payload?               → buildCreate<X>Body in helpers/app/<resource>.ts (faker)
New invalid-value array?              → fixtures/api/invalid-types.ts (consider reusing existing)
Need a new path constant?             → config/app.ts under `api`
Need a new Qase suite label?          → enums/app/qase-suites.ts (use \t for nesting)
Need a new fixture (rare)?            → fixtures/api/<x>-fixture.ts for HTTP/API fixtures (apiRequest,
                                         mailpit live there), or fixtures/services/<x>-fixture.ts for
                                         service-level fixtures (login lives there). Merge into
                                         fixtures/pom/test-options.ts.
Need to share a body across UI+API?   → leave in helpers/app/<resource>.ts; UI calls the same builder
```

---

## Endpoint context (resource-by-resource)

Domain knowledge that an author needs **before** opening the OpenAPI for the first time. The OpenAPI is the source of truth for shapes; this section captures the conceptual model, dependency order, known bugs, and auth patterns that don't show up in the schema. Verify each fact against the live source before relying on it — backend evolves.

### Admin Tenants & Realms

- **Tenant API:** `POST/GET/PATCH/DELETE /api/v1/admin/tenants(/:id)`. Create body: `{ name, parentId? }`. Update body: `{ name? }`. List query params: `page`, `pageSize`, `sort`, `direction`, `name`. Tenant names match `^[A-Za-z][A-Za-z0-9_-]*$`.
- **Realm API:** `POST/PATCH /api/v1/admin/realms`. Body: `{ settings: { email?, login?, tokens? } }`. **No path param** — realm is implicit from the admin token. POST always returns 409 on dev (the `<realm>` realm already exists).
- **Realm vs Tenant conceptual model:** **Realm** = Keycloak auth domain (one per realm). **Tenant** = organization within a realm (many). Order: Create realm → Create tenants → Create users.
- **Schemas:** `TenantSchema` (no settings field), `TenantSettingsSchema`, `CreateRealmResponseSchema`, `UpdateRealmResponseSchema`.
- **Helpers:** [`helpers/app/adminTenants.ts`](../../../helpers/app/adminTenants.ts) (`createTenant`, `getTenant`, `patchTenant`, `deleteTenant`); [`helpers/app/adminRealms.ts`](../../../helpers/app/adminRealms.ts) (`buildRealmSettings`, `getRealm`, `createRealm`, `patchRealm`).
- **Auth:** Admin endpoints use `process.env.USER_ACCESS_TOKEN_ADMIN`. For Keycloak details see [docs/keycloak-dev-setup.md](../../../docs/keycloak-dev-setup.md).
- **Validation status:** realm-settings validation is largely enforced now — `admin-realms.spec.ts` has active 400 tests for empty body, `settings: null`, `settings` as string, unknown keys, missing `settings` key, and per-field invalid string/boolean/integer/object values; POST with `settings: {}` returns 400. The one unverified edge: no explicit PATCH `settings: {}` test exists.

### Synthetics (ICMP / HTTP / TCP / DNS / SSL / WebSocket / MCP)

- **Synthetic API** (tenant-scoped): `POST/GET/PATCH/DELETE /api/v1/synthetics(/:id)`. Create body: `{ name, target, type, checkInterval?, timeout, probeIds }`. **Do NOT send empty `config: {}`** — backend rejects it. PATCH is partial; `type` is immutable.
- **Probe API** (tenant-scoped): `POST /api/v1/probes` body `{ name, location, region }`. `DELETE /api/v1/probes/:id`.
- **Probe ↔ Synthetic dependency:** A probe must exist before creating a synthetic. **Cleanup order: delete synthetics FIRST, then probes** — a probe still referenced by a synthetic returns 409 on delete. `cleanupProbesAndSynthetics` in `helpers/app/synthetics.ts` enforces this order.
- **Helpers:** [`helpers/app/synthetics.ts`](../../../helpers/app/synthetics.ts) (`buildCreateSyntheticBody`, `createSyntheticMonitor`, `getSyntheticMonitor`, `updateSyntheticMonitor`, `deleteSyntheticMonitor`); [`helpers/app/probes.ts`](../../../helpers/app/probes.ts) (`createProbe`, `deleteProbe`, `cleanupProbes`); plus the combined `cleanupProbesAndSynthetics`.
- **Schemas:** `SyntheticSchema` (`tests` field is nullable), `ListSyntheticsResponseSchema`, `CreateSyntheticResponseSchema`, etc.
- **Auth pattern:** `401` (no token), `401` (admin token on a tenant endpoint — unlike `/users` which returns `404` for the same case).
- **Sort-test guidance:** verify endpoint accepts `sort`/`direction` params and returns valid results — **do NOT assert exact order** because PostgreSQL collation differs from JS `Array.sort` and produces non-deterministic test results across environments.
- **Type coercion:** API coerces non-string `name` / `target` to strings. Confirmed desired behavior — don't write tests that expect `400` for `name: 123`.
- **400 vs 404 on PATCH:** an invalid body fails validation before the resource lookup (400); a valid body with a non-existent UUID returns 404. Both branches are covered by an active test in `icmp-synthetic-monitor.spec.ts`.

### Tenant Onboarding E2E

- **Spec:** [`tests/app/api/tenant-service/e2e-tenant-onboarding-flow.spec.ts`](../../../tests/app/api/tenant-service/e2e-tenant-onboarding-flow.spec.ts) — 4 tests (create tenant + invite + verify email; UUID immutability; empty user list; multi-user emails).
- **Email domain:** **Must use `@<your-test-domain>`** for Mailpit delivery. Local helper `generateE2EUserPayload()` enforces this — do **NOT** use `generateUserPayload()` from `adminUsers.ts` (which uses `@automation.test` and the email never arrives).
- **Helpers:** `createTenant`, `getTenant`, `patchTenant`, `deleteTenant`, `createUser`, `listUsers`, `getUser`, `deleteUser`, `extractLinkFromEmail`, `MailpitHelper`.
- **Cleanup order:** Mailpit emails → Users → Tenant. Each step guarded by `if (tenantId)` so a partial failure still cleans whatever made it through.
- **Mailpit recipe:** `deleteEmailsForRecipient` before AND after, `getLastEmail(email, 10, 2000)` (10 polls, 2s interval), guard with `To.length > 0` before reading.
- **AC gap:** AC 4 ("tenant requires primary user") is not enforced by backend yet — current behavior allows tenant creation without a primary user. Don't write a test that asserts the AC; surface the gap in the test plan.

### Synthetic Monitor Metrics

- **Metrics API** (tenant-scoped): `GET /api/v1/synthetics/:id/metrics`. Returns metric **definitions** (name, unit, dataType, monitorType) available for a synthetic monitor based on its type. Includes traceroute metrics when traceroute is enabled.
- **Response shape:** `{ metrics: [{ dataType, monitorType, name, unit }] }`. Example ICMP metric: `{ dataType: "gauge", monitorType: "icmp", name: "icmp_rtt_avg_ms", unit: "ms" }`.
- **Error responses:** `400` (invalid id format), `401` (no/wrong token), `404` (non-existent monitor), `500`.
- **Schemas:** `MetricSchema` (`z.strictObject`), `GetSyntheticMetricsResponseSchema` (`z.strictObject`) — both in [`fixtures/api/schemas/app/data.ts`](../../../fixtures/api/schemas/app/data.ts).
- **Helpers:** `getSyntheticMetrics` in [`helpers/app/data.ts`](../../../helpers/app/data.ts).
- **Spec:** [`tests/app/api/monitoring-service/metrics/synthetic-metrics.spec.ts`](../../../tests/app/api/monitoring-service/metrics/synthetic-metrics.spec.ts) — covers per-type metric definitions (ICMP, HTTP, TCP, DNS, WebSocket, SSL, MCP), ICMP/HTTP traceroute variants, PATCH traceroute toggle, 400/401/404/405, error message content.
- **Auth pattern:** same as other synthetic endpoints — `401` (no token), `401` (admin token on tenant endpoint).
- **Key behavior:** Metrics are **type-specific** (ICMP monitor returns ICMP metrics, HTTP returns HTTP metrics). Traceroute metrics appear only when `config.enableTraceroute: true`.
- **Deeper context:** `metrics-api-tests-context` (project repo only — trimmed from this toolkit) — full per-endpoint test plan, predefined query catalog, monitor-type metric inventory.

---

## Setup-Restore pattern (for tests touching shared mutable state)

When a test mutates state that other tests or developers depend on (toggling a feature, changing a setting, flipping `enabled` on a resource), capture the initial state in `test.beforeAll` and restore it in `test.afterAll` so the suite is non-destructive:

```typescript
let initialStates: Map<string, boolean>;

test.beforeAll(async ({ apiRequest }) => {
  const { body } = await listResources(apiRequest, TOKEN);
  initialStates = new Map(body.items.map((r) => [r.id, r.enabled]));
  // Bring everything to the state the tests need
  for (const [id, enabled] of initialStates) {
    if (!enabled) await updateResource(apiRequest, TOKEN, id, { enabled: true });
  }
});

test.afterAll(async ({ apiRequest }) => {
  for (const [id, wasEnabled] of initialStates) {
    await updateResource(apiRequest, TOKEN, id, { enabled: wasEnabled });
  }
});
```

Use this pattern whenever tests touch settings, toggles, feature flags, or any shared resource whose default value matters to other tests in the suite. The alternative — leaving the suite to mutate state freely — produces order-dependent failures that pass alone and fail in CI.

---

## Multi-Step & E2E API tests — operational notes

- Use `test.step()` for setup-then-verify flows.
- E2E onboarding tests use `@App-E2E` tag, destructure `{ apiRequest, mailpit }`, set explicit timeouts (`60_000` for single-email flows, `90_000` for multi-user email flows).
- Email tests **must** use the `@<your-test-domain>` domain (not `@automation.test`) for Mailpit delivery.
- Cleanup ordering for onboarding: Mailpit emails → Users → Tenant — each step guarded by `if (tenantId)` / `if (userId)` so partial failures still clean up.


## Common request recipes

| Need | Snippet |
|------|---------|
| Tenant-scoped GET | `headers: process.env.USER_ACCESS_TOKEN_FULL` |
| Admin GET | `headers: process.env.USER_ACCESS_TOKEN_ADMIN` |
| Forbidden user (403) | `headers: process.env.USER_ACCESS_TOKEN_ZERO` — see caveat below |
| Anonymous (401) | omit `headers` entirely |
| Form-encoded body (Keycloak token) | `headers: 'form-urlencoded'`, `body: { grant_type, … }`, `baseUrl: process.env.KEYCLOAK_URL!` |
| Query string | Use a `buildList<X>Url(params)` helper (see `synthetics.ts`, `probes.ts`) |
| Path with id | `` url: `${appConfig.api.SYNTHETICS}/${id}` `` |
| Sub-resource | `` url: appConfig.api.SYNTHETICS_METRICS.replace(":id", id) `` (or build via template literal) |
| Mailpit mailbox | use the `mailpit` fixture (`{ apiRequest, mailpit }`); recipient must be `@<your-test-domain>` |
| Email-loop signup (e2e onboarding) | combine `mailpit`, `extractLinkFromEmail`, and the user-creation helpers |

> **`USER_ACCESS_TOKEN_ZERO` caveat.** The 403 token is part of the canonical matrix (per upstream convention), but it is **not always provisioned** in the current test environment — there's an open TODO to re-add it for RBAC/403 testing (see [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md)). When writing 403 tests and the env var is not provisioned, **comment out** the 403 test with `// TODO: FIXME: USER_ACCESS_TOKEN_ZERO not provisioned — re-enable when RBAC token is added` above it. Do not silently drop the 403 row from the matrix.
