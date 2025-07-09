import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// Simple in-memory rate limiting (for development)
// In production, this should use Redis
class InMemoryRateLimitStore {
  private store: RateLimitStore = {};

  get(key: string): { count: number; resetTime: number } | null {
    const record = this.store[key];
    if (!record) return null;
    
    // Clean up expired records
    if (Date.now() > record.resetTime) {
      delete this.store[key];
      return null;
    }
    
    return record;
  }

  set(key: string, count: number, resetTime: number): void {
    this.store[key] = { count, resetTime };
  }

  increment(key: string): number {
    const record = this.get(key);
    if (!record) {
      const resetTime = Date.now() + env.security.rateLimitWindowMs;
      this.set(key, 1, resetTime);
      return 1;
    }
    
    record.count++;
    this.store[key] = record;
    return record.count;
  }

  // Clean up expired records periodically
  cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    });
  }
}

const store = new InMemoryRateLimitStore();

// Clean up expired records every 10 minutes
setInterval(() => {
  store.cleanup();
}, 10 * 60 * 1000);

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export const rateLimit = (options: RateLimitOptions = {}) => {
  const {
    maxRequests = env.security.rateLimitMaxRequests,
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req: Request) => req.ip || 'unknown',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const currentCount = store.increment(key);
    const record = store.get(key);
    
    if (!record) {
      next();
      return;
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, maxRequests - currentCount).toString(),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString(),
    });

    // Check if limit exceeded
    if (currentCount > maxRequests) {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        count: currentCount,
        limit: maxRequests,
      });

      res.status(429).json({
        success: false,
        error: {
          message,
          retryAfter: Math.ceil((record.resetTime - Date.now()) / 1000),
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle response to potentially skip counting
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        const shouldSkip = 
          (skipSuccessfulRequests && res.statusCode < 400) ||
          (skipFailedRequests && res.statusCode >= 400);
        
        if (shouldSkip && record) {
          record.count = Math.max(0, record.count - 1);
          store.set(key, record.count, record.resetTime);
        }
        
        return originalJson(body);
      };
    }

    next();
  };
};

// Predefined rate limiters for different endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 uploads per minute
  message: 'Too many upload requests, please slow down',
});

export const apiRateLimit = rateLimit({
  windowMs: env.security.rateLimitWindowMs,
  maxRequests: env.security.rateLimitMaxRequests,
  skipSuccessfulRequests: true, // Don't count successful requests against limit
});

export default rateLimit;