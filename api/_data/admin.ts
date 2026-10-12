import { query } from "../_db.js";
import {
  listCategories,
  listCollections,
  listCouriers,
  listDeliveryRates,
  listHomepageSections,
  getProductById,
  listProducts,
  listSettings,
  listSizeCharts,
} from "./catalog.js";
import { mapOrder } from "./mappers.js";
import { recentOrders } from "./orders.js";
import { listPreorders } from "./preorders.js";

async function recentOrdersWithItems(limit = 50) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = await query<Record<string, unknown>>(
    `SELECT o.*,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id)
        FROM order_items oi
        WHERE oi.order_id=o.order_id
      ),'[]'::jsonb) AS items,
      (SELECT count(*)::int FROM order_returns r WHERE r.order_id=o.order_id) AS return_count
     FROM orders o
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows.rows.map(mapOrder);
}

export async function dashboard() {
  const [counts,products,top,items,preorders,recent] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT count(*) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Colombo')::date=(now() AT TIME ZONE 'Asia/Colombo')::date)::int AS orders_today,count(*) FILTER(WHERE order_status='pending')::int AS pending,count(*) FILTER(WHERE order_status='confirmed')::int AS confirmed,count(*) FILTER(WHERE order_status='packed')::int AS packed,count(*) FILTER(WHERE order_status='shipped')::int AS shipped,count(*) FILTER(WHERE order_status='delivered')::int AS delivered,count(*) FILTER(WHERE order_status='cancelled')::int AS cancelled,COALESCE(sum(subtotal-COALESCE(discount_amount,0)) FILTER(WHERE order_status='delivered' AND lower(payment_status) IN('paid','verified')),0) AS product_revenue,COALESCE(sum(delivery_fee) FILTER(WHERE order_status='delivered' AND lower(payment_status) IN('paid','verified')),0) AS delivery_collected FROM orders`,
    ),
    query<Record<string, unknown>>(
      `SELECT
        (SELECT count(*)::int FROM products WHERE status='published') AS published,
        (SELECT count(DISTINCT p.id)::int FROM products p JOIN variants v ON v.product_id=p.id WHERE p.status='published' AND v.active=true AND v.stock>0 AND v.stock<=v.low_stock_threshold) AS low_stock,
        COALESCE((SELECT jsonb_agg(row_data ORDER BY (row_data->>'totalStock')::int,row_data->>'name') FROM (
          SELECT jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'thumbnail',COALESCE(p.media->0->>'url',''),'totalStock',sum(v.stock)::int,'lowVariantCount',count(*) FILTER(WHERE v.stock>0 AND v.stock<=v.low_stock_threshold)::int,'preorderEnabled',p.preorder_enabled) row_data
          FROM products p JOIN variants v ON v.product_id=p.id AND v.active=true
          WHERE p.status='published' AND EXISTS(SELECT 1 FROM variants low_v WHERE low_v.product_id=p.id AND low_v.active=true AND low_v.stock>0 AND low_v.stock<=low_v.low_stock_threshold)
          GROUP BY p.id ORDER BY sum(v.stock),p.name LIMIT 10
        ) attention),'[]'::jsonb) AS attention`,
    ),
    query<Record<string, unknown>>(
      `SELECT oi.product_id,oi.product_name AS name,sum(oi.quantity)::int AS quantity,sum(oi.line_total) AS revenue FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.order_status='delivered' AND lower(o.payment_status) IN('paid','verified') GROUP BY oi.product_id,oi.product_name ORDER BY quantity DESC,revenue DESC LIMIT 8`,
    ),
    query<{ count: number }>(
      `SELECT COALESCE(sum(oi.quantity),0)::int AS count FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.order_status='delivered' AND lower(o.payment_status) IN('paid','verified')`,
    ),
    query<Record<string, unknown>>(
      `SELECT count(*) FILTER(WHERE status='new')::int AS new_count,COALESCE(sum(quantity) FILTER(WHERE status='confirmed' AND NULLIF(btrim(batch_id),'') IS NULL),0)::int AS confirmed_count FROM preorders`,
    ),
    recentOrders(10),
  ]),
    row = counts.rows[0] || {},
    productRow = products.rows[0] || {},
    pre = preorders.rows[0] || {};
  return {
    publishedProducts: Number(productRow.published) || 0,
    lowStockProducts: Number(productRow.low_stock) || 0,
    stockAttention: Array.isArray(productRow.attention) ? productRow.attention : [],
    ordersToday: Number(row.orders_today) || 0,
    pending: Number(row.pending) || 0,
    confirmed: Number(row.confirmed) || 0,
    packed: Number(row.packed) || 0,
    shipped: Number(row.shipped) || 0,
    delivered: Number(row.delivered) || 0,
    cancelled: Number(row.cancelled) || 0,
    revenue: Number(row.product_revenue) || 0,
    productRevenue: Number(row.product_revenue) || 0,
    deliveryCollected: Number(row.delivery_collected) || 0,
    itemsSold: Number(items.rows[0]?.count) || 0,
    preorderNew: Number(pre.new_count) || 0,
    preorderConfirmed: Number(pre.confirmed_count) || 0,
    preorderBatchTarget: 5,
    topProducts: top.rows.map((item) => ({
      productId: String(item.product_id || ""),
      name: String(item.name || ""),
      quantity: Number(item.quantity) || 0,
      revenue: Number(item.revenue) || 0,
    })),
    recent,
  };
}

export async function adminBootstrap(section = "/admin") {
  const productEditorId = section.match(/^\/admin\/products\/([^/]+)$/)?.[1],
    isProducts = section === "/admin/products" || section === "/admin/products/new" || Boolean(productEditorId),
    isOrders = section.startsWith("/admin/orders"),
    isPreorders = section.startsWith("/admin/preorders"),
    isDelivery = section.startsWith("/admin/delivery"),
    isSettings = section.startsWith("/admin/settings"),
    isHomepage = section.startsWith("/admin/homepage"),
    isCategories = section.startsWith("/admin/categories"),
    isCollections = section.startsWith("/admin/collections");
  const [
    dashboardData,
    products,
    categories,
    collections,
    sizeCharts,
    homepageSections,
    orders,
    preorders,
    settings,
    couriers,
    deliveryRates,
  ] = await Promise.all([
    section === "/admin" ? dashboard() : Promise.resolve(null),
    productEditorId ? getProductById(productEditorId).then(value => value ? [value] : []) : (isOrders || isPreorders ? listProducts() : Promise.resolve([])),
    isProducts || isCategories || isHomepage ? listCategories() : Promise.resolve([]),
    isProducts || isCollections || isHomepage ? listCollections() : Promise.resolve([]),
    isProducts ? listSizeCharts() : Promise.resolve([]),
    isHomepage ? listHomepageSections() : Promise.resolve([]),
    isOrders ? recentOrdersWithItems(50) : Promise.resolve([]),
    isPreorders ? listPreorders() : Promise.resolve([]),
    isSettings || isDelivery || isOrders ? listSettings() : Promise.resolve([]),
    isDelivery || isOrders ? listCouriers() : Promise.resolve([]),
    isDelivery ? listDeliveryRates() : Promise.resolve([]),
  ]);
  return {
    dashboard: dashboardData,
    products,
    categories,
    collections,
    sizeCharts,
    homepageSections,
    orders,
    preorders,
    settings,
    couriers,
    deliveryRates,
  };
}
