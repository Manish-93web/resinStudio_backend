import { Collection, type CollectionAttrs, type CollectionDoc } from '../models/Collection';
import { Product, type ProductDoc } from '../models/Product';
import { ApiError } from '../utils/apiError';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  while (await Collection.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

export async function listActive(): Promise<CollectionDoc[]> {
  return Collection.find({ active: true }).sort('order');
}

export async function listForAdmin(): Promise<CollectionDoc[]> {
  return Collection.find().sort('order').populate('products', 'title slug images basePrice');
}

/**
 * A collection's effective catalog is the union of its manually-assigned `products` and whatever
 * currently matches `ruleTag` (§7.3: "assign products manually or via rule e.g. tag=diwali") - a
 * rule-based collection stays current as new matching products are published, without an admin
 * having to remember to re-curate it.
 */
export async function getBySlugWithProducts(
  slug: string,
): Promise<{ collection: CollectionDoc; products: ProductDoc[] }> {
  const collection = await Collection.findOne({ slug, active: true });
  if (!collection) throw ApiError.notFound('Collection not found');

  const orClauses: Record<string, unknown>[] = [];
  if (collection.products.length > 0) orClauses.push({ _id: { $in: collection.products } });
  if (collection.ruleTag) orClauses.push({ tags: collection.ruleTag });

  const products = orClauses.length
    ? await Product.find({ status: 'published', $or: orClauses })
    : [];

  return { collection, products };
}

export async function createCollection(
  input: Omit<CollectionAttrs, 'createdAt' | 'updatedAt'> & { slug?: string },
): Promise<CollectionDoc> {
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  const slug = await ensureUniqueSlug(baseSlug);
  return Collection.create({ ...input, slug });
}

export async function updateCollection(
  id: string,
  input: Partial<CollectionAttrs>,
): Promise<CollectionDoc> {
  const collection = await Collection.findById(id);
  if (!collection) throw ApiError.notFound('Collection not found');

  if (input.slug) input.slug = await ensureUniqueSlug(slugify(input.slug), id);

  Object.assign(collection, input);
  await collection.save();
  return collection;
}

export async function deleteCollection(id: string): Promise<void> {
  const result = await Collection.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Collection not found');
}

export async function reorderCollections(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => Collection.updateOne({ _id: id }, { order: index })),
  );
}
