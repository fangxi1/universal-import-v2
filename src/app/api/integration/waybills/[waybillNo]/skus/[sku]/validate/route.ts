import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationAuth } from "@/lib/integration/auth";
import { validateSkuOnWaybill } from "@/lib/integration/waybill-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ waybillNo: string; sku: string }> }
) {
  const authErr = checkIntegrationAuth(req);
  if (authErr) return authErr;

  try {
    const { waybillNo, sku } = await params;
    const valid = await validateSkuOnWaybill(waybillNo, sku);
    return NextResponse.json({ valid, waybillNo, sku });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "校验失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
