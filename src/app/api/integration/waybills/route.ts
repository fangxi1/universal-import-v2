import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationAuth } from "@/lib/integration/auth";
import { listWaybills } from "@/lib/integration/waybill-service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authErr = checkIntegrationAuth(req);
  if (authErr) return authErr;

  try {
    const { searchParams } = new URL(req.url);
    const result = await listWaybills({
      page: parseInt(searchParams.get("page") || "1", 10),
      pageSize: parseInt(searchParams.get("pageSize") || "20", 10),
      warehouseId: searchParams.get("warehouseId") || undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
