"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";

interface TaskHit {
  id: string;
  file_name: string;
  status: string;
  trace_id: string;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  event_name: string;
  event_status: string;
  message: string;
  unit_id?: string;
  occurred_at: string;
  meta?: Record<string, unknown>;
}

interface TraceError {
  id: string;
  batch_index: number;
  row_number: number;
  field_name: string;
  raw_value: string;
  error_code: string;
  error_reason: string;
  suggestion: string;
  unit_id?: string;
}

export default function TracesPage() {
  const searchParams = useSearchParams();
  const [taskId, setTaskId] = useState(searchParams.get("task_id") || "");
  const [traceId, setTraceId] = useState(searchParams.get("trace_id") || "");
  const [fileName, setFileName] = useState(searchParams.get("file_name") || "");
  const [errorCode, setErrorCode] = useState(searchParams.get("error_code") || "");
  const [batch, setBatch] = useState(searchParams.get("batch") || "");
  const [rowFrom, setRowFrom] = useState(searchParams.get("row_from") || "");
  const [rowTo, setRowTo] = useState(searchParams.get("row_to") || "");

  const [hits, setHits] = useState<TaskHit[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [errors, setErrors] = useState<TraceError[]>([]);
  const [activeTrace, setActiveTrace] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<TraceError | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (taskId) qs.set("task_id", taskId);
      if (traceId) qs.set("trace_id", traceId);
      if (fileName) qs.set("file_name", fileName);
      if (errorCode) qs.set("error_code", errorCode);
      const res = await fetch(`/api/traces?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "搜索失败");
      const list = (json.data || []) as TaskHit[];
      setHits(list);
      const first = list[0];
      if (first) {
        await loadTimeline(first.trace_id, first.id);
      } else if (traceId) {
        await loadTimeline(traceId);
      } else {
        setTimeline([]);
        setErrors([]);
        setActiveTrace("");
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, traceId, fileName, errorCode]);

  const loadTimeline = async (tid: string, task?: string) => {
    const qs = new URLSearchParams();
    if (task) qs.set("task_id", task);
    if (batch) qs.set("batch", batch);
    if (rowFrom) qs.set("row_from", rowFrom);
    if (rowTo) qs.set("row_to", rowTo);
    if (errorCode) qs.set("error_code", errorCode);
    const res = await fetch(`/api/traces/${tid}?${qs}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "加载时间线失败");
    setActiveTrace(json.trace_id);
    setTimeline(json.timeline || []);
    setErrors(json.errors || []);
    setSelectedError(null);
  };

  useEffect(() => {
    search();
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="全链路 Trace 检索"
        subtitle="按 task_id / trace_id / 文件名 / 批次 / 行号 / 错误码定位失败节点"
      />

      <Card title="搜索条件">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="task_id"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="trace_id"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="文件名"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="批次号"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="行号起"
            value={rowFrom}
            onChange={(e) => setRowFrom(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="行号止"
            value={rowTo}
            onChange={(e) => setRowTo(e.target.value)}
          />
          <select
            className="rounded border border-[var(--border)] px-3 py-2 text-sm"
            value={errorCode}
            onChange={(e) => setErrorCode(e.target.value)}
          >
            <option value="">错误码（全部）</option>
            {["E001", "E002", "E003", "E004", "E005", "E006", "E007", "E008"].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              )
            )}
          </select>
        </div>
        <div className="mt-3">
          <Button onClick={search} loading={loading}>
            搜索
          </Button>
        </div>
      </Card>

      {loading && !hits.length ? (
        <LoadingState />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="匹配任务">
            {!hits.length ? (
              <p className="text-sm text-[var(--text-secondary)]">无匹配结果</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {hits.map((h) => (
                  <li key={h.id} className="border-b border-[var(--border)]/50 pb-2">
                    <button
                      className="text-left w-full hover:text-[var(--primary)]"
                      onClick={() => loadTimeline(h.trace_id, h.id)}
                    >
                      <div className="font-medium">{h.file_name}</div>
                      <div className="font-mono text-xs text-[var(--text-secondary)]">
                        {h.id} · {h.trace_id}
                      </div>
                      <div className="text-xs">
                        {h.status} · 成功 {h.success_rows} / 失败 {h.failed_rows}
                      </div>
                    </button>
                    <Link
                      href={`/tasks/${h.id}`}
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      打开任务详情
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`时间线 ${activeTrace ? `· ${activeTrace}` : ""}`}>
            {!timeline.length ? (
              <p className="text-sm text-[var(--text-secondary)]">选择任务查看时间线</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {timeline.map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <div className="w-16 shrink-0 text-xs text-[var(--text-secondary)] tabular-nums">
                      {new Date(ev.occurred_at).toLocaleTimeString()}
                    </div>
                    <div>
                      <div className="font-medium">
                        {ev.event_name}
                        {ev.unit_id ? ` · ${ev.unit_id}` : ""}
                        <span
                          className={
                            ev.event_status === "error"
                              ? "text-red-600 ml-2"
                              : ev.event_status === "warn"
                                ? "text-amber-600 ml-2"
                                : "text-emerald-600 ml-2"
                          }
                        >
                          {ev.event_status}
                        </span>
                      </div>
                      <div className="text-[var(--text-secondary)]">{ev.message}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      <Card title="失败节点明细">
        {!errors.length ? (
          <p className="text-sm text-[var(--text-secondary)]">无错误节点</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="py-2">批次</th>
                  <th className="py-2">行号</th>
                  <th className="py-2">字段</th>
                  <th className="py-2">原始值</th>
                  <th className="py-2">错误码</th>
                  <th className="py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[var(--border)]/50 cursor-pointer hover:bg-[var(--bg-muted)]"
                    onClick={() => setSelectedError(e)}
                  >
                    <td className="py-2">{e.batch_index}</td>
                    <td className="py-2">{e.row_number}</td>
                    <td className="py-2">{e.field_name}</td>
                    <td className="py-2 font-mono text-xs">{e.raw_value}</td>
                    <td className="py-2">{e.error_code}</td>
                    <td className="py-2">{e.error_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedError && (
          <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-muted)] p-4 text-sm space-y-1">
            <div className="font-medium">失败节点详情</div>
            <div>批次：{selectedError.batch_index} / {selectedError.unit_id}</div>
            <div>行号：{selectedError.row_number}</div>
            <div>字段：{selectedError.field_name}</div>
            <div>脱敏原始值：{selectedError.raw_value}</div>
            <div>
              错误码：{selectedError.error_code} — {selectedError.error_reason}
            </div>
            <div>下一步建议：{selectedError.suggestion}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
