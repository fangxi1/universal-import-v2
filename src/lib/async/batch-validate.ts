import type { OrderRow } from "@/types";
import { getSqlClient } from "@/lib/db";
import { getSkuValidateTimeoutMs } from "./config";
import { ERROR_CODES, ERROR_SUGGESTIONS, type ErrorCode } from "./error-codes";
import { maskRawValue } from "./mask";

const PHONE_RE =
  /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$|^400-?\d{3}-?\d{4}$/;

export interface RowError {
  rowNumber: number;
  fieldName: string;
  rawValue: string;
  errorCode: ErrorCode;
  errorReason: string;
  suggestion: string;
}

export interface ValidateBatchResult {
  okRows: Array<{ lineNo: number; row: OrderRow }>;
  errors: RowError[];
  degraded: boolean;
  degradeReason?: string;
  validateDurationMs: number;
  skuQueryMs: number;
}

function pushError(
  errors: RowError[],
  rowNumber: number,
  fieldName: string,
  rawValue: string,
  code: ErrorCode,
  reason: string
) {
  errors.push({
    rowNumber,
    fieldName,
    rawValue: maskRawValue(fieldName, rawValue),
    errorCode: code,
    errorReason: reason,
    suggestion: ERROR_SUGGESTIONS[code],
  });
}

async function batchLookupSkus(
  codes: string[]
): Promise<{ found: Set<string>; degraded: boolean; reason?: string; ms: number }> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return { found: new Set(), degraded: false, ms: 0 };

  const sql = getSqlClient();
  const timeoutMs = getSkuValidateTimeoutMs();
  const started = Date.now();

  try {
    const query = (async () => {
      const found = new Set<string>();
      // 分片 IN 查询，避免超长 SQL
      const chunkSize = 500;
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const rows = (await sql`
          SELECT sku_code FROM sku_master WHERE sku_code = ANY(${chunk}::text[])
        `) as Array<{ sku_code: string }>;
        for (const r of rows) found.add(r.sku_code);
      }
      return found;
    })();

    const found = await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SKU_LOOKUP_TIMEOUT")), timeoutMs)
      ),
    ]);

    return { found, degraded: false, ms: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      found: new Set(),
      degraded: true,
      reason:
        msg === "SKU_LOOKUP_TIMEOUT"
          ? `SKU 主数据查询超时（>${timeoutMs}ms），已降级跳过 SKU 存在性校验`
          : `SKU 主数据查询失败：${msg}，已降级跳过 SKU 存在性校验`,
      ms: Date.now() - started,
    };
  }
}

export async function validateParsedBatch(
  rows: Array<{ lineNo: number; row: OrderRow }>,
  options?: { checkExternalDupInBatch?: boolean }
): Promise<ValidateBatchResult> {
  const started = Date.now();
  const errors: RowError[] = [];
  const candidates: Array<{ lineNo: number; row: OrderRow }> = [];

  const seenExternal = new Set<string>();

  for (const item of rows) {
    const { lineNo, row } = item;
    let failed = false;

    if (!row.skuCode?.trim()) {
      pushError(errors, lineNo, "skuCode", row.skuCode, ERROR_CODES.E002, "SKU物品编码为必填项");
      failed = true;
    }
    if (!row.skuName?.trim()) {
      pushError(errors, lineNo, "skuName", row.skuName, ERROR_CODES.E002, "SKU物品名称为必填项");
      failed = true;
    }

    const hasStore = !!row.storeName?.trim();
    const hasRecipient =
      !!row.recipientName?.trim() &&
      !!row.recipientPhone?.trim() &&
      !!row.recipientAddress?.trim();
    if (!hasStore && !hasRecipient) {
      pushError(
        errors,
        lineNo,
        "row",
        "",
        ERROR_CODES.E002,
        "收货门店与收件人信息至少填写一组"
      );
      failed = true;
    }

    const qty = row.skuQuantity?.trim();
    if (!qty) {
      pushError(errors, lineNo, "skuQuantity", qty || "", ERROR_CODES.E002, "数量为必填项");
      failed = true;
    } else {
      const n = parseFloat(qty);
      if (!Number.isFinite(n) || n <= 0 || n !== Math.floor(n)) {
        pushError(
          errors,
          lineNo,
          "skuQuantity",
          qty,
          ERROR_CODES.E004,
          "数量必须为正整数"
        );
        failed = true;
      }
    }

    if (row.recipientPhone?.trim() && !PHONE_RE.test(row.recipientPhone.trim())) {
      pushError(
        errors,
        lineNo,
        "recipientPhone",
        row.recipientPhone,
        ERROR_CODES.E003,
        "收件人电话格式不正确"
      );
      failed = true;
    }

    if (options?.checkExternalDupInBatch !== false && row.externalCode?.trim()) {
      const key = row.externalCode.trim();
      if (seenExternal.has(key)) {
        pushError(
          errors,
          lineNo,
          "externalCode",
          key,
          ERROR_CODES.E005,
          "外部编码在本批次内重复"
        );
        failed = true;
      } else {
        seenExternal.add(key);
      }
    }

    if (!failed) candidates.push(item);
  }

  const skuCodes = candidates.map((c) => c.row.skuCode.trim());
  const skuResult = await batchLookupSkus(skuCodes);

  const okRows: Array<{ lineNo: number; row: OrderRow }> = [];
  if (skuResult.degraded) {
    okRows.push(...candidates);
  } else {
    for (const item of candidates) {
      const code = item.row.skuCode.trim();
      if (!skuResult.found.has(code)) {
        pushError(
          errors,
          item.lineNo,
          "skuCode",
          code,
          ERROR_CODES.E001,
          `SKU 不存在于主数据：${code}`
        );
      } else {
        okRows.push(item);
      }
    }
  }

  return {
    okRows,
    errors,
    degraded: skuResult.degraded,
    degradeReason: skuResult.reason,
    validateDurationMs: Date.now() - started,
    skuQueryMs: skuResult.ms,
  };
}
