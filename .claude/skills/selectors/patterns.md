# Selectors — Patterns (good vs bad)

Side-by-side examples drawn directly from this codebase. Every "Bad" snippet either exists in the framework today (and is a candidate for cleanup) or is a tempting wrong answer when authoring new code.

Cross-link from [SKILL.md](SKILL.md). For end-to-end flows, see [recipes.md](recipes.md).

## Contents

- [P1 — Anchor + drill (instead of deep CSS)](#p1--anchor--drill-instead-of-deep-css)
- [P2 — `getByText` with `exact: true`](#p2--getbytext-with-exact-true)
- [P3 — Filter by row text (instead of column position)](#p3--filter-by-row-text-instead-of-column-position)
- [P4 — Component scoping (instead of repeated top-level lookups)](#p4--component-scoping-instead-of-repeated-top-level-lookups)
- [P5 — Dynamic locator: enum + map dispatch (instead of if/else)](#p5--dynamic-locator-enum--map-dispatch-instead-of-ifelse)
- [P6 — Frame selection by stable attribute](#p6--frame-selection-by-stable-attribute)
- [P7 — Native semantic locator (when stable)](#p7--native-semantic-locator-when-stable)
- [P8 — Web-first assertion vs imperative state read](#p8--web-first-assertion-vs-imperative-state-read)
- [P9 — Action method validates success](#p9--action-method-validates-success)
- [P10 — `.first()` only when intentional](#p10--first-only-when-intentional)
- [P11 — Two-state element with `.or()`](#p11--two-state-element-with-or)
- [P12 — Toast / Sonner notification](#p12--toast--sonner-notification)
- [P13 — Use the locator API instead of evaluating in the browser](#p13--use-the-locator-api-instead-of-evaluating-in-the-browser)
- [P14 — Lazy locator vs eager state](#p14--lazy-locator-vs-eager-state)
- [P15 — `filter({ has: <Locator> })` for parent-by-child](#p15--filter-has-locator-for-parent-by-child)
- [P16 — Search by exact value](#p16--search-by-exact-value)
- [P17 — POM vs spec placement](#p17--pom-vs-spec-placement)

## P1 — Anchor + drill (instead of deep CSS)

### Good

```typescript
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
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). The `field-field-*` testid is on the schema-form input that the front-end team owns; `.or()` widens to the labelled control so older specs and the current UI both work. The chain stays at one level — never CSS at the top.

### Bad

```typescript
get codeInput(): Locator {
    return this.page
        .locator('.dialog-wrapper .field-input > input.shadcn-input')
        .first();
}
```

App-level / shadcn template classes track styling, not semantics; any theme tweak breaks the chain. The fix is either a stable testid added by the front-end team or, as a stopgap, scoping by a labelled wrapper plus `.locator('input')`.

## P2 — `getByText` with `exact: true`

### Good

```typescript
get createMonitorTitle(): Locator {
    return this.page.getByText('Create Monitor', { exact: true });
}

get editMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Edit monitor' });
}
```

`exact: true` prevents matches against "Create Monitor — HTTP", "Edit monitor (admin)", "Edit user". When a stable role (`menuitem`, `option`, `button`) is available, prefer it over `getByText` for short labels.

### Bad

```typescript
get successCreateMsg(): Locator {
    return this.page.getByText('Monitor created successfully');
}
```

Tolerated for full-sentence Sonner-toast messages because no other string contains it. For any short or generic string ("Edit", "Save", "Active"), drop the toleration and pass `exact: true`.

## P3 — Filter by row text (instead of column position)

### Good

```typescript
getRowByName(name: string): Locator {
    return this.page
        .locator('tbody tr:not([data-testid="expanded-row"])')
        .filter({ hasText: name });
}

async openRowActionMenu(row: Locator, menuItem: string): Promise<void> {
    const actionBtn = row.locator("[data-testid^='monitor-actions-']");
    const item = this.page.getByRole('menuitem', { name: menuItem });

    await expect(async () => {
        await actionBtn.click();
        await item.click({ timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Identifies the row by content; survives column reordering. The `:not([data-testid="expanded-row"])` exclusion guards against strict-mode double-matches when a row is expanded.

### Bad

```typescript
getMonitorTypeByName(monitorName: string): Locator {
    return this.getRowByName(monitorName).locator('td').nth(3);
}
```

Brittle to column reordering, additions, or per-tenant column visibility. The fix is to use a column-name-aware lookup. Today the framework exposes column **headers** through `sort-header-<columnId>` testids ([pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) `getSortHeader`); per-cell column testids are missing and should be requested from the front-end team. Until then, prefer `getByRole('cell')` scoped under the row when the cell text is itself stable, or explicitly comment the column-index dependency.

## P4 — Component scoping (instead of repeated top-level lookups)

### Good

```typescript
class DeleteMonitorDialog {
    private readonly dialog: Locator;

    constructor(private page: Page) {
        this.dialog = this.page.getByTestId('delete-monitor-dialog');
    }

    get title(): Locator { return this.dialog.getByRole('heading'); }
    get confirmButton(): Locator { return this.page.getByTestId('delete-monitor-confirm'); }
    get cancelButton(): Locator { return this.dialog.getByRole('button', { name: /cancel/i }); }
}
```

Pattern mirrors the inline delete-dialog scoping in [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts) (`deleteDialog`, `deleteConfirmButton`, `deleteCancelButton`) and the equivalent `delete-probe-*` getters in [pages/app/ProbesPage.ts](../../../pages/app/ProbesPage.ts). All inner getters chain off the dialog anchor, so even if a similarly-named element exists on the underlying page, it's filtered out.

> **Anchor as a field is the one exception** to the "always use getters" rule shown in P14: when a single locator is the parent of every getter in the class, store it once in the constructor. Locators are lazy, so the field still re-resolves on each downstream `.click()` / `expect()`.

### Bad

```typescript
get title(): Locator {
    return this.page.getByRole('heading', { name: /delete/i });
}
get confirmButton(): Locator {
    return this.page.getByTestId('delete-monitor-confirm');
}
get cancelButton(): Locator {
    return this.page.getByRole('button', { name: /cancel/i });
}
```

These work *until* the page also renders a "Cancel subscription" or a generic "Cancel" button somewhere else. Strict mode then fails. Always anchor.

## P5 — Dynamic locator: enum + map dispatch (instead of if/else)

### Good

```typescript
healthCard(state: HealthState): Locator {
    const map: Record<HealthState, Locator> = {
        healthy: this.healthyCard,
        warning: this.warningCard,
        critical: this.criticalCard,
        unknown: this.unknownCard,
    };
    return map[state];
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Type-checked at compile time; adding a new `HealthState` member produces a TS error at the map.

### Bad

```typescript
async clickHealthCard(state: string): Promise<void> {
    if (state === 'healthy') {
        await this.page.getByTestId('filter-healthy').click();
    } else if (state === 'warning') {
        await this.page.getByTestId('filter-warning').click();
    } else if (state === 'critical') {
        await this.page.getByTestId('filter-critical').click();
    } else if (state === 'unknown') {
        await this.page.getByTestId('filter-unknown').click();
    }
}
```

Works, but: (1) the locators are constructed inline so they cannot be reused for assertions in the same flow or in specs, (2) every new state needs an extra `if` branch (no compile-time exhaustiveness check), (3) the testid strings are buried inside an action method, hidden from grep. Refactor toward an enum + map + helper getter as in the Good example.

## P6 — Frame selection by stable attribute

### Good (prescriptive — no iframes in this codebase today)

```typescript
constructor(readonly page: Page) {
    this.frameLocator = page.frameLocator('iframe[title="Login Iframe"]');
}
```

Stable; survives the page mounting other iframes. Use `[title=…]` / `[name=…]` / `[id=…]` / `[src*=…]` in priority order.

### Bad

```typescript
this.frameLocator = page.frameLocator('iframe');
```

Picks up the wrong iframe the moment a second one mounts (chat widget, analytics, Stripe popup, etc.). The framework has no iframes today; if you add one, harden the selector before merging.

## P7 — Native semantic locator (when stable)

### Good

```typescript
get pageTitle(): Locator {
    return this.page.getByRole('heading', { name: 'Synthetics' });
}

get metricsTab(): Locator {
    return this.page.getByRole('tab', { name: 'Metrics' });
}

get refreshButton(): Locator {
    // Toolbar one is always first in DOM order; the same accessible name is reused
    // by the expanded-row refresh button when rows are expanded.
    return this.page.getByRole('button', { name: 'Refresh' }).first();
}
```

### Bad

```typescript
get pageTitle(): Locator {
    return this.page.locator('h1.page-title');
}
```

Tag + class is exactly what `getByRole('heading')` exists to replace.

## P8 — Web-first assertion vs imperative state read

### Good

```typescript
await expect(this.createMonitorButton).toBeVisible();
await this.createMonitorButton.click();
await expect(this.createMonitorSheet).toBeVisible();
```

```typescript
await expect(this.tableHeaders).toHaveCount(expectedColumnCount);
```

Auto-retries until the assertion holds or the timeout elapses; no race conditions.

### Bad

```typescript
if (await this.createMonitorButton.isVisible()) {
    await this.createMonitorButton.click();
}
```

`isVisible()` is a snapshot — the element can disappear before the click. Worse: if it's truly invisible the test silently passes without doing anything.

```typescript
await this.page.waitForTimeout(2000);
await expect(this.something).toBeVisible();
```

`waitForTimeout` is forbidden (see [`page-objects`](../page-objects/SKILL.md) § Critical and `test-standards` § Critical). The trailing `expect` already auto-waits.

## P9 — Action method validates success

### Good

```typescript
async submitCreateMonitor(): Promise<void> {
    await this.waitForCreateMonitorEnabled();   // toBeEnabled({ timeout: 20000 })
    await this.createMonitorSubmitButton.click();
}

async expectCreateFlowCompleteOnList(): Promise<void> {
    await expect(this.createMonitorSheet).toBeHidden({
        timeout: appConfig.timeouts.navigation,
    });
    await expect(this.pageRoot).toBeVisible();
    await expect(this.page).toHaveURL(/\/synthetics(\?.*)?$/i);
}

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

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Click → button-disabled wait → DOM confirmation → URL confirmation → Sonner toast. Multiple independent signals.

### Bad

```typescript
async submitCreateMonitor(): Promise<void> {
    await this.createMonitorSubmitButton.click();
}
```

Returns "successfully" before the API has confirmed creation. Subsequent assertions on the new row will be flaky. Per [`page-objects`](../page-objects/SKILL.md), every POM method must include at least one built-in validation.

## P10 — `.first()` only when intentional

### Good

```typescript
get refreshButton(): Locator {
    // The accessible name "Refresh" is reused by the expanded-row refresh
    // button when rows are expanded; the toolbar one is always first in DOM.
    return this.page.getByRole('button', { name: 'Refresh' }).first();
}

getFirstRowActionButton(): Locator {
    return this.tableRows.first().locator("[data-testid^='monitor-actions-']");
}
```

The name `firstRowActionButton` makes the `.first()` part of the contract, so a reader doesn't have to guess why position is being used.

### Bad

```typescript
get currentRow(): Locator {
    return this.page.getByTestId(/^monitor-actions-/).first();
}
```

Hides ambiguity. Either filter by row content (`getRowByName(name)` then drill to the action button) or accept that the call site needs to choose.

## P11 — Two-state element with `.or()`

### Good

```typescript
get pauseOrResumeMenuItem(): Locator {
    return this.getActionMenuItem('Pause').or(this.getActionMenuItem('Resume'));
}

async verifyActionMenuOptions(): Promise<void> {
    await expect(this.getActionMenuItem('Edit monitor')).toBeVisible();
    await expect(this.getActionMenuItem('View details')).toBeVisible();
    await expect(
        this.getActionMenuItem('Pause').or(this.getActionMenuItem('Resume'))
    ).toBeVisible();
    await expect(this.getActionMenuItem('Delete')).toBeVisible();
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Two menu items are mutually exclusive (a paused monitor shows "Resume"; a running one shows "Pause"). `.or()` lets the assertion pass either way without inflating the spec with conditional branches.

`.or()` is also the right tool for legacy-vs-current testid duals (older specs use `synthetics-name-search`, the current UI exposes the search via a labelled textbox):

```typescript
get searchInput(): Locator {
    return this.page
        .getByTestId('synthetics-name-search')
        .or(this.syntheticsListSearchInput);
}
```

### Bad

```typescript
async verifyPauseOrResume(): Promise<void> {
    if (await this.getActionMenuItem('Pause').isVisible()) {
        await expect(this.getActionMenuItem('Pause')).toBeVisible();
    } else {
        await expect(this.getActionMenuItem('Resume')).toBeVisible();
    }
}
```

`isVisible()` is a snapshot (P8). Use `.or()` plus a single `toBeVisible()` so Playwright auto-waits for either branch.

## P12 — Toast / Sonner notification

### Good

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

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Filters the Sonner stack by the monitor name first, so two toasts firing in rapid succession (create + auto-refresh) don't trip strict mode. `.or()` widens to the regional `sonner` testid as a fallback.

### Bad — hypothetical, do not write this

```typescript
get successNotification(): Locator {
    return this.page.getByTestId('notification-success');
}
```

Invented testids like `notification-success` / `notification-error` don't exist in the actual app — Sonner is the real toast component and it renders `[data-sonner-toast]` data attributes, not per-variant testids. Always use the filter shape above.

## P13 — Use the locator API instead of evaluating in the browser

### Good

```typescript
async selectChartTimeframe(timeframe: string): Promise<void> {
    const button = this.getChartTimeframeButton(timeframe);
    await button.click();
    await expect(button).toHaveAttribute('data-state', 'on');
}

await expect(this.autoRefreshSwitch).toHaveAttribute('aria-checked', 'true');
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Radix exposes its toggle/active state on `data-state` and `aria-checked`; assert against the attribute directly.

### Bad

```typescript
const isActive = await this.page.evaluate(() => {
    return document
        .querySelector('[data-testid="chart-timeframe-selector"] [aria-checked="true"]')
        ?.getAttribute('value');
});
expect(isActive).toBe('5m');
```

`page.evaluate` bypasses Playwright's auto-wait, hides the locator from traces, and re-implements `toHaveAttribute`.

## P14 — Lazy locator vs eager state

### Good

```typescript
get pageRoot(): Locator {
    return this.page.getByTestId('page-synthetics');
}

async expectSyntheticsListReady(): Promise<void> {
    await expect(this.pageRoot).toBeVisible({
        timeout: appConfig.timeouts.navigation,
    });
}
```

The locator is created on every access; calling `.toBeVisible()` re-resolves it.

### Bad

```typescript
private pageRoot: Locator;
private createMonitorButton: Locator;
private dataTable: Locator;

constructor(page: Page) {
    super(page);
    this.pageRoot = page.getByTestId('page-synthetics');
    this.createMonitorButton = page.getByTestId('create-monitor-button');
    this.dataTable = page.getByTestId('data-table');
}
```

Storing every leaf locator in a field is technically valid (Locators are lazy and re-resolve on access) but it (1) bloats the constructor, (2) breaks the `get x(): Locator` convention the framework standardizes on, and (3) makes IDE jump-to-definition skip past the actual selector. The `private readonly anchor: Locator` field shown in P4 is the **only** sanctioned use of this pattern: a single anchor that every getter chains off of.

## P15 — `filter({ has: <Locator> })` for parent-by-child

### Good

```typescript
getProbeOptionByName(probeName: string): Locator {
    return this.probeSelection
        .locator('label')
        .filter({
            has: this.page.locator(`text="${probeName}"`),
        });
}
```

Picks the `<label>` whose subtree contains the given probe name — useful when the row also has a tooltip or description that repeats the name and `hasText` over-matches.

### Better

```typescript
getProbeOptionByName(probeName: string): Locator {
    return this.probeSelection
        .locator('label')
        .filter({ hasText: probeName });
}
```

`hasText` matches when **any descendant text** of `<label>` contains the string. In the probe-selection block today, only the inner label text shows the probe name, so `hasText` and `filter({ has: <text> })` resolve to the same element. They are NOT equivalent in general — switch to `has: <Locator>` only when text alone over-matches (e.g. a tooltip repeats the name, or a sibling description includes it).

### Bad

```typescript
const checkbox = this.probeSelection
    .locator(`label:has-text("${probeName}") input[type="checkbox"]`);
```

Single CSS string mixing Playwright's `:has-text` pseudo with attribute selectors. Hard to read; impossible to refactor incrementally.

## P16 — Search by exact value

### Good

```typescript
async expectMonitorListed(name: string): Promise<void> {
    const search = this.syntheticsListSearchInput;
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.clear();
    await search.fill(name);
    await expect(this.getRowByName(name).first()).toBeVisible({
        timeout: appConfig.timeouts.navigation,
    });
}
```

From [pages/app/SyntheticsPage.ts](../../../pages/app/SyntheticsPage.ts). Action → assertion that the search filtered to the expected row.

### Bad

```typescript
async searchByName(name: string): Promise<void> {
    await this.searchInput.fill(name);
    await this.page.waitForTimeout(2000);
}
```

Sleep instead of assertion; no contract that the search worked. `waitForTimeout` is forbidden.

## P17 — POM vs spec placement

### Good — inline arrival / empty-state marker, never interacted with

```typescript
// tests/app/functional/monitoring-service/synthetics/icmp-monitor-expanded-view.spec.ts
await test.step('THEN: Empty state is visible before first probe data', async () => {
    await expect(page.getByText('No ICMP Metrics Available')).toBeVisible();
});
```

A single, one-shot assertion confirming the expanded view rendered. No POM getter exists for this string and adding one would inflate `SyntheticsPage` with a member used by nothing else. **The locator is never clicked, filled, or hovered.**

### Good — repeated success-toast assertion

```typescript
// tests/app/e2e/monitoring-service/synthetics/icmp-synthetic-monitor.spec.ts
await syntheticsPage.expectSuccessToastForMonitor(name);
```

This wraps the inline `[data-sonner-toast]` filter in a POM method (P12) once it's used by more than one spec — promote on first duplication.

### Bad — inline CSS selector

```typescript
// (hypothetical)
const activeFilter = page.locator('.health-filter-active .filter-chip');
```

CSS in a spec is forbidden. Wrap it in a POM getter (`syntheticsPage.activeHealthFilterChip`) — even as a stopgap — and add a `// TODO: replace with testid` comment.

### Bad — inline locator that gets clicked

```typescript
// (hypothetical)
await page.getByTestId('create-monitor-button').click();
await page.getByPlaceholder('Search by name or target').fill(name);
```

The moment you click, fill, or hover, the locator MUST live behind a POM method (`syntheticsPage.openCreateMonitorFlow()`, `syntheticsPage.searchByName(name)`). Reason: action methods carry the post-condition assertion (see [`page-objects`](../page-objects/SKILL.md)); inlining bypasses that contract.

See SKILL.md → "Where selectors live" for the full rule and decision tree.

## P18 — Consistent snapshot for cross-counter assertions

### Good

```typescript
// CORRECT — retries the entire read-then-assert until a consistent snapshot is captured
await expect(async () => {
  const counts = await syntheticsPage.getAllHealthCounts();
  expect(counts.total).toBe(
    counts.healthy + counts.warning + counts.critical + counts.unknown,
  );
}).toPass({ timeout: 15_000 });
```

### Bad

```typescript
// BAD — cards can refresh between reads; sum won't match total
const counts = await syntheticsPage.getAllHealthCounts();
expect(counts.total).toBe(
  counts.healthy + counts.warning + counts.critical + counts.unknown,
);
```

Use `.toPass()` whenever an assertion compares **two or more dynamic UI values** that are read separately (auto-refreshing health cards, row count vs. card count, totalElements from API vs. card sum). The page can refresh mid-read; the second read-then-assert sequence sees a different snapshot and fails. Wrapping in `.toPass()` retries the **entire** sequence until both reads come from a consistent moment in time.

This is distinct from P9 (action method validates success) — P9 covers verifying a state change after an action; P18 covers cross-counter sums on naturally-changing UI.

## Self-review

After any selector edit, run through the [SKILL.md self-review checklist](SKILL.md#self-review-checklist-11-items). If any item fails, return to the matching pattern above for the fix.
