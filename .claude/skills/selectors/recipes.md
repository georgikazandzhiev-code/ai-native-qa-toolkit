# Selectors — Recipes

End-to-end recipes for the most common UI structures in this framework. Each recipe gives the exact locator shape, when to use it, and a complete user-flow method that follows the POM Method Standards in [`page-objects`](../page-objects/SKILL.md).

Cross-link from [SKILL.md](SKILL.md). For locator-by-locator API reference, see [reference.md](reference.md). For good/bad code, see [patterns.md](patterns.md).

## Recipe index

1. [Tables — row by name, cell by column](#1-tables--row-by-name-cell-by-column)
2. [Right-side sheets (Create / Edit Monitor)](#2-right-side-sheets-create--edit-monitor)
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

When the table has a `data-testid="data-table"` wrapper and per-row `table-row-<id>` prefix testids. This is exactly what [`DataTableBase`](../../../pages/baseClasses/DataTableBase.ts) provides — extend it for any table-bearing page instead of re-rolling these getters.

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

## 2. Right-side sheets (Create / Edit Monitor)

Standard shape: a sheet opens after clicking "Create Monitor" or a per-row "Edit monitor" menu item, contains a step-1 type picker (for create) and a schema-form, ends with `create-button` / `cancel-button` / `back-button` / `close-button`.

```typescript
get createMonitorButton(): Locator {
    return this.page.getByTestId('create-monitor-button');
}
get createMonitorSheet(): Locator {
    return this.page.getByTestId('create-monitor-sheet');
}
get monitorTypeGrid(): Locator {
    return this.page.getByTestId('monitor-type-grid');
}
icmpTypeCard(): Locator {
    return this.monitorTypeGrid
        .getByTestId('monitor-type-card')
        .filter({ hasText: /ICMP|Ping/i });
}
get schemaForm(): Locator {
    return this.page.getByTestId('schema-form');
}
get monitorNameInput(): Locator {
    return this.page
        .getByTestId('field-field-name')
        .or(this.page.getByLabel(/^Monitor Name/i));
}
get targetInput(): Locator {
    return this.page
        .getByTestId('field-field-target')
        .or(this.page.getByLabel(/^Target/i));
}
get createMonitorSubmitButton(): Locator {
    return this.page.getByTestId('create-button');
}
get cancelButton(): Locator {
    return this.page.getByTestId('cancel-button');
}

async createIcmpMonitor(data: {
    name: string;
    target: string;
    checkIntervalLabel: string;
    timeout: number;
    submit: boolean;
}): Promise<void> {
    await this.createMonitorButton.click();
    await expect(this.createMonitorSheet).toBeVisible();

    await expect(this.monitorTypeGrid).toBeVisible();
    await this.icmpTypeCard().click();
    await expect(this.schemaForm).toBeVisible();

    await this.monitorNameInput.fill(data.name);
    await expect(this.monitorNameInput).toHaveValue(data.name);

    await this.targetInput.fill(data.target);
    await expect(this.targetInput).toHaveValue(data.target);

    await this.selectCheckIntervalOption(data.checkIntervalLabel);
    await this.timeoutInput.fill(String(data.timeout));
    await this.timeoutInput.blur();

    await expect(this.createMonitorSubmitButton).toBeEnabled({ timeout: 20000 });

    if (data.submit) {
        await this.createMonitorSubmitButton.click();
        await expect(this.createMonitorSheet).toBeHidden({ timeout: 15000 });
    } else {
        await this.cancelButton.click();
        await expect(this.createMonitorSheet).toBeHidden();
    }
}
```

Rules:
- Always assert the sheet is visible *before* selecting the monitor type, and the schema-form is visible *before* filling.
- After every `fill`, assert `toHaveValue` (Radix-wrapped inputs occasionally drop characters under fast input).
- Submit button is asserted `toBeEnabled` BEFORE the click — schema-form validation lights it up only after every required field passes.
- Click → assert sheet hidden. Network confirmation is added on top via Recipe 13 when the spec needs to read back the new monitor.

## 3. Component-library dropdowns / Radix selects

Pattern: Radix `<Select>` exposes a `SelectTrigger` (testid on the trigger or its wrapper) and a `SelectContent` (`data-testid="select-content"`) containing `SelectItem`s (`data-testid="select-item"`). Older selects use a `getByRole('option')` listbox.

```typescript
get checkIntervalSelectTrigger(): Locator {
    return this.page.getByTestId('field-field-checkInterval');
}

async selectCheckIntervalOption(optionLabel: string): Promise<void> {
    const trigger = this.checkIntervalSelectTrigger;
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeVisible();

    const openDropdown = async (): Promise<Locator> => {
        const content = this.page.getByTestId('select-content').last();
        await trigger.click();
        try {
            await expect(content).toBeVisible({ timeout: 5000 });
            return content;
        } catch {
            // eslint-disable-next-line playwright/no-force-option -- Radix select trigger
            await trigger.click({ force: true });
            await expect(content).toBeVisible({ timeout: 5000 });
            return content;
        }
    };

    const content = await openDropdown();
    const escaped = optionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const item = content
        .getByTestId('select-item')
        .filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) });
    await expect(item.first()).toBeVisible({ timeout: 8000 });
    await item.first().scrollIntoViewIfNeeded();
    await item.first().click();
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `selectCheckIntervalOption`. The "open with retry" wrapper is necessary because Radix occasionally swallows the first click on a stubborn trigger.

For toolbar filters that use `getByRole('option')` (status / type / health filters):

```typescript
async selectFilterOption(filter: Locator, label: string): Promise<void> {
    await filter.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
}
```

Rules:
- The chain `getByTestId('field-field-<fieldPath>')` (the input/trigger testid) → click → drill into `getByTestId('select-content')` → `getByTestId('select-item')` is the blessed shape for schema-form Radix selects; do not invent variations. (`schema-field-<fieldName>` is the field *wrapper*, not the trigger.)
- For non-schema-form selects (toolbar filters, page-size), `getByRole('option', { name, exact: true })` is fine because the listbox is `role="listbox"` with proper option roles.
- Confirm selection with the trigger's visible value or by re-opening and asserting the chosen item carries `data-state="checked"`.
- Never click an option without first asserting `select-content` (or the listbox) is visible.

## 4. Confirmation modals & delete dialogs

There is no generic confirmation-modal base class in `pages/baseClasses/` — every delete flow uses **per-feature dialog testids** following the same `delete-<feature>-dialog` / `-confirm` / `-cancel` shape.

### 4.1 Per-feature confirm-delete dialog (Reports delete-widget)

The frontend's shared confirm-delete dialog component renders with a per-feature `testId` — on the Reports page it's `delete-widget`. Verified against [pages/app/ReportsPage.ts](../../../pages/app/ReportsPage.ts):

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

`ProbesPage` follows the identical shape with `delete-probe-dialog` / `delete-probe-confirm` / `delete-probe-cancel`.

### 4.2 Synthetics-specific delete dialog

The synthetics list ships its own delete dialog with a dedicated testid, following the same per-feature shape:

```typescript
get deleteDialog(): Locator {
    return this.page.getByTestId('delete-monitor-dialog');
}
get deleteConfirmButton(): Locator {
    return this.page.getByTestId('delete-monitor-confirm');
}
get deleteCancelButton(): Locator {
    return this.deleteDialog.getByRole('button', { name: /cancel/i });
}

async deleteMonitorByName(name: string): Promise<void> {
    const row = this.getRowByName(name);
    await this.openRowActionMenu(row, 'Delete');
    await expect(this.deleteDialog).toBeVisible();
    await this.deleteConfirmButton.click();
    await expect(this.deleteDialog).toBeHidden();
}
```

Rules:
- Cancel via the inner role-based locator (scoped to the dialog), confirm via the dedicated `delete-monitor-confirm` testid.
- Always assert `toBeHidden` after confirmation — the row visibility check follows separately (Recipe 16).

## 5. Toasts / Sonner notifications

This framework uses [Sonner](https://sonner.emilkowal.ski/) for all in-app notifications. Toasts render with `data-sonner-toast` attribute and **stack** (multiple toasts can be on screen simultaneously).

```typescript
async expectSuccessToastForMonitor(name: string): Promise<void> {
    const byToast = this.page
        .locator('[data-sonner-toast]')
        .filter({ hasText: name })
        .first();
    const byTestId = this.page.getByTestId('sonner').filter({ hasText: name });
    const toast = byToast.or(byTestId);
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText(/created successfully/i);
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Filtering by the monitor name first protects against a second toast firing in the same window (e.g. an auto-refresh "Loaded N monitors" toast).

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
        await expect(this.forText(expected)).toBeVisible({ timeout: 15000 });
    }

    async assertDismissed(expected: string | RegExp): Promise<void> {
        // Sonner toasts auto-dismiss; await before continuing the flow.
        await expect(this.forText(expected)).toBeHidden({ timeout: 10000 });
    }
}
```

Rules:
- If two toasts can stack (create + auto-refresh), filter by the unique part of the message (the monitor name) — `page.locator('[data-sonner-toast]')` standalone will trip strict-mode.
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
).toBeVisible({ timeout: 30000 });
```

Rules:
- Avoid bare `frameLocator('iframe')` in any new code.
- A `FrameLocator` is not a `Locator` — helpers typed for `Locator` cannot accept it directly. Expose specific getters that return chained `Locator`s instead.
- For nested iframes, chain: `frame.frameLocator('iframe[id="inner"]')`.

## 7. Sidebar navigation

Pattern: click sidebar link → wait for URL → assert page shell visible. Driven by [pages/app/SideNavigation.ts](../../../pages/app/SideNavigation.ts).

```typescript
get synthetics(): Locator {
    return this.page.getByTestId('nav-link-synthetics');
}

async navigateToSynthetics(): Promise<void> {
    await this.synthetics.click();
    await this.page.waitForURL(/\/synthetics(\?|$)/);
    await expect(this.page.getByTestId('page-synthetics')).toBeVisible();
}

async navigateToProbes(): Promise<void> {
    await this.settings.click();
    await this.page.waitForURL(/\/settings(\/|\?|$)/);
    await this.page.getByTestId('settings-nav-item-probes').click();
    await this.page.waitForURL(/\/settings\/probes(\?|$)/);
    await expect(this.page.getByTestId('page-probes')).toBeVisible();
}
```

For sub-navigation (Settings → Probes), the same shape repeats: click parent → wait URL → click child → wait URL → assert page.

Rules:
- Every nav method MUST end with both a `waitForURL` AND a `toBeVisible` assertion on the target page's shell testid (`page-<feature>`). Either alone is insufficient — URL changes can race the SPA mount.
- Sub-nav clicks must be preceded by a parent-URL wait, not just a `click → click` chain.
- Don't lift sub-nav clicks into a spec. Add a method like `navigateToProbes()` instead.

## 8. Pagination

One canonical shape — the pagination API on [`DataTableBase`](../../../pages/baseClasses/DataTableBase.ts), inherited by the standard `data-table` pages (`SyntheticsPage`, `InventoryPage`, `ProbesPage`, `PoliciesPage`; pages with non-standard table roots like `AlertsPage` don't extend it):

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
        { timeout: 10_000 }
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

From [pages/app/ReportsPage.ts](../../../pages/app/ReportsPage.ts). The caller asserts on the returned `Download` (`suggestedFilename()` regex + non-zero `statSync(await download.path()).size`).

Rules:
- `waitForEvent('download')` MUST be armed **before** the click that triggers the download.
- Assert the button is enabled before clicking — a disabled export button silently no-ops.
- Keep the download wrapper on the owning POM; lift it into a base class only when a second page needs it.

### Upload — prescriptive (no callers in the codebase yet)

When you introduce the first upload flow, expose the hidden `<input type="file">` through a `getByTestId` (request a stable `data-testid` from dev — do not rely on `input[type="file"]` CSS) and call `setInputFiles` on the locator. Path is **relative to the project root**, mirroring `./test-downloads/`:

```typescript
get importMonitorsUploadInput(): Locator {
    return this.page.getByTestId('import-monitors-upload-input');
}

async uploadMonitorsFile(filePath: string): Promise<void> {
    await this.importMonitorsUploadInput.setInputFiles(filePath);
    await expect(this.uploadSuccessMessage).toBeVisible();
}
```

Rules:
- `setInputFiles` works on hidden inputs — no need to click a "Choose File" button first.
- Use paths relative to the project root, no `__dirname` gymnastics.

## 10. Tabs and tabpanels

The framework uses Radix `Tabs` inside expanded views. Top-level tabs have `role="tab"` with stable accessible names (e.g. ICMP expanded: "Metrics", "Traceroute", "Path"). Active state is exposed via `data-state="active"` on the tab.

```typescript
get metricsTab(): Locator {
    return this.icmpExpandedView.getByRole('tab', { name: 'Metrics' });
}
get tracerouteTab(): Locator {
    return this.icmpExpandedView.getByRole('tab', { name: 'Traceroute' });
}

async switchToMetrics(): Promise<void> {
    await this.metricsTab.click();
    await expect(this.metricsTab).toHaveAttribute('data-state', 'active');
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

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts).

Rules:
- Active-state assertion is `toHaveAttribute('data-state', 'active' | 'on')` — matches Radix's emitted attribute. Do not use class-name regex (`/_active_/`) unless the markup actually uses CSS-module classes.
- Disabled tabs (e.g. ICMP "Traceroute" / "Path" in the current build) carry `data-disabled` and `aria-disabled="true"`; assert via `toBeDisabled()` or `toHaveAttribute('aria-disabled', 'true')`.
- `getByRole('tabpanel')` is currently **not** reliable in this codebase — anchor on the testid of the panel content (`icmp-expanded-view`, `tcp-expanded-view`, `http-expanded-view`) instead.

## 11. OTP / multi-input keystroke flows — prescriptive

The framework today does **not** include OTP inputs. Email-based flows (`forgot-password`, `initial-user-registration`) use Mailpit + a clickable link; the inbox lookup happens through the `mailpit` fixture, not a UI OTP component. The shape below is reserved for the first OTP UI:

```typescript
// Page object
get codeInput(): Locator {
    return this.page.getByTestId('otp-input-0');
}

// Caller
await loginPage.codeInput.waitFor({ state: 'visible' });
await loginPage.codeInput.click();
await page.keyboard.type(code);
```

Rules (when the first OTP component ships):
- Click the first input, then `page.keyboard.type(code)` — typical OTP components auto-advance focus across `otp-input-0` … `otp-input-N`.
- `fill` does NOT work for OTP inputs that listen to keystroke events; use `keyboard.type`.
- If the test is flaky on the first keystroke, the right hardening is `await loginPage.codeInput.waitFor({ state: 'visible' })` (or `expect(loginPage.codeInput).toBeFocused()`) **before** `keyboard.type` — not retries, not lengthening timeouts on the typed assertion.

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
async clickManualRefreshAndWaitForRefresh(timeout = 30_000): Promise<void> {
    await expect(this.manualRefreshButton).toBeEnabled();
    const responsePromise = this.page.waitForResponse(
        (r) => {
            const method = r.request().method();
            const url = r.url();
            return (
                (method === 'POST' || method === 'GET') &&
                (url.includes('_serverFn') || url.includes('/api/data'))
            );
        },
        { timeout }
    );
    await this.manualRefreshButton.click();
    await responsePromise;
    await expect(this.manualRefreshButton).toBeEnabled({ timeout });
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Click → network confirmation → button-re-enabled assertion. Three independent signals.

For monitor creation, the canonical "click submit" wait is the sheet-hidden + Sonner-toast pair:

```typescript
async createMonitor(data: MonitorData): Promise<void> {
    await this.fillForm(data);
    await this.createMonitorSubmitButton.click();
    await expect(this.createMonitorSheet).toBeHidden({ timeout: 15000 });
    await this.expectSuccessToastForMonitor(data.name);
}
```

Rules:
- For TanStack-Start `_serverFn` calls: predicate matches URL substring (`_serverFn` or `/api/data`) + method.
- Status codes vary in this codebase (`200`, `204`); prefer the URL+method predicate over status assertions unless the spec specifically tests an error path.
- For long-running async (first probe data after creating an ICMP monitor), increase the **assertion** timeout (wait for first probe data via `toPass({ timeout: 90_000 })` — see § 18 Synthetic Monitor expanded-view tests below), NOT the response timeout.

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
- The first `expect(popup.getBy…).toBeVisible()` auto-waits — you usually do NOT need `popup.waitForLoadState(...)`. Only add `waitForLoadState('domcontentloaded')` if you must read DOM state synchronously (e.g. via `popup.evaluate(...)`); never use `'networkidle'` (see reference.md).

## 15. Searching and filtering

```typescript
async searchByName(name: string): Promise<void> {
    await this.searchInput.fill(name);
}

async expectMonitorListed(name: string): Promise<void> {
    const search = this.syntheticsListSearchInput;
    await expect(search).toBeVisible({ timeout: 5000 });
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

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts).

For a searchable filter popover (the Policies type filter's bespoke MetricDropdown):

```typescript
async openTypeFilter(): Promise<void> {
    await this.typeFilter.click();
    await expect(this.typeFilterList).toBeVisible({ timeout: 5_000 });
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
    await expect(option.first()).toBeVisible({ timeout: 8_000 });
    await option.first().click();
    await this.waitForTableSettled();
}
```

From [pages/app/PoliciesPage.ts](../../../pages/app/PoliciesPage.ts) — open the popover, assert the list is visible, search-narrow, prefix-match the label (the FE appends unit suffixes like `[ms]`), then settle the table.

Rules:
- Search inputs in this app debounce client-side; pair the `fill` with a row-visibility assertion (above) — never with `waitForTimeout`.
- After `applyFilter`, always `waitForTableSettled` (Recipe 1) and re-read the table.
- Filter chips and active-filter visibility checks belong on the page object (`statusFilter`, `typeFilter`, `healthFilter`); never inline them in a spec.

## 16. Async row creation — waiting for the new row

The standard shape after a create flow:

```typescript
async createIcmpAndVerify(data: { name: string; target: string; checkIntervalLabel: string; timeout: number }): Promise<void> {
    await this.createIcmpMonitor({ ...data, submit: true });

    await this.searchByName(data.name);
    const newRow = this.getRowByName(data.name);
    await expect(newRow).toBeVisible({ timeout: 15000 });
    await expect(newRow).toContainText('ICMP');
    await expect(newRow).toContainText(data.checkIntervalLabel);
    await expect(newRow).toContainText(data.target);
}
```

Rules:
- Do NOT poll with `await loc.count()` in a loop. `expect(loc).toBeVisible()` already retries.
- If the table refresh is debounced, increase the assertion timeout; do not add `waitForTimeout`.
- For deletion: `await expect(this.getRowByName(name)).toBeHidden();`.
- The first probe data may take up to 90 seconds to flow into the row's health badge — that wait belongs in the **detail-view functional spec**, not in the CRUD spec (see § 18 Synthetic Monitor expanded-view tests below).

## 17. POM vs spec — the placement decision in one flow

A typical ICMP CRUD test illustrating where each locator should live. The shape below mirrors the actual flow in [tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts](../../../tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts):

```typescript
import { expect, test } from '../../../fixtures/pom/test-options';
import { qase } from 'playwright-qase-reporter';
import { faker } from '@faker-js/faker';
import { SUITES } from '../../../enums/app/qase-suites';

test('Create, verify in grid, view details, edit, and delete ICMP monitor',
    { tag: '@App-E2E' },
    async ({
        page,
        sideNavigation,
        syntheticsPage,
        createMonitorPage,
    }) => {
        qase.id(656);
        qase.suite(SUITES.APP_SYNTHETICS);

        const monitorName = `e2e-icmp-${faker.string.alphanumeric(6).toLowerCase()}`;
        const target = faker.internet.ipv4();

        // Navigation — POM method owns URL + page-shell assertion.
        await test.step('GIVEN: User navigates to Synthetics page', async () => {
            await page.goto('/');
            await sideNavigation.navigateToSynthetics();
            await syntheticsPage.verifyPageLoaded();
        });

        // POM action — every field locator (role-based textboxes, field-field-* select triggers) lives in pages/app/CreateMonitorPage.ts.
        await test.step('Create ICMP monitor through the sheet', async () => {
            await syntheticsPage.createMonitorButton.click();
            await expect(createMonitorPage.sheet).toBeVisible();
            await createMonitorPage.waitForTypeSelection();
            await createMonitorPage.monitorTypeCard('ICMP').click();
            await createMonitorPage.waitForConfigureForm();
            await createMonitorPage.fillIcmpMonitorForm({
                name: monitorName,
                target,
                checkInterval: '1 minute',
                timeout: '5',
            });
            await expect(createMonitorPage.createButton).toBeEnabled({ timeout: 20_000 });
            await createMonitorPage.createButton.click();
        });

        // INLINE — TOLERATED: one-shot success-toast assertion, never interacted with, no reuse.
        await test.step('Verify create success toast', async () => {
            const toast = page.getByText(new RegExp(`"${monitorName}" created successfully`));
            await expect(toast).toBeVisible({ timeout: 10_000 });
        });

        // POM dynamic locator — exposed publicly so specs can assert against any row.
        await test.step('Verify ICMP monitor in grid', async () => {
            await syntheticsPage.searchByName(monitorName);
            const row = syntheticsPage.getRowByName(monitorName);
            await expect(row).toHaveCount(1, { timeout: 15_000 });
            await expect(row).toContainText('ICMP');
            await expect(row).toContainText('1 minute');
            await expect(row).toContainText(target);
        });

        // POM action — openRowActionMenu encapsulates the click + retry + menu-item click.
        await test.step('Open View Details and verify', async () => {
            const row = syntheticsPage.getRowByName(monitorName);
            await syntheticsPage.openRowActionMenu(row, 'View details');
            await expect(syntheticsPage.detailsSheet).toBeVisible();
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
await page.locator('.create-monitor-button').click();

// FORBIDDEN — interaction with inline locator
await page.getByPlaceholder('Search by name or target').fill(name);

// FORBIDDEN — same locator used twice in the same spec
const row = page.locator('tbody tr').filter({ hasText: monitorName });
await expect(row).toBeVisible();
// …later in the same test…
await expect(row).toBeHidden();   // promote this to syntheticsPage.getRowByName(name)
```

See [SKILL.md → "Where selectors live"](SKILL.md#where-selectors-live--pom-vs-spec) for the full decision tree.

---

## 18. Synthetic Monitor expanded-view tests (HTTP / TCP / WebSocket / SSL / DNS / MCP / ICMP)

The expanded-row UI for every monitor type follows the same shape: header controls (probe selector, refresh, auto-refresh), metric cards, a timing-breakdown card (stacked bar + legend), and protocol-specific cards. The test strategy is a **two-layer split** — keep the expensive UI-creation flow in the E2E CRUD spec, do the structural / behavioural assertions in a dedicated functional detail-view spec that seeds via API.

### Layer 1 — E2E CRUD spec (`tests/app/e2e/{type}-synthetic-monitor-crud.spec.ts`)

Inside the existing CRUD flow, add **one** small `test.step("Expand row and verify {type} detail view loads", ...)` of roughly 20 lines that:

- expands the newly-created row;
- asserts `{type}-expanded-view` is visible (or `loading` / `no-data` fallback);
- asserts `"No expanded view available for this monitor type."` is hidden;
- collapses the row.

Do **not** assert metric cards, timing breakdowns, tooltips, tabs, or section cards here — that's the functional spec's job. This step is a smoke check that the route from creation → list → expanded view works at all.

### Layer 2 — Functional detail-view spec (`tests/app/functional/{type}-monitor-detail-view.spec.ts`)

Single source of truth for view structure and behaviour:

- **`beforeAll` seeds one monitor via the API** (use `buildCreate{TYPE}SyntheticBody` + `createSyntheticMonitor` from `helpers/app/synthetics.ts`). **Never through the UI** — UI creation adds 60+ seconds per run and is non-deterministic.
- **Wait for first probe data** via `expect(async () => { ... }).toPass({ timeout: 90_000 })` polling a known metric. Probes typically need a minute or two before the first check completes.
- **Assertions must be semantic, not just presence:**
  - Metric cards: regex that matches the value shape (`/^(OPEN|CLOSED)$/`, `/\d+(\.\d+)?ms/`, `/\d{3}/`), not `toBeVisible()` alone.
  - Timing breakdown: iterate POM constants (`TCP_TIMING_SEGMENTS`, `WS_TIMING_SEGMENTS`, etc.), assert label + color dot + ms value per segment.
  - Tooltips: assert exact text via `getByRole("tooltip", { name: "..." })`.
  - Collapse / re-expand at the end to verify render stability.
- **Use POM constants for label arrays** — never hardcode them in the spec. The `pages/app/SyntheticsPage.ts` exports `HTTP_METRIC_CARD_LABELS`, `HTTP_TIMING_SEGMENTS`, etc.
- **`afterAll` deletes via API** — `listSynthetics` → `deleteSyntheticMonitor`. UI delete is slow + flaky.

### Conditional inline ms labels (`verifyInlineMsLabels`)

The frontend renders inline ms labels on stacked-bar segments only when the segment is **>10% of the total**. Assert this rule explicitly:

- Large segments (>10%) **must** show the ms label.
- Sub-10% segments **must not** show the ms label.

Use the parameterized `verifyInlineMsLabels` helper on `SyntheticsPage` — works for HTTP, TCP, WebSocket because the timing-bar shape is identical (stacked segments + legend + scale labels).

### Do NOT

- ❌ **Create a separate `tests/app/e2e/{type}-synthetic-monitor-view.spec.ts`.** The CRUD stub + functional detail-view already cover that ground; a third layer duplicates UI-creation setup (~60s) and slows CI without adding unique coverage.
- ❌ **Split the mega-test into one-test-per-section without keeping a shared `beforeAll` monitor.** The 90s probe wait is too expensive to repeat per test. If you split, annotate each sub-test with its own `qase.id()`.
- ❌ **Use UI creation (`createMonitorPage`) inside the detail-view functional spec.** API seeding is mandatory for speed and determinism.

### Anti-pattern reference

[`tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor-view.spec.ts`](../../../tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor-view.spec.ts) (qase 931) pre-dates this convention and is the **anti-pattern**: it repeats the full UI-creation CRUD flow just to re-verify structural assertions already covered by `icmp-monitor-expanded-view.spec.ts`. **Do not replicate this layout for any new monitor type.** Keep it in-tree until product decides to prune it; it's allowed to exist, but it's not a template.

### Pre-seeded monitor exception (WebSocket)

Some monitor types take too long for first probe data to land within reasonable test timeouts. For WebSocket specifically, the [`websocket-monitor-detail-view.spec.ts`](../../../tests/app/functional/monitoring-service/synthetics/websocket-monitor-detail-view.spec.ts) targets a **pre-seeded monitor** (default name `"[todor] postman wss"`, overridable via `WS_FIXTURE_MONITOR_NAME` env var). If the named monitor is missing, the spec **skips with a clear message** in `beforeAll` (via `listSynthetics`) rather than timing out on row expansion. Use this pattern only when API seeding genuinely can't produce ready data within ~90 seconds.

---

## Where to look up next

- [SKILL.md](SKILL.md) — decision tree, blessed patterns.
- [reference.md](reference.md) — full Locator API, ARIA roles, testid taxonomy, FrameLocator.
- [patterns.md](patterns.md) — good vs bad selector code.
- [~/.claude/CLAUDE.md](../../../~/.claude/CLAUDE.md) — always-applied invariants and POM Method Standards.
- Sister: [~/.claude/skills/data-strategy/SKILL.md](../data-strategy/SKILL.md) for data sources; [~/.claude/skills/page-objects/SKILL.md](../page-objects/SKILL.md) for POM class structure.
