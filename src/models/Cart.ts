import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface CartItem {
  product: Types.ObjectId;
  variantSku: string;
  qty: number;
  priceAtAdd: number;
  // Free-text customization (e.g. "Name: Priya, Date: 12/08") for finished_art items - carried
  // through to the Order line item at checkout (see order.service.ts#createOrderFromCart).
  customization?: string;
}

export interface CartAttrs {
  user?: Types.ObjectId | null;
  sessionId?: string | null;
  items: Types.DocumentArray<CartItem>;
  couponCode?: string | null;
  // Idempotency marker for the abandoned-cart cron job (jobs/abandonedCart.job.ts) - without this,
  // every cron tick would re-email the same still-abandoned cart. Cleared whenever the cart's
  // items change so a customer who comes back and adds/removes something is eligible again.
  abandonedEmailSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<CartItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantSku: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  priceAtAdd: { type: Number, required: true },
  customization: { type: String },
});

const cartSchema = new Schema<CartAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    sessionId: { type: String, default: null, index: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, default: null },
    abandonedEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CartDoc = HydratedDocument<CartAttrs>;

export const Cart = model<CartAttrs>('Cart', cartSchema);
