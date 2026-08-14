// Temporary dev-server helper (not committed / not part of the app) - boots an in-memory MongoDB
// replica set (same technique as _dev_server.js), seeds it via the real scripts/seed.ts, then
// starts the real Express app on :4000 so the frontend (which defaults to
// http://localhost:4000/api) can talk to it, and so Puppeteer verification later in this session
// has real seeded data to click through. No real MongoDB Atlas / Cloudinary / Razorpay
// credentials exist in this environment (see ACCOUNT_SETUP.md) - this mirrors the pattern used by
// prior sessions per PROGRESS.md ("temp backend + seeded DB").
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { spawnSync } = require('child_process');

(async () => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_ACCESS_SECRET = 'x'.repeat(32);
  process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.ADMIN_URL = 'http://localhost:3000';
  process.env.PORT = '4000';

  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = rs.getUri('resinstudio-dev');
  console.log('MONGO_URI_READY:', process.env.MONGODB_URI);

  const seedResult = spawnSync(process.execPath, ['-r', 'tsx/cjs', 'scripts/seed.ts'], {
    env: process.env,
    stdio: 'inherit',
    cwd: __dirname,
  });
  if (seedResult.status !== 0) {
    console.error('SEED_FAILED');
    process.exit(1);
  }
  console.log('SEED_DONE');

  require('tsx/cjs');
  const { createApp } = require('./src/app.ts');
  const { connectDb } = require('./src/config/db.ts');

  await connectDb();
  const app = createApp();
  app.listen(4000, () => console.log('BACKEND_READY on :4000'));
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
