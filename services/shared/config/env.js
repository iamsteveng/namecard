"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = require("dotenv");
const joi_1 = __importDefault(require("joi"));
// Load environment variables for serverless environment
const environment = process.env['NODE_ENV'] || 'development';
const path = require('path');
const rootPath = path.resolve(__dirname, '../../../');
(0, dotenv_1.config)({ path: path.join(rootPath, `.env.${environment}`) });
(0, dotenv_1.config)({ path: path.join(rootPath, '.env') }); // Load default .env as fallback
const envSchema = joi_1.default.object({
    NODE_ENV: joi_1.default.string().valid('development', 'test', 'production', 'local').default('development'),
    // Database - support both DATABASE_URL and individual components
    DATABASE_URL: joi_1.default.string().optional(),
    DB_HOST: joi_1.default.string().optional(),
    DB_PORT: joi_1.default.string().optional(),
    DB_NAME: joi_1.default.string().optional(),
    DB_USER: joi_1.default.string().optional(),
    DB_PASS: joi_1.default.string().optional(),
    // Authentication (loaded from Secrets Manager in serverless)
    JWT_SECRET: joi_1.default.string().optional(),
    JWT_EXPIRES_IN: joi_1.default.string().default('7d'),
    JWT_REFRESH_EXPIRES_IN: joi_1.default.string().default('30d'),
    // AWS
    AWS_REGION: joi_1.default.string().default('us-east-1'),
    // S3 (optional for auth service)
    S3_BUCKET_NAME: joi_1.default.string().optional(),
    S3_REGION: joi_1.default.string().default('us-east-1'),
    S3_CDN_DOMAIN: joi_1.default.string().allow(''),
    // Cognito
    COGNITO_USER_POOL_ID: joi_1.default.string().required(),
    COGNITO_CLIENT_ID: joi_1.default.string().required(),
    COGNITO_REGION: joi_1.default.string().default('us-east-1'),
    // Redis
    REDIS_URL: joi_1.default.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: joi_1.default.string().allow(''),
    // External APIs
    CLEARBIT_API_KEY: joi_1.default.string().allow(''),
    NEWS_API_KEY: joi_1.default.string().allow(''),
    PERPLEXITY_API_KEY: joi_1.default.string().allow(''),
    // File Upload
    MAX_FILE_SIZE: joi_1.default.number().default(10 * 1024 * 1024), // 10MB
    ALLOWED_FILE_TYPES: joi_1.default.string().default('image/jpeg,image/png,image/heic,image/webp'),
}).unknown();
const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
    throw new Error(`Serverless config validation error: ${error.message}`);
}
// Construct DATABASE_URL from individual components if needed
let databaseUrl = envVars.DATABASE_URL;
if (!databaseUrl &&
    envVars.DB_HOST &&
    envVars.DB_PORT &&
    envVars.DB_NAME &&
    envVars.DB_USER &&
    envVars.DB_PASS) {
    // URL-encode the password to handle special characters like commas
    const encodedPassword = encodeURIComponent(envVars.DB_PASS);
    databaseUrl = `postgresql://${envVars.DB_USER}:${encodedPassword}@${envVars.DB_HOST}:${envVars.DB_PORT}/${envVars.DB_NAME}`;
}
// In serverless environments, database configuration is loaded at runtime from Secrets Manager
const isServerless = process.env.STAGE !== undefined || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
if (!databaseUrl && !isServerless) {
    throw new Error('Database configuration error: Either DATABASE_URL or individual DB_* components (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS) must be provided');
}
exports.env = {
    node: envVars.NODE_ENV,
    isDevelopment: envVars.NODE_ENV === 'development',
    isProduction: envVars.NODE_ENV === 'production',
    isTest: envVars.NODE_ENV === 'test',
    database: {
        url: databaseUrl || undefined, // undefined in serverless, loaded at runtime
    },
    jwt: {
        secret: envVars.JWT_SECRET,
        expiresIn: envVars.JWT_EXPIRES_IN,
        refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
    },
    aws: {
        region: envVars.AWS_REGION,
    },
    s3: {
        bucketName: envVars.S3_BUCKET_NAME,
        region: envVars.S3_REGION,
        cdnDomain: envVars.S3_CDN_DOMAIN,
    },
    cognito: {
        userPoolId: envVars.COGNITO_USER_POOL_ID,
        clientId: envVars.COGNITO_CLIENT_ID,
        region: envVars.COGNITO_REGION,
    },
    redis: {
        url: envVars.REDIS_URL,
        password: envVars.REDIS_PASSWORD,
    },
    externalApis: {
        clearbitApiKey: envVars.CLEARBIT_API_KEY,
        newsApiKey: envVars.NEWS_API_KEY,
        perplexityApiKey: envVars.PERPLEXITY_API_KEY,
    },
    upload: {
        maxFileSize: envVars.MAX_FILE_SIZE,
        allowedTypes: envVars.ALLOWED_FILE_TYPES.split(','),
    },
};
exports.default = exports.env;
