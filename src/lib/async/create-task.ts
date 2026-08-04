import { getSqlClient } from "@/lib/db";
import { getImportBatchSize } from "./config";
import { EVENT_TYPES, buildEnvelope } from "./events";
import { detectMimeAndExt, estimateExcelDataRows } from "./estimate-rows";
import { ERROR_CODES } from "./error-codes";
import { newEventId, newTaskId, newTraceId, unitIdForBatch } from "./ids";

export interface CreateImportTaskInput {
  fileName: string;
  mimeType?: string | null;
  fileBuffer: ArrayBuffer;
  ruleId: string;
  totalRowsOverride?: number;
}

export interface CreateImportTaskResult {
  task_id: string;
  trace_id: string;
  status: "PENDING";
  total_rows: number;
  total_batches: number;
}

export async function createImportTask(
  input: CreateImportTaskInput
): Promise<CreateImportTaskResult> {
  const detected = detectMimeAndExt(input.fileName, input.mimeType);
  if (detected.kind === "unknown") {
    const err = new Error(ERROR_CODES.E008);
    (err as Error & { code: string }).code = ERROR_CODES.E008;
    throw err;
  }

  const taskId = newTaskId();
  const traceId = newTraceId();
  const batchSize = getImportBatchSize();
  const contentBase64 = Buffer.from(input.fileBuffer).toString("base64");

  let totalRows = input.totalRowsOverride ?? 0;
  if (!totalRows && detected.kind === "excel") {
    totalRows = estimateExcelDataRows(input.fileBuffer);
  }
  if (totalRows <= 0) totalRows = batchSize; // 非 Excel 或估不准时先按 1 批，Worker 解析后校正

  const totalBatches = Math.max(1, Math.ceil(totalRows / batchSize));
  const sql = getSqlClient();

  const batchRows: Array<{
    unitId: string;
    batchIndex: number;
    startRow: number;
    endRow: number;
    eventId: string;
  }> = [];

  for (let i = 0; i < totalBatches; i++) {
    const startRow = i * batchSize + 1;
    const endRow = Math.min(totalRows, (i + 1) * batchSize);
    batchRows.push({
      unitId: unitIdForBatch(i),
      batchIndex: i,
      startRow,
      endRow,
      eventId: newEventId(),
    });
  }

  const orderBatchId = crypto.randomUUID();
  const taskCreatedEventId = newEventId();

  // neon HTTP 事务：任务 + 文件 + 批次 + Outbox + Trace 同事务
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: any[] = [
    sql`
      INSERT INTO import_batches (id, rule_id, file_name, total_rows, success_rows, failed_rows)
      VALUES (${orderBatchId}::uuid, ${input.ruleId}::uuid, ${input.fileName}, ${totalRows}, 0, 0)
    `,
    sql`
      INSERT INTO import_tasks (
        id, file_name, rule_id, order_batch_id, status, total_rows, processed_rows,
        success_rows, failed_rows, total_batches, completed_batches, trace_id,
        mime_type, file_size, created_at
      ) VALUES (
        ${taskId}, ${input.fileName}, ${input.ruleId}::uuid, ${orderBatchId}::uuid,
        'pending', ${totalRows}, 0, 0, 0, ${totalBatches}, 0, ${traceId},
        ${detected.mime}, ${contentBase64.length}, NOW()
      )
    `,
    sql`
      INSERT INTO import_task_files (task_id, content_base64, file_name, mime_type)
      VALUES (${taskId}, ${contentBase64}, ${input.fileName}, ${detected.mime})
    `,
    sql`
      INSERT INTO trace_events (trace_id, task_id, event_name, event_status, message, meta)
      VALUES (
        ${traceId}, ${taskId}, ${EVENT_TYPES.ImportTaskCreated}, 'ok',
        ${`用户上传文件，生成 task_id=${taskId}`},
        ${JSON.stringify({ fileName: input.fileName, totalRows, totalBatches })}::jsonb
      )
    `,
  ];

  const taskCreatedEnvelope = buildEnvelope({
    eventId: taskCreatedEventId,
    eventType: EVENT_TYPES.ImportTaskCreated,
    aggregateId: taskId,
    traceId,
    payload: {
      task_id: taskId,
      file_name: input.fileName,
      total_rows: totalRows,
      total_batches: totalBatches,
    },
  });

  queries.push(sql`
    INSERT INTO event_outbox (
      id, aggregate_id, event_type, schema_version, payload, trace_id, status, next_retry_at
    ) VALUES (
      ${taskCreatedEventId}, ${taskId}, ${EVENT_TYPES.ImportTaskCreated}, 1,
      ${JSON.stringify(taskCreatedEnvelope)}::jsonb, ${traceId}, 'pending', NOW()
    )
  `);

  for (const b of batchRows) {
    queries.push(sql`
      INSERT INTO import_task_batches (
        task_id, unit_id, batch_index, start_row, end_row, status
      ) VALUES (
        ${taskId}, ${b.unitId}, ${b.batchIndex}, ${b.startRow}, ${b.endRow}, 'pending'
      )
    `);

    const envelope = buildEnvelope({
      eventId: b.eventId,
      eventType: EVENT_TYPES.ImportBatchCreated,
      aggregateId: taskId,
      traceId,
      payload: {
        task_id: taskId,
        unit_id: b.unitId,
        batch_index: b.batchIndex,
        start_row: b.startRow,
        end_row: b.endRow,
      },
    });

    queries.push(sql`
      INSERT INTO event_outbox (
        id, aggregate_id, event_type, schema_version, payload, trace_id, status, next_retry_at
      ) VALUES (
        ${b.eventId}, ${taskId}, ${EVENT_TYPES.ImportBatchCreated}, 1,
        ${JSON.stringify(envelope)}::jsonb, ${traceId}, 'pending', NOW()
      )
    `);
  }

  queries.push(sql`
    INSERT INTO trace_events (trace_id, task_id, event_name, event_status, message, meta)
    VALUES (
      ${traceId}, ${taskId}, 'OutboxPrepared', 'ok',
      ${`按设计创建 ${totalBatches} 个处理单元 Outbox 事件`},
      ${JSON.stringify({ totalBatches })}::jsonb
    )
  `);

  await sql.transaction(queries);

  return {
    task_id: taskId,
    trace_id: traceId,
    status: "PENDING",
    total_rows: totalRows,
    total_batches: totalBatches,
  };
}
