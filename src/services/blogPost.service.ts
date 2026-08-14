import { BlogPost, type BlogPostAttrs, type BlogPostDoc } from '../models/BlogPost';
import { ApiError } from '../utils/apiError';
import { parsePagination, buildPaginatedResult, type PaginatedResult } from '../utils/pagination';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import type { Request } from 'express';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  while (await BlogPost.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

export async function listPublished(
  req: Request,
  tag?: string,
): Promise<PaginatedResult<BlogPostDoc>> {
  const pagination = parsePagination(req, '-publishedAt');
  const filter: Record<string, unknown> = { status: 'published' };
  if (tag) filter.tags = tag;

  const [data, total] = await Promise.all([
    BlogPost.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit),
    BlogPost.countDocuments(filter),
  ]);
  return buildPaginatedResult(data, total, pagination);
}

export async function listForAdmin(): Promise<BlogPostDoc[]> {
  return BlogPost.find().sort('-createdAt');
}

export async function getById(id: string): Promise<BlogPostDoc> {
  const post = await BlogPost.findById(id).populate('linkedProducts');
  if (!post) throw ApiError.notFound('Blog post not found');
  return post;
}

export async function getBySlug(
  slug: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<BlogPostDoc> {
  const filter: Record<string, unknown> = { slug };
  if (!opts.includeUnpublished) filter.status = 'published';

  const post = await BlogPost.findOne(filter).populate('linkedProducts');
  if (!post) throw ApiError.notFound('Blog post not found');
  return post;
}

export async function createBlogPost(
  input: Omit<BlogPostAttrs, 'createdAt' | 'updatedAt'> & { slug?: string },
): Promise<BlogPostDoc> {
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  const slug = await ensureUniqueSlug(baseSlug);

  const publishedAt = input.status === 'published' ? (input.publishedAt ?? new Date()) : null;
  return BlogPost.create({ ...input, slug, publishedAt, content: sanitizeHtml(input.content) });
}

export async function updateBlogPost(
  id: string,
  input: Partial<BlogPostAttrs>,
): Promise<BlogPostDoc> {
  const post = await BlogPost.findById(id);
  if (!post) throw ApiError.notFound('Blog post not found');

  if (input.slug) input.slug = await ensureUniqueSlug(slugify(input.slug), id);
  // First transition into 'published' stamps publishedAt if the admin didn't set one explicitly;
  // later edits keep the original publish date rather than bumping it on every save.
  if (input.status === 'published' && post.status !== 'published' && !input.publishedAt) {
    input.publishedAt = new Date();
  }
  // Sanitized on write - same load-bearing XSS defense as Product.description (Tiptap rich text).
  if (input.content !== undefined) {
    input.content = sanitizeHtml(input.content);
  }

  Object.assign(post, input);
  await post.save();
  return post;
}

export async function deleteBlogPost(id: string): Promise<void> {
  const result = await BlogPost.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Blog post not found');
}
