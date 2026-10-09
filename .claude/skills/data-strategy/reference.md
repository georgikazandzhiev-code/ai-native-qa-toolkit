# Data Strategy — Reference Catalogs

Catalogs of every data source the framework already provides. Use these tables to find what exists before writing anything new. Cross-link from [SKILL.md](SKILL.md).

## 1. Env-var catalog

All env vars resolve from `env/.env.<ENVIRONMENT>` (or `env/.env.example` shape) loaded in `playwright.config.ts`.

### 1.1 URLs (one per area, never inline a URL)

| Var | Used by |
|-----|---------|
| `APP_URL` | UI baseURL (registration/login/dashboard flows); read in `tests/app/login.setup.ts` and `config/app.ts` (`appConfig.baseUrl`) |
| `API_URL` | API baseURL; backs `appConfig.apiUrl` in `config/app.ts` |
| `KEYCLOAK_URL` | KC user/admin clients; read in `helpers/util/keyCloak.ts` and `appConfig.keycloakUrl` |
| `MAILPIT_URL` | Email loop tests; read in `helpers/util/mailpit.ts` (default `http://localhost:8025`) and `fixtures/api/mailpit-fixture.ts` |

### 1.2 Bearer access tokens (read in helpers/specs, written ONLY in `login.setup.ts`)

| Var | Persona | Status |
|-----|---------|--------|
| `USER_ACCESS_TOKEN_FULL` | Tenant-scoped user with **all** permissions in the `<realm>` realm; default for any 200/201 path on tenant-scoped endpoints | Provisioned |
| `USER_ACCESS_TOKEN_ADMIN` | Platform admin in the **master** realm; required for `/admin/*` endpoints | Provisioned |
| `USER_ACCESS_TOKEN_ZERO` | Tenant-scoped user with **no** permissions; default for any 403 path | **Planned.** Until provisioned, write the 403 tests and comment them out with `// TODO: FIXME: <TICKET> USER_ACCESS_TOKEN_ZERO not provisioned` — never a conditional `test.skip` |

> Naming rule: `USER_ACCESS_TOKEN_<PERSONA>` is the canonical pattern. New tokens MUST follow this pattern.

### 1.3 User credentials (email / password / TOTP secret triplets)

Each persona has a 3-tuple. Use these only in `tests/app/login.setup.ts` to build storage states or KC clients; do not import them into specs to log in by hand.

| Persona | Email var | Password var | TOTP secret var |
|---------|-----------|--------------|-----------------|
| App main (UI storage state) | `APP_MAIN_EMAIL` | `APP_MAIN_PASSWORD` | `APP_MAIN_SECRET_KEY` |
| App full-permissions (API tenant token) | `APP_FULL_PERMISSIONS` | `APP_FULL_PERMISSIONS_PASSWORD` | `APP_FULL_PERMISSIONS_SECRET_KEY` |
| App zero-permissions (API 403 path) | `APP_ZERO_PERMISSIONS` | `APP_ZERO_PERMISSIONS_PASSWORD` | `APP_ZERO_PERMISSIONS_SECRET_KEY` |

Side credentials: `APP_RESET_EMAIL` / `APP_RESET_PASSWORD` (per-test reset-password flows), `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` (master-realm admin grant in `login.setup.ts`), `TENANT_ID` (the `<realm>`-realm tenant id used by per-test user provisioning).

### 1.4 Keycloak clients

| Var | Used by |
|-----|---------|
| `KEYCLOAK_REALM` | the Keycloak realm — `appConfig.keycloakRealm`, used in `helpers/util/keyCloak.ts` |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | Tenant user client (token exchange for the `<realm>` realm) |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET` | Master-realm admin client; used in `login.setup.ts` to mint `USER_ACCESS_TOKEN_ADMIN` |
| `KEYCLOAK_QA_CLIENT_ID` / `KEYCLOAK_QA_CLIENT_SECRET` | QA automation client (reserved for QA-only flows) |

### 1.5 Mailpit + reporting

| Var | Used by |
|-----|---------|
| `QASE_API_TOKEN` / `QASE_PROJECT_CODE` | `playwright-qase-reporter` |
| `QASE_REPORT` | gates whether the reporter is wired up |
| `ENVIRONMENT` | selects the `.env.<environment>` file to load |
| `CI` | toggles Playwright workers / retries in `playwright.config.ts` |

### 1.6 Aliasing rule (mandatory)

Specs and helpers MUST read `process.env.<NAME>` directly:

```typescript
headers: process.env.USER_ACCESS_TOKEN_FULL,
```

Forbidden:

```typescript
const TENANT_TOKEN = process.env.USER_ACCESS_TOKEN_FULL!; // hides the canonical name from grep
// ...
headers: TENANT_TOKEN,
```

Exception: when a spec passes the same token through multiple helper calls AND grepping is preserved by the helper signature (i.e. `headers: accessToken` parameter), the alias is acceptable inside that helper boundary. The spec entry point still uses the env var directly.

## 2. JSON file catalog

All test data JSON lives under `test-data/app/` and is split into four categories.

### 2.1 Validation matrices (Pattern 4)

Boundary lists for parametrized negative tests.

| File | Keys |
|------|------|
| `test-data/app/httpJobValidation.json` | `invalidNames`, `invalidTargets`, `validMethods`, `methodsWithBody`, `methodsWithoutBody` |
| `test-data/app/backupJobValidation.json` | backup-job boundary cases |
| `test-data/app/webhookJobValidation.json` | webhook-job boundary cases |

> Gap: no `email-job-validation.json` / `sftp-job-validation.json` / `stream-job-validation.json` / `export-job-validation.json` / `worker-validation.json` files yet. Add when a per-type negative matrix grows beyond inline use. The three files above use legacy camelCase names (drift); new files use hyphen-case.

### 2.2 Sentinel / lookup files (Pattern 5)

Fixed ids and reference values.

| File | Keys |
|------|------|
| `test-data/app/worker.json` | `invalidId`, `nonExistentId`, `sqlInjectionId`, `xssId`, `sortFields`, `statuses`, `maxPageSize`, `defaultPageSize`, `defaultSort`, `defaultDirection`, `deploymentTypes`, `schemaNames` |
| `test-data/app/workers.json` | `statusFilterOptions`, `typeFilterOptions`, `tableColumns`, `sortableColumns`, `statusCardTitles` (UI lookups) |
| `test-data/app/notifications.json` | `invalidNotificationIds`, `nonExistentNotificationId`, `severities`, `states`, `activeStates`, `validTimeframes`, `sortableFields`, `sortDirections` |
| `test-data/app/notification-rule.json` | `invalidId`, `nonExistentId`, `sqlInjectionId`, `xssId`, sort/paging defaults, `notificationRuleTypes`, `statuses`, `jobTypes`, `severities`, `operators`, `evaluationWindows`, plus `name` / `description` / `consecutiveCount` / `severityCascade` boundary sub-objects |
| `test-data/app/i18n.json` | Expected EN/DE UI strings per page area (`sidebar`, `dashboard`, `jobs`, `notifications`, `notificationRules`, `workers`, `runStats`, `profile`, `common`, `userMenu`, `theme`) for locale tests |
| `test-data/app/job-common.json` | `runIntervals`, `timeout` |
| `test-data/app/run-stats.json` | run-stats query / sentinels |
| `test-data/app/http-job.json` | HTTP job config + sentinels |
| `test-data/app/email-job.json` | email-job config + sentinels |
| `test-data/app/sftp-job.json` | SFTP job config + sentinels |
| `test-data/app/backup-job.json` | backup-job config + sentinels |
| `test-data/app/webhook-job.json` | webhook-job config + sentinels |
| `test-data/app/stream-job.json` | stream-job config + sentinels |

### 2.3 Mock fixtures (Pattern 5 — but treat as TECHNICAL DEBT when introduced)

Frozen pseudo-entities used as mocks in front-end-only paths. Avoid for any test that touches the live backend; prefer Pattern 6 (API seeder) + Pattern 7 (per-test user).

> No mock-JSON fixtures in this project today. The category is preserved for structure — see refactor playbook §4 for the future-state guidance.

**When the first mock-JSON file is introduced**, mark its import at the call site with a `// stub for route.fulfill` comment so it is unmistakably distinguishable from a Pattern-5 real-data import:

```typescript
import workerListStub from '../../test-data/app/mocks/worker-list.json'; // stub for route.fulfill
// ...
await page.route('**/api/v1/workers*', (route) => route.fulfill({ json: workerListStub }));
```

A real-data JSON import (sentinels, boundary matrices) is consumed by the test logic; a mock stub is only ever fed to `route.fulfill`. The annotation prevents a future reader from mistaking a front-end-only mock for a live-backend fixture (the exact drift Pattern 6 / 7 exist to avoid).

### 2.4 Loaders (Pattern 5 helper)

Some JSON files are consumed via a loader rather than a direct import to compute derived fields.

> No loader helpers in this project today. When a JSON file requires a transformation (date math, mapping, joining), wrap it in a loader and import the loader. Do not duplicate the transformation in each spec.

## 3. Factory / generator catalog (Pattern 2 + 3)

| File | Generator | Pattern |
|------|-----------|---------|
| `helpers/app/workers.ts` | `buildCreateWorkerBody(overrides?)` | 2 — **typed factory missing**; returns `Record<string, unknown>` (see playbook §3) |
| `helpers/app/workers.ts` | `buildUpdateWorkerBody(overrides?)` | 2 |
| `helpers/app/workers.ts` | `buildListWorkersUrl(params?)` | 2 (request shaping) |
| `helpers/app/jobs.ts` | `buildCreateJobBody(workerIds, overrides?)` (defaults to type `export`) | 2 — **typed factory missing** |
| `helpers/app/jobs.ts` | `buildCreateHTTPJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildCreateStreamJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildCreateSFTPJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildCreateEmailJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildCreateBackupJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildCreateWebhookJobBody(workerIds, overrides?)` | 2 — **centralize** |
| `helpers/app/jobs.ts` | `buildUpdateJobBody(overrides?)` | 2 |
| `helpers/app/jobs.ts` | `buildListJobsUrl(params?)` | 2 (request shaping) |
| `helpers/app/adminUsers.ts` | `generateUserPayload()` | 2 — **lacks `Partial<T>` overrides** |
| `helpers/app/users.ts` | `buildCreateUserBody(overrides?)` | 2 |
| `helpers/app/users.ts` | `buildUpdateUserBody(overrides?)` | 2 |
| `helpers/app/users.ts` | `buildListUsersUrl(params?)` | 2 (request shaping) |
| `helpers/app/adminRealms.ts` | `buildRealmSettings()` | 2 — **lacks `Partial<T>` overrides** |
| `helpers/app/run-stats.ts` | `buildRunStatsQueryUrl(params)` | 2 (request shaping) |
| `helpers/util/dataGenerator.ts` | `generateRandomAmount(min?, max?)` | 1/2 — **prefer faker; see playbook §6** |

When `rg buildCreate<Entity>Body|create<Entity>Data helpers/` returns a hit for your entity, consume it. If the existing factory does not accept overrides, add `overrides?: Partial<T>` rather than forking.

## 4. API seeder catalog (Pattern 6)

Always paired: `createX` + `deleteX` (or equivalent cleanup). Body comes from a Pattern-2 factory.

### Jobs

- `helpers/app/jobs.ts`:
  - **CRUD**: `createJob` / `getJob` / `updateJob` / `deleteJob` / `listJobs`
  - **Cleanup**: `cleanupUiCreatedJobs(apiRequest, refs, token)` — UI-friendly delete-by-name with retry; `cleanupWorkersAndJobs(apiRequest, workerIds, jobIds, headers)` — orchestrated cleanup respecting worker→job dependency

### Workers

- `helpers/app/workers.ts`:
  - **CRUD**: `createWorker` / `listWorkers` / `getWorker` / `updateWorker` / `deleteWorker`
  - **Read**: `getWorkersByIds(apiRequest, ids, headers)`, `getWorkerConfig(apiRequest, id, type, headers)`, `getWorkerSchema(apiRequest, name, headers)`
  - **Cleanup**: `cleanupWorkers(apiRequest, workerIds, headers)`

### Admin tenants

- `helpers/app/adminTenants.ts` — `createTenant` / `getTenant` / `patchTenant` / `deleteTenant`

### Admin users (per-tenant)

- `helpers/app/adminUsers.ts`:
  - **CRUD**: `createUser` / `listUsers` / `getUser` / `updateUser` / `deleteUser`
  - **Per-test user lifecycle (Pattern 7 backbone)**: `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken)` / `teardownTestUser(apiRequest, mailpit, tenantId, email, userId, adminToken)`
  - **Body builder**: `generateUserPayload()`

### Tenant-side users

- `helpers/app/users.ts` — `createUser` / `listUsers` / `getUser` / `updateUser` / `logoutUserSession` / `deleteAdminTenantUser` / `buildCreateUserBody` / `buildUpdateUserBody` / `buildListUsersUrl`

### Admin realms

- `helpers/app/adminRealms.ts` — `getRealm` / `createRealm` / `patchRealm` / `buildRealmSettings`

### Tenant schema

- `helpers/app/tenant-schema.ts` — `getTenantSchema(apiRequest, name?, token?)`

### Run stats

- `helpers/app/run-stats.ts` — `getJobRunStats` / `queryRunStats` / `aggregateRunStats` / `buildRunStatsQueryUrl`

### User lifecycle (Pattern 7 backbone — Keycloak side)

- `helpers/util/keyCloak.ts`:
  - **Authentication clients**: `getAuthenticatedKcAdminClient` (master realm), `getAuthenticatedKcUserClient({ username, password, otpSecret?, clientId?, clientSecret?, realm? })`
  - **Read**: `getUserIdByEmail`, `findUserByEmail`, `getUserById`, `getEmailVerifiedStatus`, `listUserCredentialsById`
  - **Write**: `resetUserPasswordById(userId, newPassword, kcAdminClient?)`
  - **Token**: `getClientToken(kcAdminClient?)`

> Note: this project does **not** export `createUserByEmail` / `deleteUserByEmail` / `updateUserById` directly from `keyCloak.ts`. User creation goes through the admin API (`POST /admin/tenants/{id}/users` via `setupTestUser`) which provisions a Keycloak-backed user under the hood; subsequent password reset and lookups go through the Keycloak admin client.

- `helpers/util/mailpit.ts`:
  - **Class**: `MailpitHelper.getLastEmail(email, retries?, interval?)`, `.deleteAllEmails()`, `.deleteEmailsForRecipient(email)`
  - **Module exports**: `extractLinkFromEmail(body)`, `extractOtpFromEmail(body)`, `getInviteLinkFromEmail(mailpit, email)`, `getNextTestEmail(baseEmail)` (synchronous; do NOT await)

### When to add a new seeder

Before adding `helpers/app/<entity>.ts`, run:

```bash
rg "create<Entity>\b|build<Entity>Body" helpers/
rg "<Entity>" helpers/app/
```

If a partial helper exists (only GET, only POST), extend it. Don't open a new file for a missing verb.

## 5. Storage state catalog

Storage states live under `.auth/app/<persona>Session.json` and are produced by `tests/app/login.setup.ts` running once per environment.

| Storage state | Persona | Produced in |
|---------------|---------|-------------|
| `.auth/app/appMainUserSession.json` | App main | `tests/app/login.setup.ts` |

Storage state factory:

- `helpers/app/createStorageState.ts` — `createAppStorageState({ email, password, totpSecret, storageStatePath })` opens the app, completes Keycloak login (with optional TOTP), waits for the app sidebar, and saves the browser storage state to the supplied path.

`tests/app/login.setup.ts` ALSO populates `process.env.USER_ACCESS_TOKEN_*` for personas that need bearer tokens for API specs. UI projects in `playwright.config.ts` reference the JSON file via `use.storageState`; API specs read the env var.

Rule: never mutate a stored session at runtime (e.g., changing the user's password). If the test needs to mutate user state, switch to Pattern 7 (per-test user).

## 6. Faker recipes

Always import as `import { faker } from '@faker-js/faker'`.

### 6.1 Identifiers and uniqueness

| Need | Recipe |
|------|--------|
| Random uuid (most ids) | `faker.string.uuid()` |
| Short alphanumeric token | `faker.string.alphanumeric(8)` |
| Numeric-only token | `faker.string.numeric(3)` |
| Time-based suffix | `Date.now()` (not parallel-unique on its own; combine with faker) |

### 6.2 Strings

| Need | Recipe |
|------|--------|
| Word | `faker.word.adjective()`, `faker.word.noun()` |
| Phrase / name | `` `${faker.word.adjective()} ${faker.word.noun()}` `` |
| Description | `faker.lorem.sentence()` |
| URL | `faker.internet.url()` |
| Domain | `faker.internet.domainName()` |

### 6.3 Numbers and money

| Need | Recipe |
|------|--------|
| Integer in range | `faker.number.int({ min, max })` |
| Float, 4 dp (volume) | `faker.number.float({ min, max, multipleOf: 0.0001 })` |
| Float, 2 dp (money) | `faker.number.float({ min, max, multipleOf: 0.01 })` — **prefer this over `generateRandomAmount`** |
| Boolean | `faker.datatype.boolean()` |

### 6.4 Picks

| Need | Recipe |
|------|--------|
| One of several literals | `faker.helpers.arrayElement([60, 300, 600] as const)` |
| Subset of a list | `faker.helpers.arrayElements(items, { min: 1, max: 3 })` |

### 6.5 Reproducibility

The framework does NOT globally seed faker. To pin a flaky test for diagnosis:

```typescript
test('flaky path', async ({}, testInfo) => {
    const seed = testInfo.testId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    faker.seed(seed);
    // ...
});
```

Do not seed in factories — that would make every test using the factory produce the same data.

### 6.6 Per-test email recipe

```typescript
import { getNextTestEmail } from '../../helpers/util/mailpit';
const userEmail = getNextTestEmail(process.env.APP_MAIN_EMAIL!);
// → "qa-test-main+aBc12345@<your-test-domain>"
```

This combines a base email with `faker.string.alphanumeric(8)` and produces a plus-addressed email that all routes to the same Mailpit inbox. Use exclusively for Pattern 7. Synchronous; do not `await`.

## 7. Seeded preconditions for read tests

For GET endpoints that need an existing entity, the convention is:

```typescript
let seededId: string;

test.beforeAll(async ({ apiRequest }) => {
    const { body } = await apiRequest<ListJobsResponse>({
        method: 'GET',
        url: appConfig.api.JOBS,
        baseUrl: appConfig.apiUrl,
        headers: process.env.USER_ACCESS_TOKEN_FULL,
    });
    seededId = ListJobsResponseSchema.parse(body).jobs[0].id;
});
```

Rules:
- Use the existing GET helper if there is one.
- Don't pollute the system in `beforeAll` for read-only tests.
- If the resource may be empty in fresh environments, seed via Pattern 6 in `beforeAll` and clean up in `afterAll`.

## 8. Cross-references

- [SKILL.md](SKILL.md) — the playbook for choosing a pattern.
- [patterns.md](patterns.md) — good/bad examples for every pattern.
- [refactor-playbook.md](refactor-playbook.md) — known duplications and the migration steps.
- [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md) — once the data is built, this skill covers Zod assertions and negative test matrices.
