import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  // Opt-in workaround for resolvers that refuse SRV queries - see MONGODB_DNS_SERVERS's own
  // comment in config/env.ts. No-op (default Node resolver, unchanged) when unset.
  if (env.MONGODB_DNS_SERVERS) {
    const servers = env.MONGODB_DNS_SERVERS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    dns.setServers(servers);
    logger.info(
      { servers },
      'Using custom DNS servers for MongoDB SRV lookup (MONGODB_DNS_SERVERS)',
    );
  }

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(env.MONGODB_URI);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
