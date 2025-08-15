import { config } from 'dotenv';
import Joi from 'joi';

// Load environment variables based on NODE_ENV
const environment = process.env['NODE_ENV'] || 'development';
config({ path: `.env.${environment}` });
config(); // Load default .env as fallback

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3001),
  API_VERSION: Joi.string().default('v1'),

  // Database - support both DATABASE_URL and individual components
  DATABASE_URL: Joi.string().optional(),
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.string().optional(),
  DB_NAME: Joi.string().optional(),
  DB_USER: Joi.string().optional(),
  DB_PASS: Joi.string().optional(),

  // Authentication
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // AWS
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // S3
  S3_BUCKET_NAME: Joi.string().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_CDN_DOMAIN: Joi.string().allow(''),

  // Cognito
  COGNITO_USER_POOL_ID: Joi.string().required(),
  COGNITO_CLIENT_ID: Joi.string().required(),
  COGNITO_REGION: Joi.string().default('us-east-1'),

  // Redis
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: Joi.string().allow(''),

  // External APIs
  CLEARBIT_API_KEY: Joi.string().allow(''),
  NEWS_API_KEY: Joi.string().allow(''),

  // Security
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  CORS_ORIGIN: Joi.string().default(
    'http://localhost:3000,http://localhost:5173,http://localhost:8080'
  ),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().default('logs/app.log'),

  // File Upload
  MAX_FILE_SIZE: Joi.number().default(10 * 1024 * 1024), // 10MB
  ALLOWED_FILE_TYPES: Joi.string().default('image/jpeg,image/png,image/heic,image/webp'),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Construct DATABASE_URL from individual components if needed
let databaseUrl = envVars.DATABASE_URL;
if (
  !databaseUrl &&
  envVars.DB_HOST &&
  envVars.DB_PORT &&
  envVars.DB_NAME &&
  envVars.DB_USER &&
  envVars.DB_PASS
) {
  databaseUrl = `postgresql://${envVars.DB_USER}:${envVars.DB_PASS}@${envVars.DB_HOST}:${envVars.DB_PORT}/${envVars.DB_NAME}`;
}

if (!databaseUrl) {
  throw new Error(
    'Database configuration error: Either DATABASE_URL or individual DB_* components (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS) must be provided'
  );
}

export const env = {
  node: envVars.NODE_ENV,
  port: envVars.PORT,
  apiVersion: envVars.API_VERSION,
  isDevelopment: envVars.NODE_ENV === 'development',
  isProduction: envVars.NODE_ENV === 'production',
  isTest: envVars.NODE_ENV === 'test',

  database: {
    url: databaseUrl,
  },

  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },

  aws: {
    region: envVars.AWS_REGION,
    accessKeyId: envVars.AWS_ACCESS_KEY_ID,
    secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
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
  },

  security: {
    rateLimitWindowMs: envVars.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
    corsOrigin: envVars.CORS_ORIGIN.split(',').map((origin: string) => origin.trim()),
  },

  logging: {
    level: envVars.LOG_LEVEL,
    file: envVars.LOG_FILE,
  },

  upload: {
    maxFileSize: envVars.MAX_FILE_SIZE,
    allowedTypes: envVars.ALLOWED_FILE_TYPES.split(','),
  },
} as const;

export default env;
