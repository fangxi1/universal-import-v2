import type { FilePreviewData } from "@/types";
import { getFileExtension, type SupportedExt } from "./file-extractor";

export function estimateDataRows(data: FilePreviewData): number {
  if (data.sheets?.length) {
    return data.sheets.reduce((sum, s) => sum + s.rows.length, 0);
  }
  if (data.text) {
    return Math.max(data.text.split("\n").filter(Boolean).length, 1);
  }
  return 100;
}

export function getFileTypeLabel(ext: SupportedExt | null): string {
  switch (ext) {
    case "xlsx":
    case "xls":
      return "Excel";
    case "docx":
      return "Word";
    case "pdf":
      return "PDF";
    default:
      return "未知";
  }
}

export function describeFilePreview(data: FilePreviewData): string {
  if (data.sheets?.length) {
    const rows = data.sheets.reduce((s, sh) => s + sh.rows.length, 0);
    return `${data.sheets.length} 个 Sheet · 约 ${rows} 行`;
  }
  if (data.text) {
    return `文本 ${data.text.length} 字符 · 约 ${data.pageCount ?? 1} 页`;
  }
  return "无预览数据";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface FileMeta {
  name: string;
  size: number;
  type: SupportedExt | null;
  typeLabel: string;
  previewDesc: string;
}

export function buildFileMeta(
  file: File,
  previewData?: FilePreviewData | null
): FileMeta {
  const type = getFileExtension(file.name);
  return {
    name: file.name,
    size: file.size,
    type,
    typeLabel: getFileTypeLabel(type),
    previewDesc: previewData ? describeFilePreview(previewData) : "",
  };
}
