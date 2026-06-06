import type { ParseRuleConfig } from "@/types";
import type { FilePreviewData } from "@/types";

/** 卡片起始行：▶ 调拨记录 #N（兼容多种箭头符号） */
export const CARD_TRANSFER_START_MARKER =
  "[▶►▷▸>●]?\\s*调拨记录\\s*#?\\d*";

export function isCardTransferMarkerLine(line: string): boolean {
  return (
    /[▶►▷▸>●]?\s*调拨记录\s*#?\d*/i.test(line) ||
    /调拨记录\s*#\d+/i.test(line)
  );
}

export function detectCardTransferSheet(data: FilePreviewData): {
  isCard: boolean;
  cardCount: number;
  hasItemTable: boolean;
} {
  const rows = data.sheets?.[0]?.rows ?? [];
  let cardCount = 0;
  let hasItemTable = false;

  for (const row of rows) {
    const line = row.join(" ");
    if (isCardTransferMarkerLine(line)) cardCount++;
    if (/物品编码/.test(line) && /数量/.test(line)) hasItemTable = true;
  }

  return {
    isCard: cardCount >= 1 && hasItemTable,
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
            labelPattern: "调拨单号[：:\\s]*(\\S+)",
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
            pattern: "物品编码|SKU编码|编码",
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
              { target: "skuCode", source: "物品编码", transform: "trim" },
              { target: "skuName", source: "物品名称", transform: "trim" },
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
