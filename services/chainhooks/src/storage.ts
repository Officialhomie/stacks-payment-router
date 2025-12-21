/**
 * Simple key-value storage for metrics
 * Uses in-memory storage with optional Redis persistence
 */

import { logger } from '@shared/utils/logger';

interface Storage {
  put(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
}

class InMemoryStorage implements Storage {
  private data: Map<string, any> = new Map();

  async put(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }
}

class RedisStorage implements Storage {
  private redis: any;

  constructor() {
    try {
      // Try to import Redis
      const { getRedis } = require('@shared/utils/redis');
      this.redis = getRedis();
    } catch (error) {
      logger.warn('Redis not available, falling back to in-memory storage');
      this.redis = null;
    }
  }

  async put(key: string, value: any): Promise<void> {
    if (!this.redis) {
      throw new Error('Redis not available');
    }
    try {
      await this.redis.set(key, JSON.stringify(value));
    } catch (error) {
      logger.warn('Failed to store in Redis', { key, error });
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    if (!this.redis) {
      throw new Error('Redis not available');
    }
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Failed to get from Redis', { key, error });
      return null;
    }
  }
}

// Use Redis if available, otherwise fall back to in-memory
let storage: Storage;

try {
  const { getRedis } = require('@shared/utils/redis');
  const redis = getRedis();
  if (redis) {
    storage = new RedisStorage();
    logger.info('Using Redis for metrics storage');
  } else {
    storage = new InMemoryStorage();
    logger.info('Using in-memory storage for metrics');
  }
} catch (error) {
  storage = new InMemoryStorage();
  logger.info('Using in-memory storage for metrics (Redis not available)');
}

export const db = {
  put: async (key: string, value: any) => {
    await storage.put(key, value);
  },
  get: async (key: string) => {
    return await storage.get(key);
  },
};


