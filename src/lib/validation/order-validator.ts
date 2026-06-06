import type { OrderField, OrderRow, ValidationError } from "@/types";
import { FIELD_LABELS, ORDER_FIELDS } from "@/types";

const PHONE_RE =
  /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$|^400-?\d{3}-?\d{4}$/;

/** 温层可选值 */
export const TEMP_LAYER_OPTIONS = ["常温", "冷藏", "冷冻", "恒温"] as const;

function hasGroupA(row: OrderRow): boolean {
  return !!row.storeName?.trim();
}

function hasGroupB(row: OrderRow): boolean {
  return (
    !!row.recipientName?.trim() &&
    !!row.recipientPhone?.trim() &&
    !!row.recipientAddress?.trim()
  );
}

export function validateRow(row: OrderRow, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!hasGroupA(row) && !hasGroupB(row)) {
    errors.push({
      rowIndex,
      field: "row",
      message: "A组(收货门店)与B组(收件人姓名+电话+地址)至少填写一组",
    });
  }

  if (!row.skuCode?.trim()) {
    errors.push({ rowIndex, field: "skuCode", message: "SKU物品编码为必填项" });
  }
  if (!row.skuName?.trim()) {
    errors.push({ rowIndex, field: "skuName", message: "SKU物品名称为必填项" });
  }

  const qty = row.skuQuantity?.trim();
  if (!qty) {
    errors.push({ rowIndex, field: "skuQuantity", message: "SKU发货数量(件数)为必填项" });
  } else {
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push({
        rowIndex,
        field: "skuQuantity",
        message: "SKU发货数量(件数)必须为正数",
      });
    } else if (n !== Math.floor(n)) {
      errors.push({
        rowIndex,
        field: "skuQuantity",
        message: "SKU发货数量(件数)必须为正整数",
      });
    }
  }

  const weight = row.weight?.trim();
  if (!weight) {
    errors.push({
      rowIndex,
      field: "weight",
      message: "重量(kg)为必填项",
    });
  } else {
    const w = parseFloat(weight);
    if (!Number.isFinite(w) || w <= 0) {
      errors.push({
        rowIndex,
        field: "weight",
        message: "重量必须为正数",
      });
    }
  }

  const temp = row.tempLayer?.trim();
  if (!temp) {
    errors.push({
      rowIndex,
      field: "tempLayer",
      message: "温层为必填项",
    });
  } else if (!TEMP_LAYER_OPTIONS.includes(temp as (typeof TEMP_LAYER_OPTIONS)[number])) {
    errors.push({
      rowIndex,
      field: "tempLayer",
      message: `温层值不在范围内，可选：${TEMP_LAYER_OPTIONS.join("、")}`,
    });
  }

  if (row.recipientPhone?.trim() && !PHONE_RE.test(row.recipientPhone.trim())) {
    errors.push({
      rowIndex,
      field: "recipientPhone",
      message: "收件人电话格式不正确",
    });
  }

  return errors;
}

/** 汇总全部校验（字段 + 批次重复 + 历史重复） */
export function validatePreviewData(
  rows: OrderRow[],
  existingCodes: string[] = []
): ValidationError[] {
  const fieldErrors = validateAllRows(rows);
  const batchDup = findDuplicateExternalCodes(rows);
  const dbDup = mergeWithDbDuplicates(rows, existingCodes);
  return [...fieldErrors, ...batchDup, ...dbDup];
}

export function validateAllRows(rows: OrderRow[]): ValidationError[] {
  const all: ValidationError[] = [];
  rows.forEach((row, i) => {
    all.push(...validateRow(row, i));
  });
  return all;
}

export function findDuplicateExternalCodes(rows: OrderRow[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const code = row.externalCode?.trim();
    if (!code) return;
    const prev = seen.get(code);
    if (prev !== undefined) {
      errors.push({
        rowIndex: i,
        field: "externalCode",
        message: `外部编码与第 ${prev + 1} 行重复`,
      });
    } else {
      seen.set(code, i);
    }
  });

  return errors;
}

export function mergeWithDbDuplicates(
  rows: OrderRow[],
  existingCodes: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const dbSet = new Set(existingCodes.filter(Boolean));

  rows.forEach((row, i) => {
    const code = row.externalCode?.trim();
    if (code && dbSet.has(code)) {
      errors.push({
        rowIndex: i,
        field: "externalCode",
        message: `外部编码「${code}」已在历史运单中存在`,
      });
    }
  });

  return errors;
}

export function getErrorFieldsForRow(
  errors: ValidationError[],
  rowIndex: number
): Set<OrderField | "row"> {
  return new Set(
    errors.filter((e) => e.rowIndex === rowIndex).map((e) => e.field)
  );
}

export function getCellErrorMessage(
  errors: ValidationError[],
  rowIndex: number,
  field: OrderField
): string | undefined {
  return errors.find((e) => e.rowIndex === rowIndex && e.field === field)?.message;
}

export function rowHasErrors(
  errors: ValidationError[],
  rowIndex: number
): boolean {
  return errors.some((e) => e.rowIndex === rowIndex);
}

/** O(1) 行级错误查询，供虚拟列表使用 */
export function buildValidationErrorIndex(
  errors: ValidationError[]
): Map<number, ValidationError[]> {
  const index = new Map<number, ValidationError[]>();
  for (const err of errors) {
    const list = index.get(err.rowIndex);
    if (list) list.push(err);
    else index.set(err.rowIndex, [err]);
  }
  return index;
}

export function getErrorFieldsFromIndex(
  index: Map<number, ValidationError[]>,
  rowIndex: number
): Set<OrderField | "row"> {
  const errs = index.get(rowIndex) ?? [];
  return new Set(errs.map((e) => e.field));
}

export function getCellErrorFromIndex(
  index: Map<number, ValidationError[]>,
  rowIndex: number,
  field: OrderField
): string | undefined {
  return index.get(rowIndex)?.find((e) => e.field === field)?.message;
}

export function hasBlockingErrors(errors: ValidationError[]): boolean {
  return errors.length > 0;
}

export { ORDER_FIELDS, FIELD_LABELS };
