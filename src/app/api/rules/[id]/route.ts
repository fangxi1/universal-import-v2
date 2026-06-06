import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureTables } from "@/lib/db";
import { assertRuleNameAvailable } from "@/lib/db/rule-name-service";
import { parseRules } from "@/lib/db/schema";
import { normalizeRuleName } from "@/lib/rules/rule-names";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { id } = await ctx.params;
    const [rule] = await db.select().from(parseRules).where(eq(parseRules.id, id));
    if (!rule) return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    return NextResponse.json(rule);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "获取规则失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, description, config } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "规则名称不能为空" }, { status: 400 });
    }

    try {
      await assertRuleNameAvailable(name, id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "规则名称已存在" },
        { status: 409 }
      );
    }

    const [updated] = await db
      .update(parseRules)
      .set({
        name: normalizeRuleName(name),
        description: description ?? null,
        config,
        updatedAt: new Date(),
      })
      .where(eq(parseRules.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新规则失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await ensureTables();
    const { id } = await ctx.params;
    await db.delete(parseRules).where(eq(parseRules.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "删除规则失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
