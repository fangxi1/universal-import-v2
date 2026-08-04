import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError } from "@/lib/db";
import { getCronSecret } from "@/lib/async/config";
import { processImportBatch, type ProcessBatchJob } from "@/lib/async/process-batch";
import { hasQStash } from "@/lib/async/queue";

export const maxDuration = 60;

async function verifyRequest(req: NextRequest): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === getCronSecret()) return true;

  if (hasQStash()) {
    // 轻量校验：生产可换 Receiver 验签；此处接受 QStash 特征头或 cron secret
    const qstashSignature =
      req.headers.get("upstash-signature") ||
      req.headers.get("Upstash-Signature");
    if (qstashSignature) return true;
  }

  // 本地开发放宽
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyRequest(req))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    await ensureTables();
    const body = (await req.json()) as ProcessBatchJob;
    if (!body?.task_id || !body?.unit_id) {
      return NextResponse.json({ error: "invalid job payload" }, { status: 400 });
    }

    const result = await processImportBatch({
      event_id: body.event_id,
      trace_id: body.trace_id,
      task_id: body.task_id,
      unit_id: body.unit_id,
      batch_index: body.batch_index ?? 0,
      start_row: body.start_row ?? 1,
      end_row: body.end_row ?? 1000,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
