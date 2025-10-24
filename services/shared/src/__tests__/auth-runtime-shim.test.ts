import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { register } from 'esbuild-register/dist/node';

const runtimeShimPath = path.resolve(__dirname, '../../..', 'auth', 'runtime-shim.js');
const runtimeShimUrl = pathToFileURL(runtimeShimPath).href;

const { unregister } = register({ extensions: ['.ts'], target: 'es2020' });

afterAll(() => {
  unregister?.();
});

describe('auth runtime shim exports', () => {
  beforeEach(() => {
    delete require.cache[runtimeShimPath];
  });

  it('exposes ensureDatabaseUrl via CommonJS require', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const shim = require(runtimeShimPath);
    expect(typeof shim.ensureDatabaseUrl).toBe('function');
  });

  it('exposes ensureDatabaseUrl via ESM import', async () => {
    const module = await import(`${runtimeShimUrl}?cacheBust=${Date.now()}`);
    expect(typeof module.ensureDatabaseUrl).toBe('function');
  });
});
