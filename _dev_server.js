const { MongoMemoryReplSet } = require('mongodb-memory-server');

(async () => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_ACCESS_SECRET = 'x'.repeat(32);
  process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
  process.env.FRONTEND_URL = 'http://localhost:3010';
  process.env.ADMIN_URL = 'http://localhost:3010';

  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = rs.getUri('resinstudio-dev-verify');
  process.env.PORT = '4098';
  console.log('MONGO_URI_READY:', process.env.MONGODB_URI);

  require('tsx/cjs');
  const { createApp } = require('./src/app.ts');
  const { connectDb } = require('./src/config/db.ts');

  await connectDb();
  const app = createApp();
  app.listen(4098, () => console.log('BACKEND_READY on :4098'));
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
