# 考核出库单 Demo 与解析规则对照

> **重要**：引擎代码中**不得**出现文件名判断或列名硬编码。  
> 兼容各 Demo 的方式是：在 `/rules` 导入预设规则，或上传后 **AI 生成 + 手动微调** 列映射。

将考试提供的出库单文件放入本目录后，可运行：

```bash
npm run test:demos
```

## 9 份用例 ↔ 预设规则

| 考核文件（示例名） | 格式 | 结构特征 | 选用预设规则 | 核心引擎步骤 |
|-------------------|------|----------|--------------|--------------|
| 黎明屯配送发货单 | Excel | 3 行干扰头 + 表体 + 底部收货人横向排列 | **标准表格+尾部收货信息** | skipRows → extractTable → extractFooter → mapFields |
| 湖南仓发货明细 | Excel | 说明行 + 表头；同配送单号多行共享收货人 | **按单号跨行聚合** | skipRows → extractTable → **groupBy** → mapFields |
| 欢乐牧场模板 | Excel | SKU×门店矩阵，门店为列头 | **SKU×门店矩阵转置** | skipRows → **matrixTranspose** |
| 黔寨寨配送单 | PDF | 表格 + 底部签字区纯文本 | **PDF配送单** | textBlockSplit + filterRows |
| 多门店分Sheet出库单 | Excel | 每 Sheet 一门店，底部横向收货信息 | **多Sheet门店出库** | **processAllSheets** → extractFooter → mapFields |
| 门店调拨单(卡片式) | Excel | ▶ 调拨记录卡片，内嵌小表 | **卡片式调拨单** | **cardSplit(innerSteps)** |
| （Word 纯文本类） | Word | 段落 + 分隔线 + 编号物品行 | **Word纯文本配送确认** | textBlockSplit |
| （日期×门店矩阵类） | Excel | 日期列头 + 单元格多物品 | **日期×门店矩阵+复合单元格** | **dateStoreMatrix** |
| （PDF 多单类） | PDF | 单文件多签收单 | **PDF多单拆分** | pdfSplit → textBlockSplit |

## 导入流程（答辩演示）

1. `/import` 上传 Demo 文件  
2. **手动选择**上表对应预设规则（不做自动匹配）  
3. 若列映射不准：点 **「新建规则」** → AI 分析 → **试解析预览** → 微调 JSON → 保存  
4. **执行解析** → 预览编辑 → 提交下单  

## 列映射说明

预设规则中的 `mapFields` 使用列索引或列名，均为 **JSON 配置**，非代码硬编码。  
42 列等宽表（如黎明屯）上传后建议：

1. 先用「标准表格+尾部收货信息」试解析  
2. 在规则编辑器中根据表头**微调** `mapFields.mappings`  
3. 或使用 AI 生成规则并确认 `guessedMappings` 标注项  

## 目录结构建议

```
demos/
  README.md          ← 本文件
  黎明屯*.xlsx
  湖南仓*.xlsx
  欢乐牧场*.xlsx
  黔寨寨*.pdf
  多门店*.xlsx
  调拨单*.xlsx
  …（其余 Word/PDF 用例）
```
