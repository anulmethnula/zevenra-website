import { neon } from "@neondatabase/serverless";
import { listPublicProducts } from "../api/_data/catalog.ts";

const connectionString=process.env.E2E_DATABASE_URL||process.env.DATABASE_URL;
if (!connectionString) throw new Error("E2E_DATABASE_URL or DATABASE_URL is required");
const sql = neon(connectionString, { fullResults: true });
const cases = [
  { query:"THE CLASSIC FIT", slug:"the-classic-fit" },
  { query:"PORCELAIN BLOOM TWIST TOP", slug:"porcelain-bloom-twist-top" },
];

for (const item of cases) {
  const record = await sql.query(`
    SELECT p.id,p.name,p.slug,p.status,c.name AS category,
      EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=true) AS has_active_variants,
      COALESCE((SELECT sum(v.stock) FROM variants v WHERE v.product_id=p.id AND v.active=true),0)::int AS total_stock
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.slug=$1
    LIMIT 1`, [item.slug]);
  const row = record.rows[0];
  if (!row) throw new Error(`MISSING ${item.query}: expected slug ${item.slug}`);
  console.log(`RECORD ${item.query}: ${JSON.stringify(row)}`);
  if (row.status !== "published") throw new Error(`UNPUBLISHED ${item.query}: status=${row.status}`);

  const result = await listPublicProducts({ q:item.query, page:1, pageSize:24, sort:"newest" });
  const matched = result.items.some((product) => product.slug === item.slug);
  console.log(`SEARCH ${item.query}: total=${result.total} matched=${matched}`);
  if (!matched) throw new Error(`SEARCH FAILED ${item.query}: published record was not returned`);
}

for (const query of ["classic", "porcelain"]) {
  const result = await listPublicProducts({ q:query, page:1, pageSize:24, sort:"newest" });
  console.log(`PARTIAL ${query}: total=${result.total}`);
  if (!result.total) throw new Error(`PARTIAL SEARCH FAILED: ${query}`);
}

console.log("search smoke passed");
