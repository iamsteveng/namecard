import { Router } from 'express';
import authRoutes from './auth.routes.js';
import cardsRoutes from './cards.routes.js';
import { env } from '../config/env.js';

const router = Router();

// API version info
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'NameCard API',
      version: env.apiVersion,
      description: 'Business card scanner and enrichment API',
      environment: env.node,
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: `/api/${env.apiVersion}/auth`,
        cards: `/api/${env.apiVersion}/cards`,
        health: '/health',
      },
    },
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/cards', cardsRoutes);

export default router;