import { Router } from 'express';
import authRoutes from './auth.routes.js';
import cardsRoutes from './cards.routes.js';
import scanRoutes from './scan.routes.js';
import uploadRoutes from './upload.routes.js';
import s3Routes from './s3.routes.js';
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
        scan: `/api/${env.apiVersion}/scan`,
        upload: `/api/${env.apiVersion}/upload`,
        s3: `/api/${env.apiVersion}/s3`,
        health: '/health',
      },
    },
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/cards', cardsRoutes);
router.use('/scan', scanRoutes);
router.use('/upload', uploadRoutes);
router.use('/s3', s3Routes);

export default router;