import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Route of the settings screen, relative to the application base URL.
 */
const SETTINGS_ROUTE = '/settings';

/**
 * Page object for the account settings screen.
 *
 * Locators are exposed as getters so they are resolved lazily on every access —
 * this keeps them valid across re-renders (Radix re-mounts its portal content
 * whenever the dropdown opens or closes).
 */
export class SettingsPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // --------------------------------------------------------------------------
  // Locators
  // --------------------------------------------------------------------------

  get emailInput(): Locator {
    return this.page.getByLabel('Email address');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' });
  }

  /** Radix Select trigger — rendered as a button exposing role="combobox". */
  get countryTrigger(): Locator {
    return this.page.getByRole('combobox', { name: 'Country' });
  }

  /** Radix Select content — portalled to the document body, role="listbox". */
  get countryListbox(): Locator {
    return this.page.getByRole('listbox');
  }

  countryOption(country: string): Locator {
    return this.countryListbox.getByRole('option', { name: country, exact: true });
  }

  get validationError(): Locator {
    return this.page.getByRole('alert');
  }

  get successToast(): Locator {
    return this.page.getByRole('status');
  }

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  /**
   * Navigates to the settings screen and waits for the form to be interactive.
   */
  async goto(): Promise<void> {
    const baseUrl = process.env.BASE_URL!;
    await this.page.goto(new URL(SETTINGS_ROUTE, baseUrl).toString());
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Replaces the current value of the email field with the supplied address.
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  /**
   * Opens the Radix country dropdown and waits for the option list to render.
   */
  async openCountryDropdown(): Promise<void> {
    await this.countryTrigger.click();
    await expect(this.countryListbox).toBeVisible();
  }

  /**
   * Selects a country by its visible label and waits for the dropdown to close,
   * so a following click is never swallowed by the closing overlay.
   */
  async selectCountry(country: string): Promise<void> {
    await this.openCountryDropdown();
    await this.countryOption(country).click();
    await expect(this.countryListbox).toBeHidden();
    await expect(this.countryTrigger).toHaveText(country);
  }

  /**
   * Returns the country currently shown on the dropdown trigger.
   */
  async getSelectedCountry(): Promise<string> {
    return (await this.countryTrigger.innerText()).trim();
  }

  /**
   * Submits the settings form.
   */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /**
   * Fills the form, submits it, and waits for the success toast — the happy
   * path a test needs in a single call.
   */
  async updateSettings(email: string, country: string): Promise<void> {
    await this.fillEmail(email);
    await this.selectCountry(country);
    await this.save();
    await this.expectSuccessToast();
  }

  // --------------------------------------------------------------------------
  // Assertions
  // --------------------------------------------------------------------------

  async expectSuccessToast(): Promise<void> {
    await expect(this.successToast).toBeVisible();
  }

  async expectValidationError(message: string): Promise<void> {
    await expect(this.validationError).toHaveText(message);
  }

  async expectNoValidationError(): Promise<void> {
    await expect(this.validationError).toBeHidden();
  }
}
