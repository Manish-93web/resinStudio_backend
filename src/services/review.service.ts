import { Types } from 'mongoose';
import { Review, type ReviewDoc, type ReviewStatus } from '../models/Review';
import { Product } from '../models/Product';
import { Order } from '../models/Order';
import { User } from '../models/User';
import { ApiError } from '../utils/apiError';
import { sendEmail } from './notification.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from '../utils/pagination';
import { logger } from '../config/logger';

async function computeVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
  const delivered = await Order.exists({
    user: userId,
    status: 'delivered',
    'items.product': productId,
  });
  return Boolean(delivered);
}

/**
 * The aggregate is always recomputed from currently-approved reviews rather than tracked
 * incrementally - edits, deletes, and re-moderation all change which reviews count, and an
 * incremental running average would drift out of sync with any one of those paths eventually.
 */
async function recomputeProductRating(productId: Types.ObjectId): Promise<void> {
  const [agg] = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.count ?? 0 },
  );
}

export async function createReview(
  userId: string,
  productId: string,
  input: { rating: number; comment: string; images?: string[] },
): Promise<ReviewDoc> {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const existing = await Review.findOne({ product: productId, user: userId });
  if (existing) {
    throw ApiError.conflict(
      'You have already reviewed this product — edit your existing review instead',
    );
  }

  const verifiedPurchase = await computeVerifiedPurchase(userId, productId);

  return Review.create({
    product: productId,
    user: userId,
    rating: input.rating,
    comment: input.comment,
    images: input.images ?? [],
    verifiedPurchase,
    status: 'pending',
  });
}

export async function listApprovedReviews(
  productId: string,
  pagination: PaginationParams,
): Promise<PaginatedResult<ReviewDoc>> {
  const filter = { product: productId, status: 'approved' as ReviewStatus };
  const [data, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name')
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Review.countDocuments(filter),
  ]);
  return buildPaginatedResult(data, total, pagination);
}

export async function getOwnReview(userId: string, productId: string): Promise<ReviewDoc | null> {
  return Review.findOne({ product: productId, user: userId });
}

export async function updateOwnReview(
  reviewId: string,
  userId: string,
  input: { rating?: number; comment?: string; images?: string[] },
): Promise<ReviewDoc> {
  const review = await Review.findById(reviewId);
  if (!review) throw ApiError.notFound('Review not found');
  if (review.user.toString() !== userId) throw ApiError.forbidden();

  const wasApproved = review.status === 'approved';

  if (input.rating !== undefined) review.rating = input.rating;
  if (input.comment !== undefined) review.comment = input.comment;
  if (input.images !== undefined) review.images = input.images;
  // Editing invalidates the prior moderation decision - re-queue rather than let an edited
  // comment go live under a stale approval.
  review.status = 'pending';
  review.moderatedBy = undefined;
  review.moderatedAt = undefined;
  await review.save();

  if (wasApproved) await recomputeProductRating(review.product);

  return review;
}

export async function deleteOwnReview(
  reviewId: string,
  actor: { userId: string; isAdmin: boolean },
): Promise<void> {
  const review = await Review.findById(reviewId);
  if (!review) throw ApiError.notFound('Review not found');
  if (!actor.isAdmin && review.user.toString() !== actor.userId) throw ApiError.forbidden();

  const wasApproved = review.status === 'approved';
  const productId = review.product;
  await review.deleteOne();
  if (wasApproved) await recomputeProductRating(productId);
}

export interface GalleryImage {
  imageUrl: string;
  productSlug: string;
  productTitle: string;
}

/** Site-wide UGC gallery source (§6.12: "on-site gallery of customer photos sourced from review
 *  image uploads") - flattens every image across every approved review, newest reviews first. */
export async function listGalleryImages(limit = 12): Promise<GalleryImage[]> {
  const reviews = await Review.find({ status: 'approved', 'images.0': { $exists: true } })
    .populate<{ product: { slug: string; title: string } }>('product', 'slug title')
    .sort('-createdAt')
    .limit(limit * 2); // a review can contribute multiple images, so over-fetch reviews before flattening

  const images: GalleryImage[] = [];
  for (const review of reviews) {
    for (const imageUrl of review.images) {
      if (images.length >= limit) break;
      images.push({
        imageUrl,
        productSlug: review.product.slug,
        productTitle: review.product.title,
      });
    }
    if (images.length >= limit) break;
  }
  return images;
}

export interface Testimonial {
  _id: string;
  rating: number;
  comment: string;
  customerName: string;
  productSlug: string;
  productTitle: string;
  createdAt: Date;
}

/** Site-wide homepage testimonials source: highly-rated approved reviews across all products,
 *  newest first - a simple, honest heuristic (no curated/pinned flag exists) matching the same
 *  "real data, no fabrication" approach as listGalleryImages above. */
export async function listTestimonials(limit = 6): Promise<Testimonial[]> {
  const reviews = await Review.find({ status: 'approved', rating: { $gte: 4 } })
    .populate<{ user: { name: string } }>('user', 'name')
    .populate<{ product: { slug: string; title: string } }>('product', 'slug title')
    .sort('-rating -createdAt')
    .limit(limit);

  return reviews.map((review) => ({
    _id: review._id.toString(),
    rating: review.rating,
    comment: review.comment,
    customerName: review.user.name,
    productSlug: review.product.slug,
    productTitle: review.product.title,
    createdAt: review.createdAt,
  }));
}

export async function listForModeration(
  filter: { status?: ReviewStatus },
  pagination: PaginationParams,
): Promise<PaginatedResult<ReviewDoc>> {
  const query = filter.status ? { status: filter.status } : {};
  const [data, total] = await Promise.all([
    Review.find(query)
      .populate('user', 'name email')
      .populate('product', 'title slug')
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Review.countDocuments(query),
  ]);
  return buildPaginatedResult(data, total, pagination);
}

export async function moderateReview(
  reviewId: string,
  actorId: string,
  input: { status: 'approved' | 'rejected'; replyText?: string },
): Promise<ReviewDoc> {
  const review = await Review.findById(reviewId);
  if (!review) throw ApiError.notFound('Review not found');

  review.status = input.status;
  review.moderatedBy = new Types.ObjectId(actorId);
  review.moderatedAt = new Date();
  if (input.replyText) {
    review.reply = {
      text: input.replyText,
      repliedBy: new Types.ObjectId(actorId),
      repliedAt: new Date(),
    };
  }
  await review.save();

  await recomputeProductRating(review.product);

  const user = await User.findById(review.user);
  if (user) {
    const outcome = input.status === 'approved' ? 'published' : 'not published';
    sendEmail({
      to: user.email,
      subject: 'Your product review has been moderated',
      text: `Your review has been ${outcome}.${input.replyText ? ` Store reply: ${input.replyText}` : ''}`,
    }).catch((err) => logger.error({ err }, 'Failed to send review moderation email'));
  }

  return review;
}
