"use client";

import { useMemo, useState } from "react";
import type { ValidationError } from "@/types";
import { FIELD_LABELS } from "@/types";

export function ValidationPanel({
  errors,
  displayLimit = 80,
  pending = false,
}: {
  errors: ValidationError[];
  displayLimit?: number;
  pending?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const summary = useMemo(() => {
    const byField = new Map<string, number>();
    errors.forEach((e) => {
      const key = e.field === "row" ? "行级" : FIELD_LABELS[e.field];
      byField.set(key, (byField.get(key) ?? 0) + 1);
    });
    return byField;
  }, [errors]);

  if (!errors.length) {
    return (
      <div className="alert-success px-4 py-3 text-sm mb-4 animate-fade-in">
        {pending ? "正在校验数据…" : "✓ 所有数据校验通过，可以提交下单"}
      </div>
    );
  }

  const visibleErrors = errors.slice(0, displayLimit);
  const hiddenCount = errors.length - visibleErrors.length;

  const affectedRows = new Set(errors.map((e) => e.rowIndex)).size;

  return (
    <div className="alert-error mb-4 overflow-hidden animate-fade-in">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-red-100/50 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-red-700">
            校验未通过：共 {errors.length} 个错误，涉及 {affectedRows} 行
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            以下错误已全部列出，请修正标红单元格后再提交下单
          </p>
        </div>
        <span className="text-red-400 text-xs shrink-0 ml-2">
          {expanded ? "收起 ▲" : "展开 ▼"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-red-200">
          <div className="flex flex-wrap gap-2 py-2">
            {Array.from(summary.entries()).map(([label, count]) => (
              <span
                key={label}
                className="text-xs bg-white border border-red-200 text-red-600 px-2 py-0.5 rounded-full"
              >
                {label} × {count}
              </span>
            ))}
          </div>
          <ul className="max-h-52 overflow-auto space-y-1.5 pr-1">
            {visibleErrors.map((err, i) => (
              <li
                key={`${err.rowIndex}-${err.field}-${i}`}
                className="text-xs text-red-700 flex gap-2 py-1 px-2 rounded bg-white/80"
              >
                <span className="font-semibold shrink-0 text-red-800">
                  第 {err.rowIndex + 1} 行
                </span>
                {err.field !== "row" && (
                  <span className="shrink-0 text-red-600">
                    [{FIELD_LABELS[err.field]}]
                  </span>
                )}
                <span>{err.message}</span>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li className="text-xs text-red-600 px-2 py-1">
                还有 {hiddenCount} 条错误未展示，请修正标红单元格
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
