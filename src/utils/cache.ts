import { getRedis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Cache-aside helper for hot, rarely-changing reads (product/category listings, §12/§17 Phase 3).
 * This is a performance layer over MongoDB, never a source of truth on its own, so every failure
 * mode here falls through to calling `loader()` directly rather than surfacing an error:
 *  - Redis isn't configured at all (REDIS_URL unset) → always calls loader(), no caching.
 *  - A GET/SET call throws (e.g. Redis briefly unreachable) → logs a warning and calls loader().
 */
export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();

  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch (err) {
    logger.warn(
      { err, key },
      'Redis GET failed — falling back to source, skipping cache for this read',
    );
    return loader();
  }

  const value = await loader();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'Redis SET failed — continuing without caching this read');
  }

  return value;
}

/**
 * Version-number cache-key prefixing (the simpler alternative to a Redis KEYS/DEL scan, which can
 * block a production Redis instance under load): every cached key for a namespace embeds the
 * namespace's current version, and a write bumps that version — instantly "invalidating" every
 * previously-cached key for that namespace without having to enumerate or delete them.
 */
async function getCacheVersion(namespace: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get(`cache:version:${namespace}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (err) {
    logger.warn({ err, namespace }, 'Redis GET (cache version) failed — treating as version 0');
    return 0;
  }
}

/** Call this from any write path that could stale a namespace's cached reads (product/category
 *  create/update/delete). A no-op when Redis isn't configured. */
export async function bumpCacheVersion(namespace: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(`cache:version:${namespace}`);
  } catch (err) {
    logger.warn(
      { err, namespace },
      'Redis INCR (cache version bump) failed — stale cache reads may persist until TTL expiry',
    );
  }
}

/** cacheAside, but scoped to a namespace whose version is embedded in the key - see
 *  bumpCacheVersion above for how staleness gets busted on writes. */
export async function cacheAsideVersioned<T>(
  namespace: string,
  keySuffix: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();

  const version = await getCacheVersion(namespace);
  return cacheAside(`${namespace}:v${version}:${keySuffix}`, ttlSeconds, loader);
}
