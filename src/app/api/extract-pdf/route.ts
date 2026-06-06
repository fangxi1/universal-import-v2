import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      return NextResponse.json({ error: "仅支持 PDF 文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "文件为空" }, { status: 400 });
    }

    const result = await pdf(buffer);
    return NextResponse.json({
      text: result.text,
      pageCount: result.numpages,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF 解析失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
