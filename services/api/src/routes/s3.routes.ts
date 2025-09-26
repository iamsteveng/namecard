import { Router, Request, Response } from 'express';

import { getS3ConfigSummary } from '../config/s3.config.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import s3Service from '../services/s3.service.js';
import logger from '../utils/logger.js';

const router: Router = Router();

/**
 * @route GET /api/v1/s3/health
 * @desc S3 service health check
 * @access Public
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const [healthResult, configSummary] = await Promise.all([
      s3Service.healthCheck(),
      Promise.resolve(getS3ConfigSummary()),
    ]);

    const bucketInfo = s3Service.getBucketInfo();

    res.json({
      success: true,
      service: 'S3 Storage Service',
      status: healthResult.status,
      timestamp: new Date().toISOString(),
      configuration: {
        configured: configSummary.configured,
        bucket: configSummary.bucket,
        region: configSummary.region,
        cdnEnabled: configSummary.cdnEnabled,
        maxFileSize: `${(configSummary.maxFileSize / 1024 / 1024).toFixed(1)}MB`,
        errors: configSummary.errors,
      },
      capabilities: {
        upload: true,
        download: true,
        delete: true,
        list: true,
        signedUrls: true,
        batchUpload: true,
        metadata: true,
        cdnUrls: true,
      },
      endpoints: {
        baseUrl: bucketInfo.baseUrl,
        region: bucketInfo.region,
      },
      features: {
        purposes: ['storage', 'ocr', 'thumbnail', 'avatar', 'web-display'],
        supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic'],
        variants: ['original', 'compressed', 'watermarked', 'cropped'],
        folderStructure: 'images/{users}/{userId}/{purpose}/{variant}/',
        urlExpiration: '1 hour default',
        concurrentUploads: 3,
      },
      details: healthResult.details,
    });
  } catch (error) {
    logger.error('S3 health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      success: false,
      service: 'S3 Storage Service',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @route GET /api/v1/s3/config
 * @desc Get S3 configuration summary
 * @access Private (requires JWT token)
 */
router.get('/config', authenticateToken, (req: Request, res: Response) => {
  try {
    const configSummary = getS3ConfigSummary();
    const bucketInfo = s3Service.getBucketInfo();

    res.json({
      success: true,
      data: {
        ...configSummary,
        bucketInfo,
        features: {
          purposes: ['storage', 'ocr', 'thumbnail', 'avatar', 'web-display'],
          supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'heic'],
          folderStructure: {
            withUser: 'images/users/{userId}/{purpose}/{variant}/',
            withoutUser: 'images/{purpose}/',
          },
          capabilities: {
            upload: true,
            download: true,
            delete: true,
            list: true,
            signedUrls: true,
            batchUpload: true,
            metadata: true,
            cdnUrls: true,
          },
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get S3 configuration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get S3 configuration',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/v1/s3/files
 * @desc List files in S3 bucket
 * @access Private (requires JWT token)
 */
router.get('/files', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { prefix, maxKeys = '50' } = req.query;
    const { user } = req;

    // Build prefix for user's files if no specific prefix provided
    let searchPrefix = typeof prefix === 'string' ? prefix : undefined;
    if (!searchPrefix && user?.id) {
      searchPrefix = `images/users/${user.id}/`;
    }

    const maxKeysNum = Math.min(parseInt(maxKeys as string, 10) || 50, 100);

    logger.info('Listing S3 files', {
      userId: user?.id,
      prefix: searchPrefix,
      maxKeys: maxKeysNum,
    });

    const files = await s3Service.listFiles(searchPrefix, maxKeysNum);

    res.json({
      success: true,
      data: {
        files: files.map(file => ({
          ...file,
          url: s3Service.getCDNUrl(file.key),
          relativePath: file.key.replace(searchPrefix || '', ''),
        })),
        totalFiles: files.length,
        prefix: searchPrefix,
        maxKeys: maxKeysNum,
      },
    });
  } catch (error) {
    logger.error('Failed to list S3 files', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to list files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/v1/s3/files/:key/info
 * @desc Get information about a specific file
 * @access Private (requires JWT token)
 */
router.get('/files/:key(*)/info', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { user } = req;

    logger.info('Getting S3 file info', {
      userId: user?.id,
      key,
    });

    const fileInfo = await s3Service.getFileInfo(key);

    res.json({
      success: true,
      data: {
        ...fileInfo,
        url: s3Service.getCDNUrl(key),
        isUserFile: key.includes(`users/${user?.id}/`),
      },
    });
  } catch (error) {
    logger.error('Failed to get S3 file info', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      key: req.params.key,
    });

    res.status(404).json({
      success: false,
      error: 'File not found',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/v1/s3/files/:key/download
 * @desc Get a signed download URL for a file
 * @access Private (requires JWT token)
 */
router.get('/files/:key(*)/download', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { expiresIn = '3600' } = req.query;
    const { user } = req;

    const expiresInNum = Math.min(parseInt(expiresIn as string, 10) || 3600, 86400); // Max 24 hours

    logger.info('Generating signed download URL', {
      userId: user?.id,
      key,
      expiresIn: expiresInNum,
    });

    const signedUrl = await s3Service.getSignedDownloadUrl(key, expiresInNum);

    res.json({
      success: true,
      data: {
        key,
        signedUrl,
        expiresIn: expiresInNum,
        expiresAt: new Date(Date.now() + expiresInNum * 1000).toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to generate signed download URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      key: req.params.key,
    });

    res.status(404).json({
      success: false,
      error: 'File not found or access denied',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route DELETE /api/v1/s3/files/:key
 * @desc Delete a file from S3
 * @access Private (requires JWT token)
 */
router.delete('/files/:key(*)', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { user } = req;

    // Security check: ensure user can only delete their own files
    if (!key.includes(`users/${user?.id}/`)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only delete your own files',
      });
    }

    logger.info('Deleting S3 file', {
      userId: user?.id,
      key,
    });

    await s3Service.deleteFile(key);

    res.json({
      success: true,
      message: 'File deleted successfully',
      data: {
        key,
        deletedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to delete S3 file', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      key: req.params.key,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
