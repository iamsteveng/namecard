import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, '../../../fixtures/card-sample.jpg');

test.describe('Mobile upload flow', () => {
  test('allows selecting an image in WebKit mobile emulation', async ({ page }) => {
    await page.goto('/scan');

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    await fileInput.setInputFiles(fixturePath);

    const preview = page.getByAltText('Preview');
    await expect(preview).toBeVisible();

    await expect(page.getByText(/Ready to scan/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /scan business card/i })).toBeEnabled();
  });
});
