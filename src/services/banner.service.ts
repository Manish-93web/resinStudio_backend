import { Banner, type BannerAttrs, type BannerDoc, type BannerPlacement } from '../models/Banner';
import { ApiError } from '../utils/apiError';

/** Storefront-visible banners: active, and within its scheduling window if one is set. */
export async function listActive(placement?: BannerPlacement): Promise<BannerDoc[]> {
  const now = new Date();
  return Banner.find({
    ...(placement ? { placement } : {}),
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).sort('order');
}

export async function listForAdmin(): Promise<BannerDoc[]> {
  return Banner.find().sort('placement order');
}

export async function createBanner(
  input: Omit<BannerAttrs, 'createdAt' | 'updatedAt'>,
): Promise<BannerDoc> {
  return Banner.create(input);
}

export async function updateBanner(id: string, input: Partial<BannerAttrs>): Promise<BannerDoc> {
  const banner = await Banner.findByIdAndUpdate(id, input, { new: true });
  if (!banner) throw ApiError.notFound('Banner not found');
  return banner;
}

export async function deleteBanner(id: string): Promise<void> {
  const result = await Banner.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Banner not found');
}

/** Bulk order rewrite for drag-reorder in the admin UI - one round trip instead of N. */
export async function reorderBanners(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => Banner.updateOne({ _id: id }, { order: index })));
}
