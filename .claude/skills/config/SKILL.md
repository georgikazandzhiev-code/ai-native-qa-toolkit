---
name: config
version: 1.1.2
description: Env-var and configuration conventions — env/.env.* layout, dotenv loading via ENVIRONMENT, the appConfig object in config/app.ts (URLs, api paths, UI routes, timeouts), and the config/util/ per-service convention (future — not yet created). Use when adding an env var, config property, environment file, or endpoint/route constant. Triggers — "env var", "appConfig", "config", "new URL". Not for static test data (data-strategy) or env access rules (type-safety).
metadata:
  category: domain
---

# Configuration

## Critical

- **NEVER** hardcode URLs, tokens, emails, passwords, or tenant ids anywhere in `pages/`, `tests/`, `fixtures/`, or `helpers/`. The single source of truth for env-driven values is `config/env.ts` — the only module that reads `process.env`, validating it with a Zod schema at load — backed by `env/.env.${ENVIRONMENT}` and declared in `env/.env.example`. Everything else reads `env.X`, `tokens.admin()` / `.full()` / `.zero()`, or `appConfig` (see `type-safety` § Environment variables).
- **NEVER** add real domains, real secrets, or production URLs to `env/.env.example`. Only `env/.env.example` is tracked; all other `env/.env.*` files are gitignored (see `.gitignore` — `env/.env.dev`, `env/.env.local`, `env/.env.prod`, plus the catch-all `.env.*` with `!.env.example`).
- **ALWAYS** add every new env variable to `env/.env.example` with the key but a blank or placeholder value, in the correct grouped section (`KEYCLOAK CONFIGURATION`, `UI TEST USERS`, `API TEST USERS`, `QASE REPORTING`, `MAILPIT`).
- **ALWAYS** keep app-facing URLs/settings as properties of `appConfig` in `config/app.ts`. For utility / third-party service config, the **future** convention is `config/util/<service>.ts` exporting a `<service>Config` object built from `env` — **`config/util/` does not exist yet**; create it when the first dedicated util config is warranted. Today the only utility service (Mailpit) reads `env.MAILPIT_URL`; the direct `process.env.MAILPIT_URL` read in `helpers/util/mailpit.ts` is drift — move it to `env.MAILPIT_URL` when you next touch that file. Do not invent ad-hoc config files elsewhere.
- **NEVER** put endpoint paths, route strings, or message constants in env vars. Paths live only in `appConfig.api.*` / `appConfig.paths.*` (the in-source path catalog) — never in enums; message constants live in `enums/app/*` — see the `enums` skill. `config/` is for env-driven values and the path catalog only.
- **NEVER** declare `ENVIRONMENT` itself inside any `.env` file. It is set at the **shell** level (`ENVIRONMENT=test npx playwright test`); declaring it in a `.env` file creates a chicken-and-egg loop because the file is selected *by* `ENVIRONMENT`.
- **ALWAYS** carry JSDoc on every property of `appConfig` (and any future util configs) describing the value and naming the backing env var. The current `appConfig` properties are undocumented — that is drift to close. **Backfill JSDoc on the surrounding properties whenever you touch the file**, even if your change only adds or modifies one property; do not leave the file in a half-documented state.
- **NEVER** introduce a runtime `process.env.X ?? appConfig.foo` override pattern in pages, helpers, or fixtures (see `pages/app/JobsPage.ts:73` for the existing one). If a path needs to be configurable, model it as either a config property OR an env var — not both. Surface ambiguity rather than encode it.

## File Locations

| Type           | Directory / File                  | Purpose                                                                 |
| -------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Env module     | `config/env.ts`                   | The **only** reader of `process.env`. Parses it with a Zod schema (`EnvSchema`) at load — defaults live there as `.default(...)` — and exports `env` (the validated static variables) and `tokens` (`admin()` / `full()` / `zero()` accessors for the run-time tokens the setup project writes) |
| App config     | `config/app.ts`                   | `appConfig` — URLs built from `env` (`baseUrl`, `apiUrl`, `keycloakUrl`), `tenantId`, `keycloakRealm` (from `KEYCLOAK_REALM`), the in-source path catalog (`appConfig.api`, `appConfig.paths`), and infra timeouts (`appConfig.timeouts`) |
| Utility config | `config/util/<service>.ts`        | One `<service>Config` per third-party / utility service, built from `env`. **Future convention — the directory does not exist yet**; Mailpit reads `env.MAILPIT_URL` (the direct `process.env` read in `helpers/util/mailpit.ts` is drift) |
| Env template   | `env/.env.example`                | Tracked template — keys only or safe placeholders, grouped by section header |
| Env (active)   | `env/.env.${ENVIRONMENT}`         | Real values, selected at runtime. Today: `.env.dev` (default), `.env.test`, `.env.perf`. All untracked |
| Env loader     | `playwright.config.ts` (top of file) | `dotenv.config({ path })` reads `./env/.env.${ENVIRONMENT}` (default `dev`) |
| Gitignore      | `.gitignore`                      | `env/.env.dev`, `env/.env.local`, `env/.env.prod`, `.env`, `.env.*` ignored; `!.env.example` re-included |

## How env files load

`playwright.config.ts` resolves the path at startup as `./env/.env.${process.env.ENVIRONMENT}`, defaulting to `./env/.env.dev` when `ENVIRONMENT` is unset, then calls `dotenv.config({ path })`. After dotenv has loaded, `config/env.ts` validates the result with its Zod schema when it is first imported. Consequences:

- Default environment is `dev` (`env/.env.dev`).
- Override at the shell: `ENVIRONMENT=test npx playwright test` or `ENVIRONMENT=perf npx playwright test`.
- The selected file must exist on disk. `dotenv` itself does **not** error on a missing file — it silently loads nothing. The schema parse in `config/env.ts` is what catches it: the run fails at load with a `ZodError` naming every missing variable, instead of tests going red later with `Cannot read properties of undefined`.
- `ENVIRONMENT` is read **before** dotenv runs, so it must come from the shell — never from a `.env` file.
- **CI variable precedence.** `dotenv.config()` does **not** overwrite `process.env` keys that already exist. CI platforms (Bitbucket repository variables, GitHub Actions secrets/variables) inject their values *before* `playwright.config.ts` runs, so those values win over anything in the `.env` file. This means: if `API_URL` is set as a Bitbucket repository variable, the value in `env/.env.test` is ignored — even when `ENVIRONMENT=test`. To verify which values are active in CI, check the pipeline's repository/deployment variable settings, not the `.env` file. For local test runs, `process.env` is empty before dotenv, so the `.env` file is the sole source.
- If a self-signed certificate forces a TLS-verification override, it has to be set above the dotenv call to take effect — and it applies process-wide, so scope it to a single admin client or trust the certificate properly instead.

## Decide where the new value belongs

Before adding anything, walk this table. If the value fits no row, stop and ask — do not invent a new config file.

| Value kind                                                      | Home                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| URL of the app under test (frontend, API, Keycloak)             | env var + property on `appConfig` in `config/app.ts`                        |
| URL of a utility / third-party service (Mailpit, future tools)  | env var + schema entry in `config/env.ts`, read as `env.X` — or, under the **future** convention, through a `<service>Config` in `config/util/<service>.ts` built from `env` (create the directory with the first such file; today Mailpit reads `env.MAILPIT_URL`) |
| Credential (email, password, secret key, client secret)         | env var + schema entry in `config/env.ts`, read as `env.X` — **never** expose through `appConfig` or a `<service>Config` |
| Test-user identifier (`TENANT_ID`)                              | env var + plain `appConfig.tenantId` slot (already wired)                   |
| Dynamic auth token populated at runtime (`USER_ACCESS_TOKEN_*`) | written into `process.env` by the setup project at run time; read through `tokens.admin()` / `.full()` / `.zero()` from `config/env.ts` — **not** declared in `env/.env.example` or the schema |
| Endpoint path (e.g. `/jobs`) or route (e.g. `/login`)           | `appConfig.api.*` or `appConfig.paths.*` in `config/app.ts` — **never** an env var or an enum |
| Message string, suite name, role, status                        | `enums/app/*` (e.g. `job-status.ts`, `qase-suites.ts`, or a new `enums/app/<name>.ts`) — see the `enums` skill |
| Timeout / retry                                                  | Project defaults in `playwright.config.ts`. Every explicit timeout is a named budget on `appConfig.timeouts` — see § Timeout budgets |
| Static test constant (boundary values, invalid ids)             | `test-data/app/*.json` — see `data-strategy` skill                          |
| Runtime selector (`ENVIRONMENT`, `CI`, `QASE_REPORT`)           | Shell-level env var only — **never** in `env/.env.example`                  |

## Timeout budgets

Specs, page objects, helpers and templates never contain a timeout number. Every explicit timeout is a **named budget** on `appConfig.timeouts`, so the values live in one file, each repository tunes them for its own environment, and a reader can tell from the name *why* a wait is long. Agreed in #5. Most assertions need no explicit timeout at all: trust the project default.

| Budget | Use for | Typical value |
|---|---|---|
| `navigation`, `element`, `api` | Page navigation, element waits and API calls beyond the project defaults (existing) | repo-defined |
| `fastFail` | Inner waits inside a retry block, which should fail fast so the block retries | 3–5 s |
| `uiResponse` | The UI reacting to a network call: a row appears, a dialog closes, an option list loads | 10 s |
| `persist` | A save or create round trip becoming visible: the submit button enables, the sheet closes, the new row or the toast appears | 15 s |
| `retryBlock` | The outer budget of an `expect(async () => { … }).toPass()` block | 15–20 s |
| `longPoll` | `waitForResponse` on a slow endpoint, long-poll assertions | 30 s |
| `firstData` | The first data from an asynchronous pipeline (e.g. a new job's first run stats) | 90 s |
| `asyncFlow` | Test-level (`test.setTimeout`): API seeding without identity-provider admin, single-email flows, async polling | 60 s |
| `asyncFlowHeavy` | Test-level: identity-provider admin workflows, multi-user email flows, heavy fixtures | 90 s |
| `crossTenantSetup` | Test-level: setups spanning several tenants with full identity-provider cycles | 120 s |
| `e2eJourney` | Test-level: a full end-to-end journey (create → verify → edit → delete) | 300 s |

**A budget is not a fix.** When a test times out, investigate with the `debugging` skill first — the cause is usually a missing wait or a slow dependency. Never raise a budget, or switch to a bigger one, to turn a failure green. Add a new budget only for a genuinely new kind of wait, here, with its purpose.

## Adding a new env variable

1. **Pick the section** in `env/.env.example` that matches the value: `KEYCLOAK CONFIGURATION`, `UI TEST USERS`, `API TEST USERS`, `QASE REPORTING`, `MAILPIT`. Add a new section header (matching the existing `═══` style) only if no section fits.
2. **Add the key with a blank or safe placeholder value.** The codebase's convention is `KEY=` (blank) for credentials/URLs and `KEY=<literal>` for non-secret defaults like `KEYCLOAK_REALM=<realm>`. Never paste a real domain, token, or password into `.env.example`.
3. **Add the real value to your local `env/.env.${ENVIRONMENT}` file** (`.env.dev` for local default, `.env.test` for CI, `.env.perf` for perf test runs). These files are gitignored — confirm with `git status` before committing.
4. **Add it to the schema in `config/env.ts`** — `z.string().url()`, `z.string().email()`, `z.string().min(1)` as fits. Required unless it has a real default; a genuine default (e.g. local Mailpit) goes in the schema as `.default(...)`, its one home. A missing required variable then fails the run at load, naming it.
5. **Reference it from code** through the module, never through `process.env` (see `type-safety` § Environment variables):
   - If it's a URL the app config object should document, add a property to `appConfig` built from `env` (or the matching util config). JSDoc the property and name the backing env var.
   - If it's a credential, add it to the schema and pass `env.X` into the helper / fixture that needs it (helpers take values as parameters; they don't read env). **Do not** surface credentials through `appConfig`.
   - Forbidden at call sites: `!`, `as string`, `??` / `||` defaulting.

## Adding a new config property

1. **Pick the file:** app-facing → `config/app.ts` (`appConfig`); utility / third-party service → `config/util/<service>.ts` (no such file exists yet — creating one establishes the directory). New utility services get a new file, not a shared `util.ts`.
2. **Add the property** alongside the existing ones. Match the surrounding shape — top-level for env-driven scalars (`baseUrl`, `apiUrl`, `tenantId`), nested under a sub-object for catalogs (`paths`, `api`, `timeouts`).
3. **JSDoc the property** with one short line naming the backing env var or describing the constant — **and** backfill JSDoc on the surrounding properties in the same edit. The contract is "every property carries JSDoc"; touching the file is the trigger to close the gap. Shape:

   ```typescript
   /** Frontend application URL — loaded from APP_URL env variable */
   baseUrl: env.APP_URL,
   ```

   `env` is imported from `./env`. No `!`, `??` or `as string` here: a missing required variable already fails the run at load, in the schema parse in `config/env.ts`, and defaults live in that schema (see `type-safety` § Environment variables).

4. **Consume it from the call site** by importing the config object. `appConfig.timeouts.navigation`, `appConfig.paths.HOME`, `appConfig.api.JOBS` are the existing precedent.

## Anti-patterns

- ❌ Hardcoding `https://...` URLs, real emails, passwords, or uuid tenant ids inside `tests/`, `pages/`, `helpers/`, or `fixtures/`. (Hardcoded test content has its own ban under `~/.claude/CLAUDE.md` WON'T table — this skill owns the env-and-config side of the same rule.)
- ❌ Adding a key to `env/.env.example` with a real value (real domain, real token, real password). The template tracks the **shape**, never the secrets.
- ❌ Adding `ENVIRONMENT=dev` (or any value of `ENVIRONMENT`) inside an `.env` file. `ENVIRONMENT` is the selector; it must come from the shell.
- ❌ Creating a new `config/util/util.ts` aggregating multiple services. The convention is one file per service (`config/util/<service>.ts`), even though no util config file exists yet.
- ❌ Surfacing credentials (`APP_FULL_PERMISSIONS_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, secret keys) through `appConfig`. Credentials stay env-only.
- ❌ Adding `USER_ACCESS_TOKEN_*` or any other dynamically-minted token to `env/.env.example`. Those tokens are populated at runtime by setup helpers, not declared as static env values.
- ❌ Reading `process.env` anywhere but `config/env.ts` (the setup project's token writes are the only other touch). Specs, helpers, fixtures, page objects and `config/app.ts` read `env` / `tokens`.
- ❌ Putting endpoint paths or message strings in env vars or hand-rolling them into `process.env.*`. Paths live only in `appConfig.api.*` / `appConfig.paths.*`; message strings live in `enums/app/*`.
- ❌ Adding or modifying a config property without JSDoc, OR leaving surrounding properties un-JSDoc'd when you touched the file. Touching the file is the trigger to backfill the un-JSDoc'd neighbours; do not leave it half-documented.
- ❌ Redeclaring an env var twice for the same value (once on `appConfig`, once read inline in a helper). Pick one and stick to it inside a given file.
- ❌ Adding a `process.env.X ?? appConfig.foo` runtime override. `pages/app/JobsPage.ts:73` has one (`process.env.APP_JOBS_PATH ?? appConfig.paths.JOBS`); it should not be propagated. Either make the value config-driven or env-driven, never both.
- ❌ Committing `env/.env.dev`, `.env.test`, `.env.perf`, or `.env.local`. They're in `.gitignore`; if `git status` ever shows one staged, unstage and rotate any credentials that appeared.
- ❌ Rotating an identity-provider admin credential from the QA toolchain. The application may read the same secret from a separate store, so a one-sided reset causes 500s until both are updated. Always rotate both sides together, with whoever owns the platform.

## Self-review checklist

Before declaring a config or env-var change done:

- [ ] New env variable appears in `env/.env.example` with a blank/placeholder value, in the correct section, **and** in the schema in `config/env.ts`.
- [ ] No `process.env` read was added outside `config/env.ts`.
- [ ] Real value lives in your local `env/.env.${ENVIRONMENT}` and is **not** staged in git (`git status` clean for `env/`).
- [ ] If the variable is a URL or non-credential setting documented through a config object, the matching `appConfig` (or util config) property exists and carries a JSDoc line naming the backing env var. **Surrounding properties in the same file are also JSDoc'd** — touching the file is the trigger to backfill.
- [ ] No credential is exposed through `appConfig` or any util config object.
- [ ] No endpoint path, route string, or message constant was added as an env var.
- [ ] No `process.env.X ?? appConfig.foo` runtime-override pattern was introduced.
- [ ] `ENVIRONMENT` is set at the shell, not declared in any `.env` file.
- [ ] If a credential was rotated or exposed, it was rotated upstream (Keycloak, Qase, Mailpit) before the PR opens.
- [ ] The change does not duplicate an existing config property or env var (grepped `config/`, `env/` before adding).
- [ ] Linter passes for `config/env.ts`, `config/app.ts`, any modified `config/util/*.ts`, and the consumers.

## Examples

### Example 1 — Adding a third-permissions-tier API user (`APP_READONLY_PERMISSIONS`)

User says: *"Add a read-only test user so we can prove 403 on write endpoints from a non-admin/non-zero token."*

1. **Decide where it belongs.** It's an API test user — credential triple (`EMAIL`, `PASSWORD`, `SECRET_KEY`), env-only (three schema entries in `config/env.ts`). No `appConfig` slot.
2. **Edit `env/.env.example`.** Under the `API TEST USERS` section, add three blank keys:
   ```
   APP_READONLY_PERMISSIONS=
   APP_READONLY_PERMISSIONS_PASSWORD=
   APP_READONLY_PERMISSIONS_SECRET_KEY=
   ```
3. **Add the real values to `env/.env.dev`** (and `.env.test` for CI). Confirm `git status` does not show those files as modified-and-staged.
4. **Wire up token minting** in the auth-bootstrap setup that already produces `USER_ACCESS_TOKEN_ADMIN` / `USER_ACCESS_TOKEN_FULL` — the new token (`USER_ACCESS_TOKEN_READONLY`, say) is populated at runtime, **not** added to `env/.env.example`.
5. **Add a `readonly: token("USER_ACCESS_TOKEN_READONLY")` accessor** to `tokens` in `config/env.ts`, and call `tokens.readonly()` at the spec call site for the 403 test. Until the token is provisioned in an environment, write the test as the contract says and comment out the whole `test(...)` block with `// TODO: FIXME: <TICKET> READONLY token not provisioned` — never a conditional `test.skip` (constitution pre-edit checklist #1; same rule as `USER_ACCESS_TOKEN_ZERO` in `api-testing`).

### Example 2 — Adding a new utility service (Grafana annotations)

User says: *"Wire up a Grafana URL so a perf-test-run annotation helper can post annotations."*

1. **Decide where it belongs.** Utility service URL → `config/util/grafana.ts` (new file — this would be the first file in `config/util/`, establishing the future convention); env var `GRAFANA_URL`, added to the schema in `config/env.ts`.
2. **Add `env/.env.example`** entry under a new `# GRAFANA` section header (or append to a sensible existing one):
   ```
   GRAFANA_URL=
   GRAFANA_API_TOKEN=
   ```
3. **Add both keys to the schema in `config/env.ts`** (`GRAFANA_URL: z.string().url()`, `GRAFANA_API_TOKEN: z.string().min(1)`), then **create `config/util/grafana.ts`** in the same shape as `appConfig` (env-driven scalar + path catalog):
   ```typescript
   import { env } from "../env";

   export const grafanaConfig = {
     /** Grafana base URL — loaded from GRAFANA_URL env variable */
     apiUrl: env.GRAFANA_URL,
     paths: { ANNOTATIONS: "/api/annotations" },
   };
   ```
   The `apiUrl` comes from the validated `env` (no `!` — the schema parse fails at load if it's missing) and is JSDoc'd; the `paths` sub-object is the in-source path catalog, never env-driven (mirrors `appConfig.api`).
4. **Keep the token env-only.** The caller passes `env.GRAFANA_API_TOKEN` into the helper that calls Grafana (helpers take it as a parameter; they don't read env) — **not** surfaced through `grafanaConfig`.
5. **Local `env/.env.dev`** gets the real values; `.env.test` gets the CI values.

### Example 3 — Adding a new environment file (`env/.env.staging`)

User says: *"Set up a staging environment file pointing at the staging cluster."*

1. **No code change needed in `playwright.config.ts`.** The loader already honors `ENVIRONMENT` and reads `./env/.env.${ENVIRONMENT}` — `staging` is just another value.
2. **Create `env/.env.staging`** locally with the real staging values, copying the key list from `env/.env.example`. Do not commit — the `.gitignore` catch-all `.env.*` (with `!.env.example` re-include) excludes it; verify with `git status`.
3. **No edit to `env/.env.example`** unless the key list changed (it didn't — same keys, different values).
4. **Run** `ENVIRONMENT=staging npx playwright test` to confirm the file loads — the schema parse in `config/env.ts` fails at load if any key is missing — and `env.APP_URL` resolves to the staging URL.

## Troubleshooting

| Symptom                                                                                   | Cause                                                                                                                  | Fix                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZodError` at load from `config/env.ts`, naming variables                                 | Key missing from the active `.env.${ENVIRONMENT}` file, or that file doesn't exist on disk                              | Confirm the key exists in `env/.env.${ENVIRONMENT}` (default `env/.env.dev`). Confirm the file exists. If recently added, also check `env/.env.example` for the key.       |
| Wrong environment is loaded                                                               | `ENVIRONMENT` unset, misspelled, or points at a missing file (`dotenv` is silent on missing paths)                     | Default is `dev`. Set `ENVIRONMENT=test` (or `perf`, `staging`) **in the shell** — not in an `.env` file. Confirm `env/.env.${ENVIRONMENT}` exists.                          |
| `USER_ACCESS_TOKEN_ADMIN` / `USER_ACCESS_TOKEN_FULL` not in `env/.env.example`            | These tokens are minted at runtime by an auth-bootstrap setup (Keycloak login → token), not committed                  | Do not add them to `env/.env.example`. Confirm the auth-bootstrap setup ran (login.setup.ts / equivalent) — `tokens.admin()` throws "… is not set — did the setup project run?" when it didn't. For 403 tests while `USER_ACCESS_TOKEN_ZERO` is not provisioned, comment the test out with `// TODO: FIXME: <TICKET>` — never a conditional `test.skip`. |
| TypeScript: `process.env.X` is `string \| undefined`                                      | Code reads `process.env` outside `config/env.ts`; Node types every value as optional                                   | Read `env.X` / `tokens.x()` instead — see `type-safety` § Environment variables. Existing `!`, `as string`, `?? "default"` reads at call sites are drift; migrate on next touch. |
| Self-signed certificate errors | TLS validation enabled | If an override is already set above the dotenv call for an admin client, do not remove it without auditing that client. Prefer trusting the certificate. |
| Accidentally committed `env/.env.dev` (or `.env.test`, `.env.perf`)                        | `.gitignore` rule didn't catch it (e.g. file added with `-f`)                                                          | `git rm --cached env/.env.dev`; verify `.gitignore` covers `env/.env.dev` and `.env.*` (with `!.env.example`); rotate every credential exposed in the file.              |
| New config property has no JSDoc and review is blocking                                    | `appConfig` properties are currently undocumented; the contract for **new** properties is JSDoc                        | Add a one-line JSDoc naming the backing env var: `/** <description> — loaded from <ENV_VAR> env variable */`. While here, JSDoc the surrounding properties too.            |
| Trying to add an endpoint path or message string to `config/`                              | Paths do belong in `config/app.ts`, but in the in-source catalog (`appConfig.api`, `appConfig.paths`), never as env-driven values or enums; messages are `enums/app/*` | Use `appConfig.api.*` / `appConfig.paths.*` for path strings, `enums/app/*` for message/suite/status constants. `config/` is for env-driven values, not strings.            |
| `process.env.APP_JOBS_PATH ?? appConfig.paths.JOBS` pattern in a new PR                    | Runtime env override of a config catalog value — not a sanctioned pattern                                              | Pick one source. Either the path is config-driven (`appConfig.paths.JOBS`) or env-driven (rare, justify) — never both with a runtime fallback. The existing one at `pages/app/JobsPage.ts:73` is drift, not precedent. |

## See Also

- **`enums` skill** — suite names, statuses, and UI strings (messages, labels, titles). `config/` holds env-driven values plus the path catalog (`appConfig.api.*`, `appConfig.paths.*`); endpoint paths and routes stay in config and are never moved into `enums/`.
- **`type-safety` skill** — § Environment variables owns the access rules (`env` / `tokens` from `config/env.ts`, no `process.env` anywhere else); this skill defers to it.
- **`api-testing` skill** — which env vars API tests consume (`API_URL`, `USER_ACCESS_TOKEN_ADMIN`, `USER_ACCESS_TOKEN_FULL`, `USER_ACCESS_TOKEN_ZERO`, `MAILPIT_URL`) and the 403 token-guard pattern.
- **`data-strategy` skill** — when a value is *static test data* (boundary integers, invalid uuids) vs *env-driven configuration*.
- **`refactor-values` skill** — workflow for changing the value of an existing env var, enum value, or static test-data constant across the codebase.
- **`debugging` skill** — when `config/env.ts` fails at load or a token accessor throws, when CI reads different env values than local, or when navigation fails because `APP_URL` is wrong.
- **`~/.claude/CLAUDE.md`** — root orchestrator. The "no hardcoded secrets / IDs" and "no hardcoded test content" entries in the WON'T table are this skill's pair on the rules side.
