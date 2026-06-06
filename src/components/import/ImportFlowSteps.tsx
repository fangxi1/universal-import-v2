"use client";

import type { FileMeta } from "@/lib/engine/import-utils";
import { Button } from "@/components/ui/Button";

const STEPS = [
  { key: "upload", label: "上传文件" },
  { key: "rule", label: "选择规则" },
  { key: "parse", label: "执行解析" },
  { key: "edit", label: "预览编辑" },
] as const;

export type ImportFlowStep = (typeof STEPS)[number]["key"];

export function ImportFlowSteps({ current }: { current: ImportFlowStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="card-surface px-4 py-5 mb-4 animate-fade-in">
      <div className="flex items-center justify-between overflow-x-auto gap-2">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-[72px]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  done
                    ? "bg-[var(--primary)] text-white"
                    : active
                      ? "bg-[var(--primary)] text-white ring-4 ring-[var(--primary-light)]"
                      : "bg-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {done ? "✓" : idx + 1}
              </div>
              <span
                className={`text-xs mt-1.5 text-center whitespace-nowrap ${
                  active
                    ? "text-[var(--primary-dark)] font-semibold"
                    : done
                      ? "text-[var(--primary)]"
                      : "text-[var(--text-muted)]"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 mb-5 min-w-[16px] ${
                  idx < currentIdx ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                }`}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

export function FileInfoCard({
  meta,
  extra,
}: {
  meta: FileMeta;
  extra?: React.ReactNode;
}) {
  const typeColors: Record<string, string> = {
    Excel: "bg-green-50 text-green-700 border-green-200",
    Word: "bg-blue-50 text-blue-700 border-blue-200",
    PDF: "bg-red-50 text-red-700 border-red-200",
  };
  const badgeClass =
    typeColors[meta.typeLabel] ?? "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div className="flex items-start gap-4 p-4 bg-[var(--primary-light)] border border-[var(--primary-muted)] rounded-[var(--radius-md)]">
      <div className="text-3xl shrink-0">📄</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[var(--text)] truncate">
            {meta.name}
          </p>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${badgeClass}`}
          >
            {meta.typeLabel}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {meta.previewDesc || "等待读取..."}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          文件大小：{(meta.size / 1024).toFixed(1)} KB
          {meta.type && ` · 格式 .${meta.type}`}
        </p>
      </div>
      {extra}
    </div>
  );
}

export function ParseFailurePanel({
  message,
  fileMeta,
  onCreateRule,
  onRetry,
  onReupload,
  creating,
}: {
  message: string;
  fileMeta: FileMeta;
  onCreateRule: () => void;
  onRetry?: () => void;
  onReupload: () => void;
  creating?: boolean;
}) {
  return (
    <div className="alert-error p-4 sm:p-5 space-y-4 rounded-[var(--radius-md)]">
      <div>
        <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
          <span className="text-lg">⚠</span> 解析失败
        </p>
        <p className="text-sm text-red-600 mt-2">{message}</p>
      </div>

      <div className="bg-white border border-red-100 rounded-lg p-3">
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
          原始文件信息
        </p>
        <ul className="text-xs text-[var(--text-muted)] space-y-1">
          <li>
            文件名：<span className="text-[var(--text)]">{fileMeta.name}</span>
          </li>
          <li>
            类型：{fileMeta.typeLabel} (.{fileMeta.type ?? "?"})
          </li>
          <li>大小：{(fileMeta.size / 1024).toFixed(1)} KB</li>
          {fileMeta.previewDesc && <li>结构：{fileMeta.previewDesc}</li>}
        </ul>
      </div>

      <p className="text-xs text-red-500">
        建议：检查规则是否匹配当前文件结构，或点击「新建规则」由 AI 分析后手动微调。
      </p>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateRule} loading={creating} size="md">
          {creating ? "AI 分析中..." : "新建规则（AI 辅助）"}
        </Button>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            重新选择规则
          </Button>
        )}
        <Button variant="secondary" onClick={onReupload}>
          重新上传文件
        </Button>
      </div>
    </div>
  );
}
