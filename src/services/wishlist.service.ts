import { User } from '../models/User';
import { Product, type ProductDoc } from '../models/Product';
import { ApiError } from '../utils/apiError';

/**
 * Returns the caller's populated wishlist, filtered to only currently-published products - a
 * product that's gone back to draft/archived shouldn't show up in the storefront wishlist view,
 * but it's deliberately left in the stored array rather than silently pruned, so it reappears if
 * the admin re-publishes it later (§9).
 */
export async function getWishlist(userId: string): Promise<ProductDoc[]> {
  const user = await User.findById(userId).populate<{ wishlist: ProductDoc[] }>('wishlist');
  if (!user) throw ApiError.notFound('User not found');
  return user.wishlist.filter((product) => product.status === 'published');
}

export async function addToWishlist(userId: string, productId: string): Promise<void> {
  const exists = await Product.exists({ _id: productId });
  if (!exists) throw ApiError.notFound('Product not found');

  await User.updateOne({ _id: userId }, { $addToSet: { wishlist: productId } });
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $pull: { wishlist: productId } });
}
