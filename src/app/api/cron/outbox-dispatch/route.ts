import { NextRequest, NextResponse } from "next/server";
import { ensureTables, formatDbError } from "@/lib/db";
import { getAppBaseUrl, getCronSecret } from "@/lib/async/config";
import { dispatchOutbox } from "@/lib/async/outbox";

export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = getCronSecret();
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  // Vercel Cron 带 CRON_SECRET
  if (req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    await ensureTables();
    const result = await dispatchOutbox({
      limit: 50,
      baseUrl: getAppBaseUrl(req.url),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
