import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { taskId } = await ctx.params;
    if (!taskId?.startsWith("task_")) {
      return NextResponse.json({ error: "非法 task_id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("page_size") || searchParams.get("pageSize") || "50", 10))
    );
    const batch = searchParams.get("batch");
    const errorCode = searchParams.get("error_code") || searchParams.get("errorCode");
    const offset = (page - 1) * pageSize;
    const sql = getSqlClient();

    const batchIndex = batch != null && batch !== "" ? parseInt(batch, 10) : null;

    const countRows = (await sql`
      SELECT COUNT(*)::int AS cnt
      FROM import_task_errors
      WHERE task_id = ${taskId}
        AND (${batchIndex}::int IS NULL OR batch_index = ${batchIndex})
        AND (${errorCode}::text IS NULL OR error_code = ${errorCode})
    `) as Array<{ cnt: number }>;

    const rows = await sql`
      SELECT id, task_id, unit_id, batch_index, row_number, field_name, raw_value,
             error_code, error_reason, suggestion, trace_id, created_at
      FROM import_task_errors
      WHERE task_id = ${taskId}
        AND (${batchIndex}::int IS NULL OR batch_index = ${batchIndex})
        AND (${errorCode}::text IS NULL OR error_code = ${errorCode})
      ORDER BY row_number ASC, created_at ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json({
      data: rows,
      total: countRows[0]?.cnt ?? 0,
      page,
      page_size: pageSize,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
