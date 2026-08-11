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
| `loc.or(other)` | Match elements that satisfy either (good for legacy/current testid duals — see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `searchInput`) |
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

`role` argument to `getByRole`. Roles toward the top of the table are the most reliable in this framework's component library (Radix primitives wrapped via `shadcn/ui`).

| Role | When the UI uses it | Common `name` examples |
|------|---------------------|------------------------|
| `heading` | Page titles, section titles | "Synthetics", "Create Monitor", "Edit Monitor" |
| `button` | Buttons with stable labels | "Cancel", "Save", "Refresh", "Previous", "Next" |
| `link` | Anchors with stable text | "Forgot Password", "Synthetics" (sidebar) |
| `tab` | Tab strips inside expanded views (e.g. ICMP: Metrics, Traceroute, Path) | "Metrics", "Traceroute", "Path" |
| `textbox` | Search inputs and labelled fields ([pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts), [pages/util/LoginPage.ts](../../../pages/util/LoginPage.ts)) | "Search by name or target", "Email", "Password" |
| `menuitem` | Items inside a Radix dropdown menu (row-action menu) | "Edit monitor", "View details", "Delete", "Pause", "Resume" |
| `option` | Items inside a Radix select listbox / `<option>` ([pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `selectFilterOption`) | filter labels (`"Online"`, `"Offline"`, page sizes) |
| `combobox` | Radix `SelectTrigger` (probe location selector, page-size selector) | use within an anchor (`expandedRowHeader.getByRole('combobox')`) |
| `checkbox` | Native checkboxes / Radix checkbox primitives | scoped under a row/section (`probe-location-checkbox`) |
| `switch` | Radix `Switch` (auto-refresh toggle) | "Auto-refresh" — toggled via `aria-checked` / `data-state` |
| `radio` | Chart timeframe selector ([pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `getChartTimeframeButton`) | "5m", "15m", "1h", "6h", "24h", "7d" |
| `dialog` | Confirmation / delete dialogs (testid-based today; role is also exposed via the Radix primitive) | use the testid (`delete-monitor-dialog`, `delete-probe-dialog`) for stability |
| `table` | Native tables — not queried by role today; table roots are anchored on the `data-table` testid ([pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts)) | prefer `getByTestId('data-table')` |
| `row` | Native `<tr>` — per-row anchors use the `table-row-<id>` testid prefix instead | prefer `[data-testid^='table-row-']` |
| `cell` | Native `<td>` (used in [pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts) `noResultsMessage`) | `getByRole('cell', { name: /no results/i })` |
| `columnheader` | Native `<th>` — `dataTable.getByRole('columnheader', { name })` in the `verifyTableColumns` methods of [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts), `ProbesPage`, `PoliciesPage`, `InventoryPage` | column name (`"Health"`, `"Status"`, `"Name"`, `"Type"`, `"Target"`, `"Interval"`, `"Action"`) |
| `listbox` | Radix select content / page-size dropdown content | usually closed-state assertion (`toBeHidden`) after option pick |
| `img` | Images with `alt` — no current callers in `pages/`; prefer a testid when the first one ships | — |
| `alert` | Toasts/notifications (Sonner emits `role="status"`, but the `[data-sonner-toast]` attribute filter is the canonical hook in this codebase) | use the data-attribute selector (Recipe 5) |

Roles **not** used in this framework today (don't claim them in new code without checking the markup):

- `tabpanel`, `banner`, `tablist` — tabs are present in the ICMP expanded view but the panel/list roles are not consistently emitted by the Radix `Tabs` primitive. If you're tempted to write `getByRole('tabpanel')`, look for a stable `data-testid` first (e.g. `icmp-expanded-view`).

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
| `await page.waitForLoadState('networkidle')` | Avoid. The Playwright team discourages this — long-polling/analytics traffic can keep the network busy forever. Use it only when opening a brand-new `Page` (popup) before any other locator-based assertion is meaningful. Otherwise rely on `expect(loc).toBe…` to auto-wait. |
| `await page.waitForLoadState('domcontentloaded')` | OK on a freshly-opened popup before the first assertion; redundant on the main page in most flows. |

`waitForResponse` is the canonical pattern after a POST/PATCH/DELETE click in this framework — see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `clickManualRefreshAndWaitForRefresh`.

### 3.6 Assertion options

All assertions accept `{ timeout?: number }`. Default is project-wide (configured in `playwright.config.ts`). Audited values actually used in this framework:

| Value | Where it's used | Purpose |
|-------|-----------------|---------|
| (default) | The vast majority of assertions | Trust the project default; do not override |
| `{ timeout: 3_000 }` | Inner clicks inside an `expect.toPass()` retry block — e.g. `item.click({ timeout: 3_000 })` in [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `openRowActionMenu` | Fail fast inside a polling loop; the outer `toPass({ timeout: 15_000 })` owns the real budget |
| `{ timeout: 5_000 }` | Inner assertions inside polling blocks (Radix select content visible after trigger click) | Same fast-fail pattern |
| `{ timeout: 10_000 }` | The most common explicit override. Action-revealed elements after a click that triggers an XHR (row appearing, dialog closing, side-nav loading) — see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `verifyTableHasRows`, `selectChartTimeframe` | Give a network round-trip a comfortable budget without ballooning the whole suite |
| `{ timeout: 15_000 }` | Sheet "save enabled" / sheet-hidden after submit; new-row visibility after create — see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `expectMonitorListed`, `expectSuccessToastForMonitor` | Backend creates that include validation + persistence + table refresh |
| `{ timeout: 20_000 }` | Outer budget on `expect.toPass(...)` blocks that retry a small group of assertions — `expandRow`, `collapseRow` | Wraps fast-fail inner waits |
| `{ timeout: 30_000 }` | **Reserved for `waitForResponse(...)` and long-poll metric assertions** — used in [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `clickManualRefreshAndWaitForRefresh`. Functional detail-view specs use `toPass({ timeout: 90_000 })` for the very-first probe-data wait (see [`recipes.md` § 18 Synthetic Monitor expanded-view tests](recipes.md)). | Long backend ops |

Rules of thumb:
- Don't override the timeout unless you can point at an existing assertion in `pages/**` or `tests/**` doing the same thing for the same reason.
- If you reach for `{ timeout: 30_000 }` on a locator assertion, stop — the right tool is `waitForResponse(...)` for the underlying call, then a default-timeout `expect(...)` once it returns.
- `expect(loc).not.toBeVisible(...)` and `expect(loc).toBeHidden(...)` already auto-retry until the timeout confirms absence; do **not** invent shorter timeouts for negative checks unless you've measured a real slowdown — there are no examples of that in the codebase.

## 4. Framework testid taxonomy

Conventions observed across `pages/`. Follow the same naming when adding new test ids.

### 4.1 General building blocks

| Prefix / pattern | Meaning | Example |
|------------------|---------|---------|
| `create-button`, `cancel-button`, `back-button`, `close-button` | Generic CRUD chrome on the create / edit sheet | `getByTestId('create-button')` |
| `create-monitor-button` | Page-toolbar "Create Monitor" CTA | scoped to `pages/app/SyntheticsPage.ts` |
| `schema-field-<fieldName>` | Schema-form **field wrapper** (emitted by `src/components/schema-form/schema-form.tsx` in the frontend); drill to `input` / `textarea` or fall back to `getByLabel` via `.or()` — POM helpers: `CreateMonitorPage.schemaField()`, `CreatePolicyPage.fieldWrapper()` | `schema-field-monitorName` → `.locator('input')`, `schema-field-target` |
| `field-field-<fieldPath>` | Schema-form **input** testid — the canonical hook for filling fields; POM helper: `fieldInput(fieldPath)` on `CreateMonitorPage` | `field-field-name`, `field-field-checkInterval`, `field-field-config.method`, `field-field-firstName` |
| `error-<fieldName>` | Schema-form error message for the matching field (emitted by `src/components/schema-form/schema-form.tsx`) | `error-monitorName`, `error-target`, `error-timeout` |
| `monitor-type-grid`, `monitor-type-card` | Step-1 monitor-type chooser (cards share the testid; scope by title text) | see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `icmpTypeCard()` |
| `schema-form`, `schema-section-<name>`, `schema-section-<name>-trigger` | Schema-form root + collapsible section wrappers | `schema-section-icmp-settings` |
| `delete-monitor-dialog`, `delete-monitor-confirm` | Synthetics delete dialog — the per-feature delete-dialog pattern (`delete-probe-dialog`, `delete-asset-*` follow the same shape) | scoped in [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) |
| `create-monitor-sheet`, `edit-monitor-sheet`, `monitor-details-sheet` | Right-side sheet containers (anchor for everything inside) | scope all child getters under these |

### 4.2 Tables

| Pattern | Meaning |
|---------|---------|
| `data-table` | The table root — anchor for `tableRows` and `noResultsMessage` in [pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts) |
| `table-row-<id>` | Per-row root — a **prefix** testid, matched via `[data-testid^='table-row-']` under `dataTable` ([pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts):29). There is no bare `table-row` testid. |
| `table-cell-<columnId>` | Per-cell testid — `cellForRow(row, columnId)` / `getColumnTexts(columnId)` in `DataTableBase` |
| `expanded-row` | Per-row sibling rendered when a row is expanded — exclude with `:not([data-testid="expanded-row"])` when filtering by `hasText` |
| `monitor-actions-<id>` | Per-row "…" action button — selected with prefix CSS: `[data-testid^='monitor-actions-']` |
| `health-status-<state>` | Per-row health badge — selected with prefix CSS: `[data-testid^='health-status-']` |
| `sort-header-<columnId>` | Sortable column header (e.g. `sort-header-name`, `sort-header-status`) — `getSortHeader(columnId)` in `DataTableBase` |
| `skeleton-row` | Loading-state placeholder row — assert `toHaveCount(0)` before interacting with real rows ([pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts) `waitForTableSettled`) |

### 4.3 Navigation

| Pattern | Meaning |
|---------|---------|
| `nav-link-synthetics`, `nav-link-dashboard`, `nav-link-<feature>` | Sidebar nav links — always `nav-link-<feature>` ([pages/app/SideNavigation.ts](../../../pages/app/SideNavigation.ts)); the header alerts bell is `header-alerts-bell` |
| `page-synthetics`, `page-probes`, `page-dashboard`, `page-<feature>` | Per-page shell roots (use as page-arrival anchors) |
| `dashboard-section-<feature>` | Dashboard-page section wrappers (`-alerts`, `-synthetics`, `-probes`, `-monitor-types`, `-quick-actions`) |
| `dashboard-stat-<feature>-<state>` | Dashboard stat cards (e.g. `dashboard-stat-alerts-critical`, `dashboard-stat-synthetics-healthy`, `dashboard-stat-probes-online`) — each renders an `<a>` with a query-param URL |
| `dashboard-monitor-type-<type>` | Monitors-by-Type bar — only rendered when the type has `count > 0`; aria-label format `"<Title>: <count> monitors"` |
| `dashboard-quick-action-<id>` | Quick-action card link (`view-alerts`, `add-monitor`, `manage-probes`, `view-metrics`) |

### 4.4 Health & status (filter cards)

| Pattern | Meaning |
|---------|---------|
| `filter-total`, `filter-healthy`, `filter-warning`, `filter-critical`, `filter-unknown` | Synthetics health filter cards (top of the synthetics list) |
| `filter-active`, `filter-inactive` | **Deprecated** — replaced by health-state cards above; existing getters in [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) carry `@deprecated` JSDoc |
| `status-card` | Probes-page status cards (×4, scoped by title text: "Total Probes", "Online", "Offline", "Provisioning") |
| `status-filter`, `type-filter`, `health-filter` | Toolbar filter triggers (Radix select trigger; click to open; pick option via `getByRole('option')`) |

### 4.5 Sheets / sheet chrome

| Pattern | Meaning |
|---------|---------|
| `create-monitor-sheet`, `create-button`, `back-button`, `close-button`, `cancel-button` | Step-2 form chrome inside the create sheet |
| `edit-monitor-sheet`, `edit-monitor-close-button`, `edit-monitor-cancel`, `edit-monitor-submit` | Edit sheet chrome (close + cancel + submit are sheet-specific to disambiguate from create) |
| `monitor-details-sheet`, `monitor-details-close-button` | Read-only details sheet |

### 4.6 Probes

| Pattern | Meaning |
|---------|---------|
| `page-probes`, `probes-title` | Probes page shell |
| `probe-selection`, `probe-location-checkbox` | Probe-selection block inside the Create Monitor form (one checkbox per available probe) |
| `probe-name-search`, `register-probe-button`, `refresh-button`, `auto-refresh-toggle` | Probes-page toolbar |
| `probe-location-select` | Expanded-row per-row probe selector (Radix combobox; scope to `expanded-row-header`) |
| `no-probes` | Empty-state shown when the tenant has no probes |
| `probe-actions-{id}`, `probe-view-{id}`, `probe-edit-{id}`, `probe-download-config-{id}`, `probe-delete-{id}` | Per-row action triggers (parameterized by probe id) |
| `register-probe-sheet`, `register-probe-close-button`, `register-step-indicator`, `register-cancel-button`, `register-continue-button`, `register-back-button`, `register-submit-button`, `register-done-button` | Register Probe sheet (multi-step wizard — uses `register-step-indicator` to track step) |
| Register fields | `field-field-name`, `field-field-location`, `field-field-region` and their errors (`error-name`, `error-location`, `error-region`) — see [pages/app/ProbesPage.ts](../../../pages/app/ProbesPage.ts) |
| `edit-probe-sheet`, `edit-probe-close-button`, `edit-probe-id`, `edit-probe-cancel`, `edit-probe-submit` | Edit probe sheet (`edit-probe-id` is read-only) |
| `probe-details-sheet`, `probe-details-close-button` | Read-only details sheet |
| `delete-probe-dialog`, `delete-probe-cancel`, `delete-probe-confirm` | Delete confirmation dialog |
| `download-config-sheet`, `download-config-close-button`, `download-config-cancel-button`, `download-config-submit-button` | Download Config sheet |
| `settings-nav`, `settings-nav-item-profile`, `settings-nav-item-probes` | Settings sidebar nav (Probes is reached via `/settings/probes`) |

### 4.7 Expanded views (per monitor type)

| Pattern | Meaning |
|---------|---------|
| `monitor-expanded-row`, `expanded-row-header` | Anchor wrappers for the expanded-row UI — every inner element must scope under one of these |
| `expanded-row` | Table-wrapper version of the expanded row (`<tr data-testid="expanded-row">`) |
| `auto-refresh-toggle` | Auto-refresh toggle wrapper — **shared** with the page toolbar, probes page, and chart toolbar; **always scope to `expanded-row-header`** when used in the expanded-view spec |
| `refresh-button` | Manual refresh — **shared** with page toolbar; **scope to `monitor-expanded-row`** when used in expanded-view spec |
| `probe-location-select` | Per-row probe selector (Radix combobox; **scope to `expanded-row-header`**) |
| `metric-card`, `metric-card-label`, `metric-card-value` | Per-protocol metric cards (shared testids; scope by `filter({ hasText: label })`) |
| `tcp-expanded-view`, `tcp-timing-breakdown-card` | TCP-specific expanded view + connection-timing card |
| `websocket-expanded-view`, `ws-timing-breakdown-card`, `ws-message-stats-card`, `ws-throughput-card` | WebSocket expanded view sections |
| `http-expanded-view`, `timing-breakdown-card`, `response-time-history-card`, `chart-timeframe-selector`, `response-time-legend`, `chart` | HTTP expanded view sections + the FusionCharts wrapper |
| `dns-expanded-view`, `dns-response-card` | DNS expanded view |
| `ssl-expanded-view`, `ssl-validation-card`, `ssl-revocation-card`, `ssl-timing-card`, `ssl-validity-card`, `ssl-insights-card` | SSL expanded view sections |
| `icmp-expanded-view`, `icmp-metrics-cards`, `packet-statistics-card` | ICMP expanded view (Tabs root + metric container + packet stats) |
| ICMP tabs | Tabs inside `icmp-expanded-view` — **Metrics** (active), **Traceroute** (disabled), **Path** (disabled) |
| ICMP metric cards | 5× `metric-card` inside `icmp-metrics-cards` — scope by label text: **Packet loss**, **RTT Min**, **RTT Avg**, **RTT Max**, **Jitter (Std Dev)** |
| ICMP packet stats sub-labels | Inside `packet-statistics-card`: **Sent**, **Received**, **Lost** (no individual testids — assert by text) |
| ICMP empty state | Text: `"No ICMP Metrics Available"`, `"Metrics will appear once the monitor has collected data."` |
| `monitor-details-health-status` | Health indicator inside the details sheet |
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
| `data-testid="sonner"` | Toast region wrapper — used as a fallback in `expectSuccessToastForMonitor` ([pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts)) |

### 4.10 Regex / prefix testids

Acceptable for sets of repeating elements. Always pair with a follow-up assertion that bounds the count or scopes by a parent:

```typescript
get tableHeaders(): Locator {
    return this.page.getByTestId(/columnheader/);
}

await expect(this.tableHeaders).toHaveCount(expectedColumnCount);
```

Prefix CSS is acceptable when the design system has no `getByTestId(/regex/)` analogue and the prefix is intentional (per-row instances):

```typescript
getFirstRowActionButton(): Locator {
    return this.tableRows.first().locator("[data-testid^='monitor-actions-']");
}

getHealthBadge(row: Locator): Locator {
    return row.locator("[data-testid^='health-status-']");
}
```

### 4.11 Adding a new test id

When you cannot find an element via role/label/placeholder/text/testid:

1. Check whether nearby elements have a testid — the missing one is usually a sibling.
2. Open a ticket / PR with the front-end team to add `data-testid` following the taxonomy above. Do **not** drop to CSS classes that track styling.
3. While unblocked, anchor on the closest testid and drill (Pattern 3 in `SKILL.md`). Add a `// TODO: add data-testid="…"` comment.

## 5. Attribute filters and CSS hooks

### 5.1 Acceptable component-library hooks (under an anchor only)

| Selector | Provided by | Use |
|----------|-------------|-----|
| `[role="combobox"]` | Radix `SelectTrigger` | Probe-location selector inside `expanded-row-header`; page-size selector |
| `[role="switch"]` | Radix `Switch` | Auto-refresh toggle (assert via `aria-checked`) |
| `[data-state="checked"]` / `[data-state="open"]` / `[data-state="on"]` | Radix state attribute on checkboxes, selects, dialogs, toggle groups | Active-state assertion (chart timeframe `data-state="on"`); checkbox state |
| `[data-sonner-toast]` | Sonner toast container | Toast targeting (Recipe 5) — multiple toasts stack |
| `[data-testid="select-content"]`, `[data-testid="select-item"]` | Radix select content / option (emitted via `<SelectContent>`) | Drill into an open Radix select dropdown — see [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `selectCheckIntervalOption` |
| `[data-testid^='table-row-']` | Per-row anchor (prefix — rows carry `table-row-<id>`) | Row collection — `tableRows` getter in [pages/baseClasses/DataTableBase.ts](../../../pages/baseClasses/DataTableBase.ts):29 |

These are tolerated because the design system / Radix primitives treat them as a public API. Treat any other CSS class as private.

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
getHealthBadge(row: Locator): Locator {
    return row.locator("[data-testid^='health-status-']");
}

getFirstRowActionButton(): Locator {
    return this.tableRows.first().locator("[data-testid^='monitor-actions-']");
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
| `pages/app/<Page>.ts` | Top-level page (one URL) — 14 classes today: `SyntheticsPage`, `ProbesPage`, `MetricsPage`, `DashboardPage`, `CreateMonitorPage`, `SideNavigation`, plus the newer `AlertsPage`, `InventoryPage`, `PoliciesPage`, `CreatePolicyPage`, `SyntheticMetricsViewPage`, `SettingsProfilePage`, `ProfileSettingsPage`, `ReportsPage` |
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
| `class XPage extends BasePage` (or `extends DataTableBase` for table-bearing pages) with `constructor(page: Page) { super(page); }` | **The default for any `pages/app/**` class.** `BasePage` provides `this.page` (typed as `protected`), spinner waits, toast assertions, and shared navigation helpers; `DataTableBase extends BasePage` adds table getters, search, sorting, and pagination. | [pages/app/MetricsPage.ts](../../../pages/app/MetricsPage.ts), [pages/app/DashboardPage.ts](../../../pages/app/DashboardPage.ts) (BasePage); [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts), [pages/app/ProbesPage.ts](../../../pages/app/ProbesPage.ts) (DataTableBase) |
| `constructor(protected page: Page) {}` | Base classes at the root of the hierarchy — `BasePage` itself. The `protected` keeps `this.page` available to subclasses (`DataTableBase` inherits it without declaring its own constructor). | [pages/baseClasses/BasePage.ts](../../../pages/baseClasses/BasePage.ts) |
| `constructor(private page: Page) {}` | Sheet / drawer / shell-component page objects that own their own `Page` reference and don't need `BasePage` plumbing — the `CreateMonitorPage` sheet wrapper, `SideNavigation`, `ProfileSettingsPage`. | [pages/app/CreateMonitorPage.ts](../../../pages/app/CreateMonitorPage.ts), [pages/app/SideNavigation.ts](../../../pages/app/SideNavigation.ts) |
| `constructor(readonly page: Page) {}` | Wrappers that must **hand their `Page` back** to a caller or sub-component (e.g. an iframe wrapper that exposes `page` so a spec can build a `frameLocator`, or a composite that passes `page` to a child component). `readonly` keeps the reference public-but-immutable. | [selectors patterns.md § P6](../selectors/patterns.md) (iframe wrapper) |

Default rule: **new top-level page → extend `BasePage`** (**table-bearing page → extend `DataTableBase`**). **New shared component / mixin → `protected page: Page`**. Add `private` only when the page object is a self-contained drawer/sheet that genuinely shouldn't expose `Page` to consumers. Use `readonly page: Page` only when a caller/sub-component legitimately needs the `Page` reference exposed.

### 7.3 Methods — POM rules summary

Full canonical rules in [`page-objects`](../page-objects/SKILL.md). Quick recap:

- Methods represent meaningful flows, not single clicks ("**No single-action methods** — every POM method must include at least one built-in validation").
- Every action method validates success (visible/hidden/value/URL change, or `waitForResponse`, or a Sonner toast assertion).
- Every public method has JSDoc with `@param` and `@returns`.
- Encapsulate waits — put `waitForSelector` / `waitForResponse` inside the POM method, not in the test.
- Explicit `Promise<void>` return types on all async methods.

## 8. Cross-references

- [SKILL.md](SKILL.md) — selector decision logic.
- [patterns.md](patterns.md) — good/bad examples.
- [recipes.md](recipes.md) — end-to-end recipes for tables, dialogs, dropdowns, sheets, toasts.
- [`page-objects`](../page-objects/SKILL.md) — POM class structure, action-method standards, fixture registration.
- `~/.claude/CLAUDE.md` — always-applied invariants.
- Sister: [~/.claude/skills/data-strategy/SKILL.md](../data-strategy/SKILL.md) (data sources), [~/.claude/skills/api-testing/SKILL.md](../api-testing/SKILL.md) (API specs).
- External: [Playwright Locators](https://playwright.dev/docs/locators), [Auto-waiting](https://playwright.dev/docs/actionability), [Web-first assertions](https://playwright.dev/docs/test-assertions), [Best practices](https://playwright.dev/docs/best-practices).
