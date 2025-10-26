import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';

import {
  bootstrapAuthSession,
  buildPersistedAuthState,
  cardFixturePath,
  describeSeedSummary,
  readSharedSeedState,
} from '@namecard/e2e-shared';
import type { SharedSeedState } from '@namecard/e2e-shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.resolve(__dirname, '../artifacts');
const smokeLogPath = path.join(artifactsDir, 'smoke.log');
const sampleCardPath = cardFixturePath;

let logStream: ReturnType<typeof createWriteStream> | null = null;

const originalConsole = {
  log: console.log.bind(console) as typeof console.log,
  info: console.info.bind(console) as typeof console.info,
  warn: console.warn.bind(console) as typeof console.warn,
  error: console.error.bind(console) as typeof console.error,
};

let consolePatched = false;

const serializeArg = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const appendLog = (level: string, args: ReadonlyArray<unknown>) => {
  if (!logStream) {
    return;
  }
  const serialized = args.map(serializeArg).join(' ');
  logStream.write(`[${new Date().toISOString()}] [${level}] ${serialized}\n`);
};

const createPatchedMethod = <T extends (...args: any[]) => void>(
  level: string,
  emitter: T
): T => {
  const patched = ((...args: Parameters<T>) => {
    emitter(...args);
    appendLog(level, args as ReadonlyArray<unknown>);
  }) as T;
  return patched;
};

const patchConsole = () => {
  if (consolePatched) {
    return;
  }
  console.log = createPatchedMethod('INFO', originalConsole.log);
  console.info = createPatchedMethod('INFO', originalConsole.info);
  console.warn = createPatchedMethod('WARN', originalConsole.warn);
  console.error = createPatchedMethod('ERROR', originalConsole.error);
  consolePatched = true;
};

const restoreConsole = () => {
  if (!consolePatched) {
    return;
  }
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  consolePatched = false;
};

let baseUrl = process.env['WEB_BASE_URL'] ?? 'http://localhost:8080';
let apiBaseUrl =
  process.env['WEB_E2E_API_BASE_URL'] ?? process.env['API_BASE_URL'] ?? 'http://localhost:3001';

let devServerProcess: ReturnType<typeof spawn> | null = null;
let devServerPid: number | null = null;
let devServerStarted = false;

let apiSandboxProcess: ReturnType<typeof spawn> | null = null;
let apiSandboxPid: number | null = null;
let apiSandboxStarted = false;

const sleep = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const isPortAvailable = async (host: string, port: number): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();

    server.once('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      server.close(closeError => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(true);
      });
    });

    try {
      server.listen(port, host);
    } catch (error) {
      reject(error);
    }
  });

const allocatePort = async (
  host: string,
  preferredPort: number,
  maxOffset = 10
): Promise<number> => {
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const candidate = preferredPort + offset;
    try {
      const available = await isPortAvailable(host, candidate);
      if (available) {
        return candidate;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES') {
        throw new Error(
          `Insufficient permissions to bind to ${host}:${candidate} while preparing smoke runner.`
        );
      }
      // Fall back to next candidate on transient failures.
    }
  }

  throw new Error(
    `Unable to find an available port near ${host}:${preferredPort} for smoke runner processes.`
  );
};

const waitForProcessSpawn = async (child: ReturnType<typeof spawn>): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      child.off('spawn', handleSpawn);
      reject(error);
    };

    const handleSpawn = () => {
      child.off('error', handleError);
      resolve();
    };

    child.once('error', handleError);
    child.once('spawn', handleSpawn);
  });

const parseBooleanFlag = (value: string | undefined | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

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

const log = (message: string) => {
  console.log(`➡️  ${message}`);
};

const buildUrl = (pathname: string) => {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalized, baseUrl).toString();
};

const probeBaseUrl = async (
  target: string,
  timeoutMs = 2_000,
  options?: { expectOk?: boolean }
): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    }).catch(() => null);
    if (!response) {
      return false;
    }
    if (options?.expectOk) {
      return response.ok;
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const waitForBaseUrl = async (attempts: number, delayMs: number): Promise<boolean> => {
  const target = baseUrl;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probeBaseUrl(target)) {
      return true;
    }
    await sleep(delayMs);
  }
  return false;
};

const waitForEndpoint = async (url: string, attempts: number, delayMs: number): Promise<boolean> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probeBaseUrl(url, 2_000, { expectOk: true })) {
      return true;
    }
    await sleep(delayMs);
  }
  return false;
};

const startDevServerIfNeeded = async (): Promise<void> => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const isReachable = await probeBaseUrl(normalizedBase);
  const autostartFlag = parseBooleanFlag(process.env['WEB_E2E_AUTOSTART_DEV_SERVER']);
  const skipAutostart = parseBooleanFlag(process.env['WEB_E2E_SKIP_AUTOSTART']);
  const shouldAutostart = autostartFlag || (!skipAutostart && process.env['CI'] === 'true');

  if (isReachable && !shouldAutostart) {
    log(`Web base reachable at ${normalizedBase}`);
    return;
  }

  if (!isReachable && !shouldAutostart) {
    throw new Error(
      `Unable to reach web base URL ${normalizedBase} and dev server autostart is disabled.`
    );
  }

  if (isReachable && shouldAutostart) {
    log(
      `Web base reachable at ${normalizedBase}, but autostart is enabled; starting local dev server.`
    );
  }

  const devHost = process.env['WEB_E2E_DEV_HOST'] ?? '127.0.0.1';
  const preferredPort = Number.parseInt(process.env['WEB_E2E_DEV_PORT'] ?? '4173', 10);
  const resolvedPort = await allocatePort(devHost, preferredPort, 20);

  if (resolvedPort !== preferredPort) {
    log(`Dev server port ${preferredPort} busy; using fallback ${resolvedPort}.`);
  }

  baseUrl = `http://${devHost}:${resolvedPort}`;
  process.env['WEB_BASE_URL'] = baseUrl;
  process.env['WEB_E2E_DEV_PORT'] = String(resolvedPort);

  log(`Starting @namecard/web dev server at ${baseUrl}`);

  const repoRoot = path.resolve(__dirname, '../..');
  devServerProcess = spawn(
    'pnpm',
    [
      '--filter',
      '@namecard/web',
      'run',
      'dev',
      '--',
      '--host',
      devHost,
      '--port',
      String(resolvedPort),
      '--strictPort',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(resolvedPort),
        VITE_PORT: String(resolvedPort),
        VITE_API_URL: apiBaseUrl,
      },
      stdio: 'inherit',
      detached: true,
    }
  );

  devServerStarted = true;
  devServerPid = devServerProcess.pid ?? null;

  try {
    await waitForProcessSpawn(devServerProcess);

    const ready = await waitForBaseUrl(45, 1_000);
    if (!ready) {
      throw new Error('Dev server did not become ready in time.');
    }
  } catch (error) {
    await stopDevServer();
    throw error instanceof Error ? error : new Error(String(error));
  }

  process.on('exit', () => {
    if (devServerStarted) {
      devServerProcess?.kill('SIGTERM');
    }
  });

  process.on('SIGINT', () => {
    if (devServerStarted) {
      devServerProcess?.kill('SIGTERM');
    }
  });

  log(`Dev server ready at ${baseUrl}`);
};

const stopDevServer = async (): Promise<void> => {
  if (!devServerStarted || !devServerProcess) {
    return;
  }

  const pid = devServerProcess.pid ?? devServerPid;

  try {
    devServerProcess.kill('SIGTERM');
  } catch (error) {
    console.warn('Failed to send SIGTERM to dev server process', error);
  }

  if (typeof pid === 'number' && pid > 0) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.warn('Failed to signal dev server process group', error);
      }
    }
  }

  try {
    await Promise.race([once(devServerProcess, 'exit'), sleep(3_000).then(() => {})]);
  } catch (error) {
    console.warn('Failed waiting for dev server shutdown', error);
  }

  if (typeof pid === 'number' && pid > 0) {
    try {
      process.kill(-pid, 0);
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.warn('Failed to forcefully terminate dev server process group', error);
      }
    }
  }

  devServerProcess = null;
  devServerStarted = false;
  devServerPid = null;
};

const startApiSandboxIfNeeded = async (): Promise<void> => {
  const normalizedApiBase = apiBaseUrl.replace(/\/+$/, '');
  const healthUrl = `${normalizedApiBase}/health`;
  const isReachable = await probeBaseUrl(healthUrl, 2_000, { expectOk: true });

  const autostartFlag = parseBooleanFlag(process.env['WEB_E2E_AUTOSTART_API_SANDBOX']);
  const skipAutostart = parseBooleanFlag(process.env['WEB_E2E_SKIP_AUTOSTART_API_SANDBOX']);
  const shouldAutostart = autostartFlag || (!skipAutostart && process.env['CI'] === 'true');

  if (isReachable && !shouldAutostart) {
    log(`API base reachable at ${normalizedApiBase}`);
    return;
  }

  if (!isReachable && !shouldAutostart) {
    throw new Error(
      `Unable to reach API base URL ${normalizedApiBase} and API sandbox autostart is disabled.`
    );
  }

  const sandboxHost = process.env['WEB_E2E_API_SANDBOX_HOST'] ?? '127.0.0.1';
  const preferredSandboxPort = Number.parseInt(
    process.env['WEB_E2E_API_SANDBOX_PORT'] ?? '4100',
    10
  );
  const resolvedSandboxPort = await allocatePort(sandboxHost, preferredSandboxPort, 20);

  if (resolvedSandboxPort !== preferredSandboxPort) {
    log(
      `API sandbox port ${preferredSandboxPort} busy; using fallback ${resolvedSandboxPort}.`
    );
  }

  if (isReachable && shouldAutostart) {
    log(
      `API base reachable at ${normalizedApiBase}, but autostart is enabled; starting local API sandbox at http://${sandboxHost}:${resolvedSandboxPort}.`
    );
  }

  apiBaseUrl = `http://${sandboxHost}:${resolvedSandboxPort}`;
  process.env['WEB_E2E_API_BASE_URL'] = apiBaseUrl;
  process.env['WEB_E2E_API_SANDBOX_PORT'] = String(resolvedSandboxPort);

  const repoRoot = path.resolve(__dirname, '../..');
  const databaseUrl =
    process.env['WEB_E2E_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    'postgresql://namecard_user:namecard_password@127.0.0.1:5433/namecard_test';

  log(`Starting lambda sandbox API server at ${apiBaseUrl}`);

  apiSandboxProcess = spawn('pnpm', ['run', 'lambda:sandbox', '--', `--port=${resolvedSandboxPort}`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      LAMBDA_SANDBOX_PORT: String(resolvedSandboxPort),
    },
    stdio: 'inherit',
    detached: true,
  });

  apiSandboxStarted = true;
  apiSandboxPid = apiSandboxProcess.pid ?? null;

  try {
    await waitForProcessSpawn(apiSandboxProcess);

    const ready = await waitForEndpoint(`${apiBaseUrl}/health`, 60, 1_000);
    if (!ready) {
      throw new Error('API sandbox did not become ready in time.');
    }
  } catch (error) {
    await stopApiSandbox();
    throw error instanceof Error ? error : new Error(String(error));
  }

  process.on('exit', () => {
    if (apiSandboxStarted) {
      apiSandboxProcess?.kill('SIGTERM');
    }
  });

  process.on('SIGINT', () => {
    if (apiSandboxStarted) {
      apiSandboxProcess?.kill('SIGTERM');
    }
  });

  log(`API sandbox ready at ${apiBaseUrl}`);
};

const stopApiSandbox = async (): Promise<void> => {
  if (!apiSandboxStarted || !apiSandboxProcess) {
    return;
  }

  const pid = apiSandboxProcess.pid ?? apiSandboxPid;

  try {
    apiSandboxProcess.kill('SIGTERM');
  } catch (error) {
    console.warn('Failed to send SIGTERM to API sandbox', error);
  }

  if (typeof pid === 'number' && pid > 0) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.warn('Failed to signal API sandbox process group', error);
      }
    }
  }

  try {
    await Promise.race([once(apiSandboxProcess, 'exit'), sleep(3_000).then(() => {})]);
  } catch (error) {
    console.warn('Failed waiting for API sandbox shutdown', error);
  }

  if (typeof pid === 'number' && pid > 0) {
    try {
      process.kill(-pid, 0);
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.warn('Failed to forcefully terminate API sandbox process group', error);
      }
    }
  }

  apiSandboxProcess = null;
  apiSandboxStarted = false;
  apiSandboxPid = null;
};

async function run() {
  await mkdir(artifactsDir, { recursive: true });

  logStream = createWriteStream(smokeLogPath, { flags: 'w' });
  patchConsole();
  log(`Writing smoke artefacts to ${artifactsDir}`);

  await startApiSandboxIfNeeded();
  await startDevServerIfNeeded();

  const sharedSeed: SharedSeedState | null = await readSharedSeedState().catch(() => null);
  if (sharedSeed) {
    log(`Shared seed detected: ${describeSeedSummary(sharedSeed)}`);
  } else {
    log('No shared seed detected; full UI flow will seed data');
  }

  const seededUser = sharedSeed?.user ?? null;
  const seededCard = sharedSeed?.card ?? null;
  const seededSearchQuery = sharedSeed?.card?.searchQuery ?? sharedSeed?.upload?.tag ?? null;

  const uniqueSuffix = Date.now();
  const envEmail = process.env['E2E_EMAIL'] ?? undefined;
  const envPassword = process.env['E2E_PASSWORD'] ?? undefined;

  const registrationEmail = envEmail ?? seededUser?.email ?? `e2e-user-${uniqueSuffix}@example.com`;
  const registrationPassword = envPassword ?? seededUser?.password ?? 'E2ePass!123';
  const registrationName = seededUser
    ? `Seeded User ${seededUser.userId.slice(0, 8)}`
    : `E2E User ${uniqueSuffix}`;

  const rawAuthMode =
    process.env['WEB_E2E_AUTH_MODE'] ?? process.env['WEB_E2E_AUTH_STRATEGY'] ?? '';
  const useBootstrapAuth =
    ['bootstrap', 'api', 'session', 'bypass'].includes(rawAuthMode.trim().toLowerCase()) ||
    parseBooleanFlag(process.env['WEB_E2E_BYPASS_LOGIN']) ||
    parseBooleanFlag(process.env['WEB_E2E_AUTH_BYPASS']);

  if (useBootstrapAuth) {
    log('Auth mode: bootstrap session (skipping UI login flow)');
  } else {
    log('Auth mode: interactive UI login flow');
  }

  const shouldRegister = !useBootstrapAuth && !seededUser && (!envEmail || !envPassword);
  const shouldUploadCard = !seededCard;

  const expectedCardName = seededCard?.name ?? 'Avery Johnson';
  const expectedCardCompany = seededCard?.company ?? 'Northwind Analytics';
  const expectedCardEmail = seededCard?.email ?? 'avery.johnson@northwind-analytics.com';
  const effectiveSearchQuery =
    seededSearchQuery ??
    seededCard?.company ??
    seededCard?.name ??
    expectedCardCompany ??
    expectedCardName;

  const chromePathCandidates = [
    process.env['PUPPETEER_EXECUTABLE_PATH'],
    process.env['CHROME_PATH'],
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];

  let executablePath: string | undefined;
  for (const candidate of chromePathCandidates) {
    if (existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
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
    page.on('response', response => {
      const url = response.url();
      if (!url.includes('/v1/') || url.includes('/health')) {
        return;
      }

      if (response.status() < 400) {
        return;
      }

      const summary = `${response.status()} ${response.request().method()} ${url.replace(/[?].*/, '')}`;
      response
        .text()
        .then(body => {
          console.warn(`[network-warning] ${summary} body: ${body.slice(0, 200)}...`);
        })
        .catch(() => {
          console.warn(`[network-warning] ${summary} (body unavailable)`);
        });
    });

    const applyBootstrapSession = async () => {
      log('Bootstrapping auth session via shared helper');
      const authBootstrap = await bootstrapAuthSession({
        baseUrl: process.env['WEB_E2E_API_BASE_URL'],
        email: envEmail ?? seededUser?.email ?? registrationEmail,
        password: envPassword ?? seededUser?.password ?? registrationPassword,
        name: registrationName,
      });

      if (authBootstrap.meta.elapsedMs > 8_000) {
        throw new Error(
          `Auth bootstrap exceeded expected duration (${authBootstrap.meta.elapsedMs}ms)`
        );
      }

      const persistedAuth = buildPersistedAuthState({
        user: authBootstrap.user,
        session: authBootstrap.session,
        isAuthenticated: true,
      });

      await page.evaluateOnNewDocument(payload => {
        window.localStorage.setItem('namecard-auth', JSON.stringify(payload));
      }, persistedAuth);

      log(
        `Loaded API bootstrap session for ${authBootstrap.user.email} ` +
          `(registered=${authBootstrap.meta.registered ? 'yes' : 'no'}; elapsed=${authBootstrap.meta.elapsedMs}ms)`
      );

      await page.goto(buildUrl('/'), { waitUntil: 'networkidle2' });
    };

    if (useBootstrapAuth) {
      await applyBootstrapSession();
    } else {
      try {
        if (shouldRegister) {
          log('Registering a new user via the UI');
          await page.goto(buildUrl('/auth/register'), { waitUntil: 'networkidle2' });
          await page.waitForSelector('form');

          await page.type('input#name', registrationName, { delay: 15 });
          await page.type('input#email', registrationEmail, { delay: 15 });
          await page.type('input#password', registrationPassword, { delay: 15 });
          await page.type('input#confirmPassword', registrationPassword, { delay: 15 });

          await Promise.all([page.click('button[type="submit"]'), sleep(500)]);

          await page.waitForFunction(
            () => {
              const bodyText = document.body?.innerText ?? '';
              if (bodyText.includes('Registration Successful!')) {
                return true;
              }
              return window.location.pathname === '/auth/login';
            },
            { timeout: 20_000 }
          );

          await page.screenshot({
            path: path.join(artifactsDir, '01-registration-success.png'),
            fullPage: true,
          });

          console.log(`✅ Registered user: ${registrationEmail}`);

          await page.waitForFunction(() => window.location.pathname === '/auth/login', {
            timeout: 25_000,
          });
        } else {
          if (seededUser) {
            log(`Using shared seeded user ${seededUser.email}; skipping registration`);
          } else {
            log('Using provided credentials; skipping registration');
          }
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

        await Promise.all([page.click('button[type="submit"]'), sleep(500)]);

        await page.waitForFunction(
          () => window.location.pathname === '/' || window.location.pathname === '/dashboard',
          { timeout: 15_000 }
        );
      } catch (error) {
        console.warn(
          `[smoke] Interactive auth flow failed (${error instanceof Error ? error.message : error}). Falling back to bootstrap session.`
        );
        await applyBootstrapSession();
      }
    }

    await page.waitForFunction(
      () => window.location.pathname === '/' || window.location.pathname === '/dashboard',
      { timeout: 45_000 }
    );

    await page.waitForSelector('h1');
    const dashboardHeading = await page.evaluate(
      () => document.querySelector('h1')?.textContent?.trim() ?? ''
    );

    if (!dashboardHeading) {
      throw new Error('Dashboard heading not found after authentication');
    }

    await page.screenshot({
      path: path.join(artifactsDir, '03-dashboard.png'),
      fullPage: true,
    });

    if (shouldUploadCard) {
      log('Uploading sample card via scan UI');
      await page.goto(buildUrl('/scan'), { waitUntil: 'networkidle2' });
      const fileInput = await page.waitForSelector('input[type="file"]');
      if (!fileInput) {
        throw new Error('File input not found on scan page');
      }
      await fileInput.uploadFile(sampleCardPath);
      await fileInput.dispose();

      await page.waitForFunction(
        () =>
          document.body.innerText.toLowerCase().includes('selected') ||
          document.body.innerText.includes('Clear'),
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
      await page.waitForFunction(() => document.body.innerText.includes('Scan Another Card'), {
        timeout: 45_000,
      });

      await page.screenshot({
        path: path.join(artifactsDir, '04-scan-success.png'),
        fullPage: true,
      });

      log(`Captured scanned card details: ${expectedCardName} @ ${expectedCardCompany}`);
    } else {
      log('Skipping card upload; reusing seeded card from API harness');
      await page.goto(buildUrl('/scan'), { waitUntil: 'networkidle2' });
      await page.waitForSelector('main');
      await page.screenshot({
        path: path.join(artifactsDir, '04-scan-success.png'),
        fullPage: true,
      });
    }

    log('Navigating to cards page');
    await page.goto(buildUrl('/cards'), { waitUntil: 'networkidle2' });
    const observedPath = await page.evaluate(() => window.location.pathname);
    log(`Observed path after navigation: ${observedPath}`);
    const onCardsPage = await page.evaluate(
      () =>
        window.location.pathname === '/cards' || window.location.pathname.startsWith('/cards/')
    );
    if (!onCardsPage) {
      throw new Error(`Expected to land on /cards, but current path is ${observedPath}`);
    }

    const bodyPreview = await page.evaluate(() => document.body.innerText.slice(0, 500));
    log(`Cards page body preview: ${bodyPreview}`);
    if (!bodyPreview.toLowerCase().includes('business cards')) {
      throw new Error(
        `Unable to detect cards heading after navigation. First 500 chars: ${bodyPreview}`
      );
    }

    const mainHtmlPreview = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.innerHTML.slice(0, 3000) : 'No <main> element found';
    });
    log(`Cards main HTML preview: ${mainHtmlPreview}`);

    const collectCards = async () =>
      page.evaluate(() => {
        const normalize = (value: string | null | undefined) => {
          if (typeof value !== 'string') {
            return '';
          }
          return value.replace(/\s+/g, ' ').trim();
        };

        const cards: Array<{ name: string; company: string }> = [];

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

    const visibleHeadings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h3')).map(element =>
        (element.textContent ?? '').replace(/\s+/g, ' ').trim()
      )
    );
    log(`Card headings detected: ${JSON.stringify(visibleHeadings)}`);

    let cardsOnPage: Array<{ name: string; company: string }> = [];
    const cardsDeadline = Date.now() + 45_000;
    while (Date.now() < cardsDeadline) {
      cardsOnPage = await collectCards();
      if (cardsOnPage.length > 0) {
        break;
      }
      await sleep(500);
    }
    log(`Collected ${cardsOnPage.length} cards after polling`);

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

    if (matchingIndex !== 0 && shouldUploadCard) {
      throw new Error(
        `Uploaded card (${expectedCardName} @ ${expectedCardCompany}) not listed first; found at position ${matchingIndex + 1}.`
      );
    }

    if (shouldUploadCard) {
      log('Verified uploaded card is present at the top of the cards list');
    } else {
      log('Verified seeded card is present in the cards list');
    }

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
        const token = parsed?.state?.session?.accessToken ?? parsed?.session?.accessToken ?? null;
        if (typeof token === 'string' && token.length > 0) {
          window.localStorage.setItem('accessToken', token);
        }
      } catch {
        // ignore parse failures; search service will handle missing tokens gracefully
      }
    });

    const skipQuickSearch =
      parseBooleanFlag(process.env['WEB_E2E_SKIP_SEARCH']) ||
      parseBooleanFlag(process.env['WEB_E2E_SKIP_QUICK_SEARCH']);

    if (skipQuickSearch) {
      log('Skipping quick search validation due to WEB_E2E_SKIP_SEARCH flag');
    } else {
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

      log(`Executing search with query: ${effectiveSearchQuery}`);
      await basicSearchInput.type(effectiveSearchQuery, { delay: 25 });

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
            document.querySelectorAll<HTMLDivElement>(
              'div.bg-white.border.border-gray-200.rounded-lg'
            )
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

      const normalizedName = (expectedCardName ?? '').toLowerCase();
      const normalizedCompany = (expectedCardCompany ?? '').toLowerCase();
      const normalizedEmail = (expectedCardEmail ?? '').toLowerCase();

      const searchMatchingIndex = searchResults.findIndex(result => {
        const hasName = normalizedName ? result.textContent.includes(normalizedName) : true;
        const hasCompany = normalizedCompany ? result.textContent.includes(normalizedCompany) : true;
        const hasEmail = normalizedEmail ? result.textContent.includes(normalizedEmail) : true;
        return hasName && hasCompany && hasEmail;
      });

      if (searchMatchingIndex === -1) {
        throw new Error('Uploaded card not found in search results for provided query.');
      }

      if (searchMatchingIndex !== 0 && shouldUploadCard) {
        throw new Error(
          `Uploaded card found in search results but not listed first (position ${searchMatchingIndex + 1}).`
        );
      }

      if (shouldUploadCard) {
        log('Verified uploaded card appears first in search results with expected metadata');
      } else {
        log('Verified seeded card appears in search results with expected metadata');
      }

      await page.screenshot({
        path: path.join(artifactsDir, '06-cards-search.png'),
        fullPage: true,
      });
    }

    console.log(`\n✅ Smoke test completed. Screenshots stored in ${artifactsDir}.`);
  } finally {
    await browser.close();
    await stopApiSandbox();
    await stopDevServer();

    const activeStream = logStream;
    logStream = null;

    try {
      if (activeStream) {
        await new Promise<void>((resolve, reject) => {
          activeStream.end(error => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    } catch (error) {
      originalConsole.warn('Failed to close smoke artefact log stream', error);
    } finally {
      restoreConsole();
    }
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
