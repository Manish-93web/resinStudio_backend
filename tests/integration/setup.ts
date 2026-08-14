import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let replSet: MongoMemoryReplSet | undefined;

/**
 * A single-node replica set (not a plain standalone instance) so tests exercise the same
 * multi-document transaction support Atlas provides in production — a plain in-memory standalone
 * server would silently let transaction-dependent code (order creation, stock guards) pass tests
 * that fail against the real database.
 */
export async function setupTestDb(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.disconnect();
  await replSet?.stop();
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
