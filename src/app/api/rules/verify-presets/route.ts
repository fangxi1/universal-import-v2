import { NextResponse } from "next/server";
import { verifyAllPresets } from "@/lib/presets/verify-presets";

/** 考点3自测：9 份出库单预设规则兼容性验证 */
export async function GET() {
  const report = verifyAllPresets();
  return NextResponse.json({
    ok: report.failed === 0,
    passed: report.passed,
    total: 9,
    results: report.results,
  });
}
