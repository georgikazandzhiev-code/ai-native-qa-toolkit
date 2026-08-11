---
name: page-objects
description: Author Page Object classes under pages/** — extends BasePage, locator-getter convention, action methods with built-in waits, component composition, fixture registration. Use when creating a POM, adding locators or actions to an existing page class, or extracting a component. Triggers — "page object", "POM", "extend BasePage", "extract component". Not for locator priority (selectors), live exploration (playwright-cli), or spec structure (test-standards).
metadata:
  category: authoring
---

# Page Objects

Page Object classes are the seam between specs and the UI: they own every locator the framework interacts with, encapsulate every wait, and expose **business actions** (`syntheticsPage.openRowActionMenu`, `createMonitorPage.fillHttpMonitorForm`) instead of raw clicks. Authoring drift in this layer leaks into every spec that consumes the page object — so the rules below are tighter than they look. This skill is the **single source of truth** for POM class structure, action-method standards, and fixture registration. Pair with [`selectors`](../selectors/SKILL.md) for locator strategy and [`test-standards`](../test-standards/SKILL.md) for spec-side rules. Always-on framework invariants live in [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md).

## Critical

- **ALWAYS** put page-object classes in `pages/app/<Name>.ts` (PascalCase, no `.page.ts` suffix). `LoginPage` is the only exception — it lives at `pages/util/LoginPage.ts` because it targets the Keycloak login theme, not the app shell. Why: all 15 existing POMs (14 classes in `pages/app/` plus `LoginPage` in `pages/util/`) use this convention; deviating breaks the fixture-registration import paths and the orchestrator's mental model.
- **ALWAYS** extend the correct base class. Pages **with a data table** (Synthetics, Inventory, Probes, Policies, and any new table-bearing page) extend `DataTableBase` from `pages/baseClasses/DataTableBase.ts` — it provides `dataTable`, `tableRows`, `noResultsMessage`, `cellForRow`, `getColumnTexts`, sorting helpers, pagination controls, `selectPageSize`, `goToNextPage`, `goToPreviousPage`, and `waitForTableSettled`. Pages **without a table** extend `BasePage` from `pages/baseClasses/BasePage.ts` — it provides `loadingSpinner`, `toastNotification`, `waitForPageLoad`, `waitForApiResponse`, `verifySuccessToast`, `getCurrentUrl`, `refresh`. Why: bypassing the right base duplicates logic per page and produces drift. `SideNavigation` is the documented exception — it's a sidebar component, not a page. `AlertsPage` uses `BasePage` because its table root differs (`pageRoot` instead of `dataTable`).
- **ALWAYS** define locators as `get` accessors returning `Locator`. Never `async`, never `Promise<Locator>`, never `readonly` field set in constructor. Why: Playwright's `Locator` is lazy — it re-queries on every action. The `get` form is terser, groups locators in the class body, and matches every existing POM in `pages/app/`.
- **NEVER** put a locator that the framework interacts with (`click`, `fill`, `hover`, `press`, `setInputFiles`) inline in a spec. Locators interacted with live in a page object. Inline `page.getBy*` in specs is reserved for one-off arrival markers and Sonner toast assertions only. See the `selectors` skill § Where selectors live — POM vs spec.
- **NEVER** use `page.waitForTimeout(...)` inside a page object. Replace with a web-first assertion (`await expect(locator).toBeVisible()`), `page.waitForResponse(...)` for known XHRs, or `expect.toPass({ timeout })` for genuinely-flaky reads. Why: hard waits are flake amplifiers and mask real timing bugs.
- **Radix trigger-swallow retry.** When a Radix dropdown trigger swallows the first click (known race — the menu doesn't open), use `try { click + expect(item).toBeVisible({ timeout: 5_000 }) } catch { click({ force: true }) + expect visible }`. This is the **one accepted `try/catch`** in a POM action method — annotate with `// eslint-disable-next-line playwright/no-force-option -- Radix trigger retry`. Do not generalize this pattern beyond confirmed Radix trigger issues.
- **ALWAYS** explore the live app with `npx playwright open` before writing locators (see the `playwright-cli` skill). No guessing from wireframes, frontend source, or screenshots — verify roles, accessible names, and testids on the running app. If the app is unreachable, **stop and notify the human** — never ship placeholder locators with guessed names.
- **ALWAYS** include feedback locators (success toast, error toast, field validation, empty state, loading) on any POM that covers a form or CRUD operation. Why: a POM without feedback locators forces specs to assert state via timing instead of UI signals — the `selectors` skill calls a feedback-less POM "incomplete".
- **ALWAYS** register every new app POM as a property on `FrameworkFixtures` in [fixtures/pom/page-object-fixture.ts](../../../fixtures/pom/page-object-fixture.ts). Tests consume page objects through the fixture (`async ({ dashboardPage }) => { ... }`), never via `new DashboardPage(page)`. Why: bypassing the fixture means specs miss `mergeTests` integration (api-request, login, mailpit) and the centralized lifecycle.
- **NEVER** write JSDoc on locator getters. Names are self-documenting; JSDoc on `get submitButton(): Locator { ... }` adds noise and ages badly. JSDoc with `@param` / `@returns` is required on every public action method (see § Step 6 below).
- **NEVER** add a "thin" action method that only calls `click()` / `fill()`. Every public POM method must include at least one built-in validation: a web-first assertion (`expect(locator).toBeVisible()`), a `page.waitForResponse(...)`, or a toast check. A method without a built-in wait is too thin and produces flake when the spec runs in parallel.
- **ALWAYS** end data-reload actions with `await this.waitForTableSettled()`. Any action method that triggers a table data reload — pagination click, sort header click, page-size change, filter toggle — must wait for rows to settle after asserting the UI control change (e.g., page counter updated). Asserting only the control without waiting for rows is a flake source: the pagination UI updates before the new rows render.
- **NEVER** copy-paste the same method into multiple POMs. If two or more POMs need identical logic (same method body), extract it to `DataTableBase` (for table concerns) or a shared base class / mixin. One implementation, one place to fix. Duplication across POMs is drift waiting to happen.

## What's in each file (read this before reaching for another file)

| File | Purpose | Load When |
|------|---------|-----------|
| **`SKILL.md`** (this file) | Rules, decisions, anti-patterns, workflow for authoring page objects. | **Always** — on any task that creates / extends / refactors a class under `pages/**`. |
| **[`reference.md`](reference.md)** | Catalog of every existing POM, its fixture name, file path, and key methods. | **Load on lookup** — "What's already on `SyntheticsPage`?" / "Is there a method for X?" |

**Boundary rule:** decisions, rules, and anti-patterns live in this `SKILL.md`. Catalog facts (POM inventory, fixture-method mapping) belong in `reference.md` if/when it grows past inline. Locator priority, the Radix exception, and selector taxonomy belong in the [`selectors`](../selectors/SKILL.md) skill — **do not duplicate them here**. Spec-side rules (`test.step`, tags, imports from `test-options`) belong in [`test-standards`](../test-standards/SKILL.md). If you find rule content in a sibling skill (or vice versa), it's drift — fix it before adding more.

## Architecture map

| Layer | Path | Responsibility | Examples |
|-------|------|----------------|----------|
| App POMs | `pages/app/<Name>.ts` | One class per app screen / shared-shell component. PascalCase filename, no suffix. | `DashboardPage.ts`, `SyntheticsPage.ts`, `CreateMonitorPage.ts`, `ProbesPage.ts`, `MetricsPage.ts`, `SideNavigation.ts`, `AlertsPage.ts`, `InventoryPage.ts`, `PoliciesPage.ts`, `ReportsPage.ts` |
| Util POMs | `pages/util/<Name>.ts` | Auth & cross-area pages that aren't part of the main app shell. | `LoginPage.ts` (Keycloak login) |
| Base / shared | `pages/baseClasses/<Name>.ts` | Abstract base class (`BasePage`) and the table-bearing base (`DataTableBase extends BasePage`). These are the **only two** files in the directory. | `BasePage.ts`, `DataTableBase.ts` |
| Fixture wiring | `fixtures/pom/page-object-fixture.ts` | Registers every POM as a `FrameworkFixtures` property — 15 fixtures today. Merged into `test-options.ts`. | `dashboardPage`, `syntheticsPage`, `createMonitorPage`, `probesPage`, `metricsPage`, `sideNavigation`, `loginPage`, `alertsPage`, `inventoryPage`, `policiesPage`, `createPolicyPage`, `syntheticMetricsViewPage`, `settingsProfilePage`, `profileSettingsPage`, `reportsPage` |
| Consumed in specs | `tests/app/{api,e2e,functional}/**` | Specs destructure POMs from the test context. | `async ({ dashboardPage, sideNavigation }) => { ... }` |

### POM inventory (current state)

| Fixture name | Class | File | Covers |
|--------------|-------|------|--------|
| `loginPage` | `LoginPage` | `pages/util/LoginPage.ts` | Keycloak login form, error/success alerts, forgot-password / register links |
| `sideNavigation` | `SideNavigation` | `pages/app/SideNavigation.ts` | Sidebar logo + nav links, `navigateToApp()` / `navigateToSynthetics()` etc. |
| `alertsPage` | `AlertsPage` | `pages/app/AlertsPage.ts` | Alerts pages (`/alerts` + `/alerts/history`) — tabs, severity cards, search, filters, row/bulk actions, details sheet, history timeline chart |
| `dashboardPage` | `DashboardPage` | `pages/app/DashboardPage.ts` | Landing page (`/`) — Alerts / Synthetics / Probes / Monitors-by-Type / Quick-Actions sections |
| `syntheticsPage` | `SyntheticsPage` | `pages/app/SyntheticsPage.ts` | Monitor list table, search, row actions, expanded views, health filter |
| `inventoryPage` | `InventoryPage` | `pages/app/InventoryPage.ts` | Inventory ("Assets") list (`/inventory`) — health overview cards, Source/Type filters, row actions |
| `policiesPage` | `PoliciesPage` | `pages/app/PoliciesPage.ts` | Policies list — filter cards, search, severity/type/status filters, table, row actions, delete dialog, edit/details sheets |
| `createMonitorPage` | `CreateMonitorPage` | `pages/app/CreateMonitorPage.ts` | Create/edit monitor sheet (HTTP, ICMP, WebSocket, TCP, DNS, SSL, MCP) |
| `createPolicyPage` | `CreatePolicyPage` | `pages/app/CreatePolicyPage.ts` | Create-policy sheet — step-1 type cards, schema form, severity, operators, evaluation windows |
| `probesPage` | `ProbesPage` | `pages/app/ProbesPage.ts` | Probes management — status cards, filters, register/edit/details sheets |
| `metricsPage` | `MetricsPage` | `pages/app/MetricsPage.ts` | Metrics page — host picker, metric selection, chart toolbar, expanded dialog |
| `syntheticMetricsViewPage` | `SyntheticMetricsViewPage` | `pages/app/SyntheticMetricsViewPage.ts` | Per-monitor metrics view (`/synthetics/$syntheticId`) — metric sections, timeframes, aggregation, Grid/Combined modes, refresh |
| `settingsProfilePage` | `SettingsProfilePage` | `pages/app/SettingsProfilePage.ts` | Settings > Profile tab — profile card, invite banner, invite-member sheet |
| `profileSettingsPage` | `ProfileSettingsPage` | `pages/app/ProfileSettingsPage.ts` | Profile settings form — editable first/last name, read-only email/role, save button, toasts |
| `reportsPage` | `ReportsPage` | `pages/app/ReportsPage.ts` | Reports page (`/reports`) — client-side widget canvas, Add Widget, Download PDF, delete-widget dialog |

A new POM that isn't on this table needs a new row added in the same edit batch as the file is created — `fixtures/pom/page-object-fixture.ts` is the source of truth.

## Workflow — author or extend a page object

```
- [ ] 1. Decide: new POM, new locator/action on an existing POM, or extracted component? Pick the matching workflow.
- [ ] 2. Explore the live app with `npx playwright open` (the `playwright-cli` skill). Capture roles, accessible names, testids, and feedback messages.
- [ ] 3. Decide where the file lives — `pages/app/` (default) or `pages/util/` (auth/Keycloak only). PascalCase filename, no `.page.ts` suffix.
- [ ] 4. Author the class — `extends BasePage`, `constructor(page: Page) { super(page); }`, three sections (Interactive / Feedback / Actions), JSDoc on actions only.
- [ ] 5. Pick locator strategies via the `selectors` skill (priority order, Radix exception). Pull strings inside `getByText(...)` from `enums/app/*` — never hardcode.
- [ ] 6. Cover the action surface — every public method has a built-in wait or assertion (no thin `click()`-only methods). Explicit `Promise<void>` return type, `@param` / `@returns` JSDoc.
- [ ] 7. Register on `FrameworkFixtures` in `fixtures/pom/page-object-fixture.ts` (type + body) — do this in the same edit as the class.
- [ ] 8. Consume from a spec via the fixture. Verify the spec compiles + runs at least one happy-path test. Read the `test-standards` skill for spec structure.
```

### Step 1 — pick the workflow

- **New page** for a new app screen → all eight steps below.
- **Extend an existing page** with a locator or action → Steps 2 → 4 → 5 → 6 → 8 (skip Step 7 — registration already exists).
- **Extract a component** that's repeated across 3+ pages → create `pages/baseClasses/<Name>.ts`, then compose into each consuming POM as `readonly <name>: <Name>;` set in the constructor. For table-specific shared logic, extend `DataTableBase` instead of `BasePage` — it's the existing worked example of extraction (search, pagination, sorting, `waitForTableSettled` shared by Synthetics / Inventory / Probes / Policies).

### Step 2 — explore the live app (mandatory)

The `selectors` skill calls this the **Exploration-First Workflow**. Open the app with `npx playwright open` (see the `playwright-cli` skill — it owns the exact command and mode flags). Walk every interactive element you'll encode and every feedback path (success toast, error toast, field-level validation, empty state, loading state). Record: role, accessible name, label, placeholder, visible text, and testid. **If the app doesn't load or auth fails, stop and tell the human.** Placeholder locators are worse than no POM.

### Step 3 — pick the location

| Page kind | Path | Why |
|-----------|------|-----|
| App screen, app-shell component | `pages/app/<Name>.ts` | All 14 existing app POMs live here. |
| Auth / Keycloak / outside main shell | `pages/util/<Name>.ts` | Mirrors `LoginPage` placement. |
| Component reused across 3+ pages | `pages/baseClasses/<Name>.ts` | Mirrors `DataTableBase` (the directory contains only `BasePage.ts` and `DataTableBase.ts` today). For table logic, extend `DataTableBase`. |

Filename is PascalCase — `DashboardPage.ts`, `SideNavigation.ts`, `LoginPage.ts`. **Not** `dashboard-page.ts`, **not** `dashboard.page.ts`. Class name matches the filename.

### Step 4 — author the class

```typescript
import { expect, type Locator, type Page } from "@playwright/test";
import { appConfig } from "../../config/app";
import { BasePage } from "../baseClasses/BasePage";
import { Messages } from "../../enums/app";

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    const base = process.env.APP_URL!.replace(/\/$/, "");
    await this.page.goto(`${base}${appConfig.paths.SETTINGS}`);
    await this.verifyPageLoaded();
  }

  // ═══════════════════════════════════════════════════════════════
  // Page structure
  // ═══════════════════════════════════════════════════════════════

  get pageRoot(): Locator {
    return this.page.getByTestId("page-settings");
  }

  // ═══════════════════════════════════════════════════════════════
  // Interactive locators
  // ═══════════════════════════════════════════════════════════════

  fieldInput(fieldPath: string): Locator {
    return this.page.getByTestId(`field-field-${fieldPath}`);
  }

  fieldError(fieldName: string): Locator {
    return this.page.getByTestId(`error-${fieldName}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Feedback locators
  // ═══════════════════════════════════════════════════════════════

  get successToast(): Locator {
    return this.page.locator("[data-sonner-toast]").filter({
      hasText: Messages.PROFILE_SAVED,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Saves the profile form and waits for the PUT response and the success toast.
   * @param overrides - Partial profile field overrides; missing fields are left untouched.
   * @returns Promise<void>
   */
  async saveProfile(overrides: Partial<ProfileFields>): Promise<void> {
    for (const [name, value] of Object.entries(overrides)) {
      await this.fieldInput(name).fill(value);
    }
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes("/api/profile") && r.request().method() === "PUT"),
      this.page.getByRole("button", { name: "Save" }).click(),
    ]);
    await expect(this.successToast).toBeVisible();
  }
}
```

The shape is fixed: imports → class header → `open()` → page structure → interactive locators → feedback locators → actions. The visual headers (`═════`) are the existing convention across `DashboardPage`, `SyntheticsPage`, `CreateMonitorPage`. Don't substitute.

**`fieldInput(fieldPath)` and `fieldError(fieldName)` are the canonical schema-form helpers** — they wrap the `field-field-${fieldPath}` (input) and `error-${fieldName}` (validation message) testids emitted by `frontend/src/components/schema-form/schema-form.tsx`. The schema-form also emits a `schema-field-${fieldName}` testid on the **field wrapper** — covered by `schemaField()` (`CreateMonitorPage`) / `fieldWrapper()` (`CreatePolicyPage`). Use these helpers instead of inline testid strings whenever the page has a schema-form.

### Step 5 — pick locator strategies

This is the [`selectors`](../selectors/SKILL.md) skill's domain. Brief recap so you don't have to leave the page:

- **Default order:** `getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > getByAltText / getByTitle > page.locator(css)`.
- **Radix exception:** for Radix primitives (Select, Switch, Dialog, DropdownMenu, Popover, Tabs), elements whose text changes with state, or framework testid contracts (`schema-field-*`, `error-*`, `monitor-actions-*`, `data-sonner-toast`), `getByTestId` jumps above `getByText`.
- **Strings inside `getByText(...)` come from [`enums/app/*`](../../../enums/app)** (`Messages.LOGIN_ERROR`, etc.) — never hardcode. See the `enums` skill.
- **No XPath. No top-level CSS class / id selectors.** Both are forbidden by `selectors` § Critical.

If the locator decision feels non-trivial (Radix-heavy form, async-rendered table row, iframe), open the `selectors` skill's `recipes.md` before guessing — there's almost certainly a worked recipe.

### Step 6 — author actions, not clicks

Every public method must:

- Have an explicit `Promise<void>` (or `Promise<T>` for read methods) return type.
- Carry JSDoc with `@param` and `@returns`.
- Include at least one built-in validation: a web-first assertion, a `page.waitForResponse(...)`, or a toast check. **Never** end an action method on a bare `.click()` without a wait.
- Encapsulate any waits or polling — specs must not see `waitForResponse` or `waitForSelector`.

```typescript
// CORRECT — built-in wait + visible-state assertion
/**
 * Submits the create-monitor sheet and waits for the success toast.
 * @returns Promise<void>
 */
async submitCreateMonitor(): Promise<void> {
  await this.submitButton.click();
  await this.page.waitForResponse((r) => r.url().includes("/api/synthetics") && r.request().method() === "POST");
  await expect(this.successToast).toBeVisible();
}

// WRONG — thin click, no wait, no assertion
async submitCreateMonitor(): Promise<void> {
  await this.submitButton.click();
}
```

Verification methods (the `xxxAndVerify()` pattern, e.g. `loginAndVerify`) may use `expect(...)` internally and are encouraged when the same success check is reused across 3+ specs. Plain action methods in `pages/app/*` rarely assert — the spec asserts business outcomes.

### Step 7 — register the fixture

Every new app POM is registered in `fixtures/pom/page-object-fixture.ts` in the same edit as the class file. The diff has exactly two parts:

```typescript
// 1. Type entry on FrameworkFixtures
export type FrameworkFixtures = {
  loginPage: LoginPage;
  sideNavigation: SideNavigation;
  dashboardPage: DashboardPage;
  // ...
  settingsPage: SettingsPage; // NEW
  resetStorageState: () => Promise<void>;
};

// 2. Fixture body inside base.extend<FrameworkFixtures>({...})
settingsPage: async ({ page }, use) => {
  await use(new SettingsPage(page));
},
```

No `mergeTests` change is needed — the page-object fixture is already merged into `fixtures/pom/test-options.ts`. For the deeper DI rules (new fixture categories, lifecycle, scoping), see the [`fixtures`](../fixtures/SKILL.md) skill.

### Step 8 — consume from a spec

```typescript
import { expect, test } from "../../../fixtures/pom/test-options";
import { qase } from "playwright-qase-reporter";
import { SUITES } from "../../../enums/app/qase-suites";

test.describe("Settings — Profile", () => {
  test.beforeEach(async ({ sideNavigation, settingsPage }) => {
    await test.step("GIVEN: I am on the Settings page", async () => {
      await sideNavigation.navigateToSettings();
      await settingsPage.verifyPageLoaded();
    });
  });

  test(
    "Verify profile save shows success toast",
    { tag: "@App-regression" },
    async ({ settingsPage }) => {
      qase.suite(SUITES.APP_SETTINGS);
      await settingsPage.saveProfile({ "profile.firstName": "Jordan" });
    },
  );
});
```

For tag rules (lowercase `@App-regression` for functional specs — this exact casing matches the `package.json` grep; single-tag rule; never on `describe`), `test.step` structure, fixture imports, and Qase wiring, read the [`test-standards`](../test-standards/SKILL.md) skill. **Never** `new SettingsPage(page)` inside a test — that bypasses every other merged fixture.

## Anti-patterns

- ❌ **Filename uses `dashboard.page.ts` or `dashboard-page.ts`.** Doesn't match the 15 existing POMs. Fix: rename to PascalCase + no suffix (`DashboardPage.ts`).
- ❌ **`readonly` field set in the constructor instead of `get` accessor.** Both work at runtime, but the `readonly` form is verbose and breaks consistency with every other POM in `pages/app/`. Fix: convert to `get`.
- ❌ **`page.waitForTimeout(1000)` inside a POM action.** Hard wait — masks timing bugs and produces parallel-run flake. Fix: replace with `await expect(locator).toBeVisible()` for state, `page.waitForResponse(...)` for known XHRs.
- ❌ **Locator-getter has JSDoc.** Names are self-documenting. Fix: delete the JSDoc; keep JSDoc only on action / verification methods.
- ❌ **Action method calls `click()` and returns.** No wait, no assertion — flake amplifier. Fix: add `await expect(toast).toBeVisible()` or `page.waitForResponse(...)` before returning.
- ❌ **POM imports `test` / `expect` from `fixtures/pom/test-options`.** That import is reserved for spec files. POMs import directly from `@playwright/test`. Fix: `import { expect, type Locator, type Page } from "@playwright/test";`.
- ❌ **POM not registered in `page-object-fixture.ts`.** Spec ends up doing `new SettingsPage(page)` and loses every merged fixture. Fix: complete Step 7 in the same edit batch.
- ❌ **Hardcoded `getByText("Profile saved")` instead of `Messages.PROFILE_SAVED`.** Strings inside `getByText` come from `enums/app/*`. Fix: extend the enum (see the `enums` skill) and reference the constant.
- ❌ **POM file > 600 lines covering multiple flows.** Class is doing too much. Fix: split by surface (`SettingsProfilePage`, `SettingsBillingPage`) or extract repeated fragments into `pages/baseClasses/<Component>.ts` (mirror `DataTableBase`).
- ❌ **Inline `page.locator('css selector').click()` in a spec.** Locator that's interacted with belongs in a POM. Fix: move the locator + action into the matching POM and call it from the spec.
- ❌ **Locator getter in a POM that is never consumed by any spec or action method.** Dead locators add noise, mask naming conflicts, and rot when the UI changes without anyone noticing. Fix: grep for the getter name across `tests/` before declaring a POM change done; remove unused getters in the same edit.
- ❌ **Duplicate getter name in a large POM.** TypeScript silently shadows duplicate `get` accessors in the same class — the second overrides the first with no error. Fix: search for `get <newGetterName>` in the file before adding. Especially dangerous in POMs past 500 lines (e.g., `SyntheticsPage.ts`).
- ❌ **Same constant (export format list, column names, filter options) declared in 3+ page objects.** Extract to `enums/app/<name>.ts` or export from one canonical POM and import into others. Duplication of UI constants across POMs diverges silently when one copy is updated and the others are not.
- ❌ **Same action method logic (click trigger → assert menu → interact) copy-pasted across 3+ POMs.** Extract to a shared base class or component. For table concerns (pagination, sorting, column reads), extend `DataTableBase`. For UI components, compose via `readonly <name>: <Component>` in consuming POMs. Example: `DataTableBase`.

## Self-review checklist

- [ ] File lives at `pages/app/<Name>.ts` (or `pages/util/<Name>.ts` for auth) with PascalCase name, no `.page.ts` suffix.
- [ ] Class `extends BasePage` (or — for sidebar / shared shell components — extends nothing, mirroring `SideNavigation`).
- [ ] Constructor is `constructor(page: Page) { super(page); }` (or, for non-`BasePage` classes, `constructor(private page: Page) {}`).
- [ ] Every locator is a `get` accessor returning `Locator`. No async, no `Promise<Locator>`, no field-set-in-constructor.
- [ ] Locator priority follows the `selectors` skill (default order + Radix exception). No XPath, no top-level CSS class / id selectors.
- [ ] Strings inside `getByText(...)` come from `enums/app/*` (`Messages.X`).
- [ ] Three sections present (Interactive / Feedback / Actions) with the `═════` visual headers when the page has forms or CRUD.
- [ ] Every public action method has an explicit return type, JSDoc with `@param` / `@returns`, and at least one built-in wait / assertion.
- [ ] No `page.waitForTimeout(...)`. No JSDoc on locator getters.
- [ ] Schema-form pages use the `fieldInput(path)` / `fieldError(name)` helpers (matching the `field-field-${path}` / `error-${name}` testid contract from `frontend/src/components/schema-form/schema-form.tsx`).
- [ ] New POMs are registered in `fixtures/pom/page-object-fixture.ts` (type entry + fixture body) in the same edit batch.
- [ ] Spec consuming the POM imports `test` / `expect` from `fixtures/pom/test-options.ts` and uses fixture destructuring — no `new <Page>(page)`.
- [ ] No duplicate getter names — search for `get <newGetterName>` in the file before adding. TypeScript silently shadows duplicates with no error.
- [ ] No dead locator getters — grep for the getter name across `tests/` to confirm at least one consumer exists.
- [ ] At least one happy-path test passes locally before the task is declared done.

## Examples

### Example 1 — add a `SettingsPage` for `/settings`

User says: *"Add a `SettingsPage` page object for `/settings` with a profile-save form and a dark-mode toggle."*

1. **Step 1 — workflow.** New page → all 8 steps.
2. **Step 2 — exploration.** Run `npx playwright open` and walk `/settings`. Capture: profile form fields (firstName, lastName, email, phone) and their `field-field-*` testids; dark-mode toggle role + accessible name; success toast text on save; error toast on validation failure; per-field validation messages.
3. **Step 3 — location.** App screen → `pages/app/SettingsPage.ts`. Resolve `appConfig.paths.SETTINGS` (or add it under `config/app.ts` if missing — see the `config` skill).
4. **Step 4 — author.** `extends BasePage`. Section headers Interactive / Feedback / Actions. Use `fieldInput(fieldPath)` / `fieldError(fieldName)` for the schema-form fields.
5. **Step 5 — locators.** `getByRole('switch', { name: 'Dark mode' })` for the toggle (default priority); `getByTestId(\`field-field-${path}\`)` for form fields (Radix exception — schema-form testid contract). `Messages.PROFILE_SAVED` from `enums/app` for the toast text.
6. **Step 6 — actions.** `saveProfile(overrides)` waits on `PUT /api/profile` + success toast. `toggleDarkMode()` waits on the toggle's `data-state="checked"` flip.
7. **Step 7 — fixture.** Add `settingsPage: SettingsPage;` to `FrameworkFixtures` and the fixture body next to `metricsPage`.
8. **Step 8 — spec.** Author `tests/app/functional/tenant-service/settings.spec.ts` with `@App-regression` and a `qase.suite(SUITES.APP_SETTINGS)` — extend `enums/app/qase-suites.ts` if `APP_SETTINGS` doesn't exist yet.

### Example 2 — add `forgotPasswordLink` and `clickForgotPassword()` to `LoginPage`

User says: *"Add a `forgotPasswordLink` locator and a `clickForgotPassword()` method to `LoginPage`."*

1. **Step 2 — exploration.** Run `npx playwright open` against the Keycloak login. The link already exists at `data-testid="login-forgot-password-link"` (verified at [pages/util/LoginPage.ts:39](../../../pages/util/LoginPage.ts#L39)).
2. **Step 4 — extend the class.** Locator already exists — confirm. Add the action method.
3. **Step 6 — action method.**
   ```typescript
   /**
    * Clicks the forgot-password link and waits for the reset-password page to load.
    * @returns Promise<void>
    */
   async clickForgotPassword(): Promise<void> {
     await Promise.all([
       this.page.waitForURL(/\/reset-credentials/),
       this.forgotPasswordLink.click(),
     ]);
   }
   ```
4. **Step 7 — fixture.** No change — `loginPage` already registered.
5. **Step 8 — spec.** Consume from `tests/app/e2e/tenant-service/forgot-password.spec.ts` (file already exists; add the new test inside its describe).

### Example 3 — extract a `Notification` component used on 3 pages

User says: *"`DashboardPage`, `SyntheticsPage`, and `ProbesPage` all duplicate the success-toast locator. Extract it."*

1. **Step 1 — workflow.** Component extraction → create in `pages/baseClasses/`.
2. **Step 2 — exploration.** Confirm the toast is the Sonner toast (`[data-sonner-toast]`) on all 3 pages — same DOM contract.
3. **Step 3 — location.** Create a new `pages/baseClasses/Notification.ts` — no such file exists today (`ls pages/baseClasses/` shows only `BasePage.ts` and `DataTableBase.ts`). Anchor its locators on the live Sonner DOM (`[data-sonner-toast]`), never on invented testids.
4. **Step 4 — compose into each consuming POM.**
   ```typescript
   import { Notification } from "../baseClasses/Notification";

   export class DashboardPage extends BasePage {
     readonly notification: Notification;

     constructor(page: Page) {
       super(page);
       this.notification = new Notification(page);
     }
   }
   ```
5. **Step 6 — replace duplicated locators.** In each consuming POM, swap the duplicated `successToast` getter for `this.notification.successNotification` (or the equivalent).
6. **Step 7 — fixture.** No change — components are consumed through the parent POM, not registered separately.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Spec fails with `Cannot find name 'settingsPage'` on the test context. | POM was created but not registered in `page-object-fixture.ts`. | Complete Step 7 — add the type entry to `FrameworkFixtures` **and** the fixture body inside `base.extend(...)` in the same edit. |
| `TypeError: this.<locator>.click is not a function` at runtime. | Locator getter returns `Promise<Locator>` instead of `Locator` (someone added `async`). | Remove `async`. Playwright's `Locator` is lazy — getters are synchronous. |
| Test passes alone, fails in parallel. | POM action ends on `.click()` without a wait — next assertion runs before the UI settles. | Add a built-in wait inside the action method (`page.waitForResponse(...)` or `await expect(toast).toBeVisible()`). |
| `Strict mode violation: locator resolved to N elements`. | Locator is too generic — usually a `getByRole('button')` without `name`, or a Radix repeated trigger. | Re-explore in `npx playwright open`, narrow the locator (add `{ name: 'Save' }` or `.filter({ hasText: ... })`), or anchor with a parent testid (`anchor-and-drill` from the `selectors` skill). |
| Dark-mode toggle locator works in DOM inspector, fails in test. | Radix `data-state` flip is async — initial state is `unchecked`. | Wait for the state attribute: `await expect(toggle).toHaveAttribute('data-state', 'checked')` after the click. |
| `Messages.X` enum constant doesn't exist for a string the POM needs. | UI text not yet encoded. | Stop and extend `enums/app/<file>.ts` via the `enums` skill — capture the exact text via `npx playwright open` first. Never hardcode the string in `getByText(...)`. |
| POM file is 700 lines and hard to maintain. | One class is covering 4+ unrelated flows. | Split by surface (`SettingsProfilePage` / `SettingsBillingPage`) or extract repeated fragments into `pages/baseClasses/<Component>.ts`. |
| Reusing the same setup logic across 3+ tests inside the spec. | Setup belongs in the page-object action, not the spec. | Move into a verification method on the POM (`xxxAndVerify`). If the setup is API-driven and reused across 3+ files, see the `helpers` skill (per-resource setup helper) or the `fixtures` skill (helper fixture promotion). |
| Locator-getter copy-pasted from the DOM inspector with raw CSS or XPath. | Wrong locator strategy. | Replace with `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > `getByTestId` per the `selectors` skill priority order. If nothing semantic works, coordinate with engineering for a `data-testid` and add it to the `schema-field-*` / `error-*` taxonomy. |

## See Also

- **Always-on rules:** [~/.claude/CLAUDE.md](~/.claude/CLAUDE.md) — framework invariants (imports, type-safety, MUST/SHOULD/WON'T). UI-specific POM Method Standards, Locator Priority, and cleanup are now in this skill (consolidated from the previous `ui-tests.mdc`).
- **Sibling cluster (UI authoring):** [`selectors`](../selectors/SKILL.md) (locator strategy, Radix exception), [`playwright-cli`](../playwright-cli/SKILL.md) (live-app exploration tool), [`fixtures`](../fixtures/SKILL.md) (fixture DI / helper-fixture promotion), [`scaffold-spec`](../scaffold-spec/SKILL.md) (spec scaffolding that consumes POMs), [`enums`](../enums/SKILL.md) (where `Messages.X` / `ApiEndpoints.X` live), [`test-standards`](../test-standards/SKILL.md) (spec-side rules — `test.step`, tags, Qase, imports), [`frontend-cross-check`](../frontend-cross-check/SKILL.md) (verifying testids against the live frontend), [`config`](../config/SKILL.md) (`appConfig.paths.X` for navigation URLs).
- **Orchestrator:** [`~/.claude/CLAUDE.md`](~/.claude/CLAUDE.md) — § Routed Detail Index lists this skill.
- **Companion plan:** [`docs/framework-alignment-plan.md`](../../../docs/framework-alignment-plan.md) — drift-to-converge entries (lowercase `@App-regression` flip, planned three-tier test data).
