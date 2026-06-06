import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const DB_SETUP_HINT =
  "数据库未配置：请在 Vercel Dashboard → Storage → Postgres(Neon) 关联本项目，或运行 npx vercel integration add neon";

export function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL_UNPOOLED;

  if (!url?.trim()) {
    throw new Error(DB_SETUP_HINT);
  }
  return url.trim();
}

export function assertDatabaseConfigured(): void {
  getConnectionString();
}

export function formatDbError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("missing_connection_string") ||
    msg.includes("POSTGRES_URL") ||
    msg.includes("DATABASE_URL") ||
    msg.includes("connectionString")
  ) {
    return DB_SETUP_HINT;
  }
  return msg;
}

type DbInstance = NeonHttpDatabase<typeof schema>;

let dbInstance: DbInstance | null = null;

/** 延迟初始化，确保运行时能读到 Vercel/Neon 注入的环境变量 */
export function getDb(): DbInstance {
  if (!dbInstance) {
    const client = neon(getConnectionString());
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

/** 兼容现有 `db.select()` 写法 */
export const db: DbInstance = new Proxy({} as DbInstance, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

function getSqlClient() {
  return neon(getConnectionString());
}

export async function ensureTables() {
  assertDatabaseConfigured();
  const sql = getSqlClient();

  await sql`
    CREATE TABLE IF NOT EXISTS parse_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS import_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID REFERENCES parse_rules(id),
      file_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      success_rows INTEGER NOT NULL DEFAULT 0,
      failed_rows INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES import_batches(id),
      external_code TEXT,
      store_name TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      recipient_address TEXT,
      sku_code TEXT NOT NULL,
      sku_name TEXT NOT NULL,
      sku_quantity TEXT NOT NULL,
      weight TEXT,
      temp_layer TEXT,
      sku_spec TEXT,
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS temp_layer TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_recipient_name ON orders(recipient_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`;
}
