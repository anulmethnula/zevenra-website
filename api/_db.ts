import {
  neonConfig,
  neon,
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "@neondatabase/serverless";
import ws from "ws";
import { ConfigurationError } from "./_shared.js";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;
let httpQuery: ReturnType<typeof neon<false, true>> | undefined;

function connectionString() {
  const value = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) throw new ConfigurationError("E2E_DATABASE_URL or DATABASE_URL");
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

function databaseHttp() {
  if (!httpQuery) httpQuery = neon(connectionString(), { fullResults: true });
  return httpQuery;
}

const readStatement = (text: string) => /^\s*(SELECT|EXPLAIN)\b/i.test(text);
const transientReadError = (error: unknown) => /connection|timeout|fetch failed|ECONNRESET|socket|terminated/i.test(error instanceof Error ? error.message : String(error));
const httpRead = <Row extends QueryResultRow>(text:string,values:unknown[]) => databaseHttp().query(text,values,{fetchOptions:{signal:AbortSignal.timeout(8_000)}}) as unknown as Promise<QueryResult<Row>>;

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<Row>> {
  if (!readStatement(text)) return databasePool().query<Row>(text, values);
  try {
    return await httpRead<Row>(text,values);
  } catch (error) {
    if (!transientReadError(error)) throw error;
    console.warn("database HTTP read transient failure; retrying once", error instanceof Error ? error.message : error);
    return await httpRead<Row>(text,values);
  }
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
