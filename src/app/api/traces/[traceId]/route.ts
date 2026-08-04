import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

type Ctx = { params: Promise<{ traceId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { traceId } = await ctx.params;
    if (!traceId?.startsWith("trace_") && !traceId?.startsWith("task_")) {
      return NextResponse.json({ error: "非法 trace_id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id") || undefined;
    const batch = searchParams.get("batch");
    const rowFrom = searchParams.get("row_from");
    const rowTo = searchParams.get("row_to");
    const errorCode = searchParams.get("error_code");
    const sql = getSqlClient();

    let resolvedTrace = traceId;
    if (traceId.startsWith("task_")) {
      const t = (await sql`
        SELECT trace_id FROM import_tasks WHERE id = ${traceId}
      `) as Array<{ trace_id: string }>;
      if (!t.length) {
        return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      }
      resolvedTrace = t[0].trace_id;
    }

    const events = await sql`
      SELECT id, trace_id, task_id, unit_id, event_name, event_status, message, meta, occurred_at
      FROM trace_events
      WHERE trace_id = ${resolvedTrace}
        AND (${taskId}::text IS NULL OR task_id = ${taskId})
      ORDER BY occurred_at ASC
    `;

    const batchIndex = batch != null && batch !== "" ? parseInt(batch, 10) : null;
    const rf = rowFrom != null ? parseInt(rowFrom, 10) : null;
    const rt = rowTo != null ? parseInt(rowTo, 10) : null;

    const errors = await sql`
      SELECT id, task_id, unit_id, batch_index, row_number, field_name, raw_value,
             error_code, error_reason, suggestion, created_at
      FROM import_task_errors
      WHERE trace_id = ${resolvedTrace}
        AND (${batchIndex}::int IS NULL OR batch_index = ${batchIndex})
        AND (${errorCode}::text IS NULL OR error_code = ${errorCode})
        AND (${rf}::int IS NULL OR row_number >= ${rf})
        AND (${rt}::int IS NULL OR row_number <= ${rt})
      ORDER BY row_number ASC
      LIMIT 200
    `;

    return NextResponse.json({
      trace_id: resolvedTrace,
      timeline: events,
      errors,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
