import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as commissionService from '../services/commission.service';
import { logActivity } from '../services/activityLog.service';
import { parsePagination } from '../utils/pagination';
import type { CommissionStatus } from '../models/Commission';

export const create = asyncHandler(async (req, res) => {
  const commission = await commissionService.createCommissionRequest(req.user?.id, req.body);
  res.status(201).json({ commission });
});

export const listMine = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const commissions = await commissionService.listMine(req.user.id);
  res.json({ data: commissions });
});

export const getMine = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const commission = await commissionService.getOwnedById(req.params.id as string, req.user.id);
  res.json({ commission });
});

export const payDeposit = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await commissionService.payDeposit(req.params.id as string, req.user.id, req.body);
  res.status(201).json(result);
});

export const payBalance = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await commissionService.payBalance(req.params.id as string, req.user.id, req.body);
  res.status(201).json(result);
});

// --- Admin ---

export const listQueue = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req, '-createdAt');
  const status = req.query.status as CommissionStatus | undefined;
  const result = await commissionService.listForModeration({ status }, pagination);
  res.json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  const commission = await commissionService.getForAdmin(req.params.id as string);
  res.json({ commission });
});

export const sendQuote = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const commission = await commissionService.sendQuote(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  await logActivity({
    actor: req.user.id,
    action: 'commission.quote',
    targetType: 'Commission',
    targetId: commission.id,
    metadata: { price: req.body.price },
  });
  res.json({ commission });
});

export const decline = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const commission = await commissionService.declineCommission(
    req.params.id as string,
    req.user.id,
    req.body.reason,
  );
  await logActivity({
    actor: req.user.id,
    action: 'commission.decline',
    targetType: 'Commission',
    targetId: commission.id,
  });
  res.json({ commission });
});

export const updateProductionStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const commission = await commissionService.updateProductionStatus(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  await logActivity({
    actor: req.user.id,
    action: 'commission.status_change',
    targetType: 'Commission',
    targetId: commission.id,
    metadata: { status: req.body.status },
  });
  res.json({ commission });
});
