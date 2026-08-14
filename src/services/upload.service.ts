import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';
import { ApiError } from '../utils/apiError';

interface UploadSignature {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/**
 * Issues a signature for a signed, direct-to-Cloudinary browser upload rather than proxying the
 * binary through this API instance — the client (admin UI) uploads straight to Cloudinary and
 * only the resulting URL comes back to us. See IMPLEMENTATION_PROMPT.md §7.1/§9.
 */
export function createUploadSignature(folder: string): UploadSignature {
  if (!isCloudinaryConfigured) {
    throw ApiError.internal(
      'Cloudinary is not configured — add CLOUDINARY_* to .env (see ACCOUNT_SETUP.md)',
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    cloudinary.config().api_secret as string,
  );

  return {
    timestamp,
    signature,
    apiKey: cloudinary.config().api_key as string,
    cloudName: cloudinary.config().cloud_name as string,
    folder,
  };
}
