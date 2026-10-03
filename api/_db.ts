import {
  neonConfig,
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "@neondatabase/serverless";
import ws from "ws";
import { ConfigurationError } from "./_shared.js";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new ConfigurationError("DATABASE_URL");
  return value;
}

function databasePool() {
  if (!pool)
    pool = new Pool({
      connectionString: connectionString(),
      max: 4,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  return pool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<Row>> {
  return databasePool().query<Row>(text, values);
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type DatabaseClient = Pick<PoolClient, "query">;
