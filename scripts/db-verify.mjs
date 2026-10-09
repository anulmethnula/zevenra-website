import { readdir } from "node:fs/promises";
import process from "node:process";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set DATABASE_URL_UNPOOLED or DATABASE_URL before verification.",
  );
const required = [
  "products",
  "variants",
  "categories",
  "collections",
  "product_collections",
  "size_charts",
  "navigation",
  "homepage_sections",
  "customers",
  "orders",
  "order_items",
  "order_returns",
  "order_return_items",
  "preorders",
  "courier_providers",
  "delivery_rates",
  "courier_rate_cards",
  "courier_rate_import_rows",
  "courier_rates",
  "discount_codes",
  "site_settings",
  "audit_logs",
  "schema_migrations",
];
const pool = new Pool({ connectionString, max: 1 });
try {
  const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    ),
    present = new Set(tables.rows.map((row) => row.tablename)),
    missing = required.filter((table) => !present.has(table));
  if (missing.length) throw new Error(`Missing tables: ${missing.join(", ")}`);
  const checks = {
    orphanVariants:
      "SELECT count(*)::int AS count FROM variants v LEFT JOIN products p ON p.id=v.product_id WHERE p.id IS NULL",
    blankVariantSkus:
      "SELECT count(*)::int AS count FROM variants WHERE btrim(COALESCE(sku,''))=''",
    orphanItems:
      "SELECT count(*)::int AS count FROM order_items i LEFT JOIN orders o ON o.order_id=i.order_id WHERE o.order_id IS NULL",
    orphanProductCollections:
      "SELECT count(*)::int AS count FROM product_collections pc LEFT JOIN products p ON p.id=pc.product_id LEFT JOIN collections c ON c.id=pc.collection_id WHERE p.id IS NULL OR c.id IS NULL",
    publishedProductsMissingShippingWeight:
      "SELECT count(*)::int AS count FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND p.shipping_weight_grams IS NULL AND c.default_shipping_weight_grams IS NULL",
    publishedProductsInactiveCategory:
      "SELECT count(*)::int AS count FROM products p JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND c.active IS NOT TRUE",
    publishedProductsWithoutActiveVariant:
      "SELECT count(*)::int AS count FROM products p WHERE p.status='published' AND NOT EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=true)",
    activePreordersMissingProduct:
      "SELECT count(*)::int AS count FROM preorders pr LEFT JOIN products p ON p.id=pr.product_id WHERE pr.status NOT IN ('cancelled','converted') AND p.id IS NULL",
    activePreordersMissingVariant:
      "SELECT count(*)::int AS count FROM preorders pr LEFT JOIN variants v ON v.id=pr.variant_id WHERE pr.status NOT IN ('cancelled','converted') AND v.id IS NULL",
    activePreorderVariantProductMismatch:
      "SELECT count(*)::int AS count FROM preorders pr JOIN variants v ON v.id=pr.variant_id WHERE pr.status NOT IN ('cancelled','converted') AND pr.product_id IS DISTINCT FROM v.product_id",
    negativeStock: "SELECT count(*)::int AS count FROM variants WHERE stock<0",
    invalidTotals:
      "SELECT count(*)::int AS count FROM orders WHERE subtotal-COALESCE(discount_amount,0)+delivery_fee<>total",
    invalidStockStates:
      "SELECT count(*)::int AS count FROM orders WHERE stock_state NOT IN ('reserved','fulfilled','restored','not_applicable')",
    invalidWeightSnapshots:
      "SELECT count(*)::int AS count FROM orders WHERE (total_product_weight_grams IS NULL) <> (total_shipping_weight_grams IS NULL) OR (total_product_weight_grams IS NOT NULL AND total_shipping_weight_grams < total_product_weight_grams)",
    invalidDeliveryEstimateSnapshots:
      "SELECT count(*)::int AS count FROM orders WHERE (minimum_delivery_days IS NULL) <> (maximum_delivery_days IS NULL) OR (minimum_delivery_days IS NOT NULL AND (minimum_delivery_days <= 0 OR maximum_delivery_days < minimum_delivery_days))",
    excessiveReturns:
      "SELECT count(*)::int AS count FROM (SELECT ri.order_item_id,sum(ri.quantity) qty,oi.quantity purchased FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id JOIN order_returns r ON r.id=ri.return_id WHERE r.status<>'rejected' GROUP BY ri.order_item_id,oi.quantity HAVING sum(ri.quantity)>oi.quantity) invalid",
    orphanReturnItems:
      "SELECT count(*)::int AS count FROM order_return_items ri LEFT JOIN order_returns r ON r.id=ri.return_id LEFT JOIN order_items oi ON oi.id=ri.order_item_id WHERE r.id IS NULL OR oi.id IS NULL",
    orphanCourierRates:
      "SELECT count(*)::int AS count FROM courier_rates r LEFT JOIN courier_rate_cards c ON c.id=r.rate_card_id LEFT JOIN courier_providers p ON p.id=r.courier_provider_id WHERE c.id IS NULL OR p.id IS NULL",
    mismatchedCourierRateProviders:
      "SELECT count(*)::int AS count FROM courier_rates r JOIN courier_rate_cards c ON c.id=r.rate_card_id WHERE r.courier_provider_id<>c.courier_provider_id",
    multipleActiveRateCards:
      "SELECT count(*)::int AS count FROM (SELECT courier_provider_id FROM courier_rate_cards WHERE status='active' GROUP BY courier_provider_id HAVING count(*)>1) invalid",
    packagingWeightMissingOrInvalid:
      "SELECT CASE WHEN EXISTS(SELECT 1 FROM site_settings WHERE key='packagingWeightGrams' AND (value #>> '{}') ~ '^[0-9]+$' AND (value #>> '{}')::int>0) THEN 0 ELSE 1 END::int AS count",
    enabledCheckoutWithoutPaymentMethod:
      "WITH s AS (SELECT key,lower(value #>> '{}') value FROM site_settings) SELECT CASE WHEN COALESCE((SELECT value='true' FROM s WHERE key='ordersEnabled'),true) AND NOT COALESCE((SELECT value='true' FROM s WHERE key='codEnabled'),false) AND NOT COALESCE((SELECT value='true' FROM s WHERE key='bankEnabled'),(SELECT value='true' FROM s WHERE key='bankTransferEnabled'),false) THEN 1 ELSE 0 END::int AS count",
    enabledCheckoutWithoutActiveDefaultCourier:
      "WITH s AS (SELECT key,value #>> '{}' value FROM site_settings), enabled AS (SELECT COALESCE((SELECT lower(value)='true' FROM s WHERE key='ordersEnabled'),true) ok), default_id AS (SELECT COALESCE((SELECT value FROM s WHERE key='defaultCourierProviderId'),'') id) SELECT CASE WHEN (SELECT ok FROM enabled) AND NOT EXISTS(SELECT 1 FROM courier_providers p,default_id d WHERE p.id=d.id AND p.active=true) THEN 1 ELSE 0 END::int AS count",
    activeZoneCourierWithoutFallback:
      "WITH s AS (SELECT value #>> '{}' id FROM site_settings WHERE key='defaultCourierProviderId') SELECT CASE WHEN EXISTS(SELECT 1 FROM courier_providers p JOIN s ON s.id=p.id WHERE p.active=true AND p.pricing_mode='zone') AND (SELECT count(*) FROM delivery_rates r JOIN s ON s.id=r.courier_provider_id WHERE r.active=true AND r.fallback=true)<>1 THEN 1 ELSE 0 END::int AS count",
  };
  for (const [name, sql] of Object.entries(checks)) {
    const count = (await pool.query(sql)).rows[0].count;
    console.log(`${name}: ${count}`);
    if (count) throw new Error(`${name} verification failed`);
  }
  const migrations = await pool.query(
      "SELECT version,applied_at FROM schema_migrations ORDER BY version",
    ),
    applied = new Set(migrations.rows.map((row) => row.version)),
    expected = (await readdir("database/migrations"))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort(),
    missingMigrations = expected.filter((version) => !applied.has(version));
  console.log("migrations:", migrations.rows.map((row) => row.version).join(", "));
  if (missingMigrations.length)
    throw new Error(
      `Database is missing migrations: ${missingMigrations.join(", ")}. Run npm run db:migrate first.`,
    );
  console.log("database verification passed");
} finally {
  await pool.end();
}
