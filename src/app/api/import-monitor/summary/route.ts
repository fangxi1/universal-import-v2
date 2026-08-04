import { NextResponse } from "next/server";
import { ensureTables, formatDbError, getSqlClient } from "@/lib/db";
import { hasQStash } from "@/lib/async/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureTables();
    const sql = getSqlClient();

    // 所有聚合查询并行，避免 7 次串行 Neon 往返
    const [
      throughput,
      backlog,
      outbox,
      stageRows,
      errorDist,
      slowBatches,
      failedTrend,
      sampleRows,
    ] = await Promise.all([
      sql`
        SELECT
          date_trunc('minute', COALESCE(completed_at, created_at)) AS minute,
          SUM(success_rows)::int AS success_rows
        FROM import_task_batches
        WHERE status = 'completed'
          AND COALESCE(completed_at, created_at) >= NOW() - INTERVAL '5 minutes'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'failed'))::int AS pending_batches,
          COALESCE(SUM(
            CASE WHEN status IN ('pending', 'failed')
              THEN GREATEST(0, end_row - start_row + 1) ELSE 0 END
          ), 0)::int AS pending_rows,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_batches
        FROM import_task_batches
        WHERE status IN ('pending', 'failed', 'processing')
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
        FROM event_outbox
        WHERE created_at >= NOW() - INTERVAL '1 day'
          AND status IN ('pending', 'failed', 'sent')
      `,
      sql`
        SELECT
          COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY parse_duration_ms), 0)::int AS parse_p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY parse_duration_ms), 0)::int AS parse_p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY parse_duration_ms), 0)::int AS parse_p99,
          COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY rule_duration_ms), 0)::int AS rule_p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY rule_duration_ms), 0)::int AS rule_p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY rule_duration_ms), 0)::int AS rule_p99,
          COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY validate_duration_ms), 0)::int AS validate_p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY validate_duration_ms), 0)::int AS validate_p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY validate_duration_ms), 0)::int AS validate_p99,
          COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY insert_duration_ms), 0)::int AS insert_p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY insert_duration_ms), 0)::int AS insert_p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY insert_duration_ms), 0)::int AS insert_p99,
          COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_duration_ms), 0)::int AS total_p50,
          COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY total_duration_ms), 0)::int AS total_p95,
          COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY total_duration_ms), 0)::int AS total_p99
        FROM batch_performance_log
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `,
      sql`
        SELECT error_code, COUNT(*)::int AS cnt
        FROM import_task_errors
        WHERE created_at >= NOW() - INTERVAL '1 day'
        GROUP BY error_code
        ORDER BY cnt DESC
        LIMIT 20
      `,
      sql`
        SELECT task_id, unit_id, batch_index, total_duration_ms, status, created_at
        FROM batch_performance_log
        WHERE created_at >= NOW() - INTERVAL '1 day'
        ORDER BY total_duration_ms DESC NULLS LAST
        LIMIT 10
      `,
      sql`
        SELECT date_trunc('hour', created_at) AS hour, COUNT(*)::int AS cnt
        FROM import_tasks
        WHERE status IN ('failed', 'partial_success')
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM batch_performance_log
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `,
    ]);

    const stage = (stageRows as Array<Record<string, number>>)[0] || {};
    const pendingRows =
      ((backlog as Array<{ pending_rows: number }>)[0]?.pending_rows) ?? 0;
    const outboxRow = (outbox as Array<{ pending: number; failed: number; sent: number }>)[0];
    const queueAlert =
      !hasQStash() && (outboxRow?.failed ?? 0) > 20
        ? "red"
        : pendingRows >= 5000
          ? "orange"
          : "ok";

    return NextResponse.json({
      throughput_per_minute: throughput,
      queue: {
        ...(backlog as object[])[0],
        outbox: outboxRow,
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
        parse: {
          p50: stage.parse_p50 ?? 0,
          p95: stage.parse_p95 ?? 0,
          p99: stage.parse_p99 ?? 0,
        },
        rule: {
          p50: stage.rule_p50 ?? 0,
          p95: stage.rule_p95 ?? 0,
          p99: stage.rule_p99 ?? 0,
        },
        validate: {
          p50: stage.validate_p50 ?? 0,
          p95: stage.validate_p95 ?? 0,
          p99: stage.validate_p99 ?? 0,
        },
        insert: {
          p50: stage.insert_p50 ?? 0,
          p95: stage.insert_p95 ?? 0,
          p99: stage.insert_p99 ?? 0,
        },
        total: {
          p50: stage.total_p50 ?? 0,
          p95: stage.total_p95 ?? 0,
          p99: stage.total_p99 ?? 0,
        },
      },
      error_distribution: errorDist,
      slow_batches_top10: slowBatches,
      failed_task_trend: failedTrend,
      sample_size: (sampleRows as Array<{ cnt: number }>)[0]?.cnt ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
