// Deliberately non-compliant fixture. Exercises `require-assertion-in-test` through the real
// ESLint CLI: this test navigates, passes, and proves nothing. Nothing here is an example to copy.
//
// Everything else about it is correct on purpose — barrel import, exactly one whitelisted tag —
// so the smoke run shows this rule firing on its own rather than buried under other reports.
import { test } from 'fixtures/pom/test-options';

test('@App-Smoke opens the settings page', async ({ page }) => {
  await page.goto('/settings');
});
