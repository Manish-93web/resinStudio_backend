import { Schema, model, type HydratedDocument } from 'mongoose';

export const BANNER_PLACEMENTS = ['hero', 'promo_strip', 'collection_block'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export interface BannerAttrs {
  title: string;
  image: string;
  link?: string;
  placement: BannerPlacement;
  order: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<BannerAttrs>(
  {
    title: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    link: { type: String, trim: true },
    placement: { type: String, enum: BANNER_PLACEMENTS, required: true, index: true },
    order: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

bannerSchema.index({ placement: 1, order: 1 });

export type BannerDoc = HydratedDocument<BannerAttrs>;

export const Banner = model<BannerAttrs>('Banner', bannerSchema);
