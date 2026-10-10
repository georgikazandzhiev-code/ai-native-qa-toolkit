# Selectors — Reference

Complete API reference grouped by intent. Cross-link from [SKILL.md](SKILL.md). Whenever a question is "what method does X?", look here first.

## Contents

1. [The Locator API — at a glance](#1-the-locator-api--at-a-glance)
2. [ARIA role catalog (most-used in this framework)](#2-aria-role-catalog-most-used-in-this-framework)
3. [Web-first assertions catalog](#3-web-first-assertions-catalog)
4. [Framework testid taxonomy](#4-framework-testid-taxonomy)
5. [Attribute filters and CSS hooks](#5-attribute-filters-and-css-hooks)
6. [FrameLocator API](#6-framelocator-api)
7. [POM file conventions](#7-pom-file-conventions)
8. [Cross-references](#8-cross-references)

## 1. The Locator API — at a glance

### 1.1 Top-level locator constructors (all return `Locator`)

| Method | Signature | Use for |
|--------|-----------|---------|
| `page.getByRole` | `getByRole(role, options?)` | Native semantic / ARIA role lookup |
| `page.getByLabel` | `getByLabel(text, { exact? })` | Form inputs by `<label for>` association |
| `page.getByPlaceholder` | `getByPlaceholder(text, { exact? })` | Inputs with `placeholder` attribute |
| `page.getByText` | `getByText(text, { exact? })` | Text content (use `exact: true` for short strings) |
| `page.getByAltText` | `getByAltText(text, { exact? })` | `<img alt>` |
| `page.getByTitle` | `getByTitle(text, { exact? })` | Elements with `title` attribute |
| `page.getByTestId` | `getByTestId(idOrRegex)` | `data-testid` attribute (configurable in `playwright.config.ts`) |
| `page.locator` | `locator(selector, options?)` | CSS / XPath / Playwright pseudo (last resort) |
| `page.frameLocator` | `frameLocator(selector)` | Open a `FrameLocator` for an iframe |

### 1.2 Locator chaining and filtering

| Method | Use |
|--------|-----|
| `loc.locator(child)` | Drill into a sub-element (CSS or text) |
| `loc.getByRole(...)` (and other `getBy…`) | Compose with sub-selector |
| `loc.filter({ hasText })` | Keep matches whose subtree contains text |
| `loc.filter({ hasNotText })` | Keep matches whose subtree does NOT contain text |
| `loc.filter({ has: <Locator> })` | Keep matches whose subtree contains the inner locator |
| `loc.filter({ hasNot: <Locator> })` | Inverse of `has` |
| `loc.and(other)` | Match elements that satisfy both locators |
| `loc.or(other)` | Match elements that satisfy either. Only for alternatives that never match at the same moment — mutually exclusive states (Pause / Resume) or legacy vs current markup (patterns P11). If both can match at once, strict mode fails |
| `loc.first()` | Pick first match |
| `loc.last()` | Pick last match |
| `loc.nth(n)` | Pick the n-th (0-based) match |

### 1.3 Reading state from a Locator

A `Locator` itself is lazy — it resolves on each action or assertion. The methods below take a snapshot at the moment they're awaited. Prefer web-first assertions (Section 3) over snapshot reads + `expect(value)`.

| Method | Returns |
|--------|---------|
| `await loc.count()` | Number of matches at this instant |
| `await loc.textContent()` | `string \| null` |
| `await loc.innerText()` | Visible text |
| `await loc.allInnerTexts()` | `string[]` for all matches |
| `await loc.inputValue()` | Value of `<input>` / `<textarea>` / `<select>` |
| `await loc.getAttribute(name)` | Attribute value (e.g. `await loc.getAttribute('aria-checked')`, `await loc.getAttribute('data-state')`) |
| `await loc.isVisible()` | Snapshot of visibility — **prefer** `await expect(loc).toBeVisible()` |
| `await loc.isEnabled()` / `.isDisabled()` / `.isChecked()` | Snapshot — prefer the matching `expect` |
| `await loc.boundingBox()` | `{ x, y, width, height } \| null` |
| `await loc.evaluate(fn)` | Run JS in browser; almost always avoidable |

### 1.4 Actions

| Action | Notes |
|--------|-------|
| `await loc.click({ force?, button?, modifiers?, position? })` | Auto-waits for actionability |
| `await loc.dblclick()` | Double-click |
| `await loc.hover()` | Triggers tooltips / hover menus |
| `await loc.fill(value)` | Replaces input contents |
| `await loc.clear()` | Clears input |
| `await loc.type(text, { delay? })` | Types char-by-char (legacy; prefer `fill` unless you need keystroke events) |
| `await loc.press(key)` | Single keystroke (`'Enter'`, `'Escape'`, `'Tab'`) |
| `await loc.check()` / `.uncheck()` | Checkboxes / radios |
| `await loc.selectOption(value)` | Native `<select>` only (Radix selects use clicks — see Recipe 3) |
| `await loc.setInputFiles(path)` | File upload |
| `await loc.focus()` / `.blur()` | Focus management |
| `await loc.scrollIntoViewIfNeeded()` | Scroll before assertion |
| `await loc.dragTo(other)` | Drag-and-drop |

## 2. ARIA role catalog (most-used in this framework)

`role` argument to `getByRole`. Roles toward the top of the table are the most reliable in component libraries built on Radix primitives (used directly or through a component kit).

| Role | When the UI uses it | Common `name` examples |
|------|---------------------|------------------------|
| `heading` | Page titles, section titles | "Jobs", "Create Job", "Edit Job" |
| `button` | Buttons with stable labels | "Cancel", "Save", "Refresh", "Previous", "Next" |
| `link` | Anchors with stable text | "Forgot Password", "Jobs" (sidebar) |
| `tab` | Tab strips inside expanded views (e.g. `export`: Run Stats, Run Steps, Timeline) | "Run Stats", "Run Steps", "Timeline" |
| `textbox` | Search inputs and labelled fields (`pages/app/JobsPage.ts`, `pages/util/LoginPage.ts`) | "Search by name or target", "Email", "Password" |
| `menuitem` | Items inside a Radix dropdown menu (row-action menu) | "Edit job", "View details", "Delete", "Pause", "Resume" |
| `option` | Items inside a Radix select listbox / `<option>` (`pages/app/JobsPage.ts` `selectFilterOption`) | filter labels (`"Online"`, `"Offline"`, page sizes) |
| `combobox` | Radix `SelectTrigger` (worker location selector, page-size selector) | use within an anchor (`expandedRowHeader.getByRole('combobox')`) |
| `checkbox` | Native checkboxes / Radix checkbox primitives | scoped under a row/section (`worker-location-checkbox`) |
| `switch` | Radix `Switch` (auto-refresh toggle) | "Auto-refresh" — toggled via `aria-checked` / `data-state` |
| `radio` | Chart timeframe selector (`pages/app/JobsPage.ts` `getChartTimeframeButton`) | "5m", "15m", "1h", "6h", "24h", "7d" |
| `dialog` | Confirmation / delete dialogs (Radix dialogs expose the role) | `getByRole('dialog', { name })` first; the testids (`delete-job-dialog`, `delete-worker-dialog`) are the fallback, and testid-first page objects are drift to fix on next touch |
| `table` | Native tables — not queried by role today; table roots are anchored on the `data-table` testid (`pages/baseClasses/DataTableBase.ts`) | `getByRole('table')` first (with `{ name }` if there are several); `getByTestId('data-table')` is the anchor fallback — `DataTableBase` uses the testid today, drift to fix on next touch |
| `row` | Native `<tr>` — per-row anchors use the `table-row-<id>` testid prefix instead | `getByRole('row').filter({ has: getByRole('cell', { name: id, exact: true }) })` first; the `table-row-<id>` testid is the fallback when the business id isn't rendered in a cell |
| `cell` | Native `<td>` (used in `pages/baseClasses/DataTableBase.ts` `noResultsMessage`) | `getByRole('cell', { name: /no results/i })` |
| `columnheader` | Native `<th>` — `dataTable.getByRole('columnheader', { name })` in the `verifyTableColumns` methods of `pages/app/JobsPage.ts`, `WorkersPage`, `NotificationRulesPage`, `InventoryPage` | column name (`"Outcome"`, `"Status"`, `"Name"`, `"Type"`, `"Target"`, `"Interval"`, `"Action"`). The "Outcome" column renders the `job-status-<jobStatus>` badge and `outcome-filter` filters by `JobStatus`; the "Status" column, `status-filter` and `sort-header-status` are the enabled/disabled toggle. |
| `listbox` | Radix select content / page-size dropdown content | usually closed-state assertion (`toBeHidden`) after option pick |
| `img` | Images with `alt` — no current callers in `pages/`; prefer a testid when the first one ships | — |
| `alert` / `status` | Validation errors announce as `alert`; Sonner toasts render as `status` | `getByRole('alert')` / `getByRole('status')` filtered by text; the `[data-sonner-toast]` attribute filter is the fallback (Recipe 5) |

Roles **not** used in this framework today (don't claim them in new code without checking the markup):

- `tabpanel`, `banner`, `tablist` — tabs are present in the `export` expanded view but the panel/list roles are not consistently emitted by the Radix `Tabs` primitive. If you're tempted to write `getByRole('tabpanel')`, look for a stable `data-testid` first (e.g. `export-expanded-view`).

`name` accepts a string OR `RegExp`. Use `{ exact: true }` for short strings.

## 3. Web-first assertions catalog

All return `Promise<void>`, all auto-retry until the configured timeout. Negate with `.not.`.

### 3.1 Visibility / existence

| Assertion | Use |
|-----------|-----|
| `expect(loc).toBeVisible()` | Element is in DOM AND visually rendered |
| `expect(loc).toBeHidden()` | Element is detached OR not visible |
| `expect(loc).toBeAttached()` | In DOM, may not be visible |
| `expect(loc).toBeInViewport()` | Visible within viewport (scroll-aware) |

### 3.2 Content

| Assertion | Use |
|-----------|-----|
| `expect(loc).toHaveText(stringOrRegex)` | Exact text equality |
| `expect(loc).toContainText(stringOrRegex)` | Substring match |
| `expect(loc).toHaveValue(value)` | Input/textarea/select value |
| `expect(loc).toBeEmpty()` | No text content |
| `expect(loc).toHaveAttribute(name, value?)` | Has attribute (optionally with value) — heavily used for Radix state (`aria-checked`, `data-state`) |
| `expect(loc).toHaveClass(stringOrRegex)` | `class` attribute match |
| `expect(loc).toHaveCSS(name, value)` | Computed CSS prop equals |
| `expect(loc).toHaveId(value)` | `id` attribute |
| `expect(loc).toHaveJSProperty(name, value)` | DOM property (e.g. `value`) |
| `expect(loc).toHaveCount(n)` | Number of matches |

### 3.3 Form state

| Assertion | Use |
|-----------|-----|
| `expect(loc).toBeEnabled()` / `.toBeDisabled()` | Button / input disabled state |
| `expect(loc).toBeEditable()` / `.not.toBeEditable()` | Read-only state |
| `expect(loc).toBeChecked()` | Checkbox / radio (or assert `aria-checked` / `data-state` for Radix) |
| `expect(loc).toBeFocused()` | Currently focused element |

### 3.4 Page-level

| Assertion | Use |
|-----------|-----|
| `expect(page).toHaveURL(stringOrRegex)` | URL match |
| `expect(page).toHaveTitle(stringOrRegex)` | `<title>` match |

### 3.5 Network helpers (not assertions but auto-await)

| Method | Use |
|--------|-----|
| `await page.waitForResponse(predicate)` | Wait for a specific HTTP response |
| `await page.waitForRequest(predicate)` | Wait for a specific HTTP request |
| `await page.waitForLoadState('networkidle')` | Avoid. The Playwright team discourages this — long-polling/analytics traffic can keep the network busy forever. Rely on `expect(loc).toBe…` to auto-wait, including on a newly opened popup. |
| `await page.waitForLoadState('domcontentloaded')` | OK on a freshly-opened popup before the first assertion; redundant on the main page in most flows. |

`waitForResponse` is the canonical pattern after a POST/PATCH/DELETE click in this framework — see `pages/app/JobsPage.ts` `clickManualRefreshAndWaitForRefresh`.

### 3.6 Assertion options

All assertions accept `{ timeout?: number }`. The default is project-wide (`playwright.config.ts`). An explicit timeout is always a named budget from `appConfig.timeouts` — never a number (the full list and typical values: `config` skill § Timeout budgets). The tiers used in this framework:

| Budget | Where it's used | Purpose |
|-------|-----------------|---------|
| (default) | The vast majority of assertions | Trust the project default; do not override |
| `fastFail` | Inner clicks and assertions inside an `expect(async () => { … }).toPass()` retry block — e.g. in `pages/app/JobsPage.ts` `openRowActionMenu`; Radix select content visible after a trigger click | Fail fast inside a polling loop; the outer `retryBlock` owns the real budget |
| `uiResponse` | Action-revealed elements after a click that triggers an XHR (row appearing, dialog closing, side-nav loading) — see `pages/app/JobsPage.ts` `verifyTableHasRows`, `selectChartTimeframe` | Give a network round-trip a comfortable budget without ballooning the whole suite |
| `persist` | Sheet "save enabled" / sheet-hidden after submit; new-row and toast visibility after create — see `pages/app/JobsPage.ts` `expectJobListed`, `expectSuccessToastForJob` | Backend creates that include validation + persistence + table refresh |
| `retryBlock` | Outer budget on `expect(async () => { … }).toPass(...)` blocks that retry a small group of assertions — `expandRow`, `collapseRow` | Wraps fast-fail inner waits |
| `longPoll` | **Reserved for `waitForResponse(...)` and long-poll run-stat assertions** — `pages/app/JobsPage.ts` `clickManualRefreshAndWaitForRefresh` | A slow endpoint, not a slow locator |
| `firstData` | The very first run-stats wait in functional detail-view specs (see [`recipes.md` § 18](recipes.md)) | An asynchronous pipeline producing its first result |

Rules of thumb:
- Don't override the timeout unless you can point at an existing assertion in `pages/**` or `tests/**` doing the same thing for the same reason.
- If you reach for `longPoll` on a locator assertion, stop — the right tool is `waitForResponse(...)` for the underlying call, then a default-timeout `expect(...)` once it returns.
- `expect(loc).not.toBeVisible(...)` and `expect(loc).toBeHidden(...)` already auto-retry until the timeout confirms absence; do **not** invent shorter timeouts for negative checks unless you've measured a real slowdown — there are no examples of that in the codebase.

## 4. Framework testid taxonomy

Conventions observed across `pages/`. Follow the same naming when adding new test ids.

### 4.1 General building blocks

| Prefix / pattern | Meaning | Example |
|------------------|---------|---------|
| `create-button`, `cancel-button`, `back-button`, `close-button` | Generic CRUD chrome on the create / edit sheet | `getByTestId('create-button')` |
| `create-job-button` | Page-toolbar "Create Job" CTA | scoped to `pages/app/JobsPage.ts` |
| `schema-field-<fieldName>` | Schema-form **field wrapper** (emitted by `src/components/schema-form/schema-form.tsx` in the frontend); drill to `input` / `textarea` or fall back to `getByLabel` via `.or()` — POM helpers: `CreateJobPage.schemaField()`, `CreateNotificationRulePage.fieldWrapper()` | `schema-field-jobName` → `.locator('input')`, `schema-field-target` |
| `field-field-<fieldPath>` | Schema-form **input** testid — the canonical hook for filling fields; POM helper: `fieldInput(fieldPath)` on `CreateJobPage` | `field-field-name`, `field-field-runInterval`, `field-field-config.method`, `field-field-firstName` |
| `error-<fieldName>` | Schema-form error message for the matching field (emitted by `src/components/schema-form/schema-form.tsx`) | `error-jobName`, `error-target`, `error-timeout` |
| `job-type-grid`, `job-type-card` | Step-1 job-type chooser (cards share the testid; scope by title text) | see `pages/app/JobsPage.ts` `exportTypeCard()` |
| `schema-form`, `schema-section-<name>`, `schema-section-<name>-trigger` | Schema-form root + collapsible section wrappers | `schema-section-export-settings` |
| `delete-job-dialog`, `delete-job-confirm` | Jobs delete dialog — the per-feature delete-dialog pattern (`delete-worker-dialog`, `delete-asset-*` follow the same shape) | scoped in `pages/app/JobsPage.ts` |
| `create-job-sheet`, `edit-job-sheet`, `job-details-sheet` | Right-side sheet containers (anchor for everything inside) | scope all child getters under these |

### 4.2 Tables

| Pattern | Meaning |
|---------|---------|
| `data-table` | The table root — anchor for `tableRows` and `noResultsMessage` in `pages/baseClasses/DataTableBase.ts` |
| `table-row-<id>` | Per-row root — a **prefix** testid, matched via `[data-testid^='table-row-']` under `dataTable` (`pages/baseClasses/DataTableBase.ts`:29). There is no bare `table-row` testid. |
| `table-cell-<columnId>` | Per-cell testid — `cellForRow(row, columnId)` / `getColumnTexts(columnId)` in `DataTableBase` |
| `expanded-row` | Per-row sibling rendered when a row is expanded — exclude with `:not([data-testid="expanded-row"])` when filtering by `hasText` |
| `job-actions-<id>` | Per-row "…" action button — selected with prefix CSS: `[data-testid^='job-actions-']` |
| `job-status-<jobStatus>` | Per-row job-status badge — selected with prefix CSS: `[data-testid^='job-status-']` |
| `sort-header-<columnId>` | Sortable column header (e.g. `sort-header-name`, `sort-header-status`) — `getSortHeader(columnId)` in `DataTableBase` |
| `skeleton-row` | Loading-state placeholder row — assert `toHaveCount(0)` before interacting with real rows (`pages/baseClasses/DataTableBase.ts` `waitForTableSettled`) |

### 4.3 Navigation

| Pattern | Meaning |
|---------|---------|
| `nav-link-jobs`, `nav-link-dashboard`, `nav-link-<feature>` | Sidebar nav links — always `nav-link-<feature>` (`pages/app/SideNavigation.ts`); the header notifications bell is `header-notifications-bell` |
| `page-jobs`, `page-workers`, `page-dashboard`, `page-<feature>` | Per-page shell roots (use as page-arrival anchors) |
| `dashboard-section-<feature>` | Dashboard-page section wrappers (`-notifications`, `-jobs`, `-workers`, `-job-types`, `-quick-actions`) |
| `dashboard-stat-<feature>-<state>` | Dashboard stat cards (e.g. `dashboard-stat-notifications-critical`, `dashboard-stat-jobs-passing`, `dashboard-stat-workers-online`) — each renders an `<a>` with a query-param URL |
| `dashboard-job-type-<type>` | Type-breakdown bar — only rendered when the type has `count > 0`; aria-label format `"<Title>: <count> configured"` |
| `dashboard-quick-action-<id>` | Quick-action card link (`view-notifications`, `add-job`, `manage-workers`, `view-run-stats`) |

### 4.4 Job status & worker status (filter cards)

| Pattern | Meaning |
|---------|---------|
| `filter-total`, `filter-passing`, `filter-degraded`, `filter-failing`, `filter-paused` | Job-status filter cards (top of the jobs list). `filter-total` counts the jobs shown in the four job-status cards. |
| `filter-active`, `filter-inactive` | **Deprecated** — replaced by job-status cards above; existing getters in `pages/app/JobsPage.ts` carry `@deprecated` JSDoc |
| `status-card` | Workers-page status cards (×4, scoped by title text: "Total Workers", "Online", "Offline", "Provisioning") |
| `status-filter`, `type-filter`, `outcome-filter` | Toolbar filter triggers (Radix select trigger; click to open; pick option via `getByRole('option')`). The "Outcome" column renders the `job-status-<jobStatus>` badge and `outcome-filter` filters by `JobStatus`; the "Status" column, `status-filter` and `sort-header-status` are the enabled/disabled toggle. |

### 4.5 Sheets / sheet chrome

| Pattern | Meaning |
|---------|---------|
| `create-job-sheet`, `create-button`, `back-button`, `close-button`, `cancel-button` | Step-2 form chrome inside the create sheet |
| `edit-job-sheet`, `edit-job-close-button`, `edit-job-cancel`, `edit-job-submit` | Edit sheet chrome (close + cancel + submit are sheet-specific to disambiguate from create) |
| `job-details-sheet`, `job-details-close-button` | Read-only details sheet |

### 4.6 Workers

| Pattern | Meaning |
|---------|---------|
| `page-workers`, `workers-title` | Workers page shell |
| `worker-selection`, `worker-location-checkbox` | Worker-selection block inside the Create Job form (one checkbox per available worker) |
| `worker-name-search`, `register-worker-button`, `refresh-button`, `auto-refresh-toggle` | Workers-page toolbar |
| `worker-location-select` | Expanded-row per-row worker selector (Radix combobox; scope to `expanded-row-header`) |
| `no-workers` | Empty-state shown when the tenant has no workers |
| `worker-actions-{id}`, `worker-view-{id}`, `worker-edit-{id}`, `worker-download-config-{id}`, `worker-delete-{id}` | Per-row action triggers (parameterized by worker id) |
| `register-worker-sheet`, `register-worker-close-button`, `register-step-indicator`, `register-cancel-button`, `register-continue-button`, `register-back-button`, `register-submit-button`, `register-done-button` | Register Worker sheet (multi-step wizard — uses `register-step-indicator` to track step) |
| Register fields | `field-field-name`, `field-field-location`, `field-field-region` and their errors (`error-name`, `error-location`, `error-region`) — see `pages/app/WorkersPage.ts` |
| `edit-worker-sheet`, `edit-worker-close-button`, `edit-worker-id`, `edit-worker-cancel`, `edit-worker-submit` | Edit worker sheet (`edit-worker-id` is read-only) |
| `worker-details-sheet`, `worker-details-close-button` | Read-only details sheet |
| `delete-worker-dialog`, `delete-worker-cancel`, `delete-worker-confirm` | Delete confirmation dialog |
| `download-config-sheet`, `download-config-close-button`, `download-config-cancel-button`, `download-config-submit-button` | Download Config sheet |
| `settings-nav`, `settings-nav-item-profile`, `settings-nav-item-workers` | Settings sidebar nav (Workers is reached via `/settings/workers`) |

### 4.7 Expanded views (per job type)

| Pattern | Meaning |
|---------|---------|
| `job-expanded-row`, `expanded-row-header` | Anchor wrappers for the expanded-row UI — every inner element must scope under one of these |
| `expanded-row` | Table-wrapper version of the expanded row (`<tr data-testid="expanded-row">`) |
| `auto-refresh-toggle` | Auto-refresh toggle wrapper — **shared** with the page toolbar, workers page, and chart toolbar; **always scope to `expanded-row-header`** when used in the expanded-view spec |
| `refresh-button` | Manual refresh — **shared** with page toolbar; **scope to `job-expanded-row`** when used in expanded-view spec |
| `worker-location-select` | Per-row worker selector (Radix combobox; **scope to `expanded-row-header`**) |
| `run-stat-card`, `run-stat-card-label`, `run-stat-card-value` | Per-job-type run-stat cards (shared testids; scope by `filter({ hasText: label })`) |
| `sftp-expanded-view`, `sftp-timing-breakdown-card` | SFTP-specific expanded view + transfer-timing card |
| `stream-expanded-view`, `stream-timing-breakdown-card`, `stream-message-stats-card`, `stream-throughput-card` | stream-job expanded view sections |
| `http-expanded-view`, `timing-breakdown-card`, `response-time-history-card`, `chart-timeframe-selector`, `response-time-legend`, `chart` | HTTP expanded view sections + the FusionCharts wrapper |
| `email-expanded-view`, `email-delivery-card` | email-job expanded view |
| `backup-expanded-view`, `backup-integrity-card`, `backup-retention-card`, `backup-timing-card`, `backup-size-card`, `backup-insights-card` | backup-job expanded view sections |
| `export-expanded-view`, `export-run-stats-cards`, `record-statistics-card` | `export` expanded view (Tabs root + run-stat container + record stats) |
| `export` tabs | Tabs inside `export-expanded-view` — **Run Stats** (active), **Run Steps** (disabled), **Timeline** (disabled) |
| `export` run-stat cards | 5× `run-stat-card` inside `export-run-stats-cards` — scope by label text: **Rows Exported**, **Duration Min**, **Duration Avg**, **Duration Max**, **Spread (Std Dev)** |
| `export` record stats sub-labels | Inside `record-statistics-card`: **Scanned**, **Written**, **Skipped** (no individual testids — assert by text) |
| `export` empty state | Text: `"No Export Run Stats Available"`, `"Run stats will appear once the job has completed its first run."` |
| `job-details-job-status` | Job-status indicator inside the details sheet |
| Timing segment dots | **No individual testid yet** — assertions fall back to `span.rounded-full` (brittle). FE improvement request: add `data-testid="timing-segment-{slug(label)}"` on each legend item. |

### 4.8 Login / auth

| Pattern | Meaning |
|---------|---------|
| `email-input`, `password-input`, `login-button` | Standard credentials (Keycloak login form) |
| `forgot-password-link` | Reset flow entry |

### 4.9 Toasts (Sonner)

| Pattern | Meaning |
|---------|---------|
| `[data-sonner-toast]` | Per-toast container (multiple toasts can stack) — filter by text to pick one |
| `data-testid="sonner"` | Toast region wrapper testid added by the app (Sonner does not emit it) — used as a fallback in `expectSuccessToastForJob` (`pages/app/JobsPage.ts`) |

### 4.10 Regex / prefix testids

Acceptable for sets of repeating elements. Always pair with a follow-up assertion that bounds the count or scopes by a parent:

```typescript
get tableHeaders(): Locator {
    return this.page.getByTestId(/columnheader/);
}
```

```typescript
await expect(this.tableHeaders).toHaveCount(expectedColumnCount);
```

Prefix CSS is acceptable when the design system has no `getByTestId(/regex/)` analogue and the prefix is intentional (per-row instances):

```typescript
getFirstRowActionButton(): Locator {
    return this.tableRows.first().locator("[data-testid^='job-actions-']");
}

getJobStatusBadge(row: Locator): Locator {
    return row.locator("[data-testid^='job-status-']");
}
```

### 4.11 Adding a new test id

When you cannot find an element via role/label/placeholder/text/testid:

1. Check whether nearby elements have a testid — the missing one is usually a sibling.
2. Open a ticket / PR with the frontend owners to add `data-testid` following the taxonomy above. Do **not** drop to CSS classes that track styling.
3. While unblocked, anchor on the closest testid and drill (Pattern 3 in `SKILL.md`). Add a `// TODO: add data-testid="…"` comment.

## 5. Attribute filters and CSS hooks

### 5.1 Acceptable component-library hooks (under an anchor only)

| Selector | Provided by | Use |
|----------|-------------|-----|
| `[role="combobox"]` | Radix `SelectTrigger` | Worker-location selector inside `expanded-row-header`; page-size selector |
| `[role="switch"]` | Radix `Switch` | Auto-refresh toggle (assert via `aria-checked`) |
| `[data-state="checked"]` / `[data-state="open"]` / `[data-state="on"]` | Radix state attribute on checkboxes, selects, dialogs, toggle groups | Active-state assertion (chart timeframe `data-state="on"`); checkbox state |
| `[data-sonner-toast]` | Sonner toast container | Toast targeting (Recipe 5) — multiple toasts stack |
| `[data-testid="select-content"]`, `[data-testid="select-item"]` | Testids the app's select wrapper puts on Radix `SelectContent` / `SelectItem` (Radix itself emits no testids) | Drill into an open Radix select dropdown — see `pages/app/JobsPage.ts` `selectRunIntervalOption` |
| `[data-testid^='table-row-']` | Per-row anchor (prefix — rows carry `table-row-<id>`) | Row collection — `tableRows` getter in `pages/baseClasses/DataTableBase.ts`:29 |

These are tolerated because the Radix role and state attributes and Sonner's `data-sonner-toast` are public API of those libraries, and the app-added testids are a contract with the frontend. Treat any other CSS class as private.

### 5.2 Native element drills

| Selector | Use |
|----------|-----|
| `.locator('input')`, `.locator('textarea')`, `.locator('select')` | Drill from a labelled wrapper to the native control |
| `.locator('input[type="checkbox"]')` | Specific input type |
| `.locator('svg')` | Icon-only triggers (use sparingly; prefer testids) |
| `.locator('header')`, `.locator('tbody')`, `.locator('tr')`, `.locator('td')`, `.locator('th')` | Native landmarks; always anchor first |

### 5.3 Attribute selectors (only when prefixes are intentional)

```typescript
// Acceptable: design team owns the per-row prefix
getJobStatusBadge(row: Locator): Locator {
    return row.locator("[data-testid^='job-status-']");
}

getFirstRowActionButton(): Locator {
    return this.tableRows.first().locator("[data-testid^='job-actions-']");
}
```

Forbidden:

```typescript
// CSS that tracks layout, not semantics
.locator('.text-muted-foreground')
.locator('.h-10.w-full.overflow-hidden')   // tolerated only deep in a chain when no testid exists; never at the top
```

## 6. FrameLocator API

This framework does not embed iframes today. The reference below is **prescriptive** — apply when the first iframe ships (e.g. an embedded Keycloak login, third-party billing widget, in-app help docs).

| Method | Returns |
|--------|---------|
| `page.frameLocator(selector)` | `FrameLocator` |
| `frame.frameLocator(selector)` | Nested iframe |
| `frame.locator(...)` / `frame.getBy*(...)` | Same `getByRole`/`getByText`/etc methods returning `Locator` |
| `frame.owner()` | The iframe element itself, as a `Locator` |

Selectors for iframes (in priority order):
1. `iframe[title="..."]` — most common stable attribute.
2. `iframe[name="..."]` — when `name` is set.
3. `iframe[id="..."]` — id-based.
4. `iframe[src*="..."]` — fallback when others are unavailable.
5. Bare `iframe` — forbidden (a second iframe will silently break the locator).

After `frameLocator` is captured, every selector inside the frame uses the same priority hierarchy.

## 7. POM file conventions

### 7.1 Where page objects live

| Path | Use |
|------|-----|
| `pages/app/<Page>.ts` | Top-level page (one URL) — 14 classes today: `JobsPage`, `WorkersPage`, `RunStatsPage`, `DashboardPage`, `CreateJobPage`, `SideNavigation`, plus the newer `NotificationsPage`, `InventoryPage`, `NotificationRulesPage`, `CreateNotificationRulePage`, `JobRunStatsViewPage`, `SettingsProfilePage`, `ProfileSettingsPage`, `ReportsPage` |
| `pages/baseClasses/<x>.ts` | Shared base for multiple page classes — only `BasePage` and `DataTableBase` exist |
| `pages/util/<x>.ts` | Cross-area utilities (`LoginPage` lives here because Keycloak login is shared across product surfaces) |
| `pages/<area>/<feature>.iframe.ts` | iframe wrapper (none today; reserve this path for the first one) |

### 7.2 Class shape

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../baseClasses/BasePage';

export class XPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    // 1. Static / single-instance locators (getters)
    get pageTitle(): Locator {
        return this.page.getByRole('heading', { name: 'X' });
    }

    // 2. Dynamic / parameterized locators (methods returning Locator synchronously)
    getRowByName(name: string): Locator {
        return this.page
            .locator('tbody tr:not([data-testid="expanded-row"])')
            .filter({ hasText: name });
    }

    // 3. User-flow methods (return Promise<void> or Promise<T>) — every one
    //    includes at least one validation per the page-objects skill.
    async createX(data: XInput): Promise<void> {
        /* ... */
    }
}
```

Constructor shape — observed conventions across `pages/**`:

| Shape | When to use | Examples |
|-------|-------------|----------|
| `class XPage extends BasePage` (or `extends DataTableBase` for table-bearing pages) with `constructor(page: Page) { super(page); }` | **The default for any `pages/app/**` class.** `BasePage` provides `this.page` (typed as `protected`), spinner waits, toast assertions, and shared navigation helpers; `DataTableBase extends BasePage` adds table getters, search, sorting, and pagination. | `pages/app/RunStatsPage.ts`, `pages/app/DashboardPage.ts` (BasePage); `pages/app/JobsPage.ts`, `pages/app/WorkersPage.ts` (DataTableBase) |
| `constructor(protected page: Page) {}` | Base classes at the root of the hierarchy — `BasePage` itself. The `protected` keeps `this.page` available to subclasses (`DataTableBase` inherits it without declaring its own constructor). | `pages/baseClasses/BasePage.ts` |
| `constructor(private page: Page) {}` | Sheet / drawer / shell-component page objects that own their own `Page` reference and don't need `BasePage` plumbing — the `CreateJobPage` sheet wrapper, `SideNavigation`, `ProfileSettingsPage`. | `pages/app/CreateJobPage.ts`, `pages/app/SideNavigation.ts` |
| `constructor(readonly page: Page) {}` | Wrappers that must **hand their `Page` back** to a caller or sub-component (e.g. an iframe wrapper that exposes `page` so a spec can build a `frameLocator`, or a composite that passes `page` to a child component). `readonly` keeps the reference public-but-immutable. | [selectors patterns.md § P6](../selectors/patterns.md) (iframe wrapper) |

Default rule: **new top-level page → extend `BasePage`** (**table-bearing page → extend `DataTableBase`**). **New shared component / mixin → `protected page: Page`**. Add `private` only when the page object is a self-contained drawer/sheet that genuinely shouldn't expose `Page` to consumers. Use `readonly page: Page` only when a caller/sub-component legitimately needs the `Page` reference exposed.

### 7.3 Methods — POM rules summary

Full canonical rules in [`page-objects`](../page-objects/SKILL.md). Quick recap:

- Methods represent meaningful flows, not single clicks ("**No single-action methods** — every POM method must include at least one built-in validation").
- Every action method validates success (visible/hidden/value/URL change, or `waitForResponse`, or a toast assertion — Recipe 5).
- Every public method has JSDoc with `@param` and `@returns`.
- Encapsulate waits — put `waitForResponse` (registered before the triggering action) and web-first assertions inside the POM method, not in the test. Prefer locators over `waitForSelector`.
- Explicit `Promise<void>` return types on all async methods.

## 8. Cross-references

- [SKILL.md](SKILL.md) — selector decision logic.
- [patterns.md](patterns.md) — good/bad examples.
- [recipes.md](recipes.md) — end-to-end recipes for tables, dialogs, dropdowns, sheets, toasts.
- [`page-objects`](../page-objects/SKILL.md) — POM class structure, action-method standards, fixture registration.
- `~/.claude/CLAUDE.md` — always-applied invariants.
- Sister: [~/.claude/skills/data-strategy/SKILL.md](../data-strategy/SKILL.md) (data sources), [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md) (API specs).
- External: [Playwright Locators](https://playwright.dev/docs/locators), [Auto-waiting](https://playwright.dev/docs/actionability), [Web-first assertions](https://playwright.dev/docs/test-assertions), [Best practices](https://playwright.dev/docs/best-practices).
