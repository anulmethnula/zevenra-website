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
import { recentOrders } from "./orders.js";
import { listPreorders } from "./preorders.js";

export async function dashboard() {
  const counts = await query<Record<string, unknown>>(
    `SELECT count(*) FILTER(WHERE created_at::date=(now() AT TIME ZONE 'Asia/Colombo')::date)::int AS orders_today,count(*) FILTER(WHERE order_status='pending')::int AS pending,count(*) FILTER(WHERE order_status='confirmed')::int AS confirmed,count(*) FILTER(WHERE order_status='packed')::int AS packed,count(*) FILTER(WHERE order_status='shipped')::int AS shipped,count(*) FILTER(WHERE order_status='delivered')::int AS delivered,count(*) FILTER(WHERE order_status='cancelled')::int AS cancelled,COALESCE(sum(subtotal) FILTER(WHERE order_status='delivered' AND payment_status IN('paid','verified')),0) AS product_revenue,COALESCE(sum(delivery_fee) FILTER(WHERE order_status='delivered' AND payment_status IN('paid','verified')),0) AS delivery_collected FROM orders`,
  );
  const top = await query<Record<string, unknown>>(
    `SELECT oi.product_id,oi.product_name AS name,sum(oi.quantity)::int AS quantity,sum(oi.line_total) AS revenue FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.order_status='delivered' AND o.payment_status IN('paid','verified') GROUP BY oi.product_id,oi.product_name ORDER BY quantity DESC,revenue DESC LIMIT 8`,
  );
  const items = await query<{ count: number }>(
      `SELECT COALESCE(sum(oi.quantity),0)::int AS count FROM order_items oi JOIN orders o ON o.order_id=oi.order_id WHERE o.order_status='delivered' AND o.payment_status IN('paid','verified')`,
    ),
    preorders = await query<Record<string, unknown>>(
      `SELECT count(*) FILTER(WHERE status='new')::int AS new_count,COALESCE(sum(quantity) FILTER(WHERE status='confirmed' AND batch_id=''),0)::int AS confirmed_count FROM preorders`,
    ),
    recent = await recentOrders(10),
    row = counts.rows[0] || {},
    pre = preorders.rows[0] || {};
  return {
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
    productEditorId ? getProductById(productEditorId).then(value => value ? [value] : []) : (isOrders || isPreorders || isHomepage ? listProducts() : Promise.resolve([])),
    isProducts || isCategories || isHomepage ? listCategories() : Promise.resolve([]),
    isProducts || isCollections || isHomepage ? listCollections() : Promise.resolve([]),
    isProducts ? listSizeCharts() : Promise.resolve([]),
    isHomepage ? listHomepageSections() : Promise.resolve([]),
    isOrders ? recentOrders(50) : Promise.resolve([]),
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
