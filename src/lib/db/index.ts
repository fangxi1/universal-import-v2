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

export function getSqlClient() {
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
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS task_id TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_no INTEGER`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_recipient_name ON orders(recipient_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_task_id ON orders(task_id)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_task_line
    ON orders (task_id, line_no)
    WHERE task_id IS NOT NULL AND line_no IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sku_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT DEFAULT '件',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_master_code ON sku_master(sku_code)`;

  await sql`
    CREATE TABLE IF NOT EXISTS import_tasks (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      rule_id UUID REFERENCES parse_rules(id),
      order_batch_id UUID REFERENCES import_batches(id),
      status TEXT NOT NULL DEFAULT 'pending',
      total_rows INTEGER NOT NULL DEFAULT 0,
      processed_rows INTEGER NOT NULL DEFAULT 0,
      success_rows INTEGER NOT NULL DEFAULT 0,
      failed_rows INTEGER NOT NULL DEFAULT 0,
      total_batches INTEGER NOT NULL DEFAULT 0,
      completed_batches INTEGER NOT NULL DEFAULT 0,
      trace_id TEXT NOT NULL,
      degraded BOOLEAN NOT NULL DEFAULT false,
      degrade_reason TEXT,
      mime_type TEXT,
      file_size INTEGER DEFAULT 0,
      error_summary TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_import_tasks_status_created ON import_tasks(status, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_import_tasks_trace ON import_tasks(trace_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS import_task_files (
      task_id TEXT PRIMARY KEY REFERENCES import_tasks(id) ON DELETE CASCADE,
      content_base64 TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS import_task_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id TEXT NOT NULL REFERENCES import_tasks(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      start_row INTEGER NOT NULL,
      end_row INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      success_rows INTEGER NOT NULL DEFAULT 0,
      failed_rows INTEGER NOT NULL DEFAULT 0,
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, unit_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_import_task_batches_status ON import_task_batches(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS import_task_parsed_rows (
      task_id TEXT NOT NULL REFERENCES import_tasks(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      payload JSONB NOT NULL,
      PRIMARY KEY (task_id, line_no)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS import_task_errors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id TEXT NOT NULL REFERENCES import_tasks(id) ON DELETE CASCADE,
      unit_id TEXT,
      batch_index INTEGER,
      row_number INTEGER NOT NULL,
      field_name TEXT,
      raw_value TEXT,
      error_code TEXT NOT NULL,
      error_reason TEXT NOT NULL,
      suggestion TEXT,
      trace_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_import_task_errors_task_unit ON import_task_errors(task_id, unit_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_import_task_errors_code ON import_task_errors(error_code)`;

  await sql`
    CREATE TABLE IF NOT EXISTS event_outbox (
      id TEXT PRIMARY KEY,
      aggregate_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      payload JSONB NOT NULL,
      trace_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMPTZ DEFAULT NOW(),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_outbox_status_retry ON event_outbox(status, next_retry_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS batch_performance_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      parse_duration_ms INTEGER NOT NULL DEFAULT 0,
      rule_duration_ms INTEGER NOT NULL DEFAULT 0,
      validate_duration_ms INTEGER NOT NULL DEFAULT 0,
      insert_duration_ms INTEGER NOT NULL DEFAULT 0,
      total_duration_ms INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_batch_perf_task_unit ON batch_performance_log(task_id, unit_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS trace_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id TEXT NOT NULL,
      task_id TEXT,
      unit_id TEXT,
      event_name TEXT NOT NULL,
      event_status TEXT NOT NULL DEFAULT 'ok',
      message TEXT,
      meta JSONB,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_trace_events_trace_time ON trace_events(trace_id, occurred_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trace_events_task ON trace_events(task_id)`;
}
