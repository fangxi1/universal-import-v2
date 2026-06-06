/** 考核用例与预设规则对照（仅文档/UI 用途，引擎不引用） */
export const EXAM_DEMO_RULE_MAP = [
  {
    demo: "黎明屯配送发货单",
    format: "Excel",
    difficulty: "尾部收货人横向排列 → extractFooter",
    presetName: "标准表格+尾部收货信息",
  },
  {
    demo: "湖南仓发货明细",
    format: "Excel",
    difficulty: "同单号跨行 → groupBy",
    presetName: "按单号跨行聚合",
  },
  {
    demo: "欢乐牧场模板",
    format: "Excel",
    difficulty: "SKU×门店矩阵 → matrixTranspose",
    presetName: "SKU×门店矩阵转置",
  },
  {
    demo: "黔寨寨配送单",
    format: "PDF",
    difficulty: "PDF 文本 + 底部签字区 → textBlockSplit",
    presetName: "PDF配送单",
  },
  {
    demo: "多门店分Sheet出库单",
    format: "Excel",
    difficulty: "多 Sheet 合并 → processAllSheets",
    presetName: "多Sheet门店出库",
  },
  {
    demo: "门店调拨单(卡片式)",
    format: "Excel",
    difficulty: "卡片边界 → cardSplit(innerSteps)",
    presetName: "卡片式调拨单",
  },
  {
    demo: "Word 纯文本配送确认",
    format: "Word",
    difficulty: "段落 + 分隔线 → textBlockSplit",
    presetName: "Word纯文本配送确认",
  },
  {
    demo: "日期×门店矩阵配送",
    format: "Excel",
    difficulty: "复合单元格 → dateStoreMatrix",
    presetName: "日期×门店矩阵+复合单元格",
  },
  {
    demo: "PDF 多单拆分",
    format: "PDF",
    difficulty: "多单边界 → pdfSplit",
    presetName: "PDF多单拆分",
  },
] as const;