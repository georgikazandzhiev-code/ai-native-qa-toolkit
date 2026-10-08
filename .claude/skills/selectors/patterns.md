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
get jobNameInput(): Locator {
    return this.page.getByLabel('Job Name', { exact: true });
}

get targetInput(): Locator {
    return this.page.getByLabel('Target', { exact: true });
}
```

The fields have visible labels, so `getByLabel` is the locator (priority 2). The schema-form's `field-field-*` test-id is the fallback only where a label is not associated with its input — not something to `.or()` with the label, because both would match the same input. `pages/app/JobsPage.ts` still uses the test-id-plus-`.or()` shape: drift, fix on next touch. The chain stays at one level — never CSS at the top.

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
get createJobTitle(): Locator {
    return this.page.getByText('Create Job', { exact: true });
}

get editMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Edit job' });
}
```

`exact: true` prevents matches against "Create Job — HTTP", "Edit job (admin)", "Edit user". When a stable role (`menuitem`, `option`, `button`) is available, prefer it over `getByText` for short labels.

### Bad

```typescript
get successCreateMsg(): Locator {
    return this.page.getByText('Job created successfully');
}
```

Tolerated for full-sentence Sonner-toast messages because no other string contains it. For any short or generic string ("Edit", "Save", "Active"), drop the toleration and pass `exact: true`.

## P3 — Filter by row text (instead of column position)

### Good

```typescript
getRowByName(name: string): Locator {
    return this.page
        .getByRole('row')
        .filter({ has: this.page.getByRole('cell', { name, exact: true }) });
}

async openRowActionMenu(row: Locator, menuItem: string): Promise<void> {
    const actionBtn = row.locator("[data-testid^='job-actions-']");
    const item = this.page.getByRole('menuitem', { name: menuItem });

    await expect(async () => {
        await actionBtn.click();
        await item.click({ timeout: appConfig.timeouts.fastFail });
    }).toPass({ timeout: appConfig.timeouts.retryBlock });
}
```

Adapted from `pages/app/JobsPage.ts`, which filters on the row text and excludes `[data-testid="expanded-row"]` to avoid strict-mode double-matches when a row is expanded; matching the name **cell** exactly does that job without the testid. Identifies the row by content; survives column reordering. **Check the live app before switching an existing locator** (`npx playwright open`): an exact cell match fails when the name cell holds more than the name — an icon label, a badge — and then the row needs a filter on the cell's own child element instead.

### Bad

```typescript
getJobTypeByName(jobName: string): Locator {
    return this.getRowByName(jobName).locator('td').nth(3);
}
```

Brittle to column reordering, additions, or per-tenant column visibility. The fix is to use a column-name-aware lookup. Today the framework exposes column **headers** through `sort-header-<columnId>` testids (`pages/app/JobsPage.ts` `getSortHeader`); per-cell column testids are missing and should be requested from the front-end team. Until then, prefer `getByRole('cell')` scoped under the row when the cell text is itself stable, or explicitly comment the column-index dependency.

## P4 — Component scoping (instead of repeated top-level lookups)

### Good

```typescript
class DeleteJobDialog {
    private readonly dialog: Locator;

    constructor(private page: Page) {
        this.dialog = this.page.getByRole('dialog', { name: /delete job/i });
    }

    get title(): Locator { return this.dialog.getByRole('heading'); }
    get confirmButton(): Locator { return this.dialog.getByRole('button', { name: /^delete$/i }); }
    get cancelButton(): Locator { return this.dialog.getByRole('button', { name: /cancel/i }); }
}
```

The existing delete dialogs in `pages/app/JobsPage.ts` and `pages/app/WorkersPage.ts` anchor on test-ids (`delete-job-dialog`, `delete-worker-*`) — drift to fix on next touch; the test-id is the fallback if the dialog has no accessible name. All inner getters chain off the dialog anchor, so even if a similarly-named element exists on the underlying page, it's filtered out.

> **Anchor as a field is the one exception** to the "always use getters" rule shown in P14: when a single locator is the parent of every getter in the class, store it once in the constructor. Locators are lazy, so the field still re-resolves on each downstream `.click()` / `expect()`.

### Bad

```typescript
get title(): Locator {
    return this.page.getByRole('heading', { name: /delete/i });
}
get confirmButton(): Locator {
    return this.page.getByTestId('delete-job-confirm');
}
get cancelButton(): Locator {
    return this.page.getByRole('button', { name: /cancel/i });
}
```

These work *until* the page also renders a "Cancel subscription" or a generic "Cancel" button somewhere else. Strict mode then fails. Always anchor.

## P5 — Dynamic locator: enum + map dispatch (instead of if/else)

### Good

```typescript
jobStatusCard(jobStatus: JobStatus): Locator {
    const map: Record<JobStatus, Locator> = {
        passing: this.passingCard,
        degraded: this.degradedCard,
        failing: this.failingCard,
        paused: this.pausedCard,
    };
    return map[jobStatus];
}
```

From `pages/app/JobsPage.ts`. Type-checked at compile time; adding a new `JobStatus` member produces a TS error at the map.

### Bad

```typescript
async clickJobStatusCard(jobStatus: string): Promise<void> {
    if (jobStatus === 'passing') {
        await this.page.getByTestId('filter-passing').click();
    } else if (jobStatus === 'degraded') {
        await this.page.getByTestId('filter-degraded').click();
    } else if (jobStatus === 'failing') {
        await this.page.getByTestId('filter-failing').click();
    } else if (jobStatus === 'paused') {
        await this.page.getByTestId('filter-paused').click();
    }
}
```

Works, but: (1) the locators are constructed inline so they cannot be reused for assertions in the same flow or in specs, (2) every new job status needs an extra `if` branch (no compile-time exhaustiveness check), (3) the testid strings are buried inside an action method, hidden from grep. Refactor toward an enum + map + helper getter as in the Good example.

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
    return this.page.getByRole('heading', { name: 'Jobs' });
}

get runStatsTab(): Locator {
    return this.page.getByRole('tab', { name: 'Run Stats' });
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
await expect(this.createJobButton).toBeVisible();
await this.createJobButton.click();
await expect(this.createJobSheet).toBeVisible();
```

```typescript
await expect(this.tableHeaders).toHaveCount(expectedColumnCount);
```

Auto-retries until the assertion holds or the timeout elapses; no race conditions.

### Bad

```typescript
if (await this.createJobButton.isVisible()) {
    await this.createJobButton.click();
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
async submitCreateJob(): Promise<void> {
    await expect(this.createJobSubmitButton).toBeEnabled({ timeout: appConfig.timeouts.persist });
    const created = this.page.waitForResponse((r) => r.url().includes('/api/jobs') && r.request().method() === 'POST');
    await this.createJobSubmitButton.click();
    expect((await created).ok()).toBe(true);
    await expect(this.createJobSheet).toBeHidden();
}

async expectCreateFlowCompleteOnList(): Promise<void> {
    await expect(this.createJobSheet).toBeHidden({
        timeout: appConfig.timeouts.navigation,
    });
    await expect(this.pageRoot).toBeVisible();
    await expect(this.page).toHaveURL(/\/jobs(\?.*)?$/i);
}

async expectSuccessToastForJob(name: string): Promise<void> {
    const toast = this.page.getByRole('status').filter({ hasText: name });
    await expect(toast).toBeVisible({ timeout: appConfig.timeouts.persist });
    await expect(toast).toContainText(/created successfully/i);
}
```

The action confirms its own result: enabled → response wait armed → click → the create succeeded → the sheet closed. The `expect…` methods add the business-level signals (list, URL, toast). Multiple independent signals.

### Bad

```typescript
async submitCreateJob(): Promise<void> {
    await this.createJobSubmitButton.click();
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
    return this.tableRows.first().locator("[data-testid^='job-actions-']");
}
```

The name `firstRowActionButton` makes the `.first()` part of the contract, so a reader doesn't have to guess why position is being used.

### Bad

```typescript
get currentRow(): Locator {
    return this.page.getByTestId(/^job-actions-/).first();
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
    await expect(this.getActionMenuItem('Edit job')).toBeVisible();
    await expect(this.getActionMenuItem('View details')).toBeVisible();
    await expect(
        this.getActionMenuItem('Pause').or(this.getActionMenuItem('Resume'))
    ).toBeVisible();
    await expect(this.getActionMenuItem('Delete')).toBeVisible();
}
```

From `pages/app/JobsPage.ts`. Two menu items are mutually exclusive (a paused job shows "Resume"; an active one shows "Pause"). `.or()` lets the assertion pass either way without inflating the spec with conditional branches.

`.or()` also fits a legacy-vs-current pair, **but only when the two can never match at the same time**. If both hooks exist on the current page, the union matches twice and strict mode fails. Once the legacy markup is gone, drop the `.or()` and keep the label:

```typescript
get searchInput(): Locator {
    return this.page
        .getByTestId('jobs-name-search')
        .or(this.jobsListSearchInput);
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
async expectSuccessToastForJob(name: string): Promise<void> {
    const toast = this.page.getByRole('status').filter({ hasText: name });
    await expect(toast).toBeVisible({ timeout: appConfig.timeouts.persist });
    await expect(toast).toContainText(/created successfully/i);
}
```

Sonner renders each toast with `role="status"`. Filtering by the job name keeps a second toast firing in the same window (create + auto-refresh) from tripping strict mode, so no `.first()` is needed. If your Sonner build doesn't expose the role, fall back to `this.page.locator('[data-sonner-toast]').filter({ hasText: name })`. Never `.or()` the toast with the toaster region (`getByTestId('sonner')`): the region contains the toast, so both match at once and strict mode fails. `pages/app/JobsPage.ts` still has that shape: drift, fix on next touch.

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

From `pages/app/JobsPage.ts`. Radix exposes its toggle/active state on `data-state` and `aria-checked`; assert against the attribute directly.

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
    return this.page.getByTestId('page-jobs');
}

async expectJobsListReady(): Promise<void> {
    await expect(this.pageRoot).toBeVisible({
        timeout: appConfig.timeouts.navigation,
    });
}
```

The locator is created on every access; calling `.toBeVisible()` re-resolves it.

### Bad

```typescript
private pageRoot: Locator;
private createJobButton: Locator;
private dataTable: Locator;

constructor(page: Page) {
    super(page);
    this.pageRoot = page.getByTestId('page-jobs');
    this.createJobButton = page.getByTestId('create-job-button');
    this.dataTable = page.getByTestId('data-table');
}
```

Storing every leaf locator in a field is technically valid (Locators are lazy and re-resolve on access) but it (1) bloats the constructor, (2) breaks the `get x(): Locator` convention the framework standardizes on, and (3) makes IDE jump-to-definition skip past the actual selector. The `private readonly anchor: Locator` field shown in P4 is the **only** sanctioned use of this pattern: a single anchor that every getter chains off of.

## P15 — `filter({ has: <Locator> })` for parent-by-child

### Good

```typescript
getWorkerOptionByName(workerName: string): Locator {
    return this.workerSelection
        .locator('label')
        .filter({ has: this.page.getByText(workerName, { exact: true }) });
}
```

Picks the `<label>` whose subtree contains the given worker name — useful when the row also has a tooltip or description that repeats the name and `hasText` over-matches.

### Avoid for dynamic values

```typescript
getWorkerOptionByName(workerName: string): Locator {
    return this.workerSelection
        .locator('label')
        .filter({ hasText: workerName });
}
```

`hasText` is a **substring** match: "worker-1" also matches "worker-10". For a value passed in as a parameter, use the exact `has:` form above (§ Critical: `exact: true` in dynamic methods). `hasText` also matches when **any descendant text** of `<label>` contains the string. In the worker-selection block today, only the inner label text shows the worker name, so `hasText` and `filter({ has: <text> })` resolve to the same element. They are NOT equivalent in general — switch to `has: <Locator>` only when text alone over-matches (e.g. a tooltip repeats the name, or a sibling description includes it).

### Bad

```typescript
const checkbox = this.workerSelection
    .locator(`label:has-text("${workerName}") input[type="checkbox"]`);
```

Single CSS string mixing Playwright's `:has-text` pseudo with attribute selectors. Hard to read; impossible to refactor incrementally.

## P16 — Search by exact value

### Good

```typescript
async expectJobListed(name: string): Promise<void> {
    const search = this.jobsListSearchInput;
    await expect(search).toBeVisible({ timeout: appConfig.timeouts.fastFail });
    await search.clear();
    await search.fill(name);
    await expect(this.getRowByName(name)).toBeVisible({
        timeout: appConfig.timeouts.navigation,
    });
}
```

From `pages/app/JobsPage.ts`. Action → assertion that the search filtered to the expected row.

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
// tests/app/functional/jobs-service/jobs/export-job-expanded-view.spec.ts
await test.step('THEN: Empty state is visible before the first run stats', async () => {
    await expect(page.getByText('No Export Run Stats Available')).toBeVisible();
});
```

A single, one-shot assertion confirming the expanded view rendered. No POM getter exists for this string and adding one would inflate `JobsPage` with a member used by nothing else. **The locator is never clicked, filled, or hovered.**

### Good — repeated success-toast assertion

```typescript
// tests/app/e2e/jobs-service/jobs/export-job.spec.ts
await jobsPage.expectSuccessToastForJob(name);
```

This wraps the inline `[data-sonner-toast]` filter in a POM method (P12) once it's used by more than one spec — promote on first duplication.

### Bad — inline CSS selector

```typescript
// (hypothetical)
const activeFilter = page.locator('.outcome-filter-active .filter-chip');
```

CSS in a spec is forbidden. Wrap it in a POM getter (`jobsPage.activeOutcomeFilterChip`) — even as a stopgap — and add a `// TODO: replace with testid` comment.

### Bad — inline locator that gets clicked

```typescript
// (hypothetical)
await page.getByTestId('create-job-button').click();
await page.getByPlaceholder('Search by name or target').fill(name);
```

The moment you click, fill, or hover, the locator MUST live behind a POM method (`jobsPage.openCreateJobFlow()`, `jobsPage.searchByName(name)`). Reason: action methods carry the post-condition assertion (see [`page-objects`](../page-objects/SKILL.md)); inlining bypasses that contract.

See SKILL.md → "Where selectors live" for the full rule and decision tree.

## P18 — Consistent snapshot for cross-counter assertions

### Good

```typescript
// CORRECT — retries the entire read-then-assert until a consistent snapshot is captured
await expect(async () => {
  const counts = await jobsPage.getAllJobStatusCounts();
  expect(counts.total).toBe(
    counts.passing + counts.degraded + counts.failing + counts.paused,
  );
}).toPass({ timeout: appConfig.timeouts.retryBlock });
```

### Bad

```typescript
// BAD — cards can refresh between reads; sum won't match total
const counts = await jobsPage.getAllJobStatusCounts();
expect(counts.total).toBe(
  counts.passing + counts.degraded + counts.failing + counts.paused,
);
```

Use `.toPass()` whenever an assertion compares **two or more dynamic UI values** that are read separately (auto-refreshing job-status cards, row count vs. card count, totalElements from API vs. card sum). The page can refresh mid-read; the second read-then-assert sequence sees a different snapshot and fails. Wrapping in `.toPass()` retries the **entire** sequence until both reads come from a consistent moment in time.

This is distinct from P9 (action method validates success) — P9 covers verifying a state change after an action; P18 covers cross-counter sums on naturally-changing UI.

## Self-review

After any selector edit, run through the [SKILL.md self-review checklist](SKILL.md#self-review-checklist-11-items). If any item fails, return to the matching pattern above for the fix.
