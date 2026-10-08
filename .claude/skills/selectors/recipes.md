# Selectors — Recipes

End-to-end recipes for the most common UI structures in this framework. Each recipe gives the exact locator shape, when to use it, and a complete user-flow method that follows the POM Method Standards in [`page-objects`](../page-objects/SKILL.md).

Cross-link from [SKILL.md](SKILL.md). For locator-by-locator API reference, see [reference.md](reference.md). For good/bad code, see [patterns.md](patterns.md).

## Recipe index

1. [Tables — row by name, cell by column](#1-tables--row-by-name-cell-by-column)
2. [Right-side sheets (Create / Edit Job)](#2-right-side-sheets-create--edit-job)
3. [Component-library dropdowns / Radix selects](#3-component-library-dropdowns--radix-selects)
4. [Confirmation modals & delete dialogs](#4-confirmation-modals--delete-dialogs)
5. [Toasts / Sonner notifications](#5-toasts--sonner-notifications)
6. [iframes — prescriptive](#6-iframes--prescriptive)
7. [Sidebar navigation](#7-sidebar-navigation)
8. [Pagination](#8-pagination)
9. [File downloads / uploads](#9-file-downloads--uploads)
10. [Tabs and tabpanels](#10-tabs-and-tabpanels)
11. [OTP / multi-input keystroke flows — prescriptive](#11-otp--multi-input-keystroke-flows--prescriptive)
12. [Hover-revealed menus — prescriptive](#12-hover-revealed-menus--prescriptive)
13. [Network-confirmed actions](#13-network-confirmed-actions)
14. [Multi-page (popup) flows — prescriptive](#14-multi-page-popup-flows--prescriptive)
15. [Searching and filtering](#15-searching-and-filtering)
16. [Async row creation (waiting for the new row)](#16-async-row-creation-waiting-for-the-new-row)
17. [POM vs spec — the placement decision in one flow](#17-pom-vs-spec--the-placement-decision-in-one-flow)

---

## 1. Tables — row by name, cell by column

When the table has a `data-testid="data-table"` wrapper and per-row `table-row-<id>` prefix testids. This is exactly what `DataTableBase` provides — extend it for any table-bearing page instead of re-rolling these getters.

```typescript
get dataTable(): Locator {
    return this.page.getByTestId('data-table');
}

// Rows carry a per-id prefix testid (`table-row-<id>`), matched via prefix CSS
// anchored under the table root — DataTableBase.ts:29.
get tableRows(): Locator {
    return this.dataTable.locator("[data-testid^='table-row-']");
}

getRowByName(name: string): Locator {
    // Excludes `<tr data-testid="expanded-row">` siblings to avoid strict-mode
    // double-matches when the row above is expanded.
    return this.page
        .locator('tbody tr:not([data-testid="expanded-row"])')
        .filter({ hasText: name });
}

// Column header by testid (sortable headers).
getSortHeader(columnId: string): Locator {
    return this.page.getByTestId(`sort-header-${columnId}`);
}

// Per-cell lookup by column id (`table-cell-<columnId>`) — DataTableBase.
cellForRow(row: Locator, columnId: string): Locator {
    return row.getByTestId(`table-cell-${columnId}`);
}

async getColumnTexts(columnId: string): Promise<string[]> {
    const cells = this.tableRows.getByTestId(`table-cell-${columnId}`);
    const count = await cells.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
        texts.push((await cells.nth(i).innerText()).trim());
    }
    return texts;
}
```

When you must iterate rows (preferred — anchored on the row testid, value asserted by content):

```typescript
async verifyAllRowsContainText(text: RegExp): Promise<void> {
    const rowCount = await this.tableRows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
        await expect(this.tableRows.nth(i)).toContainText(text);
    }
}
```

Asserting "no row exists for X":

```typescript
await expect(this.dataTable.getByText(deletedName)).toBeHidden();
```

Per-cell column testids (`table-cell-<columnId>`) exist today — any remaining column-index lookup (`.locator('td').nth(n)`) is legacy and should migrate to `cellForRow(row, columnId)` / `getColumnTexts(columnId)` from `DataTableBase` when next touched:

```typescript
async verifyEachRowContains(value: string, columnId: string): Promise<void> {
    await expect(this.tableRows).not.toHaveCount(0);
    const rowCount = await this.tableRows.count();
    for (let i = 0; i < rowCount; i++) {
        await expect(this.cellForRow(this.tableRows.nth(i), columnId)).toContainText(value);
    }
}
```

## 2. Right-side sheets (Create / Edit Job)

Standard shape: a sheet opens after clicking "Create Job" or a per-row "Edit job" menu item, contains a step-1 type picker (for create) and a schema-form, ends with `create-button` / `cancel-button` / `back-button` / `close-button`.

```typescript
get createJobButton(): Locator {
    return this.page.getByTestId('create-job-button');
}
get createJobSheet(): Locator {
    return this.page.getByTestId('create-job-sheet');
}
get jobTypeGrid(): Locator {
    return this.page.getByTestId('job-type-grid');
}
exportTypeCard(): Locator {
    return this.jobTypeGrid
        .getByTestId('job-type-card')
        .filter({ hasText: /Export|CSV/i });
}
get schemaForm(): Locator {
    return this.page.getByTestId('schema-form');
}
get jobNameInput(): Locator {
    return this.page.getByLabel('Job Name', { exact: true });
}
get targetInput(): Locator {
    return this.page.getByLabel('Target', { exact: true });
}
get createJobSubmitButton(): Locator {
    return this.page.getByTestId('create-button');
}
get cancelButton(): Locator {
    return this.page.getByTestId('cancel-button');
}

async createExportJobFromSheet(data: {
    name: string;
    target: string;
    runIntervalLabel: string;
    timeout: number;
    submit: boolean;
}): Promise<void> {
    await this.createJobButton.click();
    await expect(this.createJobSheet).toBeVisible();

    await expect(this.jobTypeGrid).toBeVisible();
    await this.exportTypeCard().click();
    await expect(this.schemaForm).toBeVisible();

    await this.jobNameInput.fill(data.name);
    await expect(this.jobNameInput).toHaveValue(data.name);

    await this.targetInput.fill(data.target);
    await expect(this.targetInput).toHaveValue(data.target);

    await this.selectRunIntervalOption(data.runIntervalLabel);
    await this.timeoutInput.fill(String(data.timeout));
    await this.timeoutInput.blur();

    await expect(this.createJobSubmitButton).toBeEnabled({ timeout: appConfig.timeouts.persist });

    if (data.submit) {
        await this.createJobSubmitButton.click();
        await expect(this.createJobSheet).toBeHidden({ timeout: appConfig.timeouts.persist });
    } else {
        await this.cancelButton.click();
        await expect(this.createJobSheet).toBeHidden();
    }
}
```

Rules:
- Always assert the sheet is visible *before* selecting the job type, and the schema-form is visible *before* filling.
- After every `fill`, assert `toHaveValue` (Radix-wrapped inputs occasionally drop characters under fast input).
- Submit button is asserted `toBeEnabled` BEFORE the click — schema-form validation lights it up only after every required field passes.
- Click → assert sheet hidden. Network confirmation is added on top via Recipe 13 when the spec needs to read back the new job.

## 3. Component-library dropdowns / Radix selects

Pattern: Radix `<Select>` exposes a `SelectTrigger` (testid on the trigger or its wrapper) and a `SelectContent` (`data-testid="select-content"`) containing `SelectItem`s (`data-testid="select-item"`). Older selects use a `getByRole('option')` listbox.

```typescript
get runIntervalSelectTrigger(): Locator {
    return this.page.getByTestId('field-field-runInterval');
}

async selectRunIntervalOption(optionLabel: string): Promise<void> {
    const trigger = this.runIntervalSelectTrigger;
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeVisible();

    const openDropdown = async (): Promise<Locator> => {
        const content = this.page.getByTestId('select-content').last();
        await trigger.click();
        try {
            await expect(content).toBeVisible({ timeout: appConfig.timeouts.fastFail });
            return content;
        } catch {
            // eslint-disable-next-line playwright/no-force-option -- Radix select trigger
            await trigger.click({ force: true });
            await expect(content).toBeVisible({ timeout: appConfig.timeouts.fastFail });
            return content;
        }
    };

    const content = await openDropdown();
    const escaped = optionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const item = content
        .getByTestId('select-item')
        .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) });
    await expect(item.first()).toBeVisible({ timeout: appConfig.timeouts.uiResponse });
    await item.first().scrollIntoViewIfNeeded();
    await item.first().click();
}
```

From `pages/app/JobsPage.ts` `selectRunIntervalOption`. The "open with retry" wrapper is necessary because Radix occasionally swallows the first click on a stubborn trigger.

For toolbar filters that use `getByRole('option')` (status / type / outcome filters):

```typescript
async selectFilterOption(filter: Locator, label: string): Promise<void> {
    await filter.click();
    await expect(this.page.getByRole('listbox')).toBeVisible();
    await this.page.getByRole('option', { name: label, exact: true }).click();
    await expect(filter).toContainText(label);
}
```

Rules:
- The chain `getByTestId('field-field-<fieldPath>')` (the input/trigger testid) → click → drill into `getByTestId('select-content')` → `getByTestId('select-item')` is the agreed **fallback** for schema-form Radix selects, for when the role path fails (try `getByRole('combobox', { name })`, then `getByRole('option', { name, exact: true })` inside the open `listbox`, first); do not invent other variations. (`schema-field-<fieldName>` is the field *wrapper*, not the trigger.)
- For non-schema-form selects (toolbar filters, page-size), `getByRole('option', { name, exact: true })` is fine because the listbox is `role="listbox"` with proper option roles.
- Confirm selection with the trigger's visible value or by re-opening and asserting the chosen item carries `data-state="checked"`.
- Never click an option without first asserting `select-content` (or the listbox) is visible.

## 4. Confirmation modals & delete dialogs

There is no generic confirmation-modal base class in `pages/baseClasses/` — every delete flow uses **per-feature dialog testids** following the same `delete-<feature>-dialog` / `-confirm` / `-cancel` shape.

### 4.1 Per-feature confirm-delete dialog (Reports delete-widget)

The frontend's shared confirm-delete dialog component renders with a per-feature `testId` — on the Reports page it's `delete-widget`. Verified against `pages/app/ReportsPage.ts`:

```typescript
get confirmDeleteDialog(): Locator {
    return this.page.getByTestId('delete-widget-dialog');
}
get confirmDeleteButton(): Locator {
    return this.page.getByTestId('delete-widget-confirm');
}
get cancelDeleteButton(): Locator {
    return this.page.getByTestId('delete-widget-cancel');
}

async openDeleteDialog(widget: Locator): Promise<void> {
    await this.deleteActionFor(widget).click();
    await expect(this.confirmDeleteDialog).toBeVisible();
}

async confirmDelete(): Promise<void> {
    await this.confirmDeleteButton.click();
    await expect(this.confirmDeleteDialog).toBeHidden();
}
```

`WorkersPage` follows the identical shape with `delete-worker-dialog` / `delete-worker-confirm` / `delete-worker-cancel`.

### 4.2 Jobs-specific delete dialog

The jobs list ships its own delete dialog with a dedicated testid, following the same per-feature shape:

```typescript
get deleteDialog(): Locator {
    return this.page.getByTestId('delete-job-dialog');
}
get deleteConfirmButton(): Locator {
    return this.page.getByTestId('delete-job-confirm');
}
get deleteCancelButton(): Locator {
    return this.deleteDialog.getByRole('button', { name: /cancel/i });
}

async deleteJobByName(name: string): Promise<void> {
    const row = this.getRowByName(name);
    await this.openRowActionMenu(row, 'Delete');
    await expect(this.deleteDialog).toBeVisible();
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialog).toBeHidden();
}
```

Rules:
- Cancel via the inner role-based locator (scoped to the dialog), confirm via the dedicated `delete-job-confirm` testid.
- Always assert `toBeHidden` after confirmation — the row visibility check follows separately (Recipe 16).

## 5. Toasts / Sonner notifications

This framework uses [Sonner](https://sonner.emilkowal.ski/) for all in-app notifications. Each toast renders with `role="status"` (and a `data-sonner-toast` attribute, the fallback hook), and toasts **stack** (several can be on screen at once), so always filter by the message. Confirm the role on your build before switching an existing toast locator (`npx playwright open`, inspect the toast) — if it isn't there, use the `[data-sonner-toast]` fallback.

```typescript
async expectSuccessToastForJob(name: string): Promise<void> {
    const toast = this.page.getByRole('status').filter({ hasText: name });
    await expect(toast).toBeVisible({ timeout: appConfig.timeouts.persist });
    await expect(toast).toContainText(/created successfully/i);
}
```

From `pages/app/JobsPage.ts`. Filtering by the job name first protects against a second toast firing in the same window (e.g. an auto-refresh "Loaded N jobs" toast).

For a generic per-event toast assertion:

```typescript
class SonnerToast {
    private readonly container: Locator;

    constructor(private page: Page) {
        this.container = this.page.locator('[data-sonner-toast]');
    }

    forText(expected: string | RegExp): Locator {
        return this.container.filter({ hasText: expected }).first();
    }

    async assertVisibleWith(expected: string | RegExp): Promise<void> {
        await expect(this.forText(expected)).toBeVisible({ timeout: appConfig.timeouts.persist });
    }

    async assertDismissed(expected: string | RegExp): Promise<void> {
        // Sonner toasts auto-dismiss; await before continuing the flow.
        await expect(this.forText(expected)).toBeHidden({ timeout: appConfig.timeouts.uiResponse });
    }
}
```

Rules:
- If two toasts can stack (create + auto-refresh), filter by the unique part of the message (the job name) — `page.locator('[data-sonner-toast]')` standalone will trip strict-mode.
- Always assert `toBeHidden` if the next test step depends on the toast being gone (it occludes click targets near the corner of the viewport).
- Invented `notification-success` / `notification-error` testids do **not** exist in the actual Sonner DOM — always use the data-attribute filter shape above.

## 6. iframes — prescriptive

The framework today does **not** mount any iframes. Keycloak login is rendered as a full page; no third-party widgets are embedded. The recipe below is reserved for the first iframe that ships:

### Single iframe with a stable title

```typescript
class EmbeddedKeycloakLogin {
    private frameLocator: FrameLocator;

    constructor(readonly page: Page) {
        this.frameLocator = page.frameLocator('iframe[title="Login Iframe"]');
    }

    get emailInput(): Locator {
        return this.frameLocator.getByRole('textbox', { name: 'Email' });
    }
    get submitButton(): Locator {
        return this.frameLocator.getByRole('button', { name: 'Sign in' });
    }
}
```

### Disambiguating when more than one iframe is present

Use `[title=…]` / `[name=…]` / `[id=…]` / `[src*=…]` in priority order. Bare `frameLocator('iframe')` is forbidden — the moment a chat widget, analytics pixel, or Stripe popup mounts a second iframe, the wrapper picks the wrong one.

### Asserting iframe-internal navigation

```typescript
await expect(
    this.frameLocator.getByRole('heading', { name: 'Verification complete' })
).toBeVisible({ timeout: appConfig.timeouts.longPoll });
```

Rules:
- Avoid bare `frameLocator('iframe')` in any new code.
- A `FrameLocator` is not a `Locator` — helpers typed for `Locator` cannot accept it directly. Expose specific getters that return chained `Locator`s instead.
- For nested iframes, chain: `frame.frameLocator('iframe[id="inner"]')`.

## 7. Sidebar navigation

Pattern: click sidebar link → wait for URL → assert page shell visible. Driven by `pages/app/SideNavigation.ts`.

```typescript
get jobs(): Locator {
    return this.page.getByTestId('nav-link-jobs');
}

async navigateToJobs(): Promise<void> {
    await this.jobs.click();
    await this.page.waitForURL(/\/jobs(\?|$)/);
    await expect(this.page.getByTestId('page-jobs')).toBeVisible();
}

async navigateToWorkers(): Promise<void> {
    await this.settings.click();
    await this.page.waitForURL(/\/settings(\/|\?|$)/);
    await this.page.getByTestId('settings-nav-item-workers').click();
    await this.page.waitForURL(/\/settings\/workers(\?|$)/);
    await expect(this.page.getByTestId('page-workers')).toBeVisible();
}
```

For sub-navigation (Settings → Workers), the same shape repeats: click parent → wait URL → click child → wait URL → assert page.

Rules:
- Every nav method MUST end with both a `waitForURL` AND a `toBeVisible` assertion on the target page's shell testid (`page-<feature>`). Either alone is insufficient — URL changes can race the SPA mount.
- Sub-nav clicks must be preceded by a parent-URL wait, not just a `click → click` chain.
- Don't lift sub-nav clicks into a spec. Add a method like `navigateToWorkers()` instead.

## 8. Pagination

One canonical shape — the pagination API on `DataTableBase`, inherited by the standard `data-table` pages (`JobsPage`, `InventoryPage`, `WorkersPage`, `NotificationRulesPage`; pages with non-standard table roots like `NotificationsPage` don't extend it):

```typescript
get pageSizeSelect(): Locator {
    return this.page.getByTestId('page-size-select');
}
get previousPageButton(): Locator {
    return this.page.getByRole('button', { name: 'Previous' });
}
get nextPageButton(): Locator {
    return this.page.getByRole('button', { name: 'Next' });
}
get pageInfoText(): Locator {
    return this.page.getByTestId('pagination-pages');
}

async getPageInfo(): Promise<{ current: number; total: number }> {
    const el = this.pageInfoText;
    return {
        current: Number(await el.getAttribute('data-current-page')),
        total: Number(await el.getAttribute('data-total-pages')),
    };
}

async goToNextPage(): Promise<void> {
    if (!(await this.nextPageButton.isEnabled())) return;
    const { current } = await this.getPageInfo();
    await this.nextPageButton.click();
    await expect(this.pageInfoText).toHaveAttribute(
        'data-current-page',
        String(current + 1),
        { timeout: appConfig.timeouts.uiResponse }
    );
    await this.waitForTableSettled();
}
```

`selectPageSize(size)` (also on `DataTableBase`) opens the `page-size-select` Radix trigger, picks the `getByRole('option', { name: size, exact: true })` item inside a `toPass` retry block, then confirms via the trigger's `data-page-size` attribute and `waitForTableSettled()`. Supporting getters: `rowCountText` (`pagination-row-count`), `rowsPerPageLabel` (`pagination-rows-per-page`).

Rules:
- Page navigation must be followed by the `data-current-page` re-assertion — it auto-waits for the next page's response.
- Don't iterate rows until the new page has rendered — `waitForTableSettled()` (Recipe 1) runs at the end of every pagination action.
- If a table page needs a pagination action that's missing, lift it onto `DataTableBase` rather than reimplementing it on each consuming page object.

## 9. File downloads / uploads

### Download — established pattern

Re-use the existing `ReportsPage.downloadPdf()` method as the template rather than reimplementing it. Inline shape, for reference:

```typescript
async downloadPdf(): Promise<Download> {
    await expect(this.downloadPdfButton).toBeEnabled();
    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadPdfButton.click();
    return downloadPromise;
}
```

From `pages/app/ReportsPage.ts`. The caller asserts on the returned `Download` (`suggestedFilename()` regex + non-zero `statSync(await download.path()).size`).

Rules:
- `waitForEvent('download')` MUST be armed **before** the click that triggers the download.
- Assert the button is enabled before clicking — a disabled export button silently no-ops.
- Keep the download wrapper on the owning POM; lift it into a base class only when a second page needs it.

### Upload — prescriptive (no callers in the codebase yet)

When you introduce the first upload flow, expose the hidden `<input type="file">` through a `getByTestId` (request a stable `data-testid` from dev — do not rely on `input[type="file"]` CSS) and call `setInputFiles` on the locator. Path is **relative to the project root**, mirroring `./test-downloads/`:

```typescript
get importJobsUploadInput(): Locator {
    return this.page.getByTestId('import-jobs-upload-input');
}

async uploadJobsFile(filePath: string): Promise<void> {
    await this.importJobsUploadInput.setInputFiles(filePath);
    await expect(this.uploadSuccessMessage).toBeVisible();
}
```

Rules:
- `setInputFiles` works on hidden inputs — no need to click a "Choose File" button first.
- Use paths relative to the project root, no `__dirname` gymnastics.

## 10. Tabs and tabpanels

The framework uses Radix `Tabs` inside expanded views. Top-level tabs have `role="tab"` with stable accessible names (e.g. `export` expanded: "Run Stats", "Run Steps", "Timeline"). Active state is exposed via `data-state="active"` on the tab.

```typescript
get runStatsTab(): Locator {
    return this.exportExpandedView.getByRole('tab', { name: 'Run Stats' });
}
get runStepsTab(): Locator {
    return this.exportExpandedView.getByRole('tab', { name: 'Run Steps' });
}

async switchToRunStats(): Promise<void> {
    await this.runStatsTab.click();
    await expect(this.runStatsTab).toHaveAttribute('data-state', 'active');
}
```

For chart-timeframe selectors (toggle-group of radios, not tabs):

```typescript
getChartTimeframeButton(timeframe: string): Locator {
    return this.chartTimeframeSelector.getByRole('radio', {
        name: timeframe,
        exact: true,
    });
}

async selectChartTimeframe(timeframe: string): Promise<void> {
    const button = this.getChartTimeframeButton(timeframe);
    await button.click();
    await expect(button).toHaveAttribute('data-state', 'on');
}
```

From `pages/app/JobsPage.ts`.

Rules:
- Active-state assertion is `toHaveAttribute('data-state', 'active' | 'on')` — matches Radix's emitted attribute. Do not use class-name regex (`/_active_/`) unless the markup actually uses CSS-module classes.
- Disabled tabs (e.g. `export` "Run Steps" / "Timeline" in the current build) carry `data-disabled` and `aria-disabled="true"`; assert via `toBeDisabled()` or `toHaveAttribute('aria-disabled', 'true')`.
- `getByRole('tabpanel')` is currently **not** reliable in this codebase — anchor on the testid of the panel content (`export-expanded-view`, `sftp-expanded-view`, `http-expanded-view`) instead.

## 11. OTP / multi-input keystroke flows — prescriptive

The framework today does **not** include OTP inputs. Email-based flows (`forgot-password`, `initial-user-registration`) use Mailpit + a clickable link; the inbox lookup happens through the `mailpit` fixture, not a UI OTP component. The shape below is reserved for the first OTP UI:

```typescript
// Page object
get codeInput(): Locator {
    return this.page.getByTestId('otp-input-0');
}

// Caller — click() already waits for the input to be visible and enabled
await loginPage.codeInput.click();
await expect(loginPage.codeInput).toBeFocused();
await page.keyboard.type(code);
```

Rules (when the first OTP component ships):
- Click the first input, then `page.keyboard.type(code)` — typical OTP components auto-advance focus across `otp-input-0` … `otp-input-N`.
- `fill` does NOT work for OTP inputs that listen to keystroke events; use `keyboard.type`.
- If the test is flaky on the first keystroke, the right hardening is `await expect(loginPage.codeInput).toBeFocused()` **before** `keyboard.type` — not a `waitFor` before the click (`click()` already waits), not retries, not lengthening timeouts on the typed assertion.

For the existing mail-based reset flow, see the `mailpit` fixture in `fixtures/` and the [api-testing](../api-testing/SKILL.md) skill — both cover how the verification link is fetched.

## 12. Hover-revealed menus — prescriptive

The framework does not expose any hover-revealed menus today. Sidebar tooltips are handled by the OS-level tooltip primitive (no test interaction needed); row actions open on **click**, not hover. The shape below is reserved for the first hover-revealed UI:

```typescript
async openProfileDropdown(): Promise<void> {
    await this.profileTrigger.hover();
    await expect(this.profileDropdown).toBeVisible();
}
```

Rules (when a hover menu first ships):
- A hover that reveals a menu MUST be followed by `expect(menu).toBeVisible()` before any further click.
- Never `click` a menu trigger that requires hover — the menu may dismiss on click.
- Hover + Radix pointer-event timing is flaky under Playwright; if you need to assert a tooltip's text, prefer `getByRole('tooltip', { name: '...' })` after the hover, not innerText snapshots.

## 13. Network-confirmed actions

The canonical pattern after any non-GET click, or after a refresh that should produce new data:

```typescript
async clickManualRefreshAndWaitForRefresh(timeout = appConfig.timeouts.longPoll): Promise<void> {
    await expect(this.manualRefreshButton).toBeEnabled();
    const responsePromise = this.page.waitForResponse(
        (r) => {
            const method = r.request().method();
            const url = r.url();
            return (
                (method === 'POST' || method === 'GET') &&
                (url.includes('_serverFn') || url.includes('/api/run-stats'))
            );
        },
        { timeout }
    );
    await this.manualRefreshButton.click();
    await responsePromise;
    await expect(this.manualRefreshButton).toBeEnabled({ timeout });
}
```

From `pages/app/JobsPage.ts`. Click → network confirmation → button-re-enabled assertion. Three independent signals.

For job creation, the canonical "click submit" wait is the sheet-hidden + Sonner-toast pair:

```typescript
async createJobFromSheet(data: JobFormData): Promise<void> {
    await this.fillForm(data);
    await this.createJobSubmitButton.click();
    await expect(this.createJobSheet).toBeHidden({ timeout: appConfig.timeouts.persist });
    await this.expectSuccessToastForJob(data.name);
}
```

Rules:
- For TanStack-Start `_serverFn` calls: predicate matches URL substring (`_serverFn` or `/api/run-stats`) + method.
- Status codes vary in this codebase (`200`, `204`); prefer the URL+method predicate over status assertions unless the spec specifically tests an error path.
- For long-running async (the first run stats after creating an `export` job), use the `firstData` budget on the **assertion** (`expect(async () => { … }).toPass({ timeout: appConfig.timeouts.firstData })` — see § 18 Job expanded-view tests below), not on the response wait.

## 14. Multi-page (popup) flows — prescriptive

The framework today does **not** open any new browser tabs from inside a test (`page.waitForEvent('popup')` has zero callers). If you add the first popup flow (OAuth, third-party billing portal, "Open in new tab"), use the shape below and lift it into a base class on the second usage:

```typescript
async openExternalBillingPortal(): Promise<Page> {
    const popupPromise = this.page.waitForEvent('popup');
    await this.openBillingButton.click();
    const popup = await popupPromise;
    return popup;
}

// Caller
const popup = await tenantSettings.openExternalBillingPortal();
await expect(popup.getByRole('heading', { name: 'Billing Portal' })).toBeVisible();
```

Rules:
- Arm `waitForEvent('popup')` BEFORE the click that opens the popup.
- The first `expect(popup.getBy…).toBeVisible()` auto-waits — you usually do NOT need `popup.waitForLoadState(...)`. Read state through locators and web-first assertions, never `popup.evaluate(...)` (the constitution forbids `page.evaluate` for DOM work), and never use `'networkidle'` (see reference.md).

## 15. Searching and filtering

```typescript
async searchByName(name: string): Promise<void> {
    await this.searchInput.fill(name);
}

async expectJobListed(name: string): Promise<void> {
    const search = this.jobsListSearchInput;
    await expect(search).toBeVisible({ timeout: appConfig.timeouts.fastFail });
    await search.clear();
    await search.fill(name);
    await expect(this.getRowByName(name).first()).toBeVisible({
        timeout: appConfig.timeouts.navigation,
    });
}

async selectStatusOption(label: string): Promise<void> {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
}
```

From `pages/app/JobsPage.ts`.

For a searchable filter popover (the Notification Rules type filter's bespoke RunStatDropdown):

```typescript
async openTypeFilter(): Promise<void> {
    await this.typeFilter.click();
    await expect(this.typeFilterList).toBeVisible({ timeout: appConfig.timeouts.fastFail });
}

async selectTypeOption(label: string): Promise<void> {
    await this.openTypeFilter();
    if (await this.typeFilterSearch.isVisible().catch(() => false)) {
        await this.typeFilterSearch.fill(label);
    }
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const option = this.typeFilterOptions.filter({
        hasText: new RegExp(`^\\s*${escaped}(\\s|\\[|$)`, 'i'),
    });
    await expect(option.first()).toBeVisible({ timeout: appConfig.timeouts.uiResponse });
    await option.first().click();
    await this.waitForTableSettled();
}
```

From `pages/app/NotificationRulesPage.ts` — open the popover, assert the list is visible, search-narrow, prefix-match the label (the FE appends unit suffixes like `[ms]`), then settle the table.

Rules:
- Search inputs in this app debounce client-side; pair the `fill` with a row-visibility assertion (above) — never with `waitForTimeout`.
- After `applyFilter`, always `waitForTableSettled` (Recipe 1) and re-read the table.
- Filter chips and active-filter visibility checks belong on the page object (`statusFilter`, `typeFilter`, `outcomeFilter`); never inline them in a spec.

## 16. Async row creation — waiting for the new row

The standard shape after a create flow:

```typescript
async createExportJobFromSheetAndVerify(data: { name: string; target: string; runIntervalLabel: string; timeout: number }): Promise<void> {
    await this.createExportJobFromSheet({ ...data, submit: true });

    await this.searchByName(data.name);
    const newRow = this.getRowByName(data.name);
    await expect(newRow).toBeVisible({ timeout: appConfig.timeouts.persist });
    await expect(newRow).toContainText('Export');
    await expect(newRow).toContainText(data.runIntervalLabel);
    await expect(newRow).toContainText(data.target);
}
```

Rules:
- Do NOT poll with `await loc.count()` in a loop. `expect(loc).toBeVisible()` already retries.
- If the table refresh is debounced, wait for the refresh response (registered before the action), then assert with the default timeout; do not raise budgets or add `waitForTimeout`.
- For deletion: `await expect(this.getRowByName(name)).toBeHidden();`.
- The first run stats may take up to 90 seconds to flow into the row's job-status badge — that wait belongs in the **detail-view functional spec**, not in the CRUD spec (see § 18 Job expanded-view tests below).

## 17. POM vs spec — the placement decision in one flow

A typical `export`-job CRUD test illustrating where each locator should live. The shape below mirrors the actual flow in `tests/app/e2e/jobs-service/jobs/export-job.spec.ts`:

```typescript
import { expect, test } from '../../../fixtures/pom/test-options';
import { qase } from 'playwright-qase-reporter';
import { faker } from '@faker-js/faker';
import { SUITES } from '../../../enums/app/qase-suites';

test('Create, verify in grid, view details, edit, and delete `export` job',
    { tag: '@App-E2E' },
    async ({
        page,
        sideNavigation,
        jobsPage,
        createJobPage,
    }) => {
        qase.suite(SUITES.APP_JOBS);
        qase.id(656);

        const jobName = `e2e-export-${faker.string.alphanumeric(6).toLowerCase()}`;
        const target = faker.system.directoryPath();

        // Navigation — POM method owns URL + page-shell assertion.
        await test.step('GIVEN: User navigates to Jobs page', async () => {
            await page.goto('/');
            await sideNavigation.navigateToJobs();
            await jobsPage.verifyPageLoaded();
        });

        // POM action — every field locator (role-based textboxes, field-field-* select triggers) lives in pages/app/CreateJobPage.ts.
        await test.step('WHEN: User creates an `export` job through the sheet', async () => {
            await jobsPage.createJobButton.click();
            await expect(createJobPage.sheet).toBeVisible();
            await createJobPage.waitForTypeSelection();
            await createJobPage.jobTypeCard('Export').click();
            await createJobPage.waitForConfigureForm();
            await createJobPage.fillExportJobForm({
                name: jobName,
                target,
                runInterval: '1 minute',
                timeout: '5',
            });
            await expect(createJobPage.createButton).toBeEnabled({ timeout: appConfig.timeouts.persist });
            await createJobPage.createButton.click();
        });

        // INLINE — TOLERATED: one-shot success-toast assertion, never interacted with, no reuse.
        await test.step('THEN: Create success toast is visible', async () => {
            const toast = page.getByText(new RegExp(`"${jobName}" created successfully`));
            await expect(toast).toBeVisible({ timeout: appConfig.timeouts.uiResponse });
        });

        // POM dynamic locator — exposed publicly so specs can assert against any row.
        await test.step('AND: `export` job appears in the grid', async () => {
            await jobsPage.searchByName(jobName);
            const row = jobsPage.getRowByName(jobName);
            await expect(row).toHaveCount(1, { timeout: appConfig.timeouts.persist });
            await expect(row).toContainText('Export');
            await expect(row).toContainText('1 minute');
            await expect(row).toContainText(target);
        });

        // POM action — openRowActionMenu encapsulates the click + retry + menu-item click.
        await test.step('AND: View Details shows the job', async () => {
            const row = jobsPage.getRowByName(jobName);
            await jobsPage.openRowActionMenu(row, 'View details');
            await expect(jobsPage.detailsSheet).toBeVisible();
        });
    });
```

What the spec does NOT contain:
- No `page.locator(...)` calls — every action goes through a POM method.
- No `getByTestId` / `getByRole` for elements that are clicked or filled — those are all behind POM methods.
- No locator that appears more than once — the moment an inline locator is duplicated, refactor it into a POM getter.

Forbidden in this same flow (anti-recipe):

```typescript
// FORBIDDEN — CSS in spec
await page.locator('.create-job-button').click();

// FORBIDDEN — interaction with inline locator
await page.getByPlaceholder('Search by name or target').fill(name);

// FORBIDDEN — same locator used twice in the same spec
const row = page.locator('tbody tr').filter({ hasText: jobName });
await expect(row).toBeVisible();
// …later in the same test…
await expect(row).toBeHidden();   // promote this to jobsPage.getRowByName(name)
```

See [SKILL.md → "Where selectors live"](SKILL.md#where-selectors-live--pom-vs-spec) for the full decision tree.

---

## 18. Job expanded-view tests (HTTP / SFTP / stream / backup / email / webhook / `export`)

The expanded-row UI for every job type follows the same shape: header controls (worker selector, refresh, auto-refresh), run-stat cards, a timing-breakdown card (stacked bar + legend), and type-specific cards. The test strategy is a **two-layer split** — keep the expensive UI-creation flow in the E2E CRUD spec, do the structural / behavioural assertions in a dedicated functional detail-view spec that seeds via API.

### Layer 1 — E2E CRUD spec (`tests/app/e2e/{type}-job-crud.spec.ts`)

Inside the existing CRUD flow, add **one** small `test.step("Expand row and verify {type} detail view loads", ...)` of roughly 20 lines that:

- expands the newly-created row;
- asserts `{type}-expanded-view` is visible (or `loading` / `no-data` fallback);
- asserts `"No expanded view available for this job type."` is hidden;
- collapses the row.

Do **not** assert run-stat cards, timing breakdowns, tooltips, tabs, or section cards here — that's the functional spec's job. This step is a smoke check that the route from creation → list → expanded view works at all.

### Layer 2 — Functional detail-view spec (`tests/app/functional/{type}-job-detail-view.spec.ts`)

Single source of truth for view structure and behaviour:

- **`beforeAll` seeds one job via the API** (use `buildCreate{TYPE}JobBody` + `createJob` from `helpers/app/jobs.ts`). **Never through the UI** — UI creation adds 60+ seconds per test run and is non-deterministic.
- **Wait for the first run stats** via `expect(async () => { ... }).toPass({ timeout: appConfig.timeouts.firstData })` polling a known run stat. Jobs typically need a minute or two before the first scheduled run completes.
- **Assertions must be semantic, not just presence:**
  - Run-stat cards: regex that matches the value shape (`/^(CONNECTED|REFUSED)$/`, `/\d+(\.\d+)?ms/`, `/\d{3}/`), not `toBeVisible()` alone.
  - Timing breakdown: iterate POM constants (`SFTP_TIMING_SEGMENTS`, `STREAM_TIMING_SEGMENTS`, etc.), assert label + color dot + ms value per segment.
  - Tooltips: assert exact text via `getByRole("tooltip", { name: "..." })`.
  - Collapse / re-expand at the end to verify render stability.
- **Use POM constants for label arrays** — never hardcode them in the spec. The `pages/app/JobsPage.ts` exports `HTTP_RUN_STAT_CARD_LABELS`, `HTTP_TIMING_SEGMENTS`, etc.
- **`afterAll` deletes via API** — `listJobs` → `deleteJob`. UI delete is slow + flaky.

### Conditional inline ms labels (`verifyInlineMsLabels`)

The frontend renders inline ms labels on stacked-bar segments only when the segment is **>10% of the total**. Assert this rule explicitly:

- Large segments (>10%) **must** show the ms label.
- Sub-10% segments **must not** show the ms label.

Use the parameterized `verifyInlineMsLabels` helper on `JobsPage` — works for HTTP, SFTP, stream because the timing-bar shape is identical (stacked segments + legend + scale labels).

### Do NOT

- ❌ **Create a separate `tests/app/e2e/{type}-job-view.spec.ts`.** The CRUD stub + functional detail-view already cover that ground; a third layer duplicates UI-creation setup (~60s) and slows CI without adding unique coverage.
- ❌ **Split the mega-test into one-test-per-section without keeping a shared `beforeAll` job.** The 90 s wait for the job's first run is too expensive to repeat per test. If you split, annotate each sub-test with its own `qase.id()`.
- ❌ **Use UI creation (`createJobPage`) inside the detail-view functional spec.** API seeding is mandatory for speed and determinism.

### Anti-pattern reference

`tests/app/e2e/jobs-service/jobs/export-job-view.spec.ts` (qase 931) pre-dates this convention and is the **anti-pattern**: it repeats the full UI-creation CRUD flow just to re-verify structural assertions already covered by `export-job-expanded-view.spec.ts`. **Do not replicate this layout for any new job type.** Keep it in-tree until product decides to prune it; it's allowed to exist, but it's not a template.

### Pre-seeded job exception (stream)

Some job types take too long for the first run stats to land within reasonable test timeouts. For stream jobs specifically, the `stream-job-detail-view.spec.ts` targets a **pre-seeded job** named by `STREAM_FIXTURE_JOB_NAME` (no default committed). If the named job is missing, the spec should **fail fast with a clear message** in `beforeAll` (via `listJobs`) — never skip, because a skipped spec reads as green; the current self-skip is drift rather than timing out on row expansion. Use this pattern only when API seeding genuinely can't produce ready data within ~90 seconds.

---

## Where to look up next

- [SKILL.md](SKILL.md) — decision tree, blessed patterns.
- [reference.md](reference.md) — full Locator API, ARIA roles, testid taxonomy, FrameLocator.
- [patterns.md](patterns.md) — good vs bad selector code.
- `~/.claude/CLAUDE.md` — always-applied invariants and POM Method Standards.
- Sister: [~/.claude/skills/data-strategy/SKILL.md](../data-strategy/SKILL.md) for data sources; [~/.claude/skills/page-objects/SKILL.md](../page-objects/SKILL.md) for POM class structure.

---

## Radix — full rationale for the priority exception

> Moved out of `SKILL.md` on 2026-08-11 after a blind A/B eval showed the skill arm reaching for
> `data-testid` and CSS on **non-Radix** elements. The rule was correct; its placement in the
> priority-hierarchy section made agents read the exception as the default. `SKILL.md` now carries
> the narrow rule; the argument lives here. Evidence: `evals/results.json`, `BENCHMARK.md`.

This codebase uses **Radix UI primitives** (via shadcn/ui) for nearly every interactive component:
`<Select>`, `<Switch>`, `<Dialog>`, `<DropdownMenu>`, `<Popover>`, `<Tabs>`, `<Accordion>`. Radix is
"headless" — it provides accessible behaviour but renders complex DOM. A Radix `<Select>` is a
`role="combobox"` trigger button, a portal-rendered `role="listbox"` popover, a hidden form input,
and assorted state attributes — not a native `<select>`.

### Why the default order breaks on these components

1. **Visible text changes with state.** A button labelled `Refresh` becomes `Refreshing…` mid-action;
   a Radix `<Select>` placeholder `Pick a worker` disappears once a value is picked. `getByText('Refresh')`
   and `getByText('Pick a worker')` work for two seconds and then break.
2. **The role is right, but the accessible name is unreliable.** Radix wrappers nest the user-facing
   label deep — `getByRole('combobox', { name: 'Target' })` works only when Radix exposes the name
   correctly, which varies by component version and prop usage. **Try the role first anyway**; fall
   back only once you have seen it fail, and file the unreliable name as an accessibility defect
   (the `accessibility-testing` skill).
3. **There is a test-id contract.** The frontend systematically emits stable test-ids, agreed between
   FE and QA, which do not change without coordination. Prefixes and the field-wrapper vs
   input/trigger distinction: [reference.md § 4](reference.md).

### Promote `getByTestId` to priority 4 — only when BOTH hold, for THAT element

- Reason 1 or 2 above applies to it: its visible text changes with state, or its accessible name is unreliable.
- `getByRole` and `getByLabel` were tried on it first, and failed.

Being a Radix primitive is **not** on its own a reason, and neither is the existence of a test-id. Reason 3 (a test-id contract) is what makes the fallback safe to rely on, not a reason to use it. The promotion covers the trigger only: the portal content keeps its roles (`listbox` / `option`, `dialog`, `alert`, `status`).

### Keep the default order (semantic above test-id) — the normal case

- A role, label or stable-text locator finds the element reliably — whatever library renders it,
  Radix included (`getByRole('combobox', { name })`, `getByRole('switch', { name })` often work)
- Its visible text is part of the contract — page headings, success and error message strings,
  empty-state markers
- Whether a test-id exists does not matter: a test-id is a fallback, not a reason

### The trap this exception creates

Existing page objects use `getByTestId` far more often than `getByText`. That ratio is a **description
of accumulated Radix handling, not a target to match.** Two failure modes follow from misreading it:

- **Page-level promotion.** Applying the exception to every locator in a page object because one
  element in it is Radix. Decide per element.
- **Skipping the role attempt.** Reaching for a test-id on a Radix trigger without first trying
  `getByRole('combobox', { name })`. The role often works; the fallback exists for when it does not.

A new page object that leads with test-ids is a defect even where an old one next to it does the same.

