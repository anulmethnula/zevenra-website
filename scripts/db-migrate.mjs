import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.E2E_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "E2E_DATABASE_URL is required. This command refuses to migrate DATABASE_URL.",
  );
if(connectionString===process.env.DATABASE_URL||connectionString===process.env.DATABASE_URL_UNPOOLED)
  throw new Error("E2E_DATABASE_URL must be isolated from production database URLs.");
const pool = new Pool({ connectionString, max: 1 });
try {
  await pool.query("SELECT pg_advisory_lock(hashtext('zevenra_schema_migrations'))");
  const directory = path.resolve("database/migrations"),
    files = (await readdir(directory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, ""),
      exists = await pool.query(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
      );
    if (exists.rows[0].exists) {
      const applied = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (applied.rowCount) {
        console.log(`skip ${version}`);
        continue;
      }
    }
    const sql = await readFile(path.join(directory, file), "utf8");
    await pool.query(sql);
    console.log(`applied ${version}`);
  }
} finally {
  await pool.query("SELECT pg_advisory_unlock(hashtext('zevenra_schema_migrations'))").catch(() => {});
  await pool.end();
}
