# Accessibility testing — templates

Copy-paste skeletons for the [`accessibility-testing`](SKILL.md) skill. Paths, the fixtures barrel, the tag and the Qase suite are placeholders. Replace them with the project's real ones (see `test-standards`, `fixtures`, `enums`).

**Evidence: STATIC.** These follow Playwright's accessibility-testing guide and the `@axe-core/playwright` API. They have not been executed in this repository yet.

Install once, as a dev dependency of the test project: `npm i -D @axe-core/playwright`.

---

## 1. The `makeAxeBuilder` fixture and the known-violations filter

One place for the WCAG tags, the third-party regions and the known-violations list. The fixture returns a **factory**, so a test can scan several states and narrow one scan with `include(...)`.

Two lists, because they do different things:

- **Third-party regions** are removed from the scan with `exclude(...)`. That hides the region from **every** rule, which is right only for markup the team does not own.
- **Known violations** are never excluded. The page is scanned in full, and afterwards `unexpectedViolations()` drops only the exact pairs on the list: **this rule on this element**. Another rule failing on the same element, or the same rule failing anywhere else, still fails.

```typescript
// enums/util/accessibility.ts
/** WCAG conformance target for automated scans: 2.x A + AA. Raise deliberately, here only. */
export const A11Y_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

/** Markup the team does not own. Excluded from every rule, so nothing of ours belongs here. */
type A11yThirdPartyRegion = { selector: string; owner: string; reason: string };
export const A11Y_THIRD_PARTY_REGIONS: ReadonlyArray<A11yThirdPartyRegion> = [];

/**
 * One tolerated violation: exactly this axe rule on exactly this element.
 * `target` is copied from the attached axe results (the node's `target`, joined with a space).
 * Example: { ruleId: "color-contrast", target: "#site-footer > .legal", ticket: "PROJ-123", expires: "2026-12-31" }.
 */
type A11yKnownViolation = { ruleId: string; target: string; ticket: string; expires: string };
export const A11Y_KNOWN_VIOLATIONS: ReadonlyArray<A11yKnownViolation> = [];
```

```typescript
// fixtures/a11y/axe-fixture.ts
import { test as base } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AxeResults } from "axe-core";
import { A11Y_WCAG_TAGS, A11Y_THIRD_PARTY_REGIONS, A11Y_KNOWN_VIOLATIONS } from "../../enums/util/accessibility";

type AxeFixtures = { makeAxeBuilder: () => AxeBuilder };

export const axeFixture = base.extend<AxeFixtures>({
    makeAxeBuilder: async ({ page }, use) => {
        // An expired (or unparseable) exception fails every scan until it is renewed with a reason or removed.
        // `!(parsed >= now)` is also true for NaN, so a mistyped date fails instead of never expiring.
        const expired = A11Y_KNOWN_VIOLATIONS.filter((known) => !(Date.parse(known.expires) >= Date.now()));
        if (expired.length > 0) {
            const list = expired.map((k) => `${k.ruleId} on ${k.target} (${k.ticket}, expired ${k.expires})`);
            throw new Error(`Expired or invalid known accessibility violations: ${list.join("; ")}`);
        }
        await use((): AxeBuilder => {
            const builder = new AxeBuilder({ page }).withTags([...A11Y_WCAG_TAGS]);
            for (const region of A11Y_THIRD_PARTY_REGIONS) builder.exclude(region.selector);
            return builder;
        });
    },
});

/** The violations a test must fail on: everything except the exact (rule, element) pairs on the known list. */
export function unexpectedViolations(results: AxeResults): AxeResults["violations"] {
    return results.violations
        .map((violation) => ({
            ...violation,
            nodes: violation.nodes.filter(
                (node) =>
                    !A11Y_KNOWN_VIOLATIONS.some(
                        (known) => known.ruleId === violation.id && known.target === node.target.flat().join(" "),
                    ),
            ),
        }))
        .filter((violation) => violation.nodes.length > 0);
}
```

Merge the fixture into the fixtures barrel (`mergeTests(...)` in `test-options.ts`) like every other fixture.

Matching is exact on purpose. When the markup around a known violation changes, axe reports a different `target`, the entry stops matching, and the violation fails again. That is a prompt to re-check the defect, never a reason to loosen the match.

---

## 2. Scanning one meaningful state

One test per state. Reach the state through the page object, prove it's on screen, scan, attach, and assert strictly.

```typescript
import { test, expect } from "../../../fixtures/pom/test-options";
import { unexpectedViolations } from "../../../fixtures/a11y/axe-fixture";
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

        await test.step("THEN: there are no violations beyond the known list", async () => {
            expect(unexpectedViolations(results)).toEqual([]);
        });
    });
});
```

`toEqual([])` prints every unexpected violation (rule id, impact, help URL, affected nodes) when it fails. The attachment keeps the full, unfiltered result in the HTML report, including the known violations, so they stay visible.

---

## 3. Keyboard path and dialog focus

What no rule engine can judge: can the flow be done without a mouse, and does focus go where it should?

```typescript
test("Verify Escape closes the delete-account dialog and returns focus to its trigger", { tag: "@App-regression" }, async ({ page, settingsPage }) => {
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
