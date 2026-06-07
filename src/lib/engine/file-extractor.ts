import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { FilePreviewData } from "@/types";
import { extractExcelAsync } from "./excel-async";
import { rowToStrings } from "./utils";
import { yieldToMain } from "@/lib/performance/timing";

export type SupportedExt = "xlsx" | "xls" | "docx" | "pdf";

export function getFileExtension(name: string): SupportedExt | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "docx" || ext === "pdf") return ext;
  return null;
}

export async function extractExcel(buffer: ArrayBuffer): Promise<FilePreviewData> {
  try {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellNF: false,
      cellStyles: false,
    });
    if (!workbook.SheetNames.length) {
      throw new Error("Excel 文件中没有工作表");
    }
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const rows = raw.map((r) => rowToStrings(Array.isArray(r) ? r : []));
      return { name, rows };
    });
    if (sheets.every((s) => s.rows.length === 0)) {
      throw new Error("Excel 文件内容为空，请检查是否有数据");
    }
    return { sheets };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Excel")) throw e;
    throw new Error(
      "Excel 文件损坏或格式不正确，请确认文件可正常打开（支持 .xlsx / .xls）"
    );
  }
}

export async function extractWord(buffer: ArrayBuffer): Promise<FilePreviewData> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const encodingError = result.messages.find(
      (m) =>
        m.type === "error" &&
        /encoding|charset|unicode|decode/i.test(m.message)
    );
    if (encodingError) {
      throw new Error("Word 文件编码异常，无法正确读取文本内容");
    }
    if (!result.value?.trim()) {
      throw new Error("Word 文件内容为空或无法提取文本（请使用 .docx 格式）");
    }
    return { text: result.value };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.startsWith("Word") || e.message.includes("内容为空"))
    ) {
      throw e;
    }
    throw new Error(
      "Word 文件损坏或格式不正确，请使用 .docx 格式并确认文件可正常打开"
    );
  }
}

export async function extractFile(
  file: File,
  pdfText?: string,
  onProgress?: (percent: number, stage: string) => void
): Promise<FilePreviewData> {
  const ext = getFileExtension(file.name);
  if (!ext) throw new Error("不支持的文件格式，请上传 .xlsx / .xls / .docx / .pdf 文件");

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error("文件读取失败，请确认文件未被占用或损坏");
  }

  if (buffer.byteLength === 0) {
    throw new Error("文件为空（0 字节），无法解析");
  }

  if (ext === "xlsx" || ext === "xls") {
    onProgress?.(15, "正在解析 Excel...");
    await yieldToMain();
    return extractExcelAsync(buffer, onProgress);
  }

  if (ext === "docx") {
    onProgress?.(40, "正在解析 Word...");
    await yieldToMain();
    const result = await extractWord(buffer);
    onProgress?.(100, "Word 读取完成");
    return result;
  }

  if (ext === "pdf") {
    if (!pdfText?.trim()) {
      throw new Error(
        "PDF 无法解析：未提取到文本内容，可能是扫描件或加密文件"
      );
    }
    return { text: pdfText, pageCount: pdfText.split("\f").length };
  }

  throw new Error("不支持的文件格式");
}
