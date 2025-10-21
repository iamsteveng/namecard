import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.resolve(__dirname, '../artifacts');
const fixturesDir = path.resolve(__dirname, '../../fixtures');
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
    await page.evaluateOnNewDocument(() => {
      if (typeof window === 'object') {
        // @ts-ignore -- esbuild helper shim for runtime evaluation contexts
        if (typeof window.__name !== 'function') {
          // @ts-ignore
          window.__name = (target, value) => target;
        }
      }
    });
    page.on('console', message => {
      console.log(`[browser] ${message.type()}: ${message.text()}`);
    });

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

    log('Waiting for scan results to render');
    await page.waitForFunction(
      () => document.body.innerText.includes('Business Card Extracted'),
      { timeout: 45_000 }
    );

    log('Entering edit mode for extracted fields');
    await clickButtonByText(page, 'Edit');

    log('Waiting for Save button to become interactive');
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some(button => {
          const text = button.textContent?.trim() ?? '';
          return text === 'Save' && !button.disabled;
        }),
      { timeout: 45_000 }
    );

    const awaitedSaveResponse = page.waitForResponse(response => {
      const url = response.url();
      return (
        url.includes('/v1/cards/') &&
        response.request().method() === 'PATCH' &&
        response.status() >= 200 &&
        response.status() < 300
      );
    });

    log('Saving validated card details');
    await clickButtonByText(page, 'Save');

    await awaitedSaveResponse;

    log('Waiting for Scan Another Card call-to-action');
    await page.waitForFunction(
      () => document.body.innerText.includes('Scan Another Card'),
      { timeout: 45_000 }
    );

    await page.screenshot({
      path: path.join(artifactsDir, '04-scan-success.png'),
      fullPage: true,
    });

    log('Collecting scanned card summary from results view');
    const expectedCardName = 'Avery Johnson';
    const expectedCardCompany = 'Northwind Analytics';
    const expectedCardEmail = 'avery.johnson@northwind-analytics.com';

    await page.waitForFunction(
      (name, company) => {
        const text = document.body.innerText || '';
        return text.includes(name) && text.includes(company);
      },
      { timeout: 10_000 },
      expectedCardName,
      expectedCardCompany
    );

    log(`Captured scanned card details: ${expectedCardName} @ ${expectedCardCompany}`);

    log('Navigating to cards page');
    await page.goto(buildUrl('/cards'), { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => window.location.pathname === '/cards', { timeout: 10_000 });
    await page.waitForFunction(() => document.body.innerText.includes('Business Cards'), {
      timeout: 15_000,
    });

    await page.waitForFunction(
      expected => {
        const headers = Array.from(document.querySelectorAll('h3'));
        return headers.some(header => {
          const nameText = header.textContent?.replace(/\s+/g, ' ').trim().toLowerCase();
          if (!nameText || !nameText.includes(expected.name.toLowerCase())) {
            return false;
          }

          const container = header.closest('div.flex-1');
          if (!container) {
            return false;
          }

          const infoParagraphs = container.querySelectorAll('p');
          const companyText = infoParagraphs.length > 1
            ? infoParagraphs[1]?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase()
            : '';

          return Boolean(companyText && companyText.includes(expected.company.toLowerCase()));
        });
      },
      { timeout: 20_000 },
      { name: expectedCardName, company: expectedCardCompany }
    );

    const cardsOnPage = await page.evaluate(() => {
      const normalize = value => {
        if (typeof value !== 'string') {
          return '';
        }
        return value.replace(/\s+/g, ' ').trim();
      };

      const cards = [];

      const gridContainers = Array.from(document.querySelectorAll('div.grid'));
      for (const grid of gridContainers) {
        const cardElements = Array.from(grid.children);
        for (const element of cardElements) {
          const nameElement = element.querySelector('h3');
          if (!nameElement) {
            continue;
          }

          const name = normalize(nameElement.textContent);
          if (!name) {
            continue;
          }

          const container = nameElement.closest('div.flex-1');
          let company = '';
          if (container) {
            const infoParagraphs = container.querySelectorAll('p');
            if (infoParagraphs && infoParagraphs.length > 1) {
              company = normalize(infoParagraphs[1].textContent);
            }
          }

          cards.push({ name, company });
        }
      }

      if (cards.length === 0) {
        const listContainer = document.querySelector('div.divide-y');
        if (listContainer) {
          const rows = Array.from(listContainer.children);
          for (const row of rows) {
            const nameElement = row.querySelector('h3');
            if (!nameElement) {
              continue;
            }

            const name = normalize(nameElement.textContent);
            if (!name) {
              continue;
            }

            const wrapper = nameElement.closest('div.flex-1');
            const companyLine = wrapper ? wrapper.querySelector('p') : null;
            const company = normalize(companyLine ? companyLine.textContent : '');
            cards.push({ name, company });
          }
        }
      }

      return cards;
    });

    if (cardsOnPage.length === 0) {
      throw new Error('No cards visible on cards page; expected at least one card after scan.');
    }

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const normalizedExpectedName = normalize(expectedCardName);
    const normalizedExpectedCompany = normalize(expectedCardCompany);

    const matchingIndex = cardsOnPage.findIndex(card => {
      const name = normalize(card.name);
      const company = normalize(card.company);
      return name.includes(normalizedExpectedName) && company.includes(normalizedExpectedCompany);
    });

    if (matchingIndex === -1) {
      throw new Error(
        `Uploaded card (${expectedCardName} @ ${expectedCardCompany}) not found in cards list.`
      );
    }

    if (matchingIndex !== 0) {
      throw new Error(
        `Uploaded card (${expectedCardName} @ ${expectedCardCompany}) not listed first; found at position ${matchingIndex + 1}.`
      );
    }

    log('Verified uploaded card is present at the top of the cards list');

    await page.screenshot({
      path: path.join(artifactsDir, '05-cards.png'),
      fullPage: true,
    });

    await page.evaluate(() => {
      const direct = window.localStorage.getItem('accessToken');
      if (direct) {
        return;
      }

      const persistedRaw = window.localStorage.getItem('namecard-auth');
      if (!persistedRaw) {
        return;
      }

      try {
        const parsed = JSON.parse(persistedRaw);
        const token =
          parsed?.state?.session?.accessToken ?? parsed?.session?.accessToken ?? null;
        if (typeof token === 'string' && token.length > 0) {
          window.localStorage.setItem('accessToken', token);
        }
      } catch {
        // ignore parse failures; search service will handle missing tokens gracefully
      }
    });

    log('Searching for uploaded card in quick search input');
    const basicSearchInput = await page.waitForSelector(
      'input[placeholder="Search cards by name, company, or email..."]',
      { timeout: 10_000 }
    );

    if (!basicSearchInput) {
      throw new Error('Quick search input not found on cards page.');
    }

    await basicSearchInput.click({ clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.down('Meta');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');

    const awaitedSearchResponse = page.waitForResponse(response => {
      const url = response.url();
      return (
        url.includes('/v1/search/cards') &&
        response.request().method() === 'POST' &&
        response.status() >= 200 &&
        response.status() < 300
      );
    });

    await basicSearchInput.type(expectedCardName, { delay: 25 });

    await awaitedSearchResponse;

    log('Waiting for search results to render');
    const maxAttempts = 40;
    let searchResults: Array<{ name: string; textContent: string }> = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const currentResults = await page.evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

        const lower = (value: string | null | undefined) => normalize(value).toLowerCase();

        const resultCards = Array.from(
          document.querySelectorAll<HTMLDivElement>('div.bg-white.border.border-gray-200.rounded-lg')
        ).filter(card => card.querySelector('h3'));

        return resultCards.map(card => {
          const name = normalize(card.querySelector('h3')?.textContent ?? '');
          const textContent = lower(card.innerText || '');
          return { name, textContent };
        });
      });

      if (currentResults.length > 0) {
        searchResults = currentResults;
        break;
      }

      if (attempt < maxAttempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
    }

    if (!searchResults.length) {
      throw new Error('Search results did not render any cards.');
    }

    const normalizedName = expectedCardName.toLowerCase();
    const normalizedCompany = expectedCardCompany.toLowerCase();
    const normalizedEmail = expectedCardEmail.toLowerCase();

    const searchMatchingIndex = searchResults.findIndex(result => {
      return (
        result.textContent.includes(normalizedName) &&
        result.textContent.includes(normalizedCompany) &&
        result.textContent.includes(normalizedEmail)
      );
    });

    if (searchMatchingIndex === -1) {
      throw new Error('Uploaded card not found in search results for provided query.');
    }

    if (searchMatchingIndex !== 0) {
      throw new Error(
        `Uploaded card found in search results but not listed first (position ${searchMatchingIndex + 1}).`
      );
    }

    log('Verified uploaded card appears first in search results with expected metadata');

    await page.screenshot({
      path: path.join(artifactsDir, '06-cards-search.png'),
      fullPage: true,
    });

    console.log(`\n✅ Smoke test completed. Screenshots stored in ${artifactsDir}.`);
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  if (error instanceof Error) {
    console.error(`\n❌ Smoke test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(`\n❌ Smoke test failed: ${String(error)}`);
  }
  process.exit(1);
});
