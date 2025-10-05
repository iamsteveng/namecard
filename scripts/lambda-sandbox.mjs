#!/usr/bin/env node
import { register } from 'esbuild-register/dist/node';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import moduleAlias from 'module-alias';
import { spawnSync } from 'child_process';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const projectRoot = repoRoot;

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

moduleAlias.addAlias('@namecard/shared', sharedDistIndex);
moduleAlias.addAlias('@namecard/shared/*', sharedDistDir);

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

const services = {
  auth: path.resolve(projectRoot, 'services', 'auth', 'handler.ts'),
  cards: path.resolve(projectRoot, 'services', 'cards', 'handler.ts'),
  enrichment: path.resolve(projectRoot, 'services', 'enrichment', 'handler.ts'),
  ocr: path.resolve(projectRoot, 'services', 'ocr', 'handler.ts'),
  search: path.resolve(projectRoot, 'services', 'search', 'handler.ts'),
  uploads: path.resolve(projectRoot, 'services', 'uploads', 'handler.ts'),
};

async function loadHandlers() {
  const entries = await Promise.all(
    Object.entries(services).map(async ([name, filePath]) => {
      const module = await import(filePath);
      if (!module?.handler) {
        throw new Error(`Service ${name} at ${filePath} does not export a handler`);
      }
      return [name, module.handler];
    })
  );

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

    if (parts.length === 2 && parts[0] === 'invoke') {
      const serviceName = parts[1];
      const handler = handlers[serviceName];

      if (!handler) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: `Unknown service: ${serviceName}` }));
        return;
      }

      const rawBody = await getRequestBody(req);
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
    console.log('POST /invoke/<service> to invoke a handler.');
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

startServer(port).catch(error => {
  console.error('Failed to start lambda sandbox:', error);
  unregister();
  process.exit(1);
});
