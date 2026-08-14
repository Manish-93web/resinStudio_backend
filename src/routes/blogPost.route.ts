import { Router } from 'express';
import * as blogPostController from '../controllers/blogPost.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import {
  createBlogPostBodySchema,
  updateBlogPostBodySchema,
  blogPostIdParamSchema,
  blogPostSlugParamSchema,
  blogPostQuerySchema,
} from '../schemas/blogPost.schema';

// Mounted at /api/blog
export const blogPostRouter = Router();
blogPostRouter.get('/', validate({ query: blogPostQuerySchema }), blogPostController.list);
blogPostRouter.get(
  '/:slug',
  optionalAuth,
  validate({ params: blogPostSlugParamSchema }),
  blogPostController.getBySlug,
);

// Mounted at /api/admin/blog
export const adminBlogPostRouter = Router();
adminBlogPostRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  blogPostController.listAdmin,
);
adminBlogPostRouter.get(
  '/:id',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  validate({ params: blogPostIdParamSchema }),
  blogPostController.getByIdAdmin,
);
adminBlogPostRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createBlogPostBodySchema }),
  blogPostController.create,
);
adminBlogPostRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: blogPostIdParamSchema, body: updateBlogPostBodySchema }),
  blogPostController.update,
);
adminBlogPostRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: blogPostIdParamSchema }),
  blogPostController.remove,
);
