import { expect, type Locator, type Page } from '@playwright/test';
import { appConfig } from '../../config/app';
import { BasePage } from '../baseClasses/BasePage';
import { Messages } from '../../enums/app';

/**
 * Visible labels / accessible names of the Settings form controls.
 * Exported so specs assert against the same strings the page object locates by.
 */
export const SETTINGS_LABELS = {
    EMAIL: 'Email address',
    COUNTRY: 'Country',
    SAVE: 'Save',
} as const;

export class SettingsPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    // ═══════════════════════════════════════════════════════════════
    // Page structure
    // ═══════════════════════════════════════════════════════════════

    get pageRoot(): Locator {
        return this.page.getByTestId('page-settings');
    }

    // ═══════════════════════════════════════════════════════════════
    // Interactive locators
    // ═══════════════════════════════════════════════════════════════

    get emailInput(): Locator {
        return this.page.getByLabel(SETTINGS_LABELS.EMAIL);
    }

    get saveButton(): Locator {
        return this.page.getByRole('button', { name: SETTINGS_LABELS.SAVE });
    }

    // Radix <Select> trigger renders as role="combobox"; the popover is a real
    // role="listbox" with role="option" children, so both stay semantic.
    get countrySelectTrigger(): Locator {
        return this.page.getByRole('combobox', { name: SETTINGS_LABELS.COUNTRY });
    }

    get countrySelectListbox(): Locator {
        return this.page.getByRole('listbox');
    }

    countryOption(country: string): Locator {
        return this.countrySelectListbox.getByRole('option', {
            name: country,
            exact: true,
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // Feedback locators
    // ═══════════════════════════════════════════════════════════════

    get validationError(): Locator {
        return this.pageRoot.getByRole('alert');
    }

    get successToast(): Locator {
        return this.page
            .locator('[data-sonner-toast]')
            .filter({ hasText: Messages.SETTINGS_SAVED })
            .first();
    }

    get errorToast(): Locator {
        return this.page
            .locator('[data-sonner-toast]')
            .filter({ hasText: Messages.SETTINGS_SAVE_FAILED })
            .first();
    }

    // ═══════════════════════════════════════════════════════════════
    // Actions
    // ═══════════════════════════════════════════════════════════════

    /**
     * Navigates to the Settings screen and waits for it to be interactive.
     * @returns Promise<void>
     */
    async open(): Promise<void> {
        const base = process.env.APP_URL!.replace(/\/$/, '');
        await this.page.goto(`${base}${appConfig.paths.SETTINGS}`);
        await this.verifyPageLoaded();
    }

    /**
     * Asserts the Settings page root and its form controls are rendered.
     * @returns Promise<void>
     */
    async verifyPageLoaded(): Promise<void> {
        await expect(this.pageRoot).toBeVisible({
            timeout: appConfig.timeouts.navigation,
        });
        await expect(this.emailInput).toBeVisible();
        await expect(this.countrySelectTrigger).toBeVisible();
        await expect(this.saveButton).toBeVisible();
    }

    /**
     * Fills the email field and confirms the value stuck.
     * @param email - Email address to enter (faker-generated per run, per the data-strategy skill).
     * @returns Promise<void>
     */
    async fillEmail(email: string): Promise<void> {
        await expect(this.emailInput).toBeVisible();
        await this.emailInput.fill(email);
        await expect(this.emailInput).toHaveValue(email);
    }

    /**
     * Opens the Country dropdown and picks an option, confirming the trigger reflects the choice.
     * @param country - Visible option label to select.
     * @returns Promise<void>
     */
    async selectCountry(country: string): Promise<void> {
        await expect(this.countrySelectTrigger).toBeVisible();
        await this.openCountryDropdown();

        const option = this.countryOption(country);
        await expect(option).toBeVisible({
            timeout: appConfig.timeouts.element,
        });
        await option.click();

        await expect(this.countrySelectListbox).toBeHidden();
        await expect(this.countrySelectTrigger).toContainText(country);
    }

    /**
     * Submits the form and waits for the settings request plus the success toast.
     * @returns Promise<void>
     */
    async saveSettings(): Promise<void> {
        await expect(this.saveButton).toBeEnabled({
            timeout: appConfig.timeouts.element,
        });

        const [response] = await Promise.all([
            this.page.waitForResponse(
                (r) =>
                    r.url().includes(appConfig.api.SETTINGS) &&
                    r.request().method() === 'PUT'
            ),
            this.saveButton.click(),
        ]);
        expect(response.status()).toBe(200);

        await expect(this.successToast).toBeVisible({
            timeout: appConfig.timeouts.element,
        });
    }

    /**
     * Fills both fields and saves — the composite used by happy-path tests and by
     * `afterEach` / `afterAll` cleanup to restore the values captured in setup.
     * @param email - Email address to persist.
     * @param country - Country option label to persist.
     * @returns Promise<void>
     */
    async updateSettings(email: string, country: string): Promise<void> {
        await this.fillEmail(email);
        await this.selectCountry(country);
        await this.saveSettings();
    }

    /**
     * Clicks Save with invalid input and asserts the field validation message is shown
     * and that no success toast appeared.
     * @param expectedMessage - Expected validation copy, sourced from `enums/app`.
     * @returns Promise<void>
     */
    async saveExpectingValidationError(expectedMessage: string): Promise<void> {
        await this.saveButton.click();
        await expect(this.validationError).toBeVisible({
            timeout: appConfig.timeouts.element,
        });
        await expect(this.validationError).toContainText(expectedMessage);
        await expect(this.successToast).toBeHidden();
    }

    /**
     * Asserts the save-failure toast is shown (server-error paths).
     * @returns Promise<void>
     */
    async verifySaveFailed(): Promise<void> {
        await expect(this.errorToast).toBeVisible({
            timeout: appConfig.timeouts.element,
        });
    }

    /**
     * Reads the persisted email — call in `beforeAll` to capture state that cleanup restores.
     * @returns Promise<string> Current value of the email field.
     */
    async getCurrentEmail(): Promise<string> {
        await expect(this.emailInput).toBeVisible();
        return this.emailInput.inputValue();
    }

    /**
     * Reads the selected country — call in `beforeAll` to capture state that cleanup restores.
     * @returns Promise<string> Visible label shown on the Country trigger.
     */
    async getSelectedCountry(): Promise<string> {
        await expect(this.countrySelectTrigger).toBeVisible();
        return (await this.countrySelectTrigger.innerText()).trim();
    }

    /**
     * Opens the Country dropdown, retrying once when the Radix trigger swallows the first click.
     * @returns Promise<void>
     */
    private async openCountryDropdown(): Promise<void> {
        await this.countrySelectTrigger.click();
        try {
            await expect(this.countrySelectListbox).toBeVisible({
                timeout: appConfig.timeouts.element,
            });
        } catch {
            // eslint-disable-next-line playwright/no-force-option -- Radix trigger retry
            await this.countrySelectTrigger.click({ force: true });
            await expect(this.countrySelectListbox).toBeVisible({
                timeout: appConfig.timeouts.element,
            });
        }
    }
}
