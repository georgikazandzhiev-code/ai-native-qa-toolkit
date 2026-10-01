# Accessibility testing — templates

Copy-paste skeletons for the [`accessibility-testing`](SKILL.md) skill. Paths, the fixtures barrel, the tag and the Qase suite are placeholders. Replace them with the project's real ones (see `test-standards`, `fixtures`, `enums`).

**Evidence: STATIC.** These follow Playwright's accessibility-testing guide and the `@axe-core/playwright` API. They have not been executed in this repository yet.

Install once, as a dev dependency of the test project: `npm i -D @axe-core/playwright`.

---

## 1. The `makeAxeBuilder` fixture

One place for the WCAG tags and the documented exclusions. The fixture returns a **factory**, so a test can scan several states and narrow one scan with `include(...)`.

```typescript
// fixtures/a11y/axe-fixture.ts
import { test as base } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { A11Y_WCAG_TAGS, A11Y_EXCLUSIONS } from "../../enums/util/accessibility";

type AxeFixtures = { makeAxeBuilder: () => AxeBuilder };

export const axeFixture = base.extend<AxeFixtures>({
    makeAxeBuilder: async ({ page }, use) => {
        const makeAxeBuilder = (): AxeBuilder => {
            const builder = new AxeBuilder({ page }).withTags([...A11Y_WCAG_TAGS]);
            for (const exclusion of A11Y_EXCLUSIONS) builder.exclude(exclusion.selector);
            return builder;
        };
        await use(makeAxeBuilder);
    },
});
```

Merge it into the fixtures barrel (`mergeTests(...)` in `test-options.ts`) like every other fixture.

```typescript
// enums/util/accessibility.ts
/** WCAG conformance target for automated scans: 2.x A + AA. Raise deliberately, here only. */
export const A11Y_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

/** One region excluded from every scan. Known violations carry a ticket and an expiry (yyyy-mm-dd). */
type A11yExclusion = { selector: string; owner: string; reason: string; ticket: string; expires: string };

/**
 * Regions excluded from every scan — third-party embeds and known violations only.
 * Example entry: { selector: "#vendor-chat", owner: "Vendor X", reason: "Not our markup", ticket: "PROJ-123", expires: "2026-12-31" }.
 * An expired entry must be renewed with a reason or removed.
 */
export const A11Y_EXCLUSIONS: ReadonlyArray<A11yExclusion> = [];
```

To make expired entries fail, add a small unit check, or a `beforeAll` in the fixture module, that compares each `expires` date with today and throws with the entry's ticket.

---

## 2. Scanning one meaningful state

One test per state. Reach the state through the page object, prove it's on screen, scan, attach, and assert strictly.

```typescript
import { test, expect } from "../../../fixtures/pom/test-options";
import { SUITES } from "../../../enums/app/qase-suites";
import { qase } from "playwright-qase-reporter";

test.describe("Settings accessibility", () => {
    test("Verify the delete-account dialog has no automated a11y violations", { tag: "@App-regression" }, async ({ settingsPage, makeAxeBuilder }, testInfo) => {
        qase.suite(SUITES.APP_SETTINGS);

        await test.step("GIVEN: the delete-account dialog is open", async () => {
            await settingsPage.openDeleteAccountDialog(); // action method waits for the dialog
        });

        // test.step returns its callback's value, so the result flows to the THEN step.
        const results = await test.step("WHEN: the dialog is scanned against WCAG 2.x A + AA", async () => {
            const scan = await makeAxeBuilder().include('[role="dialog"]').analyze();
            await testInfo.attach("axe-results", { body: JSON.stringify(scan, null, 2), contentType: "application/json" });
            return scan;
        });

        await test.step("THEN: there are no violations", async () => {
            expect(results.violations).toEqual([]);
        });
    });
});
```

`toEqual([])` prints every violation (rule id, impact, help URL, affected nodes) when it fails. The attachment keeps the full result in the HTML report.

---

## 3. Keyboard path and dialog focus

What no rule engine can judge: can the flow be done without a mouse, and does focus go where it should?

```typescript
test("Verify the delete-account dialog traps focus and returns it on Escape", { tag: "@App-regression" }, async ({ page, settingsPage }) => {
    qase.suite(SUITES.APP_SETTINGS);

    await test.step("GIVEN: the dialog was opened from its trigger", async () => {
        await settingsPage.openDeleteAccountDialog();
    });

    await test.step("WHEN: Escape is pressed", async () => {
        await page.keyboard.press("Escape");
    });

    await test.step("THEN: the dialog is gone and focus is back on the trigger", async () => {
        await expect(settingsPage.deleteAccountDialog).toBeHidden();
        await expect(settingsPage.deleteAccountButton).toBeFocused();
    });
});
```

For a keyboard path, press `Tab` in a `test.step` and assert `toBeFocused()` on each control in the expected order. Then complete the action with `Enter` or `Space`, and assert the same success feedback the functional test asserts.

---

## 4. ARIA structure snapshot

Pins what a screen reader announces (headings, landmarks, list and table shape) without asserting copy that changes.

```typescript
await expect(page.getByRole("main")).toMatchAriaSnapshot(`
  - heading "Settings" [level=1]
  - region "Profile":
    - textbox "Display name"
    - button "Save"
`);
```

Keep snapshots small and about structure. If a copy change breaks one, the snapshot was asserting content, not structure.
