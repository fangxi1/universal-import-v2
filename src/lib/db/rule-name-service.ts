import { db } from "@/lib/db";
import { parseRules } from "@/lib/db/schema";
import { normalizeRuleName } from "@/lib/rules/rule-names";

export async function isRuleNameTaken(
  name: string,
  excludeId?: string
): Promise<boolean> {
  const normalized = normalizeRuleName(name);
  if (!normalized) return false;

  const rows = await db
    .select({ id: parseRules.id, name: parseRules.name })
    .from(parseRules);

  return rows.some(
    (r) =>
      normalizeRuleName(r.name) === normalized &&
      (!excludeId || r.id !== excludeId)
  );
}

export async function assertRuleNameAvailable(
  name: string,
  excludeId?: string
): Promise<void> {
  if (await isRuleNameTaken(name, excludeId)) {
    throw new Error(`规则名称「${normalizeRuleName(name)}」已存在，请更换名称`);
  }
}

export async function listRuleNames(): Promise<string[]> {
  const rows = await db.select({ name: parseRules.name }).from(parseRules);
  return rows.map((r) => r.name);
}
