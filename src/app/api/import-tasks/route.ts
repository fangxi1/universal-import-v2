import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";
import { createImportTask } from "@/lib/async/create-task";
import { triggerDispatchAsync } from "@/lib/async/outbox";
import { getAppBaseUrl } from "@/lib/async/config";
import { ERROR_CODES } from "@/lib/async/error-codes";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    await ensureTables();
    const form = await req.formData();
    const file = form.get("file");
    const ruleId = String(form.get("ruleId") || "").trim();

    if (!ruleId) {
      return NextResponse.json({ error: "缺少 ruleId" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }

    const sql = getSqlClient();
    const rules = (await sql`
      SELECT id FROM parse_rules WHERE id = ${ruleId}::uuid LIMIT 1
    `) as Array<{ id: string }>;
    if (!rules.length) {
      return NextResponse.json({ error: "解析规则不存在" }, { status: 404 });
    }

    const buffer = await file.arrayBuffer();
    const result = await createImportTask({
      fileName: file.name || "upload.xlsx",
      mimeType: file.type,
      fileBuffer: buffer,
      ruleId,
    });

    triggerDispatchAsync(getAppBaseUrl(req.url));

    const elapsed = Date.now() - started;
    return NextResponse.json({
      ...result,
      upload_ms: elapsed,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === ERROR_CODES.E008) {
      return NextResponse.json(
        { error: "文件格式不支持", error_code: ERROR_CODES.E008 },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
    );
    const offset = (page - 1) * pageSize;
    const withTotal = searchParams.get("withTotal") === "1";
    const sql = getSqlClient();

    const rowsPromise = sql`
      SELECT id, file_name, status, total_rows, processed_rows, success_rows,
             failed_rows, total_batches, completed_batches, trace_id, degraded,
             created_at, completed_at
      FROM import_tasks
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    // 最近任务列表默认不 COUNT(*)，减少一轮 DB 往返
    if (!withTotal) {
      const rows = await rowsPromise;
      return NextResponse.json({
        data: rows,
        total: null,
        page,
        pageSize,
      });
    }

    const [countRows, rows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS cnt FROM import_tasks` as Promise<
        Array<{ cnt: number }>
      >,
      rowsPromise,
    ]);

    return NextResponse.json({
      data: rows,
      total: countRows[0]?.cnt ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
