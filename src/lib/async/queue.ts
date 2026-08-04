import { getAppBaseUrl, getCronSecret } from "./config";
import type { EventEnvelope, ImportBatchPayload } from "./events";
import { EVENT_TYPES } from "./events";

export function hasQStash(): boolean {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

async function publishViaQStash(url: string, body: unknown): Promise<void> {
  const token = process.env.QSTASH_TOKEN!.trim();
  const res = await fetch(
    `https://qstash.upstash.io/v2/publish/${encodeURIComponent(url)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Retries": "3",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QStash publish failed: ${res.status} ${text}`);
  }
}

async function invokeLocalWorker(
  baseUrl: string,
  body: unknown
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/workers/import-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": getCronSecret(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Local worker invoke failed: ${res.status} ${text}`);
  }
}

/** 将 Outbox 事件投递到队列（QStash）或本地直调 Worker */
export async function enqueueOutboxEvent(
  envelope: EventEnvelope,
  baseUrl?: string
): Promise<void> {
  const origin = getAppBaseUrl(baseUrl);
  if (envelope.event_type !== EVENT_TYPES.ImportBatchCreated) {
    // 非批次事件仅记日志，不入 Worker 队列
    return;
  }

  const payload = envelope.payload as unknown as ImportBatchPayload;
  const job = {
    event_id: envelope.event_id,
    event_type: envelope.event_type,
    schema_version: envelope.schema_version,
    trace_id: envelope.trace_id,
    task_id: payload.task_id,
    unit_id: payload.unit_id,
    batch_index: payload.batch_index,
    start_row: payload.start_row,
    end_row: payload.end_row,
  };

  if (hasQStash()) {
    await publishViaQStash(`${origin}/api/workers/import-batch`, job);
  } else {
    // 本地/未配置 QStash：直调 Worker（await 以便 Outbox 失败可重试）
    await invokeLocalWorker(origin, job);
  }
}
