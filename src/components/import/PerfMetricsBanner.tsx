"use client";

import type { ImportPerfMetrics } from "@/lib/performance/timing";
import { formatMs, PERF_THRESHOLDS } from "@/lib/performance/timing";

export function PerfMetricsBanner({ metrics }: { metrics: ImportPerfMetrics }) {
  const total =
    metrics.totalMs ??
    metrics.uploadMs + metrics.extractMs + metrics.parseMs + (metrics.renderMs ?? 0);
  const totalOk = total <= PERF_THRESHOLDS.totalImportSec * 1000;
  const renderOk =
    metrics.renderMs == null ||
    metrics.renderMs <= PERF_THRESHOLDS.renderSec * 1000;

  return (
    <div className="alert-success px-4 py-3 mb-4 animate-fade-in">
      <p className="text-sm font-semibold mb-2">
        性能指标 · {metrics.rowCount} 条
        <span
          className={`ml-2 text-xs font-normal ${totalOk ? "text-[var(--primary-darker)]" : "text-[var(--warning)]"}`}
        >
          {totalOk ? "✓ 总耗时达标（≤10s）" : "⚠ 总耗时超过 10s"}
        </span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="bg-white/60 rounded-lg px-2 py-1.5">
          <span className="text-[var(--text-muted)]">上传读取</span>
          <p className="font-semibold tabular-nums">{formatMs(metrics.uploadMs)}</p>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5">
          <span className="text-[var(--text-muted)]">文件解析</span>
          <p className="font-semibold tabular-nums">{formatMs(metrics.extractMs)}</p>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5">
          <span className="text-[var(--text-muted)]">规则执行</span>
          <p className="font-semibold tabular-nums">{formatMs(metrics.parseMs)}</p>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5">
          <span className="text-[var(--text-muted)]">列表渲染</span>
          <p
            className={`font-semibold tabular-nums ${renderOk ? "" : "text-[var(--warning)]"}`}
          >
            {metrics.renderMs != null ? formatMs(metrics.renderMs) : "—"}
            {metrics.renderMs != null && (
              <span className="font-normal text-[var(--text-muted)] ml-1">
                {renderOk ? "✓" : ">3s"}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5 col-span-2 sm:col-span-1">
          <span className="text-[var(--text-muted)]">总计</span>
          <p className="font-semibold tabular-nums text-[var(--primary-darker)]">
            {formatMs(total)}
          </p>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-2">
        虚拟列表仅渲染可见行 · Excel 在 Web Worker 解析 · 提交采用批量写入（500 条/批） · 不含 AI 时间
      </p>
    </div>
  );
}
