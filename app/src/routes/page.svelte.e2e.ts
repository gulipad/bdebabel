import { expect, test } from '@playwright/test';

test('a malformed address says so instead of failing silently', async ({ page }) => {
	await page.goto('/no-es-una-direccion');
	await expect(page.getByRole('alert')).toContainText('forma de dirección');
});
