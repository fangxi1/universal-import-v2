"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader, StatCard } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { ERROR_LABELS } from "@/lib/async/error-codes";

interface MonitorSummary {
  throughput_per_minute: Array<{ minute: string; success_rows: number }>;
  queue: {
    pending_batches: number;
    pending_rows: number;
    processing_batches: number;
    outbox: { pending: number; failed: number; sent: number };
    qstash_configured: boolean;
    alert: "ok" | "orange" | "red";
    alert_message: string | null;
  };
  stage_latency: Record<
    string,
    { p50: number; p95: number; p99: number }
  >;
  error_distribution: Array<{ error_code: string; cnt: number }>;
  slow_batches_top10: Array<{
    task_id: string;
    unit_id: string;
    batch_index: number;
    total_duration_ms: number;
    status: string;
  }>;
  failed_task_trend: Array<{ hour: string; cnt: number }>;
  sample_size: number;
}

function BarChart({
  data,
  valueKey,
  labelKey,
}: {
  data: Array<Record<string, unknown>>;
  valueKey: string;
  labelKey: string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] || 0)));
  return (
    <div className="flex items-end gap-1 h-36">
      {data.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">暂无数据</p>
      ) : (
        data.map((d, i) => {
          const v = Number(d[valueKey] || 0);
          const h = Math.max(4, Math.round((v / max) * 120));
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="w-full rounded-t bg-[var(--primary)]/80"
                style={{ height: h }}
                title={`${d[labelKey]}: ${v}`}
              />
              <span className="text-[10px] text-[var(--text-secondary)] truncate w-full text-center">
                {String(d[labelKey] || "").slice(11, 16) || i + 1}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/import-monitor/summary");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "加载失败");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!data && !error) return <LoadingState />;

  const alertClass =
    data?.queue.alert === "red"
      ? "border-red-300 bg-red-50 text-red-800"
      : data?.queue.alert === "orange"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className="space-y-6">
      <PageHeader
        title="导入监控看板"
        subtitle="吞吐、队列积压、阶段耗时与错误分布（真实聚合）"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className={`rounded-lg border px-4 py-3 text-sm ${alertClass}`}>
            队列状态：积压 {data.queue.pending_rows} 行 /{" "}
            {data.queue.pending_batches} 批处理中{" "}
            {data.queue.processing_batches} · Outbox pending=
            {data.queue.outbox?.pending ?? 0} failed=
            {data.queue.outbox?.failed ?? 0}
            {data.queue.alert_message ? ` · ${data.queue.alert_message}` : " · 正常"}
            {" · "}
            QStash {data.queue.qstash_configured ? "已配置" : "本地直调模式"}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="积压行数" value={data.queue.pending_rows} />
            <StatCard label="处理中批次" value={data.queue.processing_batches} />
            <StatCard label="性能样本数" value={data.sample_size} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="实时吞吐量（近 5 分钟成功行/分钟）">
              <BarChart
                data={data.throughput_per_minute as unknown as Array<Record<string, unknown>>}
                valueKey="success_rows"
                labelKey="minute"
              />
            </Card>

            <Card title="错误类型分布">
              {!data.error_distribution.length ? (
                <p className="text-sm text-[var(--text-secondary)]">暂无错误</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.error_distribution.map((e) => (
                    <li key={e.error_code} className="flex justify-between gap-3">
                      <Link
                        href={`/traces?error_code=${e.error_code}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {e.error_code}{" "}
                        {ERROR_LABELS[e.error_code as keyof typeof ERROR_LABELS] ||
                          ""}
                      </Link>
                      <span className="tabular-nums">{e.cnt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="阶段耗时分布（ms）">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                    <th className="py-2">阶段</th>
                    <th className="py-2">P50</th>
                    <th className="py-2">P95</th>
                    <th className="py-2">P99</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.stage_latency).map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--border)]/50">
                      <td className="py-2 capitalize">{k}</td>
                      <td className="py-2 tabular-nums">{v.p50}</td>
                      <td className="py-2 tabular-nums">{v.p95}</td>
                      <td className="py-2 tabular-nums">{v.p99}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="慢批次 TOP 10">
              <ul className="space-y-1 text-sm">
                {data.slow_batches_top10.map((b, i) => (
                  <li key={`${b.task_id}-${b.unit_id}-${i}`} className="flex justify-between">
                    <Link
                      href={`/tasks/${b.task_id}`}
                      className="text-[var(--primary)] hover:underline truncate"
                    >
                      {b.task_id} / {b.unit_id}
                    </Link>
                    <span className="tabular-nums">{b.total_duration_ms}ms</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="失败任务趋势（24h）">
              <BarChart
                data={data.failed_task_trend as unknown as Array<Record<string, unknown>>}
                valueKey="cnt"
                labelKey="hour"
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
