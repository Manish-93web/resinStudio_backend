import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const isRedisConfigured = Boolean(env.REDIS_URL);

const client = isRedisConfigured
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    })
  : null;

client?.on('error', (err) => {
  // Never crash the process over a cache-layer hiccup - utils/cache.ts already treats every
  // Redis call as best-effort, this just keeps an unhandled 'error' event from taking Node down.
  logger.warn({ err }, 'Redis connection error — cache-aside reads will fall through to source');
});

/** Returns the shared (lazily-connecting) Redis client, or null when REDIS_URL isn't configured. */
export function getRedis(): Redis | null {
  return client;
}
