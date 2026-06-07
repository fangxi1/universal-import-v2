"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button, toast } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { PerfMetricsBanner } from "@/components/import/PerfMetricsBanner";
import { SubmitResultPanel } from "@/components/import/SubmitResultPanel";
import type { ImportPerfMetrics } from "@/lib/performance/timing";
import { VirtualOrderTable } from "@/components/preview/VirtualOrderTable";
import { ValidationPanel } from "@/components/preview/ValidationPanel";
import { exportOrdersToExcel } from "@/lib/export/excel-export";
import { createEmptyOrderRow } from "@/lib/engine/utils";
import {
  clearPreviewData,
  getDraftUpdatedAt,
  persistPreviewDraft,
  type ImportMeta,
} from "@/lib/storage/session";
import type { OrderField, OrderRow, ParseProgress, SubmitResult } from "@/types";
import { validatePreviewData } from "@/lib/validation/order-validator";

const SUBMIT_CHUNK_SIZE = 500;
const LARGE_ROW_COUNT = 500;
const VALIDATION_ERROR_DISPLAY_LIMIT = 80;

interface ImportDataEditorProps {
  initialRows: OrderRow[];
  meta: ImportMeta;
  perfMetrics?: ImportPerfMetrics | null;
  onRenderMeasured?: (renderMs: number) => void;
  onBack?: () => void;
  backLabel?: string;
}

export function ImportDataEditor({
  initialRows,
  meta,
  perfMetrics,
  onRenderMeasured,
  onBack,
  backLabel = "返回导入",
}: ImportDataEditorProps) {
  const router = useRouter();
  const validationRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<OrderRow[]>(initialRows);
  const [dbCodes, setDbCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<ParseProgress>({
    percent: 0,
    current: 0,
    total: 0,
    stage: "",
  });
  const [submitResult, setSubmitResult] = useState<
    (SubmitResult & { batchId?: string }) | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    getDraftUpdatedAt()
  );
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderMeasuredRef = useRef(false);
  const onRenderMeasuredRef = useRef(onRenderMeasured);
  onRenderMeasuredRef.current = onRenderMeasured;

  useEffect(() => {
    const codes = [
      ...new Set(
        rows
          .map((r) => r.externalCode?.trim())
          .filter((c): c is string => Boolean(c))
      ),
    ];
    if (!codes.length) {
      setDbCodes([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch("/api/orders/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      })
        .then((r) => r.json())
        .then((j) => setDbCodes(j.existing ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [rows]);

  useEffect(() => {
    renderMeasuredRef.current = false;
  }, [initialRows]);

  useEffect(() => {
    if (renderMeasuredRef.current || !onRenderMeasuredRef.current) return;

    const mountAt = performance.now();
    let cancelled = false;
    const frame1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || renderMeasuredRef.current) return;
        renderMeasuredRef.current = true;
        onRenderMeasuredRef.current?.(performance.now() - mountAt);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
    };
  }, [initialRows]);

  useEffect(() => {
    if (initialRows.length <= LARGE_ROW_COUNT) return;
    const idle =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 2000);
    const id = idle(() => {
      try {
        sessionStorage.setItem(
          "universal-import-meta",
          JSON.stringify(meta)
        );
      } catch {
        /* skip heavy draft for large imports */
      }
    });
    return () => {
      if (typeof cancelIdleCallback !== "undefined" && typeof id === "number") {
        cancelIdleCallback(id);
      }
    };
  }, [initialRows, meta]);

  const deferredRows = useDeferredValue(rows);

  const errors = useMemo(
    () => validatePreviewData(deferredRows, dbCodes),
    [deferredRows, dbCodes]
  );
  const validating = deferredRows !== rows;

  const errorRowCount = useMemo(
    () => new Set(errors.map((e) => e.rowIndex)).size,
    [errors]
  );

  const syncDraft = useCallback(
    (nextRows: OrderRow[], markDirty = true) => {
      if (nextRows.length <= LARGE_ROW_COUNT) {
        persistPreviewDraft(nextRows, meta);
      } else {
        try {
          sessionStorage.setItem(
            "universal-import-meta",
            JSON.stringify(meta)
          );
        } catch {
          /* skip */
        }
      }
      if (markDirty) setDirty(true);
      setLastSavedAt(Date.now());
    },
    [meta]
  );

  const handleChange = useCallback(
    (index: number, field: OrderField, value: string) => {
      setSubmitResult(null);
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          if (next.length <= LARGE_ROW_COUNT) {
            persistPreviewDraft(next, meta);
          }
          setDirty(true);
          setLastSavedAt(Date.now());
        }, 600);
        return next;
      });
    },
    [meta]
  );

  const handleDelete = (index: number) => {
    setSubmitResult(null);
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncDraft(next);
      return next;
    });
    toast.success("已删除该行");
  };

  const handleAddRow = () => {
    setSubmitResult(null);
    setRows((prev) => {
      const next = [
        ...prev,
        { ...createEmptyOrderRow(uuidv4()), id: uuidv4() } as OrderRow,
      ];
      syncDraft(next);
      return next;
    });
  };

  const handleExport = () => {
    exportOrdersToExcel(rows, `${meta.fileName ?? "运单"}_导出.xlsx`);
    toast.success("已导出 Excel");
  };

  const handleSaveDraft = () => {
    syncDraft(rows);
    setDirty(false);
    toast.success("修改已暂存，刷新页面不会丢失");
  };

  const handleSubmitOrder = async () => {
    if (errors.length > 0) {
      toast.error(
        `存在 ${errors.length} 个错误（涉及 ${errorRowCount} 行），请先修正后再提交下单`
      );
      validationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (rows.length === 0) {
      toast.error("没有可提交的数据");
      return;
    }

    setSubmitting(true);
    setSubmitResult(null);
    setSubmitProgress({
      percent: 0,
      current: 0,
      total: rows.length,
      stage: "正在提交下单...",
    });

    const allErrors: SubmitResult["errors"] = [];
    let batchId: string | undefined;
    let cumulativeSuccess = 0;
    let cumulativeFailed = 0;

    const total = rows.length;
    const updateProgress = (completed: number, stage: string) => {
      const percent =
        total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      setSubmitProgress({
        percent,
        current: completed,
        total,
        stage,
      });
    };

    try {
      updateProgress(0, "正在提交下单...");

      for (let offset = 0; offset < rows.length; offset += SUBMIT_CHUNK_SIZE) {
        const chunk = rows.slice(offset, offset + SUBMIT_CHUNK_SIZE);
        const completed = Math.min(offset + chunk.length, rows.length);

        updateProgress(
          offset,
          `正在写入数据库 · ${offset + 1}-${completed}/${total} 条`
        );

        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk,
            fileName: meta.fileName,
            ruleId: meta.ruleId,
            batchId,
            totalRows: rows.length,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "提交失败");

        batchId = json.batchId;
        cumulativeSuccess = json.success ?? cumulativeSuccess;
        cumulativeFailed = json.failed ?? cumulativeFailed;

        if (json.errors?.length) {
          allErrors.push(
            ...json.errors.map(
              (e: { rowIndex: number; message: string }) => ({
                rowIndex: e.rowIndex + offset,
                message: e.message,
              })
            )
          );
        }

        updateProgress(completed, `已写入 ${completed}/${total} 条`);
      }

      updateProgress(total, "提交完成");

      const result: SubmitResult & { batchId?: string } = {
        success: cumulativeSuccess,
        failed: cumulativeFailed,
        errors: allErrors,
        batchId,
      };
      setSubmitResult(result);

      if (result.failed === 0) {
        clearPreviewData();
        setDirty(false);
        toast.success(`提交成功！共 ${result.success} 条已写入数据库`);
      } else if (result.success > 0) {
        toast.warning(
          `部分提交成功：成功 ${result.success} 条，失败 ${result.failed} 条`
        );
      } else {
        toast.error(`提交失败：${result.failed} 条均未写入数据库`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitComplete = submitResult !== null && !submitting;
  const allSubmitted =
    submitComplete && submitResult.failed === 0 && submitResult.success > 0;

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-20 animate-fade-in">
      <PageHeader
        title="数据预览与编辑"
        subtitle={`${meta.fileName} · 规则：${meta.ruleName ?? "未知"} · 共 ${rows.length} 条 · 类 Excel 表格，单击单元格直接编辑`}
        extra={
          <div className="flex gap-2 flex-wrap">
            {onBack && !submitting && (
              <Button variant="secondary" size="sm" onClick={onBack}>
                {backLabel}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleExport}>
              导出 Excel
            </Button>
          </div>
        }
      />

      {perfMetrics && <PerfMetricsBanner metrics={perfMetrics} />}

      {(dirty || lastSavedAt) && !allSubmitted && (
        <div className="mb-3 px-4 py-2.5 bg-[var(--primary-light)] border border-[var(--primary-muted)] rounded-xl text-xs text-[var(--primary-darker)] flex items-center justify-between">
          <span>
            {dirty ? "● 有未暂存的修改" : "✓ 修改已自动暂存"}
            {lastSavedAt &&
              ` · 最后保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN")}`}
          </span>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="text-[var(--primary)] hover:underline font-medium"
          >
            立即暂存
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Card noPadding className="p-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">总条数</p>
          <p className="text-xl font-bold text-[var(--primary)]">{rows.length}</p>
        </Card>
        <Card noPadding className="p-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">校验错误</p>
          <p
            className="text-xl font-bold"
            style={{ color: errors.length ? "var(--danger)" : "var(--success)" }}
          >
            {errors.length}
          </p>
        </Card>
        <Card noPadding className="p-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">错误行数</p>
          <p
            className="text-xl font-bold"
            style={{ color: errorRowCount ? "var(--danger)" : "var(--success)" }}
          >
            {errorRowCount}
          </p>
        </Card>
        <Card noPadding className="p-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">提交状态</p>
          <p className="text-sm font-medium mt-1">
            {allSubmitted ? (
              <span className="text-[var(--success)]">已全部提交</span>
            ) : errors.length === 0 ? (
              <span className="text-[var(--success)]">可提交下单</span>
            ) : (
              <span className="text-[var(--danger)]">需修正后提交</span>
            )}
          </p>
        </Card>
      </div>

      <div ref={validationRef}>
        <ValidationPanel
          errors={errors}
          displayLimit={VALIDATION_ERROR_DISPLAY_LIMIT}
          pending={validating}
        />
      </div>

      {submitting && (
        <Card title="提交进度" className="mb-4">
          <ProgressBar
            percent={submitProgress.percent}
            label={submitProgress.stage}
            detail={`${submitProgress.current}/${submitProgress.total} 条 · ${submitProgress.percent}%`}
          />
        </Card>
      )}

      {submitComplete && submitResult && (
        <SubmitResultPanel
          result={submitResult}
          total={rows.length}
          onViewOrders={() => router.push("/orders")}
          onContinue={
            submitResult.failed > 0
              ? () => setSubmitResult(null)
              : undefined
          }
        />
      )}

      <Card
        title={`预览列表 (${rows.length} 条)`}
        extra={
          !allSubmitted && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleAddRow}>
                + 新增空行
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport}>
                导出 Excel
              </Button>
            </div>
          )
        }
        noPadding
      >
        {rows.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-muted)] p-5">
            暂无数据，请点击「新增行」手动添加
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={handleAddRow}>
                + 新增空行
              </Button>
            </div>
          </div>
        ) : (
          <VirtualOrderTable
            rows={rows}
            errors={errors}
            onChange={handleChange}
            onDelete={handleDelete}
          />
        )}
      </Card>

      {!allSubmitted && (
        <StickyActionBar
          left={
            <>
              <Button variant="secondary" size="sm" onClick={handleAddRow}>
                + 新增行
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSaveDraft}>
                暂存修改
              </Button>
              {errors.length > 0 && (
                <span className="text-xs text-[var(--danger)] hidden lg:inline">
                  有 {errorRowCount} 行存在错误，修正后方可提交
                </span>
              )}
            </>
          }
        >
          <Button
            variant="secondary"
            size="lg"
            onClick={handleSaveDraft}
            className="hidden sm:inline-flex"
          >
            暂存修改
          </Button>
          <Button
            variant="save"
            size="lg"
            onClick={handleSubmitOrder}
            loading={submitting}
            disabled={
              errors.length > 0 || rows.length === 0 || submitting || validating
            }
            className="min-w-[140px] w-full sm:w-auto flex-1 sm:flex-none"
          >
            提交下单
          </Button>
        </StickyActionBar>
      )}
    </div>
  );
}
