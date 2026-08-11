---
description: POM key-method catalog and inventory for the platform automation framework
---

# Page Objects — Reference

Companion file to [`SKILL.md`](SKILL.md). This catalogs **what already exists** on each page object so authors don't reinvent locators / actions that are already there. Update this file when adding a new POM or extending an existing one.

## Contents

- [Class inventory (fixture → class → file)](#class-inventory-fixture--class--file)
- [`SyntheticsPage` — key methods](#syntheticspage--key-methods)
- [`CreateMonitorPage` — key methods](#createmonitorpage--key-methods)
- [`SideNavigation` — key methods](#sidenavigation--key-methods)
- [`ProbesPage` — key methods](#probespage--key-methods)
- [`MetricsPage` — key methods](#metricspage--key-methods)
- [`DashboardPage` — key methods](#dashboardpage--key-methods)
- [`AlertsPage` — key methods](#alertspage--key-methods)
- [`InventoryPage` — key methods](#inventorypage--key-methods)
- [`PoliciesPage` — key methods](#policiespage--key-methods)
- [`CreatePolicyPage` — key methods](#createpolicypage--key-methods)
- [`SyntheticMetricsViewPage` — key methods](#syntheticmetricsviewpage--key-methods)
- [`SettingsProfilePage` — key methods](#settingsprofilepage--key-methods)
- [`ReportsPage` — key methods](#reportspage--key-methods)
- [`LoginPage` — key methods](#loginpage--key-methods)
- [Base classes (`pages/baseClasses/`)](#base-classes-pagesbaseclasses)
- [How to update this catalog](#how-to-update-this-catalog)

---

## Class inventory (fixture → class → file)

| Fixture | Class | File |
|---|---|---|
| `loginPage` | `LoginPage` | [`pages/util/LoginPage.ts`](../../../pages/util/LoginPage.ts) |
| `sideNavigation` | `SideNavigation` | [`pages/app/SideNavigation.ts`](../../../pages/app/SideNavigation.ts) |
| `alertsPage` | `AlertsPage` | [`pages/app/AlertsPage.ts`](../../../pages/app/AlertsPage.ts) |
| `dashboardPage` | `DashboardPage` | [`pages/app/DashboardPage.ts`](../../../pages/app/DashboardPage.ts) |
| `syntheticsPage` | `SyntheticsPage` | [`pages/app/SyntheticsPage.ts`](../../../pages/app/SyntheticsPage.ts) |
| `inventoryPage` | `InventoryPage` | [`pages/app/InventoryPage.ts`](../../../pages/app/InventoryPage.ts) |
| `policiesPage` | `PoliciesPage` | [`pages/app/PoliciesPage.ts`](../../../pages/app/PoliciesPage.ts) |
| `createMonitorPage` | `CreateMonitorPage` | [`pages/app/CreateMonitorPage.ts`](../../../pages/app/CreateMonitorPage.ts) |
| `createPolicyPage` | `CreatePolicyPage` | [`pages/app/CreatePolicyPage.ts`](../../../pages/app/CreatePolicyPage.ts) |
| `probesPage` | `ProbesPage` | [`pages/app/ProbesPage.ts`](../../../pages/app/ProbesPage.ts) |
| `metricsPage` | `MetricsPage` | [`pages/app/MetricsPage.ts`](../../../pages/app/MetricsPage.ts) |
| `syntheticMetricsViewPage` | `SyntheticMetricsViewPage` | [`pages/app/SyntheticMetricsViewPage.ts`](../../../pages/app/SyntheticMetricsViewPage.ts) |
| `settingsProfilePage` | `SettingsProfilePage` | [`pages/app/SettingsProfilePage.ts`](../../../pages/app/SettingsProfilePage.ts) |
| `profileSettingsPage` | `ProfileSettingsPage` | [`pages/app/ProfileSettingsPage.ts`](../../../pages/app/ProfileSettingsPage.ts) |
| `reportsPage` | `ReportsPage` | [`pages/app/ReportsPage.ts`](../../../pages/app/ReportsPage.ts) |

`resetStorageState` is also exported from `fixtures/pom/page-object-fixture.ts` — call it in `beforeEach` for unauthenticated flows.

---

## `SyntheticsPage` — key methods

Lives at [`pages/app/SyntheticsPage.ts`](../../../pages/app/SyntheticsPage.ts).

- `open()` — navigate to `/synthetics` and wait for list-ready signal.
- `verifyPageLoaded()` — assert `page-synthetics` root + table chrome.
- `getRowByName(name)` → `Locator` — filter table rows by visible text. Excludes `[data-testid="expanded-row"]` to avoid strict-mode double-matches when a row is expanded.
- `openRowActionMenu(row, menuItem)` — opens the per-row "…" menu and clicks the named item (`Edit monitor`, `View details`, `Delete`). Wrapped in `expect.toPass({ timeout: 15_000 })` because the menu trigger occasionally needs a re-click on slow CI.
- `searchByName(name)` / `clearSearch()` — **inherited from `DataTableBase`** (debounced fill with re-fill retry + `waitForTableSettled`); `SyntheticsPage` only overrides `get searchInput()`.
- `expandRow(row)` / `collapseRow(row)` — toggle the expanded-row UI.
- `getAllHealthCounts()` → `{ total, healthy, warning, critical, unknown }` — read all 5 health stat cards. **Always wrap in `expect.toPass(...)` when comparing across counters** (see `selectors/patterns.md` P18).
- `expectSyntheticsListReady()` — composite ready-state assertion (page root + table or empty state).
- Generic timing helpers (parameterized; reused across HTTP / TCP / WebSocket detail-view specs):
  - `timingLegendItemIn(card, label)`, `timingLegendItemsIn(card)`, `timingLegendColorDot(card, label)`
  - `timingStackedBarIn(card)`, `timingStackedBarSegmentsIn(card)`, `timingScaleTotalMsIn(card)`
  - `getTimingSegmentMsIn(card, label)`
  - `verifyInlineMsLabels(card, segments)` — asserts the >10% threshold rule (large segments must show the ms label, sub-10% segments must not).

---

## `CreateMonitorPage` — key methods

Lives at [`pages/app/CreateMonitorPage.ts`](../../../pages/app/CreateMonitorPage.ts). Shared across HTTP, ICMP, WebSocket, TCP, DNS, SSL, MCP create/edit flows.

- `fillHttpMonitorForm(data)`, `fillIcmpMonitorForm(data)`, `fillWebSocketMonitorForm(data)`, … — per-type form fillers. Use the matching `buildCreate<TYPE>SyntheticBody` from `helpers/app/synthetics.ts` to build `data`.
- `monitorTypeCard(type)` → `Locator` — step-1 type chooser card (cards share `monitor-type-card` testid; scope by title text).
- `waitForTypeSelection()` — wait for the step-1 grid to render.
- `waitForConfigureForm()` — wait for the step-2 form to render after a type is picked.
- `selectDropdownOption(field, label)` — pick an option in a Radix select inside the form.
- `expandIcmpSettings()` — open the ICMP-specific collapsible section.
- `enableTraceroute()` — toggle the traceroute switch (ICMP only).
- `submit()` — submit the create form, wait for the API response, assert success toast.
- `fieldInput(fieldPath)` / `fieldError(fieldName)` — generic schema-form helpers (matches the `field-field-${path}` / `error-${name}` testid contract); `schemaField(fieldName)` targets the `schema-field-${name}` field wrapper.

---

## `SideNavigation` — key methods

Lives at [`pages/app/SideNavigation.ts`](../../../pages/app/SideNavigation.ts). Does **not** extend `BasePage` — sidebar is a shell component, not a page.

- `navigateToApp()` — navigate to `/` and wait for the sidebar to render.
- `navigateToSynthetics()`, `navigateToMetrics()`, `navigateToDashboard()`, `navigateToReports()`, `navigateToInventory()`, `navigateToPolicies()`, `navigateToSettings()` — click the matching nav link (`nav-link-<feature>` testid) and wait for the destination page root.
- `navigateToAlerts()` — click the header alerts bell (`header-alerts-bell`) and wait for `page-alerts`.
- `navigateToProbes()`, `navigateToProfile()` / `navigateToSettingsProfile()` — Settings sub-nav flows: click Settings, then the `settings-nav-item-probes` / `settings-nav-item-profile` item, wait for the destination page root.

Locator getters: `sidebar`, `logo`, `dashboard`, `metrics`, `synthetics`, `inventory`, `reports`, `policies`, `alertsBell`, `settings`.

---

## `ProbesPage` — key methods

Lives at [`pages/app/ProbesPage.ts`](../../../pages/app/ProbesPage.ts). Extends `DataTableBase`. Status cards + filters + table + register / edit / details / download-config sheets.

- `open()` / `verifyPageLoaded()` — navigate to `/settings/probes` and assert the page root.
- Status cards: `totalProbesCard`, `onlineCard`, `offlineCard`, `provisioningCard` (scope `status-card` by title text); `getAllStatusCounts()`, `verifyStatusCards()`, `verifyStatusCardCounts()`.
- Search: `searchByName(query)` / `clearSearch()` — **overridden** with a plain `fill`/`clear` (frontend debounces client-side), unlike the retrying `DataTableBase` version.
- Filters: `statusFilter`, `typeFilter`, `selectStatusOption(label)`, `selectTypeOption(label)`, `selectFilterOption(filter, label)`, `verifyFilterDropdownOptions(...)`.
- Toolbar: `registerProbeButton`, `refreshButton`, `autoRefreshToggle`, `verifyToolbarControls()`.
- Table: `verifyTableHasRows()`, `verifyNoResults()`, `verifyTableColumns()`, `verifyAllRowsContainText(regex)`, `getTotalRowCount()`, `getExpectedVisibleRows()`, `verifyPaginationControls()`. Sorting and pagination actions (`clickSortHeader`, `selectPageSize`, `goToNextPage`, `goToPreviousPage`) are inherited from `DataTableBase`.
- Row actions: `openRowActionMenu(row, menuItem)`, `openFirstRowActionMenu()`, `verifyActionMenuOptions()`.
- Sheets: `registerProbeSheet` (chrome: close/cancel/continue/back/submit/done buttons, `registerStepIndicator`, name/location/region fields + errors, `openRegisterProbeSheet()`), `editProbeSheet` (close/cancel/submit + read-only `editProbeIdField`), `detailsSheet` (+ `detailsCloseButton`), `downloadConfigSheet` (+ close/cancel/submit buttons).
- Delete dialog: `deleteDialog`, `deleteConfirmButton`, `deleteCancelButton`.

---

## `MetricsPage` — key methods

Lives at [`pages/app/MetricsPage.ts`](../../../pages/app/MetricsPage.ts). Host picker, metric selection, chart toolbar, expanded dialog.

- `open()` / `verifyPageLoaded()` — navigate to `/metrics` and assert the page root.
- Host selection: `selectHost(name)`, `clearHostSelection()`.
- Metric selection: `selectMetric(name)`, `selectedMetrics` getter (returns the set of currently-selected metric chips).
- Chart toolbar: `selectTimeframe(label)`, `toggleAutoRefresh()`, `manualRefresh()`.
- Expanded dialog: `openExpandedDialog()`, `closeExpandedDialog()`.

---

## `DashboardPage` — key methods

Lives at [`pages/app/DashboardPage.ts`](../../../pages/app/DashboardPage.ts). Read-only landing page (route `/`) — Active alerts / Synthetics / Probes / Monitors-by-Type / Quick Actions sections.

- `open()` — navigate to `/` and wait for `page-dashboard` root.
- `verifyPageLoaded()` — minimal ready-state assertion (page root + page title visible).
- `verifyAllSectionsVisible()` — assert each of the 5 section wrappers + matching `<h2>` headings.
- `verifyActiveAlertsSectionBeforeSynthetics()` — assert Alerts renders above Synthetics in DOM order.
- Section getters: `pageRoot`, `pageTitle`, `alertsSection`, `syntheticsSection`, `probesSection`, `monitorTypesSection`, `quickActionsSection`.
- Section heading: `sectionHeading(name)` — `getByRole("heading", { level: 2, name })`.
- Alerts stat cards: `alertsCard(key)` for `key ∈ { total, critical, error, warning, info }`; `getAllAlertsCounts()`, `verifyAlertsCards()`, `clickAlertsCard(key)`.
- Synthetics stat cards: `syntheticsCard(key)` for `key ∈ { total, healthy, warning, critical, unknown }`.
- Probes stat cards: `probesCard(key)` for `key ∈ { total, online, offline, provisioning }`.
- Monitor-type bars: `monitorTypeBar(type)` (only rendered when `count > 0`).
- Quick-action cards: `quickAction(key)` for `key ∈ { view-alerts, add-monitor, manage-probes, view-metrics }`; `verifyQuickActions()`, `clickQuickAction(key)`.

Public constants exported from the same file (used by the dashboard spec):
- `ALERTS_CARD_TITLES` — visible card titles per `AlertsCardKey`.
- `SYNTHETICS_CARD_TITLES` — visible card titles per `SyntheticsCardKey`.
- `PROBES_CARD_TITLES` — visible card titles per `ProbesCardKey`.
- `QUICK_ACTIONS` — card title + description + destination path per `QuickActionKey`.
- `ALERTS_SEVERITY_FILTER_LABELS` — Alerts-page severity-filter trigger label per `?severity=<value>`.
- `HEALTH_FILTER_LABELS` — Synthetics list-page filter trigger label per `?health=<value>`.
- `PROBES_STATUS_FILTER_LABELS` — Probes-page status-filter trigger label per `?status=<value>`.
- `MONITOR_TYPE_TITLES` — title per `SyntheticType` (`http` → `"HTTP/HTTPS"`, etc.).

---

## `AlertsPage` — key methods

Lives at [`pages/app/AlertsPage.ts`](../../../pages/app/AlertsPage.ts). Extends `BasePage` (its table root differs from the standard `data-table`, so it does not extend `DataTableBase`). Covers `/alerts` (Active list) and `/alerts/history`.

- Page roots: `pageRoot` (`page-alerts`), `historyPageRoot` (`page-alerts-history`); tabs: `alertsTabs`, `activeTab`, `historyTab`.
- Severity cards: `severityCard(severity)` for `critical | error | warning | info`, plus `totalCard`.
- Search + filters: `searchInput`, `historySearchInput`, `severityFilter`, `stateFilter`, `historySeverityFilter`, monitor filter (`monitorFilter`, `monitorFilterClear`, popover getters).
- Per-row (parameterized by alert id): `alertTitle`, `alertMonitor`, `alertTarget`, `alertState`, `alertTriggered`, actions (`alertActions`, `alertViewAction`, `alertAcknowledgeAction`, `alertResolveAction`).
- Bulk actions: `selectAll`, `alertSelect(id)`, `bulkResolveButton`, `bulkBar`, `bulkCount`, `bulkClear`.
- Details sheet: `detailsSheet` + close/acknowledge/resolve buttons, severity/state badges, policy/monitor links; `verifyTriggerConditionDetails(condition)`, `verifyAcknowledgedByActor(...)`, `verifyResolvedByActor(...)`.
- History view: `timeframeSelector`, metric cards, Alert Timeline chart + chart export.

---

## `InventoryPage` — key methods

Lives at [`pages/app/InventoryPage.ts`](../../../pages/app/InventoryPage.ts). Extends `DataTableBase`. Inventory ("Assets") flat list at `/inventory`, backed by the `/synthetics` endpoints.

- `open()` / `verifyPageLoaded()` / `expectInventoryListReady()` — navigate to `/inventory` and assert list-ready.
- Overview cards (double as health filters): `totalAssetsCard`, `healthyCard`, `warningCard`, `criticalCard`, `unknownCard`, `healthCard(state)`, `getAllHealthCounts()`, `verifyOverviewCards()`.
- Toolbar: `inventoryToolbar`, `searchInput`, `refreshButton`, `sourceFilter`, `typeFilter`, `sourcePills` / `sourcePill('synthetic' | 'snmp')`, `selectSourceOption(label)`.
- Rows: `getRowByName(name)`, cell getters (`getStatusBadge`, `getSourceCell`, `getLastCheckCell`, `getTargetCell`).
- Row actions (View Details, Edit, Delete): `openActionMenu(row)`, `openRowActionMenu(row, menuItem)`, `verifyActionMenuOptions()`.
- Sheets / dialog: `detailsSheet`, `editMonitorSheet` (+ `editMonitorNameInput`, `editMonitorSubmitButton` — reuses the synthetics sheets), `deleteDialog` + `deleteConfirmButton` / `deleteCancelButton` (inventory-specific `delete-asset-*` testids), `toastForAsset(name)`.

---

## `PoliciesPage` — key methods

Lives at [`pages/app/PoliciesPage.ts`](../../../pages/app/PoliciesPage.ts). Extends `DataTableBase`. Policies list — filter cards, toolbar filters, table, row actions, delete dialog, edit/details sheets.

- `open()` / `verifyPageLoaded()` — navigate to `/policies` and assert page root + table.
- Filter cards: `totalPoliciesCard`, `enabledCard`, `criticalCard`, `errorCard`, `warningCard`, `infoCard`, `severityCard(state)`, `getAllCardCounts()`, `verifyFilterCards()`, `verifyCardActive/Inactive(card)`.
- Toolbar: `searchInput` (+ `searchByText`, `clearSearch` override), `severityFilter`, `statusFilter`, type filter (searchable popover: `typeFilter`, `typeFilterSearch`, `selectTypeOption`, `selectTypeAll`, `clearTypeFilter`), `refreshButton`, `autoRefreshToggle`, `createPolicyButton`.
- Rows: `getRowByName(name)`, `typeCellForRow(row)`, `monitorTypeBadgesForRow(row)`, `openRowActionMenu(...)`, `verifyActionMenuOptions()` (View Details, Enable/Disable, Edit, Delete).
- Delete dialog: `deleteDialog`, `deleteConfirmButton`, `deleteCancelButton`; cascade tooltip: `cascadeTriggerForRow(row)`, `openCascadeTooltip(row)`.
- Sheets: `editSheet` (+ chrome), details sheet.
- Exported constants: `POLICY_SEVERITY_LABELS`, `POLICY_STATUS_LABELS`.

---

## `CreatePolicyPage` — key methods

Lives at [`pages/app/CreatePolicyPage.ts`](../../../pages/app/CreatePolicyPage.ts). Extends `BasePage`. Two-step create-policy sheet (step-1 type cards → step-2 schema form).

- Sheet chrome: `sheet`, `sheetHeading`, `closeButton`, `cancelButton`, `backButton`, `submitButton`; `openWizard()`, `selectPolicyType(id)`, `goBackToTypeSelection()`, `cancelWizard()`, `closeWizard()`.
- Step 1: `policyTypeGrid`, `typeCards`, `typeCardByTitle(title)`, `typeCardForId(id)`.
- Step 2 schema form: `schemaForm`, section getters (`basicInfoSection`, `triggerConditionSection`, `clearConditionSection`, `severityConfigurationSection`), generic helpers `fieldWrapper(name)` (wrapper testid `schema-field-<name>`) and `fieldError(name)`.
- Basic info: `nameInput`, `descriptionInput`, monitor selector (searchable popover).
- Trigger / clear conditions: metric dropdowns, `triggerOperatorSelect`, `triggerThresholdInput`, `triggerEvaluationWindowSelect`, `triggerConsecutiveCountInput`, `autoClearToggle` + clear-condition equivalents.
- Severity: `severityPicker`, `severityButton(level)`, cascade toggles/thresholds + `cascadeValidationError`, `cascadePreview`; `enabledSwitch`.
- Feedback: `successToast(policyName)`, `errorToast(policyName)`.
- Exported constants: `POLICY_TYPE_CARD_TITLES`, `POLICY_TYPE_CARD_TITLES_ORDERED`, `POLICY_EVALUATION_WINDOW_LABELS` (re-exported).

---

## `SyntheticMetricsViewPage` — key methods

Lives at [`pages/app/SyntheticMetricsViewPage.ts`](../../../pages/app/SyntheticMetricsViewPage.ts). Extends `BasePage`. Per-monitor metrics view at `/synthetics/$syntheticId` (opened from row-action "View Metrics" or a monitor name link).

- `open(syntheticId?)` / `verifyPageLoaded()`; states: `errorState`, `dataErrorState`, `emptyState`, `loadingSkeleton`.
- Header: `header`, `backButton`, `monitorNameHeading`, `protocolBadge`, `subtitleWithTarget(target)`.
- Toolbar: `probeSelectorTrigger`, `timeframeSelect`, `aggregationSelect`, `displayModeToggle` (`gridViewRadio` / `combinedViewRadio`), `refreshButton`, `autoRefreshToggle`; `openSelect(trigger)` / `selectOption(name)` helpers.
- Charts: `metricSection(groupId)`, `metricChart(metricName)`, `combinedContainer`, summary table getters, chart export (`combinedExportTrigger`, `gridCardExportTrigger(metric)`, `exportMenuItem(format)`, `openExportMenu(...)`); `waitForChartsLoaded()`.
- Exported constants: `SYNTHETIC_METRICS_AGGREGATIONS`, `METRIC_SECTION_TITLES` (per monitor type), `SYNTHETIC_METRICS_TIMEFRAMES`.

---

## `SettingsProfilePage` — key methods

Lives at [`pages/app/SettingsProfilePage.ts`](../../../pages/app/SettingsProfilePage.ts). Extends `BasePage`. Settings > Profile tab — profile card, invite banner, invite-member sheet.

- `open()` / `verifyPageLoaded()` — navigate to `/settings/profile` and assert `page-profile`.
- Structure: `pageRoot`, `settingsNav`, `settingsNavProfileItem`, `inviteBanner`, `inviteButton`.
- Invite sheet: `inviteSheet` + close/cancel/submit buttons, schema form (`firstNameField/Input`, `lastNameField/Input`, `emailField/Input` — `field-field-*` testids — plus matching `*Error` getters).
- Actions: `openInviteSheet()`, `fillInviteForm(data)`, `submitInviteForm()`, `inviteMember(data)`, `cancelInviteSheet()`, `closeInviteSheet()`.
- Feedback: `successToast(firstName, lastName)`, `errorToast`.

---

## `ReportsPage` — key methods

Lives at [`pages/app/ReportsPage.ts`](../../../pages/app/ReportsPage.ts). Extends `BasePage`. Reports page at `/reports` — purely client-side widget canvas (no API, no cleanup).

- `open()` / `verifyPageLoaded()` — navigate to `/reports` and assert the canvas.
- Canvas: `canvas`, `widgets`, `widget(index)`, `titleFor(widget)`, empty state (`emptyState`, `emptyHeading`, `emptyDescription`, `verifyEmptyState()`).
- Actions: `addWidgetButton` (role locator on the "Add Widget" label) + `addWidget()`; delete flow (`deleteActionFor(widget)`, `openDeleteDialog(widget)`, `confirmDeleteDialog`, `confirmDelete()`, `cancelDelete()`).
- PDF export: `downloadPdfButton` (role locator on "Download PDF") + `downloadPdf(): Promise<Download>` (wraps `page.waitForEvent('download')`).

---

## `LoginPage` — key methods

Lives at [`pages/util/LoginPage.ts`](../../../pages/util/LoginPage.ts). Targets the **Keycloak login page** with the custom Keycloak theme — selectors match the custom theme at `frontend/keycloak/themes/<theme>/login/login.ftl`.

- `open()` — navigate to the Keycloak login URL.
- `login(email, password)` / `loginAndVerify(email, password)` — fill credentials, submit, wait for redirect.
- Locator getters: `pageHeading`, `loginForm`, `emailInput`, `passwordInput`, `loginButton`, `forgotPasswordLink`, `rememberMeCheckbox`, `registerLink`, `fieldError`, `alertError`, `alertSuccess`.

---

## Base classes (`pages/baseClasses/`)

The directory contains exactly **two** files: `BasePage.ts` and `DataTableBase.ts`.

| Class | File | Used by |
|---|---|---|
| `BasePage` | [`BasePage.ts`](../../../pages/baseClasses/BasePage.ts) | Every app POM extends this (directly or via `DataTableBase`) — provides `loadingSpinner`, `toastNotification`, `waitForPageLoad`, `waitForApiResponse`, `verifySuccessToast`, `getCurrentUrl`, `getPageTitle`, `refresh`. |
| `DataTableBase` | [`DataTableBase.ts`](../../../pages/baseClasses/DataTableBase.ts) | Abstract base (extends `BasePage`) for pages built around the standard `data-table` component — extended by `SyntheticsPage`, `InventoryPage`, `ProbesPage`, `PoliciesPage`. Subclasses must override `get searchInput()`. |

### `DataTableBase` — API

- Table core: `dataTable` (`data-table` testid), `tableRows` (`[data-testid^='table-row-']` under `dataTable`), `noResultsMessage`, `verifyTableHasRows()`.
- Search: `searchByName(value)` / `clearSearch()` — debounced, URL-synced fill with re-fill retry (`toPass`) + `waitForTableSettled()`.
- Cells & columns: `cellForRow(row, columnId)` (`table-cell-<columnId>`), `getColumnTexts(columnId)`.
- Sorting: `getSortHeader(columnId)` (`sort-header-<columnId>`), `clickSortHeader(columnId)`.
- Pagination getters: `pageSizeSelect` (`page-size-select`), `previousPageButton` / `nextPageButton` (`getByRole('button', { name: 'Previous' | 'Next' })`), `pageInfoText`, `rowCountText`, `rowsPerPageLabel`.
- Pagination actions: `selectPageSize(size)`, `getPageInfo()`, `getSelectedPageSize()`, `goToNextPage()`, `goToPreviousPage()`.
- Stabiliser: `waitForTableSettled()` — retries until skeleton rows are gone and either rows or the no-results cell render.

---

## How to update this catalog

When adding or extending a POM, update this file in the same edit batch:

1. New POM → add a row to § Class inventory + a new section listing key methods.
2. New action method on an existing POM → add a bullet under the matching section.
3. New constant exported from a POM file → add to the constants list (e.g., `MONITOR_TYPE_TITLES` for `DashboardPage`).
4. New `pages/baseClasses/` component → add a row to § Base classes.

Catalog drift between this file and the actual code is the leading cause of duplicate POM methods being authored. Verify with `grep -r "<methodName>" pages/` before adding a "new" method.
