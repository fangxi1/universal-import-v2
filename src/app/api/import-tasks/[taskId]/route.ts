import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { taskId } = await ctx.params;
    if (!taskId || !taskId.startsWith("task_")) {
      return NextResponse.json({ error: "非法 task_id" }, { status: 400 });
    }

    const sql = getSqlClient();
    const rows = (await sql`
      SELECT id, file_name, status, total_rows, processed_rows, success_rows,
             failed_rows, total_batches, completed_batches, trace_id, degraded,
             degrade_reason, error_summary, created_at, started_at, completed_at
      FROM import_tasks WHERE id = ${taskId}
    `) as Array<Record<string, unknown>>;

    if (!rows.length) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const t = rows[0];
    const createdAt = t.created_at ? new Date(String(t.created_at)).getTime() : Date.now();
    const elapsedSec = Math.max(1, (Date.now() - createdAt) / 1000);
    const processed = Number(t.processed_rows || 0);
    const total = Number(t.total_rows || 0);
    const throughput = processed / elapsedSec;
    const remaining = Math.max(0, total - processed);
    const etaSec = throughput > 0 ? Math.ceil(remaining / throughput) : null;

    const recentErrors = await sql`
      SELECT error_code, error_reason, row_number, batch_index
      FROM import_task_errors
      WHERE task_id = ${taskId}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    return NextResponse.json({
      task_id: t.id,
      file_name: t.file_name,
      status: String(t.status || "").toUpperCase(),
      total_rows: total,
      processed_rows: processed,
      success_rows: Number(t.success_rows || 0),
      failed_rows: Number(t.failed_rows || 0),
      total_batches: Number(t.total_batches || 0),
      completed_batches: Number(t.completed_batches || 0),
      trace_id: t.trace_id,
      degraded: Boolean(t.degraded),
      degrade_reason: t.degrade_reason,
      error_summary: t.error_summary,
      throughput_rows_per_sec: Math.round(throughput * 100) / 100,
      eta_seconds: etaSec,
      recent_errors: recentErrors,
      created_at: t.created_at,
      started_at: t.started_at,
      completed_at: t.completed_at,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
