import { NextRequest, NextResponse } from "next/server";
import { inArray, isNotNull } from "drizzle-orm";
import { db, ensureTables } from "@/lib/db";
import { orders } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const { codes } = body as { codes: string[] };

    if (!codes?.length) {
      return NextResponse.json({ existing: [] });
    }

    const filtered = codes.filter(Boolean);
    if (!filtered.length) {
      return NextResponse.json({ existing: [] });
    }

    const rows = await db
      .select({ externalCode: orders.externalCode })
      .from(orders)
      .where(inArray(orders.externalCode, filtered));

    const existing = rows
      .map((r) => r.externalCode)
      .filter((c): c is string => !!c);

    return NextResponse.json({ existing });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureTables();
    const rows = await db
      .select({ externalCode: orders.externalCode })
      .from(orders)
      .where(isNotNull(orders.externalCode));

    const existing = rows
      .map((r) => r.externalCode)
      .filter((c): c is string => !!c);

    return NextResponse.json({ existing });
  } catch (e) {
    return NextResponse.json({ existing: [] });
  }
}
