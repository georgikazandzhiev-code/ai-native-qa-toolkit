---
name: config
description: Env-var and configuration conventions — env/.env.* layout, dotenv loading via ENVIRONMENT, the appConfig object in config/app.ts (URLs, api paths, UI routes, timeouts), and the config/util/ per-service convention (future — not yet created). Use when adding an env var, config property, environment file, or endpoint/route constant. Triggers — "env var", "appConfig", "config", "new URL". Not for static test data (data-strategy) or the process.env.X! call-site idiom (type-safety).
metadata:
  category: domain
---

# Configuration

## Critical

- **NEVER** hardcode URLs, tokens, emails, passwords, or tenant ids anywhere in `pages/`, `tests/`, `fixtures/`, or `helpers/`. The single source of truth for env-driven values is `process.env.*`, backed by `env/.env.${ENVIRONMENT}` and declared in `env/.env.example`.
- **NEVER** add real domains, real secrets, or production URLs to `env/.env.example`. Only `env/.env.example` is tracked; all other `env/.env.*` files are gitignored (see `.gitignore` — `env/.env.dev`, `env/.env.local`, `env/.env.prod`, plus the catch-all `.env.*` with `!.env.example`).
- **ALWAYS** add every new env variable to `env/.env.example` with the key but a blank or placeholder value, in the correct grouped section (`KEYCLOAK CONFIGURATION`, `UI TEST USERS`, `API TEST USERS`, `QASE REPORTING`, `MAILPIT`).
- **ALWAYS** keep app-facing URLs/settings as properties of `appConfig` in `config/app.ts`. For utility / third-party service config, the convention is `config/util/<service>.ts` exporting `<service>Config` — **note: `config/util/` does not exist yet**; today the only utility service (Mailpit) reads `process.env.MAILPIT_URL` directly in `helpers/util/mailpit.ts`. Create `config/util/` when the first dedicated util config is warranted. Do not invent ad-hoc config files elsewhere.
- **NEVER** put endpoint paths, route strings, or message constants in env vars. They live in `appConfig.api.*` / `appConfig.paths.*` (the in-source path catalog) and `enums/app/*` — see the `enums` skill. `config/` is for env-driven values and the path catalog only.
- **NEVER** declare `ENVIRONMENT` itself inside any `.env` file. It is set at the **shell** level (`ENVIRONMENT=test npx playwright test`); declaring it in a `.env` file creates a chicken-and-egg loop because the file is selected *by* `ENVIRONMENT`.
- **ALWAYS** carry JSDoc on every property of `appConfig` (and any future util configs) describing the value and naming the backing env var. The current `appConfig` properties are undocumented — that is drift to close. **Backfill JSDoc on the surrounding properties whenever you touch the file**, even if your change only adds or modifies one property; do not leave the file in a half-documented state.
- **NEVER** introduce a runtime `process.env.X ?? appConfig.foo` override pattern in pages, helpers, or fixtures (see `pages/app/SyntheticsPage.ts:73` for the existing one). If a path needs to be configurable, model it as either a config property OR an env var — not both. Surface ambiguity rather than encode it.

## File Locations

| Type           | Directory / File                  | Purpose                                                                 |
| -------------- | --------------------------------- | ----------------------------------------------------------------------- |
| App config     | `config/app.ts`                   | `appConfig` — env-driven URLs (`baseUrl`, `apiUrl`, `keycloakUrl`), `tenantId`, `keycloakRealm` (from `KEYCLOAK_REALM`), the in-source path catalog (`appConfig.api`, `appConfig.paths`), and infra timeouts (`appConfig.timeouts`) |
| Utility config | `config/util/<service>.ts`        | One file per third-party / utility service. **Future convention — the directory does not exist yet**; Mailpit currently reads `MAILPIT_URL` directly in `helpers/util/mailpit.ts` |
| Env template   | `env/.env.example`                | Tracked template — keys only or safe placeholders, grouped by section header |
| Env (active)   | `env/.env.${ENVIRONMENT}`         | Real values, selected at runtime. Today: `.env.dev` (default), `.env.test`, `.env.perf`. All untracked |
| Env loader     | `playwright.config.ts` (top of file) | `dotenv.config({ path })` reads `./env/.env.${ENVIRONMENT}` (default `dev`) |
| Gitignore      | `.gitignore`                      | `env/.env.dev`, `env/.env.local`, `env/.env.prod`, `.env`, `.env.*` ignored; `!.env.example` re-included |

## How env files load

`playwright.config.ts` resolves the path at startup as `./env/.env.${process.env.ENVIRONMENT}`, defaulting to `./env/.env.dev` when `ENVIRONMENT` is unset, then calls `dotenv.config({ path })`. Consequences:

- Default environment is `dev` (`env/.env.dev`).
- Override at the shell: `ENVIRONMENT=test npx playwright test` or `ENVIRONMENT=perf npx playwright test`.
- The selected file must exist on disk. `dotenv` does **not** error on a missing file — it silently loads nothing, and every `process.env.*` becomes `undefined`. A test that goes red with `Cannot read properties of undefined` is usually this.
- `ENVIRONMENT` is read **before** dotenv runs, so it must come from the shell — never from a `.env` file.
- **CI variable precedence.** `dotenv.config()` does **not** overwrite `process.env` keys that already exist. CI platforms (Bitbucket repository variables, GitHub Actions secrets/variables) inject their values *before* `playwright.config.ts` runs, so those values win over anything in the `.env` file. This means: if `API_URL` is set as a Bitbucket repository variable, the value in `env/.env.test` is ignored — even when `ENVIRONMENT=test`. To verify which values are active in CI, check the pipeline's repository/deployment variable settings, not the `.env` file. For local runs, `process.env` is empty before dotenv, so the `.env` file is the sole source.
- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` is set above the dotenv call to allow self-signed certs for the Keycloak admin client. Do not remove it without checking `helpers/util/keyCloak.ts`.

## Decide where the new value belongs

Before adding anything, walk this table. If the value fits no row, stop and ask — do not invent a new config file.

| Value kind                                                      | Home                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| URL of the app under test (frontend, API, Keycloak)             | env var + property on `appConfig` in `config/app.ts`                        |
| URL of a utility / third-party service (Mailpit, future tools)  | env var + property on the matching `<service>Config` in `config/util/<service>.ts` (create the directory with the first such file; today Mailpit reads `MAILPIT_URL` inline in `helpers/util/mailpit.ts`) |
| Credential (email, password, secret key, client secret)         | env var only — **never** expose through a config object                     |
| Test-user identifier (`TENANT_ID`)                              | env var + plain `appConfig.tenantId` slot (already wired)                   |
| Dynamic auth token populated at runtime (`USER_ACCESS_TOKEN_*`) | env var consumed via `process.env.*` — populated by an auth-bootstrap helper / setup project, **not** declared in `env/.env.example` |
| Endpoint path (e.g. `/synthetics`) or route (e.g. `/login`)     | `appConfig.api.*` or `appConfig.paths.*` in `config/app.ts`, or `enums/app/*` — **never** an env var |
| Message string, suite name, role, status                        | `enums/app/*` or `enums/util/*` — see the `enums` skill                     |
| Timeout / retry (Playwright-level)                              | `playwright.config.ts`. Cross-cutting timeouts already live in `appConfig.timeouts` (`navigation`, `element`, `api`) |
| Static test constant (boundary values, invalid ids)             | `test-data/app/*.json` — see `data-strategy` skill                          |
| Runtime selector (`ENVIRONMENT`, `CI`, `QASE_REPORT`)           | Shell-level env var only — **never** in `env/.env.example`                  |

## Adding a new env variable

1. **Pick the section** in `env/.env.example` that matches the value: `KEYCLOAK CONFIGURATION`, `UI TEST USERS`, `API TEST USERS`, `QASE REPORTING`, `MAILPIT`. Add a new section header (matching the existing `═══` style) only if no section fits.
2. **Add the key with a blank or safe placeholder value.** The codebase's convention is `KEY=` (blank) for credentials/URLs and `KEY=<literal>` for non-secret defaults like `KEYCLOAK_REALM=<realm>`. Never paste a real domain, token, or password into `.env.example`.
3. **Add the real value to your local `env/.env.${ENVIRONMENT}` file** (`.env.dev` for local default, `.env.test` for CI, `.env.perf` for perf runs). These files are gitignored — confirm with `git status` before committing.
4. **Reference it from code:**
   - If it's a URL the app config object should document, add a property to `appConfig` (or the matching util config). JSDoc the property and name the backing env var.
   - If it's a credential or per-test token, consume it inline as `process.env.X` from the helper / fixture that needs it. **Do not** surface credentials through `appConfig`.
5. **Use `!` at the access point** per the `type-safety` skill (the canonical pattern, matching the upstream reference framework). Forbidden: `??` / `||` defaulting at call sites, `as string`, bare `string | undefined` propagation. If a service genuinely needs a default URL (e.g. local Mailpit), put the default in `config/util/<service>.ts` as the property's resolution, not at the call site.

## Adding a new config property

1. **Pick the file:** app-facing → `config/app.ts` (`appConfig`); utility / third-party service → `config/util/<service>.ts` (no such file exists yet — creating one establishes the directory). New utility services get a new file, not a shared `util.ts`.
2. **Add the property** alongside the existing ones. Match the surrounding shape — top-level for env-driven scalars (`baseUrl`, `apiUrl`, `tenantId`), nested under a sub-object for catalogs (`paths`, `api`, `timeouts`).
3. **JSDoc the property** with one short line naming the backing env var or describing the constant — **and** backfill JSDoc on the surrounding properties in the same edit. The contract is "every property carries JSDoc"; touching the file is the trigger to close the gap. Shape:

   ```typescript
   /** Frontend application URL — loaded from APP_URL env variable */
   baseUrl: process.env.APP_URL!,
   ```

   The `!` (non-null assertion) is mandatory per `type-safety` skill — required env vars must crash loudly at startup if missing. Defaults belong in `config/util/<service>.ts`, not at call sites; never use `??` here.

4. **Consume it from the call site** by importing the config object. `appConfig.timeouts.navigation`, `appConfig.paths.HOME`, `appConfig.api.SYNTHETICS` are the existing precedent.

## Anti-patterns

- ❌ Hardcoding `https://...` URLs, real emails, passwords, or uuid tenant ids inside `tests/`, `pages/`, `helpers/`, or `fixtures/`. (Hardcoded test content has its own ban under `~/.claude/CLAUDE.md` WON'T table — this skill owns the env-and-config side of the same rule.)
- ❌ Adding a key to `env/.env.example` with a real value (real domain, real token, real password). The template tracks the **shape**, never the secrets.
- ❌ Adding `ENVIRONMENT=dev` (or any value of `ENVIRONMENT`) inside an `.env` file. `ENVIRONMENT` is the selector; it must come from the shell.
- ❌ Creating a new `config/util/util.ts` aggregating multiple services. The convention is one file per service (`config/util/<service>.ts`), even though no util config file exists yet.
- ❌ Surfacing credentials (`APP_FULL_PERMISSIONS_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, secret keys) through `appConfig`. Credentials stay env-only.
- ❌ Adding `USER_ACCESS_TOKEN_*` or any other dynamically-minted token to `env/.env.example`. Those tokens are populated at runtime by setup helpers, not declared as static env values.
- ❌ Putting endpoint paths or message strings in env vars or hand-rolling them into `process.env.*`. Paths live in `appConfig.api.*` / `appConfig.paths.*` or `enums/app/*`.
- ❌ Adding or modifying a config property without JSDoc, OR leaving surrounding properties un-JSDoc'd when you touched the file. Touching the file is the trigger to backfill the un-JSDoc'd neighbours; do not leave it half-documented.
- ❌ Redeclaring an env var twice for the same value (once on `appConfig`, once read inline in a helper). Pick one and stick to it inside a given file.
- ❌ Adding a `process.env.X ?? appConfig.foo` runtime override. `pages/app/SyntheticsPage.ts:73` has one (`process.env.APP_SYNTHETICS_PATH ?? appConfig.paths.SYNTHETICS`); it should not be propagated. Either make the value config-driven or env-driven, never both.
- ❌ Committing `env/.env.dev`, `.env.test`, `.env.perf`, or `.env.local`. They're in `.gitignore`; if `git status` ever shows one staged, unstage and rotate any credentials that appeared.
- ❌ Resetting Keycloak admin passwords (`platform-admin`, `<realm>-admin`) from the QA automation toolchain or Keycloak UI without coordinating with DevOps. The backend reads the password from a Kubernetes secret; a Keycloak-side reset creates a mismatch that causes 500 errors until the secret is updated and the pod restarted. **Always ask DevOps to rotate both sides together.**

## Self-review checklist

Before declaring a config or env-var change done:

- [ ] New env variable appears in `env/.env.example` with a blank/placeholder value, in the correct section.
- [ ] Real value lives in your local `env/.env.${ENVIRONMENT}` and is **not** staged in git (`git status` clean for `env/`).
- [ ] If the variable is a URL or non-credential setting documented through a config object, the matching `appConfig` (or util config) property exists and carries a JSDoc line naming the backing env var. **Surrounding properties in the same file are also JSDoc'd** — touching the file is the trigger to backfill.
- [ ] No credential is exposed through `appConfig` or any util config object.
- [ ] No endpoint path, route string, or message constant was added as an env var.
- [ ] No `process.env.X ?? appConfig.foo` runtime-override pattern was introduced.
- [ ] `ENVIRONMENT` is set at the shell, not declared in any `.env` file.
- [ ] If a credential was rotated or exposed, it was rotated upstream (Keycloak, Qase, Mailpit) before the PR opens.
- [ ] The change does not duplicate an existing config property or env var (grepped `config/`, `env/`, `process.env.` before adding).
- [ ] Linter passes for `config/app.ts`, any modified `config/util/*.ts`, and the consumers.

## Examples

### Example 1 — Adding a third-permissions-tier API user (`APP_READONLY_PERMISSIONS`)

User says: *"Add a read-only test user so we can prove 403 on write endpoints from a non-admin/non-zero token."*

1. **Decide where it belongs.** It's an API test user — credential triple (`EMAIL`, `PASSWORD`, `SECRET_KEY`), env-only. No `appConfig` slot.
2. **Edit `env/.env.example`.** Under the `API TEST USERS` section, add three blank keys:
   ```
   APP_READONLY_PERMISSIONS=
   APP_READONLY_PERMISSIONS_PASSWORD=
   APP_READONLY_PERMISSIONS_SECRET_KEY=
   ```
3. **Add the real values to `env/.env.dev`** (and `.env.test` for CI). Confirm `git status` does not show those files as modified-and-staged.
4. **Wire up token minting** in the auth-bootstrap setup that already produces `USER_ACCESS_TOKEN_ADMIN` / `USER_ACCESS_TOKEN_FULL` — the new token (`USER_ACCESS_TOKEN_READONLY`, say) is populated at runtime, **not** added to `env/.env.example`.
5. **Consume `process.env.USER_ACCESS_TOKEN_READONLY`** at the spec call site for the 403 test, guarded with `test.skip(!process.env.USER_ACCESS_TOKEN_READONLY, "READONLY token not provisioned")` until the env is fully provisioned (matches the existing `USER_ACCESS_TOKEN_ZERO` guard pattern in `api-testing`).

### Example 2 — Adding a new utility service (Grafana annotations)

User says: *"Wire up a Grafana URL so a perf-runs helper can post annotations."*

1. **Decide where it belongs.** Utility service URL → `config/util/grafana.ts` (new file — this would be the first file in `config/util/`, establishing the directory); env var `GRAFANA_URL`.
2. **Add `env/.env.example`** entry under a new `# GRAFANA` section header (or append to a sensible existing one):
   ```
   GRAFANA_URL=
   GRAFANA_API_TOKEN=
   ```
3. **Create `config/util/grafana.ts`** in the same shape as `appConfig` (env-driven scalar + path catalog):
   ```typescript
   export const grafanaConfig = {
     /** Grafana base URL — loaded from GRAFANA_URL env variable */
     apiUrl: process.env.GRAFANA_URL!,
     paths: { ANNOTATIONS: "/api/annotations" },
   };
   ```
   The `apiUrl` is env-driven, `!`-asserted (per `type-safety` skill), and JSDoc'd; the `paths` sub-object is the in-source path catalog, never env-driven (mirrors `appConfig.api`).
4. **Keep the token env-only.** `GRAFANA_API_TOKEN` is consumed inline as `process.env.GRAFANA_API_TOKEN!` from the helper that calls Grafana — **not** surfaced through `grafanaConfig`.
5. **Local `env/.env.dev`** gets the real values; `.env.test` gets the CI values.

### Example 3 — Adding a new environment file (`env/.env.staging`)

User says: *"Set up a staging environment file pointing at the staging cluster."*

1. **No code change needed in `playwright.config.ts`.** The loader already honors `ENVIRONMENT` and reads `./env/.env.${ENVIRONMENT}` — `staging` is just another value.
2. **Create `env/.env.staging`** locally with the real staging values, copying the key list from `env/.env.example`. Do not commit — the `.gitignore` catch-all `.env.*` (with `!.env.example` re-include) excludes it; verify with `git status`.
3. **No edit to `env/.env.example`** unless the key list changed (it didn't — same keys, different values).
4. **Run** `ENVIRONMENT=staging npx playwright test` to confirm the file loads and `process.env.APP_URL` resolves to the staging URL.

## Troubleshooting

| Symptom                                                                                   | Cause                                                                                                                  | Fix                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process.env.X` is `undefined` at runtime                                                 | Key missing from the active `.env.${ENVIRONMENT}` file, or that file doesn't exist on disk                              | Confirm the key exists in `env/.env.${ENVIRONMENT}` (default `env/.env.dev`). Confirm the file exists. If recently added, also check `env/.env.example` for the key.       |
| Wrong environment is loaded                                                               | `ENVIRONMENT` unset, misspelled, or points at a missing file (`dotenv` is silent on missing paths)                     | Default is `dev`. Set `ENVIRONMENT=test` (or `perf`, `staging`) **in the shell** — not in an `.env` file. Confirm `env/.env.${ENVIRONMENT}` exists.                          |
| `USER_ACCESS_TOKEN_ADMIN` / `USER_ACCESS_TOKEN_FULL` not in `env/.env.example`            | These tokens are minted at runtime by an auth-bootstrap setup (Keycloak login → token), not committed                  | Do not add them to `env/.env.example`. Confirm the auth-bootstrap setup ran (login.setup.ts / equivalent). For 403 tests, guard with `test.skip(!process.env.USER_ACCESS_TOKEN_ZERO, "...")`. |
| TypeScript: `process.env.X` is `string \| undefined`                                      | `process.env` values are always optional in Node                                                                       | See the `type-safety` skill — it owns the canonical access pattern. The codebase currently mixes `!`, `as string`, `?? "default"`, and `string \| undefined`; do not assume any one of those is correct without reading `type-safety`. |
| Self-signed cert errors against the dev cluster                                            | TLS validation enabled                                                                                                 | `playwright.config.ts` already sets `NODE_TLS_REJECT_UNAUTHORIZED = "0"` above the dotenv call for the Keycloak admin client. Do not remove without auditing `helpers/util/keyCloak.ts`. |
| Accidentally committed `env/.env.dev` (or `.env.test`, `.env.perf`)                        | `.gitignore` rule didn't catch it (e.g. file added with `-f`)                                                          | `git rm --cached env/.env.dev`; verify `.gitignore` covers `env/.env.dev` and `.env.*` (with `!.env.example`); rotate every credential exposed in the file.              |
| New config property has no JSDoc and review is blocking                                    | `appConfig` properties are currently undocumented; the contract for **new** properties is JSDoc                        | Add a one-line JSDoc naming the backing env var: `/** <description> — loaded from <ENV_VAR> env variable */`. While here, JSDoc the surrounding properties too.            |
| Trying to add an endpoint path or message string to `config/`                              | Wrong file. Paths are in-source catalog (`appConfig.api`, `appConfig.paths`) or `enums/app/*`; messages are `enums/app/*` | Use `appConfig.api.*` / `appConfig.paths.*` for path strings, `enums/app/*` for message/suite/status constants. `config/` is for env-driven values, not strings.            |
| `process.env.APP_SYNTHETICS_PATH ?? appConfig.paths.SYNTHETICS` pattern in a new PR        | Runtime env override of a config catalog value — not a sanctioned pattern                                              | Pick one source. Either the path is config-driven (`appConfig.paths.SYNTHETICS`) or env-driven (rare, justify) — never both with a runtime fallback. The existing one at `pages/app/SyntheticsPage.ts:73` is drift, not precedent. |

## See Also

- **`enums` skill** — endpoint paths, route constants, message strings, suite names. `config/` is for env-driven values; **`enums/`** is for source-controlled string catalogs. Note that `appConfig.api.*` and `appConfig.paths.*` are also string catalogs (lift to `enums/` if/when consolidating).
- **`type-safety` skill** — handling `string | undefined` from `process.env.*`. Owns the canonical access pattern; this skill defers to it.
- **`api-testing` skill** — which env vars API tests consume (`API_URL`, `USER_ACCESS_TOKEN_ADMIN`, `USER_ACCESS_TOKEN_FULL`, `USER_ACCESS_TOKEN_ZERO`, `MAILPIT_URL`) and the 403 token-guard pattern.
- **`data-strategy` skill** — when a value is *static test data* (boundary integers, invalid uuids) vs *env-driven configuration*.
- **`refactor-values` skill** — workflow for changing the value of an existing env var, enum value, or static test-data constant across the codebase.
- **`debugging` skill** — when `process.env.X` is `undefined` at runtime, when CI reads different env values than local, or when navigation fails because `APP_URL` is wrong.
- **`~/.claude/CLAUDE.md`** — root orchestrator. The "no hardcoded secrets / IDs" and "no hardcoded test content" entries in the WON'T table are this skill's pair on the rules side.
