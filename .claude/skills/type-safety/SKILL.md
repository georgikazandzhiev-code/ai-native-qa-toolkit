---
name: type-safety
version: 1.0.0
description: TypeScript strict-mode discipline — no any/casts/@ts-ignore, explicit return types on exports, Zod 3 patterns (z.strictObject, uuid/email/url), the expect(Schema.parse(body)).toBeTruthy() idiom, and the process.env.X! access rule. Use when authoring or reviewing any .ts file handling types, schemas, or env access. Triggers — "any", "Zod", "strictObject", "process.env". Not for per-resource schema shapes (api-testing) or env declaration (config).
metadata:
  category: domain
---

# Type Safety

This skill teaches the going-forward TypeScript and Zod conventions for the framework. The codebase mixes patterns today; rules below are the target, and drift is called out where it exists. Do not pre-emptively bulk rewrite; migrate when the file is next touched.

## Critical

- **NEVER** use `any`, `: any` parameters, `as any`, or `@ts-ignore` / `@ts-expect-error` to silence the type checker. `tsconfig.json` has `"strict": true` and `"noImplicitAny": true` for a reason — that surface is the contract.
- **NEVER** use `as T` or `as unknown as T` to cross a type boundary. If the value's shape is unknown, type it as `unknown` and narrow via `Schema.parse(...)` or a type guard.
- **ALWAYS** define new API schemas with `z.strictObject({...})`. `z.object()` silently strips unknown keys and hides contract drift; the strict migration is essentially complete (the few remaining lax schemas are intentional — see § Zod schema patterns), so a new lax `z.object` schema is a regression (per `api-testing` § Zod schema conventions).
- **ALWAYS** assert API responses with the exact pattern `expect(SchemaName.parse(body)).toBeTruthy();`. Type generics on `apiRequest<T>()` alone are insufficient (no runtime check). A bare `Schema.parse(body)` with no `expect(...).toBeTruthy()` wrapper is also insufficient.
- **ALWAYS** specify explicit return types on exported and public functions (`Promise<void>`, `Promise<UserResponse>`, `Locator`, `string`). Parameter types are mandatory — `noImplicitAny` enforces it; never silence it.
- **`process.env.X` access — canonical pattern is `!` at every access point.** Matches the upstream reference framework (162 occurrences, zero `??` defaulting). `??` and `||` defaulting at call sites are **forbidden**; defaults belong in `config/util/<service>.ts`, not at call sites. `as string` is **forbidden**. Bare `string | undefined` past the call site is **forbidden**. See § process.env access patterns.
- **NEVER** use `z.any()` to make a parse error go away — that's hiding contract drift. Investigate the divergence and `test.skip` with `// FIXME:` per the `api-testing` skill.
- **This codebase uses Zod 3** (`^3.25.23`). Use chained string-format validators (`z.string().uuid()`, `z.string().email()`, `z.string().url()`). The Zod 4 top-level forms (`z.uuid()`, `z.email()`) do not apply here.

## process.env access patterns

`process.env.X` is typed `string | undefined` by Node. The **canonical pattern in this framework is `!` (non-null assertion) at the access point** — matching the reference framework `the upstream reference framework`, which uses `!` for ~162 access points and zero `??` defaulting at call sites. Everything else is forbidden.

### Canonical — `!` at the access point

Use for every required env var. The test cannot run without the value (URLs, tokens, credentials, realm names, tenant ids), so crashing loudly at startup with a clear "Cannot read properties of undefined" is the desired behaviour — better than masking a missing var with a fake default.

```typescript
const apiUrl = process.env.API_URL!;
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD!;
```

Existing precedent (38 occurrences): `helpers/util/keyCloak.ts` (`keycloakURL`, `realmName`, `keycloakClientId`, `keycloakClientSecret`), `tests/app/login.setup.ts` (`APP_MAIN_EMAIL`, `KEYCLOAK_REALM`, `APP_FULL_PERMISSIONS_*`, etc.). This is also upstream's pattern across `tests/`, `helpers/`, and `fixtures/` — the framework convention.

### Forbidden — `??` defaulting at the call site

```typescript
// ❌ FORBIDDEN — defaulting belongs in the config object, not at the call site
const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";
```

If a default genuinely makes sense for a service (e.g. local Mailpit), it lives in **`config/util/<service>.ts`** as the property's fallback — not at every call site. The call site reads `mailpitConfig.url` and trusts the config object to have resolved the default once. This matches upstream (zero `??` defaulting at call sites) and keeps the env-resolution boundary in one place.

Existing `??` instances (6, all in `playwright.config.ts`) are bordering-on-acceptable because that file IS the config boundary. New code does not add `??` at call sites in `helpers/`, `tests/`, `fixtures/`, or `pages/`.

### Forbidden — `||` defaulting

```typescript
// ❌ FORBIDDEN — same problem as ??, plus empty-string footgun
const mailpitUrl = process.env.MAILPIT_URL || "http://localhost:8025";
```

`||` falls through on every falsy value including `""` — surprising for env vars where empty-string is a deliberate "set to nothing" signal. 9 instances exist in the codebase today (`helpers/util/mailpit.ts`, `config/util/mailpit.ts`, `helpers/util/keyCloak.ts:29-30`, `fixtures/api/mailpit-fixture.ts:8-9`) — drift; remove the defaulting and move the fallback into `config/util/<service>.ts` on next touch. Upstream has only 1 `||` instance.

### Forbidden — `as string`

```typescript
// ❌ FORBIDDEN — lies to TypeScript, masks a missing var
const baseURL = process.env.API_URL as string;
```

The cast pretends the value is always a string when it's actually `string | undefined`. Downstream code crashes with a confusing `undefined`-shaped error instead of a clear "var missing" failure at the boundary. Existing instance: `fixtures/services/login-fixture.ts:4` — drift; replace with `!` on next touch.

### Forbidden — bare `string | undefined` past the call site

```typescript
// ❌ FORBIDDEN — propagates uncertainty to every consumer
export const apiUrl = process.env.API_URL;
```

Once a `string | undefined` leaves the access point, every downstream consumer must re-guard. Force the resolution at the boundary with `!`:

```typescript
// ✅ correct
export const apiUrl = process.env.API_URL!;
```

Existing instance: `config/app.ts` (every `appConfig` property is bare `process.env.X`, propagating `string | undefined` into `appConfig.baseUrl`, `appConfig.apiUrl`, etc.) — drift; tighten with `!` on next touch.

### Bare `process.env.X` at config-time

The one place bare `process.env.X` is acceptable is **inside `playwright.config.ts`** when a tool consumes the value directly (e.g. `process.env.QASE_API_TOKEN` passed straight into the Qase reporter, or `process.env.ENVIRONMENT == undefined` checked before resolving the dotenv path). Upstream uses bare access in this file too (789 occurrences, almost all in similar config-time spots). Outside `playwright.config.ts`, force resolution with `!`.

### Migration policy

Codebase today: `!` (38 — canonical), `||` (9 — drift), `??` (6 — drift outside `playwright.config.ts`), bare propagation (≥ 5 in `config/app.ts` — drift), `as string` (1 — drift).

Going-forward rule: **`!` at every access point.** Existing `??`, `||`, `as string`, and bare-propagation instances are legacy drift — migrate to `!` when the file is next touched. Do **not** open a standalone "fix env access" PR. Do **not** introduce new `??` or `||` defaulting at call sites — if you need a default, put it in `config/util/<service>.ts`.

## Zod schema patterns

This codebase uses **Zod 3** (`^3.25.23`). Patterns below match that version; Zod 4's top-level validators (`z.uuid()`, `z.email()`) do not apply here. A future Zod 4 migration is on the radar but out of scope for new code today.

### `z.strictObject()` for new schemas

```typescript
export const ProbeSchema = z.strictObject({ /* ... */ });
```

`z.object()` silently strips unknown keys; a backend that adds a new field nobody noticed will pass tests forever. `z.strictObject()` rejects unknown keys at runtime, so additive contract drift surfaces as a `ZodError` immediately. The migration is **essentially complete**: ~93 `z.strictObject` definitions across `fixtures/api/schemas/` vs 5 intentional lax ones (2 in `data.ts` `VMResponseSchema`, commented as intentional — VictoriaMetrics responses may include extra fields; 2 credential-input shapes in `util/keycloak.ts`; 1 deliberate `.passthrough()` on `TenantSchemaResponseSchema` in `tenant-schema.ts`). Do not add new lax `z.object` schemas.

### Chained string-format validators (Zod 3)

| Field | Validator |
|-------|-----------|
| UUID | `z.string().uuid()` |
| Email | `z.string().email()` |
| URL | `z.string().url()` |
| Datetime (ISO) | `z.string().datetime()` |
| Integer | `z.number().int()` |
| Non-empty string | `z.string().min(1)` |

Default ids to `z.string().uuid()`; only loosen to `z.string()` when the API has been verified to return a non-UUID id (rare; document inline). Many existing `id: z.string()` fields are drift — tighten on next touch.

### The exact response-validation idiom

This is the contract. Three things must be present:

```typescript
const { status, body } = await apiRequest<ProbeResponse>({ /* ... */ });
expect(status).toBe(200);
expect(ProbeResponseSchema.parse(body)).toBeTruthy();
```

- The `<ProbeResponse>` generic gives compile-time safety on `body`.
- `Schema.parse(body)` validates the shape at runtime.
- The `expect(...).toBeTruthy()` wrapper makes the parse a Playwright assertion (so the failure is reported as a test failure, not a thrown exception that bypasses Playwright's reporting). A bare `Schema.parse(body)` with no wrapper is insufficient.

For 204 / empty-body responses, do not call `.parse()` on `null`; use `expect(body).toBeNull()` instead. For 401, use `GatewayErrorSchema`; for 400/404/409, use `APIErrorSchema`. See `api-testing` § Error envelopes.

### Optional / nullable

Defer to the `api-testing` skill's strictness ladder (§ Zod schema conventions, item 9). Lazy `.optional()` / `.nullable()` hides regressions; every modifier requires a named condition AND a verification test that exercises the branch.

### No response-envelope factory

This codebase has **no** `createApiResponseSchema` factory. Each resource file under `fixtures/api/schemas/app/` declares its own schemas. The shared shapes (`PageInfoSchema`, `APIErrorSchema`, `JSONSchemaResponseSchema`) live canonically in `fixtures/api/schemas/util/common.ts` — import from there. `GatewayErrorSchema` is not yet centralized (strict local copies in `tenant.ts` / `user.ts` / `policy.ts`); a few legacy local `APIErrorSchema` copies also remain. See `api-testing` § Architecture map and § Error envelopes.

## No `any`, no unsafe casts

`tsconfig.json` enables `"strict": true` and `"noImplicitAny": true`. The discipline that follows:

- **`unknown`** is the right type at a boundary (network response, file read, JSON parse). Convert to a concrete type via `Schema.parse(raw)` or a type guard. Never leave `unknown` flowing past a single function.
- **No `as T`** to silence a compile error. The cast doesn't validate; it just lies. Replace with `Schema.parse(raw)` and let Zod produce the typed result.
- **Explicit return types** on exported and public functions. `Promise<void>`, `Promise<UserResponse>`, `Locator`, `string`. TypeScript can infer many of these — explicit annotations document the contract and surface breaking changes earlier.
- **Explicit parameter types.** Never rely on contextual inference; a future refactor will drop the context and the function silently becomes `any`-typed.

```typescript
// ❌ unsafe — no runtime check, type is a lie
const user = (await response.json()) as UserResponse;

// ✅ unknown at boundary, parse to concrete type
const raw: unknown = await response.json();
const user = UserResponseSchema.parse(raw);
```

When you reach for `as`, ask: *"Can I parse with Zod here instead?"* The answer is almost always yes.

## Anti-patterns

- ❌ `: any` typed parameters or returns. Use `unknown` at boundaries, concrete types inside.
- ❌ `as T` or `as unknown as T` to silence the type-checker. Parse the value with Zod and let the schema produce the type.
- ❌ `@ts-ignore` / `@ts-expect-error` without a linked tracking comment AND a real plan to remove. None should exist in the codebase today (`grep` returns zero); keep it that way.
- ❌ `process.env.X as string` — lies to TypeScript; use `!`. Sole instance today: `fixtures/services/login-fixture.ts:4`.
- ❌ `process.env.X` propagated bare as `string | undefined` past the access point. Sole hotspot today: `config/app.ts` (every `appConfig` property).
- ❌ `process.env.X ?? "default"` defaulting at the call site — defaults belong in `config/util/<service>.ts`, not at call sites. Existing instances in `playwright.config.ts` are bordering-on-acceptable (config-boundary file); new code does not add `??` defaulting elsewhere.
- ❌ `process.env.X || "default"` — same problem as `??`, plus empty-string footgun. Use `!` and put the default (if any) in the config object.
- ❌ `z.object()` for **new** schemas. Use `z.strictObject()`.
- ❌ `id: z.string()` defaulting where the API returns a UUID. Use `z.string().uuid()`.
- ❌ Bare `Schema.parse(body)` without the `expect(...).toBeTruthy()` wrapper. The wrapper is the assertion shape Playwright recognizes.
- ❌ Asserting only `status` (skipping `Schema.parse(body)`) or only `Schema.parse(body)` (skipping `status`) on a happy-path response.
- ❌ `z.any()` to make a parse error go away. That's hiding contract drift; route through `api-testing` § Skipping a test for a real backend bug.
- ❌ Implicit `any` from missing type annotations on exported function parameters or returns. `noImplicitAny` catches some cases; do not silence it.
- ❌ `expect(body.id).toBeTruthy()` / `expect(body.name).toBeDefined()` after `Schema.parse(body)`. The schema already proved every field exists with the right type; only assert business-logic values (per `~/.claude/CLAUDE.md` WON'T row "No redundant assertions after Zod parse").

## Self-review checklist

- [ ] No `any`, `: any`, `as any`, `@ts-ignore`, or `@ts-expect-error` introduced.
- [ ] No `as T` / `as unknown as T` casts. Where I needed to cross a type boundary, I parsed with Zod or used a type guard.
- [ ] Every exported / public function has an explicit return type.
- [ ] Every parameter has an explicit type.
- [ ] New Zod schemas use `z.strictObject({...})`. Touched legacy `z.object({...})` files were converted in the same edit.
- [ ] `id` fields default to `z.string().uuid()` unless the API has been verified to return non-UUIDs (documented inline).
- [ ] API responses on the happy path are asserted with the exact pattern `expect(SchemaName.parse(body)).toBeTruthy();` plus a `status` assertion. No bare `Schema.parse(body)`.
- [ ] Empty-body 204/403/405 responses use `expect(body).toBeNull()` instead of calling `.parse()` on `null`.
- [ ] Every `process.env.X` access uses `!`. No `??` / `||` defaulting at the call site (defaults belong in `config/util/<service>.ts`). No `as string`. No bare `string | undefined` past the call site.
- [ ] If the file already had `as string` or bare propagation that I did not touch, I left it alone (legacy drift; migrates on next touch).
- [ ] No `z.any()` added to silence a `ZodError`. Real divergences route through `api-testing` § Skipping a test for a real backend bug.
- [ ] No `prettier/prettier` errors remain (4-space indent, single quotes, trailing commas). Run `npx eslint --fix <file>` if the file shows formatting errors — never commit with wrong Prettier settings.
- [ ] Linter (`npx eslint`) and `tsc --noEmit` clean for changed files.

## Examples

### Example 1 — Adding a new env var consumed by a helper

User says: *"Add a `GRAFANA_API_TOKEN` for a perf-runs annotation helper."*

1. **Use `!` at the access point** — the canonical pattern. Crashing loudly at startup if the var is missing is the desired behaviour, matching the framework convention (and upstream).
2. **Declare the env var** per the `config` skill (`env/.env.example` blank entry, real value in `env/.env.${ENVIRONMENT}`).
3. **Consume at the call site:**

   ```typescript
   const grafanaToken = process.env.GRAFANA_API_TOKEN!;
   ```

4. **Do not propagate bare.** Do not write `export const grafanaToken = process.env.GRAFANA_API_TOKEN` and let `string | undefined` flow into the helper — that forces every consumer to re-guard.
5. **What about a default URL** (e.g. local Grafana)? **The default belongs in `config/util/grafana.ts`**, not at the call site. Author `grafanaConfig.url = process.env.GRAFANA_URL!` plus the dotenv loading; if a default is genuinely needed for local dev, it's an env-file `.env.dev` value, not a `??` fallback at the call site. Forbidden: `process.env.GRAFANA_URL ?? "http://localhost:3000"`.

### Example 2 — Authoring a new Zod schema for a new endpoint

User says: *"Add `POST /synthetics/:id/pause` and validate the response."*

1. **Where the schema lives.** `fixtures/api/schemas/app/synthetic.ts` — one file per resource, no factory. Re-export from `fixtures/api/schemas/app/index.ts` (per `api-testing` § Zod schema conventions).
2. **Use `z.strictObject()`** for the new schema. Match the existing response shape catalog: `{ <resource>Id: string, status: ... }`.

   ```typescript
   export const PauseSyntheticResponseSchema = z.strictObject({
     syntheticId: z.string().uuid(),
     status: z.string(),
   });
   export type PauseSyntheticResponse = z.infer<typeof PauseSyntheticResponseSchema>;
   ```

3. **`id` is `z.string().uuid()`**, not `z.string()`. Tighten by default; loosen only with verified evidence.
4. **Assert the response with the exact pattern:**

   ```typescript
   const { status, body } = await apiRequest<PauseSyntheticResponse>({ /* ... */ });
   expect(status).toBe(200);
   expect(PauseSyntheticResponseSchema.parse(body)).toBeTruthy();
   ```

5. **No `createApiResponseSchema`.** This codebase has no factory; each resource declares its own schemas. Reuse shared shapes (`APIErrorSchema`, `PageInfoSchema`) by importing — never duplicate.

### Example 3 — Fixing a `string | undefined` propagation

User says: *"`appConfig.apiUrl` is typed `string | undefined` and downstream callers all guard. Tighten it."*

1. **Open `config/app.ts`.** Today: `apiUrl: process.env.API_URL`.
2. **Apply the canonical pattern — `!`.** Required env var; crash loudly at startup if missing.

   ```typescript
   apiUrl: process.env.API_URL!,
   ```

3. **JSDoc the property** in the same edit (per the `config` skill — touching the file is the trigger to backfill JSDoc on the surrounding properties too).
4. **Remove downstream guards** that existed only to handle the `undefined` case. They become dead code once the property is `string`.
5. **What I did *not* do:** I did not write `process.env.API_URL as string`. The cast pretends the value is always a string but does not actually check; if `API_URL` is missing, the test now crashes deep in a request handler with a confusing URL-construction error instead of clearly at startup.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| TypeScript: `Type 'string \| undefined' is not assignable to type 'string'` on a `process.env.X` value | Wrong access pattern at the boundary | Use `!` at the access point (the canonical pattern, matching upstream). Do **not** `as string`. Do **not** bare-propagate. Do **not** add `??` defaulting at the call site — if a default is genuinely needed, put it in `config/util/<service>.ts`. |
| `expect(Schema.parse(body)).toBeTruthy()` throws `ZodError` | API response disagrees with the schema (extra/missing field, wrong type, wrong nullability) | Treat as a contract violation. Keep the schema strict; `test.skip` with `// FIXME: <ticket>` and `eslint-disable playwright/no-skipped-test`. **Do not** loosen the schema or replace fields with `z.any()`. Route through `api-testing` § Skipping a test for a real backend bug. |
| `Schema.parse(body)` throws `ZodError` on a 401 / 403 test | 401 has a body (`{ error: string }`); 403/405 have empty bodies (`null`) | Use `GatewayErrorSchema` for 401, `expect(body).toBeNull()` for 403/405. See `api-testing` § Error envelopes. |
| "I need to silence a compile error with `as unknown as T`" | The value's real shape isn't known — that's why the cast was tempting | Replace with `Schema.parse(raw)`. You get runtime validation + a real type, instead of a lie. If no schema exists, author one (it's contract documentation). |
| "I need `any` to make this generic helper compile" | The generic constraint is too loose | Use `unknown` at the input, narrow with a type guard or `Schema.parse(...)`, return a concrete type. `any` poisons every consumer. |
| `z.object()` schema accepts a body that's missing fields the API actually returns | `z.object()` strips unknown keys silently; the missing-field side may also be from a separate cause, but `z.object()` masks the additive case | Convert the schema to `z.strictObject()`. Re-run; if a `ZodError` surfaces, you have evidence of contract drift to file. |
| `process.env.X || "default"` returns the default when `X=""` is set explicitly | `||` falls through on every falsy value, including empty string and `0` — and defaulting at the call site is wrong shape regardless | Replace with `process.env.X!` at the call site. If a default is genuinely needed, put it in `config/util/<service>.ts` as the property's fallback (or in the env file for the relevant environment). Do **not** "fix" `||` by switching to `??`; both patterns are forbidden at call sites. |
| Persistent "ESLint errors in modified files" Cursor notification after every agent turn | Cursor's "Iterate on Lints" feature auto-sends lint errors. Files may already be clean (`npx eslint` exits 0). | Disable in Cursor Settings: `Cmd+,` → Features → Chat → "Iterate on Lints" → OFF. If files genuinely have `prettier/prettier` errors, run `npx eslint --fix <file>` once. |

## See Also

- **`api-testing`** — schema conventions by resource (where each schema lives, the strictness ladder for `.optional()` / `.nullable()`, the response-shape catalog, the no-factory rule, the response-validation idiom in spec context).
- **`config`** — env var declaration (`env/.env.example`, dotenv loading, `appConfig` shape). This skill owns the `process.env.X` *access* pattern; `config` defers to it.
- **`enums`** — the `as const` going-forward rule (this skill aligns with it; new constants use `as const`, legacy TS `enum` migrates on next touch).
- **`data-strategy`** — Faker usage for unique-per-run values; static JSON for fixed constants.
- **`refactor-values`** — workflow when an enum value, route constant, or static `test-data/` value needs to change across the codebase.
- **`debugging`** — when a `ZodError` or unexpected `string | undefined` surfaces at runtime instead of compile time.
- **`~/.claude/CLAUDE.md`** — orchestrator. The MUST rows on Type Safety, Schemas, Response Validation, and Sources of Truth, plus the WON'T row "No `any`", are this skill's pair on the rules side.
