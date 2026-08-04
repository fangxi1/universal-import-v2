import { v4 as uuidv4 } from "uuid";
import type { OrderRow, ParseRuleConfig } from "@/types";
import { getSqlClient } from "@/lib/db";
import { extractFile } from "@/lib/engine/file-extractor";
import { executeRuleEngine } from "@/lib/engine/rule-engine";
import { validateParsedBatch } from "./batch-validate";
import { EVENT_TYPES } from "./events";

export interface ProcessBatchJob {
  event_id?: string;
  trace_id: string;
  task_id: string;
  unit_id: string;
  batch_index: number;
  start_row: number;
  end_row: number;
}

interface TaskRow {
  id: string;
  rule_id: string | null;
  order_batch_id: string | null;
  status: string;
  total_rows: number;
  trace_id: string;
  degraded: boolean;
  file_name: string;
}

async function ensureParsedRows(task: TaskRow): Promise<{
  parseMs: number;
  ruleMs: number;
  totalRows: number;
}> {
  const sql = getSqlClient();
  const existing = (await sql`
    SELECT COUNT(*)::int AS cnt
    FROM import_task_parsed_rows
    WHERE task_id = ${task.id} AND line_no > 0
  `) as Array<{ cnt: number }>;
  if ((existing[0]?.cnt ?? 0) > 0) {
    return { parseMs: 0, ruleMs: 0, totalRows: existing[0].cnt };
  }

  // 抢解析锁：line_no=0 作为哨兵，仅一名 Worker 负责全量解析
  const claim = (await sql`
    INSERT INTO import_task_parsed_rows (task_id, line_no, payload)
    VALUES (${task.id}, 0, '{"_parse_lock":true}'::jsonb)
    ON CONFLICT (task_id, line_no) DO NOTHING
    RETURNING line_no
  `) as Array<{ line_no: number }>;

  if (!claim.length) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const c = (await sql`
        SELECT COUNT(*)::int AS cnt
        FROM import_task_parsed_rows
        WHERE task_id = ${task.id} AND line_no > 0
      `) as Array<{ cnt: number }>;
      if ((c[0]?.cnt ?? 0) > 0) {
        return { parseMs: 0, ruleMs: 0, totalRows: c[0].cnt };
      }
    }
    throw new Error("等待解析结果超时");
  }

  await sql`
    UPDATE import_tasks
    SET status = 'processing', started_at = COALESCE(started_at, NOW())
    WHERE id = ${task.id}
  `;

  const files = (await sql`
    SELECT content_base64, file_name, mime_type FROM import_task_files WHERE task_id = ${task.id}
  `) as Array<{ content_base64: string; file_name: string; mime_type: string | null }>;
  if (!files.length) throw new Error("任务文件不存在");

  if (!task.rule_id) throw new Error("任务未绑定解析规则");
  const rules = (await sql`
    SELECT config FROM parse_rules WHERE id = ${task.rule_id}::uuid
  `) as Array<{ config: ParseRuleConfig }>;
  if (!rules.length) throw new Error("解析规则不存在");

  const buf = Buffer.from(files[0].content_base64, "base64");
  const file = new File([buf], files[0].file_name, {
    type: files[0].mime_type || "application/octet-stream",
  });

  const parseStarted = Date.now();
  const preview = await extractFile(file);
  const parseMs = Date.now() - parseStarted;

  const ruleStarted = Date.now();
  const orderRows = executeRuleEngine(preview, rules[0].config);
  const ruleMs = Date.now() - ruleStarted;

  // 批量写入解析缓存
  const chunkSize = 500;
  for (let i = 0; i < orderRows.length; i += chunkSize) {
    const chunk = orderRows.slice(i, i + chunkSize);
    const values = chunk.map((row, idx) => {
      const lineNo = i + idx + 1;
      return sql`
        INSERT INTO import_task_parsed_rows (task_id, line_no, payload)
        VALUES (${task.id}, ${lineNo}, ${JSON.stringify(row)}::jsonb)
        ON CONFLICT (task_id, line_no) DO NOTHING
      `;
    });
    // neon transaction for chunk
    if (values.length) await sql.transaction(values);
  }

  await sql`
    UPDATE import_tasks
    SET total_rows = ${orderRows.length}
    WHERE id = ${task.id}
  `;

  // 确保最后一批覆盖真实末行，避免估行偏少漏处理
  await sql`
    UPDATE import_task_batches
    SET end_row = GREATEST(end_row, ${orderRows.length})
    WHERE task_id = ${task.id}
      AND batch_index = (
        SELECT MAX(batch_index) FROM import_task_batches WHERE task_id = ${task.id}
      )
  `;

  return { parseMs, ruleMs, totalRows: orderRows.length };
}

async function loadSlice(
  taskId: string,
  startRow: number,
  endRow: number
): Promise<Array<{ lineNo: number; row: OrderRow }>> {
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT line_no, payload
    FROM import_task_parsed_rows
    WHERE task_id = ${taskId}
      AND line_no BETWEEN ${startRow} AND ${endRow}
    ORDER BY line_no ASC
  `) as Array<{ line_no: number; payload: OrderRow | string }>;

  return rows.map((r) => ({
    lineNo: r.line_no,
    row:
      typeof r.payload === "string"
        ? (JSON.parse(r.payload) as OrderRow)
        : r.payload,
  }));
}

async function upsertOrders(
  task: TaskRow,
  items: Array<{ lineNo: number; row: OrderRow }>
): Promise<number> {
  if (!items.length) return 0;
  if (!task.order_batch_id) throw new Error("缺少 order_batch_id");
  const sql = getSqlClient();
  const chunkSize = 200;
  let written = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const stmts = chunk.map((item) => {
      const r = item.row;
      const id = r.id || uuidv4();
      return sql`
        INSERT INTO orders (
          id, batch_id, task_id, line_no, external_code, store_name,
          recipient_name, recipient_phone, recipient_address,
          sku_code, sku_name, sku_quantity, weight, temp_layer, sku_spec, remark
        ) VALUES (
          ${id}::uuid, ${task.order_batch_id}::uuid, ${task.id}, ${item.lineNo},
          ${r.externalCode || null}, ${r.storeName || null},
          ${r.recipientName || null}, ${r.recipientPhone || null}, ${r.recipientAddress || null},
          ${r.skuCode}, ${r.skuName}, ${r.skuQuantity},
          ${r.weight || null}, ${r.tempLayer || null}, ${r.skuSpec || null}, ${r.remark || null}
        )
        ON CONFLICT (task_id, line_no)
        WHERE task_id IS NOT NULL AND line_no IS NOT NULL
        DO UPDATE SET
          external_code = EXCLUDED.external_code,
          sku_code = EXCLUDED.sku_code,
          sku_name = EXCLUDED.sku_name,
          sku_quantity = EXCLUDED.sku_quantity,
          weight = EXCLUDED.weight,
          temp_layer = EXCLUDED.temp_layer,
          store_name = EXCLUDED.store_name,
          recipient_name = EXCLUDED.recipient_name,
          recipient_phone = EXCLUDED.recipient_phone,
          recipient_address = EXCLUDED.recipient_address
      `;
    });
    await sql.transaction(stmts);
    written += chunk.length;
  }
  return written;
}

async function finalizeTask(taskId: string, traceId: string) {
  const sql = getSqlClient();
  const tasks = (await sql`
    SELECT total_batches, completed_batches, success_rows, failed_rows, total_rows, status
    FROM import_tasks WHERE id = ${taskId}
  `) as Array<{
    total_batches: number;
    completed_batches: number;
    success_rows: number;
    failed_rows: number;
    total_rows: number;
    status: string;
  }>;
  const t = tasks[0];
  if (!t) return;
  if (t.completed_batches < t.total_batches) return;

  let status = "completed";
  let eventName: string = EVENT_TYPES.ImportTaskCompleted;
  if (t.success_rows === 0 && t.failed_rows > 0) {
    status = "failed";
    eventName = EVENT_TYPES.ImportBatchFailed;
  } else if (t.failed_rows > 0) {
    status = "partial_success";
    eventName = EVENT_TYPES.ImportTaskPartialSuccess;
  }

  await sql`
    UPDATE import_tasks
    SET status = ${status}, completed_at = NOW()
    WHERE id = ${taskId} AND completed_batches >= total_batches
  `;

  await sql`
    UPDATE import_batches ib
    SET success_rows = t.success_rows, failed_rows = t.failed_rows, total_rows = t.total_rows
    FROM import_tasks t
    WHERE t.id = ${taskId} AND ib.id = t.order_batch_id
  `;

  await sql`
    INSERT INTO trace_events (trace_id, task_id, event_name, event_status, message, meta)
    VALUES (
      ${traceId}, ${taskId}, ${eventName}, ${status === "failed" ? "error" : "ok"},
      ${`任务完成：status=${status}, success=${t.success_rows}, failed=${t.failed_rows}`},
      ${JSON.stringify({ status, success: t.success_rows, failed: t.failed_rows })}::jsonb
    )
  `;
}

export async function processImportBatch(job: ProcessBatchJob): Promise<{
  ok: boolean;
  skipped?: boolean;
  message: string;
}> {
  const sql = getSqlClient();
  const totalStarted = Date.now();

  const tasks = (await sql`
    SELECT id, rule_id, order_batch_id, status, total_rows, trace_id, degraded, file_name
    FROM import_tasks WHERE id = ${job.task_id}
  `) as TaskRow[];
  const task = tasks[0];
  if (!task) return { ok: false, message: "task not found" };

  const batches = (await sql`
    SELECT id, status, success_rows, failed_rows, retry_count
    FROM import_task_batches
    WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
  `) as Array<{
    id: string;
    status: string;
    success_rows: number;
    failed_rows: number;
    retry_count: number;
  }>;
  const batch = batches[0];
  if (!batch) return { ok: false, message: "batch not found" };

  if (batch.status === "completed") {
    return { ok: true, skipped: true, message: "already completed" };
  }

  const claimed = (await sql`
    UPDATE import_task_batches
    SET status = 'processing', locked_at = NOW(), retry_count = retry_count + 1
    WHERE task_id = ${job.task_id}
      AND unit_id = ${job.unit_id}
      AND status IN ('pending', 'failed')
    RETURNING id
  `) as Array<{ id: string }>;

  if (!claimed.length) {
    const latest = (await sql`
      SELECT status FROM import_task_batches
      WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
    `) as Array<{ status: string }>;
    if (latest[0]?.status === "completed") {
      return { ok: true, skipped: true, message: "already completed" };
    }
    return { ok: false, message: "batch locked by another worker" };
  }

  await sql`
    UPDATE import_tasks
    SET status = 'processing', started_at = COALESCE(started_at, NOW())
    WHERE id = ${job.task_id}
  `;

  await sql`
    INSERT INTO trace_events (trace_id, task_id, unit_id, event_name, event_status, message)
    VALUES (
      ${job.trace_id || task.trace_id}, ${job.task_id}, ${job.unit_id},
      ${EVENT_TYPES.ImportBatchStarted}, 'ok',
      ${`Worker 开始处理 ${job.unit_id}`}
    )
  `;

  let parseMs = 0;
  let ruleMs = 0;

  try {
    const parsed = await ensureParsedRows(task);
    parseMs = parsed.parseMs;
    ruleMs = parsed.ruleMs;

    // 若实际行数变化，校正本批 end_row
    const startRow = job.start_row;
    const endRow = Math.min(job.end_row, parsed.totalRows);
    if (startRow > parsed.totalRows) {
      // 空批：直接完成
      await sql`
        UPDATE import_task_batches
        SET status = 'completed', completed_at = NOW(), success_rows = 0, failed_rows = 0
        WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
      `;
      await sql`
        UPDATE import_tasks
        SET completed_batches = completed_batches + 1
        WHERE id = ${job.task_id}
      `;
      await finalizeTask(job.task_id, job.trace_id || task.trace_id);
      return { ok: true, message: "empty batch skipped" };
    }

    const slice = await loadSlice(job.task_id, startRow, endRow);
    const validation = await validateParsedBatch(slice);

    if (validation.degraded) {
      await sql`
        UPDATE import_tasks
        SET degraded = true, degrade_reason = ${validation.degradeReason || "SKU 校验降级"}
        WHERE id = ${job.task_id}
      `;
      await sql`
        INSERT INTO trace_events (trace_id, task_id, unit_id, event_name, event_status, message)
        VALUES (
          ${job.trace_id || task.trace_id}, ${job.task_id}, ${job.unit_id},
          ${EVENT_TYPES.ImportTaskDegraded}, 'warn',
          ${validation.degradeReason || "SKU 校验降级"}
        )
      `;
    }

    // 清理本单元旧错误（幂等重试）
    await sql`
      DELETE FROM import_task_errors
      WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
    `;

    if (validation.errors.length) {
      const errStmts = validation.errors.map(
        (e) => sql`
          INSERT INTO import_task_errors (
            task_id, unit_id, batch_index, row_number, field_name, raw_value,
            error_code, error_reason, suggestion, trace_id
          ) VALUES (
            ${job.task_id}, ${job.unit_id}, ${job.batch_index}, ${e.rowNumber},
            ${e.fieldName}, ${e.rawValue}, ${e.errorCode}, ${e.errorReason},
            ${e.suggestion}, ${job.trace_id || task.trace_id}
          )
        `
      );
      for (let i = 0; i < errStmts.length; i += 100) {
        await sql.transaction(errStmts.slice(i, i + 100));
      }
    }

    const insertStarted = Date.now();
    const written = await upsertOrders(task, validation.okRows);
    const insertMs = Date.now() - insertStarted;

    const successRows = written;
    const failedRows = validation.errors.length;
    // 按行去重错误计数（同一行多错误只计一次失败行）
    const failedRowSet = new Set(validation.errors.map((e) => e.rowNumber));
    const failedRowCount = failedRowSet.size;
    const processed = successRows + failedRowCount;

    // 幂等进度：用本批最终值替换，而不是累加旧值
    const prevSuccess = batch.success_rows || 0;
    const prevFailed = batch.failed_rows || 0;

    await sql`
      UPDATE import_task_batches
      SET status = 'completed',
          completed_at = NOW(),
          success_rows = ${successRows},
          failed_rows = ${failedRowCount},
          last_error = NULL
      WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
    `;

    await sql`
      UPDATE import_tasks
      SET
        processed_rows = GREATEST(0, processed_rows - ${prevSuccess + prevFailed} + ${processed}),
        success_rows = GREATEST(0, success_rows - ${prevSuccess} + ${successRows}),
        failed_rows = GREATEST(0, failed_rows - ${prevFailed} + ${failedRowCount}),
        completed_batches = (
          SELECT COUNT(*)::int FROM import_task_batches
          WHERE task_id = ${job.task_id} AND status = 'completed'
        ),
        error_summary = CASE
          WHEN ${failedRowCount} > 0 THEN ${`${job.unit_id} 失败 ${failedRowCount} 行`}
          ELSE error_summary
        END
      WHERE id = ${job.task_id}
    `;

    const totalMs = Date.now() - totalStarted;
    await sql`
      INSERT INTO batch_performance_log (
        task_id, unit_id, batch_index, parse_duration_ms, rule_duration_ms,
        validate_duration_ms, insert_duration_ms, total_duration_ms, row_count, status, trace_id
      ) VALUES (
        ${job.task_id}, ${job.unit_id}, ${job.batch_index},
        ${parseMs}, ${ruleMs}, ${validation.validateDurationMs}, ${insertMs},
        ${totalMs}, ${slice.length}, 'completed', ${job.trace_id || task.trace_id}
      )
    `;

    await sql`
      INSERT INTO trace_events (trace_id, task_id, unit_id, event_name, event_status, message, meta)
      VALUES (
        ${job.trace_id || task.trace_id}, ${job.task_id}, ${job.unit_id},
        ${EVENT_TYPES.ImportBatchSucceeded}, 'ok',
        ${`${job.unit_id} 完成：成功 ${successRows}，失败 ${failedRowCount}`},
        ${JSON.stringify({
          successRows,
          failedRowCount,
          parseMs,
          ruleMs,
          validateMs: validation.validateDurationMs,
          insertMs,
          totalMs,
        })}::jsonb
      )
    `;

    await finalizeTask(job.task_id, job.trace_id || task.trace_id);
    return { ok: true, message: `processed ${processed} rows` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`
      UPDATE import_task_batches
      SET status = 'failed', last_error = ${msg.slice(0, 500)}, locked_at = NULL
      WHERE task_id = ${job.task_id} AND unit_id = ${job.unit_id}
    `;
    await sql`
      INSERT INTO batch_performance_log (
        task_id, unit_id, batch_index, parse_duration_ms, rule_duration_ms,
        validate_duration_ms, insert_duration_ms, total_duration_ms, row_count, status, trace_id
      ) VALUES (
        ${job.task_id}, ${job.unit_id}, ${job.batch_index},
        ${parseMs}, ${ruleMs}, 0, 0, ${Date.now() - totalStarted}, 0,
        'failed', ${job.trace_id || task.trace_id}
      )
    `;
    await sql`
      INSERT INTO trace_events (trace_id, task_id, unit_id, event_name, event_status, message)
      VALUES (
        ${job.trace_id || task.trace_id}, ${job.task_id}, ${job.unit_id},
        ${EVENT_TYPES.ImportBatchFailed}, 'error', ${msg.slice(0, 500)}
      )
    `;

    // 若全部批次失败则标记任务失败
    const stats = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_batches,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_batches,
        COUNT(*)::int AS total
      FROM import_task_batches WHERE task_id = ${job.task_id}
    `) as Array<{ failed_batches: number; completed_batches: number; total: number }>;
    if (
      stats[0] &&
      stats[0].failed_batches + stats[0].completed_batches >= stats[0].total &&
      stats[0].completed_batches === 0
    ) {
      await sql`
        UPDATE import_tasks
        SET status = 'failed', completed_at = NOW(), error_summary = ${msg.slice(0, 500)}
        WHERE id = ${job.task_id}
      `;
    }

    return { ok: false, message: msg };
  }
}
