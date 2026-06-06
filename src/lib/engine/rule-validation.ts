import type { ParseRuleConfig } from "@/types";

/** 统计正则中捕获组数量（不含 (?: 等非捕获组） */
export function countCaptureGroups(pattern: string): number {
  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") {
      i++;
      continue;
    }
    if (pattern[i] === "(") {
      if (pattern[i + 1] === "?") continue;
      count++;
    }
  }
  return count;
}

/** 校验 PDF textBlockSplit 物品行配置，返回可读警告 */
export function validateRuleConfig(config: ParseRuleConfig): string[] {
  const warnings: string[] = [];

  if (config.steps.some((s) => s.type === "pdfSplit")) {
    warnings.push(
      "含 pdfSplit 步骤：若 PDF 表格含横线「-----」，可能被误切成多块，单页配送单建议删除 pdfSplit"
    );
  }

  const emptyMap = config.steps.find(
    (s) =>
      s.type === "mapFields" &&
      s.mappings.every(
        (m) => m.source === "static" && !(m.staticValue ?? "").trim()
      )
  );
  if (emptyMap && config.fileTypes.includes("pdf")) {
    warnings.push(
      "PDF 规则末尾 mapFields 全为空 static，对 textBlockSplit 无帮助，建议删除该步骤"
    );
  }

  for (const step of config.steps) {
    if (step.type !== "textBlockSplit") continue;
    for (const lp of step.linePatterns) {
      if (!lp.isItemLine || !lp.itemFields) continue;
      const groups = countCaptureGroups(lp.pattern);
      for (const [field, idx] of Object.entries(lp.itemFields)) {
        if (idx < 1 || idx > groups) {
          warnings.push(
            `物品行正则有 ${groups} 个捕获组，但 itemFields.${field}=${idx} 超出范围（有效：1～${groups}）`
          );
        }
      }
    }
  }

  return warnings;
}
