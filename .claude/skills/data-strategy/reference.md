# Data Strategy — Reference Catalogs

Catalogs of every data source the framework already provides. Use these tables to find what exists before writing anything new. Cross-link from [SKILL.md](SKILL.md).

## 1. Env-var catalog

All env vars resolve from `env/.env.<ENVIRONMENT>` (or [env/.env.example](../../../env/.env.example) shape) loaded in [playwright.config.ts](../../../playwright.config.ts).

### 1.1 URLs (one per area, never inline a URL)

| Var | Used by |
|-----|---------|
| `APP_URL` | UI baseURL (registration/login/dashboard flows); read in [tests/app/login.setup.ts](../../../tests/app/login.setup.ts) and [config/app.ts](../../../config/app.ts) (`appConfig.baseUrl`) |
| `API_URL` | API baseURL; backs `appConfig.apiUrl` in [config/app.ts](../../../config/app.ts) |
| `KEYCLOAK_URL` | KC user/admin clients; read in [helpers/util/keyCloak.ts](../../../helpers/util/keyCloak.ts) and `appConfig.keycloakUrl` |
| `MAILPIT_URL` | Email loop tests; read in [helpers/util/mailpit.ts](../../../helpers/util/mailpit.ts) (default `http://localhost:8025`) and [fixtures/api/mailpit-fixture.ts](../../../fixtures/api/mailpit-fixture.ts) |

### 1.2 Bearer access tokens (read in helpers/specs, written ONLY in `login.setup.ts`)

| Var | Persona | Status |
|-----|---------|--------|
| `USER_ACCESS_TOKEN_FULL` | Tenant-scoped user with **all** permissions in the `<realm>` realm; default for any 200/201 path on tenant-scoped endpoints | Provisioned |
| `USER_ACCESS_TOKEN_ADMIN` | Platform admin in the **master** realm; required for `/admin/*` endpoints | Provisioned |
| `USER_ACCESS_TOKEN_ZERO` | Tenant-scoped user with **no** permissions; default for any 403 path | **Planned** per [`docs/framework-alignment-plan.md` § 6.2](../../../docs/framework-alignment-plan.md). Until provisioned, guard with `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "ZERO token not provisioned")` |

> Naming rule: `USER_ACCESS_TOKEN_<PERSONA>` is the canonical pattern. New tokens MUST follow this pattern.

### 1.3 User credentials (email / password / TOTP secret triplets)

Each persona has a 3-tuple. Use these only in [tests/app/login.setup.ts](../../../tests/app/login.setup.ts) to build storage states or KC clients; do not import them into specs to log in by hand.

| Persona | Email var | Password var | TOTP secret var |
|---------|-----------|--------------|-----------------|
| App main (UI storage state) | `APP_MAIN_EMAIL` | `APP_MAIN_PASSWORD` | `APP_MAIN_SECRET_KEY` |
| App full-permissions (API tenant token) | `APP_FULL_PERMISSIONS` | `APP_FULL_PERMISSIONS_PASSWORD` | `APP_FULL_PERMISSIONS_SECRET_KEY` |
| App zero-permissions (API 403 path) | `APP_ZERO_PERMISSIONS` | `APP_ZERO_PERMISSIONS_PASSWORD` | `APP_ZERO_PERMISSIONS_SECRET_KEY` |

Side credentials: `APP_RESET_EMAIL` / `APP_RESET_PASSWORD` (per-test reset-password flows), `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` (master-realm admin grant in `login.setup.ts`), `TENANT_ID` (the `<realm>`-realm tenant id used by per-test user provisioning).

### 1.4 Keycloak clients

| Var | Used by |
|-----|---------|
| `KEYCLOAK_REALM` | the Keycloak realm — `appConfig.keycloakRealm`, used in [helpers/util/keyCloak.ts](../../../helpers/util/keyCloak.ts) |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | Tenant user client (token exchange for the `<realm>` realm) |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_CLIENT_SECRET` | Master-realm admin client; used in `login.setup.ts` to mint `USER_ACCESS_TOKEN_ADMIN` |
| `KEYCLOAK_QA_CLIENT_ID` / `KEYCLOAK_QA_CLIENT_SECRET` | QA automation client (reserved for QA-only flows) |

### 1.5 Mailpit + reporting

| Var | Used by |
|-----|---------|
| `QASE_API_TOKEN` / `QASE_PROJECT_CODE` | `playwright-qase-reporter` |
| `QASE_REPORT` | gates whether the reporter is wired up |
| `ENVIRONMENT` | selects the `.env.<environment>` file to load |
| `CI` | toggles workers / retries in `playwright.config.ts` |

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

All test data JSON lives under [test-data/app/](../../../test-data/app/) and is split into four categories.

### 2.1 Validation matrices (Pattern 4)

Boundary lists for parametrized negative tests.

| File | Keys |
|------|------|
| [test-data/app/httpSyntheticValidation.json](../../../test-data/app/httpSyntheticValidation.json) | `invalidNames`, `invalidTargets`, `validMethods`, `methodsWithBody`, `methodsWithoutBody` |
| [test-data/app/sslSyntheticValidation.json](../../../test-data/app/sslSyntheticValidation.json) | SSL boundary cases |
| [test-data/app/mcpSyntheticValidation.json](../../../test-data/app/mcpSyntheticValidation.json) | MCP boundary cases |

> Gap: no `dnsSyntheticValidation.json` / `tcpSyntheticValidation.json` / `websocketSyntheticValidation.json` / `icmpSyntheticValidation.json` / `probeValidation.json` files yet. Add when a per-type negative matrix grows beyond inline use.

### 2.2 Sentinel / lookup files (Pattern 5)

Fixed ids and reference values.

| File | Keys |
|------|------|
| [test-data/app/probe.json](../../../test-data/app/probe.json) | `invalidId`, `nonExistentId`, `sqlInjectionId`, `xssId`, `sortFields`, `statuses`, `maxPageSize`, `defaultPageSize`, `defaultSort`, `defaultDirection`, `deploymentTypes`, `schemaNames` |
| [test-data/app/probes.json](../../../test-data/app/probes.json) | `statusFilterOptions`, `typeFilterOptions`, `tableColumns`, `sortableColumns`, `statusCardTitles` (UI lookups) |
| [test-data/app/alerts.json](../../../test-data/app/alerts.json) | `invalidAlertIds`, `nonExistentAlertId`, `severities`, `states`, `activeStates`, `validTimeframes`, `sortableFields`, `sortDirections` |
| [test-data/app/policy.json](../../../test-data/app/policy.json) | `invalidId`, `nonExistentId`, `sqlInjectionId`, `xssId`, sort/paging defaults, `policyTypes`, `statuses`, `monitorTypes`, `severities`, `operators`, `evaluationWindows`, plus `name` / `description` / `consecutiveCount` / `severityCascade` boundary sub-objects |
| [test-data/app/i18n.json](../../../test-data/app/i18n.json) | Expected EN/DE UI strings per page area (`sidebar`, `dashboard`, `synthetics`, `alerts`, `policies`, `probes`, `metrics`, `profile`, `common`, `userMenu`, `theme`) for locale tests |
| [test-data/app/synthetic-common.json](../../../test-data/app/synthetic-common.json) | `checkIntervals`, `timeout` |
| [test-data/app/metrics.json](../../../test-data/app/metrics.json) | metric query / sentinels |
| [test-data/app/http-synthetic.json](../../../test-data/app/http-synthetic.json) | HTTP monitor config + sentinels |
| [test-data/app/dns-synthetic.json](../../../test-data/app/dns-synthetic.json) | DNS monitor config + sentinels |
| [test-data/app/tcp-synthetic.json](../../../test-data/app/tcp-synthetic.json) | TCP monitor config + sentinels |
| [test-data/app/ssl-synthetic.json](../../../test-data/app/ssl-synthetic.json) | SSL monitor config + sentinels |
| [test-data/app/mcp-synthetic.json](../../../test-data/app/mcp-synthetic.json) | MCP monitor config + sentinels |
| [test-data/app/websocket-synthetic.json](../../../test-data/app/websocket-synthetic.json) | WebSocket monitor config + sentinels |

### 2.3 Mock fixtures (Pattern 5 — but treat as TECHNICAL DEBT when introduced)

Frozen pseudo-entities used as mocks in front-end-only paths. Avoid for any test that touches the live backend; prefer Pattern 6 (API seeder) + Pattern 7 (per-test user).

> No mock-JSON fixtures in this project today. The category is preserved for structure — see refactor playbook §4 for the future-state guidance.

**When the first mock-JSON file is introduced**, mark its import at the call site with a `// stub for route.fulfill` comment so it is unmistakably distinguishable from a Pattern-5 real-data import:

```typescript
import probeListStub from '../../test-data/app/mocks/probe-list.json'; // stub for route.fulfill
// ...
await page.route('**/api/v1/probes*', (route) => route.fulfill({ json: probeListStub }));
```

A real-data JSON import (sentinels, boundary matrices) is consumed by the test logic; a mock stub is only ever fed to `route.fulfill`. The annotation prevents a future reader from mistaking a front-end-only mock for a live-backend fixture (the exact drift Pattern 6 / 7 exist to avoid).

### 2.4 Loaders (Pattern 5 helper)

Some JSON files are consumed via a loader rather than a direct import to compute derived fields.

> No loader helpers in this project today. When a JSON file requires a transformation (date math, mapping, joining), wrap it in a loader and import the loader. Do not duplicate the transformation in each spec.

## 3. Factory / generator catalog (Pattern 2 + 3)

| File | Generator | Pattern |
|------|-----------|---------|
| [helpers/app/probes.ts](../../../helpers/app/probes.ts) | `buildCreateProbeBody(overrides?)` | 2 — **typed factory missing**; returns `Record<string, unknown>` (see playbook §3) |
| [helpers/app/probes.ts](../../../helpers/app/probes.ts) | `buildUpdateProbeBody(overrides?)` | 2 |
| [helpers/app/probes.ts](../../../helpers/app/probes.ts) | `buildListProbesUrl(params?)` | 2 (request shaping) |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateSyntheticBody(probeIds, overrides?)` (ICMP — base) | 2 — **typed factory missing** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateHTTPSyntheticBody(probeIds, overrides?)` | 2 — **centralize per [plan § 6.4](../../../docs/framework-alignment-plan.md)** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateWebSocketSyntheticBody(probeIds, overrides?)` | 2 — **centralize per plan § 6.4** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateTCPSyntheticBody(probeIds, overrides?)` | 2 — **centralize per plan § 6.4** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateDNSSyntheticBody(probeIds, overrides?)` | 2 — **centralize per plan § 6.4** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateSSLSyntheticBody(probeIds, overrides?)` | 2 — **centralize per plan § 6.4** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildCreateMCPSyntheticBody(probeIds, overrides?)` | 2 — **centralize per plan § 6.4** |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildUpdateSyntheticBody(overrides?)` | 2 |
| [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts) | `buildListSyntheticsUrl(params?)` | 2 (request shaping) |
| [helpers/app/adminUsers.ts](../../../helpers/app/adminUsers.ts) | `generateUserPayload()` | 2 — **lacks `Partial<T>` overrides** |
| [helpers/app/users.ts](../../../helpers/app/users.ts) | `buildCreateUserBody(overrides?)` | 2 |
| [helpers/app/users.ts](../../../helpers/app/users.ts) | `buildUpdateUserBody(overrides?)` | 2 |
| [helpers/app/users.ts](../../../helpers/app/users.ts) | `buildListUsersUrl(params?)` | 2 (request shaping) |
| [helpers/app/adminRealms.ts](../../../helpers/app/adminRealms.ts) | `buildRealmSettings()` | 2 — **lacks `Partial<T>` overrides** |
| [helpers/app/data.ts](../../../helpers/app/data.ts) | `buildDataQueryUrl(params)` | 2 (request shaping) |
| [helpers/util/dataGenerator.ts](../../../helpers/util/dataGenerator.ts) | `generateRandomAmount(min?, max?)` | 1/2 — **prefer faker; see playbook §6** |

When `rg buildCreate<Entity>Body|create<Entity>Data helpers/` returns a hit for your entity, consume it. If the existing factory does not accept overrides, add `overrides?: Partial<T>` rather than forking.

## 4. API seeder catalog (Pattern 6)

Always paired: `createX` + `deleteX` (or equivalent cleanup). Body comes from a Pattern-2 factory.

### Synthetics

- [helpers/app/synthetics.ts](../../../helpers/app/synthetics.ts):
  - **CRUD**: `createSyntheticMonitor` / `getSyntheticMonitor` / `updateSyntheticMonitor` / `deleteSyntheticMonitor` / `listSynthetics`
  - **Cleanup**: `cleanupUiCreatedSyntheticMonitors(apiRequest, token, refs)` — UI-friendly delete-by-name with retry; `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, headers)` — orchestrated cleanup respecting probe→synthetic dependency

### Probes

- [helpers/app/probes.ts](../../../helpers/app/probes.ts):
  - **CRUD**: `createProbe` / `listProbes` / `getProbe` / `updateProbe` / `deleteProbe`
  - **Read**: `getProbesByIds(apiRequest, ids, headers)`, `getProbeConfig(apiRequest, id, type, headers)`, `getProbeSchema(apiRequest, name, headers)`
  - **Cleanup**: `cleanupProbes(apiRequest, probeIds, headers)`

### Admin tenants

- [helpers/app/adminTenants.ts](../../../helpers/app/adminTenants.ts) — `createTenant` / `getTenant` / `patchTenant` / `deleteTenant`

### Admin users (per-tenant)

- [helpers/app/adminUsers.ts](../../../helpers/app/adminUsers.ts):
  - **CRUD**: `createUser` / `listUsers` / `getUser` / `updateUser` / `deleteUser`
  - **Per-test user lifecycle (Pattern 7 backbone)**: `setupTestUser(apiRequest, mailpit, tenantId, password, lastName, adminToken)` / `teardownTestUser(apiRequest, mailpit, tenantId, email, userId, adminToken)`
  - **Body builder**: `generateUserPayload()`

### Tenant-side users

- [helpers/app/users.ts](../../../helpers/app/users.ts) — `createUser` / `listUsers` / `getUser` / `updateUser` / `logoutUserSession` / `deleteAdminTenantUser` / `buildCreateUserBody` / `buildUpdateUserBody` / `buildListUsersUrl`

### Admin realms

- [helpers/app/adminRealms.ts](../../../helpers/app/adminRealms.ts) — `getRealm` / `createRealm` / `patchRealm` / `buildRealmSettings`

### Tenant schema

- [helpers/app/tenant-schema.ts](../../../helpers/app/tenant-schema.ts) — `getTenantSchema(apiRequest, name?, token?)`

### Data / metrics

- [helpers/app/data.ts](../../../helpers/app/data.ts) — `getSyntheticMetrics` / `queryData` / `queryMetrics` / `buildDataQueryUrl`

### User lifecycle (Pattern 7 backbone — Keycloak side)

- [helpers/util/keyCloak.ts](../../../helpers/util/keyCloak.ts):
  - **Authentication clients**: `getAuthenticatedKcAdminClient` (master realm), `getAuthenticatedKcUserClient({ username, password, otpSecret?, clientId?, clientSecret?, realm? })`
  - **Read**: `getUserIdByEmail`, `findUserByEmail`, `getUserById`, `getEmailVerifiedStatus`, `listUserCredentialsById`
  - **Write**: `resetUserPasswordById(userId, newPassword, kcAdminClient?)`
  - **Token**: `getClientToken(kcAdminClient?)`

> Note: this project does **not** export `createUserByEmail` / `deleteUserByEmail` / `updateUserById` directly from `keyCloak.ts`. User creation goes through the admin API (`POST /admin/tenants/{id}/users` via `setupTestUser`) which provisions a Keycloak-backed user under the hood; subsequent password reset and lookups go through the Keycloak admin client.

- [helpers/util/mailpit.ts](../../../helpers/util/mailpit.ts):
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

Storage states live under `.auth/app/<persona>Session.json` and are produced by [tests/app/login.setup.ts](../../../tests/app/login.setup.ts) running once per environment.

| Storage state | Persona | Produced in |
|---------------|---------|-------------|
| [.auth/app/appMainUserSession.json](../../../.auth/app/appMainUserSession.json) | App main | [tests/app/login.setup.ts](../../../tests/app/login.setup.ts) |

Storage state factory:

- [helpers/app/createStorageState.ts](../../../helpers/app/createStorageState.ts) — `createAppStorageState({ email, password, totpSecret, storageStatePath })` opens the app, completes Keycloak login (with optional TOTP), waits for the app sidebar, and saves the browser storage state to the supplied path.

[tests/app/login.setup.ts](../../../tests/app/login.setup.ts) ALSO populates `process.env.USER_ACCESS_TOKEN_*` for personas that need bearer tokens for API specs. UI projects in `playwright.config.ts` reference the JSON file via `use.storageState`; API specs read the env var.

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
    const { body } = await apiRequest<ListSyntheticsResponse>({
        method: 'GET',
        url: appConfig.api.SYNTHETICS,
        baseUrl: appConfig.apiUrl,
        headers: process.env.USER_ACCESS_TOKEN_FULL,
    });
    seededId = ListSyntheticsResponseSchema.parse(body).synthetics[0].id;
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
