import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";
import { getAppBaseUrl, getCronSecret, getStaleBatchMinutes } from "@/lib/async/config";
import { newEventId } from "@/lib/async/ids";
import { EVENT_TYPES, buildEnvelope } from "@/lib/async/events";
import { dispatchOutbox } from "@/lib/async/outbox";

export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = getCronSecret();
  if (req.headers.get("x-cron-secret") === secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    await ensureTables();
    const sql = getSqlClient();
    const minutes = getStaleBatchMinutes();

    const stale = (await sql`
      SELECT b.task_id, b.unit_id, b.batch_index, b.start_row, b.end_row, b.retry_count,
             t.trace_id
      FROM import_task_batches b
      JOIN import_tasks t ON t.id = b.task_id
      WHERE b.status = 'processing'
        AND b.locked_at IS NOT NULL
        AND b.locked_at < NOW() - (${minutes} || ' minutes')::interval
      LIMIT 50
    `) as Array<{
      task_id: string;
      unit_id: string;
      batch_index: number;
      start_row: number;
      end_row: number;
      retry_count: number;
      trace_id: string;
    }>;

    let requeued = 0;
    let markedFailed = 0;

    for (const row of stale) {
      if ((row.retry_count || 0) >= 5) {
        await sql`
          UPDATE import_task_batches
          SET status = 'failed',
              last_error = 'processing 超时且重试耗尽',
              locked_at = NULL
          WHERE task_id = ${row.task_id} AND unit_id = ${row.unit_id}
        `;
        markedFailed += 1;
        continue;
      }

      await sql`
        UPDATE import_task_batches
        SET status = 'pending', locked_at = NULL
        WHERE task_id = ${row.task_id} AND unit_id = ${row.unit_id}
      `;

      const eventId = newEventId();
      const envelope = buildEnvelope({
        eventId,
        eventType: EVENT_TYPES.ImportBatchCreated,
        aggregateId: row.task_id,
        traceId: row.trace_id,
        payload: {
          task_id: row.task_id,
          unit_id: row.unit_id,
          batch_index: row.batch_index,
          start_row: row.start_row,
          end_row: row.end_row,
        },
      });

      await sql`
        INSERT INTO event_outbox (
          id, aggregate_id, event_type, schema_version, payload, trace_id, status, next_retry_at
        ) VALUES (
          ${eventId}, ${row.task_id}, ${EVENT_TYPES.ImportBatchCreated}, 1,
          ${JSON.stringify(envelope)}::jsonb, ${row.trace_id}, 'pending', NOW()
        )
      `;
      requeued += 1;
    }

    const dispatch = await dispatchOutbox({
      limit: 50,
      baseUrl: getAppBaseUrl(req.url),
    });

    return NextResponse.json({
      ok: true,
      stale: stale.length,
      requeued,
      markedFailed,
      dispatch,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
