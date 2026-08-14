import { randomUUID } from 'crypto';
import path from 'path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
// Imported for its init-on-import side effect (a no-op unless SENTRY_DSN is set) - this must run
// before any route/middleware that could throw, and app.ts is the one module shared by both the
// real server entrypoint (server.ts) and every test file (which calls createApp() directly), so
// it's the earliest point common to both.
import './config/sentry';
import { logger } from './config/logger';
import { env } from './config/env';
import { healthRouter } from './routes/health.route';
import { authRouter } from './routes/auth.route';
import { productRouter } from './routes/product.route';
import { categoryRouter } from './routes/category.route';
import { uploadRouter } from './routes/upload.route';
import { cartRouter } from './routes/cart.route';
import { orderRouter } from './routes/order.route';
import { adminOrderRouter } from './routes/adminOrder.route';
import { paymentRouter } from './routes/payment.route';
import { couponRouter } from './routes/coupon.route';
import { addressRouter } from './routes/address.route';
import { adminUserRouter } from './routes/adminUser.route';
import { productReviewRouter, reviewRouter } from './routes/review.route';
import { damageClaimRouter } from './routes/damageClaim.route';
import { settingsRouter, publicSettingsRouter } from './routes/settings.route';
import { dashboardRouter } from './routes/dashboard.route';
import { staffRouter } from './routes/staff.route';
import { activityRouter } from './routes/activity.route';
import { contactRouter } from './routes/contact.route';
import { commissionRouter, adminCommissionRouter } from './routes/commission.route';
import { giftCardRouter, adminGiftCardRouter } from './routes/giftCard.route';
import { bannerRouter, adminBannerRouter } from './routes/banner.route';
import { collectionRouter, adminCollectionRouter } from './routes/collection.route';
import { blogPostRouter, adminBlogPostRouter } from './routes/blogPost.route';
import { waitlistRouter } from './routes/waitlist.route';
import { newsletterRouter } from './routes/newsletter.route';
import { adminProductBulkRouter } from './routes/productBulk.route';
import { feedRouter } from './routes/feed.route';
import { pushTokenRouter } from './routes/pushToken.route';
import { wishlistRouter } from './routes/wishlist.route';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generateOpenApiDocument } from './config/swagger';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: [env.FRONTEND_URL, env.ADMIN_URL],
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '2mb',
      // Captures the exact raw bytes alongside normal JSON parsing, so webhook handlers can
      // verify a provider's HMAC signature against what was actually sent, not a re-serialized copy.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  // Serves generated/uploaded assets directly from disk when Cloudinary isn't configured (see
  // BACKEND_PUBLIC_URL in config/env.ts and scripts/generateProductImages.ts) - static files only,
  // no auth/session state involved, so this is safe to mount ahead of cookie/body middleware.
  app.use('/static', express.static(path.join(__dirname, '..', 'public')));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(mongoSanitize());
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test',
      // Reuse an inbound X-Request-Id (e.g. from an upstream proxy/gateway) when present, so a
      // request can be traced across services rather than getting a fresh id at every hop.
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) || randomUUID(),
      customProps: (req) => ({ requestId: (req as express.Request).id }),
    }),
  );
  // Echoed back so the caller (web/mobile client, or an upstream proxy) can correlate its own
  // logs/support tickets with this request's server-side log lines - see types/express.d.ts.
  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', String(req.id));
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/products', productRouter);
  app.use('/api/categories', categoryRouter);
  app.use('/api/uploads', uploadRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/admin/orders', adminOrderRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/coupons', couponRouter);
  app.use('/api/account/addresses', addressRouter);
  app.use('/api/admin/customers', adminUserRouter);
  app.use('/api/products/:productId/reviews', productReviewRouter);
  app.use('/api/reviews', reviewRouter);
  app.use('/api/admin/damage-claims', damageClaimRouter);
  app.use('/api/admin/settings', settingsRouter);
  app.use('/api/admin/dashboard', dashboardRouter);
  app.use('/api/admin/staff', staffRouter);
  app.use('/api/admin/activity', activityRouter);
  app.use('/api/settings/public', publicSettingsRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/commissions', commissionRouter);
  app.use('/api/admin/commissions', adminCommissionRouter);
  app.use('/api/gift-cards', giftCardRouter);
  app.use('/api/admin/gift-cards', adminGiftCardRouter);
  app.use('/api/banners', bannerRouter);
  app.use('/api/admin/banners', adminBannerRouter);
  app.use('/api/collections', collectionRouter);
  app.use('/api/admin/collections', adminCollectionRouter);
  app.use('/api/blog', blogPostRouter);
  app.use('/api/admin/blog', adminBlogPostRouter);
  app.use('/api/waitlist', waitlistRouter);
  app.use('/api/newsletter', newsletterRouter);
  app.use('/api/admin/products', adminProductBulkRouter);
  app.use('/api/feeds', feedRouter);
  app.use('/api/account/push-token', pushTokenRouter);
  app.use('/api/account/wishlist', wishlistRouter);

  const openApiDocument = generateOpenApiDocument();
  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
