#!/usr/bin/env node
import { register } from 'esbuild-register/dist/node';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import moduleAlias from 'module-alias';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const projectRoot = repoRoot;

let ensureDatabaseUrl;
let resolveUserFromToken;
let getTenantForUser;
let createCard;
let sharedModulePromise = null;

const require = createRequire(import.meta.url);

const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');
const tsconfigRaw = fs.existsSync(tsconfigPath)
  ? JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
  : {};

const { unregister } = register({
  extensions: ['.ts'],
  target: 'es2020',
  tsconfigRaw,
});

const sharedDistDir = path.resolve(projectRoot, 'services', 'shared', 'dist');
const sharedDistIndex = path.join(sharedDistDir, 'index.js');

function ensureSharedModule() {
  if (sharedModulePromise) {
    return sharedModulePromise;
  }

  sharedModulePromise = (async () => {
    if (!fs.existsSync(sharedDistIndex)) {
      console.log('ℹ️  Building @namecard/shared before starting sandbox...');
      const result = spawnSync('pnpm', ['--filter', '@namecard/shared', 'run', 'build'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        throw new Error('Failed to build @namecard/shared before launching sandbox');
      }
    }

    moduleAlias.addAlias('@namecard/shared', sharedDistDir);
    moduleAlias.addAlias('@namecard/shared/*', `${sharedDistDir}/*`);

    const nodeModules = path.resolve(projectRoot, 'node_modules', '@namecard');
    try {
      fs.mkdirSync(nodeModules, { recursive: true });
      const linkPath = path.join(nodeModules, 'shared');
      try {
        fs.unlinkSync(linkPath);
      } catch {}
      fs.symlinkSync(sharedDistDir, linkPath, 'dir');
    } catch (error) {
      console.warn('⚠️  Failed to establish @namecard/shared symlink for sandbox:', error.message);
    }

    const sharedModule = await import(sharedDistIndex);
    ({ ensureDatabaseUrl, resolveUserFromToken, getTenantForUser, createCard } = sharedModule);
  })().catch(error => {
    sharedModulePromise = null;
    throw error;
  });

  return sharedModulePromise;
}

const services = {
  auth: path.resolve(projectRoot, 'services', 'auth', 'handler.ts'),
  cards: path.resolve(projectRoot, 'services', 'cards', 'handler.ts'),
  enrichment: path.resolve(projectRoot, 'services', 'enrichment', 'handler.ts'),
  ocr: path.resolve(projectRoot, 'services', 'ocr', 'handler.ts'),
  search: path.resolve(projectRoot, 'services', 'search', 'handler.ts'),
  uploads: path.resolve(projectRoot, 'services', 'uploads', 'handler.ts'),
};

process.env['DATABASE_URL'] ||=
  'postgresql://namecard_user:namecard_password@localhost:5432/namecard_dev';
process.env['AWS_REGION'] ||= 'us-east-1';
process.env['AWS_DEFAULT_REGION'] ||= process.env['AWS_REGION'];
process.env['AWS_ACCESS_KEY_ID'] ||= 'test';
process.env['AWS_SECRET_ACCESS_KEY'] ||= 'test';

const placeholderImageUrl = 'https://dummyimage.com/640x360/0f172a/ffffff&text=NameCard+Sample';

const stubImageVariants = {
  original: placeholderImageUrl,
  ocr: placeholderImageUrl,
  thumbnail: placeholderImageUrl,
  web: placeholderImageUrl,
};

const stubBusinessCardData = {
  rawText:
    'Avery Johnson\nDirector of Partnerships\nNorthwind Analytics\navery.johnson@northwind-analytics.com\n+1-415-555-0100\nwww.northwind-analytics.com',
  confidence: 0.96,
  name: { text: 'Avery Johnson', confidence: 0.99 },
  jobTitle: { text: 'Director of Partnerships', confidence: 0.95 },
  company: { text: 'Northwind Analytics', confidence: 0.97 },
  email: { text: 'avery.johnson@northwind-analytics.com', confidence: 0.94 },
  phone: { text: '+1-415-555-0100', confidence: 0.91 },
  website: { text: 'https://northwind-analytics.com', confidence: 0.9 },
  address: {
    text: '525 Market Street, Suite 2100, San Francisco, CA 94105',
    confidence: 0.88,
  },
};

async function loadHandlers() {
  const entries = Object.entries(services).map(([name, filePath]) => {
    const module = require(filePath);
    if (!module?.handler) {
      throw new Error(`Service ${name} at ${filePath} does not export a handler`);
    }
    return [name, module.handler];
  });

  return Object.fromEntries(entries);
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function getRequestBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf-8');
      resolve(raw);
    });
  });
}

function buildEvent(req, url, rawBody) {
  const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(',') : value ?? '',
  ]));

  const queryParams = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryParams[key] = value;
  }

  const requestContext = {
    accountId: 'offline',
    apiId: 'offline',
    domainName: url.hostname,
    domainPrefix: 'offline',
    http: {
      method: req.method,
      path: url.pathname,
      protocol: req.httpVersion ? `HTTP/${req.httpVersion}` : 'HTTP/1.1',
      sourceIp: req.socket.remoteAddress || '127.0.0.1',
      userAgent: headers['user-agent'] || 'lambda-sandbox',
    },
    requestId: randomUUID(),
    routeKey: `${req.method} ${url.pathname}`,
    stage: '$default',
    timeEpoch: Date.now(),
  };

  return {
    version: '2.0',
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
    headers,
    queryStringParameters: Object.keys(queryParams).length ? queryParams : null,
    requestContext,
    body: typeof rawBody === 'string' && rawBody.length > 0 ? rawBody : null,
    isBase64Encoded: false,
    pathParameters: {},
    stageVariables: null,
  };
}

function buildLambdaContext(serviceName) {
  return {
    functionName: serviceName,
    functionVersion: '$LATEST',
    invokedFunctionArn: `arn:aws:lambda:offline:000000000000:function:${serviceName}`,
    memoryLimitInMB: '256',
    awsRequestId: randomUUID(),
    logGroupName: `/aws/lambda/${serviceName}`,
    logStreamName: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/[LATEST]${randomUUID()}`,
    getRemainingTimeInMillis: () => 30000,
  };
}

const serviceKeys = new Set(Object.keys(services));

function resolveServiceFromPath(parts) {
  if (!parts.length) {
    return null;
  }

  const normalized = [...parts.map(segment => segment.toLowerCase())];
  const envPrefix = (process.env['APP_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? '').toLowerCase();

  if (envPrefix && normalized[0] === envPrefix) {
    normalized.shift();
  }

  if (normalized[0] === 'api') {
    normalized.shift();
  }

  if (normalized[0] === 'v1' && normalized[1]) {
    const candidate = normalized[1];
    return serviceKeys.has(candidate) ? candidate : null;
  }

  return null;
}

function sendLambdaResponse(res, response) {
  if (!response) {
    res.statusCode = 204;
    res.end();
    return;
  }

  const statusCode = typeof response.statusCode === 'number' ? response.statusCode : 200;
  res.statusCode = statusCode;

  const headers = response.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    res.setHeader(key, String(value));
  }

  const body = response.body ?? '';
  if (!body) {
    res.end();
    return;
  }

  if (response.isBase64Encoded) {
    res.end(Buffer.from(body, 'base64'));
    return;
  }

  if (typeof body === 'string') {
    res.end(body);
    return;
  }

  if (!res.hasHeader('Content-Type')) {
    res.setHeader('Content-Type', 'application/json');
  }
  res.end(JSON.stringify(body));
}

function buildStubUploadResponse() {
  return {
    success: true,
    data: {
      files: [
        {
          key: `stub-upload-${randomUUID()}`,
          url: placeholderImageUrl,
          variants: { ...stubImageVariants },
        },
      ],
    },
    timestamp: new Date().toISOString(),
  };
}

function buildStubOcrResponse() {
  return {
    success: true,
    data: {
      businessCardData: { ...stubBusinessCardData },
    },
    timestamp: new Date().toISOString(),
  };
}

function respondPreflight(res, methods = 'GET,POST,OPTIONS') {
  res.statusCode = 204;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*, authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.end();
}

function respondJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function handleStubbedRoutes(req, res, url) {
  const method = (req.method ?? 'GET').toUpperCase();

  if (url.pathname === '/v1/upload/image') {
    if (method === 'OPTIONS') {
      console.log('[sandbox] preflight stub for POST /v1/upload/image');
      respondPreflight(res, 'POST, OPTIONS');
      return true;
    }
    if (method === 'POST') {
      console.log('[sandbox] stubbed response for POST /v1/upload/image');
      respondJson(res, buildStubUploadResponse());
      return true;
    }
  }

  if (url.pathname === '/v1/scan/business-card') {
    if (method === 'OPTIONS') {
      console.log('[sandbox] preflight stub for POST /v1/scan/business-card');
      respondPreflight(res, 'POST, OPTIONS');
      return true;
    }
    if (method === 'POST') {
      console.log('[sandbox] stubbed response for POST /v1/scan/business-card');
      respondJson(res, buildStubOcrResponse());
      return true;
    }
  }

  if (url.pathname === '/v1/cards/scan') {
    if (method === 'OPTIONS') {
      respondPreflight(res, 'POST, OPTIONS');
      return true;
    }
    if (method === 'POST') {
      await handleCardsScanStub(req, res);
      return true;
    }
  }

  return false;
}

async function handleCardsScanStub(req, res) {
  try {
    await ensureSharedModule();
    const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      respondJson(
        res,
        {
          success: false,
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
          timestamp: new Date().toISOString(),
        },
        401
      );
      return;
    }

    await ensureDatabaseUrl();
    const user = await resolveUserFromToken(token);
    if (!user) {
      respondJson(
        res,
        {
          success: false,
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
          timestamp: new Date().toISOString(),
        },
        401
      );
      return;
    }

    const tenantId = await getTenantForUser(user.id);
    const card = await createCard({
      userId: user.id,
      tenantId,
      originalImageUrl: placeholderImageUrl,
      processedImageUrl: placeholderImageUrl,
      extractedText: stubBusinessCardData.rawText,
      confidence: stubBusinessCardData.confidence,
      name: stubBusinessCardData.name?.text,
      title: stubBusinessCardData.jobTitle?.text,
      company: stubBusinessCardData.company?.text,
      email: stubBusinessCardData.email?.text,
      phone: stubBusinessCardData.phone?.text,
      address: stubBusinessCardData.address?.text,
      website: stubBusinessCardData.website?.text,
      notes: 'Generated via sandbox scan stub',
      tags: ['sandbox', 'scan'],
      scanDate: new Date(),
    });

    console.log('[sandbox] stubbed cards scan created card', card.id);

    const normalizedEmail = stubBusinessCardData.email?.text?.toLowerCase() ?? undefined;
    const normalizedPhone = stubBusinessCardData.phone?.text
      ? stubBusinessCardData.phone.text.replace(/[^+\d]/g, '')
      : undefined;
    const normalizedWebsite = stubBusinessCardData.website?.text ?? undefined;

    respondJson(
      res,
      {
        success: true,
        data: {
          cardId: card.id,
          extractedData: {
            ...stubBusinessCardData,
            normalizedEmail,
            normalizedPhone,
            normalizedWebsite,
          },
          confidence: stubBusinessCardData.confidence ?? 0.96,
          duplicateCardId: null,
          imageUrls: {
            original: card.originalImageUrl ?? placeholderImageUrl,
            processed: card.processedImageUrl ?? null,
          },
          processingTime: 900,
        },
        message: 'Card scanned successfully (stub)',
        timestamp: new Date().toISOString(),
      },
      201
    );
  } catch (error) {
    console.error('[sandbox] failed to handle cards scan stub', error);
    respondJson(
      res,
      {
        success: false,
        error: { message: error?.message ?? 'Internal error', code: 'INTERNAL_ERROR' },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

function augmentCardsScanResponse(response) {
  if (!response?.body) {
    return;
  }

  let payload;
  try {
    payload = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  } catch (error) {
    console.warn('[sandbox] failed to parse scan response payload', error);
    return;
  }

  const card = payload?.data?.card;
  const cardId = card?.id ?? payload?.data?.cardId;
  if (!cardId) {
    console.log('[sandbox] scan response missing cardId', payload);
    return;
  }

  const normalizedEmail = stubBusinessCardData.email?.text?.toLowerCase() ?? ''; // simple normalization
  const normalizedPhone = stubBusinessCardData.phone?.text
    ? stubBusinessCardData.phone.text.replace(/[^+\d]/g, '')
    : '';
  const normalizedWebsite = stubBusinessCardData.website?.text ?? '';

  const existingImageUrls = payload?.data?.imageUrls ?? {};

  payload.data = {
    cardId,
    extractedData: {
      ...stubBusinessCardData,
      normalizedEmail: normalizedEmail || undefined,
      normalizedPhone: normalizedPhone || undefined,
      normalizedWebsite: normalizedWebsite || undefined,
    },
    confidence: payload?.data?.confidence ?? 0.96,
    duplicateCardId: payload?.data?.duplicateCardId ?? undefined,
    imageUrls: {
      original: existingImageUrls.original ?? card?.originalImageUrl ?? placeholderImageUrl,
      processed: existingImageUrls.processed ?? card?.processedImageUrl ?? null,
    },
    processingTime: payload?.data?.processingTime ?? 1200,
  };

  response.body = JSON.stringify(payload);
  console.log('[sandbox] augmented scan response with stubbed data');
}

async function startServer(port = 4100) {
  const handlers = await loadHandlers();

  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', services: Object.keys(handlers) }));
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    console.log(`[sandbox] ${req.method ?? 'GET'} ${url.pathname}`);
    const rawBody = await getRequestBody(req);

    if (await handleStubbedRoutes(req, res, url)) {
      return;
    }

    const serviceFromPath = resolveServiceFromPath(parts);

    if (serviceFromPath) {
      const handler = handlers[serviceFromPath];

      if (!handler) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Unknown service: ${serviceFromPath}` }));
        return;
      }

      try {
        const event = buildEvent(req, url, rawBody);
        const context = buildLambdaContext(serviceFromPath);
        const response = await handler(event, context);

        if (
          serviceFromPath === 'cards' &&
          (req.method ?? 'GET').toUpperCase() === 'POST' &&
          url.pathname === '/v1/cards/scan'
        ) {
          augmentCardsScanResponse(response);
        }

        sendLambdaResponse(res, response);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Invocation failed' }));
      }
      return;
    }

    if (parts.length === 2 && parts[0] === 'invoke') {
      const serviceName = parts[1];
      const handler = handlers[serviceName];

      if (!handler) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Unknown service: ${serviceName}` }));
        return;
      }

      const parsedBody = rawBody ? parseJsonSafe(rawBody) : undefined;
      const explicitEvent =
        parsedBody && typeof parsedBody === 'object' && 'event' in parsedBody ? parsedBody.event : undefined;
      const explicitContext =
        parsedBody && typeof parsedBody === 'object' && 'context' in parsedBody ? parsedBody.context : undefined;

      const event = explicitEvent ?? buildEvent(req, url, rawBody);
      const context = explicitContext ?? buildLambdaContext(serviceName);

      try {
        const result = await handler(event, context);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ result }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error?.message || 'Invocation failed' }));
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    console.log(`🪄 Lambda sandbox running on http://localhost:${port}`);
    console.log('Use POST /invoke/<service> or call HTTP routes directly (e.g. /v1/auth/login).');
  });

  const shutdown = () => {
    console.log('\nShutting down lambda sandbox...');
    server.close(() => {
      unregister();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const portArg = process.argv.find(arg => arg.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : Number(process.env.LAMBDA_SANDBOX_PORT || 4100);

ensureSharedModule()
  .then(() => startServer(port))
  .catch(error => {
    console.error('Failed to start lambda sandbox:', error);
    unregister();
    process.exit(1);
  });
