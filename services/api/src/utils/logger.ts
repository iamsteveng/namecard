import winston from 'winston';

import { env } from '../config/env.js';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

const logger = winston.createLogger({
  level: env.logging.level,
  format: logFormat,
  defaultMeta: { service: 'namecard-api' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

// Add file transport in production
if (env.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: env.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );
}

// Request logging middleware
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url, ip } = req;
    const { statusCode } = res;

    const logData = {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ip,
      userAgent: req.get('User-Agent'),
    };

    if (statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

export default logger;
