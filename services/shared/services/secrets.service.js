"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretsService = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
class SecretsService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        this.client = new client_secrets_manager_1.SecretsManagerClient({
            region: process.env.AWS_REGION || 'ap-southeast-1',
        });
    }
    /**
     * Get secret from cache or AWS Secrets Manager
     */
    async getSecret(secretArn) {
        const now = Date.now();
        // Check cache first
        if (this.cache.has(secretArn) && this.cacheExpiry.get(secretArn) > now) {
            return this.cache.get(secretArn);
        }
        try {
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretArn });
            const response = await this.client.send(command);
            if (!response.SecretString) {
                throw new Error(`Secret ${secretArn} has no SecretString value`);
            }
            const secretValue = JSON.parse(response.SecretString);
            // Cache the result
            this.cache.set(secretArn, secretValue);
            this.cacheExpiry.set(secretArn, now + this.CACHE_TTL);
            return secretValue;
        }
        catch (error) {
            console.error(`Failed to retrieve secret ${secretArn}:`, error);
            throw new Error(`Failed to retrieve secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get database configuration from Secrets Manager
     */
    async getDatabaseConfig() {
        const secretArn = process.env.DATABASE_SECRET_ARN;
        if (!secretArn) {
            throw new Error('DATABASE_SECRET_ARN environment variable is not set');
        }
        const secrets = await this.getSecret(secretArn);
        const config = {
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
    async getAPIConfig() {
        const secretArn = process.env.API_SECRET_ARN;
        if (!secretArn) {
            throw new Error('API_SECRET_ARN environment variable is not set');
        }
        const secrets = await this.getSecret(secretArn);
        return {
            jwtSecret: secrets.jwtSecret,
            perplexityApiKey: secrets.perplexityApiKey,
            redisUrl: secrets.redisUrl,
        };
    }
    /**
     * Get JWT secret specifically
     */
    async getJWTSecret() {
        const apiConfig = await this.getAPIConfig();
        return apiConfig.jwtSecret;
    }
    /**
     * Clear cache (useful for testing)
     */
    clearCache() {
        this.cache.clear();
        this.cacheExpiry.clear();
    }
}
// Export singleton instance
exports.secretsService = new SecretsService();
exports.default = exports.secretsService;
