import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.E2E_DATABASE_URL;
if (!connectionString) throw new Error("E2E_DATABASE_URL is required.");
if (connectionString === process.env.DATABASE_URL || connectionString === process.env.DATABASE_URL_UNPOOLED)
  throw new Error("E2E_DATABASE_URL must be isolated from production database URLs.");

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const replaySchema = `lifecycle_replay_${Date.now()}_${Math.random().toString(16).slice(2)}`;
try {
  const latest = await client.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
  const constraint = await client.query(
    "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='orders_order_status_check' AND conrelid='orders'::regclass",
  );
  const counts = await client.query("SELECT order_status,status_count::int FROM (SELECT order_status,count(*) status_count FROM orders GROUP BY order_status) grouped ORDER BY order_status");
  const legacy = await client.query("SELECT count(*)::int count FROM orders WHERE order_status IN ('sourcing','packed','shipped')");
  const couriers = await client.query("SELECT count(*)::int count FROM courier_providers WHERE active=true");

  await client.query(`CREATE SCHEMA ${replaySchema}`);
  await client.query(`SET search_path TO ${replaySchema}, public`);
  const directory = path.resolve("database/migrations");
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) await client.query(await readFile(path.join(directory, file), "utf8"));
  const replayLatest = await client.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
  const replayLegacy = await client.query("SELECT count(*)::int count FROM orders WHERE order_status IN ('sourcing','packed','shipped')");

  console.log(JSON.stringify({
    latestVersion: latest.rows[0]?.version ?? null,
    constraint: constraint.rows[0]?.definition ?? null,
    statusCounts: counts.rows,
    legacyStatusRows: legacy.rows[0]?.count ?? null,
    activeCourierCount: couriers.rows[0]?.count ?? null,
    freshReplay: {
      latestVersion: replayLatest.rows[0]?.version ?? null,
      legacyStatusRows: replayLegacy.rows[0]?.count ?? null,
      migrationCount: files.length,
    },
  }, null, 2));
} finally {
  await client.query("SET search_path TO public").catch(() => {});
  await client.query(`DROP SCHEMA IF EXISTS ${replaySchema} CASCADE`).catch(() => {});
  client.release();
  await pool.end();
}
