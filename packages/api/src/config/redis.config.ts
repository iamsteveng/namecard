import { createClient } from 'redis';

import type { RedisSearchClient } from '../types/search.types.js';
import logger from '../utils/logger.js';

import { env } from './env.js';

class RedisConfig {
  private client: RedisSearchClient | null = null;
  private isConnected = false;

  async getClient(): Promise<RedisSearchClient> {
    if (!this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('Failed to initialize Redis client');
    }
    return this.client;
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      logger.info('Connecting to Redis...', {
        url: env.redis.url.replace(/\/\/[^@]*@/, '//***:***@'), // Hide credentials in logs
      });

      this.client = createClient({
        url: env.redis.url,
        password: env.redis.password || undefined,
        socket: {
          reconnectStrategy: retries => {
            if (retries > 10) {
              logger.error('Redis reconnection failed after 10 attempts');
              return new Error('Redis reconnection failed');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
        },
      }) as unknown as RedisSearchClient;

      this.client.on('error', err => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      await this.client.connect();

      // Test the connection
      await this.client.ping();
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        logger.info('Redis client disconnected');
      } catch (error) {
        logger.error('Error disconnecting Redis client:', error);
      }
    }
    this.client = null;
    this.isConnected = false;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
  }> {
    if (!this.client || !this.isConnected) {
      return {
        status: 'unhealthy',
        error: 'Redis client not connected',
      };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const redisConfig = new RedisConfig();

// Initialize Redis connection when the module is loaded
if (env.node !== 'test') {
  redisConfig.connect().catch(error => {
    logger.error('Failed to initialize Redis connection:', error);
  });
}

export default redisConfig;
