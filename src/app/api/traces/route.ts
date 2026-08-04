import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";

export const dynamic = "force-dynamic";

function emptyToNull(v: string | null): string | null {
  const s = (v || "").trim();
  return s ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const taskId = emptyToNull(
      searchParams.get("task_id") || searchParams.get("taskId")
    );
    const traceId = emptyToNull(
      searchParams.get("trace_id") || searchParams.get("traceId")
    );
    const fileName = emptyToNull(
      searchParams.get("file_name") || searchParams.get("fileName")
    );
    const errorCode = emptyToNull(
      searchParams.get("error_code") || searchParams.get("errorCode")
    );
    const sql = getSqlClient();

    // 按条件走最快路径，避免恒真 OR 导致索引失效
    let tasks;
    if (taskId) {
      tasks = await sql`
        SELECT id, file_name, status, trace_id, total_rows, success_rows, failed_rows,
               degraded, created_at, completed_at
        FROM import_tasks
        WHERE id = ${taskId}
        LIMIT 1
      `;
    } else if (traceId) {
      tasks = await sql`
        SELECT id, file_name, status, trace_id, total_rows, success_rows, failed_rows,
               degraded, created_at, completed_at
        FROM import_tasks
        WHERE trace_id = ${traceId}
        ORDER BY created_at DESC
        LIMIT 20
      `;
    } else if (errorCode && fileName) {
      tasks = await sql`
        SELECT DISTINCT t.id, t.file_name, t.status, t.trace_id, t.total_rows,
               t.success_rows, t.failed_rows, t.degraded, t.created_at, t.completed_at
        FROM import_tasks t
        INNER JOIN import_task_errors e ON e.task_id = t.id
        WHERE e.error_code = ${errorCode}
          AND t.file_name ILIKE ${`${fileName}%`}
        ORDER BY t.created_at DESC
        LIMIT 50
      `;
    } else if (errorCode) {
      tasks = await sql`
        SELECT DISTINCT t.id, t.file_name, t.status, t.trace_id, t.total_rows,
               t.success_rows, t.failed_rows, t.degraded, t.created_at, t.completed_at
        FROM import_tasks t
        INNER JOIN import_task_errors e ON e.task_id = t.id AND e.error_code = ${errorCode}
        ORDER BY t.created_at DESC
        LIMIT 50
      `;
    } else if (fileName) {
      tasks = await sql`
        SELECT id, file_name, status, trace_id, total_rows, success_rows, failed_rows,
               degraded, created_at, completed_at
        FROM import_tasks
        WHERE file_name ILIKE ${`${fileName}%`}
        ORDER BY created_at DESC
        LIMIT 50
      `;
    } else {
      // 默认最近任务，避免全表复杂过滤
      tasks = await sql`
        SELECT id, file_name, status, trace_id, total_rows, success_rows, failed_rows,
               degraded, created_at, completed_at
        FROM import_tasks
        ORDER BY created_at DESC
        LIMIT 30
      `;
    }

    return NextResponse.json({ data: tasks });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
