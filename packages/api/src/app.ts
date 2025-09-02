import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import 'express-async-errors';

import { env } from './config/env.js';
import prisma from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { apiRateLimit } from './middleware/rate-limit.middleware.js';
import apiRoutes from './routes/index.js';
import logger, { requestLogger } from './utils/logger.js';

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: env.isProduction,
    hsts: env.isProduction,
  })
);

// CORS configuration
app.use(
  cors({
    origin: env.security.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

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
app.get('/health', async (_req, res) => {
  let databaseStatus = 'unknown';
  let databaseError = null;

  try {
    // Check database connection with timeout
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database query timeout')), 2000)
      ),
    ]);
    databaseStatus = 'connected';
  } catch (error) {
    databaseStatus = 'disconnected';
    databaseError = error instanceof Error ? error.message : 'Unknown database error';
    logger.warn('Health check database query failed', { error: databaseError });
  }

  const response = {
    status: databaseStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: env.node,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      database: {
        status: databaseStatus,
        error: databaseError,
      },
      api: {
        status: 'ok',
        message: 'API server is running',
      },
    },
  };

  // Return 200 for degraded mode (API works without database)
  // Return 503 only if API itself cannot function
  const statusCode = response.status === 'ok' ? 200 : 200; // Keep 200 for degraded mode
  res.status(statusCode).json(response);
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

export { app };
export default app;
