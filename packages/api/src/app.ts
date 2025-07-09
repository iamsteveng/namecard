import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import 'express-async-errors';

import { env } from './config/env.js';
import logger, { requestLogger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { apiRateLimit } from './middleware/rate-limit.middleware.js';
import apiRoutes from './routes/index.js';

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: env.isProduction,
  hsts: env.isProduction,
}));

// CORS configuration
app.use(cors({
  origin: env.security.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (!env.isTest) {
  app.use(requestLogger);
}

// Rate limiting
app.use(apiRateLimit);

// Health check endpoint (before API routes)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.node,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// API routes
app.use(`/api/${env.apiVersion}`, apiRoutes);

// Root route with API information
app.get('/', (_req, res) => {
  res.json({
    name: 'NameCard API Server',
    version: env.apiVersion,
    environment: env.node,
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: `/api/${env.apiVersion}`,
      auth: `/api/${env.apiVersion}/auth`,
      cards: `/api/${env.apiVersion}/cards`,
    },
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
