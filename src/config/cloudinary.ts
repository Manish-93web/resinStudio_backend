import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME || undefined,
  api_key: env.CLOUDINARY_API_KEY || undefined,
  api_secret: env.CLOUDINARY_API_SECRET || undefined,
  secure: true,
});

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export { cloudinary };
