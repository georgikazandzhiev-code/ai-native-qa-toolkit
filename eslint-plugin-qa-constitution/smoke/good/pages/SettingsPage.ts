// Compliant reference fixture. Every rule in the plugin must stay SILENT on this file.
//
// This is the false-positive net. Five of the six defects the eval harness had in itself were
// rules firing on correct code, and a rule that cries wolf gets the whole gate switched off
// within a week. RuleTester `valid` cases cover that per rule, in isolation; this covers it with
// all sixteen rules enabled at once, on a real file, through the real ESLint CLI.
import type { Locator, Page } from '@playwright/test';
import { expect } from 'fixtures/pom/test-options';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  // Locator getters carry no JSDoc, deliberately: a comment restating the locator is noise.
  get nameInput(): Locator {
    return this.page.getByLabel('Display name');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' });
  }

  get savedToast(): Locator {
    return this.page.getByRole('status').filter({ hasText: 'Saved' });
  }

  get validationError(): Locator {
    return this.page.getByRole('alert');
  }

  /**
   * Renames the profile and submits the form.
   *
   * JSDoc belongs here — on an action method — and `no-jsdoc-on-locator-getter` must not fire on
   * it. The rule looks only at `get` accessors whose body returns a locator chain.
   */
  async rename(name: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.saveButton.click();
  }

  /**
   * Asserts the save was acknowledged. Named `expect*` so `require-assertion-in-test` credits a
   * test that delegates its assertion here.
   */
  async expectSaved(): Promise<void> {
    await expect(this.savedToast).toBeVisible();
  }
}
