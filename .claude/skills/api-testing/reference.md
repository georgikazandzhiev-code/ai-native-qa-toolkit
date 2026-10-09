# API Testing Reference

## Architecture map

| Layer | Path | Responsibility |
|-------|------|----------------|
| Spec | `tests/app/api/<domain>/<resource>.spec.ts` | Behavior + assertions, one spec per endpoint group (CRUD, e2e flow, isolation); domain folders per the `scaffold-spec` skill |
| Fixture (HTTP) | `fixtures/api/api-request-fixture.ts` + `plain-function.ts` | Wraps `request` into a typed `apiRequest<T>()` returning `{ status, body }` |
| Fixture (merge) | `fixtures/pom/test-options.ts` | Merges page-object, api, login and mailpit fixtures; **specs import `test`/`expect` from here** |
| Schemas (per-resource) | `fixtures/api/schemas/app/<resource>.ts` | Zod schemas + inferred types for that resource. 8 resource files: `job.ts`, `notification-rule.ts`, `notification.ts`, `run-stats.ts`, `tenant-schema.ts`, `tenant.ts`, `user.ts`, `worker.ts`. **No `app/index.ts` barrel exists** — specs deep-import from the resource file. |
| Schemas (shared) | `fixtures/api/schemas/util/common.ts` | **Canonical home for shared schemas — import from here.** Exports `PageInfoSchema` (`z.strictObject`), `APIErrorSchema` (`z.strictObject`), and `JSONSchemaResponseSchema`. `job.ts`/`notification-rule.ts`/`tenant.ts`/`user.ts`/`notification.ts` consume it (directly or via re-export). A barrel exists at `fixtures/api/schemas/util/index.ts` re-exporting `./common` and `./keycloak`. |
| Config | `config/app.ts`, `config/util/*.ts` | Base URLs (`appConfig.apiUrl`) + path catalog (`appConfig.api.X` for API, `appConfig.paths.X` for UI) |
| Helpers | `helpers/app/<resource>.ts` | Reusable API flows (`createJob`, `cleanupWorkersAndJobs`, `createTenant`, …) |
| Test data | `test-data/app/<resource>.json` | Static fixtures (`invalidId`, `nonExistentId`, boundary values, job-type configs) |
| Invalid-types | `fixtures/api/invalid-types.ts` | Reusable invalid-value arrays — see § Invalid-type arrays below |
| Generators | `helpers/app/<resource>.ts` (`buildCreate<X>Body` / `buildUpdate<X>Body`). Per-file is acceptable today; **trigger threshold:** extract to a shared `helpers/app/test-data-generators.ts` once `jobs.ts` reaches a 10th job type **or** another helper crosses 5 builders. | Payloads unique per test run, via `faker`; never hardcode names |
| Qase | `enums/app/qase-suites.ts` | `SUITES.API_*` constants used in `qase.suite()` |
| Mailpit | `helpers/util/mailpit.ts`, `fixtures/api/mailpit-fixture.ts` | Email loop tests; `@<your-test-domain>` recipient domain required |

Deep reference for response shapes, error catalog, schema patterns, helper inventory, and request recipes used in this framework.

> Read [SKILL.md](SKILL.md) first for the workflow and source-of-truth philosophy. For per-verb coverage rules ("what do I owe for GET / POST / PUT / PATCH / DELETE / 405?") see [http-method-coverage.md](http-method-coverage.md).

## Response shape catalog

This API does **not** use a global success envelope. Match the actual shape for each verb.

### List (paginated)

```typescript
z.strictObject({
    pageInfo: PageInfoSchema,
    <resourcePlural>: z.array(<Resource>Schema),
});
```

`PageInfoSchema` is reused across list responses (definition under § Error catalog → `PageInfoSchema`). Examples: `ListJobsResponseSchema` (`{ pageInfo, jobs }`), `ListTenantsResponseSchema` (`{ pageInfo, tenants }`), `ListUsersResponseSchema` (`{ pageInfo, users }`), `ListWorkersResponseSchema` (`{ pageInfo, workers }`).

### Single (GET by id)

```typescript
z.strictObject({ <resource>: <Resource>Schema });
```

The body is wrapped under the singular resource name. Examples: `GetJobResponseSchema` → `body.job`, `GetTenantResponseSchema` → `body.tenant`, `GetUserResponseSchema` → `body.user`, `GetWorkerResponseSchema` → `body.worker`.

### Create (POST)

```typescript
z.strictObject({
    <resource>Id: z.string(),     // tenantId, jobId, userId, workerId
    status: StatusSchema,         // OR z.string() for some endpoints
});
```

The id field name is **resource-specific**. `status` is `StatusSchema` (the enum below) for tenant/user/realm endpoints, plain `z.string()` for jobs/workers — match the actual API.

```typescript
export const StatusSchema = z.enum(["created", "updated", "deleted", "logged out"]);
```

### Update (PATCH)

Two flavors in this codebase, both valid — match the API:

```typescript
// Minimal (admin tenants, admin realms, admin users)
z.strictObject({ status: StatusSchema });
z.strictObject({ <resource>Id: z.string(), status: StatusSchema });

// With echoed entity (jobs)
z.strictObject({
    status: z.string(),
    job: JobSchema,
});
```

### Delete (DELETE)

```typescript
z.strictObject({
    <resource>Id: z.string(),
    status: StatusSchema,         // OR z.string() for jobs/workers — match the API
});
```

Successful DELETE returns **200**, not 204. 404 (already-deleted) is acceptable in cleanup helpers.

## Schema file inventory (`fixtures/api/schemas/app/`)

Main exported schemas per resource file (all `z.strictObject` unless noted):

| File | Main exports |
|------|--------------|
| `job.ts` | `JobSchema`, `JobAssignmentSchema`, `ListJobsResponseSchema`, `CreateJobResponseSchema`, `GetJobResponseSchema`, `UpdateJobResponseSchema`, `DeleteJobResponseSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` from `../util/common` |
| `worker.ts` | `WorkerStatus` (enum), `WorkerSchema`, `CreateWorkerResponseSchema`, `ListWorkersResponseSchema`, `GetWorkerResponseSchema`, `UpdateWorkerResponseSchema`, `DeleteWorkerResponseSchema`, `GetWorkersByIdsResponseSchema` |
| `notification.ts` | `NotificationSchema`, `NotificationStateSchema` / `NotificationOperationStatusSchema` (enums), `ListNotificationsResponseSchema`, `GetNotificationResponseSchema`, `AcknowledgeNotificationResponseSchema`, `ResolveNotificationResponseSchema`, `BulkResolveNotificationsResponseSchema`, `NotificationsStatsSchema` (+ severity/state group and count sub-schemas), `NotificationHistoryResponseSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` / `SeveritySchema` via `./notification-rule` |
| `notification-rule.ts` | `NotificationRuleSchema`, `ConditionSchema` / `ConditionInputSchema`, `SeverityCascadeItemSchema`, enums (`EvaluationWindowSchema`, `OperatorSchema`, `SeveritySchema`, `NotificationRuleTypeSchema`, `NotificationRuleStatusSchema`), `ListNotificationRulesResponseSchema`, `CreateNotificationRuleResponseSchema`, `GetNotificationRuleResponseSchema`, `UpdateNotificationRuleResponseSchema`, `DeleteNotificationRuleResponseSchema`; local `GatewayErrorSchema`; re-exports `APIErrorSchema` / `PageInfoSchema` from `../util/common` |
| `tenant.ts` | `TenantSchema`, `TenantSettingsSchema` (+ SMTP/email/login/token sub-schemas and `Update*` variants), `StatusSchema` (enum), tenant/realm/user CRUD response schemas (`CreateTenantResponseSchema`, `GetRealmResponseSchema`, `CreateRealmResponseSchema`, `UpdateRealmResponseSchema`, admin-side `UserSchema`, …); local `APIErrorSchema` / `GatewayErrorSchema` |
| `user.ts` | tenant-side `UserSchema`, `StatusSchema` (enum), `ListUsersResponseSchema`, `CreateUserRequest/ResponseSchema`, `GetUserResponseSchema`, `UpdateUserRequest/ResponseSchema`, `LogoutUserSessionResponseSchema`; local `APIErrorSchema` / `GatewayErrorSchema` |
| `run-stats.ts` | `RunStatSchema`, `JobRunStatSchema`, `CatalogRunStatSchema`, `GetJobRunStatsResponseSchema`, `GetRunStatsCatalogResponseSchema`, `ListRunStatCatalogResponseSchema`, `GetJobTypesResponseSchema`; `StatsStoreResponseSchema` (intentional lax `z.object` — the third-party run-stats store's responses may include extra fields) |
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

**Current state:** `job.ts` and `notification-rule.ts` re-export the canonical schema from `../util/common` (and `notification.ts` re-exports through `notification-rule.ts`). Local copies remain in `tenant.ts`, `user.ts`, and `tenant-schema.ts` — all `z.strictObject`. **The `tenant-schema.ts` copy is DIVERGENT:** its `details` is `z.record(z.string(), z.unknown()).optional()` (object-valued details from the schema service) vs `z.string().optional()` in `common.ts` — do not merge them blindly. When you next touch `tenant.ts` or `user.ts`, replace the local copy with the `../util/common` import; do not add a new copy.

### `GatewayErrorSchema` — auth failures (401)

```typescript
export const GatewayErrorSchema = z.strictObject({
    error: z.string(),
});
```

Not yet centralized in `util/common.ts` — duplicated in `fixtures/api/schemas/app/tenant.ts`, `user.ts`, and `notification-rule.ts`, all as `z.strictObject(...)`. The request hits the API gateway before reaching the app, so 401 has a different shape than 400/404. Use it for both "no token" and "wrong-realm/wrong-issuer" tokens. **Exception:** the notification service returns the `APIErrorSchema` shape (`{ message }`) for 401 — see the verified comment in `notification-rule.ts`.

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

No local duplicates remain. `job.ts`, `tenant.ts`, `user.ts`, and `notification-rule.ts` import it from `../util/common`; `worker.ts` and `run-stats.ts` import via `./job` and `notification.ts` via `./notification-rule` (one extra hop — prefer importing from `../util/common` directly in new files).

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
| `url`      | `string`                                          | Yes      | Relative path from `appConfig.api.X`. Append ids/query strings as template literals or via a `URLSearchParams` builder (e.g. `buildListJobsUrl`).                     |
| `baseUrl`  | `string`                                          | Yes      | `appConfig.apiUrl` for app endpoints. Override only for non-app services (Keycloak, public gateway).                                                                   |
| `body`     | `Record<string, unknown>` \| `null`               | No       | Plain object for verbs that take a payload. Omit or pass `null` otherwise.                                                                                             |
| `headers`  | `string`                                          | No       | Token string → `Authorization: Bearer <token>`. Pass `'form-urlencoded'` for Keycloak token requests. **Omit entirely for unauthenticated requests** — never empty string. |

The fixture parses `application/json` automatically; non-JSON returns the raw value or `null`.

## Token catalog

Every variable is read through `config/env.ts` — tokens via the `tokens` accessors, everything else as `env.X` (or through `appConfig`). Never `process.env` at a call site (see `type-safety` § Environment variables).

| Env var — read via | Purpose | Typical 401 surface |
|---------|---------|---------------------|
| `USER_ACCESS_TOKEN_ADMIN` — `tokens.admin()` | Admin scope (admin/tenants, admin/realms, admin/users) | Tenant-scoped endpoints (returns 401, not 403) |
| `USER_ACCESS_TOKEN_FULL` — `tokens.full()` | Tenant-scoped full permissions (jobs, workers, users, run stats) | None — admin endpoints reject it with **403** (wrong scope, [http-method-coverage.md § 12.2](http-method-coverage.md#122-authentication-coverage-matrix)) |
| `USER_ACCESS_TOKEN_ZERO` — `tokens.zero()` | Valid token, no permissions | All scoped endpoints — returns 403 with `body === null`. **⚠ Provisioning caveat:** this env var is **not always provisioned** in the test environment; there's an open TODO to re-add it for RBAC/403 testing. Until it is re-added, write the 403 tests and comment them out with `// TODO: FIXME: <TICKET> USER_ACCESS_TOKEN_ZERO not provisioned` — never a conditional `test.skip`, and never silently drop the 403 row from the negative matrix. |
| `FRONT_MAIN_PASSWORD` — `env.FRONT_MAIN_PASSWORD` | Default password for KC users created in E2E onboarding | n/a |
| `MAILPIT_URL` — `env.MAILPIT_URL` | Mailpit base URL (default `http://localhost:8025`, set in the schema) | n/a |
| `MAILPIT_USERNAME`, `MAILPIT_PASSWORD` — `env.X` | Optional Basic auth for protected Mailpit deployments | n/a |
| `API_URL`, `APP_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `TENANT_ID` — via `appConfig` | Surface via `appConfig.apiUrl` / `baseUrl` / `keycloakUrl` / `keycloakRealm` / `tenantId` | n/a |
| `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` — `env.X` | Used by `helpers/util/keyCloak.ts` for direct KC admin operations (see `setupTestUser`) | n/a |
| `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD` — `env.X` | Default `admin`/`admin` (in the schema). Used by `getAuthenticatedKcAdminClient` | n/a |

Call `tokens.full()` / `tokens.admin()` / `tokens.zero()` at every call site — **no aliasing** (see `data-strategy` §1.6 for rationale: grepability, no alias-name drift; a module-level alias also runs before the setup project has written the token). The accessor throws "`USER_ACCESS_TOKEN_FULL` is not set — did the setup project run?" when the token is missing; static variables are checked earlier, by the schema parse in `config/env.ts` at load. No `!`, `??` or `as string` (see `type-safety` § Environment variables).

```typescript
headers: tokens.full(),
```

Existing specs with `const TENANT_TOKEN = ...` aliases are tech debt — normalize when next touching the file.

## URL/Config catalog

`config/app.ts` exports `appConfig`:

- `appConfig.apiUrl` (= `env.API_URL`) — base URL for all app API calls.
- `appConfig.baseUrl` (= `env.APP_URL`) — base URL for UI tests, **never** for API.
- `appConfig.tenantId` (= `env.TENANT_ID`) — default tenant for cross-tenant scoping tests.
- `appConfig.keycloakUrl` (= `env.KEYCLOAK_URL`) — for direct token requests.
- `appConfig.api.X` — API path constants. Use these, never `appConfig.paths.X` (that's UI routes).
- `appConfig.paths.X` — UI routes (e.g. `/jobs`, `/settings/workers`). **For UI specs only.**

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
| `JOBS` | `/jobs` | Tenant-scoped CRUD |
| `JOBS_RUN_STATS` | `/jobs/:id/run-stats` | Replace `:id` via `.replace(":id", id)` |
| `RUN_STATS` | `/run-stats` | Expression-style run-stat values query |
| `RUN_STATS_AGGREGATE` | `/run-stats/aggregate` | Aggregated run-stat values query |
| `WORKERS` | `/workers` | Tenant-scoped CRUD; `/workers/list` for batch |

## Helper catalog (already exists — reuse before writing new)

Helpers are tagged below with their style:
- **(passthrough)** — returns `{ status, body }`; caller asserts. Used for CRUD across positive and negative tests.
- **(assertion)** — asserts internally and returns the parsed payload (upstream's preferred style for assertion-style helpers).
- **(cleanup)** — tolerates 404 / uses `Promise.allSettled`; returns nothing meaningful.
- **(builder)** — pure data builder (no `apiRequest` call).

### Jobs — `helpers/app/jobs.ts`
- (builder) `buildCreateJobBody` (defaults to type `export`), `buildCreateHTTPJobBody`, `buildCreateStreamJobBody`, `buildCreateSFTPJobBody`, `buildCreateEmailJobBody`, `buildCreateBackupJobBody`, `buildCreateWebhookJobBody`, `buildUpdateJobBody`.
- (builder) `buildListJobsUrl({ page, pageSize, sort, direction, name, type, target, status, jobStatus, search })`.
- (passthrough) `listJobs`, `createJob`, `getJob`, `updateJob`, `deleteJob`.
- (cleanup) `cleanupWorkersAndJobs(apiRequest, workerIds, jobIds, headers)` — jobs first, workers second.
- (cleanup) `cleanupUiCreatedJobs(apiRequest, refs, token)` — resolves id-by-name with retry.
- (assertion) `setupWorkerAndJob(apiRequest, headers?) → { workerId, jobId }` — seeds a worker + an `export`-type job in one call, asserts both creates return 201, returns the typed ids. Use for precondition setup in specs exercising job-dependent resources (notification rules, notifications, run stats); clean up via `cleanupWorkersAndJobs`.
- (assertion, **planned**) `setupJob(apiRequest, workerIds, headers, overrides?) → Job` — seeds a job, parses with `JobSchema`, returns the typed entity. Use only for preconditions; passthroughs above stay for negative tests.
- Constants: `VALID_RUN_INTERVALS`, `DEFAULT_RUN_INTERVAL`, `DEFAULT_TIMEOUT`, `TIMEOUT_MIN/MAX`, `NAME_MIN/MAX_LENGTH`, `TARGET_MIN/MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH`.

### Workers — `helpers/app/workers.ts`
- (builder) `buildCreateWorkerBody`, `buildUpdateWorkerBody`, `buildListWorkersUrl`.
- (passthrough) `createWorker`, `listWorkers`, `getWorker`, `updateWorker`, `deleteWorker`.
- (passthrough) `getWorkersByIds(apiRequest, ids[], headers)` — POST `/workers/list`.
- (passthrough) `getWorkerConfig(apiRequest, workerId, type, headers)`, `getWorkerSchema(apiRequest, name, headers)`.
- (cleanup) `cleanupWorkers(apiRequest, workerIds, headers)`.
- (assertion, **planned**) `setupTestWorker(apiRequest, headers, overrides?) → Worker`.

### Admin Tenants — `helpers/app/adminTenants.ts`
- (passthrough) `createTenant(apiRequest, name, headers, parentId?)` — note: name + optional parentId are positional, not a body object.
- (passthrough) `getTenant`, `patchTenant(apiRequest, tenantId, body?, headers?)`, `deleteTenant`.
- (assertion, **planned**) `setupTenant(apiRequest, adminHeaders, overrides?) → Tenant` — seeds a tenant, parses with `TenantSchema`, returns the typed entity. Used by onboarding / cross-tenant specs.

### Admin Realms — `helpers/app/adminRealms.ts`
- (builder) `buildRealmSettings()` — valid default realm settings (login + email/smtp + tokens) for POST/PATCH bodies.
- (passthrough) `createRealm`, `patchRealm`, `getRealm`. POST always returns 409 on dev (`<realm>` realm exists).

### Admin Users — `helpers/app/adminUsers.ts`
- (builder) `generateUserPayload()` — random valid user body. **⚠ Bug:** this generator currently emits emails at `@automation.test`, which Mailpit on test infra does not catch. For any E2E flow that needs an email loop, build the payload locally with a `@<your-test-domain>` recipient (see `templates.md` § 6 `generateE2EUserPayload`) until the helper is fixed (a one-line swap to `@<your-test-domain>`).
- (passthrough) `createUser(apiRequest, tenantId, body, headers)` — **tenantId is positional (in the path)**, not part of the body.
- (passthrough) `listUsers(apiRequest, tenantId, headers, params?)`.
- (passthrough) `getUser(apiRequest, tenantId, userId, headers)`.
- (passthrough) `updateUser(apiRequest, tenantId, userId, body, headers)`.
- (passthrough) `deleteUser(apiRequest, tenantId, userId, headers)`.
- (assertion) `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken?) → { email, userId }`. Generates a `@<your-test-domain>` email, creates the user via the admin API, **sets the password directly via the Keycloak admin client** (bypasses the invite-link / email-reset flow), purges Mailpit for the recipient. **Does not return KC tokens** and does not capture the invite link. Use it when the test needs a known-credentialed user but does not need to exercise the invite-link UX.
- (assertion) `teardownTestUser(apiRequest, mailpit, tenantId, email, userId, adminToken?)` — purges Mailpit for the recipient, then DELETEs the user via the admin API.

### Users (tenant API) — `helpers/app/users.ts`
- (builder) `buildCreateUserBody(overrides?)`, `buildUpdateUserBody(overrides?)`, `buildListUsersUrl(params?)`. **⚠ Bug:** `buildCreateUserBody` emits emails at `@<alt-test-domain>` (note the leading hyphen — **not** the same as `@<your-test-domain>`; Mailpit does not catch it). For Mailpit-catching flows, override the email field with a literal `@<your-test-domain>` address until the helper is fixed.
- (passthrough) `listUsers`, `createUser(apiRequest, body, headers)`, `getUser(apiRequest, userId, headers)`, `updateUser(apiRequest, userId, body, headers)` — these target `/users` (tenant-scoped, **no tenantId in path**).
- (passthrough) `logoutUserSession(apiRequest, sessionId, headers)` — DELETE `/users/sessions/:id`.
- (passthrough) `deleteAdminTenantUser(apiRequest, tenantId, userId, headers)` — admin-scoped DELETE under `/admin/tenants/:tenantId/users/:userId`.
- (assertion, **planned**) `setupUser(apiRequest, headers, overrides?) → User` — tenant-scoped setup helper, parses with `UserSchema`. Distinct from `setupTestUser` (which is admin-scoped, KC-credentialed, in `adminUsers.ts`).
- The two `users.ts` and `adminUsers.ts` modules cover **different APIs**: tenant-scoped (no tenantId in URL) vs admin-scoped (tenantId in URL). Pick the helper that matches the route under test.

### Mailpit utilities — `helpers/util/mailpit.ts`
- `MailpitHelper` class (constructor takes an `APIRequestContext`; instance is what the `mailpit` fixture provides). Methods: `getLastEmail(recipient, retries?, interval?) → MailMessage | null`, `deleteEmailsForRecipient(email)`, `deleteAllEmails()`.
- `getInviteLinkFromEmail(mailpit, email): Promise<string>` — retries (10×2s), asserts non-null, returns the action-token link.
- `extractLinkFromEmail(emailBody): string | null` — single arg; matches the first URL containing `action-token`.
- `extractOtpFromEmail(emailBody): string | null` — six-digit OTP.
- `getNextTestEmail(baseEmail): string` — appends `+<random>` before `@` for unique-per-run inboxes.

### Run stats — `helpers/app/run-stats.ts`
- (passthrough) `getJobRunStats(apiRequest, jobId, headers)` — GET `/jobs/:id/run-stats`.
- (passthrough) `listRunStatCatalog(apiRequest, params?, headers)` — GET `/run-stats/catalog` paginated run-stat definition catalog (`types`, `name`, `normalizedName`, `page`, `pageSize`, `sort`, `direction`).
- (assertion) `pickNotificationRuleRunStatForType(apiRequest, jobType, headers?) → CatalogRunStat` — first notification-rule-eligible run stat for a job type; throws if none found.
- (passthrough) `getJobTypes(apiRequest, headers)` — GET `/jobs/types`.
- (passthrough) `queryRunStats(apiRequest, params, headers)` — **GET** `/run-stats` with `query`, `assignmentId`, optional `time` / `timeframe` / `last` as query params (URL built internally).
- (passthrough) `aggregateRunStats(apiRequest, body, headers)` — POST `/run-stats/aggregate` for aggregated run-stat values queries.

### Notifications — `helpers/app/notifications.ts`
- (passthrough) `listNotifications(apiRequest, params?, headers?)` — GET `/notifications` (page/pageSize/sort/direction, `severity`, `state`, `jobId`, `search`, `from`/`to`; note `notificationRuleId` is NOT a supported filter here).
- (passthrough) `getNotification(apiRequest, notificationId, headers?)` — GET `/notifications/:id` (notification ids are **numbers**, not UUIDs).
- (passthrough) `acknowledgeNotification`, `resolveNotification` — POST `/notifications/:id/acknowledge` / `/notifications/:id/resolve`.
- (passthrough) `bulkResolveNotifications(apiRequest, notificationIds, headers?)` — POST bulk-resolve.
- (passthrough) `getNotificationsStats(apiRequest, params?, headers?)` — GET `/notifications/stats` (supports `groupBy`, `notificationRuleId`); `getNotificationHistory(apiRequest, params?, headers?)` — GET `/notifications/history` (`timeframe` required).
- (cleanup) `cleanupNotificationsForJob(apiRequest, jobId, headers?)` — resolves every non-resolved notification for a job; best-effort.
- (assertion) `setupFiringNotificationsFixture(apiRequest, jobCount, headers?, opts?) → FiringNotificationsFixture` — provisions worker → jobs → notification rule → firing notifications; self-cleans on failure; long-running (90–360 s). Over-provisions by `FIRING_NOTIFICATIONS_DEFAULT_EXTRA_JOBS` (3) by default.
- (cleanup) `teardownFiringNotificationsFixture(apiRequest, fixture, headers?)` — drains notifications → deletes notification rule → deletes jobs; tolerates partial state.
- (assertion) `claimFiringNotifications(apiRequest, count, headers?, eligibleIndex?)` — claims N same-job firing notifications from the environment; `eligibleIndex` lets parallel spec files pick distinct jobs.
- Shared on-disk fixture cache: `warmSharedFiringNotificationsFixtureCache`, `loadSharedFiringNotificationsFixture`, `clearSharedFiringNotificationsFixtureCache` (+ `SHARED_FIRING_NOTIFICATIONS_JOB_COUNT = 4`) — used by the `notifications-setup` Playwright project.

### Notification rules — `helpers/app/notification-rules.ts`
- (builder) `buildTriggerCondition`, `buildCreateNotificationRuleBody`, `buildSeverityCascade`, `buildClearCondition`, `buildCreateCascadeNotificationRuleBody`, `buildUpdateNotificationRuleBody`, `buildJobBodyForType(type, workerIds)`.
- Constants: `DEFAULT_NOTIFICATION_RULE_OPERATOR/THRESHOLD/EVALUATION_WINDOW/CONSECUTIVE_COUNT/SEVERITY/DESCRIPTION`, `DEFAULT_CASCADE_NOTIFICATION_RULE_DESCRIPTION`, `ALL_JOB_TYPES`.
- (passthrough) `listNotificationRules`, `createNotificationRule`, `getNotificationRule`, `updateNotificationRule`, `deleteNotificationRule`.
- (cleanup) `cleanupNotificationRules(apiRequest, notificationRuleIds, headers?)` — `Promise.allSettled` over per-id deletes.
- (assertion) `setupNotificationRuleSpecFixture(apiRequest, headers?) → NotificationRuleSpecFixture` — seeds 1 worker + one job per job type (7 jobs) + a discovered run-stat `normalizedName` per type; throws on any seed failure.

### Notification-rule display labels — `helpers/app/notification-rule-display.ts`
- Pure UI-label mappers (no `apiRequest`): `NOTIFICATION_RULE_OPERATOR_DISPLAY_LABELS`, `NOTIFICATION_RULE_EVALUATION_WINDOW_LABELS`, `formatNormalizedRunStatLabel`, `getNotificationRuleOperatorDisplayLabel`, `getNotificationRuleEvaluationWindowDisplayLabel`, `formatNotificationRuleConditionForDetailsDisplay`. Mirrors the frontend's notification-rule-details-sheet labels — used by UI specs asserting display text.

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
| Free-form record | `z.record(z.unknown())` (e.g. `config` on jobs) | Use sparingly; prefer a typed `z.discriminatedUnion` per `type` once shapes stabilize |
| Pagination wrapper | reuse `PageInfoSchema` from `fixtures/api/schemas/util/common.ts` (the canonical definition; resource files import or re-export it) | Strict |
| New schema, prefer strict | `z.strictObject({ ... })` (rejects extras → catches API regressions) | Strict-by-default |
| Numeric enum (rare) | `z.union([z.literal(0), z.literal(1)])` or `z.nativeEnum(MyEnum)` | Strict |
| Contract-guaranteed error string | `message: z.literal("Conflict: resource already exists")` | **Only** when the exact message is part of the documented API contract. Otherwise assert status + envelope shape (see the WON'T in `SKILL.md`). Binds the schema to the wording — a backend copy-tweak breaks the test on purpose |
| Pattern-matched contract error string | `message: z.string().refine((v) => v.includes("worker"), "must mention worker")` | Same guard as above. Use when the contract fixes a substring/keyword but not the full sentence (interpolated ids, counts). Prefer over `z.literal` when the message contains variable parts |

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

| Setup pattern | `test.setTimeout` budget (`appConfig.timeouts`) |
|---------------|-------------------------------|
| 1 tenant + 0-1 users (no Keycloak admin ops) | `asyncFlow` |
| 1 tenant + 1-2 users + Keycloak admin workflow | `asyncFlowHeavy` |
| Cross-tenant isolation (2 tenants + users + full Keycloak admin cycle + worker + job + run stats) | `crossTenantSetup` |
| `setupNotificationRuleSpecFixture` (1 worker + 7 jobs + run-stat discovery) | `asyncFlowHeavy` |

## Mailpit recipe (E2E API + email loop)

```typescript
import { test, expect } from "../../../../fixtures/pom/test-options";
import { appConfig } from "../../../../config/app";
import { extractLinkFromEmail, getInviteLinkFromEmail } from "../../../../helpers/util/mailpit";

test(
    "Verify tenant onboarding sends invitation email",
    { tag: "@App-API" },
    async ({ apiRequest, mailpit }) => {
        test.setTimeout(appConfig.timeouts.asyncFlow);

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

Some reads are eventually consistent — e.g. run stats for a job appear only after its first scheduled run, minutes after creation. When (and **only** when) the OpenAPI/domain docs describe the endpoint as eventually consistent, poll with Playwright's built-in `expect.poll` (never `setTimeout`/`waitForTimeout`, never a raw `while` loop):

```typescript
await expect
    .poll(
        async () => {
            const { status, body } = await getJobRunStats(
                apiRequest,
                jobId,
                tokens.full(),
            );
            return status === 200 && body.runStats.length > 0;
        },
        { timeout: appConfig.timeouts.asyncFlow, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(true);
```

Guard rails:
- **Only for documented eventual consistency.** Polling to paper over a timing bug, a slow environment, or a flaky assertion is forbidden — fix the root cause instead. If you cannot cite the eventual-consistency contract, do not add a poll.
- Bounded: always pass an explicit `timeout` + poll `intervals`. No unbounded loops.
- Return a boolean/value from the poll callback and assert it; do not put `expect(...)` inside the callback.
- For email propagation, prefer the existing `MailpitHelper.getLastEmail(email, retries, interval)` (it already implements a bounded poll) over a hand-rolled `expect.poll`.

## Cross-tenant isolation pattern

The contract: cross-tenant access returns **404, not 403** — the server hides resource existence across tenants. There are two cross-tenant shapes in this codebase:

### A. Tenant-scoped resource (job, worker) — token-based isolation

The path has no tenantId; the token's tenant claim is the boundary.

```typescript
const { status, body } = await apiRequest<APIError>({
    method: "GET",
    url: `${appConfig.api.JOBS}/${jobIdInTenantB}`,
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
    tokens.admin(),
);

expect(status).toBe(404);
```

See `tests/app/api/shared/cross-tenant-isolation.spec.ts` (admin/users) and `tests/app/api/shared/cross-tenant-run-stats-isolation.spec.ts` (jobs/run stats) for the canonical patterns. Both 404, both treated as the app's primary cross-tenant contract.

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
- **Helpers:** `helpers/app/adminTenants.ts` (`createTenant`, `getTenant`, `patchTenant`, `deleteTenant`); `helpers/app/adminRealms.ts` (`buildRealmSettings`, `getRealm`, `createRealm`, `patchRealm`).
- **Auth:** Admin endpoints use `tokens.admin()`.
- **Validation status:** realm-settings validation is largely enforced now — `admin-realms.spec.ts` has active 400 tests for empty body, `settings: null`, `settings` as string, unknown keys, missing `settings` key, and per-field invalid string/boolean/integer/object values; POST with `settings: {}` returns 400. The one unverified edge: no explicit PATCH `settings: {}` test exists.

### Jobs (`export` / HTTP / SFTP / email / backup / stream / webhook)

- **Job API** (tenant-scoped): `POST/GET/PATCH/DELETE /api/v1/jobs(/:id)`. Create body: `{ name, target, type, runInterval?, timeout, workerIds }`. **Do NOT send empty `config: {}`** — backend rejects it. PATCH is partial; `type` is immutable.
- **Worker API** (tenant-scoped): `POST /api/v1/workers` body `{ name, location, region }`. `DELETE /api/v1/workers/:id`.
- **Worker ↔ Job dependency:** A worker must exist before creating a job. **Cleanup order: delete jobs FIRST, then workers** — a worker still assigned to a job returns 409 on delete. `cleanupWorkersAndJobs` in `helpers/app/jobs.ts` enforces this order.
- **Helpers:** `helpers/app/jobs.ts` (`buildCreateJobBody`, `createJob`, `getJob`, `updateJob`, `deleteJob`); `helpers/app/workers.ts` (`createWorker`, `deleteWorker`, `cleanupWorkers`); plus the combined `cleanupWorkersAndJobs`.
- **Schemas:** `JobSchema` (`assignments` field is nullable), `ListJobsResponseSchema`, `CreateJobResponseSchema`, etc.
- **Auth pattern:** `401` (no token), `401` (admin token on a tenant endpoint — unlike `/users` which returns `404` for the same case).
- **Sort-test guidance:** verify endpoint accepts `sort`/`direction` params and returns valid results — **do NOT assert exact order** because PostgreSQL collation differs from JS `Array.sort` and produces non-deterministic test results across environments.
- **Type coercion:** API coerces non-string `name` / `target` to strings. Confirmed desired behavior — don't write tests that expect `400` for `name: 123`.
- **400 vs 404 on PATCH:** an invalid body fails validation before the resource lookup (400); a valid body with a non-existent UUID returns 404. Both branches are covered by an active test in `export-job.spec.ts`.

### Tenant Onboarding E2E

- **Spec:** `tests/app/api/tenant-service/e2e-tenant-onboarding-flow.spec.ts` — 4 tests (create tenant + invite + verify email; UUID immutability; empty user list; multi-user emails).
- **Email domain:** **Must use `@<your-test-domain>`** for Mailpit delivery. Local helper `generateE2EUserPayload()` enforces this — do **NOT** use `generateUserPayload()` from `adminUsers.ts` (which uses `@automation.test` and the email never arrives).
- **Helpers:** `createTenant`, `getTenant`, `patchTenant`, `deleteTenant`, `createUser`, `listUsers`, `getUser`, `deleteUser`, `extractLinkFromEmail`, `MailpitHelper`.
- **Cleanup order:** Mailpit emails → Users → Tenant. Each step guarded by `if (tenantId)` so a partial failure still cleans whatever made it through.
- **Mailpit recipe:** `deleteEmailsForRecipient` before AND after, `getLastEmail(email, 10, 2000)` (10 polls, 2s interval), guard with `To.length > 0` before reading.

### Job Run Stats

- **Run-stats API** (tenant-scoped): `GET /api/v1/jobs/:id/run-stats`. Returns run-stat **definitions** (name, unit, dataType, jobType) available for a job based on its type. Includes run-step stats when run-step recording is enabled.
- **Response shape:** `{ runStats: [{ dataType, jobType, name, unit }] }`. Example `export` run-stat definition: `{ dataType: "gauge", jobType: "export", name: "export_duration_avg_ms", unit: "ms" }`.
- **Error responses:** `400` (invalid id format), `401` (no/wrong token), `404` (non-existent job), `500`.
- **Schemas:** `RunStatSchema` (`z.strictObject`), `GetJobRunStatsResponseSchema` (`z.strictObject`) — both in `fixtures/api/schemas/app/run-stats.ts`.
- **Helpers:** `getJobRunStats` in `helpers/app/run-stats.ts`.
- **Spec:** `tests/app/api/jobs-service/run-stats/job-run-stats.spec.ts` — covers per-type run-stat definitions (`export`, HTTP, SFTP, email, stream, backup, webhook), `export`/HTTP run-step-recording variants, PATCH `recordRunSteps` toggle, 400/401/404/405, error message content.
- **Auth pattern:** same as other job endpoints — `401` (no token), `401` (admin token on tenant endpoint).
- **Key behavior:** Run-stat definitions are **type-specific** (an `export` job returns `export` run-stat definitions, an HTTP job returns HTTP run-stat definitions). Run-step stats appear only when `config.recordRunSteps: true`.
- **Deeper context:** `run-stats-api-tests-context` (project repo only — trimmed from this toolkit) — full per-endpoint test plan, predefined query catalog, job-type run-stat inventory.

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
    if (!enabled) await updateResource(apiRequest, id, { enabled: true }, TOKEN);
  }
});

test.afterAll(async ({ apiRequest }) => {
  for (const [id, wasEnabled] of initialStates) {
    await updateResource(apiRequest, id, { enabled: wasEnabled }, TOKEN);
  }
});
```

Use this pattern whenever tests touch settings, toggles, feature flags, or any shared resource whose default value matters to other tests in the suite. The alternative — leaving the suite to mutate state freely — produces order-dependent failures that pass alone and fail in CI.

---

## Multi-Step & E2E API tests — operational notes

- Use `test.step()` for setup-then-verify flows.
- Multi-endpoint onboarding API flows use the `@App-API` tag (they are API tests in `tests/app/api/`), destructure `{ apiRequest, mailpit }`, set test-level budgets (`appConfig.timeouts.asyncFlow` for single-email flows, `asyncFlowHeavy` for multi-user email flows).
- Email tests **must** use the `@<your-test-domain>` domain (not `@automation.test`) for Mailpit delivery.
- Cleanup ordering for onboarding: Mailpit emails → Users → Tenant — each step guarded by `if (tenantId)` / `if (userId)` so partial failures still clean up.


## Common request recipes

| Need | Snippet |
|------|---------|
| Tenant-scoped GET | `headers: tokens.full()` |
| Admin GET | `headers: tokens.admin()` |
| Forbidden user (403) | `headers: tokens.zero()` — see caveat below |
| Anonymous (401) | omit `headers` entirely |
| Form-encoded body (Keycloak token) | `headers: 'form-urlencoded'`, `body: { grant_type, … }`, `baseUrl: appConfig.keycloakUrl` |
| Query string | Use a `buildList<X>Url(params)` helper (see `jobs.ts`, `workers.ts`) |
| Path with id | `` url: `${appConfig.api.JOBS}/${id}` `` |
| Sub-resource | `` url: appConfig.api.JOBS_RUN_STATS.replace(":id", id) `` (or build via template literal) |
| Mailpit mailbox | use the `mailpit` fixture (`{ apiRequest, mailpit }`); recipient must be `@<your-test-domain>` |
| Email-loop signup (e2e onboarding) | combine `mailpit`, `extractLinkFromEmail`, and the user-creation helpers |

> **`USER_ACCESS_TOKEN_ZERO` caveat.** The 403 token is part of the canonical matrix (per upstream convention), but it is **not always provisioned** in the current test environment — there's an open TODO to re-add it for RBAC/403 testing. When writing 403 tests and the env var is not provisioned, **comment out** the 403 test with `// TODO: FIXME: USER_ACCESS_TOKEN_ZERO not provisioned — re-enable when RBAC token is added` above it. Do not silently drop the 403 row from the matrix.
