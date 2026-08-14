import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const COMMISSION_STATUSES = [
  'requested',
  'quoted',
  'deposit_paid',
  'in_production',
  'ready',
  'balance_paid',
  'shipped',
  'declined',
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export interface CommissionQuote {
  price: number;
  productionTimeDays: number;
  quotedBy: Types.ObjectId;
  quotedAt: Date;
  note?: string;
}

export interface CommissionTimelineEntry {
  status: CommissionStatus;
  at: Date;
  note?: string;
}

export interface CommissionAttrs {
  customer?: Types.ObjectId | null;
  contactEmail: string;
  contactPhone?: string;
  description: string;
  referenceImages: string[];
  dimensions?: string;
  colorNotes?: string;
  budgetRange?: string;
  neededBy?: Date;
  status: CommissionStatus;
  quote?: CommissionQuote;
  // Snapshotted from Settings.commissionDepositPercent at quote time, so a later settings change
  // doesn't retroactively alter an already-quoted commission's deposit math.
  depositPercent?: number;
  depositAmount?: number;
  balanceAmount?: number;
  depositOrder?: Types.ObjectId | null;
  balanceOrder?: Types.ObjectId | null;
  declineReason?: string;
  timeline: Types.DocumentArray<CommissionTimelineEntry>;
  createdAt: Date;
  updatedAt: Date;
}

const commissionQuoteSchema = new Schema<CommissionQuote>(
  {
    price: { type: Number, required: true, min: 0 },
    productionTimeDays: { type: Number, required: true, min: 1 },
    quotedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quotedAt: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false },
);

const commissionTimelineSchema = new Schema<CommissionTimelineEntry>(
  {
    status: { type: String, enum: COMMISSION_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false },
);

const commissionSchema = new Schema<CommissionAttrs>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    description: { type: String, required: true },
    referenceImages: { type: [String], default: [] },
    dimensions: { type: String },
    colorNotes: { type: String },
    budgetRange: { type: String },
    neededBy: { type: Date },
    status: { type: String, enum: COMMISSION_STATUSES, default: 'requested', index: true },
    quote: { type: commissionQuoteSchema },
    depositPercent: { type: Number },
    depositAmount: { type: Number },
    balanceAmount: { type: Number },
    depositOrder: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    balanceOrder: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    declineReason: { type: String },
    timeline: {
      type: [commissionTimelineSchema],
      default: () => [{ status: 'requested', at: new Date() }],
    },
  },
  { timestamps: true },
);

commissionSchema.index({ createdAt: -1 });

export type CommissionDoc = HydratedDocument<CommissionAttrs>;

export const Commission = model<CommissionAttrs>('Commission', commissionSchema);
