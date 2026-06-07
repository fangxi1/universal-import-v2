import type { OrderField } from "@/types";

export function trimCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function rowToStrings(row: unknown[]): string[] {
  return row.map((c) => trimCell(c));
}

export function isEmptyRow(row: string[]): boolean {
  return row.every((c) => !c);
}

export function matchPattern(text: string, pattern: string): RegExpMatchArray | null {
  try {
    const re = new RegExp(pattern, "i");
    return text.match(re);
  } catch {
    return null;
  }
}

export function findColumnIndex(headers: string[], name: string): number {
  const lower = name.toLowerCase().trim();
  const exact = headers.findIndex((h) => h.toLowerCase().trim() === lower);
  if (exact >= 0) return exact;

  const candidates = headers
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(
      ({ h }) =>
        h.toLowerCase().includes(lower) || lower.includes(h.toLowerCase())
    );
  if (!candidates.length) return -1;

  candidates.sort((a, b) => a.h.length - b.h.length);
  return candidates[0].i;
}

export function resolveColumn(
  source: string | number,
  headers: string[],
  row: string[]
): string {
  if (typeof source === "number") {
    return row[source] ?? "";
  }
  const idx = findColumnIndex(headers, source);
  if (idx >= 0) return row[idx] ?? "";
  return row.find((_, i) => headers[i] === source) ?? "";
}

export function applyTransform(
  value: string,
  transform?: "trim" | "number" | "phone"
): string {
  if (!transform || transform === "trim") return value.trim();
  if (transform === "number") {
    const n = parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? String(n) : value.trim();
  }
  if (transform === "phone") {
    return value.replace(/[^\d+\-]/g, "").trim();
  }
  return value.trim();
}

export function createEmptyOrderRow(id: string): Record<OrderField, string> {
  return {
    externalCode: "",
    storeName: "",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    skuCode: "",
    skuName: "",
    skuQuantity: "",
    weight: "",
    tempLayer: "",
    skuSpec: "",
    remark: "",
  };
}

export function chunkProcess<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[], startIndex: number) => void,
  onProgress?: (current: number, total: number) => void
): T[] {
  const total = items.length;
  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    processor(batch, i);
    onProgress?.(Math.min(i + batchSize, total), total);
  }
  return items;
}
