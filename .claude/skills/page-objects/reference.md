---
description: POM key-method catalog and inventory for the platform automation framework
---

# Page Objects — Reference

Companion file to [`SKILL.md`](SKILL.md). This catalogs **what already exists** on each page object so authors don't reinvent locators / actions that are already there. Update this file when adding a new POM or extending an existing one.

## Contents

- [Class inventory (fixture → class → file)](#class-inventory-fixture--class--file)
- [`JobsPage` — key methods](#jobspage--key-methods)
- [`CreateJobPage` — key methods](#createjobpage--key-methods)
- [`SideNavigation` — key methods](#sidenavigation--key-methods)
- [`WorkersPage` — key methods](#workerspage--key-methods)
- [`RunStatsPage` — key methods](#runstatspage--key-methods)
- [`DashboardPage` — key methods](#dashboardpage--key-methods)
- [`NotificationsPage` — key methods](#notificationspage--key-methods)
- [`InventoryPage` — key methods](#inventorypage--key-methods)
- [`NotificationRulesPage` — key methods](#notificationrulespage--key-methods)
- [`CreateNotificationRulePage` — key methods](#createnotificationrulepage--key-methods)
- [`JobRunStatsViewPage` — key methods](#jobrunstatsviewpage--key-methods)
- [`SettingsProfilePage` — key methods](#settingsprofilepage--key-methods)
- [`ReportsPage` — key methods](#reportspage--key-methods)
- [`LoginPage` — key methods](#loginpage--key-methods)
- [Base classes (`pages/baseClasses/`)](#base-classes-pagesbaseclasses)
- [How to update this catalog](#how-to-update-this-catalog)

---

## Class inventory (fixture → class → file)

| Fixture | Class | File |
|---|---|---|
| `loginPage` | `LoginPage` | `pages/util/LoginPage.ts` |
| `sideNavigation` | `SideNavigation` | `pages/app/SideNavigation.ts` |
| `notificationsPage` | `NotificationsPage` | `pages/app/NotificationsPage.ts` |
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

`resetStorageState` is also exported from `fixtures/pom/page-object-fixture.ts` — call it in `beforeEach` for unauthenticated flows.

---

## `JobsPage` — key methods

Lives at `pages/app/JobsPage.ts`.

- `open()` — navigate to `/jobs` and wait for list-ready signal.
- `verifyPageLoaded()` — assert `page-jobs` root + table chrome.
- `getRowByName(name)` → `Locator` — filter table rows by visible text. Excludes `[data-testid="expanded-row"]` to avoid strict-mode double-matches when a row is expanded.
- `openRowActionMenu(row, menuItem)` — opens the per-row "…" menu and clicks the named item (`Edit job`, `View details`, `Delete`). Wrapped in `expect(async () => { … }).toPass({ timeout: appConfig.timeouts.retryBlock })` because the menu trigger occasionally needs a re-click on slow CI.
- `searchByName(name)` / `clearSearch()` — **inherited from `DataTableBase`** (debounced fill with re-fill retry + `waitForTableSettled`); `JobsPage` only overrides `get searchInput()`.
- `expandRow(row)` / `collapseRow(row)` — toggle the expanded-row UI.
- `getAllJobStatusCounts()` → `{ total, passing, degraded, failing, paused }` — read all 5 job-status stat cards. **Always wrap in `expect(async () => { … }).toPass(...)` when comparing across counters** (see `selectors/patterns.md` P18).
- `expectJobsListReady()` — composite ready-state assertion (page root + table or empty state).
- Generic timing helpers (parameterized; reused across HTTP / SFTP / stream detail-view specs):
  - `timingLegendItemIn(card, label)`, `timingLegendItemsIn(card)`, `timingLegendColorDot(card, label)`
  - `timingStackedBarIn(card)`, `timingStackedBarSegmentsIn(card)`, `timingScaleTotalMsIn(card)`
  - `getTimingSegmentMsIn(card, label)`
  - `verifyInlineMsLabels(card, segments)` — asserts the >10% threshold rule (large segments must show the ms label, sub-10% segments must not).

---

## `CreateJobPage` — key methods

Lives at `pages/app/CreateJobPage.ts`. Shared across HTTP, `export`, stream, SFTP, email, backup, webhook create/edit flows.

- `fillHttpJobForm(data)`, `fillExportJobForm(data)`, `fillStreamJobForm(data)`, … — per-type form fillers. Use the matching `buildCreate<TYPE>JobBody` from `helpers/app/jobs.ts` to build `data`.
- `jobTypeCard(type)` → `Locator` — step-1 type chooser card (cards share `job-type-card` testid; scope by title text).
- `waitForTypeSelection()` — wait for the step-1 grid to render.
- `waitForConfigureForm()` — wait for the step-2 form to render after a type is picked.
- `selectDropdownOption(field, label)` — pick an option in a Radix select inside the form.
- `expandExportSettings()` — open the `export`-specific collapsible section.
- `enableRunStepRecording()` — toggle the record-run-steps switch (`export` only).
- `submit()` — submit the create form, wait for the API response, assert success toast.
- `fieldInput(fieldPath)` / `fieldError(fieldName)` — generic schema-form helpers (matches the `field-field-${path}` / `error-${name}` testid contract); `schemaField(fieldName)` targets the `schema-field-${name}` field wrapper.

---

## `SideNavigation` — key methods

Lives at `pages/app/SideNavigation.ts`. Does **not** extend `BasePage` — sidebar is a shell component, not a page.

- `navigateToApp()` — navigate to `/` and wait for the sidebar to render.
- `navigateToJobs()`, `navigateToRunStats()`, `navigateToDashboard()`, `navigateToReports()`, `navigateToInventory()`, `navigateToNotificationRules()`, `navigateToSettings()` — click the matching nav link (`nav-link-<feature>` testid) and wait for the destination page root.
- `navigateToNotifications()` — click the header notifications bell (`header-notifications-bell`) and wait for `page-notifications`.
- `navigateToWorkers()`, `navigateToProfile()` / `navigateToSettingsProfile()` — Settings sub-nav flows: click Settings, then the `settings-nav-item-workers` / `settings-nav-item-profile` item, wait for the destination page root.

Locator getters: `sidebar`, `logo`, `dashboard`, `runStats`, `jobs`, `inventory`, `reports`, `notificationRules`, `notificationsBell`, `settings`.

---

## `WorkersPage` — key methods

Lives at `pages/app/WorkersPage.ts`. Extends `DataTableBase`. Status cards + filters + table + register / edit / details / download-config sheets.

- `open()` / `verifyPageLoaded()` — navigate to `/settings/workers` and assert the page root.
- Status cards: `totalWorkersCard`, `onlineCard`, `offlineCard`, `provisioningCard` (scope `status-card` by title text); `getAllStatusCounts()`, `verifyStatusCards()`, `verifyStatusCardCounts()`.
- Search: `searchByName(query)` / `clearSearch()` — **overridden** with a plain `fill`/`clear` (frontend debounces client-side), unlike the retrying `DataTableBase` version.
- Filters: `statusFilter`, `typeFilter`, `selectStatusOption(label)`, `selectTypeOption(label)`, `selectFilterOption(filter, label)`, `verifyFilterDropdownOptions(...)`.
- Toolbar: `registerWorkerButton`, `refreshButton`, `autoRefreshToggle`, `verifyToolbarControls()`.
- Table: `verifyTableHasRows()`, `verifyNoResults()`, `verifyTableColumns()`, `verifyAllRowsContainText(regex)`, `getTotalRowCount()`, `getExpectedVisibleRows()`, `verifyPaginationControls()`. Sorting and pagination actions (`clickSortHeader`, `selectPageSize`, `goToNextPage`, `goToPreviousPage`) are inherited from `DataTableBase`.
- Row actions: `openRowActionMenu(row, menuItem)`, `openFirstRowActionMenu()`, `verifyActionMenuOptions()`.
- Sheets: `registerWorkerSheet` (chrome: close/cancel/continue/back/submit/done buttons, `registerStepIndicator`, name/location/region fields + errors, `openRegisterWorkerSheet()`), `editWorkerSheet` (close/cancel/submit + read-only `editWorkerIdField`), `detailsSheet` (+ `detailsCloseButton`), `downloadConfigSheet` (+ close/cancel/submit buttons).
- Delete dialog: `deleteDialog`, `deleteConfirmButton`, `deleteCancelButton`.

---

## `RunStatsPage` — key methods

Lives at `pages/app/RunStatsPage.ts`. Job picker, run-stat selection, chart toolbar, expanded dialog.

- `open()` / `verifyPageLoaded()` — navigate to `/run-stats` and assert the page root.
- Job selection: `selectJob(name)`, `clearJobSelection()`.
- Run-stat selection: `selectRunStat(name)`, `selectedRunStats` getter (returns the set of currently-selected run-stat chips).
- Chart toolbar: `selectTimeframe(label)`, `toggleAutoRefresh()`, `manualRefresh()`.
- Expanded dialog: `openExpandedDialog()`, `closeExpandedDialog()`.

---

## `DashboardPage` — key methods

Lives at `pages/app/DashboardPage.ts`. Read-only landing page (route `/`) — Active notifications / Jobs / Workers / Type Breakdown / Quick Actions sections.

- `open()` — navigate to `/` and wait for `page-dashboard` root.
- `verifyPageLoaded()` — minimal ready-state assertion (page root + page title visible).
- `verifyAllSectionsVisible()` — assert each of the 5 section wrappers + matching `<h2>` headings.
- `verifyActiveNotificationsSectionBeforeJobs()` — assert Notifications renders above Jobs in DOM order.
- Section getters: `pageRoot`, `pageTitle`, `notificationsSection`, `jobsSection`, `workersSection`, `jobTypesSection`, `quickActionsSection`.
- Section heading: `sectionHeading(name)` — `getByRole("heading", { level: 2, name })`.
- Notifications stat cards: `notificationsCard(key)` for `key ∈ { total, critical, error, warning, info }`; `getAllNotificationsCounts()`, `verifyNotificationsCards()`, `clickNotificationsCard(key)`.
- Jobs stat cards: `jobsCard(key)` for `key ∈ { total, passing, degraded, failing, paused }`.
- Workers stat cards: `workersCard(key)` for `key ∈ { total, online, offline, provisioning }`.
- Job-type bars: `jobTypeBar(type)` (only rendered when `count > 0`).
- Quick-action cards: `quickAction(key)` for `key ∈ { view-notifications, add-job, manage-workers, view-run-stats }`; `verifyQuickActions()`, `clickQuickAction(key)`.

Public constants exported from the same file (used by the dashboard spec):
- `NOTIFICATIONS_CARD_TITLES` — visible card titles per `NotificationsCardKey`.
- `JOBS_CARD_TITLES` — visible card titles per `JobsCardKey`.
- `WORKERS_CARD_TITLES` — visible card titles per `WorkersCardKey`.
- `QUICK_ACTIONS` — card title + description + destination path per `QuickActionKey`.
- `NOTIFICATIONS_SEVERITY_FILTER_LABELS` — Notifications-page severity-filter trigger label per `?severity=<value>`.
- `OUTCOME_FILTER_LABELS` — Jobs list-page outcome-filter trigger label per `?jobStatus=<value>`.
- `WORKERS_STATUS_FILTER_LABELS` — Workers-page status-filter trigger label per `?status=<value>`.
- `JOB_TYPE_TITLES` — title per `JobType` (`http` → `"HTTP/HTTPS"`, etc.).

---

## `NotificationsPage` — key methods

Lives at `pages/app/NotificationsPage.ts`. Extends `BasePage` (its table root differs from the standard `data-table`, so it does not extend `DataTableBase`). Covers `/notifications` (Active list) and `/notifications/history`.

- Page roots: `pageRoot` (`page-notifications`), `historyPageRoot` (`page-notifications-history`); tabs: `notificationsTabs`, `activeTab`, `historyTab`.
- Severity cards: `severityCard(severity)` for `critical | error | warning | info`, plus `totalCard`.
- Search + filters: `searchInput`, `historySearchInput`, `severityFilter`, `stateFilter`, `historySeverityFilter`, job filter (`jobFilter`, `jobFilterClear`, popover getters).
- Per-row (parameterized by notification id): `notificationTitle`, `notificationJob`, `notificationTarget`, `notificationState`, `notificationTriggered`, actions (`notificationActions`, `notificationViewAction`, `notificationAcknowledgeAction`, `notificationResolveAction`).
- Bulk actions: `selectAll`, `notificationSelect(id)`, `bulkResolveButton`, `bulkBar`, `bulkCount`, `bulkClear`.
- Details sheet: `detailsSheet` + close/acknowledge/resolve buttons, severity/state badges, notification-rule/job links; `verifyTriggerConditionDetails(condition)`, `verifyAcknowledgedByActor(...)`, `verifyResolvedByActor(...)`.
- History view: `timeframeSelector`, count cards, Notification Timeline chart + chart export.

---

## `InventoryPage` — key methods

Lives at `pages/app/InventoryPage.ts`. Extends `DataTableBase`. Inventory ("Assets") flat list at `/inventory`, backed by the `/jobs` endpoints.

- `open()` / `verifyPageLoaded()` / `expectInventoryListReady()` — navigate to `/inventory` and assert list-ready.
- Overview cards (double as job-status filters): `totalAssetsCard`, `passingCard`, `degradedCard`, `failingCard`, `pausedCard`, `jobStatusCard(jobStatus)`, `getAllJobStatusCounts()`, `verifyOverviewCards()`.
- Toolbar: `inventoryToolbar`, `searchInput`, `refreshButton`, `sourceFilter`, `typeFilter`, `sourcePills` / `sourcePill('job' | 'manual')`, `selectSourceOption(label)`.
- Rows: `getRowByName(name)`, cell getters (`getStatusBadge`, `getSourceCell`, `getLastRunCell`, `getTargetCell`).
- Row actions (View Details, Edit, Delete): `openActionMenu(row)`, `openRowActionMenu(row, menuItem)`, `verifyActionMenuOptions()`.
- Sheets / dialog: `detailsSheet`, `editJobSheet` (+ `editJobNameInput`, `editJobSubmitButton` — reuses the jobs sheets), `deleteDialog` + `deleteConfirmButton` / `deleteCancelButton` (inventory-specific `delete-asset-*` testids), `toastForAsset(name)`.

---

## `NotificationRulesPage` — key methods

Lives at `pages/app/NotificationRulesPage.ts`. Extends `DataTableBase`. Notification-rules list — filter cards, toolbar filters, table, row actions, delete dialog, edit/details sheets.

- `open()` / `verifyPageLoaded()` — navigate to `/notification-rules` and assert page root + table.
- Filter cards: `totalNotificationRulesCard`, `enabledCard`, `criticalCard`, `errorCard`, `warningCard`, `infoCard`, `severityCard(state)`, `getAllCardCounts()`, `verifyFilterCards()`, `verifyCardActive/Inactive(card)`.
- Toolbar: `searchInput` (+ `searchByText`, `clearSearch` override), `severityFilter`, `statusFilter`, type filter (searchable popover: `typeFilter`, `typeFilterSearch`, `selectTypeOption`, `selectTypeAll`, `clearTypeFilter`), `refreshButton`, `autoRefreshToggle`, `createNotificationRuleButton`.
- Rows: `getRowByName(name)`, `typeCellForRow(row)`, `jobTypeBadgesForRow(row)`, `openRowActionMenu(...)`, `verifyActionMenuOptions()` (View Details, Enable/Disable, Edit, Delete).
- Delete dialog: `deleteDialog`, `deleteConfirmButton`, `deleteCancelButton`; cascade tooltip: `cascadeTriggerForRow(row)`, `openCascadeTooltip(row)`.
- Sheets: `editSheet` (+ chrome), details sheet.
- Exported constants: `NOTIFICATION_RULE_SEVERITY_LABELS`, `NOTIFICATION_RULE_STATUS_LABELS`.

---

## `CreateNotificationRulePage` — key methods

Lives at `pages/app/CreateNotificationRulePage.ts`. Extends `BasePage`. Two-step create-notification-rule sheet (step-1 type cards → step-2 schema form).

- Sheet chrome: `sheet`, `sheetHeading`, `closeButton`, `cancelButton`, `backButton`, `submitButton`; `openWizard()`, `selectNotificationRuleType(id)`, `goBackToTypeSelection()`, `cancelWizard()`, `closeWizard()`.
- Step 1: `notificationRuleTypeGrid`, `typeCards`, `typeCardByTitle(title)`, `typeCardForId(id)`.
- Step 2 schema form: `schemaForm`, section getters (`basicInfoSection`, `triggerConditionSection`, `clearConditionSection`, `severityConfigurationSection`), generic helpers `fieldWrapper(name)` (wrapper testid `schema-field-<name>`) and `fieldError(name)`.
- Basic info: `nameInput`, `descriptionInput`, job selector (searchable popover).
- Trigger / clear conditions: run-stat dropdowns, `triggerOperatorSelect`, `triggerThresholdInput`, `triggerEvaluationWindowSelect`, `triggerConsecutiveCountInput`, `autoClearToggle` + clear-condition equivalents.
- Severity: `severityPicker`, `severityButton(level)`, cascade toggles/thresholds + `cascadeValidationError`, `cascadePreview`; `enabledSwitch`.
- Feedback: `successToast(notificationRuleName)`, `errorToast(notificationRuleName)`.
- Exported constants: `NOTIFICATION_RULE_TYPE_CARD_TITLES`, `NOTIFICATION_RULE_TYPE_CARD_TITLES_ORDERED`, `NOTIFICATION_RULE_EVALUATION_WINDOW_LABELS` (re-exported).

---

## `JobRunStatsViewPage` — key methods

Lives at `pages/app/JobRunStatsViewPage.ts`. Extends `BasePage`. Per-job run-stats view at `/jobs/$jobId` (opened from row-action "View Run Stats" or a job name link).

- `open(jobId?)` / `verifyPageLoaded()`; states: `errorState`, `dataErrorState`, `emptyState`, `loadingSkeleton`.
- Header: `header`, `backButton`, `jobNameHeading`, `jobTypeBadge`, `subtitleWithTarget(target)`.
- Toolbar: `workerSelectorTrigger`, `timeframeSelect`, `aggregationSelect`, `displayModeToggle` (`gridViewRadio` / `combinedViewRadio`), `refreshButton`, `autoRefreshToggle`; `openSelect(trigger)` / `selectOption(name)` helpers.
- Charts: `runStatSection(groupId)`, `runStatChart(runStatName)`, `combinedContainer`, summary table getters, chart export (`combinedExportTrigger`, `gridCardExportTrigger(runStat)`, `exportMenuItem(format)`, `openExportMenu(...)`); `waitForChartsLoaded()`.
- Exported constants: `JOB_RUN_STATS_AGGREGATIONS`, `RUN_STAT_SECTION_TITLES` (per job type), `JOB_RUN_STATS_TIMEFRAMES`.

---

## `SettingsProfilePage` — key methods

Lives at `pages/app/SettingsProfilePage.ts`. Extends `BasePage`. Settings > Profile tab — profile card, invite banner, invite-member sheet.

- `open()` / `verifyPageLoaded()` — navigate to `/settings/profile` and assert `page-profile`.
- Structure: `pageRoot`, `settingsNav`, `settingsNavProfileItem`, `inviteBanner`, `inviteButton`.
- Invite sheet: `inviteSheet` + close/cancel/submit buttons, schema form (`firstNameField/Input`, `lastNameField/Input`, `emailField/Input` — `field-field-*` testids — plus matching `*Error` getters).
- Actions: `openInviteSheet()`, `fillInviteForm(data)`, `submitInviteForm()`, `inviteMember(data)`, `cancelInviteSheet()`, `closeInviteSheet()`.
- Feedback: `successToast(firstName, lastName)`, `errorToast`.

---

## `ReportsPage` — key methods

Lives at `pages/app/ReportsPage.ts`. Extends `BasePage`. Reports page at `/reports` — purely client-side widget canvas (no API, no cleanup).

- `open()` / `verifyPageLoaded()` — navigate to `/reports` and assert the canvas.
- Canvas: `canvas`, `widgets`, `widget(index)`, `titleFor(widget)`, empty state (`emptyState`, `emptyHeading`, `emptyDescription`, `verifyEmptyState()`).
- Actions: `addWidgetButton` (role locator on the "Add Widget" label) + `addWidget()`; delete flow (`deleteActionFor(widget)`, `openDeleteDialog(widget)`, `confirmDeleteDialog`, `confirmDelete()`, `cancelDelete()`).
- PDF export: `downloadPdfButton` (role locator on "Download PDF") + `downloadPdf(): Promise<Download>` (wraps `page.waitForEvent('download')`).

---

## `LoginPage` — key methods

Lives at `pages/util/LoginPage.ts`. Targets the **Keycloak login page** with the custom Keycloak theme — selectors match the custom theme at `frontend/keycloak/themes/<theme>/login/login.ftl`.

- `open()` — navigate to the Keycloak login URL.
- `login(email, password)` / `loginAndVerify(email, password)` — fill credentials, submit, wait for redirect.
- Locator getters: `pageHeading`, `loginForm`, `emailInput`, `passwordInput`, `loginButton`, `forgotPasswordLink`, `rememberMeCheckbox`, `registerLink`, `fieldError`, `alertError`, `alertSuccess`.

---

## Base classes (`pages/baseClasses/`)

The directory contains exactly **two** files: `BasePage.ts` and `DataTableBase.ts`.

| Class | File | Used by |
|---|---|---|
| `BasePage` | `BasePage.ts` | Every app POM extends this (directly or via `DataTableBase`) — provides `loadingSpinner`, `toastNotification`, `waitForPageLoad`, `waitForApiResponse`, `verifySuccessToast`, `getCurrentUrl`, `getPageTitle`, `refresh`. |
| `DataTableBase` | `DataTableBase.ts` | Abstract base (extends `BasePage`) for pages built around the standard `data-table` component — extended by `JobsPage`, `InventoryPage`, `WorkersPage`, `NotificationRulesPage`. Subclasses must override `get searchInput()`. |

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
3. New constant exported from a POM file → add to the constants list (e.g., `JOB_TYPE_TITLES` for `DashboardPage`).
4. New `pages/baseClasses/` component → add a row to § Base classes.

Catalog drift between this file and the actual code is the leading cause of duplicate POM methods being authored. Verify with `grep -r "<methodName>" pages/` before adding a "new" method.
