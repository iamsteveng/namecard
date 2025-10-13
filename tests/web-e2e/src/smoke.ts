import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.resolve(__dirname, '../artifacts');
const fixturesDir = path.resolve(__dirname, '../fixtures');
const sampleCardPath = path.resolve(fixturesDir, 'card-sample.jpg');

const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const clickButtonByText = async (page: Page, text: string) => {
  const clicked = await page.evaluate(targetText => {
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const match = buttons.find(button => button.textContent?.trim().includes(targetText));
    if (match) {
      match.click();
      return true;
    }
    return false;
  }, text);

  if (!clicked) {
    throw new Error(`Button with text "${text}" not found`);
  }
};

const baseUrl = process.env['WEB_BASE_URL'] ?? 'http://localhost:8080';
const uniqueSuffix = Date.now();
const providedEmail = process.env['E2E_EMAIL'];
const providedPassword = process.env['E2E_PASSWORD'];
const shouldRegister = !providedEmail || !providedPassword;
const registrationEmail = providedEmail ?? `e2e-user-${uniqueSuffix}@example.com`;
const registrationPassword = providedPassword ?? 'E2ePass!123';
const registrationName = `E2E User ${uniqueSuffix}`;

const log = (message: string) => {
  console.log(`➡️  ${message}`);
};

const buildUrl = (pathname: string) => {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalized, baseUrl).toString();
};

async function run() {
  await mkdir(artifactsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    if (shouldRegister) {
      log('Registering a new user via the UI');
      await page.goto(buildUrl('/auth/register'), { waitUntil: 'networkidle2' });
      await page.waitForSelector('form');

      await page.type('input#name', registrationName, { delay: 15 });
      await page.type('input#email', registrationEmail, { delay: 15 });
      await page.type('input#password', registrationPassword, { delay: 15 });
      await page.type('input#confirmPassword', registrationPassword, { delay: 15 });

      await Promise.all([
        page.click('button[type="submit"]'),
        sleep(500),
      ]);

      await page.waitForFunction(
        () => document.body.innerText.includes('Registration Successful!'),
        { timeout: 10_000 }
      );

      await page.screenshot({
        path: path.join(artifactsDir, '01-registration-success.png'),
        fullPage: true,
      });

      console.log(`✅ Registered user: ${registrationEmail}`);

      await page.waitForFunction(
        () => window.location.pathname === '/auth/login',
        { timeout: 15_000 }
      );
    } else {
      log('Using provided credentials; skipping registration');
      await page.goto(buildUrl('/auth/login'), { waitUntil: 'networkidle2' });
    }

    log('Opening login page');
    await page.waitForSelector('form');
    await page.screenshot({
      path: path.join(artifactsDir, '02-login.png'),
      fullPage: true,
    });

    log('Submitting login form');
    await page.type('input#email', registrationEmail, { delay: 20 });
    await page.type('input#password', registrationPassword, { delay: 20 });

    await Promise.all([
      page.click('button[type="submit"]'),
      sleep(500),
    ]);

    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname === '/dashboard',
      { timeout: 15_000 }
    );

    await page.waitForSelector('h1');
    const dashboardHeading = await page.evaluate(() =>
      document.querySelector('h1')?.textContent?.trim() ?? ''
    );

    if (!dashboardHeading) {
      throw new Error('Dashboard heading not found after login');
    }

    await page.screenshot({
      path: path.join(artifactsDir, '03-dashboard.png'),
      fullPage: true,
    });

    log('Uploading sample card via scan UI');
    await page.goto(buildUrl('/scan'), { waitUntil: 'networkidle2' });
    const fileInput = await page.waitForSelector('input[type="file"]');
    if (!fileInput) {
      throw new Error('File input not found on scan page');
    }
    await fileInput.uploadFile(sampleCardPath);
    await fileInput.dispose();

    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes('selected') || document.body.innerText.includes('Clear'),
      { timeout: 5_000 }
    );

    await clickButtonByText(page, 'Scan Business Card');

    await page.waitForFunction(
      () => document.body.innerText.includes('Scan Another Card'),
      { timeout: 45_000 }
    );

    await page.screenshot({
      path: path.join(artifactsDir, '04-scan-success.png'),
      fullPage: true,
    });

    log('Navigating to cards page');
    await page.click('a[href="/cards"]');
    await page.waitForFunction(() => window.location.pathname === '/cards', { timeout: 10_000 });
    await page.waitForFunction(() => document.body.innerText.includes('Business Cards'), {
      timeout: 15_000,
    });

    await page.screenshot({
      path: path.join(artifactsDir, '05-cards.png'),
      fullPage: true,
    });

    const cardsSummary = await page.evaluate(() => {
      const summary = Array.from(document.querySelectorAll('p')).find(element =>
        element.textContent?.toLowerCase().includes('card') &&
        element.textContent?.toLowerCase().includes('total')
      );
      return summary?.textContent?.trim() ?? '';
    });

    if (cardsSummary) {
      console.log(`✅ Cards summary detected: ${cardsSummary}`);
    } else {
      console.warn('⚠️  Cards summary not detected; verify seed data.');
    }

    console.log(`\n✅ Smoke test completed. Screenshots stored in ${artifactsDir}.`);
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(`\n❌ Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
