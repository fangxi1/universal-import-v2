import type { ParseRuleConfig } from "@/types";
import { buildCardTransferRuleConfig } from "@/lib/engine/card-transfer-rule";
import { buildPdfDeliveryRuleConfig } from "@/lib/engine/pdf-delivery-rule";
import { buildGroupByDeliveryRuleConfig } from "@/lib/engine/group-by-delivery-rule";
import { buildShippingDeliveryRuleConfig } from "@/lib/engine/shipping-delivery-rule";
import { buildStoreMatrixRuleConfig } from "@/lib/engine/store-matrix-rule";

/** 欢乐牧场类典型表头（用于预设 seed，实际解析会按上传文件 sanitize） */
const STORE_MATRIX_SAMPLE_HEADERS = [
  "仓库名称",
  "货主名称",
  "SKU名称",
  "SKU条码",
  "外部商品编码",
  "库存状态",
  "库存单位",
  "规格",
  "在库数量",
  "可用数量",
  "待移入量",
  "分配数量",
  "冻结数量",
  "银泰",
  "金银湖",
  "金桥",
  "门店B",
  "下单后结余",
];

/** 预设规则：按文件结构类型命名，非文件名硬编码 */
export const PRESET_RULES: Array<{
  name: string;
  description: string;
  config: ParseRuleConfig;
}> = [
  {
    name: "标准表格+尾部收货信息",
    description: "适用：干扰头部 + 表格式数据 + 合计行 + 底部横向收货人/电话/地址（如黎明屯/发货单类）",
    config: buildShippingDeliveryRuleConfig(),
  },
  {
    name: "按单号跨行聚合",
    description:
      "适用：标准表格 + 配送单号分组，同单号多物品行共享收货机构/人/电话/地址（湖南仓类）",
    config: buildGroupByDeliveryRuleConfig(),
  },
  {
    name: "SKU×门店矩阵转置",
    description:
      "适用：SKU 为行、门店为列的矩阵（欢乐牧场类），matrixTranspose 转置为运单",
    config: buildStoreMatrixRuleConfig(
      {
        isMatrix: true,
        headerRowIndex: 1,
        skipRows: 1,
        storeColumnCount: 4,
        columnCount: 18,
      },
      STORE_MATRIX_SAMPLE_HEADERS
    ),
  },
  {
    name: "PDF配送单",
    description:
      "适用：PDF 7 列表格（序号/类别/物品编码/物品名称/规格/单位/发货数量）+ 页脚收货信息（黔寨寨类）",
    config: buildPdfDeliveryRuleConfig(),
  },
  {
    name: "多Sheet门店出库",
    description:
      "适用：每 Sheet 为独立出库单（表体止于合计 + 尾部收货门店/联系人/电话/地址），processAllSheets 合并",
    config: buildShippingDeliveryRuleConfig({ multiSheet: true }),
  },
  {
    name: "卡片式调拨单",
    description:
      "适用：▶ 调拨记录 #N 卡片边界 + 顶部收货信息 + 4 列物品小表（编码/名称/规格/数量）",
    config: buildCardTransferRuleConfig(),
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
