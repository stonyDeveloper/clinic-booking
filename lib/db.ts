import { SCHEMA } from "./schema";

export type Row = Record<string, unknown>;

/**
 * The only database surface the rest of the app sees. Keeping it this small
 * means the production driver (`pg` against Neon) and the zero-setup local
 * driver (PGlite, Postgres compiled to WASM) are interchangeable.
 */
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

type GlobalWithDb = typeof globalThis & { __clinicDb?: Promise<Db> };

// A serverless instance may handle many requests; build the pool once per
// process rather than once per request.
const globalRef = globalThis as GlobalWithDb;

export function getDb(): Promise<Db> {
  if (!globalRef.__clinicDb) {
    // Do not cache a rejection: a transient connection failure at boot would
    // otherwise poison every later request in this process.
    globalRef.__clinicDb = create().catch((err) => {
      globalRef.__clinicDb = undefined;
      throw err;
    });
  }
  return globalRef.__clinicDb;
}

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return withPg(url);

  // The embedded database writes to disk, which a serverless filesystem does
  // not allow. Failing loudly here beats a confusing 500 later.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set — production needs a Postgres connection string",
    );
  }

  return withPglite();
}

/**
 * Neon hands out URLs with `?sslmode=require`. node-postgres still accepts it
 * but prints a deprecation warning on every cold start, so we strip it and pass
 * the TLS intent explicitly instead — same behaviour, quiet logs.
 */
function stripSslMode(url: string): string {
  return url
    .replace(/&sslmode=[^&]*/g, "")
    .replace(/\?sslmode=[^&]*/g, "?")
    .replace(/[?&]$/, "");
}

async function withPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: stripSslMode(url),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  });

  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
  };

  await applySchema(db);
  return db;
}

async function withPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdir } = await import("node:fs/promises");
  const path = await import("node:path");

  // Local development convenience: a real Postgres engine, in-process, with no
  // server to install. Data lives on disk under .data/.
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  await mkdir(dataDir, { recursive: true });
  const client = await PGlite.create(dataDir);

  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(sql, params);
      return result.rows as T[];
    },
  };

  await applySchema(db);
  return db;
}

async function applySchema(db: Db): Promise<void> {
  for (const statement of SCHEMA) await db.query(statement);
}
