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
    orphanItems:
      "SELECT count(*)::int AS count FROM order_items i LEFT JOIN orders o ON o.order_id=i.order_id WHERE o.order_id IS NULL",
    orphanProductCollections:
      "SELECT count(*)::int AS count FROM product_collections pc LEFT JOIN products p ON p.id=pc.product_id LEFT JOIN collections c ON c.id=pc.collection_id WHERE p.id IS NULL OR c.id IS NULL",
    negativeStock: "SELECT count(*)::int AS count FROM variants WHERE stock<0",
    invalidTotals:
      "SELECT count(*)::int AS count FROM orders WHERE subtotal-COALESCE(discount_amount,0)+delivery_fee<>total",
    invalidStockStates:
      "SELECT count(*)::int AS count FROM orders WHERE stock_state NOT IN ('reserved','fulfilled','restored','not_applicable')",
    excessiveReturns:
      "SELECT count(*)::int AS count FROM (SELECT ri.order_item_id,sum(ri.quantity) qty,oi.quantity purchased FROM order_return_items ri JOIN order_items oi ON oi.id=ri.order_item_id JOIN order_returns r ON r.id=ri.return_id WHERE r.status<>'rejected' GROUP BY ri.order_item_id,oi.quantity HAVING sum(ri.quantity)>oi.quantity) invalid",
    orphanReturnItems:
      "SELECT count(*)::int AS count FROM order_return_items ri LEFT JOIN order_returns r ON r.id=ri.return_id LEFT JOIN order_items oi ON oi.id=ri.order_item_id WHERE r.id IS NULL OR oi.id IS NULL",
    orphanCourierRates:
      "SELECT count(*)::int AS count FROM courier_rates r LEFT JOIN courier_rate_cards c ON c.id=r.rate_card_id LEFT JOIN courier_providers p ON p.id=r.courier_provider_id WHERE c.id IS NULL OR p.id IS NULL",
    multipleActiveRateCards:
      "SELECT count(*)::int AS count FROM (SELECT courier_provider_id FROM courier_rate_cards WHERE status='active' GROUP BY courier_provider_id HAVING count(*)>1) invalid",
  };
  for (const [name, sql] of Object.entries(checks)) {
    const count = (await pool.query(sql)).rows[0].count;
    console.log(`${name}: ${count}`);
    if (count) throw new Error(`${name} verification failed`);
  }
  const migrations = await pool.query(
    "SELECT version,applied_at FROM schema_migrations ORDER BY version",
  );
  console.log(
    "migrations:",
    migrations.rows.map((row) => row.version).join(", "),
  );
  console.log("database verification passed");
} finally {
  await pool.end();
}
