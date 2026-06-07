"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";
import type { OrderField, OrderRow, ValidationError } from "@/types";
import { FIELD_LABELS, ORDER_FIELDS } from "@/types";
import {
  buildValidationErrorIndex,
  getCellErrorFromIndex,
  getErrorFieldsFromIndex,
  TEMP_LAYER_OPTIONS,
} from "@/lib/validation/order-validator";

interface VirtualOrderTableProps {
  rows: OrderRow[];
  errors: ValidationError[];
  onChange: (index: number, field: OrderField, value: string) => void;
  onDelete: (index: number) => void;
}

const COL_WIDTH = 130;
const ROW_NUM_WIDTH = 52;
const ACTION_WIDTH = 56;
const ROW_HEIGHT = 40;

const OrderRowView = memo(function OrderRowView({
  row,
  rowIndex,
  tableWidth,
  errorFields,
  hasRowError,
  errorIndex,
  onChange,
  onDelete,
  onKeyDown,
}: {
  row: OrderRow;
  rowIndex: number;
  tableWidth: number;
  errorFields: Set<OrderField | "row">;
  hasRowError: boolean;
  errorIndex: Map<number, ValidationError[]>;
  onChange: VirtualOrderTableProps["onChange"];
  onDelete: VirtualOrderTableProps["onDelete"];
  onKeyDown: (
    e: React.KeyboardEvent,
    rowIndex: number,
    fieldIndex: number
  ) => void;
}) {
  return (
    <div
      className={`absolute left-0 flex items-stretch border-b border-[var(--border)] ${
        hasRowError
          ? "bg-red-50/40 border-l-[3px] border-l-red-400"
          : "border-l-[3px] border-l-transparent hover:bg-[var(--row-hover)]"
      }`}
      style={{ width: tableWidth, height: ROW_HEIGHT }}
    >
      <div
        className={`sticky left-0 z-20 shrink-0 flex items-center justify-center text-xs border-r border-[var(--border)] ${
          hasRowError
            ? "bg-red-50 text-red-600 font-medium"
            : "bg-white text-[var(--text-muted)]"
        }`}
        style={{ width: ROW_NUM_WIDTH }}
      >
        {rowIndex + 1}
      </div>

      {ORDER_FIELDS.map((field, fi) => {
        const hasError =
          errorFields.has(field) ||
          (errorFields.has("row") &&
            ["storeName", "recipientName", "recipientPhone", "recipientAddress"].includes(
              field
            ));
        const cellError = getCellErrorFromIndex(errorIndex, rowIndex, field);
        const isTempLayer = field === "tempLayer";

        return (
          <div
            key={field}
            className="shrink-0 flex items-center px-0.5 border-r border-[var(--border)]/60"
            style={{ width: COL_WIDTH }}
          >
            <input
              data-cell={`${rowIndex}-${fi}`}
              value={row[field]}
              list={isTempLayer ? "temp-layer-options" : undefined}
              title={cellError ? cellError : `点击编辑 ${FIELD_LABELS[field]}`}
              placeholder="—"
              onChange={(e) => onChange(rowIndex, field, e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => onKeyDown(e, rowIndex, fi)}
              className={`w-full h-8 px-1.5 text-xs rounded outline-none transition-all ${
                hasError
                  ? "border border-red-400 bg-red-50 text-red-800 ring-1 ring-red-200"
                  : "border border-transparent focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/15 bg-transparent"
              }`}
            />
          </div>
        );
      })}

      <div
        className="shrink-0 flex items-center justify-center"
        style={{ width: ACTION_WIDTH }}
      >
        <button
          type="button"
          onClick={() => onDelete(rowIndex)}
          className="text-xs text-red-400 hover:text-red-600 px-1"
          title="删除此行"
        >
          删除
        </button>
      </div>
    </div>
  );
});

export function VirtualOrderTable({
  rows,
  errors,
  onChange,
  onDelete,
}: VirtualOrderTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const errorIndex = useMemo(
    () => buildValidationErrorIndex(errors),
    [errors]
  );
  const tableWidth =
    ROW_NUM_WIDTH + COL_WIDTH * ORDER_FIELDS.length + ACTION_WIDTH;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const focusCell = useCallback((rowIndex: number, fieldIndex: number) => {
    const el = document.querySelector(
      `[data-cell="${rowIndex}-${fieldIndex}"]`
    ) as HTMLElement | null;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      rowIndex: number,
      fieldIndex: number
    ) => {
      const maxField = ORDER_FIELDS.length - 1;
      const maxRow = rows.length - 1;

      if (e.key === "Tab") {
        e.preventDefault();
        const next = e.shiftKey ? fieldIndex - 1 : fieldIndex + 1;
        if (next >= 0 && next <= maxField) focusCell(rowIndex, next);
        else if (!e.shiftKey && fieldIndex === maxField && rowIndex < maxRow)
          focusCell(rowIndex + 1, 0);
        else if (e.shiftKey && fieldIndex === 0 && rowIndex > 0)
          focusCell(rowIndex - 1, maxField);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (rowIndex < maxRow) focusCell(rowIndex + 1, fieldIndex);
        return;
      }

      if (e.key === "ArrowRight" && fieldIndex < maxField) {
        e.preventDefault();
        focusCell(rowIndex, fieldIndex + 1);
      }
      if (e.key === "ArrowLeft" && fieldIndex > 0) {
        e.preventDefault();
        focusCell(rowIndex, fieldIndex - 1);
      }
      if (e.key === "ArrowDown" && rowIndex < maxRow) {
        e.preventDefault();
        focusCell(rowIndex + 1, fieldIndex);
      }
      if (e.key === "ArrowUp" && rowIndex > 0) {
        e.preventDefault();
        focusCell(rowIndex - 1, fieldIndex);
      }
    },
    [focusCell, rows.length]
  );

  return (
    <div className="rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-light)]">
      {/* 横向 + 纵向滚动，表头 sticky */}
      <div
        ref={parentRef}
        className="overflow-auto max-h-[min(560px,calc(100vh-340px))]"
      >
        <div style={{ width: tableWidth, minWidth: "100%" }}>
          {/* 固定表头 */}
          <div className="sticky top-0 z-30 flex bg-[var(--primary-light)] border-b-2 border-[var(--primary-muted)] shadow-sm">
            <div
              className="sticky left-0 z-40 shrink-0 px-2 py-2.5 text-xs font-semibold text-[var(--primary-darker)] text-center bg-[var(--primary-light)] border-r border-[var(--primary-muted)]"
              style={{ width: ROW_NUM_WIDTH }}
            >
              #
            </div>
            {ORDER_FIELDS.map((field) => (
              <div
                key={field}
                className="shrink-0 px-2 py-2.5 text-xs font-semibold text-[var(--primary-darker)] border-r border-[var(--primary-muted)]/50"
                style={{ width: COL_WIDTH }}
              >
                {FIELD_LABELS[field]}
              </div>
            ))}
            <div
              className="shrink-0 text-xs font-semibold text-[var(--primary-darker)] text-center py-2.5"
              style={{ width: ACTION_WIDTH }}
            >
              操作
            </div>
          </div>

          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = rows[vItem.index];
              const errorFields = getErrorFieldsFromIndex(errorIndex, vItem.index);
              const hasRowError = errorIndex.has(vItem.index);

              return (
                <div
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: tableWidth,
                    height: `${vItem.size}px`,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <OrderRowView
                    row={row}
                    rowIndex={vItem.index}
                    tableWidth={tableWidth}
                    errorFields={errorFields}
                    hasRowError={hasRowError}
                    errorIndex={errorIndex}
                    onChange={onChange}
                    onDelete={onDelete}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <datalist id="temp-layer-options">
        {TEMP_LAYER_OPTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="px-3 py-2 bg-[var(--primary-light)]/40 border-t border-[var(--border)] text-xs text-[var(--text-muted)] flex flex-wrap gap-x-4 gap-y-1">
        <span>单击单元格编辑</span>
        <span>Tab / Enter / 方向键切换</span>
        <span>虚拟滚动 · 仅渲染可见 {virtualizer.getVirtualItems().length} / {rows.length} 行</span>
        <span className="text-red-500">红色 = 校验错误</span>
      </div>
    </div>
  );
}
