import { Cart, type CartDoc } from '../models/Cart';
import { Product } from '../models/Product';
import { ApiError } from '../utils/apiError';

interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

export async function getOrCreateCart({ userId, sessionId }: CartIdentity): Promise<CartDoc> {
  if (!userId && !sessionId)
    throw ApiError.badRequest('A user or guest session is required for a cart');

  const filter = userId ? { user: userId } : { sessionId };
  let cart = await Cart.findOne(filter);
  if (!cart) cart = await Cart.create(userId ? { user: userId } : { sessionId });
  return cart;
}

function findVariant(product: InstanceType<typeof Product>, sku: string) {
  return product.variants.find((v) => v.sku === sku);
}

export async function addItem(
  identity: CartIdentity,
  productId: string,
  variantSku: string,
  qty: number,
  customization?: string,
): Promise<CartDoc> {
  const product = await Product.findOne({ _id: productId, status: 'published' });
  if (!product) throw ApiError.notFound('Product not found');

  // Scheduled drops (§6.7) are visible-but-not-purchasable until dropAt - enforced here, not
  // just via the PDP's disabled "Add to cart" button, so a direct API call can't jump the drop.
  if (product.dropAt && product.dropAt.getTime() > Date.now()) {
    throw ApiError.conflict('This item is not available yet', { dropAt: product.dropAt });
  }

  const variant = findVariant(product, variantSku);
  if (!variant) throw ApiError.notFound('Variant not found');

  const cart = await getOrCreateCart(identity);
  // A customized line (e.g. "Name: Priya") is kept as its own cart line rather than merged into
  // an existing plain one for the same product/variant, since the two aren't fungible.
  const existing = cart.items.find(
    (i) =>
      i.product.toString() === productId &&
      i.variantSku === variantSku &&
      i.customization === customization,
  );
  const nextQty = (existing?.qty ?? 0) + qty;

  if (nextQty > variant.stock) {
    throw ApiError.conflict(`Only ${variant.stock} left in stock`, { available: variant.stock });
  }

  if (existing) {
    existing.qty = nextQty;
    existing.priceAtAdd = variant.price;
  } else {
    cart.items.push({
      product: product._id,
      variantSku,
      qty,
      priceAtAdd: variant.price,
      customization,
    });
  }

  // A customer who comes back and touches their cart is no longer "abandoned" - re-arm the
  // abandoned-cart reminder job for next time rather than treating this as already handled.
  cart.abandonedEmailSentAt = null;
  await cart.save();
  return cart;
}

export async function updateItemQty(
  identity: CartIdentity,
  itemId: string,
  qty: number,
): Promise<CartDoc> {
  const cart = await getOrCreateCart(identity);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  if (qty <= 0) {
    cart.items.pull({ _id: itemId });
  } else {
    const product = await Product.findById(item.product);
    const variant = product && findVariant(product, item.variantSku);
    if (variant && qty > variant.stock) {
      throw ApiError.conflict(`Only ${variant.stock} left in stock`, { available: variant.stock });
    }
    item.qty = qty;
  }

  cart.abandonedEmailSentAt = null;
  await cart.save();
  return cart;
}

export async function removeItem(identity: CartIdentity, itemId: string): Promise<CartDoc> {
  const cart = await getOrCreateCart(identity);
  cart.items.pull({ _id: itemId });
  cart.abandonedEmailSentAt = null;
  await cart.save();
  return cart;
}

export async function applyCoupon(identity: CartIdentity, code: string | null): Promise<CartDoc> {
  const cart = await getOrCreateCart(identity);
  cart.couponCode = code ? code.toUpperCase() : null;
  await cart.save();
  return cart;
}

export interface CartLineDetail {
  _id: string;
  productId: string;
  title: string;
  slug: string;
  image: string | null;
  variantSku: string;
  variantLabel: string;
  qty: number;
  priceAtAdd: number;
  currentPrice: number;
  priceChanged: boolean;
  availableStock: number;
  unavailable: boolean;
  customization?: string;
}

export interface CartDetail {
  _id: string;
  items: CartLineDetail[];
  couponCode: string | null;
  subtotal: number;
}

/** Always prices against the product's *current* price, never the stored priceAtAdd — that
 *  field exists only to power a "price changed since you added this" notice (§ merge risk flag). */
export async function getCartDetail(identity: CartIdentity): Promise<CartDetail> {
  const cart = await getOrCreateCart(identity);
  const productIds = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items: CartLineDetail[] = cart.items.map((item) => {
    const product = productById.get(item.product.toString());
    const variant = product && findVariant(product, item.variantSku);
    const variantLabel = variant
      ? [variant.options.color, variant.options.size, variant.options.volume]
          .filter(Boolean)
          .join(' / ')
      : '';

    return {
      _id: item._id.toString(),
      productId: item.product.toString(),
      title: product?.title ?? 'Product no longer available',
      slug: product?.slug ?? '',
      image: product?.images[0]?.url ?? null,
      variantSku: item.variantSku,
      variantLabel,
      qty: item.qty,
      priceAtAdd: item.priceAtAdd,
      currentPrice: variant?.price ?? item.priceAtAdd,
      priceChanged: Boolean(variant && variant.price !== item.priceAtAdd),
      availableStock: variant?.stock ?? 0,
      unavailable: !product || !variant || product.status !== 'published',
      customization: item.customization,
    };
  });

  const subtotal = items
    .filter((i) => !i.unavailable)
    .reduce((sum, i) => sum + i.currentPrice * i.qty, 0);

  return { _id: cart.id, items, couponCode: cart.couponCode ?? null, subtotal };
}

/**
 * Merges a guest cart into the now-logged-in user's cart. Runs server-side inside the login
 * endpoint itself (not client-orchestrated) so a client crash mid-merge can't drop the guest
 * cart. See IMPLEMENTATION_PROMPT.md risk flags: re-price at merge, cap at live stock, drop
 * unavailable items, drop any guest-attached coupon (eligibility is user-specific).
 */
export async function mergeGuestCartIntoUser(
  sessionId: string | undefined,
  userId: string,
): Promise<void> {
  if (!sessionId) return;

  const guestCart = await Cart.findOne({ sessionId });
  if (!guestCart || guestCart.items.length === 0) {
    if (guestCart) await guestCart.deleteOne();
    return;
  }

  const userCart = await getOrCreateCart({ userId });
  const productIds = guestCart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds }, status: 'published' });
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const guestItem of guestCart.items) {
    const product = productById.get(guestItem.product.toString());
    const variant = product && findVariant(product, guestItem.variantSku);
    if (!product || !variant || variant.stock <= 0) continue; // drop discontinued/sold items

    const existing = userCart.items.find(
      (i) =>
        i.product.toString() === guestItem.product.toString() &&
        i.variantSku === guestItem.variantSku &&
        i.customization === guestItem.customization,
    );
    const desiredQty = (existing?.qty ?? 0) + guestItem.qty;
    const cappedQty = Math.min(desiredQty, variant.stock);

    if (existing) {
      existing.qty = cappedQty;
      existing.priceAtAdd = variant.price; // re-price at merge, never trust the guest-session price
    } else {
      userCart.items.push({
        product: product._id,
        variantSku: guestItem.variantSku,
        qty: cappedQty,
        priceAtAdd: variant.price,
        customization: guestItem.customization,
      });
    }
  }

  // Guest-attached coupons are dropped, not carried over — usage limits/eligibility are
  // user-specific and shouldn't be silently honored post-merge.
  userCart.couponCode = null;

  await userCart.save();
  await guestCart.deleteOne();
}
