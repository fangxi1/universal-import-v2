"use client";

import type { SubmitResult } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function SubmitResultPanel({
  result,
  total,
  onViewOrders,
  onContinue,
}: {
  result: SubmitResult & { batchId?: string };
  total: number;
  onViewOrders: () => void;
  onContinue?: () => void;
}) {
  const allSuccess = result.failed === 0 && result.success > 0;

  return (
    <Card
      title="提交结果"
      className={`mb-4 ${allSuccess ? "border-[var(--primary-muted)]" : "border-amber-200"}`}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="stat-success p-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">提交总数</p>
          <p className="text-xl font-bold text-[var(--text)]">{total}</p>
        </div>
        <div className="stat-success p-3 text-center">
          <p className="text-xs text-[var(--primary-darker)]">成功</p>
          <p className="text-xl font-bold text-[var(--primary-darker)]">
            {result.success} 条
          </p>
        </div>
        <div className="stat-danger p-3 text-center col-span-2 sm:col-span-1">
          <p className="text-xs text-[var(--danger)]">失败</p>
          <p className="text-xl font-bold text-[var(--danger)]">{result.failed} 条</p>
        </div>
      </div>

      {allSuccess ? (
        <p className="text-sm text-[var(--primary-darker)] mb-4">
          ✓ 全部 {result.success} 条已成功写入数据库并持久化保存。
        </p>
      ) : result.success > 0 ? (
        <p className="text-sm text-amber-700 mb-4">
          部分数据已写入数据库（成功 {result.success} 条，失败 {result.failed}{" "}
          条）。请查看下方失败明细并修正后重新提交失败行。
        </p>
      ) : (
        <p className="text-sm text-red-600 mb-4">
          提交未成功，请查看失败原因后修正数据再试。
        </p>
      )}

      {result.errors.length > 0 && (
        <div className="mb-4 max-h-40 overflow-auto border border-red-100 rounded-lg bg-red-50/50">
          <ul className="divide-y divide-red-100">
            {result.errors.map((err, i) => (
              <li key={i} className="px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">第 {err.rowIndex + 1} 行</span>
                <span className="mx-1">·</span>
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onViewOrders}>查看已导入运单</Button>
        {onContinue && !allSuccess && (
          <Button variant="secondary" onClick={onContinue}>
            继续修正
          </Button>
        )}
      </div>
    </Card>
  );
}
