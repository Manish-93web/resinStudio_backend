import { Types } from 'mongoose';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Review } from '../models/Review';
import { DamageClaim } from '../models/DamageClaim';
import { Commission } from '../models/Commission';

export const LOW_STOCK_THRESHOLD = 3;

interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

interface TopProduct {
  productId: string;
  title: string;
  revenue: number;
  qty: number;
}

interface TopCategory {
  categoryId: string;
  name: string;
  slug: string;
  revenue: number;
}

interface LowStockItem {
  productId: string;
  title: string;
  slug: string;
  sku: string;
  stock: number;
}

export interface DashboardStats {
  rangeDays: number;
  summary: { revenue: number; orders: number; averageOrderValue: number };
  revenueSeries: RevenuePoint[];
  topProducts: TopProduct[];
  topCategories: TopCategory[];
  lowStock: LowStockItem[];
  needsAttention: {
    newOrders: number;
    pendingReviews: number;
    pendingClaims: number;
    openCommissions: number;
    lowStockCount: number;
  };
}

export async function getDashboardStats(rangeDays: number): Promise<DashboardStats> {
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  // Cancelled and returned orders never resulted in retained revenue, so they're excluded from
  // every revenue-derived figure below - counting them would overstate real sales.
  const revenueMatch = { createdAt: { $gte: since }, status: { $nin: ['cancelled', 'returned'] } };
  // Per-order net revenue = total minus whatever's been refunded against it (a `delivered` order
  // can still carry a partial/full refund, e.g. from a damage claim, without its status changing) -
  // `{$sum: '$refunds.amount'}` sums the Refund subdocuments' amounts for a single order document.
  const netRevenueExpr = { $subtract: ['$total', { $sum: '$refunds.amount' }] };

  const [
    revenueSeriesRaw,
    topProductsRaw,
    topCategoriesRaw,
    lowStockRaw,
    newOrders,
    pendingReviews,
    pendingClaims,
    lowStockCountRaw,
    openCommissions,
  ] = await Promise.all([
    Order.aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: netRevenueExpr },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: revenueMatch },
      { $unwind: '$items' },
      // Commission deposit/balance line items have no catalog product - exclude them here so
      // they don't show up as a phantom "product" in the ranking.
      { $match: { 'items.product': { $ne: null } } },
      {
        $group: {
          _id: '$items.product',
          title: { $first: '$items.title' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
          qty: { $sum: '$items.qty' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: revenueMatch },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: '$productDoc' },
      { $unwind: '$productDoc.category' },
      {
        $group: {
          _id: '$productDoc.category',
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'categoryDoc' },
      },
      { $unwind: '$categoryDoc' },
      { $project: { revenue: 1, name: '$categoryDoc.name', slug: '$categoryDoc.slug' } },
    ]),
    Product.aggregate([
      { $match: { status: 'published' } },
      {
        $addFields: {
          effectiveLowStockThreshold: { $ifNull: ['$lowStockThreshold', LOW_STOCK_THRESHOLD] },
        },
      },
      { $unwind: '$variants' },
      { $match: { $expr: { $lte: ['$variants.stock', '$effectiveLowStockThreshold'] } } },
      { $sort: { 'variants.stock': 1 } },
      { $limit: 10 },
      { $project: { title: 1, slug: 1, sku: '$variants.sku', stock: '$variants.stock' } },
    ]),
    Order.countDocuments({ status: 'placed' }),
    Review.countDocuments({ status: 'pending' }),
    DamageClaim.countDocuments({ status: 'pending' }),
    // Per-product lowStockThreshold override (falls back to LOW_STOCK_THRESHOLD) means this can
    // no longer be a flat countDocuments filter - counts products with *any* variant at/under
    // their own effective threshold.
    Product.aggregate([
      { $match: { status: 'published' } },
      {
        $addFields: {
          effectiveLowStockThreshold: { $ifNull: ['$lowStockThreshold', LOW_STOCK_THRESHOLD] },
        },
      },
      {
        $match: {
          $expr: {
            $anyElementTrue: {
              $map: {
                input: '$variants',
                as: 'v',
                in: { $lte: ['$$v.stock', '$effectiveLowStockThreshold'] },
              },
            },
          },
        },
      },
      { $count: 'count' },
    ]),
    Commission.countDocuments({ status: 'requested' }),
  ]);
  const lowStockCount = (lowStockCountRaw[0]?.count as number | undefined) ?? 0;

  const revenueSeries: RevenuePoint[] = revenueSeriesRaw.map((r) => ({
    date: r._id as string,
    revenue: r.revenue as number,
    orders: r.orders as number,
  }));
  const totalRevenue = revenueSeries.reduce((sum, r) => sum + r.revenue, 0);
  const totalOrders = revenueSeries.reduce((sum, r) => sum + r.orders, 0);

  return {
    rangeDays,
    summary: {
      revenue: totalRevenue,
      orders: totalOrders,
      averageOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    },
    revenueSeries,
    topProducts: topProductsRaw.map((p) => ({
      productId: (p._id as Types.ObjectId)?.toString() ?? '',
      title: p.title as string,
      revenue: p.revenue as number,
      qty: p.qty as number,
    })),
    topCategories: topCategoriesRaw.map((c) => ({
      categoryId: (c._id as Types.ObjectId).toString(),
      name: c.name as string,
      slug: c.slug as string,
      revenue: c.revenue as number,
    })),
    lowStock: lowStockRaw.map((p) => ({
      productId: (p._id as Types.ObjectId).toString(),
      title: p.title as string,
      slug: p.slug as string,
      sku: p.sku as string,
      stock: p.stock as number,
    })),
    needsAttention: { newOrders, pendingReviews, pendingClaims, openCommissions, lowStockCount },
  };
}
