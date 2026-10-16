// Known-bad fixture for the composable tag taxonomy. Each test breaks it one way, and the tag rule
// must report each one (pinned in tests/fault-injection.test.mjs). Everything else here is
// compliant, so no other rule fires on this file.
import { test, expect } from 'fixtures/pom/test-options';

test('@regression a suite tag alone says nothing about what the test is', async () => {
  expect(1).toBe(1);
});

test('@api @e2e two type tags', async () => {
  expect(1).toBe(1);
});

test('@api @nope an undeclared tag', async () => {
  expect(1).toBe(1);
});

test('the same tag twice', { tag: ['@api', '@slow', '@slow'] }, async () => {
  expect(1).toBe(1);
});
