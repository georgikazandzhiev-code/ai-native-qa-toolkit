// Deliberately non-compliant fixture. Exercises `no-jsdoc-on-locator-getter` through the real
// ESLint CLI: JSDoc that restates what a locator returns is noise, and the rule has to say so.
// Nothing in this file is an example to copy.
//
// Note this file imports from '@playwright/test' on purpose and is NOT reported for it:
// `no-direct-playwright-import` is scoped to *.spec.ts, because a page object legitimately
// needs the Page and Locator types. A rule that fired here would be a false positive.
import type { Locator, Page } from '@playwright/test';

export class BadSettingsPage {
  constructor(private readonly page: Page) {}

  /**
   * Returns the save button.
   */
  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' });
  }
}
