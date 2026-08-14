import type { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  sort: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(req: Request, defaultSort = '-createdAt'): PaginationParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const sort =
    typeof req.query.sort === 'string' && req.query.sort.length > 0 ? req.query.sort : defaultSort;

  return { page, limit, skip: (page - 1) * limit, sort };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams,
): PaginatedResult<T> {
  return { data, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
