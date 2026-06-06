import * as XLSX from "xlsx";
import type { OrderRow } from "@/types";
import { FIELD_LABELS, ORDER_FIELDS } from "@/types";

export function exportOrdersToExcel(rows: OrderRow[], fileName = "导出运单.xlsx"): void {
  const headerRow = ORDER_FIELDS.map((f) => FIELD_LABELS[f]);
  const dataRows = rows.map((row) =>
    ORDER_FIELDS.map((f) => row[f] ?? "")
  );

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "运单数据");
  XLSX.writeFile(wb, fileName);
}
