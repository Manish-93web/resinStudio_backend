import { asyncHandler } from '../utils/asyncHandler';
import { createUploadSignature } from '../services/upload.service';
import { ApiError } from '../utils/apiError';

const ADMIN_ROLES = ['staff', 'manager', 'owner'];
const CUSTOMER_ALLOWED_FOLDERS = new Set(['reviews', 'damage-claims', 'commissions']);

export const sign = asyncHandler(async (req, res) => {
  const { folder } = req.query as { folder: string };
  const isAdmin = Boolean(req.user && ADMIN_ROLES.includes(req.user.role));
  if (!isAdmin && !CUSTOMER_ALLOWED_FOLDERS.has(folder)) {
    throw ApiError.forbidden('You are not allowed to upload to this folder');
  }

  const signature = createUploadSignature(`resinstudio/${folder}`);
  res.json(signature);
});
