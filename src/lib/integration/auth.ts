import { NextRequest, NextResponse } from "next/server";

export function checkIntegrationAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.INTEGRATION_API_KEY || process.env.V2_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "V2 未配置 INTEGRATION_API_KEY，请在环境变量中设置" },
      { status: 503 }
    );
  }
  const key = req.headers.get("X-API-Key");
  if (key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
