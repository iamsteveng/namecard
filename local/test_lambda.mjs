// Simple local lambda invoker for compiled handlers
// Usage: node local/test_lambda.mjs <modulePath> <exportName>

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    path: '/local/test',
    headers: {},
    queryStringParameters: {},
    pathParameters: {},
    body: null,
    requestContext: { requestId: `req_${Date.now()}` },
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    awsRequestId: `aws_${Date.now()}`,
    functionName: 'local-test',
    functionVersion: '1',
    memoryLimitInMB: '128',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    ...overrides,
  };
}

async function main() {
  const [,, modPathArg, exportNameArg] = process.argv;
  if (!modPathArg) {
    console.error('Usage: node local/test_lambda.mjs <modulePath> <exportName>');
    process.exit(1);
  }

  const exportName = exportNameArg || 'handler';
  const modulePath = path.isAbsolute(modPathArg)
    ? pathToFileURL(modPathArg).href
    : pathToFileURL(path.resolve(__dirname, '..', modPathArg)).href;

  // Set minimal env defaults for tests
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
  process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'local_pool';
  process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || 'local_client';

  let mod;
  try {
    mod = await import(modulePath);
  } catch (err) {
    // Fallback: rewrite import of '@namecard/serverless-shared' to use lite-index.js
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL(modulePath), 'utf8');
    // Choose replacement: if handler only uses logger, swap to logger-only to avoid deps
    const loggerOnly = pathToFileURL(path.resolve(__dirname, '..', 'services', 'shared', 'dist', 'logger-stub.js')).href;
    const liteUrl = pathToFileURL(path.resolve(__dirname, '..', 'services', 'shared', 'dist', 'lite-index.js')).href;
    const usesOnlyLogger = /\{\s*logger\s*\}\s*from\s*['"]@namecard\/serverless-shared['"]/m.test(src);
    const targetUrl = usesOnlyLogger ? loggerOnly : liteUrl;
    let replaced = src.replace(/from\s+['"]@namecard\/serverless-shared['"]/g, `from '${targetUrl}'`);
    if (usesOnlyLogger) {
      replaced = replaced.replace(
        /import\s*\{\s*logger\s*\}\s*from\s*['"]([^'"]+)['"]/m,
        `import logger from '${targetUrl}'`
      );
    }
    const tmpPath = path.resolve(__dirname, '..', 'local', `.tmp_${path.basename(modPathArg)}`);
    await fs.writeFile(tmpPath, replaced, 'utf8');
    mod = await import(pathToFileURL(tmpPath).href);
  }
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    console.error(`Export ${exportName} is not a function in ${modulePath}`);
    process.exit(1);
  }

  const event = makeEvent();
  const context = makeContext();

  const res = await fn(event, context);
  console.log('\nLambda response:\n', JSON.stringify(res, null, 2));
}

main().catch(err => {
  console.error('Invocation failed:', err);
  process.exit(1);
});
