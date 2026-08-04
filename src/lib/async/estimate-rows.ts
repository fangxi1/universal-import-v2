import * as XLSX from "xlsx";

/** 轻量估算 Excel 数据行数（不含完整规则引擎） */
export function estimateExcelDataRows(buffer: ArrayBuffer): number {
  const wb = XLSX.read(buffer, { type: "array", bookSheets: false, bookProps: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return 0;
  const sheet = wb.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  const total = range.e.r - range.s.r + 1;
  // 粗估：扣少量头尾；宁可多开一批空批，也不漏行（Worker 会按真实解析行数裁剪）
  return Math.max(0, total - 3);
}

export function detectMimeAndExt(fileName: string, mimeType?: string | null) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return {
      kind: "excel" as const,
      mime:
        mimeType ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  if (lower.endsWith(".docx")) {
    return {
      kind: "word" as const,
      mime:
        mimeType ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  if (lower.endsWith(".pdf")) {
    return { kind: "pdf" as const, mime: mimeType || "application/pdf" };
  }
  return { kind: "unknown" as const, mime: mimeType || "application/octet-stream" };
}
