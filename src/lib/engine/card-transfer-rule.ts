import type { ParseRuleConfig } from "@/types";
import type { FilePreviewData } from "@/types";

/** 卡片起始行：▶ 调拨记录 #N（兼容多种箭头符号） */
export const CARD_TRANSFER_START_MARKER =
  "[▶►▷▸>●]?\\s*调拨记录\\s*#?\\d*";

const ITEM_CODE_HEADER = /物品编码|SKU编码|sku编码|货号|商品编码/;
const ITEM_QTY_HEADER = /数量|件数|调拨数量/;

export function isCardTransferMarkerLine(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return (
    /[▶►▷▸>●]?\s*调拨记录\s*#?\d*/i.test(text) ||
    /调拨记录\s*#\d+/i.test(text)
  );
}

/** 行内是否含卡片起始标志（逐格扫描，兼容合并单元格只出现在首列） */
export function rowHasCardTransferMarker(row: string[]): boolean {
  if (row.some((cell) => isCardTransferMarkerLine(cell))) return true;
  return isCardTransferMarkerLine(row.join(" "));
}

/** 行内是否像卡片内嵌物品小表表头 */
export function rowHasCardItemTableHeader(row: string[]): boolean {
  const line = row.join(" ");
  const hasCode = row.some((c) => ITEM_CODE_HEADER.test(c)) || ITEM_CODE_HEADER.test(line);
  const hasQty =
    row.some((c) => ITEM_QTY_HEADER.test(c)) || ITEM_QTY_HEADER.test(line);
  return hasCode && hasQty;
}

export function detectCardTransferSheet(data: FilePreviewData): {
  isCard: boolean;
  cardCount: number;
  hasItemTable: boolean;
} {
  const rows = data.sheets?.[0]?.rows ?? [];
  let cardCount = 0;
  let hasItemTable = false;
  let hasTransferTitle = false;

  for (const row of rows) {
    const line = row.join(" ");
    if (rowHasCardTransferMarker(row)) cardCount++;
    if (rowHasCardItemTableHeader(row)) hasItemTable = true;
    if (/门店调拨单|卡片式调拨|配送中心.*调拨/.test(line)) hasTransferTitle = true;
  }

  const isCard =
    cardCount >= 1 &&
    (hasItemTable || (hasTransferTitle && cardCount >= 2));

  return {
    isCard,
    cardCount,
    hasItemTable,
  };
}

/** 门店调拨单（卡片式）标准规则 */
export function buildCardTransferRuleConfig(): ParseRuleConfig {
  return {
    fileTypes: ["xlsx", "xls"],
    description:
      "卡片式调拨单：▶ 调拨记录 #N 为卡片边界，卡片内含收货信息 + 4 列物品小表",
    steps: [
      {
        type: "extractFooter",
        scanFromTop: 8,
        patterns: [
          {
            field: "externalCode",
            labelPattern: "调拨单号[：:\\s|]*([A-Za-z0-9\\-]+)",
            valueGroup: 1,
          },
        ],
      },
      {
        type: "cardSplit",
        startMarker: CARD_TRANSFER_START_MARKER,
        endMarker: "─{3,}|^合计",
        innerSteps: [
          {
            type: "extractFooter",
            scanFromTop: 8,
            patterns: [
              {
                field: "storeName",
                labelPattern: "调入门店[：:\\s]*(.+?)(?=\\s+收货人|\\s+电话|$)",
                valueGroup: 1,
              },
              {
                field: "recipientName",
                labelPattern: "收货人[：:\\s]*(\\S+)",
                valueGroup: 1,
              },
              {
                field: "recipientPhone",
                labelPattern: "电话[：:\\s]*(\\d[\\d\\-+]+)",
                valueGroup: 1,
              },
              {
                field: "recipientAddress",
                labelPattern: "收货地址[：:\\s]*(.+)",
                valueGroup: 1,
              },
            ],
          },
          {
            type: "skipUntilMatch",
            pattern: "物品编码|SKU编码|货号|商品编码|编码",
            maxScan: 15,
          },
          {
            type: "extractTable",
            headerRow: 0,
            skipPatterns: ["合计", "调拨记录", "─", "▶"],
          },
          {
            type: "filterRows",
            skipPatterns: ["合计", "物品编码", "编码", "物品名称"],
            skipEmptySku: true,
          },
          {
            type: "mapFields",
            mappings: [
              { target: "externalCode", source: "footer", footerField: "externalCode" },
              { target: "storeName", source: "footer", footerField: "storeName" },
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
              { target: "skuCode", source: "编码", transform: "trim" },
              { target: "skuName", source: "名称", transform: "trim" },
              { target: "skuSpec", source: "规格", transform: "trim" },
              { target: "skuQuantity", source: "数量", transform: "number" },
            ],
          },
          { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
        ],
      },
      {
        type: "filterRows",
        skipPatterns: ["合计", "物品编码", "调拨记录"],
        skipEmptySku: true,
      },
    ],
  };
}

export function buildCardTransferRuleFromData(data: FilePreviewData): {
  config: ParseRuleConfig;
  analysis: string;
  confidence: "high" | "medium" | "low";
  guessedMappings: string[];
} {
  const detected = detectCardTransferSheet(data);
  const config = buildCardTransferRuleConfig();

  if (detected.isCard) {
    return {
      config,
      analysis:
        `检测到卡片式调拨单（▶ 调拨记录 共 ${detected.cardCount} 张卡片）。` +
        `每张卡片：调入门店/收货人/电话/地址 + 物品编码/名称/规格/数量 4 列小表。`,
      confidence: detected.cardCount >= 2 ? "high" : "medium",
      guessedMappings: ["卡片边界 ▶ 调拨记录 #N", "卡片内 4 列物品表表头行"],
    };
  }

  return {
    config,
    analysis: "已应用卡片式调拨单默认规则，请试解析确认 ▶ 调拨记录 边界是否匹配。",
    confidence: "low",
    guessedMappings: ["卡片起始标志", "卡片内表头与列映射"],
  };
}

export function sanitizeCardTransferRuleConfig(
  config: ParseRuleConfig,
  data?: FilePreviewData
): ParseRuleConfig {
  if (data && !detectCardTransferSheet(data).isCard) return config;
  const base = buildCardTransferRuleConfig();
  return {
    ...base,
    description: config.description || base.description,
  };
}
