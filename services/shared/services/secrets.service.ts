import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface DatabaseSecrets {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

interface APISecrets {
  jwtSecret: string;
  perplexityApiKey?: string;
  redisUrl?: string;
}

class SecretsService {
  private client: SecretsManagerClient;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'ap-southeast-1',
    });
  }

  /**
   * Get secret from cache or AWS Secrets Manager
   */
  private async getSecret(secretArn: string): Promise<any> {
    const now = Date.now();
    
    // Check cache first
    if (this.cache.has(secretArn) && this.cacheExpiry.get(secretArn)! > now) {
      return this.cache.get(secretArn);
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretArn });
      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error(`Secret ${secretArn} has no SecretString value`);
      }

      const secretValue = JSON.parse(response.SecretString);
      
      // Cache the result
      this.cache.set(secretArn, secretValue);
      this.cacheExpiry.set(secretArn, now + this.CACHE_TTL);
      
      return secretValue;
    } catch (error) {
      console.error(`Failed to retrieve secret ${secretArn}:`, error);
      throw new Error(`Failed to retrieve secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get database configuration from Secrets Manager
   */
  async getDatabaseConfig(): Promise<{ url: string; config: DatabaseSecrets }> {
    const secretArn = process.env.DATABASE_SECRET_ARN;
    if (!secretArn) {
      throw new Error('DATABASE_SECRET_ARN environment variable is not set');
    }

    const secrets = await this.getSecret(secretArn);
    
    const config: DatabaseSecrets = {
      host: secrets.host,
      port: parseInt(secrets.port) || 5432,
      username: secrets.username,
      password: secrets.password,
      dbname: secrets.dbname,
    };

    // Construct DATABASE_URL for Prisma
    const url = `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.dbname}?schema=public&sslmode=require`;

    return { url, config };
  }

  /**
   * Get API configuration from Secrets Manager
   */
  async getAPIConfig(): Promise<APISecrets> {
    const secretArn = process.env.API_SECRET_ARN;
    if (!secretArn) {
      throw new Error('API_SECRET_ARN environment variable is not set');
    }

    const secrets = await this.getSecret(secretArn);
    
    return {
      jwtSecret: secrets.jwtSecret || secrets.JWT_SECRET,
      perplexityApiKey: secrets.perplexityApiKey || secrets.PERPLEXITY_API_KEY,
      redisUrl: secrets.redisUrl || secrets.REDIS_URL,
    };
  }

  /**
   * Get JWT secret specifically
   */
  async getJWTSecret(): Promise<string> {
    const apiConfig = await this.getAPIConfig();
    return apiConfig.jwtSecret;
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

// Export singleton instance
export const secretsService = new SecretsService();
export default secretsService;
