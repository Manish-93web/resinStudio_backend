import { Router } from 'express';
import * as feedController from '../controllers/feed.controller';

// Mounted at /api/feeds - public, unauthenticated (Google/Meta crawlers fetch these directly)
export const feedRouter = Router();
feedRouter.get('/google-merchant.xml', feedController.googleMerchant);
feedRouter.get('/meta.csv', feedController.metaCatalog);
