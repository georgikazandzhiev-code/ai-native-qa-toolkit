---
name: playwright-cli
description: Explore the live app with npx playwright open BEFORE authoring or modifying any page object, UI test, UI-derived selector, or schema — the mandatory explore-before-generate workflow with human-in-the-loop reporting. Triggers — "explore the page", "what does the UI look like", any new POM or UI spec. Never substitute codegen, browser MCP, or Cursor browser tools. Not for selector strategy (selectors) or running specs (debugging).
---

# UI Exploration (`npx playwright open`)

> **Skill folder name note:** this skill folder is named `playwright-cli/` for historical reasons — the methodology was originally written around the third-party `@playwright/cli` binary. The actual tool taught here is **`npx playwright open`**, which is built into your `@playwright/test` (already installed, no extra dependency). The folder name is a slug, not a contract.

## Critical

- **`npx playwright open` is the sanctioned exploration tool** — it ships with `@playwright/test` (already in your `package.json`, no install needed). Use it before authoring or editing any page object, UI test, UI-derived schema, or selector.
- **Forbidden substitutes for the explore-before-generate step:**
  - `npx playwright codegen` — generates brittle CSS-heavy locators that violate the `selectors` priority hierarchy. Use `open`, never `codegen`.
  - **IDE browser MCP / Cursor browser tools** — not auditable, varies by IDE version.
  - Devtools-as-exploration / hand-typed CSS chains — unstable, miss accessible names.
  - Hand-written assumptions from Figma mocks, screenshots, or design specs — no substitute for the live app.
- **If the app cannot be reached, auth fails, or the storage state is missing**, **stop and notify the human** with the exact issue. Do not invent credentials, do not generate placeholder locators, do not substitute another tool.
- **Exploration is human-in-the-loop in this workflow.** `npx playwright open` opens a real browser; the **human** interacts and observes. The model relies on the human's exploration report (captured strings, observed roles, form structure) — not direct shell-driven snapshots. (This is honest about a limitation; if shell-driven AI snapshots become necessary later, that's a future infra decision — see § Honest limits.)
- **Capture the exact rendered text** (case, punctuation, whitespace, trailing periods) for any string that needs to live in `enums/app/*` — never paraphrase. See the `enums` skill for the live-text capture rule.
- **Reuse the test-suite storage state** with `--load-storage <path>` so authenticated flows work without re-typing credentials. The path lives in `playwright.config.ts` (e.g. `.auth/app/appMainUserSession.json`).

## What `npx playwright open` is

`open` launches a fresh browser context (default Chromium) at a URL. The human interacts; the browser records actions for inspection. Useful capabilities:

- `--load-storage <path>` — pre-load auth so you land logged in
- `--save-storage <path>` — save the resulting auth state for later use
- `--save-har <path>` — capture full network activity
- `--device <name>` — emulate a device (`"iPhone 11"`)
- `--viewport-size "1280,720"` — set viewport size
- `--ignore-https-errors` — handy for self-signed certs against the dev cluster

Run `npx playwright open --help` for the full flag list.

## Quick start

```
npx playwright open https://<your-app-host>/<route>
```

For an authenticated route, point at the test suite's storage state:

```
npx playwright open --load-storage .auth/app/appMainUserSession.json https://<your-app-host>/<route>
```

> The exact storage-state path is what `playwright.config.ts` writes to. Run `grep -n "storageState" <sibling-repos>/automation/playwright.config.ts` to confirm.

## Workflow — explore before generate

### Phase 1 — Confirm the tool runs

Run `npx playwright open --help` once before relying on it. If `npx playwright` itself fails, the broader Playwright install is broken — see the `debugging` skill (and **stop and notify the human** rather than substituting another tool).

### Phase 2 — Open the app and reach the target view

Use `--load-storage` to land authenticated when the target view requires login. If auth fails or the page does not load, **stop and notify the human** — do not invent placeholder selectors.

### Phase 3 — Observe (human in the loop)

The human navigates to the feature, opens forms, triggers CRUD, observes feedback (success toasts, error messages, validation text, empty states). Capture:

- **Element roles** — buttons, links, headings, dialogs, comboboxes
- **Accessible names** — what `getByRole(role, { name })` would resolve to
- **Visible labels** for form inputs (`getByLabel(...)`)
- **Test ids** for elements wrapped by Radix primitives or schema-form fields (`schema-field-<fieldName>`, `monitor-actions-<id>`, `error-<fieldName>`, `data-sonner-toast`)
- **Exact rendered strings** for messages, page titles, toast text, validation errors — these go into `enums/app/*`

### Phase 4 — Apply findings

Hand the captured data to the matching skill:

- Selector decisions → `selectors` skill (priority hierarchy, Radix exception, anchor + drill)
- POM class structure → `page-objects` skill (TBD — until populated, follow patterns in existing `pages/app/*`)
- UI strings → `enums` skill (capture exact text, encode as `as const` constant)
- Schemas/contracts → `api-testing` for API-side, or directly in the test for UI-side

## Honest limits — what this workflow does NOT give the AI

`npx playwright open` is **interactive** — the browser opens for the human. The AI cannot directly:

- Run a `snapshot` command and read a machine-parseable accessibility tree
- Click an element by `ref` from a snapshot output
- Get DOM dumps back into the conversation context

If you want **AI-driven shell-based exploration** (the model takes snapshots, picks element refs, drives interactions from the terminal), that requires the third-party `@playwright/cli` binary — currently **pre-1.0** (`@playwright/cli@0.1.10`, bundling alpha Playwright) and **not installed in this repo**. Adopting it is a deliberate infrastructure decision, not a side-effect of skills cleanup. **For now, the model relies on the human's exploration report.**

This matches how the reference framework (`the upstream reference framework`) works — upstream uses standard `@playwright/test` with no separate CLI binary.

## Forbidden substitutes — what NOT to use

| Tool | Why forbidden | Use instead |
|------|---------------|-------------|
| `npx playwright codegen` | Generates brittle CSS-heavy locators that violate the `selectors` priority hierarchy. The output looks tempting but corrodes the framework | `npx playwright open` for exploration; author selectors by hand following the `selectors` skill |
| IDE browser MCP / Cursor browser tools | Varies by IDE version, not auditable, doesn't honor the same exploration contract | `npx playwright open` |
| Devtools console + manual CSS-chain copying | Almost always brittle (generated class names, index-based selectors) | Find a role/label/testid via observation; ask FE for a testid if missing |
| Figma mocks, design specs, screenshots without verification | The rendered app may differ from the design (state-dependent text, wrapped Radix DOM, missing accessible names) | Run `npx playwright open` against the actual deployed app |
| `curl` / static HTML fetches | Misses behavior, dynamic content, post-login views | `npx playwright open` |

## Anti-patterns

- ❌ Using `npx playwright codegen` to generate "starter selectors" and committing them. Even if you intend to clean up later, the generated CSS chains corrode the codebase.
- ❌ Inventing selector names from a Figma mock without ever opening the live app.
- ❌ Falling back to "guess from a screenshot" when `npx playwright open` failed to start. Stop and notify the human instead.
- ❌ Hardcoding text observed during exploration in a spec without routing through `enums/app/*` (when the string is reused in 2+ specs).
- ❌ Running `npx playwright open` without `--load-storage` against an authenticated route, then "improvising" credentials. Storage state is the sanctioned auth path; if it's missing, surface that to the human.
- ❌ Using `--save-storage` against the same path the test suite uses. That overwrites the suite's authenticated state. Save to a sibling path if you need a snapshot.
- ❌ Committing exploration artifacts (HAR files, screenshots, saved storage from `--save-storage`).

## Self-review checklist

- [ ] `npx playwright open` (or human exploration) was run against the actual live app — no Figma-only or screenshot-only authoring.
- [ ] The exact rendered text was captured for any string that lives in `enums/app/*`.
- [ ] Roles, labels, and testids observed in the live DOM were used — no guessed selectors.
- [ ] Forbidden tools (`codegen`, IDE browser MCP, devtools CSS copy) were not used as a substitute.
- [ ] If auth failed or the app was unreachable, work was halted and the human was notified — no placeholder locators were committed.
- [ ] No `--save-storage` overwrote the test suite's storage state.

## Examples

### Example 1 — First-time exploration of the synthetics list page

User says: *"Add a page object for the synthetics list."*

1. Run `npx playwright open --load-storage .auth/app/appMainUserSession.json https://<app-host>/synthetics` (path from `playwright.config.ts`).
2. The human lands on the synthetics list. Observes: page heading `"Synthetics"`, a `Create Monitor` button (role=button), a search input (role=textbox, labelled `Search by name`), a data table with row testids matching `monitor-actions-<id>`.
3. The human reports observations to the model.
4. The model authors the page object following the `selectors` skill — `getByRole('heading', { name: 'Synthetics' })` for the title; `getByTestId('create-monitor-button')` because the button is a Radix primitive (Radix exception); `getByTestId('synthetics-name-search')` as the anchor for the search field, `.or(getByLabel(/^Search by name/i))` for legacy fallback.

### Example 2 — Re-exploring after a UI change broke a test

User says: *"`SyntheticsPage.createMonitorButton` test fails — the button isn't found."*

1. **Don't bump timeouts.** Re-explore.
2. Run `npx playwright open --load-storage .auth/app/appMainUserSession.json https://<app-host>/synthetics`.
3. The human inspects: the button is now wrapped differently — accessible name is the same, but the testid changed from `create-monitor-button` to `create-synthetic-button`.
4. Update the page object. Update the locator to the new testid; if the rename was deliberate, also update any `enums/app/*` constant.
5. Run the affected spec via the `debugging` skill's flow.

### Example 3 — Auth fails, `npx playwright open` lands on the login page

User says: *"I tried to explore the dashboard but it redirected to login."*

This is the **stop-and-notify** path:

1. The model reports: *"`npx playwright open` against `https://<app-host>/dashboard` redirected to the Keycloak login. The storage state at `.auth/app/appMainUserSession.json` either doesn't exist, has expired, or wasn't loaded. I need: confirmation the path is correct, OR fresh credentials so auth-bootstrap can re-mint the storage state, OR instructions to run `login.setup.ts` first."*
2. **Wait for the human.**
3. Do **not** open the login page and "improvise" by typing credentials.
4. Do **not** substitute `codegen` "just to see the dashboard structure."

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npx playwright open` itself fails to start | Playwright install broken, browser not downloaded | Run `npx playwright install chromium` (re-downloads the bundled browser). If that fails, see the `debugging` skill. |
| `--load-storage` path not found | Auth setup hasn't run; the storage state file doesn't exist yet | Run the auth-bootstrap setup (e.g. `login.setup.ts`) per the project's auth flow. Confirm the path matches what `playwright.config.ts` writes. |
| Logged in via `--load-storage`, but redirected to login mid-exploration | Storage state expired (Keycloak session timeout) | Re-run auth-bootstrap to re-mint the storage state. Do not extend session timeouts in code. |
| Self-signed cert errors against the dev cluster | TLS validation rejecting dev-cluster cert | `--ignore-https-errors` flag. The test suite already disables TLS validation via `NODE_TLS_REJECT_UNAUTHORIZED="0"` in `playwright.config.ts`. |
| Can't tell whether a button has a testid from observation alone | Browser dev tools' Elements panel hides `data-testid` attributes by default in some configs | Hover the button → inspect element → look at attributes; OR ask the FE team for a testid if none exists (do not substitute a CSS-class selector). |
| Page renders differently in `npx playwright open` vs in `npx playwright test` | Different viewport, locale, or storage state | Match the test config: use `--viewport-size`, `--device`, or `--lang` flags to mirror what `playwright.config.ts` sets for the project. |

## See Also

- **`selectors`** — locator priority hierarchy, Radix exception, anchor + drill, the `## Critical` rule that mandates exploration via this skill.
- **`frontend-cross-check`** — pair with this skill: source code is the truth for stable artifacts (testids, routes, components, message keys); this skill (`npx playwright open`) is the truth for runtime / dynamic behavior (state-dependent text, toast timing, network races). Use both, not one.
- **`enums`** — capturing exact UI text from the live app and encoding it as `as const` constants.
- **`api-testing`** — sister skill for API specs (no UI exploration involved).
- **`debugging`** — when a test fails after exploration, choosing the right tool (UI Mode, Trace Viewer, Inspector).
- **`page-objects`** *(TBD)* — POM class structure and registration.
- **`~/.claude/CLAUDE.md`** — orchestrator constitution; the **Explore Before Generate** MUST rule and the **No Substitute UI Exploration** WON'T row both reference this skill.
