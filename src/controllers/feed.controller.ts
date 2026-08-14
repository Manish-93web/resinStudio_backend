import { asyncHandler } from '../utils/asyncHandler';
import * as feedService from '../services/feed.service';

export const googleMerchant = asyncHandler(async (_req, res) => {
  const xml = await feedService.buildGoogleMerchantFeed();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

export const metaCatalog = asyncHandler(async (_req, res) => {
  const csv = await feedService.buildMetaCatalogFeed();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});
