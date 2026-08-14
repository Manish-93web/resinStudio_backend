import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from '../utils/zod';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  googleAuthBodySchema,
  twoFactorVerifyBodySchema,
} from '../schemas/auth.schema';
import {
  createProductBodySchema,
  updateProductBodySchema,
  productQuerySchema,
  slugParamSchema,
  idParamSchema as productIdParamSchema,
  uploadSignatureQuerySchema,
} from '../schemas/product.schema';
import {
  createCategoryBodySchema,
  updateCategoryBodySchema,
  categoryIdParamSchema,
} from '../schemas/category.schema';
import {
  addToCartBodySchema,
  updateCartItemBodySchema,
  applyCouponBodySchema,
  checkoutBodySchema,
  verifyPaymentBodySchema,
  orderStatusUpdateBodySchema,
  cancelOrderBodySchema,
  trackOrderBodySchema,
  createCouponBodySchema,
  updateCouponBodySchema,
  addressBodySchema,
  orderAddressSchema,
  idParamSchema,
  cartItemIdParamSchema,
  addressIdParamSchema,
  refundOrderBodySchema,
  orderListQuerySchema,
} from '../schemas/commerce.schema';
import { wishlistProductParamSchema } from '../schemas/wishlist.schema';
import {
  createReviewBodySchema,
  updateReviewBodySchema,
  moderateReviewBodySchema,
  productIdParamSchema as reviewProductIdParamSchema,
  reviewIdParamSchema,
} from '../schemas/review.schema';
import {
  submitDamageClaimBodySchema,
  resolveDamageClaimBodySchema,
  damageClaimIdParamSchema,
} from '../schemas/damageClaim.schema';
import { updateSettingsBodySchema } from '../schemas/settings.schema';
import {
  createStaffBodySchema,
  updateStaffBodySchema,
  staffIdParamSchema,
} from '../schemas/staff.schema';
import { contactBodySchema } from '../schemas/contact.schema';
import {
  createCommissionBodySchema,
  quoteCommissionBodySchema,
  declineCommissionBodySchema,
  commissionStatusUpdateBodySchema,
  payCommissionBodySchema,
  commissionIdParamSchema,
} from '../schemas/commission.schema';
import {
  purchaseGiftCardBodySchema,
  issueGiftCardBodySchema,
  giftCardCodeParamSchema,
} from '../schemas/giftCard.schema';
import {
  createBannerBodySchema,
  updateBannerBodySchema,
  reorderBannersBodySchema,
  bannerIdParamSchema,
  bannerQuerySchema,
} from '../schemas/banner.schema';
import {
  createCollectionBodySchema,
  updateCollectionBodySchema,
  reorderCollectionsBodySchema,
  collectionIdParamSchema,
  collectionSlugParamSchema,
} from '../schemas/collection.schema';
import {
  createBlogPostBodySchema,
  updateBlogPostBodySchema,
  blogPostIdParamSchema,
  blogPostSlugParamSchema,
  blogPostQuerySchema,
} from '../schemas/blogPost.schema';
import { joinWaitlistBodySchema } from '../schemas/waitlist.schema';
import { subscribeNewsletterBodySchema } from '../schemas/newsletter.schema';
import {
  importProductsCsvBodySchema,
  bulkUpdatePriceBodySchema,
  bulkAssignCategoryBodySchema,
  bulkSetStatusBodySchema,
} from '../schemas/productBulk.schema';
import {
  registerPushTokenBodySchema,
  unregisterPushTokenBodySchema,
} from '../schemas/pushToken.schema';

export const registry = new OpenAPIRegistry();

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Register a new customer account',
  request: { body: { content: { 'application/json': { schema: registerBodySchema } } } },
  responses: { 201: { description: 'Account created, session issued' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Log in with email and password',
  request: { body: { content: { 'application/json': { schema: loginBodySchema } } } },
  responses: {
    200: { description: 'Session issued' },
    401: { description: 'Invalid credentials, or two-factor code required' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Exchange a refresh token for a new access token (rotates the refresh token)',
  responses: { 200: { description: 'New session issued' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke the current refresh token',
  responses: { 204: { description: 'Logged out' } },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  summary: 'Get the current authenticated user',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Current user' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/forgot-password',
  tags: ['Auth'],
  summary: 'Request a password reset email',
  request: { body: { content: { 'application/json': { schema: forgotPasswordBodySchema } } } },
  responses: { 200: { description: 'Reset email sent (if the account exists)' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/reset-password',
  tags: ['Auth'],
  summary: 'Reset password using a reset token',
  request: { body: { content: { 'application/json': { schema: resetPasswordBodySchema } } } },
  responses: { 200: { description: 'Password updated' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/google',
  tags: ['Auth'],
  summary: 'Log in or register via a Google ID token',
  request: { body: { content: { 'application/json': { schema: googleAuthBodySchema } } } },
  responses: { 200: { description: 'Session issued' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/2fa/setup',
  tags: ['Auth'],
  summary: 'Begin TOTP 2FA setup — returns a secret + QR code to scan',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Secret and QR code data URL' },
    409: { description: 'Already enabled' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/2fa/verify',
  tags: ['Auth'],
  summary: 'Confirm a 2FA setup with a code from the authenticator app, enabling it',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: twoFactorVerifyBodySchema } } } },
  responses: { 200: { description: '2FA enabled' }, 400: { description: 'Invalid code' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/2fa/disable',
  tags: ['Auth'],
  summary: 'Disable 2FA (requires a current code)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: twoFactorVerifyBodySchema } } } },
  responses: { 200: { description: '2FA disabled' }, 400: { description: 'Invalid code' } },
});

registry.registerPath({
  method: 'get',
  path: '/products',
  tags: ['Products'],
  summary: 'List products (filters, pagination, sort, text search)',
  request: { query: productQuerySchema },
  responses: { 200: { description: 'Paginated product list' } },
});

registry.registerPath({
  method: 'get',
  path: '/products/id/{id}',
  tags: ['Products'],
  summary: 'Get a product by id, any status [staff/manager/owner see drafts too]',
  security: [{ bearerAuth: [] }],
  request: { params: productIdParamSchema },
  responses: { 200: { description: 'Product' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'get',
  path: '/products/{slug}',
  tags: ['Products'],
  summary: 'Get a published product by slug',
  request: { params: slugParamSchema },
  responses: { 200: { description: 'Product' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'post',
  path: '/products',
  tags: ['Products'],
  summary: 'Create a product [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createProductBodySchema } } } },
  responses: {
    201: { description: 'Product created' },
    403: { description: 'Insufficient permissions' },
  },
});

registry.registerPath({
  method: 'put',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Update a product [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: { content: { 'application/json': { schema: updateProductBodySchema } } },
  },
  responses: { 200: { description: 'Product updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/products/{id}',
  tags: ['Products'],
  summary: 'Delete a product [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: productIdParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'get',
  path: '/categories',
  tags: ['Categories'],
  summary: 'List all categories',
  responses: { 200: { description: 'Category list' } },
});

registry.registerPath({
  method: 'post',
  path: '/categories',
  tags: ['Categories'],
  summary: 'Create a category [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCategoryBodySchema } } } },
  responses: { 201: { description: 'Category created' } },
});

registry.registerPath({
  method: 'put',
  path: '/categories/{id}',
  tags: ['Categories'],
  summary: 'Update a category [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: categoryIdParamSchema,
    body: { content: { 'application/json': { schema: updateCategoryBodySchema } } },
  },
  responses: { 200: { description: 'Category updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/categories/{id}',
  tags: ['Categories'],
  summary: 'Delete a category [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: categoryIdParamSchema },
  responses: { 204: { description: 'Deleted' }, 409: { description: 'Has subcategories' } },
});

registry.registerPath({
  method: 'get',
  path: '/uploads/sign',
  tags: ['Uploads'],
  summary: 'Get a signed Cloudinary upload signature [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { query: uploadSignatureQuerySchema },
  responses: { 200: { description: 'Upload signature' } },
});

registry.registerPath({
  method: 'get',
  path: '/cart',
  tags: ['Cart'],
  summary: 'Get the current cart (guest via X-Session-Id header, or authenticated user)',
  responses: { 200: { description: 'Cart detail' } },
});

registry.registerPath({
  method: 'post',
  path: '/cart/items',
  tags: ['Cart'],
  summary: 'Add an item to the cart',
  request: { body: { content: { 'application/json': { schema: addToCartBodySchema } } } },
  responses: { 201: { description: 'Updated cart' }, 409: { description: 'Not enough stock' } },
});

registry.registerPath({
  method: 'put',
  path: '/cart/items/{itemId}',
  tags: ['Cart'],
  summary: 'Update a cart item quantity (0 removes it)',
  request: {
    params: cartItemIdParamSchema,
    body: { content: { 'application/json': { schema: updateCartItemBodySchema } } },
  },
  responses: { 200: { description: 'Updated cart' } },
});

registry.registerPath({
  method: 'delete',
  path: '/cart/items/{itemId}',
  tags: ['Cart'],
  summary: 'Remove an item from the cart',
  request: { params: cartItemIdParamSchema },
  responses: { 200: { description: 'Updated cart' } },
});

registry.registerPath({
  method: 'post',
  path: '/cart/coupon',
  tags: ['Cart'],
  summary: 'Apply or clear a coupon code on the cart',
  request: { body: { content: { 'application/json': { schema: applyCouponBodySchema } } } },
  responses: { 200: { description: 'Updated cart' } },
});

registry.registerPath({
  method: 'post',
  path: '/orders',
  tags: ['Orders'],
  summary: 'Checkout via Cash on Delivery (Razorpay uses /payments/razorpay/create-order + verify)',
  request: { body: { content: { 'application/json': { schema: checkoutBodySchema } } } },
  responses: {
    201: { description: 'Order created' },
    409: { description: 'One or more items sold out during checkout' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/orders/track',
  tags: ['Orders'],
  summary: 'Guest order tracking by order number + email/phone',
  request: { body: { content: { 'application/json': { schema: trackOrderBodySchema } } } },
  responses: { 200: { description: 'Order' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'get',
  path: '/orders/mine',
  tags: ['Orders'],
  summary: "List the current user's orders",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Paginated order list' } },
});

registry.registerPath({
  method: 'get',
  path: '/orders',
  tags: ['Orders'],
  summary: 'List all orders, with date/payment-method/text filters [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { query: orderListQuerySchema },
  responses: { 200: { description: 'Paginated order list' } },
});

registry.registerPath({
  method: 'get',
  path: '/orders/{id}',
  tags: ['Orders'],
  summary: 'Get an order by id (owner or admin only)',
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Order' }, 403: { description: 'Not your order' } },
});

registry.registerPath({
  method: 'put',
  path: '/orders/{id}/status',
  tags: ['Orders'],
  summary: 'Update order status [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: orderStatusUpdateBodySchema } } },
  },
  responses: { 200: { description: 'Updated order' } },
});

registry.registerPath({
  method: 'post',
  path: '/orders/{id}/cancel',
  tags: ['Orders'],
  summary: 'Self-service order cancellation (only while placed/confirmed)',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: cancelOrderBodySchema } } },
  },
  responses: {
    200: { description: 'Cancelled order' },
    409: { description: 'Already packed — cannot cancel' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/orders/{id}/refund',
  tags: ['Orders'],
  summary:
    'Refund an order (razorpay/stripe only — cod/gift_card require manual handling) [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: refundOrderBodySchema } } },
  },
  responses: {
    200: { description: 'Refunded order' },
    400: { description: 'Nothing refundable, or unsupported payment method' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/account/wishlist',
  tags: ['Wishlist'],
  summary: "Get the current user's wishlist (populated, published products only)",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Wishlist products' } },
});

registry.registerPath({
  method: 'post',
  path: '/account/wishlist/{productId}',
  tags: ['Wishlist'],
  summary: 'Add a product to the wishlist (idempotent)',
  security: [{ bearerAuth: [] }],
  request: { params: wishlistProductParamSchema },
  responses: {
    200: { description: 'Updated wishlist' },
    404: { description: 'Product not found' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/account/wishlist/{productId}',
  tags: ['Wishlist'],
  summary: 'Remove a product from the wishlist',
  security: [{ bearerAuth: [] }],
  request: { params: wishlistProductParamSchema },
  responses: { 200: { description: 'Updated wishlist' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/customers',
  tags: ['Admin'],
  summary: 'List customers [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated customer list' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/customers/{id}',
  tags: ['Admin'],
  summary: 'Get a customer with order history and lifetime value [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Customer detail' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/customers/{id}/active',
  tags: ['Admin'],
  summary: 'Enable/disable a customer account [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: z.object({ isActive: z.boolean() }) } } },
  },
  responses: { 200: { description: 'Updated user' } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/customers/{id}',
  tags: ['Admin'],
  summary: "Update a customer's active/wholesale-approved status and admin notes [manager/owner]",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            isActive: z.boolean().optional(),
            wholesaleApproved: z.boolean().optional(),
            notes: z.string().trim().max(5000).optional(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: 'Updated user' } },
});

registry.registerPath({
  method: 'post',
  path: '/payments/razorpay/create-order',
  tags: ['Payments'],
  summary: 'Create a Razorpay order for the current cart',
  request: {
    body: {
      content: { 'application/json': { schema: checkoutBodySchema.omit({ paymentMethod: true }) } },
    },
  },
  responses: { 200: { description: 'Razorpay order details for Checkout.js' } },
});

registry.registerPath({
  method: 'post',
  path: '/payments/razorpay/verify',
  tags: ['Payments'],
  summary: 'Verify a completed Razorpay payment and fulfill the order',
  request: { body: { content: { 'application/json': { schema: verifyPaymentBodySchema } } } },
  responses: {
    200: { description: 'Order placed' },
    409: { description: 'Sold out — payment refunded' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/payments/stripe/create-intent',
  tags: ['Payments'],
  summary: 'Create a Stripe PaymentIntent for the current cart (international/non-INR checkout)',
  request: {
    body: {
      content: { 'application/json': { schema: checkoutBodySchema.omit({ paymentMethod: true }) } },
    },
  },
  responses: { 200: { description: 'Stripe PaymentIntent client secret' } },
});

registry.registerPath({
  method: 'post',
  path: '/payments/stripe/webhook',
  tags: ['Payments'],
  summary: 'Stripe webhook (payment_intent.succeeded fulfills the order)',
  responses: { 200: { description: 'Received' } },
});

registry.registerPath({
  method: 'post',
  path: '/coupons/validate',
  tags: ['Coupons'],
  summary: 'Validate a coupon code against the current cart',
  responses: {
    200: { description: 'Discount amount' },
    400: { description: 'Invalid/ineligible coupon' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/coupons',
  tags: ['Coupons'],
  summary: 'List coupons [manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Coupon list' } },
});

registry.registerPath({
  method: 'post',
  path: '/coupons',
  tags: ['Coupons'],
  summary: 'Create a coupon [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCouponBodySchema } } } },
  responses: { 201: { description: 'Coupon created' } },
});

registry.registerPath({
  method: 'put',
  path: '/coupons/{id}',
  tags: ['Coupons'],
  summary: 'Update a coupon [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateCouponBodySchema } } },
  },
  responses: { 200: { description: 'Coupon updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/coupons/{id}',
  tags: ['Coupons'],
  summary: 'Delete a coupon [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'get',
  path: '/account/addresses',
  tags: ['Addresses'],
  summary: "List the current user's saved addresses",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Address list' } },
});

registry.registerPath({
  method: 'post',
  path: '/account/addresses',
  tags: ['Addresses'],
  summary: 'Add a new address',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: addressBodySchema } } } },
  responses: { 201: { description: 'Updated address list' } },
});

registry.registerPath({
  method: 'put',
  path: '/account/addresses/{addressId}',
  tags: ['Addresses'],
  summary: 'Update a saved address',
  security: [{ bearerAuth: [] }],
  request: {
    params: addressIdParamSchema,
    body: { content: { 'application/json': { schema: addressBodySchema.partial() } } },
  },
  responses: { 200: { description: 'Updated address list' } },
});

registry.registerPath({
  method: 'delete',
  path: '/account/addresses/{addressId}',
  tags: ['Addresses'],
  summary: 'Delete a saved address',
  security: [{ bearerAuth: [] }],
  request: { params: addressIdParamSchema },
  responses: { 200: { description: 'Updated address list' } },
});

registry.registerPath({
  method: 'put',
  path: '/orders/{id}/shipping-address',
  tags: ['Orders'],
  summary: 'Self-service shipping address edit (only while placed/confirmed)',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: orderAddressSchema } } },
  },
  responses: { 200: { description: 'Updated order' } },
});

registry.registerPath({
  method: 'get',
  path: '/products/{productId}/reviews',
  tags: ['Reviews'],
  summary: 'List approved reviews for a product',
  request: { params: reviewProductIdParamSchema },
  responses: { 200: { description: 'Paginated review list' } },
});

registry.registerPath({
  method: 'post',
  path: '/products/{productId}/reviews',
  tags: ['Reviews'],
  summary: 'Submit a review for a product',
  security: [{ bearerAuth: [] }],
  request: {
    params: reviewProductIdParamSchema,
    body: { content: { 'application/json': { schema: createReviewBodySchema } } },
  },
  responses: {
    201: { description: 'Review created, pending moderation' },
    409: { description: 'Already reviewed' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/products/{productId}/reviews/mine',
  tags: ['Reviews'],
  summary: "Get the current user's own review for a product, if any",
  security: [{ bearerAuth: [] }],
  request: { params: reviewProductIdParamSchema },
  responses: { 200: { description: 'Own review, or null' } },
});

registry.registerPath({
  method: 'get',
  path: '/reviews/gallery',
  tags: ['Reviews'],
  summary: 'Site-wide UGC gallery: flattened images from approved reviews across all products',
  request: { query: z.object({ limit: z.coerce.number().optional() }) },
  responses: { 200: { description: 'Gallery images' } },
});

registry.registerPath({
  method: 'get',
  path: '/reviews/testimonials',
  tags: ['Reviews'],
  summary: 'Site-wide homepage testimonials: highly-rated approved reviews across all products',
  request: { query: z.object({ limit: z.coerce.number().optional() }) },
  responses: { 200: { description: 'Testimonials' } },
});

registry.registerPath({
  method: 'get',
  path: '/reviews',
  tags: ['Reviews'],
  summary: 'List all reviews for moderation [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated review list' } },
});

registry.registerPath({
  method: 'put',
  path: '/reviews/{id}',
  tags: ['Reviews'],
  summary: 'Edit your own review (re-queues it for moderation)',
  security: [{ bearerAuth: [] }],
  request: {
    params: reviewIdParamSchema,
    body: { content: { 'application/json': { schema: updateReviewBodySchema } } },
  },
  responses: { 200: { description: 'Updated review' } },
});

registry.registerPath({
  method: 'delete',
  path: '/reviews/{id}',
  tags: ['Reviews'],
  summary: 'Delete your own review, or any review [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: reviewIdParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'put',
  path: '/reviews/{id}/moderate',
  tags: ['Reviews'],
  summary: 'Approve/reject a review, optionally with a store reply [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: reviewIdParamSchema,
    body: { content: { 'application/json': { schema: moderateReviewBodySchema } } },
  },
  responses: { 200: { description: 'Moderated review' } },
});

registry.registerPath({
  method: 'post',
  path: '/orders/{id}/damage-claims',
  tags: ['DamageClaims'],
  summary: 'Report shipping damage on a delivered order item (within the claim window)',
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: submitDamageClaimBodySchema } } },
  },
  responses: {
    201: { description: 'Claim submitted' },
    409: { description: 'Outside claim window or already claimed' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/orders/{id}/damage-claims',
  tags: ['DamageClaims'],
  summary: 'List damage claims filed against an order (owner only)',
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Claim list' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/damage-claims',
  tags: ['DamageClaims'],
  summary: 'List damage claims for the admin queue [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.enum(['pending', 'approved_replacement', 'approved_refund', 'rejected']).optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated claim list' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/damage-claims/{id}/resolve',
  tags: ['DamageClaims'],
  summary: 'Approve (replacement/refund) or reject a damage claim [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: damageClaimIdParamSchema,
    body: { content: { 'application/json': { schema: resolveDamageClaimBodySchema } } },
  },
  responses: { 200: { description: 'Resolved claim' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Get store settings [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Settings' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Update store settings [owner only]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: updateSettingsBodySchema } } } },
  responses: { 200: { description: 'Updated settings' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/dashboard/stats',
  tags: ['Admin'],
  summary: 'Sales/analytics dashboard stats [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ days: z.coerce.number().optional() }) },
  responses: { 200: { description: 'Dashboard stats' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/staff',
  tags: ['Admin'],
  summary: 'List staff/manager/owner accounts [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Staff list' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/staff',
  tags: ['Admin'],
  summary: 'Create a staff/manager/owner account [owner only]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createStaffBodySchema } } } },
  responses: { 201: { description: 'Account created' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/staff/{id}',
  tags: ['Admin'],
  summary: "Update a staff account's role/active status [owner only]",
  security: [{ bearerAuth: [] }],
  request: {
    params: staffIdParamSchema,
    body: { content: { 'application/json': { schema: updateStaffBodySchema } } },
  },
  responses: { 200: { description: 'Updated account' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/activity',
  tags: ['Admin'],
  summary: 'Activity log [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() }),
  },
  responses: { 200: { description: 'Paginated activity log' } },
});

registry.registerPath({
  method: 'get',
  path: '/settings/public',
  tags: ['Settings'],
  summary: 'Public store info (name, support contact, GSTIN) for invoices/contact pages',
  responses: { 200: { description: 'Public settings subset' } },
});

registry.registerPath({
  method: 'post',
  path: '/contact',
  tags: ['Contact'],
  summary: 'Submit the public contact form',
  request: { body: { content: { 'application/json': { schema: contactBodySchema } } } },
  responses: { 200: { description: 'Message sent' } },
});

registry.registerPath({
  method: 'post',
  path: '/commissions',
  tags: ['Commissions'],
  summary: 'Submit a custom-order (commission) request',
  request: { body: { content: { 'application/json': { schema: createCommissionBodySchema } } } },
  responses: { 201: { description: 'Commission request created' } },
});

registry.registerPath({
  method: 'get',
  path: '/commissions/mine',
  tags: ['Commissions'],
  summary: "List the current user's commission requests",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Commission list' } },
});

registry.registerPath({
  method: 'get',
  path: '/commissions/{id}',
  tags: ['Commissions'],
  summary: 'Get a commission owned by the current user',
  security: [{ bearerAuth: [] }],
  request: { params: commissionIdParamSchema },
  responses: { 200: { description: 'Commission' } },
});

registry.registerPath({
  method: 'post',
  path: '/commissions/{id}/deposit',
  tags: ['Commissions'],
  summary: 'Accept a quote and pay the deposit, starting production',
  security: [{ bearerAuth: [] }],
  request: {
    params: commissionIdParamSchema,
    body: { content: { 'application/json': { schema: payCommissionBodySchema } } },
  },
  responses: { 201: { description: 'Deposit order created' } },
});

registry.registerPath({
  method: 'post',
  path: '/commissions/{id}/balance',
  tags: ['Commissions'],
  summary: 'Pay the remaining balance once the commission is ready',
  security: [{ bearerAuth: [] }],
  request: {
    params: commissionIdParamSchema,
    body: { content: { 'application/json': { schema: payCommissionBodySchema } } },
  },
  responses: { 201: { description: 'Balance order created' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/commissions',
  tags: ['Commissions'],
  summary: 'List commissions for the admin queue [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.string().optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated commission list' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/commissions/{id}',
  tags: ['Commissions'],
  summary: 'Get any commission [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: commissionIdParamSchema },
  responses: { 200: { description: 'Commission' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/commissions/{id}/quote',
  tags: ['Commissions'],
  summary: 'Send a price/production-time quote [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: commissionIdParamSchema,
    body: { content: { 'application/json': { schema: quoteCommissionBodySchema } } },
  },
  responses: { 200: { description: 'Quoted commission' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/commissions/{id}/decline',
  tags: ['Commissions'],
  summary: 'Decline a commission request [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: commissionIdParamSchema,
    body: { content: { 'application/json': { schema: declineCommissionBodySchema } } },
  },
  responses: { 200: { description: 'Declined commission' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/commissions/{id}/status',
  tags: ['Commissions'],
  summary: 'Advance production status (in_production/ready) [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: commissionIdParamSchema,
    body: { content: { 'application/json': { schema: commissionStatusUpdateBodySchema } } },
  },
  responses: { 200: { description: 'Updated commission' } },
});

registry.registerPath({
  method: 'post',
  path: '/gift-cards/purchase',
  tags: ['GiftCards'],
  summary: 'Purchase a gift card (COD, fulfilled instantly by email)',
  request: { body: { content: { 'application/json': { schema: purchaseGiftCardBodySchema } } } },
  responses: { 201: { description: 'Gift card issued' } },
});

registry.registerPath({
  method: 'get',
  path: '/gift-cards/{code}/balance',
  tags: ['GiftCards'],
  summary: 'Check a gift card balance before applying it at checkout',
  request: { params: giftCardCodeParamSchema },
  responses: { 200: { description: 'Balance' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/gift-cards',
  tags: ['GiftCards'],
  summary: 'List/search gift cards [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ search: z.string().optional() }) },
  responses: { 200: { description: 'Gift card list' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/gift-cards',
  tags: ['GiftCards'],
  summary: 'Manually issue a gift card / store credit [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: issueGiftCardBodySchema } } } },
  responses: { 201: { description: 'Gift card issued' } },
});

// --- Banners ---

registry.registerPath({
  method: 'get',
  path: '/banners',
  tags: ['Banners'],
  summary: 'List active banners for a placement',
  request: { query: bannerQuerySchema },
  responses: { 200: { description: 'Banner list' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/banners',
  tags: ['Banners'],
  summary: 'List all banners [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Banner list' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/banners',
  tags: ['Banners'],
  summary: 'Create a banner [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createBannerBodySchema } } } },
  responses: { 201: { description: 'Banner created' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/banners/reorder',
  tags: ['Banners'],
  summary: 'Bulk-reorder banners (drag-reorder) [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: reorderBannersBodySchema } } } },
  responses: { 200: { description: 'Reordered' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/banners/{id}',
  tags: ['Banners'],
  summary: 'Update a banner [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: bannerIdParamSchema,
    body: { content: { 'application/json': { schema: updateBannerBodySchema } } },
  },
  responses: { 200: { description: 'Banner updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/banners/{id}',
  tags: ['Banners'],
  summary: 'Delete a banner [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: bannerIdParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

// --- Collections ---

registry.registerPath({
  method: 'get',
  path: '/collections',
  tags: ['Collections'],
  summary: 'List active curated collections',
  responses: { 200: { description: 'Collection list' } },
});

registry.registerPath({
  method: 'get',
  path: '/collections/{slug}',
  tags: ['Collections'],
  summary: 'Get a collection with its effective product list (manual + rule-matched)',
  request: { params: collectionSlugParamSchema },
  responses: { 200: { description: 'Collection + products' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/collections',
  tags: ['Collections'],
  summary: 'List all collections [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Collection list' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/collections',
  tags: ['Collections'],
  summary: 'Create a collection [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCollectionBodySchema } } } },
  responses: { 201: { description: 'Collection created' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/collections/reorder',
  tags: ['Collections'],
  summary: 'Bulk-reorder collections [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: reorderCollectionsBodySchema } } } },
  responses: { 200: { description: 'Reordered' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/collections/{id}',
  tags: ['Collections'],
  summary: 'Update a collection [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: collectionIdParamSchema,
    body: { content: { 'application/json': { schema: updateCollectionBodySchema } } },
  },
  responses: { 200: { description: 'Collection updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/collections/{id}',
  tags: ['Collections'],
  summary: 'Delete a collection [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: collectionIdParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

// --- Blog ---

registry.registerPath({
  method: 'get',
  path: '/blog',
  tags: ['Blog'],
  summary: 'List published blog posts',
  request: { query: blogPostQuerySchema },
  responses: { 200: { description: 'Blog post list' } },
});

registry.registerPath({
  method: 'get',
  path: '/blog/{slug}',
  tags: ['Blog'],
  summary: 'Get a blog post with its linked products',
  request: { params: blogPostSlugParamSchema },
  responses: { 200: { description: 'Blog post' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/blog',
  tags: ['Blog'],
  summary: 'List all blog posts incl. drafts [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Blog post list' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/blog/{id}',
  tags: ['Blog'],
  summary:
    'Get a blog post by id incl. drafts, with linked products populated [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: blogPostIdParamSchema },
  responses: { 200: { description: 'Blog post' }, 404: { description: 'Not found' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/blog',
  tags: ['Blog'],
  summary: 'Create a blog post [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createBlogPostBodySchema } } } },
  responses: { 201: { description: 'Blog post created' } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/blog/{id}',
  tags: ['Blog'],
  summary: 'Update a blog post [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: {
    params: blogPostIdParamSchema,
    body: { content: { 'application/json': { schema: updateBlogPostBodySchema } } },
  },
  responses: { 200: { description: 'Blog post updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/blog/{id}',
  tags: ['Blog'],
  summary: 'Delete a blog post [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { params: blogPostIdParamSchema },
  responses: { 204: { description: 'Deleted' } },
});

// --- Waitlist / Newsletter ---

registry.registerPath({
  method: 'post',
  path: '/waitlist',
  tags: ['Waitlist'],
  summary: 'Join a back-in-stock or drop-notify waitlist for a product',
  request: { body: { content: { 'application/json': { schema: joinWaitlistBodySchema } } } },
  responses: { 201: { description: 'Joined' } },
});

registry.registerPath({
  method: 'post',
  path: '/newsletter/subscribe',
  tags: ['Newsletter'],
  summary: 'Subscribe an email to the newsletter',
  request: { body: { content: { 'application/json': { schema: subscribeNewsletterBodySchema } } } },
  responses: { 201: { description: 'Subscribed' } },
});

// --- Bulk product CSV / feeds ---

registry.registerPath({
  method: 'get',
  path: '/admin/products/export.csv',
  tags: ['ProductBulk'],
  summary: 'Export all products as CSV (one row per variant) [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'CSV file' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/products/import',
  tags: ['ProductBulk'],
  summary: 'Bulk-import products from CSV, upserted by slug [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: importProductsCsvBodySchema } } } },
  responses: { 200: { description: 'Import result' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/products/bulk/price',
  tags: ['ProductBulk'],
  summary: 'Bulk price update [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: bulkUpdatePriceBodySchema } } } },
  responses: { 200: { description: 'Modified count' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/products/bulk/category',
  tags: ['ProductBulk'],
  summary: 'Bulk category assignment [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: bulkAssignCategoryBodySchema } } } },
  responses: { 200: { description: 'Modified count' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/products/bulk/status',
  tags: ['ProductBulk'],
  summary: 'Bulk publish/unpublish/archive [manager/owner]',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: bulkSetStatusBodySchema } } } },
  responses: { 200: { description: 'Modified count' } },
});

registry.registerPath({
  method: 'get',
  path: '/orders/export.csv',
  tags: ['ProductBulk'],
  summary: 'Export all orders as CSV for accounting/GST filing [staff/manager/owner]',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'CSV file' } },
});

registry.registerPath({
  method: 'get',
  path: '/feeds/google-merchant.xml',
  tags: ['Feeds'],
  summary: 'Google Merchant Center product feed (RSS 2.0 + g: namespace)',
  responses: { 200: { description: 'XML feed' } },
});

registry.registerPath({
  method: 'get',
  path: '/feeds/meta.csv',
  tags: ['Feeds'],
  summary: 'Meta (Facebook/Instagram Shop) catalog feed',
  responses: { 200: { description: 'CSV feed' } },
});

// --- Push notifications (mobile) ---

registry.registerPath({
  method: 'post',
  path: '/account/push-token',
  tags: ['Push'],
  summary: 'Register this device for push notifications',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: registerPushTokenBodySchema } } } },
  responses: { 204: { description: 'Registered' } },
});

registry.registerPath({
  method: 'delete',
  path: '/account/push-token',
  tags: ['Push'],
  summary: 'Unregister this device from push notifications (e.g. on logout)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: unregisterPushTokenBodySchema } } } },
  responses: { 204: { description: 'Unregistered' } },
});

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Resin by Richa API',
      version: '0.1.0',
      description:
        'REST API for the Resin by Richa storefront, admin portal, and mobile app. See IMPLEMENTATION_PROMPT.md for the full functional spec.',
    },
    servers: [{ url: '/api' }],
  });
}
