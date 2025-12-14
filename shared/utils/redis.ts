// Redis connection utility

import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

let client: RedisClientType | null = null;

export function getRedis(): RedisClientType {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = createClient({ url }) as RedisClientType;

    client.on('error', (err: Error) => {
      logger.error('Redis client error', { error: err.message });
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.connect().catch((err: Error) => {
      logger.error('Failed to connect to Redis', { error: err.message });
    });
  }

  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

// Cache key helpers
export const CACHE_KEYS = {
  quote: (intentId: string) => `quote:${intentId}`,
  liquidity: (chain: string, token: string) => `liquidity:${chain}:${token}`,
  gasPrice: (chain: string) => `gas:${chain}`,
  route: (from: string, to: string, amount: string) => `route:${from}:${to}:${amount}`,
  agent: (agentId: string) => `agent:${agentId}`,
  rateLimit: (ip: string, endpoint: string) => `ratelimit:${ip}:${endpoint}`,
};

