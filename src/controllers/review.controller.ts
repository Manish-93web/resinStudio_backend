import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as reviewService from '../services/review.service';
import { parsePagination } from '../utils/pagination';
import type { ReviewStatus } from '../models/Review';

const MODERATOR_ROLES = ['manager', 'owner'];

export const listForProduct = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req, '-createdAt');
  const result = await reviewService.listApprovedReviews(
    req.params.productId as string,
    pagination,
  );
  res.json(result);
});

export const createForProduct = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.createReview(
    req.user.id,
    req.params.productId as string,
    req.body,
  );
  res.status(201).json({ review });
});

export const getMineForProduct = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.getOwnReview(req.user.id, req.params.productId as string);
  res.json({ review });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.updateOwnReview(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  res.json({ review });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await reviewService.deleteOwnReview(req.params.id as string, {
    userId: req.user.id,
    isAdmin: MODERATOR_ROLES.includes(req.user.role),
  });
  res.status(204).send();
});

export const gallery = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const images = await reviewService.listGalleryImages(limit);
  res.json({ data: images });
});

export const testimonials = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await reviewService.listTestimonials(limit);
  res.json({ data });
});

export const listQueue = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req, '-createdAt');
  const status = req.query.status as ReviewStatus | undefined;
  const result = await reviewService.listForModeration({ status }, pagination);
  res.json(result);
});

export const moderate = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.moderateReview(req.params.id as string, req.user.id, req.body);
  res.json({ review });
});
