import { eq, isNotNull, desc, sql } from "drizzle-orm";
import { db, ensureTables } from "@/lib/db";
import { importBatches, orders } from "@/lib/db/schema";

export interface IntegrationWaybill {
  waybillNo: string;
  senderSummary: string;
  receiverSummary: string;
  amount: number;
  warehouseId: string;
  status: string;
  skus: Array<{ sku: string; name: string; quantity: number; batchId: string }>;
  importedAt?: string;
  fileName?: string | null;
}

type OrderRow = {
  id: string;
  batchId: string;
  externalCode: string | null;
  storeName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  skuCode: string;
  skuName: string;
  skuQuantity: string;
  weight: string | null;
  tempLayer: string | null;
  createdAt: Date | null;
  fileName?: string | null;
};

function parseQty(qty: string): number {
  const n = parseInt(qty, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseWeight(w: string | null): number {
  const n = parseFloat(w || "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function estimateLineAmount(row: OrderRow): number {
  const qty = parseQty(row.skuQuantity);
  const weight = parseWeight(row.weight);
  if (weight > 0) return Math.round(weight * qty * 80 * 100) / 100;
  return qty * 50;
}

export function aggregateOrderLines(lines: OrderRow[]): IntegrationWaybill | null {
  if (!lines.length) return null;
  const code = lines[0].externalCode;
  if (!code) return null;

  const first = lines[0];
  const amount = lines.reduce((sum, r) => sum + estimateLineAmount(r), 0);
  const receiverParts = [
    first.recipientName,
    first.recipientPhone,
    first.recipientAddress,
  ].filter(Boolean);

  return {
    waybillNo: code,
    senderSummary: first.storeName
      ? `${first.storeName}${first.fileName ? ` · ${first.fileName}` : ""}`
      : first.fileName || "V2 导入批次",
    receiverSummary: receiverParts.length
      ? receiverParts.join(" · ")
      : "（无收货信息）",
    amount: Math.round(amount * 100) / 100,
    warehouseId: first.storeName || "DEFAULT",
    status: "imported",
    skus: lines.map((r) => ({
      sku: r.skuCode,
      name: r.skuName,
      quantity: parseQty(r.skuQuantity),
      batchId: r.batchId.slice(0, 8),
    })),
    importedAt: first.createdAt?.toISOString(),
    fileName: first.fileName,
  };
}

async function fetchOrderLinesByCode(externalCode: string): Promise<OrderRow[]> {
  await ensureTables();
  return db
    .select({
      id: orders.id,
      batchId: orders.batchId,
      externalCode: orders.externalCode,
      storeName: orders.storeName,
      recipientName: orders.recipientName,
      recipientPhone: orders.recipientPhone,
      recipientAddress: orders.recipientAddress,
      skuCode: orders.skuCode,
      skuName: orders.skuName,
      skuQuantity: orders.skuQuantity,
      weight: orders.weight,
      tempLayer: orders.tempLayer,
      createdAt: orders.createdAt,
      fileName: importBatches.fileName,
    })
    .from(orders)
    .leftJoin(importBatches, eq(orders.batchId, importBatches.id))
    .where(eq(orders.externalCode, externalCode))
    .orderBy(desc(orders.createdAt));
}

export async function getWaybillByCode(externalCode: string): Promise<IntegrationWaybill | null> {
  const lines = await fetchOrderLinesByCode(externalCode);
  return aggregateOrderLines(lines);
}

export async function listWaybills(params: {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
}): Promise<{ data: IntegrationWaybill[]; total: number; page: number; pageSize: number }> {
  await ensureTables();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const rows = await db
    .select({
      externalCode: orders.externalCode,
      latestAt: sql<string>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(isNotNull(orders.externalCode))
    .groupBy(orders.externalCode)
    .orderBy(desc(sql`max(${orders.createdAt})`));

  let codes = rows
    .map((r) => r.externalCode)
    .filter((c): c is string => !!c);

  if (params.warehouseId) {
    const filtered: string[] = [];
    for (const code of codes) {
      const lines = await fetchOrderLinesByCode(code);
      if (lines[0]?.storeName === params.warehouseId) filtered.push(code);
    }
    codes = filtered;
  }

  const total = codes.length;
  const slice = codes.slice((page - 1) * pageSize, page * pageSize);
  const data: IntegrationWaybill[] = [];
  for (const code of slice) {
    const wb = await getWaybillByCode(code);
    if (wb) data.push(wb);
  }

  return { data, total, page, pageSize };
}

export async function validateSkuOnWaybill(externalCode: string, sku: string): Promise<boolean> {
  const lines = await fetchOrderLinesByCode(externalCode);
  if (!lines.length) return false;
  return lines.some((r) => r.skuCode === sku);
}

export async function ensureExceptionFlagTable() {
  await ensureTables();
  const { neon } = await import("@neondatabase/serverless");
  const { getConnectionString } = await import("@/lib/db");
  const sqlClient = neon(getConnectionString());
  await sqlClient`
    CREATE TABLE IF NOT EXISTS integration_exception_flags (
      external_code TEXT PRIMARY KEY,
      has_open_exception BOOLEAN NOT NULL DEFAULT false,
      ticket_id TEXT,
      status TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function setExceptionFlag(
  externalCode: string,
  payload: { hasOpenException: boolean; ticketId: string; status: string }
) {
  await ensureExceptionFlagTable();
  const { neon } = await import("@neondatabase/serverless");
  const { getConnectionString } = await import("@/lib/db");
  const sqlClient = neon(getConnectionString());
  await sqlClient`
    INSERT INTO integration_exception_flags (external_code, has_open_exception, ticket_id, status, updated_at)
    VALUES (${externalCode}, ${payload.hasOpenException}, ${payload.ticketId}, ${payload.status}, NOW())
    ON CONFLICT (external_code) DO UPDATE SET
      has_open_exception = EXCLUDED.has_open_exception,
      ticket_id = EXCLUDED.ticket_id,
      status = EXCLUDED.status,
      updated_at = NOW()
  `;
}

export async function getExceptionFlag(externalCode: string) {
  await ensureExceptionFlagTable();
  const { neon } = await import("@neondatabase/serverless");
  const { getConnectionString } = await import("@/lib/db");
  const sqlClient = neon(getConnectionString());
  const rows = await sqlClient`
    SELECT external_code, has_open_exception, ticket_id, status, updated_at
    FROM integration_exception_flags WHERE external_code = ${externalCode}
  `;
  return rows[0] as
    | {
        external_code: string;
        has_open_exception: boolean;
        ticket_id: string | null;
        status: string | null;
        updated_at: string;
      }
    | undefined;
}
