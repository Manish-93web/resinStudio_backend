// ioredis-mock ships no bundled types, and the matching @types/ioredis-mock package pins a peer
// dependency (ioredis@^5) that conflicts with this repo's ioredis@^6 - see cacheAside.test.ts for
// where this is used. A minimal ambient declaration covering just the methods actually exercised
// there is simpler and safer than forcing that peer-dependency mismatch.
declare module 'ioredis-mock' {
  export default class RedisMock {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<'OK'>;
    incr(key: string): Promise<number>;
    flushall(): Promise<'OK'>;
  }
}
