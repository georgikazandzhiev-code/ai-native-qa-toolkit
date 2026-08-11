---
name: helpers
description: Helper authoring under helpers/app/ (CRUD wrappers, body builders, cleanup helpers) and helpers/util/ — signature shape (apiRequest first, headers? last), passthrough vs assertion styles, cleanup ordering, kebab-case naming. Use when adding or editing any helper. Triggers — "helper", "CRUD wrapper", "body builder", "cleanup". Not for the fixture-vs-helper decision (api-testing § Three callable shapes) or fixture authoring (fixtures).
---

# Helpers

This skill governs **how** to author a helper in this codebase: location, naming, signature, exports, cleanup, body-builder, URL-builder, and body-style conventions. The decision of **whether** a piece of code should be a helper at all (vs a direct `apiRequest` call vs a Playwright fixture) lives in the `api-testing` skill — read that first when triaging.

## Critical

- **ALWAYS** put resource-scoped helpers in `helpers/app/<resource>.ts` and cross-resource utilities in `helpers/util/<name>.ts`. Nothing else under `helpers/`.
- **ALWAYS** make the first parameter `apiRequest: ApiRequestFn` (typed from `fixtures/api/api-types`) and the last optional parameter `headers?: string` (the bearer token). Never read tokens from `process.env` inside a helper — the caller controls auth.
- **NEVER** declare a Zod schema inside a helper. Schemas live only under `fixtures/api/schemas/app/` (and `fixtures/api/schemas/util/` for shared shapes). Helpers import the inferred response types from those files.
- **The decision of WHEN to write a helper vs call `apiRequest({...})` directly vs build a fixture lives in the `api-testing` skill (§ Helpers — three callable shapes). This skill governs how to author the helper, not when.** Do not reproduce that decision tree here.
- **ALWAYS** make cleanup helpers tolerate 404 via `Promise.allSettled` over the per-id deletes. A cleanup helper that throws on a missing resource breaks the next test's setup.
- **Synthetics-with-probes specs MUST cleanup synthetics before probes (409 conflict otherwise).** Use `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, headers)` in `helpers/app/synthetics.ts` — it enforces the order. Never invent a parallel deleter.
- **New helper files use kebab-case naming** per the orchestrator's File Naming Conventions (`helpers/app/admin-tenants.ts`, `helpers/util/date-time-format.ts`). Existing camelCase files (`adminTenants.ts`, `adminRealms.ts`, `adminUsers.ts`, `createStorageState.ts`, `keyCloak.ts`, `dateTimeFormat.ts`, `balanceFormat.ts`, `dataGenerator.ts`) are legacy drift — rename when next touched, never propagate.
- **Authoring a setup helper** (assertion-style — parses internally, returns typed entity) follows the contract in `api-testing` § Two helper styles. The current canonical example is `setupTestUser` / `teardownTestUser` in `helpers/app/adminUsers.ts`.
- **`process.stderr.write` for error-path diagnostics.** The framework bans `console.*` in committed code. `process.stderr.write` in cleanup/teardown helpers is an accepted exception for surfacing resource-leak warnings in CI logs (e.g., a teardown that tolerates failure but shouldn't be silent). Keep to error/cleanup paths only — never for happy-path logging or debug output.

## File locations and inventory

The **canonical** layout (per orchestrator File Naming Conventions, kebab-case for new files):

| Directory | Purpose |
|-----------|---------|
| `helpers/app/<resource>.ts` | Resource-scoped API helpers (CRUD wrappers, body builders, URL builders, cleanup) |
| `helpers/util/<name>.ts` | Cross-resource utilities (auth bootstrap, Mailpit, Keycloak, formatters, generators) |

### Resource helpers — `helpers/app/`

| File | Style | Purpose |
|------|-------|---------|
| `synthetics.ts` | **Mixed** — passthrough CRUD + body builders + URL builder + cleanup + assertion-style setup | `createSyntheticMonitor`, `getSyntheticMonitor`, `listSynthetics`, `updateSyntheticMonitor`, `deleteSyntheticMonitor`, `getSyntheticMetrics`; `buildCreateSyntheticBody` / per-type variants for HTTP/WebSocket/TCP/DNS/SSL/MCP; `buildListSyntheticsUrl`; `cleanupUiCreatedSyntheticMonitors`, `cleanupProbesAndSynthetics`. Assertion-style: `setupProbeAndSynthetic(apiRequest, headers?) → { probeId, syntheticId }` — seeds a probe + ICMP synthetic, asserts both 201s. Re-exports `deleteProbe` for the cleanup helper. |
| `probes.ts` | Passthrough CRUD + body builders + URL builder + cleanup | `createProbe`, `getProbe`, `listProbes`, `updateProbe`, `deleteProbe`, `getProbesByIds`, `getProbeConfig`, `getProbeSchema`; `buildCreateProbeBody`, `buildUpdateProbeBody`; `buildListProbesUrl`; `cleanupProbes`. |
| `adminTenants.ts` | Passthrough (minimal) | `createTenant`, `getTenant`, `patchTenant`, `deleteTenant`. **camelCase legacy — canonical: `admin-tenants.ts`.** |
| `adminUsers.ts` | **Mixed** — passthrough CRUD AND assertion-style setup/teardown | Passthrough: `createUser`, `getUser`, `listUsers`, `updateUser`, `deleteUser`. Assertion-style: `setupTestUser` / `teardownTestUser` (Mailpit-purges + Keycloak-resets-password + admin-API-creates the user). **camelCase legacy — canonical: `admin-users.ts`.** |
| `adminRealms.ts` | Passthrough CRUD + body builder | `getRealm`, `createRealm`, `patchRealm`; `buildRealmSettings` (valid default login/email/tokens settings). **camelCase legacy — canonical: `admin-realms.ts`.** |
| `users.ts` | Passthrough CRUD + body builder + URL builder | `createUser`, `getUser`, `listUsers`, `updateUser`, `logoutUserSession`, `deleteAdminTenantUser`; `buildCreateUserBody`, `buildUpdateUserBody`; `buildListUsersUrl`. **NOTE — drift:** `buildCreateUserBody` emits `@<alt-test-domain>` recipients which Mailpit on the test infra silently drops; per `api-testing` (§ Mailpit) and the alignment plan § 4.1 the only valid Mailpit-catchable domain is `@<your-test-domain>`. |
| `data.ts` | Passthrough + assertion-style picker | `getSyntheticMetrics`, `listMetrics`, `getSyntheticTypes`, `queryData`, `queryMetrics` (URL builders are internal); assertion-style `pickPolicyMetricForType`. |
| `alerts.ts` | **Mixed** — passthrough CRUD + cleanup + assertion-style fixtures | `listAlerts`, `getAlert`, `acknowledgeAlert`, `resolveAlert`, `bulkResolveAlerts`, `getAlertsStats`, `getAlertHistory`; `cleanupAlertsForMonitor`. Assertion-style fixture lifecycle: `setupFiringAlertsFixture` / `teardownFiringAlertsFixture`, `claimFiringAlerts`, and the shared on-disk cache trio `warmSharedFiringAlertsFixtureCache` / `loadSharedFiringAlertsFixture` / `clearSharedFiringAlertsFixtureCache`. |
| `policies.ts` | **Mixed** — passthrough CRUD + body builders + cleanup + assertion-style fixture | `listPolicies`, `createPolicy`, `getPolicy`, `updatePolicy`, `deletePolicy`; `buildTriggerCondition`, `buildCreatePolicyBody`, `buildSeverityCascade`, `buildClearCondition`, `buildCreateCascadePolicyBody`, `buildUpdatePolicyBody`, `buildSyntheticBodyForType`; `cleanupPolicies`. Assertion-style: `setupPolicySpecFixture` (1 probe + one synthetic per monitor type + metric discovery). |
| `policy-display.ts` | Pure label mappers (no `apiRequest`) | `POLICY_OPERATOR_DISPLAY_LABELS`, `POLICY_EVALUATION_WINDOW_LABELS`, `formatNormalizedMetricLabel`, `getPolicyOperatorDisplayLabel`, `getPolicyEvaluationWindowDisplayLabel`, `formatPolicyConditionForDetailsDisplay` — mirrors the frontend's policy-details-sheet display strings for UI assertions. |
| `tenant-schema.ts` | Passthrough | `getTenantSchema`. **`-schema` suffix is non-standard — canonical: `tenant.ts`** (currently the resource file is named `tenant.ts` already; this helper file should fold in or rename). |
| `createStorageState.ts` | Auth bootstrap (UI flow) | `createAppStorageState` — Keycloak UI login + OTP + `context.storageState({ path })`. Lives under `helpers/app/` despite being auth-bootstrap because it depends on `pages/util/LoginPage`. **camelCase legacy — canonical: `create-storage-state.ts`.** |

### Utility helpers — `helpers/util/`

| File | Purpose |
|------|---------|
| `mailpit.ts` | `MailpitHelper` class (`getLastEmail`, `deleteAllEmails`, `deleteEmailsForRecipient`); `getInviteLinkFromEmail`, `extractLinkFromEmail`, `extractOtpFromEmail`, `getNextTestEmail`. Recipient must be `@<your-test-domain>`. |
| `keyCloak.ts` | Auth bootstrap: `getAuthenticatedKcAdminClient`, `getAuthenticatedKcUserClient`, `getUserIdByEmail`, `resetUserPasswordById`, token retrieval. Reads Keycloak credentials from `process.env.KEYCLOAK_*` — this file is the **one sanctioned** place for direct env access in helpers (it is the auth boundary; everywhere else, the caller passes the token via `headers`). **camelCase legacy — canonical: `key-cloak.ts` (or fold into `keycloak.ts`).** |
| `dateTimeFormat.ts` | ISO → `MM/DD/YYYY h:mm:ss AM/PM` formatters with timezone offset. **camelCase legacy — canonical: `date-time-format.ts`.** |
| `balanceFormat.ts` | Number → `1,234,567.89` formatter. **camelCase legacy — canonical: `balance-format.ts`.** |
| `dataGenerator.ts` | `generateRandomAmount`, `generateTestEmail`, `generateUserData`. **camelCase legacy — canonical: `data-generator.ts`.** Note the overlap with `mailpit.ts:getNextTestEmail` and `users.ts:buildCreateUserBody` — consolidate when next touched. |
| `otpauth.ts` | `generateTOTP({ secret, algorithm?, digits?, period? })`. Already kebab-safe (single word). |

> **Filename drift reality.** Of 18 files under `helpers/` (12 in `helpers/app/`, 6 in `helpers/util/`), 8 are camelCase (`adminRealms.ts`, `adminTenants.ts`, `adminUsers.ts`, `createStorageState.ts`, `keyCloak.ts`, `dateTimeFormat.ts`, `balanceFormat.ts`, `dataGenerator.ts`). 10 are already kebab-safe-or-single-word (`synthetics.ts`, `probes.ts`, `users.ts`, `data.ts`, `tenant-schema.ts`, `alerts.ts`, `policies.ts`, `policy-display.ts`, `mailpit.ts`, `otpauth.ts`). Do not invent new camelCase files — the orchestrator's File Naming Conventions are the source of truth and the legacy list above is finite drift.

## Helper signature rules

Apply these to every new helper. They are project-wide invariants — `api-testing` cites them, this skill enforces them.

- **First parameter is `apiRequest: ApiRequestFn`** typed from `fixtures/api/api-types`. Never close over a request context, never instantiate one inside the helper.
- **Last optional parameter is `headers?: string`** (the bearer token). For unauthenticated calls (testing 401), the caller omits it entirely — never pass an empty string. For form-encoded calls (Keycloak token endpoint), pass the literal string `"form-urlencoded"` — see `api-testing` § Common request recipes.
- **Return shape — passthrough style:** `Promise<ApiRequestResponse<T>>` where `T` is the schema-inferred response type. The caller owns status assertion and `Schema.parse(body)`. This is the default for CRUD helpers used across positive AND negative tests.
- **Return shape — assertion-style:** the typed entity itself (`Promise<{ email: string; userId: string }>` for `setupTestUser`). The helper asserts `status` and runs `Schema.parse(body)` once internally. Only for setup helpers that exist to seed a precondition. **Decision rule lives in `api-testing` § Two helper styles.**
- **Sync URL builders** — for query-string endpoints, expose a sibling `buildList<X>Url(params)` that takes a typed param object and returns the path string. Existing examples: `buildListSyntheticsUrl`, `buildListProbesUrl`, `buildListUsersUrl`, `buildDataQueryUrl`. Keep these synchronous — they are pure path-shapers.
- **Sync body builders** — `buildCreate<X>Body(overrides?)` / `buildUpdate<X>Body(overrides?)` returning a plain object literal seeded from `faker`. Always splat `...overrides` last so callers can override any field. Names always carry a `qa-` prefix and a faker-suffix to be greppable in DB cleanups (e.g. `qa-icmp-${faker.string.alphanumeric(8).toLowerCase()}`).
- **Cleanup helpers** — accept arrays of ids (typed `string[]`), iterate via `Promise.allSettled` over per-id deletes, never throw. The shape is `cleanup<Resource>(apiRequest, ids: string[], headers?: string): Promise<void>`. For multi-resource cleanups with ordering constraints, name the helper after both resources in dependency order (`cleanupProbesAndSynthetics` deletes synthetics first **despite the name reading probes-first** — the name is descriptive of the inputs, the order is enforced by the implementation).
- **Schemas import-only.** A helper file imports response types from `fixtures/api/schemas/app/<resource>.ts` (`type CreateSyntheticResponse`); it never declares a `z.object` / `z.strictObject`. If you find yourself reaching for `z`, the schema belongs in `fixtures/api/schemas/app/`.
- **Configuration via `appConfig`.** Endpoint paths come from `appConfig.api.X` (`config/app.ts`); base URL comes from `appConfig.apiUrl`. Never hardcode a path string in a helper.

## Setup-style vs passthrough helpers

The decision rule lives in **`api-testing` § Two helper styles** — read that and pick the style that matches your use case. This skill does not duplicate the decision tree.

Cliff-notes for orientation only (not a substitute for the api-testing section):
- **Assertion-style** parses internally and returns a typed payload. Use when the helper exists to seed a precondition. Existing examples in this codebase: `setupTestUser` / `teardownTestUser` in `helpers/app/adminUsers.ts`, `setupProbeAndSynthetic` in `helpers/app/synthetics.ts`, `setupPolicySpecFixture` in `helpers/app/policies.ts`, `setupFiringAlertsFixture` in `helpers/app/alerts.ts`.
- **Passthrough** returns `{ status, body }` and lets the caller assert. Use when the same helper runs across positive AND negative tests. Existing examples: every CRUD helper in `helpers/app/synthetics.ts`, `helpers/app/probes.ts`, `helpers/app/adminTenants.ts`, `helpers/app/users.ts`.
- **Planned** — per the framework alignment plan § 4.2, more assertion-style setup helpers are coming (`setupSynthetic`, `setupProbe`, `setupUser`, `setupTenant`). Today the project leans heavily passthrough.

## Cleanup helper patterns

These are the project-specific cleanup invariants. Generic guidance lives in `api-testing` § Cleanup patterns; this section covers the helper-author side.

- **`Promise.allSettled` over per-id deletes.** A failure on one id must not skip the others. See `cleanupProbes` and `cleanupProbesAndSynthetics`.
- **404 is success.** A test that already deleted its resource should not crash teardown. Do not branch on the response status inside a cleanup helper unless you also log; throwing is forbidden.
- **Ordering matters when resources reference each other.** The synthetics → probes case is the canonical example — a probe still bound to a synthetic returns 409 on delete, so synthetics MUST go first. `cleanupProbesAndSynthetics` enforces this; reach for it instead of inventing parallel cleanups.
- **UI-driven cleanup needs id resolution by name.** When a UI test creates a resource via a Page Object, the test only knows the unique name, not the id. `cleanupUiCreatedSyntheticMonitors` resolves id-by-name with retry (5 attempts × 600ms) and tolerates 404 — pattern this when a future UI flow needs the same shape.

## Body-builder patterns

- One file per resource, alongside the CRUD helpers (`synthetics.ts` co-locates seven `buildCreate*Body` variants for the seven monitor types).
- `qa-` prefix + faker suffix is the project convention for greppable cleanup. Do not drop the prefix.
- Seven monitor types live in `helpers/app/synthetics.ts`: `buildCreateSyntheticBody` (icmp, the default), `buildCreateHTTPSyntheticBody`, `buildCreateWebSocketSyntheticBody`, `buildCreateTCPSyntheticBody`, `buildCreateDNSSyntheticBody`, `buildCreateSSLSyntheticBody`, `buildCreateMCPSyntheticBody`. Adding an 8th monitor type goes in the same file. **The 10th-monitor-type-or-5th-builder-on-another-file trigger** for extracting body builders to a shared `helpers/app/test-data-generators.ts` is documented in the framework alignment plan § 6.4 — until then, per-resource is fine.
- Recipient-domain rule for any builder that emits an email: it MUST be `@<your-test-domain>` (Mailpit catches only that). `buildCreateUserBody` in `helpers/app/users.ts` currently emits `@<alt-test-domain>` and is in the alignment plan § 4.1 to fix; do not pattern after it.

## Auth-bootstrap helpers

- **The Keycloak admin client (`helpers/util/keyCloak.ts`) is the one sanctioned place for direct `process.env.*` reads in helpers.** It is the auth boundary — everywhere else, the caller passes the token via the `headers` parameter.
- **The UI auth bootstrap (`helpers/app/createStorageState.ts`)** logs in via the Keycloak UI, optionally enters a TOTP, waits for the app sidebar, and writes the storage state to a path. It is consumed from `tests/app/login.setup.ts` (project setup hook), not from regular specs.
- **`setupTestUser`** is the bridge between the admin API and Keycloak: it creates the user via the admin API, resets the password directly via the Keycloak admin client (bypassing the invite-link / email-reset UX), purges the Mailpit mailbox, and returns `{ email, userId }`. It does **not** mint or return access tokens, and it does **not** drive the invite-link flow end-to-end. For tests that need the invite-link UX, write the steps inline (purge → create user → `getInviteLinkFromEmail` → follow the link) — see `api-testing` § Multi-step & E2E API tests.

## Anti-patterns

- ❌ Declaring a Zod schema (`z.object`, `z.strictObject`, …) inside a helper file. Move it to `fixtures/api/schemas/app/<resource>.ts` and import the inferred type back.
- ❌ Reading credentials directly from `process.env` inside a helper (other than the sanctioned `helpers/util/keyCloak.ts` auth boundary). The caller controls the token via `headers`.
- ❌ Hardcoding URLs, paths, or uuids inside a helper. Paths come from `appConfig.api.X`, base URL from `appConfig.apiUrl`, uuids from `test-data/app/*.json` or `faker.string.uuid()`.
- ❌ A new helper file in camelCase. Use kebab-case (`admin-tenants.ts`, not `adminTenants.ts`). Existing camelCase files are drift; rename when next touched.
- ❌ A cleanup helper that throws on 404. Use `Promise.allSettled` and tolerate already-deleted ids.
- ❌ Synthetics-with-probes cleanup that deletes probes first — returns 409 because the synthetic still references the probe. Always delete synthetics first; reach for `cleanupProbesAndSynthetics`.
- ❌ Authoring a passthrough helper that asserts `status` internally. Passthrough means the caller asserts — status-asserting inside breaks negative tests.
- ❌ Authoring an assertion-style helper that returns `{ status, body }`. Assertion-style returns the typed payload; if you need both shapes, the helper is passthrough.
- ❌ Wrapping a single one-shot `apiRequest` call in a helper "for tidiness". The decision rule is in `api-testing` § Helpers — start with `apiRequest({...})` directly in the spec, promote on the second use.
- ❌ Helper that emits a non-`@<your-test-domain>` Mailpit recipient. The test infra catches only `@<your-test-domain>`; everything else (`@<alt-test-domain>`, `@automation.test`) is silently dropped.
- ❌ Helper that calls `request.get` / `request.post` / `request.fetch` directly. Always go through `apiRequest`.
- ❌ Adding a new utility under `helpers/util/` that overlaps an existing one (`generateTestEmail` vs `getNextTestEmail`, `buildCreateUserBody` vs `generateUserData`). Search before creating; consolidate when you find drift.
- ❌ Passing `headers: ""` to fake an unauthenticated call. **Omit the property entirely** — `apiRequest`'s 401 path requires the absent property, not the empty string.

## Self-review checklist

Before declaring a helper change done, verify:

- [ ] File is under `helpers/app/<resource>.ts` (resource-scoped) or `helpers/util/<name>.ts` (cross-resource).
- [ ] Filename is kebab-case (or you are matching one of the listed legacy camelCase files exactly).
- [ ] First parameter is `apiRequest: ApiRequestFn`; last optional parameter is `headers?: string`.
- [ ] No `z.object` / `z.strictObject` / `z.<anything>` inside the helper file. Response types are imported from `fixtures/api/schemas/app/`.
- [ ] No `process.env.*` reads inside the helper (unless the file IS `helpers/util/keyCloak.ts`).
- [ ] Endpoint paths come from `appConfig.api.X`; base URL is `appConfig.apiUrl`.
- [ ] If the helper is a body builder, the name carries a `qa-` prefix + faker suffix and `...overrides` is splat last.
- [ ] If the helper is a cleanup, it uses `Promise.allSettled` and tolerates 404.
- [ ] If the helper is assertion-style, it asserts `status` and runs `Schema.parse(body)` once and returns the typed payload — not `{ status, body }`.
- [ ] If the helper is passthrough, it does not status-assert internally — the caller does.
- [ ] Synthetics-with-probes cleanup paths use `cleanupProbesAndSynthetics`; nothing else deletes probes-then-synthetics.
- [ ] If the helper sends an email, the recipient domain is `@<your-test-domain>`.
- [ ] Helper choice (helper vs `apiRequest` vs fixture) was made via `api-testing` § Helpers, not by gut feel.

## Examples

### Example 1 — Adding a setup helper for synthetics

User says: _"We re-create-and-delete a synthetic monitor in five specs. Make a setup helper."_

Walk:
1. **Decision** — load `api-testing` § Helpers and § Two helper styles. Five-spec reuse for setup precondition → assertion-style helper (`setupSynthetic`).
2. **Location** — `helpers/app/synthetics.ts` (resource-scoped, file already exists).
3. **Signature** — `export async function setupSynthetic(apiRequest: ApiRequestFn, probeIds: string[], headers: string, overrides?: Record<string, unknown>): Promise<Synthetic>`. First arg `apiRequest`, last is the optional payload override; `headers` is required here because setup always authenticates.
4. **Body** — call `buildCreateSyntheticBody(probeIds, overrides)`, then `apiRequest<CreateSyntheticResponse>({ method: "POST", url: appConfig.api.SYNTHETICS, baseUrl: appConfig.apiUrl, headers, body })`. Assert `status === 201`. Run `expect(SyntheticSchema.parse(body)).toBeTruthy()` and return the typed entity.
5. **Pair with** `teardownSynthetic(apiRequest, syntheticId, headers)` that calls `deleteSyntheticMonitor` and tolerates 404 (just `Promise.allSettled` of one for shape consistency, or a try/log).
6. **Schema** — already exists in `fixtures/api/schemas/app/synthetic.ts` (`SyntheticSchema`, `CreateSyntheticResponse`). Do not redeclare.
7. **Schema barrel** — confirm `SyntheticSchema` is re-exported from `fixtures/api/schemas/app/index.ts` (per `api-testing` § Zod schema conventions, the barrel coverage is partial today; converge while you're here).

### Example 2 — Adding a cleanup helper for a brand-new resource

User says: _"We're adding `/api/v1/widgets`. Five specs will create widgets. Add a cleanup."_

Walk:
1. **Location** — `helpers/app/widgets.ts` (kebab-case, single word, fine as-is).
2. **CRUD shape** — start with passthrough CRUD (`createWidget`, `getWidget`, `listWidget`, `updateWidget`, `deleteWidget`), one body builder (`buildCreateWidgetBody`), one URL builder if list takes query params (`buildListWidgetsUrl`).
3. **Cleanup** — append `cleanupWidgets(apiRequest: ApiRequestFn, widgetIds: string[], headers?: string): Promise<void>` mirroring `cleanupProbes`: `Promise.allSettled(widgetIds.map((id) => deleteWidget(apiRequest, id, headers)))`. No status-checking, no throw.
4. **If widgets reference probes (or any other resource that constrains delete order)**, mirror `cleanupProbesAndSynthetics`: take both id arrays, delete the dependent resource first, then the referenced one. Name the helper `cleanup<Dependent>And<Referenced>` and document the order in a JSDoc.

### Example 3 — Adding a body builder for a new monitor type

User says: _"We're adding GraphQL synthetics. Add the body builder."_

Walk:
1. **Location** — `helpers/app/synthetics.ts` — same file, after the existing six per-type variants.
2. **Signature** — `export function buildCreateGraphQLSyntheticBody(probeIds: string[], overrides?: Record<string, unknown>): Record<string, unknown>` — match the seven existing variants byte-for-byte.
3. **Faker seeding** — `name: \`qa-graphql-${faker.string.alphanumeric(8).toLowerCase()}\``, `target: faker.internet.url()` (or whatever the GraphQL endpoint shape is), `type: "graphql"`, `checkInterval: DEFAULT_CHECK_INTERVAL`, `timeout: DEFAULT_TIMEOUT`, `config: { /* graphql-specific keys */ }`, `probeIds`, `...overrides`.
4. **Threshold check** — adding the 8th type. The 10th-type trigger for promoting all body builders to a shared `helpers/app/test-data-generators.ts` (alignment plan § 6.4) has not yet fired; keep it inline.
5. **Schema** — the response shape is already covered by `SyntheticSchema` (it discriminates on `type`); the new monitor type extends the existing `config` shape inside `fixtures/api/schemas/app/synthetic.ts` — that schema work belongs to `api-testing` / `type-safety`, not this skill.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| My helper has a `z.object(...)` in it | Schema declared in the wrong layer | Move the schema to `fixtures/api/schemas/app/<resource>.ts`; export both the schema and the inferred type; re-export from `fixtures/api/schemas/app/index.ts`; import the inferred type back into the helper. See `api-testing` § Zod schema conventions. |
| Cleanup fails with `409 Conflict` deleting a probe | The probe is still bound to a synthetic — wrong delete order | Use `cleanupProbesAndSynthetics(apiRequest, probeIds, syntheticIds, headers)` from `helpers/app/synthetics.ts`. It deletes synthetics first, probes second. |
| ESLint complains about my helper filename | The file is camelCase (or otherwise not kebab-case) | Rename to kebab-case (`admin-tenants.ts`, not `adminTenants.ts`). The orchestrator's File Naming Conventions section is the source of truth; the legacy camelCase files in this codebase are listed in this skill's File Locations section — do not propagate. |
| Cleanup throws and breaks the next test's setup | A delete returned 404 (already gone) and the helper threw | Wrap deletes in `Promise.allSettled`. Cleanup must tolerate 404 — never throw. See `cleanupProbes` and `cleanupProbesAndSynthetics`. |
| `setupTestUser` returns `null` for the invite link / email never arrives | Recipient domain is not `@<your-test-domain>` — Mailpit on the test infra silently drops everything else | Use the `setupTestUser` flow as-is (it already generates `qa-reset-...@<your-test-domain>`). For your own helpers, hardcode the `@<your-test-domain>` domain. `buildCreateUserBody` in `helpers/app/users.ts` emits `@<alt-test-domain>` today — that is in the alignment plan § 4.1 to fix; do not copy that pattern. |
| 401 test fails because `headers: ""` triggered a different error | Empty-string `headers` sends an `Authorization: Bearer ` request, not an unauthenticated request | **Omit the `headers` property entirely** in the helper call site. Never pass an empty string. |
| I don't know whether to write a helper, call `apiRequest` directly, or build a fixture | Decision rule is not in this skill | Load `api-testing` § Helpers — three callable shapes / Two helper styles. This skill governs how to author the helper; that one governs whether you should. |
| My new helper duplicates `generateTestEmail` / `generateUserData` / `getNextTestEmail` | The codebase has overlapping email/user generators across `dataGenerator.ts` and `mailpit.ts` | Search before creating. Pick the existing one and consolidate when next touched — `getNextTestEmail` (in `helpers/util/mailpit.ts`) is the most current. |
| `process.env.KEYCLOAK_*` is undefined in a non-Keycloak helper | A helper read env directly that should not have | Move the call up to the spec or an auth-bootstrap helper. The only sanctioned `process.env.*` reader in `helpers/` is `helpers/util/keyCloak.ts` — every other helper takes the token via the `headers` parameter. |

## See Also

- **`api-testing`** — owns the helper-vs-`apiRequest`-vs-fixture decision (§ Helpers — three callable shapes), the assertion-style vs passthrough decision (§ Two helper styles), the `apiRequest` contract, the `expect(Schema.parse(body)).toBeTruthy()` rule, the negative-matrix coverage, and full code skeletons in `templates.md` (§ 18 Helper styles).
- **`fixtures`** — Playwright fixture authoring with `use()` lifecycle (`mailpit`, `loginUser`, `apiRequest`); the sibling category to helpers. See also `api-testing` § Helpers — three callable shapes for the helper-vs-fixture decision rule.
- **`type-safety`** — Zod 3 schemas, `z.strictObject()`, `z.string().uuid()` defaults, type inference (`z.infer<typeof X>`), and the canonical `process.env.X!` access pattern. The strictness ladder for `.optional()` / `.nullable()` lives in `api-testing` § Zod schema conventions.
- **`data-strategy`** — when to use JSON vs faker vs env vs API seeding; the three-tier rule for invalid-value arrays. Body builders in this skill seed from faker per § 8 of that skill.
- **`enums`** — `SUITES.API_*`, route constants, message constants. Helpers do not import enums (they are caller-side concerns), but resource path constants (`appConfig.api.X`) live in `config/app.ts` per the orchestrator's Sources of Truth rule.
- **`config`** — `appConfig.api.X` for endpoint paths, `appConfig.apiUrl` for base URL, `appConfig.paths.X` for UI routes.
- **`refactor-values`** — the workflow when a route constant or static `test-data/` value referenced by a helper needs to change.
- **`debugging`** — failure-mode taxonomy when a helper-driven setup or teardown misbehaves.
- **[`api-testing`](../api-testing/SKILL.md)** — non-negotiable invariants for API specs that consume these helpers (consolidated from the previous `api-tests.mdc`).
- **`~/.claude/CLAUDE.md`** — root orchestrator with MUST/SHOULD/WON'T tables and File Naming Conventions (the source of truth for kebab-case).
