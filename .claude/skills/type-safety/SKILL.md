---
name: type-safety
version: 1.1.1
description: TypeScript strict-mode discipline — no any/casts/@ts-ignore, explicit return types on exports, Zod 3 patterns (z.strictObject, uuid/email/url), the expect(Schema.parse(body)).toBeTruthy() idiom, and env access through the config module (never process.env at a call site). Use when authoring or reviewing any .ts file handling types, schemas, or env access. Triggers — "any", "Zod", "strictObject", "process.env". Not for per-resource schema shapes (api-testing) or env declaration (config).
metadata:
  category: domain
---

# Type Safety

This skill teaches the going-forward TypeScript and Zod conventions for the framework. The codebase mixes patterns today; rules below are the target, and drift is called out where it exists. Do not pre-emptively bulk rewrite; migrate when the file is next touched.

## Critical

- **NEVER** use `any`, `: any` parameters, `as any`, or `@ts-ignore` / `@ts-expect-error` to silence the type checker. `tsconfig.json` has `"strict": true` and `"noImplicitAny": true` for a reason — that surface is the contract.
- **NEVER** use `as T` or `as unknown as T` to cross a type boundary. If the value's shape is unknown, type it as `unknown` and narrow via `Schema.parse(...)` or a type guard.
- **ALWAYS** define new API schemas with `z.strictObject({...})`. `z.object()` silently strips unknown keys and hides contract drift; the strict migration is essentially complete (the few remaining lax schemas are intentional — see § Zod schema patterns), so a new lax `z.object` schema is a regression (per `api-testing` § Zod schema conventions).
- **ALWAYS** assert API responses with the exact pattern `expect(SchemaName.parse(body)).toBeTruthy();` (in a negative-matrix loop: `expect.soft(SchemaName.safeParse(body).success, label).toBe(true)` — the constitution's carve-out). Type generics on `apiRequest<T>()` alone are insufficient (no runtime check). A bare `Schema.parse(body)` with no `expect(...).toBeTruthy()` wrapper is also insufficient.
- **ALWAYS** specify explicit return types on exported and public functions (`Promise<void>`, `Promise<UserResponse>`, `Locator`, `string`). Parameter types are mandatory — `noImplicitAny` enforces it; never silence it.
- **NEVER** read `process.env` outside the config module. `config/env.ts` reads it once and validates it with Zod when it loads, so a missing variable stops the run at startup; everything else imports `env.X`, `tokens.admin()` or `appConfig`. No `!`, no `as string`, no `??` / `||` defaults at call sites — defaults live in the schema. See § Environment variables.
- **NEVER** use `z.any()` to make a parse error go away — that's hiding contract drift. Investigate the divergence, write the test as the contract says, and comment it out with `// TODO: FIXME: <TICKET>` per the `api-testing` skill — never `test.skip`.
- **This codebase uses Zod 3** (`^3.25.23`). Use chained string-format validators (`z.string().uuid()`, `z.string().email()`, `z.string().url()`). The Zod 4 top-level forms (`z.uuid()`, `z.email()`) do not apply here.

## Environment variables — read once, through the config module

`process.env.X` is `string | undefined`, and nothing checks it until something uses it. The framework's rule is that **only the config module reads `process.env`**, and it validates what it reads **once, when it loads** — so a missing variable stops the run at startup with every missing name listed, instead of failing deep inside a request three specs later.

### The shape

`config/env.ts` is the one file that reads `process.env`. It parses it with a Zod schema at import time and exports two things:

```typescript
// config/env.ts — the only module that reads process.env
const EnvSchema = z.object({
  API_URL: z.string().url(),
  APP_MAIN_EMAIL: z.string().email(),
  MAILPIT_URL: z.string().url().default("http://localhost:8025"),
  // …every variable the suite needs, required unless it has a real default
});
export const env = EnvSchema.parse(process.env); // throws at load, naming every missing variable

/** Tokens are written into process.env by the setup project at run time, after load. */
const token = (name: string) => (): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — did the setup project run?`);
  return value;
};
export const tokens = {
  admin: token("USER_ACCESS_TOKEN_ADMIN"),
  full: token("USER_ACCESS_TOKEN_FULL"),
  zero: token("USER_ACCESS_TOKEN_ZERO"),
};
```

(`z.object`, not `z.strictObject`, on purpose: `process.env` carries every variable of the shell, and only the suite's own keys are picked out.)

Everything else imports from it: `env.APP_MAIN_EMAIL`, `tokens.admin()`, and `appConfig` (which builds its URLs from `env`). Specs, helpers, fixtures and page objects never touch `process.env`.

### Two kinds of variable

| Kind | Examples | Read as | Why |
|---|---|---|---|
| **Static** — known when the run starts | URLs, realm, client id/secret, test-user emails and passwords, Mailpit | `env.X` | Validated at load: a missing one fails the run before any test starts |
| **Run-time** — written by the setup project | `USER_ACCESS_TOKEN_ADMIN`, `_FULL`, `_ZERO` | `tokens.admin()` / `.full()` / `.zero()`, called where the token is used | They don't exist yet when config loads, so they're checked when used, with a message that names the cause |

### Rules

- **Defaults live in the schema** (`.default(...)` in `config/env.ts`) — the one home. Never `??` or `||` at a call site.
- **No `!` and no `as string`** on env values. `!` only silences the compiler: a missing variable still fails later, at the point of use, with an unrelated error. The schema is the check.
- **No aliases at module level** (`const ADMIN_TOKEN = tokens.admin()` at the top of a spec runs before the setup project has written the token). Call `tokens.x()` where the token is used.
- **One more reader: `playwright.config.ts`.** It runs before the config module and must read `ENVIRONMENT` (which env file to load) and `CI` from the shell. Nothing else does.
- **Writes are not reads.** The setup project stores run-time tokens with `process.env.USER_ACCESS_TOKEN_X = token`; that is how `tokens.x()` finds them.
- **Presence checks belong to config too.** `if (!process.env.X) throw …` in a `beforeAll` is the schema's job (static) or the accessor's (tokens).

### Migration policy

Existing code that reads `process.env.X!` at call sites is drift — migrate a file to `env` / `tokens` when you next touch it. The lint rule `no-process-env-outside-config` reports every `process.env` access outside `config/`.

## Zod schema patterns

This codebase uses **Zod 3** (`^3.25.23`). Patterns below match that version; Zod 4's top-level validators (`z.uuid()`, `z.email()`) do not apply here. A future Zod 4 migration is on the radar but out of scope for new code today.

### `z.strictObject()` for new schemas

```typescript
export const WorkerSchema = z.strictObject({ /* ... */ });
```

`z.object()` silently strips unknown keys; a backend that adds a new field nobody noticed will pass tests forever. `z.strictObject()` rejects unknown keys at runtime, so additive contract drift surfaces as a `ZodError` immediately. The migration is **essentially complete**: ~93 `z.strictObject` definitions across `fixtures/api/schemas/` vs 5 intentional lax ones (2 in `run-stats.ts` `StatsStoreResponseSchema`, commented as intentional — the third-party run-stats store's responses may include extra fields; 2 credential-input shapes in `util/keycloak.ts`; 1 deliberate `.passthrough()` on `TenantSchemaResponseSchema` in `tenant-schema.ts`). Do not add new lax `z.object` schemas.

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
const { status, body } = await apiRequest<GetWorkerResponse>({ /* ... */ });
expect(status).toBe(200);
expect(GetWorkerResponseSchema.parse(body)).toBeTruthy();
```

- The `<GetWorkerResponse>` generic gives compile-time safety on `body`.
- `Schema.parse(body)` validates the shape at runtime.
- The `expect(...).toBeTruthy()` wrapper makes the parse a Playwright assertion (so the failure is reported as a test failure, not a thrown exception that bypasses Playwright's reporting). A bare `Schema.parse(body)` with no wrapper is insufficient.

For 204 / empty-body responses, do not call `.parse()` on `null`; use `expect(body).toBeNull()` instead. For 401, use `GatewayErrorSchema`; for 400/404/409, use `APIErrorSchema`. See `api-testing` § Error envelopes.

### Optional / nullable

Defer to the `api-testing` skill's strictness ladder (§ Zod schema conventions, item 9). Lazy `.optional()` / `.nullable()` hides regressions; every modifier requires a named condition AND a verification test that exercises the branch.

### No response-envelope factory

This codebase has **no** `createApiResponseSchema` factory. Each resource file under `fixtures/api/schemas/app/` declares its own schemas. The shared shapes (`PageInfoSchema`, `APIErrorSchema`, `JSONSchemaResponseSchema`) live canonically in `fixtures/api/schemas/util/common.ts` — import from there. `GatewayErrorSchema` is not yet centralized (strict local copies in `tenant.ts` / `user.ts` / `notification-rule.ts`); a few legacy local `APIErrorSchema` copies also remain. See `api-testing` § Architecture map and § Error envelopes.

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
- ❌ `process.env.X` anywhere outside `config/` — in a spec, helper, fixture or page object. Import `env.X` or `tokens.x()` from the config module.
- ❌ `process.env.X!` or `process.env.X as string`. Both silence the compiler without checking anything; the schema in `config/env.ts` is the check.
- ❌ `process.env.X ?? "default"` / `|| "default"` at a call site. Defaults live in the schema (`.default(...)`); `||` also swallows an explicit empty string.
- ❌ `const ADMIN_TOKEN = tokens.admin()` at module level. It runs before the setup project writes the token; call the accessor where it's used.
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
- [ ] API responses on the happy path are asserted with the exact pattern `expect(SchemaName.parse(body)).toBeTruthy();` plus a `status` assertion (in a negative-matrix loop: `expect.soft(SchemaName.safeParse(body).success, label).toBe(true)` — the constitution's carve-out). No bare `Schema.parse(body)`.
- [ ] Empty-body 204/403/405 responses use `expect(body).toBeNull()` instead of calling `.parse()` on `null`.
- [ ] No `process.env` outside `config/`. Static values come from `env.X`, tokens from `tokens.x()` called where they're used, URLs and paths from `appConfig`. No `!`, `as string`, `??` or `||` on env values; any default is in the schema.
- [ ] If the file already read `process.env` in a part I did not touch, I left it (legacy drift; migrate the file when you next touch it).
- [ ] No `z.any()` added to silence a `ZodError`. Real divergences route through `api-testing` § Skipping a test for a real backend bug.
- [ ] No `prettier/prettier` errors remain (4-space indent, single quotes, trailing commas). Run `npx eslint --fix <file>` if the file shows formatting errors — never commit with wrong Prettier settings.
- [ ] Linter (`npx eslint`) and `tsc --noEmit` clean for changed files.

## Examples

### Example 1 — Adding a new env var consumed by a helper

User says: *"Add a `GRAFANA_API_TOKEN` for a perf-test-run annotation helper."*

1. **Declare it** per the `config` skill: a blank entry in `env/.env.example`, the real value in `env/.env.${ENVIRONMENT}`.
2. **Add it to the schema** in `config/env.ts`: `GRAFANA_API_TOKEN: z.string().min(1)`. It's static (known when the run starts), so it's validated at load — a missing token stops the run before any test, naming the variable.
3. **Pass it in, don't read it inside.** The helper takes the token as its last parameter (`headers`, per the `helpers` skill); the caller passes `env.GRAFANA_API_TOKEN`. The helper never reads env.
4. **A default URL** (e.g. local Grafana) goes in the schema: `GRAFANA_URL: z.string().url().default("http://localhost:3000")`. Never `?? "http://localhost:3000"` at a call site.

### Example 2 — Authoring a new Zod schema for a new endpoint

User says: *"Add `POST /jobs/:id/pause` and validate the response."*

1. **Where the schema lives.** `fixtures/api/schemas/app/job.ts` — one file per resource, no factory. Specs import it from that resource file directly — there is no `fixtures/api/schemas/app/index.ts` barrel (per `api-testing` § Zod schema conventions).
2. **Use `z.strictObject()`** for the new schema. Match the existing response shape catalog: `{ <resource>Id: string, status: ... }`.

   ```typescript
   export const PauseJobResponseSchema = z.strictObject({
     jobId: z.string().uuid(),
     status: z.string(),
   });
   export type PauseJobResponse = z.infer<typeof PauseJobResponseSchema>;
   ```

3. **`id` is `z.string().uuid()`**, not `z.string()`. Tighten by default; loosen only with verified evidence.
4. **Assert the response with the exact pattern:**

   ```typescript
   const { status, body } = await apiRequest<PauseJobResponse>({ /* ... */ });
   expect(status).toBe(200);
   expect(PauseJobResponseSchema.parse(body)).toBeTruthy();
   ```

5. **No `createApiResponseSchema`.** This codebase has no factory; each resource declares its own schemas. Reuse shared shapes (`APIErrorSchema`, `PageInfoSchema`) by importing — never duplicate.

### Example 3 — Fixing a `string | undefined` propagation

User says: *"`appConfig.apiUrl` is typed `string | undefined` and downstream callers all guard. Tighten it."*

1. **Open `config/app.ts`.** Today: `apiUrl: process.env.API_URL`.
2. **Read it from the validated env:** `apiUrl: env.API_URL`. `API_URL` is in the schema as `z.string().url()`, so the property is a `string`, and a missing or malformed value fails the run at load.
3. **JSDoc the property** in the same edit (per the `config` skill), naming the backing variable.
4. **Remove downstream guards** that only handled `undefined`; they're dead code now.
5. **What I did *not* do:** `process.env.API_URL!` or `as string`. Both make the type checker quiet without checking anything: a missing `API_URL` would fail deep in a request with a confusing URL error.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| TypeScript: `Type 'string \| undefined' is not assignable to type 'string'` on a `process.env.X` value | `process.env` read outside the config module | Add the variable to the schema in `config/env.ts` and import `env.X` (or `tokens.x()` for a run-time token). Not `!`, not `as string`, not `??`. |
| `expect(Schema.parse(body)).toBeTruthy()` throws `ZodError` | API response disagrees with the schema (extra/missing field, wrong type, wrong nullability) | Treat as a contract violation. Keep the schema strict; comment out the whole `test(...)` block with `// TODO: FIXME: <TICKET>` directly above — never `test.skip`. **Do not** loosen the schema or replace fields with `z.any()`. Route through `api-testing` § Skipping a test for a real backend bug. |
| `Schema.parse(body)` throws `ZodError` on a 401 / 403 test | 401 has a body (`{ error: string }`); 403/405 have empty bodies (`null`) | Use `GatewayErrorSchema` for 401, `expect(body).toBeNull()` for 403/405. See `api-testing` § Error envelopes. |
| "I need to silence a compile error with `as unknown as T`" | The value's real shape isn't known — that's why the cast was tempting | Replace with `Schema.parse(raw)`. You get runtime validation + a real type, instead of a lie. If no schema exists, author one (it's contract documentation). |
| "I need `any` to make this generic helper compile" | The generic constraint is too loose | Use `unknown` at the input, narrow with a type guard or `Schema.parse(...)`, return a concrete type. `any` poisons every consumer. |
| `z.object()` schema accepts a body that's missing fields the API actually returns | `z.object()` strips unknown keys silently; the missing-field side may also be from a separate cause, but `z.object()` masks the additive case | Convert the schema to `z.strictObject()`. Re-run; if a `ZodError` surfaces, you have evidence of contract drift to file. |
| `process.env.X || "default"` returns the default when `X=""` is set explicitly | `||` falls through on every falsy value, including an empty string — and a call-site default is the wrong place regardless | Move the variable into the schema in `config/env.ts`, with `.default(...)` if a default is genuinely right, and import `env.X`. |
| Persistent "ESLint errors in modified files" Cursor notification after every agent turn | Cursor's "Iterate on Lints" feature auto-sends lint errors. Files may already be clean (`npx eslint` exits 0). | Disable in Cursor Settings: `Cmd+,` → Features → Chat → "Iterate on Lints" → OFF. If files genuinely have `prettier/prettier` errors, run `npx eslint --fix <file>` once. |

## See Also

- **`api-testing`** — schema conventions by resource (where each schema lives, the strictness ladder for `.optional()` / `.nullable()`, the response-shape catalog, the no-factory rule, the response-validation idiom in spec context).
- **`config`** — env var declaration (`env/.env.example`, dotenv loading, `appConfig` shape). This skill owns the *access* rule (only the config module reads `process.env`); `config` owns the module's shape and the env files.
- **`enums`** — the `as const` going-forward rule (this skill aligns with it; new constants use `as const`, legacy TS `enum` migrates on next touch).
- **`data-strategy`** — Faker usage for unique-per-test-run values; static JSON for fixed constants.
- **`refactor-values`** — workflow when an enum value, route constant, or static `test-data/` value needs to change across the codebase.
- **`debugging`** — when a `ZodError` or unexpected `string | undefined` surfaces at runtime instead of compile time.
- **`~/.claude/CLAUDE.md`** — orchestrator. The MUST rows on Type Safety, Schemas, Response Validation, and Sources of Truth, plus the WON'T row "No `any`", are this skill's pair on the rules side.
