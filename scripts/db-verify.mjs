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
  "delivery_methods",
  "delivery_area_groups",
  "delivery_area_locations",
  "delivery_district_defaults",
  "pickup_locations",
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
    duplicateNonblankVariantSkus:
      "SELECT count(*)::int AS count FROM (SELECT sku FROM variants WHERE btrim(COALESCE(sku,''))<>'' GROUP BY sku HAVING count(*)>1) invalid",
    invalidCategoryHierarchy:
      "SELECT count(*)::int AS count FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id WHERE c.parent_id=c.id OR (c.parent_id IS NOT NULL AND parent.parent_id IS NOT NULL)",
    orphanItems:
      "SELECT count(*)::int AS count FROM order_items i LEFT JOIN orders o ON o.order_id=i.order_id WHERE o.order_id IS NULL",
    liveOrderItemsMissingVariantReference:
      "SELECT count(*)::int AS count FROM order_items i JOIN orders o ON o.order_id=i.order_id WHERE o.order_status<>'cancelled' AND i.is_preorder=false AND (i.variant_id IS NULL OR NOT EXISTS(SELECT 1 FROM variants v WHERE v.id=i.variant_id))",
    orphanProductCollections:
      "SELECT count(*)::int AS count FROM product_collections pc LEFT JOIN products p ON p.id=pc.product_id LEFT JOIN collections c ON c.id=pc.collection_id WHERE p.id IS NULL OR c.id IS NULL",
    invalidConfiguredShippingWeights:
      "SELECT (SELECT count(*) FROM products WHERE shipping_weight_grams IS NOT NULL AND shipping_weight_grams<=0)+(SELECT count(*) FROM categories WHERE default_shipping_weight_grams IS NOT NULL AND default_shipping_weight_grams<=0) AS count",
    publishedProductsInactiveCategory:
      "SELECT count(*)::int AS count FROM products p JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND c.active IS NOT TRUE",
    publishedProductsWithoutActiveVariant:
      "SELECT count(*)::int AS count FROM products p WHERE p.status='published' AND NOT EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=true)",
    visibleNavigationBrokenTargets:
      "SELECT count(*)::int AS count FROM navigation n WHERE n.visible=true AND ((n.link_type='category' AND NOT EXISTS(SELECT 1 FROM categories c WHERE c.active=true AND (c.id=n.target OR c.slug=regexp_replace(n.target,'^/category/','')))) OR (n.link_type='collection' AND NOT EXISTS(SELECT 1 FROM collections c WHERE c.active=true AND (c.id=n.target OR c.slug=regexp_replace(n.target,'^/collections/','')))) OR (n.link_type='page' AND NOT(left(n.target,1)='/' AND left(n.target,2)<>'//')) OR (n.link_type='url' AND n.target !~* '^https://'))",
    enabledHomepageBrokenReferences:
      "SELECT count(*)::int AS count FROM homepage_sections h WHERE h.enabled=true AND ((h.type='product-grid' AND (btrim(h.reference_id)='' OR (NOT EXISTS(SELECT 1 FROM products p WHERE p.id=h.reference_id AND p.status='published') AND NOT EXISTS(SELECT 1 FROM categories c WHERE c.id=h.reference_id AND c.active=true) AND NOT EXISTS(SELECT 1 FROM collections c WHERE c.id=h.reference_id AND c.active=true)))) OR (h.type='category-grid' AND btrim(h.reference_id)<>'' AND NOT EXISTS(SELECT 1 FROM categories c WHERE c.id=h.reference_id AND c.active=true)) OR (h.type='collection-feature' AND NOT EXISTS(SELECT 1 FROM collections c WHERE c.id=h.reference_id AND c.active=true)))",
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
    enabledCheckoutWithoutPaymentMethod:
      "WITH s AS (SELECT key,lower(value #>> '{}') value FROM site_settings) SELECT CASE WHEN COALESCE((SELECT value='true' FROM s WHERE key='ordersEnabled'),true) AND NOT COALESCE((SELECT value='true' FROM s WHERE key='codEnabled'),false) AND NOT COALESCE((SELECT value='true' FROM s WHERE key='bankEnabled'),(SELECT value='true' FROM s WHERE key='bankTransferEnabled'),false) THEN 1 ELSE 0 END::int AS count",
    enabledCheckoutWithoutFulfillmentMethod:
      "WITH s AS (SELECT COALESCE((SELECT lower(value #>> '{}')='true' FROM site_settings WHERE key='ordersEnabled'),true) enabled) SELECT CASE WHEN (SELECT enabled FROM s) AND NOT EXISTS(SELECT 1 FROM delivery_methods WHERE active) THEN 1 ELSE 0 END::int AS count",
    duplicateActiveAreaLocations:
      "SELECT count(*)::int AS count FROM (SELECT lower(btrim(district)),normalized_town,COALESCE(postcode,'') FROM delivery_area_locations WHERE active GROUP BY 1,2,3 HAVING count(*)>1) invalid",
    invalidActiveFulfillmentConfiguration:
      "SELECT (SELECT count(*) FROM delivery_methods WHERE active AND type='flat' AND fee IS NULL)+(SELECT CASE WHEN EXISTS(SELECT 1 FROM delivery_methods WHERE active AND type='area_group') AND ((SELECT count(*) FROM delivery_area_groups WHERE active AND fee IS NULL)>0 OR (SELECT count(*) FROM delivery_area_groups WHERE active AND is_fallback)<>1) THEN 1 ELSE 0 END)+(SELECT CASE WHEN EXISTS(SELECT 1 FROM delivery_methods WHERE active AND type='pickup') AND NOT EXISTS(SELECT 1 FROM pickup_locations WHERE active) THEN 1 ELSE 0 END) AS count",
  };
  const failures = [];
  for (const [name, sql] of Object.entries(checks)) {
    const count = Number((await pool.query(sql)).rows[0].count) || 0;
    console.log(`${name}: ${count}`);
    if (count) failures.push(`${name}=${count}`);
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
    failures.push(`missingMigrations=${missingMigrations.join(",")}`);
  if (failures.length)
    throw new Error(`Database verification failed: ${failures.join("; ")}`);
  console.log("database verification passed");
} finally {
  await pool.end();
}
