import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as blogPostService from '../services/blogPost.service';
import { logActivity } from '../services/activityLog.service';

const STAFF_ROLES = ['staff', 'manager', 'owner'];

export const list = asyncHandler(async (req, res) => {
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const result = await blogPostService.listPublished(req, tag);
  res.json(result);
});

export const getBySlug = asyncHandler(async (req, res) => {
  const includeUnpublished = Boolean(req.user && STAFF_ROLES.includes(req.user.role));
  const post = await blogPostService.getBySlug(req.params.slug as string, { includeUnpublished });
  res.json({ post });
});

export const listAdmin = asyncHandler(async (_req, res) => {
  const posts = await blogPostService.listForAdmin();
  res.json({ data: posts });
});

export const getByIdAdmin = asyncHandler(async (req, res) => {
  const post = await blogPostService.getById(req.params.id as string);
  res.json({ post });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const post = await blogPostService.createBlogPost({ ...req.body, author: req.user.id });
  await logActivity({
    actor: req.user.id,
    action: 'blog.create',
    targetType: 'BlogPost',
    targetId: post.id,
  });
  res.status(201).json({ post });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const post = await blogPostService.updateBlogPost(req.params.id as string, req.body);
  await logActivity({
    actor: req.user.id,
    action: 'blog.update',
    targetType: 'BlogPost',
    targetId: post.id,
  });
  res.json({ post });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await blogPostService.deleteBlogPost(req.params.id as string);
  await logActivity({
    actor: req.user.id,
    action: 'blog.delete',
    targetType: 'BlogPost',
    targetId: req.params.id,
  });
  res.status(204).send();
});
