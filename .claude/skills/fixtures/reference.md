# Fixtures — Reference

Every catalog in this file is the invented example app's. Your repo's own lists belong in its `CLAUDE.md`.

The catalogs say what is registered, where it lives and what it depends on. Rules and decisions live in `SKILL.md`; end-to-end wiring lives in `recipes.md`. When you add a fixture, update your repo's list.

---

## 1. Fixture inventory

Every fixture merged into `fixtures/pom/test-options.ts`. All are `{ scope: 'test' }` — the example app has **no** Playwright-worker-scoped fixtures.

### 1.1 Page-object fixtures — `fixtures/pom/page-object-fixture.ts`

Registered on the `FrameworkFixtures` type + the `base.extend<FrameworkFixtures>({...})` body. Body is always `async ({ page }, use) => { await use(new XPage(page)); }`.

| Fixture | Class | Source |
|---------|-------|--------|
| `loginPage` | `LoginPage` | `pages/util/LoginPage.ts` |
| `notificationsPage` | `NotificationsPage` | `pages/app/NotificationsPage.ts` |
| `sideNavigation` | `SideNavigation` | `pages/app/SideNavigation.ts` |
| `dashboardPage` | `DashboardPage` | `pages/app/DashboardPage.ts` |
| `jobsPage` | `JobsPage` | `pages/app/JobsPage.ts` |
| `inventoryPage` | `InventoryPage` | `pages/app/InventoryPage.ts` |
| `notificationRulesPage` | `NotificationRulesPage` | `pages/app/NotificationRulesPage.ts` |
| `createJobPage` | `CreateJobPage` | `pages/app/CreateJobPage.ts` |
| `createNotificationRulePage` | `CreateNotificationRulePage` | `pages/app/CreateNotificationRulePage.ts` |
| `workersPage` | `WorkersPage` | `pages/app/WorkersPage.ts` |
| `runStatsPage` | `RunStatsPage` | `pages/app/RunStatsPage.ts` |
| `jobRunStatsViewPage` | `JobRunStatsViewPage` | `pages/app/JobRunStatsViewPage.ts` |
| `settingsProfilePage` | `SettingsProfilePage` | `pages/app/SettingsProfilePage.ts` |
| `profileSettingsPage` | `ProfileSettingsPage` | `pages/app/ProfileSettingsPage.ts` |
| `reportsPage` | `ReportsPage` | `pages/app/ReportsPage.ts` |

Plus one non-POM helper registered in the same file:

| Fixture | Shape | Purpose |
|---------|-------|---------|
| `resetStorageState` | `() => Promise<void>` | Returns a function that calls `context.clearCookies()` + `context.clearPermissions()`. Used by login / guest-flow specs. **Does NOT clear `localStorage` / `sessionStorage`** — see § 5. |

### 1.2 API / service fixtures

| Fixture | File | Yielded type | Depends on | Teardown |
|---------|------|--------------|------------|----------|
| `apiRequest` | `fixtures/api/api-request-fixture.ts` | `ApiRequestFn` — `<T>({ method, url, baseUrl, body?, headers? }) => Promise<{ status, body: T }>` | Playwright's built-in `request` (`APIRequestContext`) | none (no owned resource) |
| `loginUser` | `fixtures/services/login-fixture.ts` | `(username, password) => Promise<ApiRequestResponse<LoginUser>>` | extends `apiRequestFixture` (inherits `apiRequest`); `API_URL` (via `appConfig.apiUrl` — a direct `process.env` read here is drift) | none. **No spec uses it** — helpers are preferred; kept as the canonical "fixture that extends `apiRequest`" example |
| `mailpit` | `fixtures/api/mailpit-fixture.ts` | `MailpitHelper` | builds its **own** `APIRequestContext` with `Basic` auth from `MAILPIT_USERNAME` / `MAILPIT_PASSWORD` | `await context.dispose()` after `use` |

---

## 2. The merge point — `fixtures/pom/test-options.ts`

```typescript
const test = mergeTests(
    pageObjectFixture,
    apiRequestFixture,
    loginFixture,
    mailpitFixture
);
const expect = base.expect;
export { test, expect, request };
```

- Every spec imports `{ test, expect }` from here — never from `@playwright/test`.
- `request` (Playwright's API-context factory) is also re-exported for fixtures/helpers that must build their own context (e.g. `mailpit`).
- Adding a new fixture module = add the import + append to `mergeTests(...)`. Page objects need **no** change here (the whole `pageObjectFixture` module is already merged).

---

## 3. Plain functions that are NOT fixtures

Do not re-wrap these as fixtures — call them directly.

| Item | File | Note |
|------|------|------|
| `apiRequest` (raw) | `fixtures/api/plain-function.ts` | Internal function the `apiRequest` **fixture** wraps. Specs/helpers use the fixture, not this. |
| `ApiRequestFn`, `ApiRequestParams`, `ApiRequestResponse<T>`, `ApiRequestMethods`, `LoginUser` | `fixtures/api/api-types.ts` | Type aliases. New fixtures wrapping `apiRequest` import their function-type from here. |
| `invalidString`, `invalidIntegerTypes`, `invalidBooleanTypes`, `invalidObjectTypes` | `fixtures/api/invalid-types.ts` | Universal invalid-value arrays for negative tests. Catalog, not a fixture. |
| `MailpitHelper`, `getInviteLinkFromEmail`, `extractLinkFromEmail` | `helpers/util/mailpit.ts` | The class the `mailpit` fixture instantiates + two plain helpers. `getLastEmail(email, retries, interval)`, `deleteAllEmails()`, `deleteEmailsForRecipient(email)`. |
| Zod schemas | `fixtures/api/schemas/app/`, `fixtures/api/schemas/util/` | Schemas, not fixtures. |

---

## 4. Storage-state & token catalog

Produced by `tests/app/login.setup.ts` (the `app-setup` project). Every setup test calls `qase.ignore()` and imports `test` from `fixtures/pom/test-options`.

| Artifact | Kind | Produced by | Consumed by |
|----------|------|-------------|-------------|
| `.auth/app/appMainUserSession.json` | UI storage state | `createAppStorageState({ ...users.main })` via Keycloak UI login | Playwright projects that attach `storageState` (chromium project); `test.use({ storageState })` overrides |
| `USER_ACCESS_TOKEN_ADMIN` (written into `process.env`) | API token (master realm) | Keycloak admin client (`getAuthenticatedKcUserClient` + `getClientToken`) | Admin-endpoint specs; read as `tokens.admin()` and passed as the `headers` value of `apiRequest` directly — no aliasing |
| `USER_ACCESS_TOKEN_FULL` (written into `process.env`) | API token (`<realm>`/tenant realm) | Keycloak user client for the FULL-permission user | Tenant-scoped specs; `tokens.full()` called at call sites. If specs alias it (`TENANT_TOKEN`, `API_TOKEN`), that is drift — normalize when next touching |
| `USER_ACCESS_TOKEN_ZERO` (written into `process.env`) | API token (`<realm>`/tenant realm) | Keycloak user client for the zero-permission user | 403-path specs; `tokens.zero()` called at call sites |

Notes:
- Token env keys follow `USER_ACCESS_TOKEN_<PERSONA>` (`ADMIN`, `FULL`, `ZERO`). If your environment has no zero-permission user, the setup file writes no ZERO token: write the 403 tests and comment them out under `// TODO: FIXME: <TICKET>`.
- Setup tests never skip on missing config: a missing `APP_URL` / `KEYCLOAK_URL` fails the run at load, in the schema parse in `config/env.ts`, with a `ZodError` naming it.

---

## 5. What the framework does NOT do (anti-catalog)

Deliberate omissions. If you're about to add one of these, re-read `SKILL.md` first.

- **No Playwright-worker-scoped fixtures.** Everything is `test`-scoped. Auth is handled by the `login.setup.ts` project + storage state, not a Playwright-worker-scoped fixture.
- **No `auto: true` fixtures.** Implicit fixtures hide cost and surprise readers. Every fixture is explicitly destructured in the test/hook signature.
- **No auto-login fixture.** A "loggedInUser" fixture would couple persona selection to the fixture and block per-spec overrides. Personas come from storage state + env tokens; specs pick a persona via the project or `test.use({ storageState })`.
- **No one-file-per-POM.** All page objects share `page-object-fixture.ts`.
- **`resetStorageState` does NOT clear `localStorage` / `sessionStorage`** — only cookies + permissions. If a test depends on client-side storage being wiped, clear it explicitly.

---

## 6. Env-var dependency map

Fixtures and the setup project read these through `config/env.ts` (`env.X`, or `appConfig` for URLs) — declared in `env/.env.example` and in the schema. If one of these files still reads `process.env` directly, that is drift; migrate it on next touch (see `type-safety` § Environment variables):

| Consumer | Env vars |
|----------|----------|
| `login.setup.ts` (storage state) | `APP_URL`, `APP_MAIN_EMAIL`, `APP_MAIN_PASSWORD`, `APP_MAIN_SECRET_KEY` |
| `login.setup.ts` (tokens) | `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_*`, `APP_FULL_PERMISSIONS*`, `APP_ZERO_PERMISSIONS*` |
| `loginUser` fixture | `API_URL` |
| `mailpit` fixture | `MAILPIT_USERNAME`, `MAILPIT_PASSWORD` (and `MAILPIT_URL` read by `MailpitHelper`) |

**Drift to be aware of:** if a fixture reads a variable that `env/.env.example` does not declare (for example, `mailpit-fixture.ts` reading `MAILPIT_USERNAME` / `MAILPIT_PASSWORD` while the template has only `MAILPIT_URL`), add it to the template and to the schema in `config/env.ts` when next touching the env template.

---

## See Also

- `SKILL.md` — rules, decisions, anti-patterns, the fixture-vs-helper decision.
- `recipes.md` — end-to-end wiring scenarios anchored to these entries.
- `api-testing` skill § Three callable shapes — the canonical `apiRequest` vs helper vs fixture decision.
