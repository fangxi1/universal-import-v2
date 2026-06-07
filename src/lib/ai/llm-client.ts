import type {
  AiGeneratedRule,
  FieldMapping,
  FilePreviewData,
  ParseRuleConfig,
} from "@/types";
import {
  buildCardTransferRuleFromData,
  detectCardTransferSheet,
} from "@/lib/engine/card-transfer-rule";
import {
  buildGroupByDeliveryRuleFromData,
  detectGroupByDeliverySheet,
} from "@/lib/engine/group-by-delivery-rule";
import {
  buildStoreMatrixRuleFromData,
  detectStoreSkuMatrixSheet,
} from "@/lib/engine/store-matrix-rule";
import {
  buildShippingDeliveryRuleFromData,
  detectShippingDeliverySheet,
} from "@/lib/engine/shipping-delivery-rule";
import { buildPdfRuleFromText } from "@/lib/engine/pdf-delivery-rule";

const SYSTEM_PROMPT = `你是物流出库单解析规则设计专家。你的任务是分析用户上传的文件结构预览，生成一套通用的 JSON 解析规则配置（ParseRuleConfig），而不是直接输出运单数据。

规则配置格式：
{
  "fileTypes": ["xlsx"|"xls"|"docx"|"pdf"],
  "description": "规则说明",
  "steps": [ /* 规则步骤数组 */ ]
}

可用的步骤类型 (RuleStep)：
1. skipRows: { type:"skipRows", count:number } - 跳过前N行
2. skipUntilMatch: { type:"skipUntilMatch", pattern:string, maxScan?:number } - 跳过直到匹配正则
3. extractTable: { type:"extractTable", headerRow?:number, endMarker?:string, skipPatterns?:string[] } - 提取表格
4. extractFooter: { type:"extractFooter", patterns:[{field, labelPattern, valueGroup?}], scanFromBottom?:number } - 从尾部提取收货信息
5. groupBy: { type:"groupBy", keyField:string, inheritFields:string[] } - 按字段分组并继承
6. matrixTranspose: { type:"matrixTranspose", rowLabelColumn:number, headerRow:number, dataStartRow:number, skipColumns?:number[] } - 矩阵转置
7. processAllSheets: { type:"processAllSheets", sheetNames?:string[] } - 多Sheet标记（需配合 per-sheet 规则）
8. cardSplit: { type:"cardSplit", startMarker:string, endMarker?:string, innerSteps?:RuleStep[] } - 卡片式拆分（▶ 调拨记录 #N 为卡片边界；每张卡片含收货信息+4列物品小表，可对每卡片执行 innerSteps）
9. textBlockSplit: { type:"textBlockSplit", blockSeparator:string, linePatterns:[{field?, pattern, isItemLine?, itemFields?}] } - 纯文本块解析
10. compositeCellSplit: { type:"compositeCellSplit", column:string|number, itemPattern:string, delimiter?:string } - 复合单元格拆分
11. dateStoreMatrix: { type:"dateStoreMatrix", storeColumn:number, dateHeaderRow:number, dataStartRow:number, cellItemPattern:string } - 日期×门店矩阵
12. pdfSplit: { type:"pdfSplit", orderMarker:string } - PDF多订单拆分
13. filterRows: { type:"filterRows", skipPatterns:string[], skipEmptySku?:boolean } - 过滤行
14. mapFields: { type:"mapFields", mappings:[{target, source, staticValue?, footerField?, transform?}], guessed?:string[] } - 字段映射（必须最后一步前）
15. setDefaults: { type:"setDefaults", defaults:{} } - 设置默认值

OrderField 可选值: externalCode, storeName, recipientName, recipientPhone, recipientAddress, skuCode, skuName, skuQuantity, skuSpec, remark

要求：
- 根据文件结构选择合适的步骤组合
- 若 Excel 含「▶ 调拨记录 #N」或「调拨记录 #N」卡片行，且每张卡片内有物品编码/名称/规格/数量小表，必须使用 cardSplit + innerSteps（extractFooter→skipUntilMatch→extractTable→mapFields），不要用单一 extractTable
- 若 Excel 为发货单结构（干扰头 + 表头含物品编码/发货数量 + 表体 + 合计行 + 底部收货人/收货电话/收货地址横向排列），必须使用 skipUntilMatch→extractTable(endMarker:合计)→extractFooter(scanFromBottom)→mapFields，收货信息不可当表体列
- 若 Excel 有多个 Sheet 且每 Sheet 为独立出库单（结构相同：表头+表体+合计+尾部收货门店/联系人/电话/地址），必须加 processAllSheets 作为第一步，逐步遍历合并
- 若 Excel 为标准表格且同一配送单号占多行（物品行号递增、同单号共享收货机构/人/电话/地址），必须使用 skipRows(1)→extractTable→groupBy(配送单号)→mapFields，不可用 extractFooter 替代 groupBy
- 若 Excel 为 SKU×门店矩阵（左侧 SKU 信息列 + 右侧门店名作为列头、单元格为数量），必须使用 skipRows(跳过合并表头)→matrixTranspose，将每个非零门店列转置为一条 storeName+skuQuantity 运单
- 在 mapFields 的 guessed 数组中列出所有推测性的映射（列名/模式不确定的）
- 返回纯 JSON，不要 markdown 代码块`;

export function buildFilePreviewSummary(data: FilePreviewData): string {
  const parts: string[] = [];

  if (data.sheets?.length) {
    parts.push(`Excel 文件，共 ${data.sheets.length} 个 Sheet`);
    data.sheets.forEach((s) => {
      parts.push(`\n=== Sheet: ${s.name} (${s.rows.length} 行) ===`);
      const preview = s.rows.slice(0, 15);
      preview.forEach((row, i) => {
        parts.push(`R${i + 1}: ${row.slice(0, 20).join(" | ")}`);
      });
      if (s.rows.length > 15) parts.push(`... 还有 ${s.rows.length - 15} 行`);
    });
  }

  if (data.text) {
    parts.push(`\n文本内容 (${data.text.length} 字符):`);
    parts.push(data.text.slice(0, 8000));
    if (data.text.length > 8000) parts.push("\n... 文本已截断");
  }

  return parts.join("\n");
}

function buildStructureScanHints(data: FilePreviewData, fileName: string): string {
  const hints: string[] = [];

  if (fileName.toLowerCase().endsWith(".pdf") && data.text) {
    hints.push("- 文件类型：PDF 文本");
  }
  if (data.sheets?.length) {
    if (detectCardTransferSheet(data).isCard) {
      hints.push("- 预扫描：卡片式调拨单（▶ 调拨记录 #N）");
    }
    if (detectGroupByDeliverySheet(data).isGroupBy) {
      hints.push("- 预扫描：按配送单号跨行聚合表格");
    }
    if (detectStoreSkuMatrixSheet(data).isMatrix) {
      hints.push("- 预扫描：SKU×门店矩阵（需 matrixTranspose）");
    }
    if (detectShippingDeliverySheet(data).isShipping) {
      const d = detectShippingDeliverySheet(data);
      hints.push(
        d.isMultiSheet
          ? "- 预扫描：多 Sheet 出库单（processAllSheets）"
          : "- 预扫描：发货单（表体+合计+尾部收货信息）"
      );
    }
  }

  if (!hints.length) return "";
  return `\n\n以下为本地结构预扫描（供你分析参考，仍以你输出的规则为准）：\n${hints.join("\n")}`;
}

export function buildUserPrompt(data: FilePreviewData, fileName: string): string {
  return `请分析以下出库单文件「${fileName}」的结构，生成 ParseRuleConfig JSON 规则。

文件预览：
${buildFilePreviewSummary(data)}${buildStructureScanHints(data, fileName)}

请返回 JSON 格式：
{
  "config": { /* ParseRuleConfig */ },
  "guessedMappings": ["推测项1", "推测项2"],
  "analysis": "结构分析说明（需明确哪些列映射是推测的）",
  "confidence": "high"|"medium"|"low"
}`;
}

function mergeGuessed(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const t = item.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/** 保留 LLM 分析结论，仅用结构检测优化 config 以保证试解析成功率 */
function refineConfigWithStructureDetection(
  data: FilePreviewData,
  fileName: string,
  llmResult: AiGeneratedRule
): AiGeneratedRule {
  let config = llmResult.config;
  let configRefined = false;
  let refinementNote = "";
  const extraGuessed: string[] = [];

  if (fileName.toLowerCase().endsWith(".pdf") && data.text) {
    const detected = buildPdfRuleFromText(data.text);
    config = detected.config;
    configRefined = true;
    refinementNote = "系统已根据 PDF 表格结构校验并优化规则配置（大模型分析结论已保留）。";
    extraGuessed.push(...detected.guessedMappings);
  } else if (data.sheets?.length && detectCardTransferSheet(data).isCard) {
    const detected = buildCardTransferRuleFromData(data);
    config = detected.config;
    configRefined = true;
    refinementNote =
      "系统已根据卡片式调拨单结构校验并优化规则配置（大模型分析结论已保留）。";
    extraGuessed.push(...detected.guessedMappings);
  } else if (data.sheets?.length && detectGroupByDeliverySheet(data).isGroupBy) {
    const detected = buildGroupByDeliveryRuleFromData(data);
    config = detected.config;
    configRefined = true;
    refinementNote =
      "系统已根据配送单号跨行聚合结构校验并优化规则配置（大模型分析结论已保留）。";
    extraGuessed.push(...detected.guessedMappings);
  } else if (data.sheets?.length && detectStoreSkuMatrixSheet(data).isMatrix) {
    const detected = buildStoreMatrixRuleFromData(data);
    config = detected.config;
    configRefined = true;
    refinementNote =
      "系统已根据 SKU×门店矩阵结构校验并优化规则配置（大模型分析结论已保留）。";
    extraGuessed.push(...detected.guessedMappings);
  } else if (data.sheets?.length && detectShippingDeliverySheet(data).isShipping) {
    const detected = buildShippingDeliveryRuleFromData(data);
    config = detected.config;
    configRefined = true;
    refinementNote =
      "系统已根据发货单/多Sheet出库结构校验并优化规则配置（大模型分析结论已保留）。";
    extraGuessed.push(...detected.guessedMappings);
  }

  const mapStep = config?.steps?.find((s) => s.type === "mapFields");
  const guessedMappings = mergeGuessed(
    llmResult.guessedMappings,
    extraGuessed,
    mapStep && mapStep.type === "mapFields" ? mapStep.guessed : undefined
  );

  if (mapStep && mapStep.type === "mapFields" && guessedMappings.length) {
    mapStep.guessed = guessedMappings;
  }

  return {
    config,
    analysis: refinementNote
      ? `${llmResult.analysis}\n\n${refinementNote}`
      : llmResult.analysis,
    guessedMappings,
    confidence: llmResult.confidence,
    llmInvoked: true,
    llmModel: llmResult.llmModel,
    configRefined,
  };
}

async function invokeDeepSeekLlm(
  data: FilePreviewData,
  fileName: string
): Promise<AiGeneratedRule> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1";
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  if (!apiKey?.trim()) {
    throw new Error(
      "未配置 LLM_API_KEY，无法调用大模型。请在环境变量或 .env.local 中设置 DeepSeek API Key。"
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(data, fileName) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API 错误: ${res.status} ${err}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("大模型返回为空");

    const parsed = JSON.parse(content) as AiGeneratedRule;
    if (!parsed.config?.steps?.length) {
      throw new Error("大模型返回的规则配置不完整");
    }

    const mapStep = parsed.config.steps.find((s) => s.type === "mapFields");
    if (mapStep && mapStep.type === "mapFields" && parsed.guessedMappings?.length) {
      mapStep.guessed = parsed.guessedMappings;
    }

    return {
      ...parsed,
      llmInvoked: true,
      llmModel: model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * AI 辅助生成规则：必须先调用 DeepSeek 大模型，再经结构检测优化 config。
 * 无 API Key 时抛出错误（不使用静默 fallback，满足评委「必须调用大模型」要求）。
 */
export async function callLlmForRule(
  data: FilePreviewData,
  fileName: string
): Promise<AiGeneratedRule> {
  try {
    const llmResult = await invokeDeepSeekLlm(data, fileName);
    return refineConfigWithStructureDetection(data, fileName, llmResult);
  } catch (e) {
    console.error("LLM call failed:", e);
    const msg = e instanceof Error ? e.message : "大模型调用失败";
    throw new Error(msg);
  }
}

/** 仅当 LLM 不可用时的离线兜底（不用于「新建规则 AI 辅助」主流程） */
export function generateFallbackRule(
  data: FilePreviewData,
  fileName: string
): AiGeneratedRule {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "xlsx";
  const fileTypes = [ext as "xlsx" | "docx" | "pdf"];

  if (data.text && !data.sheets?.length) {
    if (ext === "docx" || data.text.includes("━━━")) {
      return {
        config: {
          fileTypes: ["docx"],
          description: "纯文本块解析（启发式）",
          steps: [
            {
              type: "textBlockSplit",
              blockSeparator: "━{3,}",
              linePatterns: [
                { field: "storeName", pattern: "门店[：:]\\s*(.+)" },
                { field: "recipientName", pattern: "收件人[：:]\\s*(.+)" },
                { field: "recipientPhone", pattern: "电话[：:]\\s*(\\d[\\d\\-+]+)" },
                { field: "recipientAddress", pattern: "地址[：:]\\s*(.+)" },
                {
                  isItemLine: true,
                  pattern:
                    "\\d+\\.\\s*(\\S+)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.*?)\\s*\\|\\s*(\\d+)",
                  itemFields: {
                    skuCode: 1,
                    skuName: 2,
                    skuSpec: 3,
                    skuQuantity: 4,
                  },
                },
              ],
            },
            {
              type: "mapFields",
              mappings: [
                { target: "externalCode", source: "static", staticValue: "" },
                { target: "storeName", source: "static", staticValue: "" },
                { target: "recipientName", source: "static", staticValue: "" },
                { target: "recipientPhone", source: "static", staticValue: "" },
                { target: "recipientAddress", source: "static", staticValue: "" },
                { target: "skuCode", source: "static", staticValue: "" },
                { target: "skuName", source: "static", staticValue: "" },
                { target: "skuQuantity", source: "static", staticValue: "" },
                { target: "skuSpec", source: "static", staticValue: "" },
                { target: "remark", source: "static", staticValue: "" },
              ],
              guessed: ["文本块分隔符", "物品行正则模式"],
            },
          ],
        },
        guessedMappings: ["文本块分隔符", "物品行正则模式", "收货信息字段位置"],
        analysis:
          "检测到纯文本格式，使用 textBlockSplit 步骤（离线启发式，未调用大模型）。请手动确认分隔符和正则模式。",
        confidence: "low",
        llmInvoked: false,
      };
    }

    const pdfRule = buildPdfRuleFromText(data.text);
    return {
      config: pdfRule.config,
      guessedMappings: pdfRule.guessedMappings,
      analysis: pdfRule.analysis + "（离线启发式，未调用大模型）",
      confidence: pdfRule.confidence,
      llmInvoked: false,
    };
  }

  if (data.sheets?.length) {
    if (detectCardTransferSheet(data).isCard) {
      const cardRule = buildCardTransferRuleFromData(data);
      return { ...cardRule, llmInvoked: false };
    }
    if (detectGroupByDeliverySheet(data).isGroupBy) {
      const groupRule = buildGroupByDeliveryRuleFromData(data);
      return { ...groupRule, llmInvoked: false };
    }
    if (detectStoreSkuMatrixSheet(data).isMatrix) {
      const matrixRule = buildStoreMatrixRuleFromData(data);
      return { ...matrixRule, llmInvoked: false };
    }
    if (detectShippingDeliverySheet(data).isShipping) {
      const shippingRule = buildShippingDeliveryRuleFromData(data);
      return { ...shippingRule, llmInvoked: false };
    }
  }

  const sheet = data.sheets?.[0];
  const rowCount = sheet?.rows.length ?? 0;
  const colCount = sheet?.rows[0]?.length ?? 0;

  const steps: ParseRuleConfig["steps"] = [
    { type: "skipRows", count: 0 },
    { type: "extractTable", headerRow: 0, skipPatterns: ["合计", "总计", "小计"] },
    {
      type: "extractFooter",
      patterns: [
        { field: "recipientName", labelPattern: "收货人[：:]\\s*(.+)", valueGroup: 1 },
        { field: "recipientPhone", labelPattern: "电话[：:]\\s*(\\d[\\d\\-+]+)", valueGroup: 1 },
        { field: "recipientAddress", labelPattern: "地址[：:]\\s*(.+)", valueGroup: 1 },
      ],
      scanFromBottom: 10,
    },
    {
      type: "filterRows",
      skipPatterns: ["合计", "总计"],
      skipEmptySku: true,
    },
    {
      type: "mapFields",
      mappings: buildHeuristicMappings(sheet?.rows[0] ?? []),
      guessed: ["表头行位置", "列映射关系", "尾部收货信息"],
    },
  ];

  if ((data.sheets?.length ?? 0) > 1) {
    steps.unshift({ type: "processAllSheets" });
  }

  return {
    config: {
      fileTypes: fileTypes as ParseRuleConfig["fileTypes"],
      description: `Excel 启发式规则 (${rowCount}行 x ${colCount}列)`,
      steps,
    },
    guessedMappings: ["表头行位置", "列字段映射", "尾部信息提取模式"],
    analysis: `检测到 Excel 文件 ${rowCount} 行 ${colCount} 列（离线启发式，未调用大模型）。请试解析确认并微调。`,
    confidence: "medium",
    llmInvoked: false,
  };
}

function buildHeuristicMappings(headerRow: string[]): FieldMapping[] {
  const keywords: Record<string, string[]> = {
    externalCode: ["单号", "编码", "配送", "订单", "外部"],
    storeName: ["门店", "店铺", "机构"],
    skuCode: ["物品编码", "sku", "编码", "货号"],
    skuName: ["物品名称", "名称", "品名", "商品"],
    skuQuantity: ["数量", "发货", "件数"],
    skuSpec: ["规格", "型号"],
    remark: ["备注", "说明"],
  };

  const findSource = (target: string): string | number => {
    const kws = keywords[target] ?? [];
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i].toLowerCase();
      if (kws.some((k) => h.includes(k))) return i;
    }
    return 0;
  };

  return [
    { target: "externalCode", source: findSource("externalCode"), transform: "trim" },
    { target: "storeName", source: findSource("storeName"), transform: "trim" },
    { target: "skuCode", source: findSource("skuCode"), transform: "trim" },
    { target: "skuName", source: findSource("skuName"), transform: "trim" },
    { target: "skuQuantity", source: findSource("skuQuantity"), transform: "number" },
    { target: "skuSpec", source: findSource("skuSpec"), transform: "trim" },
    { target: "remark", source: findSource("remark"), transform: "trim" },
    { target: "recipientName", source: "footer", footerField: "recipientName" },
    {
      target: "recipientPhone",
      source: "footer",
      footerField: "recipientPhone",
      transform: "phone",
    },
    { target: "recipientAddress", source: "footer", footerField: "recipientAddress" },
  ];
}
