import type { FilePreviewData, ParseRuleConfig } from "@/types";
import { detectCardTransferSheet } from "@/lib/engine/card-transfer-rule";

const ITEM_CODE_HEADER = /物品编码|SKU编码|sku编码|货号|商品编码/;
const ITEM_QTY_HEADER = /发货数量|订货数量|出库数量|分拣数量|数量|件数/;

const TABLE_HEADER_PATTERN =
  "(物品编码|SKU编码|货号).*(发货数量|订货数量|出库数量|数量)|(发货数量|订货数量|出库数量).*(物品编码|SKU编码|货号)";

export function rowHasShippingTableHeader(row: string[]): boolean {
  const line = row.join(" ");
  const hasCode =
    row.some((c) => ITEM_CODE_HEADER.test(c)) || ITEM_CODE_HEADER.test(line);
  const hasQty =
    row.some((c) => ITEM_QTY_HEADER.test(c)) || ITEM_QTY_HEADER.test(line);
  return hasCode && hasQty;
}

export function findShippingTableHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    if (rowHasShippingTableHeader(rows[i])) return i;
  }
  return -1;
}

export function rowIsTotalRow(row: string[]): boolean {
  const first = row[0]?.trim() ?? "";
  const line = row.join(" ").trim();
  return first === "合计" || /^合计\b/.test(line) || /^总计\b/.test(line);
}

export function sheetHasTailRecipientZone(rows: string[][]): boolean {
  const tail = rows.slice(Math.max(0, rows.length - 12));
  for (const row of tail) {
    const line = row.join(" ");
    if (/收货人/.test(line) && /(收货电话|电话|联系电话)/.test(line)) return true;
    if (/收货人/.test(line) && /收货地址/.test(line)) return true;
    if (/联系人/.test(line) && /(联系电话|收货地址|收货门店)/.test(line)) return true;
    if (/收货门店/.test(line) && /(联系人|联系电话|收货地址)/.test(line)) return true;
    if (/联系电话/.test(line) && /收货地址/.test(line)) return true;
  }
  return false;
}

export function analyzeShippingSheetStructure(data: FilePreviewData): {
  isShipping: boolean;
  headerRowIndex: number;
  columnCount: number;
  hasTotalRow: boolean;
  hasTailRecipient: boolean;
  hasOutboundTitle: boolean;
} {
  const rows = data.sheets?.[0]?.rows ?? [];
  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const headerRowIndex = findShippingTableHeaderRow(rows);
  const hasTotalRow = rows.some((r) => rowIsTotalRow(r));
  const hasTailRecipient = sheetHasTailRecipientZone(rows);
  const hasOutboundTitle = rows.some((r) =>
    /出库单|发货单|配送单/.test(r.join(" "))
  );

  const isShipping =
    headerRowIndex >= 0 &&
    hasTotalRow &&
    hasTailRecipient &&
    headerRowIndex >= 1;

  return {
    isShipping,
    headerRowIndex,
    columnCount,
    hasTotalRow,
    hasTailRecipient,
    hasOutboundTitle,
  };
}

/** 发货单/出库单：干扰头 + 表头 + 表体 + 合计 + 尾部信息区 */
export function detectShippingDeliverySheet(data: FilePreviewData): {
  isShipping: boolean;
  isMultiSheet: boolean;
  sheetCount: number;
  validSheetCount: number;
  headerRowIndex: number;
  columnCount: number;
  hasTotalRow: boolean;
  hasTailRecipient: boolean;
} {
  const sheets = data.sheets ?? [];

  if (detectCardTransferSheet(data).isCard) {
    return {
      isShipping: false,
      isMultiSheet: false,
      sheetCount: sheets.length,
      validSheetCount: 0,
      headerRowIndex: -1,
      columnCount: 0,
      hasTotalRow: false,
      hasTailRecipient: false,
    };
  }

  if (sheets.length >= 2) {
    const analyses = sheets.map((s) =>
      analyzeShippingSheetStructure({ sheets: [s] })
    );
    const validSheetCount = analyses.filter((a) => a.isShipping).length;
    if (validSheetCount >= 2) {
      const first = analyses.find((a) => a.isShipping) ?? analyses[0];
      return {
        isShipping: true,
        isMultiSheet: true,
        sheetCount: sheets.length,
        validSheetCount,
        headerRowIndex: first.headerRowIndex,
        columnCount: Math.max(...analyses.map((a) => a.columnCount)),
        hasTotalRow: first.hasTotalRow,
        hasTailRecipient: first.hasTailRecipient,
      };
    }
  }

  const single = analyzeShippingSheetStructure(data);
  return {
    isShipping: single.isShipping,
    isMultiSheet: false,
    sheetCount: sheets.length,
    validSheetCount: single.isShipping ? 1 : 0,
    headerRowIndex: single.headerRowIndex,
    columnCount: single.columnCount,
    hasTotalRow: single.hasTotalRow,
    hasTailRecipient: single.hasTailRecipient,
  };
}

function buildPerSheetShippingSteps(): ParseRuleConfig["steps"] {
  return [
    {
      type: "skipUntilMatch",
      pattern: TABLE_HEADER_PATTERN,
      maxScan: 25,
    },
    {
      type: "extractTable",
      headerRow: 0,
      endMarker: "^合计|合计|总计",
      skipPatterns: ["合计", "总计", "小计"],
    },
    {
      type: "extractFooter",
      scanFromBottom: 12,
      patterns: [
        {
          field: "externalCode",
          labelPattern: "单据号[：:\\s|]*([A-Za-z0-9\\-]+)",
          valueGroup: 1,
        },
        {
          field: "storeName",
          labelPattern: "收货门店[：:\\s|]*(.+?)(?=\\s+联系人|\\s+联系电话|$)",
          valueGroup: 1,
        },
        {
          field: "recipientName",
          labelPattern: "联系人[：:\\s|]*([^\\s|联系电话地址]+)",
          valueGroup: 1,
        },
        {
          field: "recipientName",
          labelPattern: "收货人[：:\\s|]*([^\\s|收货电话地址]+)",
          valueGroup: 1,
        },
        {
          field: "recipientPhone",
          labelPattern: "联系电话[：:\\s|]*(\\d[\\d\\-+]+)",
          valueGroup: 1,
        },
        {
          field: "recipientPhone",
          labelPattern: "收货电话[：:\\s|]*(\\d[\\d\\-+]+)",
          valueGroup: 1,
        },
        {
          field: "recipientPhone",
          labelPattern: "电话[：:\\s|]*(\\d[\\d\\-+]+)",
          valueGroup: 1,
        },
        {
          field: "recipientAddress",
          labelPattern: "收货地址[：:\\s|]*(.+)",
          valueGroup: 1,
        },
        {
          field: "recipientAddress",
          labelPattern: "地址[：:\\s|]*(.+)",
          valueGroup: 1,
        },
      ],
    },
    {
      type: "filterRows",
      skipPatterns: [
        "合计",
        "总计",
        "单据号",
        "上游单据",
        "创建日期",
        "出库日期",
        "收货人",
        "收货电话",
        "收货地址",
        "收货门店",
        "联系人",
        "联系电话",
        "制单人",
        "审核人",
        "签字",
        "备注",
      ],
      skipEmptySku: true,
    },
    {
      type: "mapFields",
      mappings: [
        { target: "externalCode", source: "外部编码", transform: "trim" },
        { target: "externalCode", source: "配送单号", transform: "trim" },
        { target: "externalCode", source: "单号", transform: "trim" },
        { target: "externalCode", source: "footer", footerField: "externalCode" },
        { target: "storeName", source: "footer", footerField: "storeName" },
        { target: "skuCode", source: "物品编码", transform: "trim" },
        { target: "skuCode", source: "SKU编码", transform: "trim" },
        { target: "skuName", source: "物品名称", transform: "trim" },
        { target: "skuName", source: "SKU名称", transform: "trim" },
        { target: "skuSpec", source: "规格型号", transform: "trim" },
        { target: "skuSpec", source: "规格", transform: "trim" },
        { target: "skuQuantity", source: "出库数量", transform: "number" },
        { target: "skuQuantity", source: "发货数量", transform: "number" },
        { target: "skuQuantity", source: "订货数量", transform: "number" },
        { target: "skuQuantity", source: "数量", transform: "number" },
        { target: "recipientName", source: "footer", footerField: "recipientName" },
        {
          target: "recipientPhone",
          source: "footer",
          footerField: "recipientPhone",
          transform: "phone",
        },
        {
          target: "recipientAddress",
          source: "footer",
          footerField: "recipientAddress",
        },
      ],
    },
    { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
  ];
}

/** 标准发货单/出库单规则：表体止于合计行，尾部信息区单独 extractFooter */
export function buildShippingDeliveryRuleConfig(options?: {
  multiSheet?: boolean;
}): ParseRuleConfig {
  const perSheetSteps = buildPerSheetShippingSteps();
  const steps =
    options?.multiSheet && perSheetSteps
      ? [{ type: "processAllSheets" as const }, ...perSheetSteps]
      : perSheetSteps;

  return {
    fileTypes: ["xlsx", "xls"],
    description: options?.multiSheet
      ? "多Sheet出库单：每Sheet独立解析后合并，表体止于合计 + 尾部收货信息区"
      : "发货单：干扰头 + 表头 + 表体(止于合计) + 尾部信息区(收货人/电话/地址横向排列)",
    steps,
  };
}

export function buildShippingDeliveryRuleFromData(data: FilePreviewData): {
  config: ParseRuleConfig;
  analysis: string;
  confidence: "high" | "medium" | "low";
  guessedMappings: string[];
} {
  const detected = detectShippingDeliverySheet(data);
  const config = buildShippingDeliveryRuleConfig({
    multiSheet: detected.isMultiSheet,
  });

  if (detected.isShipping) {
    const sheetHint = detected.isMultiSheet
      ? `${detected.sheetCount} 个 Sheet 各为独立出库单，processAllSheets 遍历合并。`
      : `约 ${detected.columnCount} 列，`;
    return {
      config,
      analysis:
        `检测到${detected.isMultiSheet ? "多Sheet" : ""}出库/发货单结构：${sheetHint}` +
        `第 ${detected.headerRowIndex + 1} 行表头，表体止于合计行，` +
        `每Sheet尾部信息区提取收货门店/联系人/联系电话/收货地址。`,
      confidence:
        detected.isMultiSheet && detected.validSheetCount === detected.sheetCount
          ? "high"
          : detected.columnCount >= 15 || detected.isMultiSheet
            ? "high"
            : "medium",
      guessedMappings: detected.isMultiSheet
        ? [
            "processAllSheets 多Sheet合并",
            "每Sheet表体止于合计",
            "尾部收货门店/联系人/电话/地址",
            "出库数量列映射",
          ]
        : [
            "表头行(物品编码+发货/出库数量)",
            "表体止于合计行",
            "尾部信息区收货人/电话/地址",
            "单据号→externalCode",
          ],
    };
  }

  return {
    config: buildShippingDeliveryRuleConfig(),
    analysis: "已应用发货单默认规则，请试解析确认表头与尾部信息区是否匹配。",
    confidence: "low",
    guessedMappings: ["表头位置", "尾部收货信息", "列映射"],
  };
}

export function sanitizeShippingDeliveryRuleConfig(
  config: ParseRuleConfig,
  data?: FilePreviewData
): ParseRuleConfig {
  if (!data) return config;
  const detected = detectShippingDeliverySheet(data);
  if (!detected.isShipping) return config;
  const base = buildShippingDeliveryRuleConfig({ multiSheet: detected.isMultiSheet });
  return {
    ...base,
    description: config.description || base.description,
  };
}
