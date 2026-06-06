import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureTables, formatDbError } from "@/lib/db";
import { assertRuleNameAvailable } from "@/lib/db/rule-name-service";
import { parseRules } from "@/lib/db/schema";
import { normalizeRuleName } from "@/lib/rules/rule-names";

export async function GET() {
  try {
    await ensureTables();
    const rules = await db
      .select()
      .from(parseRules)
      .orderBy(desc(parseRules.updatedAt));

    return NextResponse.json(
      rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        config: r.config,
        createdAt: r.createdAt?.toISOString(),
        updatedAt: r.updatedAt?.toISOString(),
      }))
    );
  } catch (e) {
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const { name, description, config } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "规则名称不能为空" }, { status: 400 });
    }
    if (!config?.steps?.length) {
      return NextResponse.json({ error: "规则配置无效" }, { status: 400 });
    }

    try {
      await assertRuleNameAvailable(name);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "规则名称已存在" },
        { status: 409 }
      );
    }

    const [rule] = await db
      .insert(parseRules)
      .values({
        name: normalizeRuleName(name),
        description: description ?? null,
        config,
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      config: rule.config,
      createdAt: rule.createdAt?.toISOString(),
      updatedAt: rule.updatedAt?.toISOString(),
    });
  } catch (e) {
    const msg = formatDbError(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
