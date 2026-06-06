import { NextResponse } from "next/server";
import { ensureTables, formatDbError } from "@/lib/db";

export async function POST() {
  try {
    await ensureTables();
    return NextResponse.json({ ok: true, message: "数据库表初始化成功" });
  } catch (e) {
    const msg = formatDbError(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureTables();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
