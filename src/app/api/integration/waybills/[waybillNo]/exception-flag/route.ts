import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationAuth } from "@/lib/integration/auth";
import {
  getExceptionFlag,
  getWaybillByCode,
  setExceptionFlag,
} from "@/lib/integration/waybill-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ waybillNo: string }> }
) {
  const authErr = checkIntegrationAuth(req);
  if (authErr) return authErr;

  const { waybillNo } = await params;
  const flag = await getExceptionFlag(waybillNo);
  return NextResponse.json({ data: flag || { hasOpenException: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ waybillNo: string }> }
) {
  const authErr = checkIntegrationAuth(req);
  if (authErr) return authErr;

  try {
    const { waybillNo } = await params;
    const exists = await getWaybillByCode(waybillNo);
    if (!exists) {
      return NextResponse.json({ error: "运单不存在" }, { status: 404 });
    }
    const body = await req.json();
    await setExceptionFlag(waybillNo, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "回写失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
