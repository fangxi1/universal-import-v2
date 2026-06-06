import { NextResponse } from "next/server";
import { db, ensureTables } from "@/lib/db";
import { isRuleNameTaken } from "@/lib/db/rule-name-service";
import { parseRules } from "@/lib/db/schema";
import { normalizeRuleName } from "@/lib/rules/rule-names";
import { PRESET_RULES } from "@/lib/presets/rules";

export async function POST() {
  try {
    await ensureTables();
    const inserted = [];
    let skipped = 0;

    for (const preset of PRESET_RULES) {
      if (await isRuleNameTaken(preset.name)) {
        skipped++;
        continue;
      }
      const [rule] = await db
        .insert(parseRules)
        .values({
          name: normalizeRuleName(preset.name),
          description: preset.description,
          config: preset.config,
          updatedAt: new Date(),
        })
        .returning();
      inserted.push(rule);
    }

    return NextResponse.json({
      ok: true,
      count: inserted.length,
      skipped,
      message:
        skipped > 0
          ? `已导入 ${inserted.length} 条预设规则，跳过 ${skipped} 条重名规则`
          : `已导入 ${inserted.length} 条预设规则`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
