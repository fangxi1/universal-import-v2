import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { taskId } = await ctx.params;
    if (!taskId?.startsWith("task_")) {
      return NextResponse.json({ error: "非法 task_id" }, { status: 400 });
    }

    const sql = getSqlClient();
    const batches = await sql`
      SELECT b.unit_id, b.batch_index, b.start_row, b.end_row, b.status,
             b.retry_count, b.success_rows, b.failed_rows, b.locked_at, b.completed_at,
             p.parse_duration_ms, p.rule_duration_ms, p.validate_duration_ms,
             p.insert_duration_ms, p.total_duration_ms, p.row_count AS perf_row_count
      FROM import_task_batches b
      LEFT JOIN LATERAL (
        SELECT * FROM batch_performance_log
        WHERE task_id = b.task_id AND unit_id = b.unit_id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON true
      WHERE b.task_id = ${taskId}
      ORDER BY b.batch_index ASC
    `;

    return NextResponse.json({ data: batches });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
