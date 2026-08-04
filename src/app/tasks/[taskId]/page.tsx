"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader, StatCard } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { Pagination } from "@/components/ui/Pagination";

interface TaskDetail {
  task_id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  total_batches: number;
  completed_batches: number;
  trace_id: string;
  degraded: boolean;
  degrade_reason?: string;
  error_summary?: string;
  throughput_rows_per_sec: number;
  eta_seconds: number | null;
  recent_errors?: Array<{
    error_code: string;
    error_reason: string;
    row_number: number;
    batch_index: number;
  }>;
}

interface ErrorRow {
  id: string;
  batch_index: number;
  row_number: number;
  field_name: string;
  raw_value: string;
  error_code: string;
  error_reason: string;
  suggestion: string;
}

const DONE = new Set(["COMPLETED", "PARTIAL_SUCCESS", "FAILED"]);

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = String(params.taskId || "");
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [batchFilter, setBatchFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTask = useCallback(async () => {
    const res = await fetch(`/api/import-tasks/${taskId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载失败");
    setTask(json);
    return json as TaskDetail;
  }, [taskId]);

  const loadErrors = useCallback(async () => {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: "20",
    });
    if (batchFilter !== "") qs.set("batch", batchFilter);
    if (codeFilter) qs.set("error_code", codeFilter);
    const res = await fetch(`/api/import-tasks/${taskId}/errors?${qs}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载错误失败");
    setErrors(json.data || []);
    setErrorTotal(json.total || 0);
  }, [taskId, page, batchFilter, codeFilter]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        setError(null);
        const t = await loadTask();
        await loadErrors();
        if (!cancelled) setLoading(false);
        return t;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
          setLoading(false);
        }
        return null;
      }
    };

    tick();
    const timer = setInterval(async () => {
      const t = await tick();
      if (t && DONE.has(String(t.status).toUpperCase())) {
        /* keep polling lightly even after done for final errors */
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadTask, loadErrors]);

  const progressPct = useMemo(() => {
    if (!task?.total_rows) return 0;
    return Math.min(100, Math.round((task.processed_rows / task.total_rows) * 100));
  }, [task]);

  const exportErrors = () => {
    const header = [
      "batch_index",
      "row_number",
      "field_name",
      "raw_value",
      "error_code",
      "error_reason",
      "suggestion",
    ];
    const lines = [header.join(",")].concat(
      errors.map((e) =>
        [
          e.batch_index,
          e.row_number,
          e.field_name,
          JSON.stringify(e.raw_value ?? ""),
          e.error_code,
          JSON.stringify(e.error_reason ?? ""),
          JSON.stringify(e.suggestion ?? ""),
        ].join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${taskId}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !task) return <LoadingState />;
  if (error && !task) {
    return <p className="text-red-600 text-sm">{error}</p>;
  }
  if (!task) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.file_name}
        subtitle={`task_id=${task.task_id} · trace_id=${task.trace_id}`}
      />

      {task.degraded && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ SKU 校验已降级：
          {task.degrade_reason ||
            "本次导入未经过商品主数据完整校验，数据可能需要后续复核。"}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="状态" value={task.status} />
        <StatCard
          label="进度"
          value={`${task.processed_rows}/${task.total_rows} (${progressPct}%)`}
        />
        <StatCard
          label="成功 / 失败"
          value={`${task.success_rows} / ${task.failed_rows}`}
        />
        <StatCard
          label="吞吐 / ETA"
          value={`${task.throughput_rows_per_sec} 行/s · ${
            task.eta_seconds != null ? `${task.eta_seconds}s` : "—"
          }`}
        />
      </div>

      <Card title="处理进度">
        <div className="h-2 rounded bg-[var(--bg-muted)] overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/traces?trace_id=${task.trace_id}`}
            className="text-[var(--primary)] hover:underline"
          >
            查看 Trace 时间线
          </Link>
          <Link
            href={`/api/import-tasks/${task.task_id}/batches`}
            className="text-[var(--primary)] hover:underline"
            target="_blank"
          >
            批次性能 JSON
          </Link>
        </div>
        {task.recent_errors?.length ? (
          <div className="mt-4 text-sm">
            <div className="mb-1 text-[var(--text-secondary)]">最近错误摘要</div>
            <ul className="list-disc pl-5 space-y-1">
              {task.recent_errors.map((e, i) => (
                <li key={i}>
                  行 {e.row_number} [{e.error_code}] {e.error_reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card
        title="错误明细"
        extra={
          <Button variant="secondary" onClick={exportErrors} disabled={!errors.length}>
            导出当前页失败明细
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-3">
          <input
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
            placeholder="批次号 batch"
            value={batchFilter}
            onChange={(e) => {
              setPage(1);
              setBatchFilter(e.target.value);
            }}
          />
          <select
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
            value={codeFilter}
            onChange={(e) => {
              setPage(1);
              setCodeFilter(e.target.value);
            }}
          >
            <option value="">全部错误码</option>
            {["E001", "E002", "E003", "E004", "E005", "E006", "E007", "E008"].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              )
            )}
          </select>
        </div>

        {!errors.length ? (
          <p className="text-sm text-[var(--text-secondary)]">暂无错误记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="py-2 pr-2">批次</th>
                  <th className="py-2 pr-2">行号</th>
                  <th className="py-2 pr-2">字段</th>
                  <th className="py-2 pr-2">原始值</th>
                  <th className="py-2 pr-2">错误码</th>
                  <th className="py-2 pr-2">原因</th>
                  <th className="py-2">建议</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)]/50 align-top">
                    <td className="py-2 pr-2">{e.batch_index}</td>
                    <td className="py-2 pr-2">{e.row_number}</td>
                    <td className="py-2 pr-2">{e.field_name}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{e.raw_value}</td>
                    <td className="py-2 pr-2">{e.error_code}</td>
                    <td className="py-2 pr-2">{e.error_reason}</td>
                    <td className="py-2 text-[var(--text-secondary)]">{e.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={20}
            total={errorTotal}
            onPageChange={setPage}
          />
        </div>
      </Card>
    </div>
  );
}
