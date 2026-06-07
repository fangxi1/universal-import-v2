import type { FilePreviewData, ParseRuleConfig, RuleStep } from "@/types";
import { detectCardTransferSheet } from "@/lib/engine/card-transfer-rule";
import { detectGroupByDeliverySheet } from "@/lib/engine/group-by-delivery-rule";
import { detectShippingDeliverySheet } from "@/lib/engine/shipping-delivery-rule";
import { findColumnIndex } from "@/lib/engine/utils";

const METADATA_HEADER =
  /仓库|货主|SKU名称|SKU条码|外部商品|库存|规格|在库|可用|待移|分配|冻结|单位|状态|条码|编码/i;
const SUMMARY_HEADER = /结余|合计|总计|小计|下单后/i;

export function isMetadataMatrixHeader(header: string): boolean {
  const h = header.trim();
  if (!h) return true;
  if (SUMMARY_HEADER.test(h)) return true;
  return METADATA_HEADER.test(h);
}

export function isLikelyStoreMatrixHeader(header: string): boolean {
  const h = header.trim();
  if (!h || isMetadataMatrixHeader(h)) return false;
  if (/^门店[A-Za-z0-9\u4e00-\u9fa5]*$/.test(h)) return true;
  if (/^[\u4e00-\u9fa5]{2,8}$/.test(h) && !/数量|信息/.test(h)) return true;
  return false;
}

export function findStoreMatrixHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i];
    const storeCols = row.filter((h) => isLikelyStoreMatrixHeader(h)).length;
    const line = row.join(" ");
    const hasSkuMeta = /SKU名称|SKU条码|SKU\/门店|外部商品编码/.test(line);
    if (storeCols >= 2 && hasSkuMeta) return i;
  }
  return -1;
}

export function countStoreMatrixColumns(headers: string[]): number {
  return headers.filter((h) => isLikelyStoreMatrixHeader(h)).length;
}

export function buildMatrixSkipColumns(
  headers: string[],
  skuCodeCol: number,
  skuNameCol: number
): number[] {
  const skip: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (i === skuCodeCol || i === skuNameCol) continue;
    const h = headers[i]?.trim() ?? "";
    if (!h || isMetadataMatrixHeader(h)) skip.push(i);
  }
  return skip;
}

export function resolveSkuColumns(headers: string[]): {
  skuCodeColumn: number;
  skuNameColumn: number;
  rowLabelColumn: number;
} {
  const skuNameColumn = findColumnIndex(headers, "SKU名称");
  const skuCodeColumn =
    findColumnIndex(headers, "SKU条码") >= 0
      ? findColumnIndex(headers, "SKU条码")
      : findColumnIndex(headers, "外部商品编码") >= 0
        ? findColumnIndex(headers, "外部商品编码")
        : findColumnIndex(headers, "SKU") >= 0
          ? findColumnIndex(headers, "SKU")
          : 0;
  const skuNameCol = skuNameColumn >= 0 ? skuNameColumn : skuCodeColumn;
  const skuCodeCol = skuCodeColumn >= 0 ? skuCodeColumn : skuNameCol;
  return {
    skuCodeColumn: skuCodeCol,
    skuNameColumn: skuNameCol,
    rowLabelColumn: skuCodeCol,
  };
}

export function detectStoreSkuMatrixSheet(data: FilePreviewData): {
  isMatrix: boolean;
  headerRowIndex: number;
  skipRows: number;
  storeColumnCount: number;
  columnCount: number;
} {
  const rows = data.sheets?.[0]?.rows ?? [];
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);

  if (
    detectCardTransferSheet(data).isCard ||
    detectGroupByDeliverySheet(data).isGroupBy ||
    detectShippingDeliverySheet(data).isShipping
  ) {
    return {
      isMatrix: false,
      headerRowIndex: -1,
      skipRows: 0,
      storeColumnCount: 0,
      columnCount,
    };
  }

  const headerRowIndex = findStoreMatrixHeaderRow(rows);
  if (headerRowIndex < 0) {
    return {
      isMatrix: false,
      headerRowIndex: -1,
      skipRows: 0,
      storeColumnCount: 0,
      columnCount,
    };
  }

  const headers = rows[headerRowIndex] ?? [];
  const storeColumnCount = countStoreMatrixColumns(headers);
  const hasMergedTitle =
    headerRowIndex > 0 &&
    /SKU信息|门店信息|SKU\/门店/.test(rows[headerRowIndex - 1]?.join(" ") ?? "");

  return {
    isMatrix: storeColumnCount >= 2,
    headerRowIndex,
    skipRows: hasMergedTitle ? headerRowIndex : Math.max(0, headerRowIndex),
    storeColumnCount,
    columnCount,
  };
}

export function buildStoreMatrixRuleConfig(
  detected?: ReturnType<typeof detectStoreSkuMatrixSheet>,
  headers?: string[]
): ParseRuleConfig {
  const skipRows = detected?.skipRows ?? 1;
  const header = headers ?? [];
  const skuCols = header.length
    ? resolveSkuColumns(header)
    : { skuCodeColumn: 0, skuNameColumn: 0, rowLabelColumn: 0 };
  const skipColumns = header.length
    ? buildMatrixSkipColumns(header, skuCols.skuCodeColumn, skuCols.skuNameColumn)
    : [0];

  const matrixStep: RuleStep = {
    type: "matrixTranspose",
    headerRow: 0,
    dataStartRow: 1,
    rowLabelColumn: skuCols.rowLabelColumn,
    skuCodeColumn: skuCols.skuCodeColumn,
    skuNameColumn: skuCols.skuNameColumn,
    skipColumns,
    skipHeaderPatterns: ["结余", "合计", "总计", "下单后"],
  };

  return {
    fileTypes: ["xlsx", "xls"],
    description:
      "SKU×门店矩阵：跳过合并表头，matrixTranspose 将门店列转置为独立运单（欢乐牧场类）",
    steps: [
      { type: "skipRows", count: skipRows },
      matrixStep,
      { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
    ],
  };
}

export function buildStoreMatrixRuleFromData(data: FilePreviewData): {
  config: ParseRuleConfig;
  analysis: string;
  confidence: "high" | "medium" | "low";
  guessedMappings: string[];
} {
  const detected = detectStoreSkuMatrixSheet(data);
  const headers =
    detected.headerRowIndex >= 0
      ? (data.sheets?.[0]?.rows[detected.headerRowIndex] ?? [])
      : [];
  const config = buildStoreMatrixRuleConfig(detected, headers);

  if (detected.isMatrix) {
    const skuCols = resolveSkuColumns(headers);
    return {
      config,
      analysis:
        `检测到 SKU×门店矩阵（约 ${detected.columnCount} 列）：` +
        `第 ${detected.headerRowIndex + 1} 行表头，${detected.storeColumnCount} 个门店列，` +
        `matrixTranspose 将非零数量转置为 storeName + skuQuantity 运单。`,
      confidence: detected.storeColumnCount >= 3 ? "high" : "medium",
      guessedMappings: [
        `SKU名称列 → skuName (列 ${skuCols.skuNameColumn + 1})`,
        `SKU条码/编码列 → skuCode (列 ${skuCols.skuCodeColumn + 1})`,
        `${detected.storeColumnCount} 个门店列转置`,
        "跳过合并表头行",
      ],
    };
  }

  return {
    config: buildStoreMatrixRuleConfig(),
    analysis: "已应用 SKU×门店矩阵默认规则，请试解析确认表头与门店列位置。",
    confidence: "low",
    guessedMappings: ["matrixTranspose", "门店列转置", "SKU 列映射"],
  };
}

export function sanitizeStoreMatrixRuleConfig(
  config: ParseRuleConfig,
  data?: FilePreviewData
): ParseRuleConfig {
  if (!data) return config;
  const detected = detectStoreSkuMatrixSheet(data);
  if (!detected.isMatrix) return config;
  const headers = data.sheets?.[0]?.rows[detected.headerRowIndex] ?? [];
  return buildStoreMatrixRuleConfig(detected, headers);
}
