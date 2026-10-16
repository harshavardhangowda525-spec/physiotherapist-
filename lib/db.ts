import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// BIGINT/BIGSERIAL ids and counts fit comfortably in a JS number for this application.
types.setTypeParser(20, (v) => Number(v));

export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Database unavailable");
    this.name = "DatabaseUnavailableError";
    (this as { cause?: unknown }).cause = cause;
  }
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new DatabaseUnavailableError(new Error("DATABASE_URL is not set"));
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
    pool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return pool;
}

/** For tests: swap the pool (e.g. to simulate an outage). */
export async function resetPool(): Promise<void> {
  if (pool) await pool.end().catch(() => {});
  pool = null;
}

const CONNECTION_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03", "08001", "08006", "28P01", "3D000"]);

function wrap(err: unknown): never {
  const code = (err as { code?: string })?.code;
  const msg = (err as Error)?.message ?? "";
  if ((code && CONNECTION_CODES.has(code)) || /timeout|connect|terminated/i.test(msg) || err instanceof DatabaseUnavailableError) {
    throw err instanceof DatabaseUnavailableError ? err : new DatabaseUnavailableError(err);
  }
  throw err;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    const res = await getPool().query<T>(text, params);
    return res.rows;
  } catch (err) {
    wrap(err);
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    wrap(err);
  }
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    wrap(err);
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
