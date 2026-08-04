import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id") || searchParams.get("taskId");
    const traceId = searchParams.get("trace_id") || searchParams.get("traceId");
    const fileName = searchParams.get("file_name") || searchParams.get("fileName");
    const errorCode = searchParams.get("error_code") || searchParams.get("errorCode");
    const sql = getSqlClient();

    const tasks = await sql`
      SELECT id, file_name, status, trace_id, total_rows, success_rows, failed_rows,
             degraded, created_at, completed_at
      FROM import_tasks
      WHERE (${taskId}::text IS NULL OR id = ${taskId})
        AND (${traceId}::text IS NULL OR trace_id = ${traceId})
        AND (${fileName}::text IS NULL OR file_name ILIKE ${"%" + (fileName || "") + "%"})
        AND (
          ${errorCode}::text IS NULL OR EXISTS (
            SELECT 1 FROM import_task_errors e
            WHERE e.task_id = import_tasks.id AND e.error_code = ${errorCode}
          )
        )
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ data: tasks });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
