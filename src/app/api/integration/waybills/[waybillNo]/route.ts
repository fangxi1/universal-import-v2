import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationAuth } from "@/lib/integration/auth";
import { getWaybillByCode } from "@/lib/integration/waybill-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ waybillNo: string }> }
) {
  const authErr = checkIntegrationAuth(req);
  if (authErr) return authErr;

  try {
    const { waybillNo } = await params;
    const waybill = await getWaybillByCode(waybillNo);
    if (!waybill) {
      return NextResponse.json({ error: "运单不存在（externalCode 未找到）" }, { status: 404 });
    }
    return NextResponse.json({ data: waybill });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
