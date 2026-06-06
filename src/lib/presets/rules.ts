import type { ParseRuleConfig } from "@/types";
import { buildPdfDeliveryRuleConfig } from "@/lib/engine/pdf-delivery-rule";

/** 预设规则：按文件结构类型命名，非文件名硬编码 */
export const PRESET_RULES: Array<{
  name: string;
  description: string;
  config: ParseRuleConfig;
}> = [
  {
    name: "标准表格+尾部收货信息",
    description: "适用：干扰头部 + 表格式数据 + 底部横向收货人/电话/地址（如黎明屯类）",
    config: {
      fileTypes: ["xlsx", "xls"],
      steps: [
        { type: "skipRows", count: 3 },
        { type: "extractTable", headerRow: 0, skipPatterns: ["合计", "总计"] },
        {
          type: "extractFooter",
          patterns: [
            { field: "recipientName", labelPattern: "收货人[：:\\s]*(\\S+)", valueGroup: 1 },
            { field: "recipientPhone", labelPattern: "电话[：:\\s]*(\\d[\\d\\-+]+)", valueGroup: 1 },
            { field: "recipientAddress", labelPattern: "地址[：:\\s]*(.+)", valueGroup: 1 },
          ],
          scanFromBottom: 5,
        },
        { type: "filterRows", skipPatterns: ["合计"], skipEmptySku: true },
        {
          type: "mapFields",
          mappings: [
            { target: "externalCode", source: 0, transform: "trim" },
            { target: "skuCode", source: 1, transform: "trim" },
            { target: "skuName", source: 2, transform: "trim" },
            { target: "skuQuantity", source: 3, transform: "number" },
            { target: "skuSpec", source: 4, transform: "trim" },
            { target: "recipientName", source: "footer", footerField: "recipientName" },
            { target: "recipientPhone", source: "footer", footerField: "recipientPhone", transform: "phone" },
            { target: "recipientAddress", source: "footer", footerField: "recipientAddress" },
          ],
        },
        { type: "setDefaults", defaults: { tempLayer: "常温" } },
      ],
    },
  },
  {
    name: "按单号跨行聚合",
    description: "适用：每行含单号+物品，同单号多行共享收货人（如湖南仓类）",
    config: {
      fileTypes: ["xlsx", "xls"],
      steps: [
        { type: "skipRows", count: 1 },
        { type: "extractTable", headerRow: 0 },
        {
          type: "groupBy",
          keyField: "配送单号",
          inheritFields: ["收件人", "电话", "地址", "收货门店"],
        },
        {
          type: "mapFields",
          mappings: [
            { target: "externalCode", source: "配送单号", transform: "trim" },
            { target: "storeName", source: "收货门店", transform: "trim" },
            { target: "recipientName", source: "收件人", transform: "trim" },
            { target: "recipientPhone", source: "电话", transform: "phone" },
            { target: "recipientAddress", source: "地址", transform: "trim" },
            { target: "skuCode", source: "物品编码", transform: "trim" },
            { target: "skuName", source: "物品名称", transform: "trim" },
            { target: "skuQuantity", source: "数量", transform: "number" },
            { target: "skuSpec", source: "规格", transform: "trim" },
          ],
        },
      ],
    },
  },
  {
    name: "SKU×门店矩阵转置",
    description: "适用：SKU 为行、门店为列的矩阵（如欢乐牧场类）",
    config: {
      fileTypes: ["xlsx", "xls"],
      steps: [
        { type: "skipRows", count: 1 },
        {
          type: "matrixTranspose",
          rowLabelColumn: 0,
          headerRow: 0,
          dataStartRow: 1,
          skipColumns: [0],
        },
        { type: "setDefaults", defaults: { tempLayer: "常温" } },
      ],
    },
  },
  {
    name: "PDF配送单",
    description:
      "适用：PDF 7 列表格（序号/类别/物品编码/物品名称/规格/单位/发货数量）+ 页脚收货信息（黔寨寨类）",
    config: buildPdfDeliveryRuleConfig(),
  },
  {
    name: "多Sheet门店出库",
    description: "适用：每个 Sheet 为独立门店出库单（需配合 AI 微调列映射）",
    config: {
      fileTypes: ["xlsx", "xls"],
      steps: [
        { type: "processAllSheets" },
        { type: "skipRows", count: 2 },
        { type: "extractTable", headerRow: 0, skipPatterns: ["合计"] },
        {
          type: "extractFooter",
          patterns: [
            { field: "recipientName", labelPattern: "收货人[：:\\s]*(\\S+)", valueGroup: 1 },
            { field: "recipientPhone", labelPattern: "电话[：:\\s]*(\\d[\\d\\-+]+)", valueGroup: 1 },
            { field: "recipientAddress", labelPattern: "地址[：:\\s]*(.+)", valueGroup: 1 },
          ],
          scanFromBottom: 8,
        },
        {
          type: "mapFields",
          mappings: [
            { target: "storeName", source: 0, transform: "trim" },
            { target: "skuCode", source: 1, transform: "trim" },
            { target: "skuName", source: 2, transform: "trim" },
            { target: "skuQuantity", source: 3, transform: "number" },
            { target: "recipientName", source: "footer", footerField: "recipientName" },
            { target: "recipientPhone", source: "footer", footerField: "recipientPhone", transform: "phone" },
            { target: "recipientAddress", source: "footer", footerField: "recipientAddress" },
          ],
        },
      ],
    },
  },
  {
    name: "卡片式调拨单",
    description:
      "适用：▶ 调拨记录 #N 卡片边界 + 顶部收货信息 + 4 列物品小表（编码/名称/规格/数量）",
    config: {
      fileTypes: ["xlsx", "xls"],
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
          startMarker: "▶\\s*调拨记录\\s*#?\\d*",
          endMarker: "─{3,}|^合计",
          innerSteps: [
            {
              type: "extractFooter",
              scanFromTop: 6,
              patterns: [
                {
                  field: "storeName",
                  labelPattern: "调入门店[：:\\s]*(.+?)(?=\\s+收货人|\\s+电话|$)",
                  valueGroup: 1,
                },
                {
                  field: "storeName",
                  labelPattern: "调入门店[：:\\s]*(.+)",
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
              skipPatterns: ["合计", "调拨记录", "─"],
            },
            {
              type: "filterRows",
              skipPatterns: ["合计", "物品编码", "编码"],
              skipEmptySku: true,
            },
            {
              type: "mapFields",
              mappings: [
                { target: "externalCode", source: "footer", footerField: "externalCode" },
                { target: "storeName", source: "footer", footerField: "storeName" },
                { target: "recipientName", source: "footer", footerField: "recipientName" },
                { target: "recipientPhone", source: "footer", footerField: "recipientPhone", transform: "phone" },
                { target: "recipientAddress", source: "footer", footerField: "recipientAddress" },
                { target: "skuCode", source: 0, transform: "trim" },
                { target: "skuName", source: 1, transform: "trim" },
                { target: "skuSpec", source: 2, transform: "trim" },
                { target: "skuQuantity", source: 3, transform: "number" },
              ],
            },
            { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
          ],
        },
        {
          type: "filterRows",
          skipPatterns: ["合计", "物品编码"],
          skipEmptySku: true,
        },
      ],
    },
  },
  {
    name: "Word纯文本配送确认",
    description: "适用：段落式文本 + 分隔线 + 编号.编码|名称|规格|数量",
    config: {
      fileTypes: ["docx"],
      steps: [
        {
          type: "textBlockSplit",
          blockSeparator: "━{3,}",
          linePatterns: [
            { field: "externalCode", pattern: "单号[：:\\s]*(\\S+)" },
            { field: "storeName", pattern: "门店[：:\\s]*(.+)" },
            { field: "recipientName", pattern: "收件人[：:\\s]*(\\S+)" },
            { field: "recipientPhone", pattern: "电话[：:\\s]*(\\d[\\d\\-+]+)" },
            { field: "recipientAddress", pattern: "地址[：:\\s]*(.+)" },
            {
              isItemLine: true,
              pattern: "\\d+\\.\\s*(\\S+)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.*?)\\s*\\|\\s*(\\d+)",
              itemFields: { skuCode: 1, skuName: 2, skuSpec: 3, skuQuantity: 4 },
            },
          ],
        },
      ],
    },
  },
  {
    name: "日期×门店矩阵+复合单元格",
    description: "适用：日期为列头、门店为行、单元格多物品（如周配送计划类）",
    config: {
      fileTypes: ["xlsx", "xls"],
      steps: [
        {
          type: "dateStoreMatrix",
          storeColumn: 0,
          dateHeaderRow: 0,
          dataStartRow: 1,
          cellItemPattern: "(.+?)\\s*[xX×]\\s*(\\d+)",
        },
      ],
    },
  },
  {
    name: "PDF多单拆分",
    description: "适用：一个 PDF 含多个独立配送签收单",
    config: {
      fileTypes: ["pdf"],
      steps: [
        { type: "pdfSplit", orderMarker: "-{5,}|={5,}|配送签收单" },
        {
          type: "textBlockSplit",
          blockSeparator: "---SPLIT---",
          linePatterns: [
            { field: "externalCode", pattern: "单号[：:\\s]*(\\S+)" },
            { field: "recipientName", pattern: "收货人[：:\\s]*(\\S+)" },
            { field: "recipientPhone", pattern: "电话[：:\\s]*(\\d[\\d\\-+]+)" },
            { field: "recipientAddress", pattern: "地址[：:\\s]*(.+)" },
            {
              isItemLine: true,
              pattern: "(\\S+)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)",
              itemFields: { skuCode: 1, skuName: 2, skuQuantity: 3 },
            },
          ],
        },
      ],
    },
  },
];
