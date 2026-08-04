import { getSqlClient } from "@/lib/db";
import { getWorkerConcurrency } from "./config";
import type { EventEnvelope } from "./events";
import { EVENT_TYPES } from "./events";
import { enqueueOutboxEvent } from "./queue";

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: EventEnvelope | string;
  trace_id: string;
  status: string;
  retry_count: number;
}

function parsePayload(raw: EventEnvelope | string): EventEnvelope {
  if (typeof raw === "string") return JSON.parse(raw) as EventEnvelope;
  return raw;
}

export async function dispatchOutbox(options?: {
  limit?: number;
  baseUrl?: string;
}): Promise<{ claimed: number; sent: number; failed: number }> {
  const sql = getSqlClient();
  const limit = options?.limit ?? 20;
  const concurrency = getWorkerConcurrency();

  const rows = (await sql`
    SELECT id, aggregate_id, event_type, schema_version, payload, trace_id, status, retry_count
    FROM event_outbox
    WHERE status IN ('pending', 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at ASC
    LIMIT ${limit}
  `) as OutboxRow[];

  if (!rows.length) return { claimed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  // 先处理 ImportBatchCreated；ImportTaskCreated 直接标记 sent
  const batchEvents = rows.filter(
    (r) => r.event_type === EVENT_TYPES.ImportBatchCreated
  );
  const otherEvents = rows.filter(
    (r) => r.event_type !== EVENT_TYPES.ImportBatchCreated
  );

  for (const row of otherEvents) {
    await sql`
      UPDATE event_outbox
      SET status = 'sent', sent_at = NOW(), last_error = NULL
      WHERE id = ${row.id}
    `;
    sent += 1;
  }

  for (let i = 0; i < batchEvents.length; i += concurrency) {
    const slice = batchEvents.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      slice.map(async (row) => {
        const envelope = parsePayload(row.payload);
        try {
          await enqueueOutboxEvent(envelope, options?.baseUrl);
          await sql`
            UPDATE event_outbox
            SET status = 'sent', sent_at = NOW(), last_error = NULL
            WHERE id = ${row.id}
          `;
          return "sent" as const;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const retry = (row.retry_count || 0) + 1;
          const delaySec = Math.min(300, 2 ** Math.min(retry, 6));
          await sql`
            UPDATE event_outbox
            SET status = 'failed',
                retry_count = ${retry},
                last_error = ${msg.slice(0, 500)},
                next_retry_at = NOW() + (${delaySec} || ' seconds')::interval
            WHERE id = ${row.id}
          `;
          return "failed" as const;
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "sent") sent += 1;
      else failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed };
}

/** 上传后立即触发一次投递（不阻塞响应） */
export function triggerDispatchAsync(baseUrl?: string): void {
  void dispatchOutbox({ limit: 50, baseUrl }).catch((e) => {
    console.error("[outbox] dispatch trigger failed", e);
  });
}
