import { NextRequest, NextResponse } from "next/server";
import { callLlmForRule } from "@/lib/ai/llm-client";
import type { FilePreviewData } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, previewData } = body as {
      fileName: string;
      previewData: FilePreviewData;
    };

    if (!fileName || !previewData) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const result = await callLlmForRule(previewData, fileName);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 规则生成失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 60;
