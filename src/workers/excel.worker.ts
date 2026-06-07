/// <reference lib="webworker" />
import * as XLSX from "xlsx";

declare const self: DedicatedWorkerGlobalScope;

function rowToStrings(row: unknown[]): string[] {
  return row.map((c) => (c == null ? "" : String(c)));
}

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const { buffer } = event.data;
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      cellNF: false,
      cellStyles: false,
    });
    if (!workbook.SheetNames.length) {
      self.postMessage({ ok: false, error: "Excel 文件中没有工作表" });
      return;
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
      self.postMessage({ ok: false, error: "Excel 文件内容为空" });
      return;
    }

    self.postMessage({ ok: true, sheets });
  } catch {
    self.postMessage({
      ok: false,
      error: "Excel 文件损坏或格式不正确",
    });
  }
};

export {};
