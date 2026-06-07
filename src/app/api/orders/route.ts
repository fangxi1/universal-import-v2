import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, ensureTables, formatDbError } from "@/lib/db";
import { importBatches, orders } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get("pageSize") ?? "20", 10)));
    const externalCode = searchParams.get("externalCode") ?? "";
    const recipientName = searchParams.get("recipientName") ?? "";
    const fileName = searchParams.get("fileName") ?? "";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const conditions = [];
    if (externalCode) {
      conditions.push(ilike(orders.externalCode, `%${externalCode}%`));
    }
    if (recipientName) {
      conditions.push(ilike(orders.recipientName, `%${recipientName}%`));
    }
    if (fileName) {
      conditions.push(ilike(importBatches.fileName, `%${fileName}%`));
    }
    if (startDate) {
      conditions.push(sql`${orders.createdAt} >= ${startDate}::timestamptz`);
    }
    if (endDate) {
      conditions.push(sql`${orders.createdAt} <= (${endDate}::date + interval '1 day')`);
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(importBatches, eq(orders.batchId, importBatches.id))
      .where(where);

    const rows = await db
      .select({
        id: orders.id,
        batchId: orders.batchId,
        fileName: importBatches.fileName,
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
        skuSpec: orders.skuSpec,
        remark: orders.remark,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(importBatches, eq(orders.batchId, importBatches.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString(),
      })),
      total: countResult?.count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const { rows, fileName, ruleId, batchId, totalRows } = body as {
      rows: Array<Record<string, string>>;
      fileName: string;
      ruleId?: string;
      batchId?: string;
      totalRows?: number;
    };

    if (!rows?.length) {
      return NextResponse.json({ error: "没有可提交的数据" }, { status: 400 });
    }

    let batch: { id: string };

    if (batchId) {
      const existing = await db
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1);
      if (!existing.length) {
        return NextResponse.json({ error: "批次不存在" }, { status: 404 });
      }
      batch = existing[0];
    } else {
      const [created] = await db
        .insert(importBatches)
        .values({
          ruleId: ruleId ?? null,
          fileName: fileName ?? "未命名文件",
          totalRows: totalRows ?? rows.length,
          successRows: 0,
          failedRows: 0,
        })
        .returning();
      batch = created;
    }

    let chunkSuccess = 0;
    const errors: Array<{ rowIndex: number; message: string }> = [];
    const DB_INSERT_BATCH = 500;

    const toInsert = rows.map((row) => ({
      batchId: batch.id,
      externalCode: row.externalCode || null,
      storeName: row.storeName || null,
      recipientName: row.recipientName || null,
      recipientPhone: row.recipientPhone || null,
      recipientAddress: row.recipientAddress || null,
      skuCode: row.skuCode,
      skuName: row.skuName,
      skuQuantity: row.skuQuantity,
      weight: row.weight || null,
      tempLayer: row.tempLayer || null,
      skuSpec: row.skuSpec || null,
      remark: row.remark || null,
    }));

    for (let offset = 0; offset < toInsert.length; offset += DB_INSERT_BATCH) {
      const slice = toInsert.slice(offset, offset + DB_INSERT_BATCH);
      try {
        await db.insert(orders).values(slice);
        chunkSuccess += slice.length;
      } catch {
        for (let i = 0; i < slice.length; i++) {
          try {
            await db.insert(orders).values(slice[i]);
            chunkSuccess++;
          } catch (err) {
            errors.push({
              rowIndex: offset + i,
              message: err instanceof Error ? err.message : "写入失败",
            });
          }
        }
      }
    }

    const chunkFailed = rows.length - chunkSuccess;

    await db
      .update(importBatches)
      .set({
        successRows: sql`${importBatches.successRows} + ${chunkSuccess}`,
        failedRows: sql`${importBatches.failedRows} + ${chunkFailed}`,
      })
      .where(eq(importBatches.id, batch.id));

    const [stats] = await db
      .select({
        successRows: importBatches.successRows,
        failedRows: importBatches.failedRows,
      })
      .from(importBatches)
      .where(eq(importBatches.id, batch.id));

    return NextResponse.json({
      success: stats?.successRows ?? chunkSuccess,
      failed: stats?.failedRows ?? chunkFailed,
      chunkSuccess,
      chunkFailed,
      errors,
      batchId: batch.id,
    });
  } catch (e) {
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
