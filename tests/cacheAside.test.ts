import RedisMock from 'ioredis-mock';

/**
 * REDIS_URL is unset in .env.test (see crossCutting.test.ts's "fully inert" assertions for that
 * pass-through path verified for real, with no Redis at all). This file instead verifies the
 * actual cache-HIT/version-bust/failure-fallback behavior against ioredis-mock (an in-memory
 * ioredis-API-compatible client), by mocking src/config/redis.ts's getRedis() directly rather
 * than fighting with the env-var-loaded-once-at-import-time singleton in src/config/env.ts.
 */
let currentClient: RedisMock | { get: jest.Mock; set: jest.Mock; incr: jest.Mock } =
  new RedisMock();

jest.mock('../src/config/redis', () => ({
  isRedisConfigured: true,
  getRedis: () => currentClient,
}));

import { cacheAside, cacheAsideVersioned, bumpCacheVersion } from '../src/utils/cache';

describe('cacheAside (§11) — verified against ioredis-mock', () => {
  beforeEach(() => {
    currentClient = new RedisMock();
  });

  it('calls the loader on a miss, then serves the cached value on a hit without calling the loader again', async () => {
    const loader = jest.fn().mockResolvedValue({ hello: 'world' });

    const first = await cacheAside('test-key', 60, loader);
    expect(first).toEqual({ hello: 'world' });
    expect(loader).toHaveBeenCalledTimes(1);

    const second = await cacheAside('test-key', 60, loader);
    expect(second).toEqual({ hello: 'world' });
    expect(loader).toHaveBeenCalledTimes(1); // still 1 — served from the cache, not re-loaded
  });

  it('falls through to the loader (no throw, no caching) when the Redis client itself throws', async () => {
    currentClient = {
      get: jest.fn().mockRejectedValue(new Error('Redis is briefly unreachable')),
      set: jest.fn().mockRejectedValue(new Error('Redis is briefly unreachable')),
      incr: jest.fn(),
    };
    const loader = jest.fn().mockResolvedValue('fresh-value');

    const result = await cacheAside('broken-key', 60, loader);
    expect(result).toBe('fresh-value');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cacheAsideVersioned busts every previously-cached key for a namespace once bumpCacheVersion is called', async () => {
    const loader = jest.fn().mockResolvedValueOnce('v1-data').mockResolvedValueOnce('v2-data');

    const first = await cacheAsideVersioned('products', 'list:all', 60, loader);
    expect(first).toBe('v1-data');

    const stillCached = await cacheAsideVersioned('products', 'list:all', 60, loader);
    expect(stillCached).toBe('v1-data');
    expect(loader).toHaveBeenCalledTimes(1);

    await bumpCacheVersion('products');

    const afterBump = await cacheAsideVersioned('products', 'list:all', 60, loader);
    expect(afterBump).toBe('v2-data'); // version bumped → different underlying key → loader re-runs
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bumping one namespace does not invalidate a different namespace', async () => {
    const productsLoader = jest.fn().mockResolvedValue('products-data');
    const categoriesLoader = jest.fn().mockResolvedValue('categories-data');

    await cacheAsideVersioned('products', 'all', 60, productsLoader);
    await cacheAsideVersioned('categories', 'all', 60, categoriesLoader);

    await bumpCacheVersion('categories');

    await cacheAsideVersioned('products', 'all', 60, productsLoader);
    expect(productsLoader).toHaveBeenCalledTimes(1); // untouched by the categories bump

    await cacheAsideVersioned('categories', 'all', 60, categoriesLoader);
    expect(categoriesLoader).toHaveBeenCalledTimes(2); // its own namespace was bumped
  });
});
