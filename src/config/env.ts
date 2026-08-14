import { z } from 'zod';
import dotenv from 'dotenv';

// Jest sets NODE_ENV=test automatically; load .env.test (safe dummy values, committed to the
// repo) in that case so unit/integration tests don't depend on a real .env file existing.
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // Some local/ISP-configured DNS resolvers refuse SRV record queries (querySrv ECONNREFUSED),
  // which mongodb+srv:// URIs require before they can even attempt a connection - this is a
  // resolver quirk, not a bad URI/credentials. Comma-separated list of DNS servers to use just for
  // this process's lookups when set (e.g. "8.8.8.8,1.1.1.1"); left empty, Node's default resolver
  // is used and this is a complete no-op. Machine-specific - set in .env, never commit a value here.
  MONGODB_DNS_SERVERS: z.string().optional().default(''),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // Stripe - international/non-INR checkout path (§17 Phase 3). Empty by default; inert until set.
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),

  // Redis cache-aside layer over hot product/category reads (§12/§17 Phase 3). Empty means the
  // cache is skipped entirely and every read goes straight to MongoDB - see utils/cache.ts.
  REDIS_URL: z.string().optional().default(''),

  // Algolia (§13/§17 Phase 3) - typo-tolerant catalog search once the catalog outgrows Mongo
  // $text search. ALGOLIA_SEARCH_API_KEY is a separate search-only key intended for later
  // frontend use, not consumed server-side yet.
  ALGOLIA_APP_ID: z.string().optional().default(''),
  ALGOLIA_API_KEY: z.string().optional().default(''),
  ALGOLIA_SEARCH_API_KEY: z.string().optional().default(''),
  ALGOLIA_INDEX_NAME: z.string().optional().default('products'),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(''),

  EMAIL_PROVIDER: z.enum(['console', 'brevo']).default('console'),
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  BREVO_API_KEY: z.string().optional().default(''),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),

  FCM_SERVER_KEY: z.string().optional().default(''),
  SENTRY_DSN: z.string().optional().default(''),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:3000'),
  // This backend's own public origin - used to build absolute URLs for statically-served assets
  // (see src/app.ts's /static mount and scripts/generateProductImages.ts), since Cloudinary isn't
  // configured in this dev environment (see CLOUDINARY_* above).
  BACKEND_PUBLIC_URL: z.string().default('http://localhost:4000'),

  // Used only by scripts/generateProductImages.ts (a one-off dev seeding tool, not the running
  // app) to generate real product photography via an OpenRouter image-capable model. Never used
  // at request-serving time - inert/unused if left empty.
  OPENROUTER_API_KEY: z.string().optional().default(''),

  COOKIE_SECRET: z.string().optional().default('dev-cookie-secret-change-me'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables — see .env.example and fill in .env');
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
