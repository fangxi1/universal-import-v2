import type { FilePreviewData, ParseRuleConfig } from "@/types";
import { detectCardTransferSheet } from "@/lib/engine/card-transfer-rule";
import { findColumnIndex } from "@/lib/engine/utils";
import { detectShippingDeliverySheet } from "@/lib/engine/shipping-delivery-rule";

const GROUP_KEY_HEADER = /^(配送单号|外部单号|订单号|单号)$/;
const GROUP_KEY_LOOSE = /配送单号|外部编码|订单号/;
const ITEM_CODE_HEADER = /物品编码|SKU编码|sku编码|货号|商品编码/;
const ITEM_QTY_HEADER = /实发数量|发货数量|订货数量|数量|件数/;

export function rowIsGroupDeliveryHeader(row: string[]): boolean {
  const line = row.join(" ");
  const hasKey =
    row.some((c) => GROUP_KEY_LOOSE.test(c.trim())) || GROUP_KEY_LOOSE.test(line);
  const hasCode =
    row.some((c) => ITEM_CODE_HEADER.test(c)) || ITEM_CODE_HEADER.test(line);
  const hasQty =
    row.some((c) => ITEM_QTY_HEADER.test(c)) || ITEM_QTY_HEADER.test(line);
  return hasKey && hasCode && hasQty;
}

export function findGroupDeliveryHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rowIsGroupDeliveryHeader(rows[i])) return i;
  }
  return -1;
}

export function countDuplicateGroupKeys(
  rows: string[][],
  headerRowIndex: number,
  keyField = "配送单号"
): number {
  const headers = rows[headerRowIndex] ?? [];
  const keyCol = findColumnIndex(headers, keyField);
  if (keyCol < 0) return 0;

  const counts = new Map<string, number>();
  for (const row of rows.slice(headerRowIndex + 1)) {
    const key = row[keyCol]?.trim() ?? "";
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((n) => n > 1).length;
}

/** 湖南仓类：标准表格 + 按配送单号跨行聚合共享收货信息 */
export function detectGroupByDeliverySheet(data: FilePreviewData): {
  isGroupBy: boolean;
  headerRowIndex: number;
  duplicateOrderCount: number;
  columnCount: number;
  groupKeyField: string;
} {
  const rows = data.sheets?.[0]?.rows ?? [];
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);

  if (detectCardTransferSheet(data).isCard) {
    return {
      isGroupBy: false,
      headerRowIndex: -1,
      duplicateOrderCount: 0,
      columnCount,
      groupKeyField: "配送单号",
    };
  }

  const shipping = detectShippingDeliverySheet(data);
  if (shipping.isShipping) {
    return {
      isGroupBy: false,
      headerRowIndex: -1,
      duplicateOrderCount: 0,
      columnCount,
      groupKeyField: "配送单号",
    };
  }

  const headerRowIndex = findGroupDeliveryHeaderRow(rows);
  if (headerRowIndex < 0) {
    return {
      isGroupBy: false,
      headerRowIndex: -1,
      duplicateOrderCount: 0,
      columnCount,
      groupKeyField: "配送单号",
    };
  }

  const headers = rows[headerRowIndex] ?? [];
  const groupKeyField = headers.find((h) => GROUP_KEY_HEADER.test(h.trim()))
    ? "配送单号"
    : headers.find((h) => /配送单号/.test(h) && !/汇总/.test(h))
      ? headers.find((h) => /配送单号/.test(h) && !/汇总/.test(h))!
      : "配送单号";

  const duplicateOrderCount = countDuplicateGroupKeys(
    rows,
    headerRowIndex,
    groupKeyField
  );

  const isGroupBy =
    duplicateOrderCount >= 1 ||
    (headerRowIndex <= 1 &&
      rows.some((r) => /收货机构|物品行号|配送汇总单号/.test(r.join(" "))));

  return {
    isGroupBy,
    headerRowIndex,
    duplicateOrderCount,
    columnCount,
    groupKeyField,
  };
}

export function buildGroupByDeliveryRuleConfig(): ParseRuleConfig {
  return {
    fileTypes: ["xlsx", "xls"],
    description:
      "按配送单号跨行聚合：同单号多物品行共享收货机构/收货人/电话/地址（湖南仓发货明细类）",
    steps: [
      { type: "skipRows", count: 1 },
      { type: "extractTable", headerRow: 0, skipPatterns: ["合计", "总计", "小计"] },
      {
        type: "groupBy",
        keyField: "配送单号",
        inheritFields: [
          "配送汇总单号",
          "收货机构",
          "收货门店",
          "收货人",
          "收件人",
          "联系人",
          "收货电话",
          "电话",
          "联系电话",
          "收货地址",
          "地址",
        ],
      },
      {
        type: "filterRows",
        skipPatterns: ["合计", "总计", "说明"],
        skipEmptySku: true,
      },
      {
        type: "mapFields",
        mappings: [
          { target: "externalCode", source: "配送单号", transform: "trim" },
          { target: "storeName", source: "收货机构", transform: "trim" },
          { target: "storeName", source: "收货门店", transform: "trim" },
          { target: "recipientName", source: "收货人", transform: "trim" },
          { target: "recipientName", source: "收件人", transform: "trim" },
          { target: "recipientName", source: "联系人", transform: "trim" },
          {
            target: "recipientPhone",
            source: "收货电话",
            transform: "phone",
          },
          { target: "recipientPhone", source: "联系电话", transform: "phone" },
          { target: "recipientPhone", source: "电话", transform: "phone" },
          { target: "recipientAddress", source: "收货地址", transform: "trim" },
          { target: "recipientAddress", source: "地址", transform: "trim" },
          { target: "skuCode", source: "物品编码", transform: "trim" },
          { target: "skuCode", source: "SKU编码", transform: "trim" },
          { target: "skuName", source: "物品名称", transform: "trim" },
          { target: "skuSpec", source: "规格型号", transform: "trim" },
          { target: "skuSpec", source: "规格", transform: "trim" },
          { target: "skuQuantity", source: "实发数量", transform: "number" },
          { target: "skuQuantity", source: "发货数量", transform: "number" },
          { target: "skuQuantity", source: "订货数量", transform: "number" },
          { target: "skuQuantity", source: "数量", transform: "number" },
        ],
      },
      { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
    ],
  };
}

export function buildGroupByDeliveryRuleFromData(data: FilePreviewData): {
  config: ParseRuleConfig;
  analysis: string;
  confidence: "high" | "medium" | "low";
  guessedMappings: string[];
} {
  const detected = detectGroupByDeliverySheet(data);
  const config = buildGroupByDeliveryRuleConfig();

  if (detected.isGroupBy) {
    return {
      config,
      analysis:
        `检测到按单号跨行聚合结构（约 ${detected.columnCount} 列）：` +
        `第 ${detected.headerRowIndex + 1} 行表头，按「${detected.groupKeyField}」分组，` +
        `同单号 ${detected.duplicateOrderCount || "多"} 组重复单号，物品行共享收货机构/电话/地址。`,
      confidence:
        detected.duplicateOrderCount >= 2 && detected.columnCount >= 10
          ? "high"
          : "medium",
      guessedMappings: [
        "groupBy 配送单号",
        "inherit 收货机构/收货人/电话/地址",
        "实发数量列",
        "skipRows 跳过说明行",
      ],
    };
  }

  return {
    config,
    analysis: "已应用按单号跨行聚合默认规则，请试解析确认配送单号列与 inherit 字段。",
    confidence: "low",
    guessedMappings: ["配送单号分组", "跨行 inherit 字段", "物品列映射"],
  };
}

export function sanitizeGroupByDeliveryRuleConfig(
  config: ParseRuleConfig,
  data?: FilePreviewData
): ParseRuleConfig {
  if (data && !detectGroupByDeliverySheet(data).isGroupBy) return config;
  const base = buildGroupByDeliveryRuleConfig();
  return {
    ...base,
    description: config.description || base.description,
  };
}
