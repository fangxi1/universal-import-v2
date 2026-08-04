import { NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";
import { hasQStash } from "@/lib/async/queue";

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export async function GET() {
  try {
    await ensureTables();
    const sql = getSqlClient();

    const throughput = (await sql`
      SELECT
        date_trunc('minute', created_at) AS minute,
        SUM(success_rows)::int AS success_rows
      FROM import_task_batches
      WHERE status = 'completed'
        AND completed_at >= NOW() - INTERVAL '5 minutes'
      GROUP BY 1
      ORDER BY 1 ASC
    `) as Array<{ minute: string; success_rows: number }>;

    const backlog = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'failed'))::int AS pending_batches,
        COALESCE(SUM(
          CASE WHEN status IN ('pending', 'failed')
            THEN GREATEST(0, end_row - start_row + 1) ELSE 0 END
        ), 0)::int AS pending_rows,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_batches
      FROM import_task_batches
    `) as Array<{
      pending_batches: number;
      pending_rows: number;
      processing_batches: number;
    }>;

    const outbox = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
      FROM event_outbox
      WHERE created_at >= NOW() - INTERVAL '1 day'
    `) as Array<{ pending: number; failed: number; sent: number }>;

    const perf = (await sql`
      SELECT parse_duration_ms, rule_duration_ms, validate_duration_ms,
             insert_duration_ms, total_duration_ms
      FROM batch_performance_log
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `) as Array<{
      parse_duration_ms: number;
      rule_duration_ms: number;
      validate_duration_ms: number;
      insert_duration_ms: number;
      total_duration_ms: number;
    }>;

    const stage = (key: keyof (typeof perf)[0]) => {
      const arr = perf.map((p) => Number(p[key] || 0)).sort((a, b) => a - b);
      return {
        p50: percentile(arr, 50),
        p95: percentile(arr, 95),
        p99: percentile(arr, 99),
      };
    };

    const errorDist = await sql`
      SELECT error_code, COUNT(*)::int AS cnt
      FROM import_task_errors
      WHERE created_at >= NOW() - INTERVAL '1 day'
      GROUP BY error_code
      ORDER BY cnt DESC
    `;

    const slowBatches = await sql`
      SELECT task_id, unit_id, batch_index, total_duration_ms, status, created_at
      FROM batch_performance_log
      WHERE created_at >= NOW() - INTERVAL '1 day'
      ORDER BY total_duration_ms DESC
      LIMIT 10
    `;

    const failedTrend = await sql`
      SELECT date_trunc('hour', created_at) AS hour, COUNT(*)::int AS cnt
      FROM import_tasks
      WHERE status IN ('failed', 'partial_success')
        AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const pendingRows = backlog[0]?.pending_rows ?? 0;
    const queueAlert =
      !hasQStash() && (outbox[0]?.failed ?? 0) > 20
        ? "red"
        : pendingRows >= 5000
          ? "orange"
          : "ok";

    return NextResponse.json({
      throughput_per_minute: throughput,
      queue: {
        ...backlog[0],
        outbox: outbox[0],
        qstash_configured: hasQStash(),
        alert: queueAlert,
        alert_message:
          queueAlert === "orange"
            ? "队列积压超过 5000 行"
            : queueAlert === "red"
              ? "Outbox 失败较多或队列异常"
              : null,
      },
      stage_latency: {
        parse: stage("parse_duration_ms"),
        rule: stage("rule_duration_ms"),
        validate: stage("validate_duration_ms"),
        insert: stage("insert_duration_ms"),
        total: stage("total_duration_ms"),
      },
      error_distribution: errorDist,
      slow_batches_top10: slowBatches,
      failed_task_trend: failedTrend,
      sample_size: perf.length,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
