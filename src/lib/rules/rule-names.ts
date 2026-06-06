/** 规则名称规范化（去首尾空格） */
export function normalizeRuleName(name: string): string {
  return name.trim();
}

/** 在已有名称列表中生成不重复的规则名 */
export function suggestUniqueRuleName(
  base: string,
  takenNames: string[]
): string {
  const normalized = normalizeRuleName(base) || "新解析规则";
  const taken = new Set(takenNames.map(normalizeRuleName).filter(Boolean));

  if (!taken.has(normalized)) return normalized;

  let i = 2;
  while (taken.has(`${normalized} (${i})`)) i++;
  return `${normalized} (${i})`;
}

/** 根据文件名生成默认规则名前缀 */
export function ruleNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base ? `${base} 解析规则` : "新解析规则";
}
