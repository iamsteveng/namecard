import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let bootstrapPromise: Promise<void> | null = null;

function buildConnectionString(host: string, port: number, database: string, username: string, password: string): string {
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  const encodedDb = encodeURIComponent(database);
  return `postgresql://${encodedUser}:${encodedPass}@${host}:${port}/${encodedDb}`;
}

async function resolveDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL) {
    return;
  }

  const secretArn = process.env['DB_SECRET_ARN'];
  const proxyHost = process.env['DB_PROXY_ENDPOINT'];
  const clusterHostOverride = process.env['DB_CLUSTER_ENDPOINT'];
  const preferProxy = (process.env['DB_PREFER_PROXY'] ?? 'true').toLowerCase() !== 'false';

  if (!secretArn) {
    console.warn('[db-runtime] DB_SECRET_ARN not set; skipping DATABASE_URL bootstrap');
    return;
  }

  try {
    const client = new SecretsManagerClient({});
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secretString =
      response.SecretString ??
      (response.SecretBinary ? Buffer.from(response.SecretBinary).toString('utf8') : undefined);

    if (!secretString) {
      console.warn('[db-runtime] Secret string empty for DB secret');
      return;
    }

    const secret = JSON.parse(secretString) as Record<string, string | number | undefined>;
    const username = (secret.username ?? secret.user ?? secret.USER ?? secret.USERNAME) as string | undefined;
    const password = (secret.password ?? secret.PASSWORD) as string | undefined;
    const database = (secret.dbname ?? secret.DB_NAME ?? 'namecard') as string;
    const port = Number(secret.port ?? secret.PORT ?? 5432);
    const clusterHostSecret = (secret.host as string | undefined) ?? undefined;
    const clusterHost = clusterHostOverride ?? clusterHostSecret;

    if (!username || !password || (!proxyHost && !clusterHost)) {
      console.warn('[db-runtime] Secret missing connection fields; DATABASE_URL not set');
      return;
    }

    const hostCandidates: Array<{ mode: 'proxy' | 'cluster'; host: string }> = [];

    if (proxyHost) {
      hostCandidates.push({ mode: 'proxy', host: proxyHost });
    }
    if (clusterHost) {
      hostCandidates.push({ mode: 'cluster', host: clusterHost });
    }

    if (hostCandidates.length === 0) {
      console.warn('[db-runtime] No database hosts available for proxy or cluster');
      return;
    }

    const orderedHosts = hostCandidates.sort((a, b) => {
      if (preferProxy) {
        if (a.mode === 'proxy' && b.mode !== 'proxy') {
          return -1;
        }
        if (a.mode !== 'proxy' && b.mode === 'proxy') {
          return 1;
        }
      } else {
        if (a.mode === 'cluster' && b.mode !== 'cluster') {
          return -1;
        }
        if (a.mode !== 'cluster' && b.mode === 'cluster') {
          return 1;
        }
      }
      return 0;
    });

    const connectionStrings = orderedHosts.map(({ mode, host }) => ({
      mode,
      host,
      url: buildConnectionString(host, port, database, username, password),
    }));

    const primary = connectionStrings[0];

    process.env.DATABASE_URL = primary.url;
    process.env.DATABASE_URL_MODE = primary.mode;

    connectionStrings.forEach(({ mode, url }) => {
      if (mode === 'proxy') {
        process.env.DATABASE_URL_PROXY = url;
      }
      if (mode === 'cluster') {
        process.env.DATABASE_URL_CLUSTER = url;
      }
    });

    console.info('[db-runtime] DATABASE_URL resolved', {
      mode: primary.mode,
      host: primary.host,
      preferProxy,
      proxyAvailable: Boolean(proxyHost),
      clusterAvailable: Boolean(clusterHost),
    });
  } catch (error) {
    console.error('[db-runtime] Failed to resolve DATABASE_URL from secret', error);
    throw error;
  }
}

export async function ensureDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL) {
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = resolveDatabaseUrl().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}
