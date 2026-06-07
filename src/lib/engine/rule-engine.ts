import { v4 as uuidv4 } from "uuid";
import type {
  FilePreviewData,
  OrderField,
  OrderRow,
  ParseProgress,
  ParseRuleConfig,
  RuleStep,
} from "@/types";
import {
  applyTransform,
  createEmptyOrderRow,
  findColumnIndex,
  isEmptyRow,
  matchPattern,
  resolveColumn,
  trimCell,
} from "./utils";
import {
  normalizePdfTableLines,
  preparePdfTextForParsing,
  scanPdfDeliveryItems,
  stripPdfItemLineFooter,
  tryParsePdfDeliveryItemLine,
} from "./pdf-delivery-rule";
import { estimateDataRows } from "./import-utils";
import { yieldToMain } from "@/lib/performance/timing";

type RowProgressReporter = (current: number, rowTotal: number) => void;

interface SheetBlock {
  name: string;
  rows: string[][];
}

interface EngineState {
  sheets: SheetBlock[];
  rows: string[][];
  headers: string[];
  footer: Partial<Record<OrderField, string>>;
  text: string;
  pages: string[];
  records: Partial<Record<OrderField, string>>[];
}

function initState(data: FilePreviewData): EngineState {
  const sheets =
    data.sheets?.map((s) => ({ name: s.name, rows: s.rows })) ?? [];
  const firstRows = sheets[0]?.rows ?? [];
  return {
    sheets,
    rows: firstRows,
    headers: [],
    footer: {},
    text: data.text ?? "",
    pages: data.text ? data.text.split(/\f|\n---+\n/) : [],
    records: [],
  };
}

function getHeaderRow(rows: string[][], headerRow?: number): string[] {
  const idx = headerRow ?? 0;
  return rows[idx]?.map((h, i) => h || `col_${i}`) ?? [];
}

function extractFooterFromRows(
  rows: string[][],
  patterns: import("@/types").FooterPattern[],
  scanFromBottom = 15,
  scanFromTop?: number
): Partial<Record<OrderField, string>> {
  const footer: Partial<Record<OrderField, string>> = {};
  const tail =
    scanFromTop != null
      ? rows.slice(0, scanFromTop)
      : rows.slice(Math.max(0, rows.length - scanFromBottom));
  const flat = tail.map((r) => r.join(" ")).join("\n");

  for (const p of patterns) {
    if (footer[p.field]?.trim()) continue;
    const m = matchPattern(flat, p.labelPattern);
    if (m) {
      const group = p.valueGroup ?? 1;
      footer[p.field] = trimCell(m[group] ?? m[0]);
    }
  }

  for (const row of tail) {
    const line = row.join(" ");
    for (const p of patterns) {
      if (footer[p.field]?.trim()) continue;
      const m = matchPattern(line, p.labelPattern);
      if (m) {
        const group = p.valueGroup ?? 1;
        footer[p.field] = trimCell(m[group] ?? m[0]);
      }
    }

    for (let i = 0; i < row.length; i++) {
      const label = trimCell(row[i]);
      if (!label) continue;

      const colonVal = label.match(
        /^(调入门店|收货门店|收货人|联系人|收货电话|联系电话|电话|收货地址|地址|调拨单号|单据号)[：:\s|]+(.+)$/
      );
      if (colonVal) {
        assignFooterLabel(footer, colonVal[1], colonVal[2]);
        continue;
      }

      const next = trimCell(row[i + 1] ?? "");
      if (!next) continue;
      if (label === "调入门店" || label.startsWith("调入门店")) {
        assignFooterLabel(footer, "调入门店", next);
        i++;
      } else if (label === "收货门店" || label.startsWith("收货门店")) {
        assignFooterLabel(footer, "收货门店", next);
        i++;
      } else if (label === "收货人" || label.startsWith("收货人")) {
        assignFooterLabel(footer, "收货人", next);
        i++;
      } else if (label === "联系人" || label.startsWith("联系人")) {
        assignFooterLabel(footer, "联系人", next);
        i++;
      } else if (label === "收货电话" || label.startsWith("收货电话")) {
        assignFooterLabel(footer, "收货电话", next);
        i++;
      } else if (label === "联系电话" || label.startsWith("联系电话")) {
        assignFooterLabel(footer, "联系电话", next);
        i++;
      } else if (label === "电话" || label.startsWith("电话")) {
        assignFooterLabel(footer, "电话", next);
        i++;
      } else if (label === "收货地址" || label.startsWith("收货地址")) {
        assignFooterLabel(footer, "收货地址", next);
        i++;
      } else if (label === "调拨单号" || label.startsWith("调拨单号")) {
        assignFooterLabel(footer, "调拨单号", next);
        i++;
      } else if (label === "单据号" || label.startsWith("单据号")) {
        assignFooterLabel(footer, "单据号", next);
        i++;
      }
    }
  }

  return footer;
}

function assignFooterLabel(
  footer: Partial<Record<OrderField, string>>,
  label: string,
  value: string
) {
  const v = trimCell(value);
  if (!v) return;
  if (/调入门店|收货门店/.test(label) && !footer.storeName?.trim()) footer.storeName = v;
  else if (/^联系人/.test(label) && !footer.recipientName?.trim())
    footer.recipientName = v;
  else if (/收货人/.test(label) && !footer.recipientName?.trim())
    footer.recipientName = v;
  else if (/联系电话|收货电话|^电话/.test(label) && !footer.recipientPhone?.trim())
    footer.recipientPhone = v;
  else if (/收货地址|^地址/.test(label) && !footer.recipientAddress?.trim())
    footer.recipientAddress = v;
  else if (/调拨单号/.test(label) && !footer.externalCode?.trim())
    footer.externalCode = v;
  else if (/单据号/.test(label) && !footer.externalCode?.trim())
    footer.externalCode = v;
}

function applyStep(
  state: EngineState,
  step: RuleStep,
  onRowProgress?: RowProgressReporter
): void {
  switch (step.type) {
    case "skipRows": {
      state.rows = state.rows.slice(step.count);
      break;
    }
    case "skipUntilMatch": {
      const max = step.maxScan ?? 50;
      let idx = 0;
      for (; idx < Math.min(state.rows.length, max); idx++) {
        const line = state.rows[idx].join(" ");
        if (matchPattern(line, step.pattern)) break;
      }
      state.rows = state.rows.slice(idx);
      break;
    }
    case "extractTable": {
      const hIdx = step.headerRow ?? 0;
      state.headers = getHeaderRow(state.rows, hIdx);
      let dataRows = state.rows.slice(hIdx + 1);
      if (step.endMarker) {
        const endIdx = dataRows.findIndex((r) =>
          matchPattern(r.join(" "), step.endMarker!)
        );
        if (endIdx >= 0) dataRows = dataRows.slice(0, endIdx);
      }
      if (step.skipPatterns?.length) {
        dataRows = dataRows.filter((r) => {
          const line = r.join(" ");
          return !step.skipPatterns!.some((p) => matchPattern(line, p));
        });
      }
      state.rows = dataRows.filter((r) => !isEmptyRow(r));
      break;
    }
    case "extractFooter": {
      const useFullSheet =
        step.scanFromBottom != null || step.scanFromTop != null;
      const sourceRows = useFullSheet
        ? (state.sheets[0]?.rows ?? state.rows)
        : state.rows.length
          ? state.rows
          : (state.sheets[0]?.rows ?? []);
      state.footer = {
        ...state.footer,
        ...extractFooterFromRows(
          sourceRows,
          step.patterns,
          step.scanFromBottom,
          step.scanFromTop
        ),
      };
      break;
    }
    case "groupBy": {
      const keyCol = findColumnIndex(state.headers, String(step.keyField));
      const inheritCols = step.inheritFields.map((f) =>
        findColumnIndex(state.headers, String(f))
      );
      const inheritByKey = new Map<string, string[]>();

      for (const row of state.rows) {
        const key = row[keyCol]?.trim() ?? "";
        if (!key) continue;
        const rowValues = inheritCols.map((c) => row[c]?.trim() ?? "");
        if (!inheritByKey.has(key)) {
          inheritByKey.set(key, rowValues);
        } else {
          const existing = inheritByKey.get(key)!;
          inheritCols.forEach((_, i) => {
            if (!existing[i]?.trim() && rowValues[i]?.trim()) {
              existing[i] = rowValues[i];
            }
          });
        }
      }

      state.rows = state.rows
        .filter((row) => (row[keyCol]?.trim() ?? "") !== "")
        .map((row) => {
          const key = row[keyCol]?.trim() ?? "";
          const inherited = inheritByKey.get(key) ?? [];
          const newRow = [...row];
          inheritCols.forEach((col, i) => {
            if (!newRow[col]?.trim()) newRow[col] = inherited[i] ?? "";
          });
          return newRow;
        });
      break;
    }
    case "matrixTranspose": {
      state.records = buildMatrixTransposeRecords(state.rows, step);
      state.rows = [];
      break;
    }
    case "processAllSheets": {
      break;
    }
    case "cardSplit": {
      const cards: string[][][] = [];
      let current: string[][] = [];

      const rowMatchesStart = (row: string[]) =>
        row.some((cell) => matchPattern(cell, step.startMarker)) ||
        matchPattern(row.join(" "), step.startMarker);

      for (const row of state.rows) {
        if (rowMatchesStart(row)) {
          if (current.length && rowMatchesStart(current[0] ?? [])) {
            cards.push(current);
          }
          current = [row];
        } else if (step.endMarker && matchPattern(row.join(" "), step.endMarker)) {
          current.push(row);
          cards.push(current);
          current = [];
        } else {
          current.push(row);
        }
      }
      if (current.length) cards.push(current);

      if (step.innerSteps?.length && cards.length > 0) {
        const merged: Partial<Record<OrderField, string>>[] = [];
        for (const cardRows of cards) {
          const sub: EngineState = {
            sheets: [{ name: "card", rows: cardRows }],
            rows: [...cardRows],
            headers: [],
            footer: { ...state.footer },
            text: state.text,
            pages: state.pages,
            records: [],
          };
          for (const inner of step.innerSteps) {
            applyStep(sub, inner);
          }
          if (sub.records.length) {
            merged.push(...sub.records);
          } else if (sub.rows.length) {
            merged.push(
              ...sub.rows.map((r) => {
                const rec = createEmptyOrderRow("");
                sub.headers.forEach((h, i) => {
                  rec.skuCode = rec.skuCode || r[i] || "";
                });
                return rec;
              })
            );
          }
        }
        state.records = merged;
        state.rows = [];
      } else {
        state.rows = cards.flat();
      }
      break;
    }
    case "textBlockSplit": {
      if (state.text) {
        state.text = preparePdfTextForParsing(state.text);
      }

      const extractPdfMeta = (text: string) => {
        const rec = createEmptyOrderRow("");
        for (const line of text.split("\n")) {
          const trimmed = stripPdfItemLineFooter(line.trim());
          if (!trimmed) continue;
          for (const lp of step.linePatterns) {
            if (lp.isItemLine || !lp.field) continue;
            const m = matchPattern(trimmed, lp.pattern);
            if (m) rec[lp.field] = trimCell(m[1] ?? m[0]);
          }
        }
        return rec;
      };

      if (/ZBWP/i.test(state.text)) {
        const scanned = scanPdfDeliveryItems(state.text, true);
        if (scanned.length > 0) {
          const meta = extractPdfMeta(state.text);
          state.records = scanned.map((item) => ({ ...meta, ...item }));
          break;
        }
      }

      const blocks = state.text.split(new RegExp(step.blockSeparator, "m"));
      const records: Partial<Record<OrderField, string>>[] = [];
      const globalMeta = createEmptyOrderRow("");

      for (const block of blocks) {
        if (!block.trim()) continue;
        const rec = createEmptyOrderRow("");
        const items: Partial<Record<OrderField, string>>[] = [];

        for (const line of block.split("\n")) {
          const trimmed = stripPdfItemLineFooter(line.trim());
          if (!trimmed) continue;

          let itemMatched = false;

          if (/ZBWP/i.test(trimmed)) {
            const parsed = tryParsePdfDeliveryItemLine(trimmed);
            if (parsed?.skuCode) {
              items.push(parsed);
              itemMatched = true;
            }
          }

          if (!itemMatched) {
            for (const lp of step.linePatterns) {
              if (!lp.isItemLine || !lp.itemFields) continue;
              const m = matchPattern(trimmed, lp.pattern);
              if (!m) continue;
              const item: Partial<Record<OrderField, string>> = {};
              for (const [field, groupIdx] of Object.entries(lp.itemFields)) {
                item[field as OrderField] = trimCell(m[groupIdx]);
              }
              items.push(item);
              itemMatched = true;
              break;
            }
          }

          if (itemMatched) continue;

          for (const lp of step.linePatterns) {
            if (lp.isItemLine || !lp.field) continue;
            const m = matchPattern(trimmed, lp.pattern);
            if (!m) continue;
            rec[lp.field] = trimCell(m[1] ?? m[0]);
          }
        }

        if (items.length === 0 && /ZBWP/i.test(block)) {
          items.push(...scanPdfDeliveryItems(block, true));
        }

        for (const key of Object.keys(rec) as OrderField[]) {
          if (rec[key]?.trim()) globalMeta[key] = rec[key];
        }

        if (items.length) {
          for (const item of items) {
            records.push({ ...rec, ...item });
          }
        } else if (Object.values(rec).some((v) => v?.trim())) {
          records.push(rec);
        }
      }

      if (records.length) {
        for (const rec of records) {
          for (const key of Object.keys(globalMeta) as OrderField[]) {
            if (!rec[key]?.trim() && globalMeta[key]?.trim()) {
              rec[key] = globalMeta[key];
            }
          }
        }
      }

      state.records = records;
      break;
    }
    case "compositeCellSplit": {
      const colIdx =
        typeof step.column === "number"
          ? step.column
          : findColumnIndex(state.headers, step.column);
      const itemRe = new RegExp(step.itemPattern);
      const expanded: string[][] = [];

      for (const row of state.rows) {
        const cell = row[colIdx] ?? "";
        const parts = cell.split(step.delimiter ?? "\n").filter(Boolean);
        if (parts.length <= 1) {
          expanded.push(row);
          continue;
        }
        for (const part of parts) {
          const m = part.match(itemRe);
          const newRow = [...row];
          if (m) {
            newRow[colIdx] = part;
            if (m[1]) newRow[findColumnIndex(state.headers, "skuName")] = m[1];
            if (m[2]) newRow[findColumnIndex(state.headers, "skuQuantity")] = m[2];
          }
          expanded.push(newRow);
        }
      }
      state.rows = expanded;
      break;
    }
    case "dateStoreMatrix": {
      const dateHeaders = state.rows[step.dateHeaderRow] ?? [];
      const records: Partial<Record<OrderField, string>>[] = [];
      const itemRe = new RegExp(step.cellItemPattern);

      for (let r = step.dataStartRow; r < state.rows.length; r++) {
        const row = state.rows[r];
        const store = row[step.storeColumn]?.trim();
        if (!store) continue;

        dateHeaders.forEach((dateLabel, colIdx) => {
          if (colIdx === step.storeColumn || !dateLabel?.trim()) return;
          const cell = row[colIdx] ?? "";
          const lines = cell.split("\n").filter(Boolean);
          for (const line of lines) {
            const m = line.match(itemRe);
            if (m) {
              records.push({
                storeName: store,
                skuName: trimCell(m[1]),
                skuQuantity: trimCell(m[2]),
                skuCode: trimCell(m[1]),
                externalCode: `${store}-${dateLabel}`,
                remark: dateLabel,
              });
            }
          }
        });
      }
      state.records = records;
      break;
    }
    case "pdfSplit": {
      const fullText = state.text || state.pages.join("\n");
      const parts = fullText.split(new RegExp(step.orderMarker, "m"));
      state.text = parts.filter((p) => p.trim()).join("\n---SPLIT---\n");
      break;
    }
    case "filterRows": {
      const shouldKeepRow = (line: string, skuEmpty?: boolean) => {
        if (step.skipPatterns.some((p) => matchPattern(line, p))) return false;
        if (step.skipEmptySku && skuEmpty) return false;
        return !isEmptyRow(line.split(/\s+/));
      };

      if (state.rows.length) {
        state.rows = state.rows.filter((r) => {
          const line = r.join(" ");
          const skuIdx = findColumnIndex(state.headers, "sku");
          const skuEmpty = skuIdx >= 0 && !r[skuIdx]?.trim();
          return shouldKeepRow(line, step.skipEmptySku ? skuEmpty : false);
        });
      }

      if (state.records.length) {
        state.records = state.records.filter((rec) => {
          const line = [
            rec.skuCode,
            rec.skuName,
            rec.skuQuantity,
            rec.externalCode,
            rec.remark,
          ]
            .filter(Boolean)
            .join(" ");
          const skuEmpty = !rec.skuCode?.trim();
          if (/^(物品编码|编码|sku)/i.test(rec.skuCode ?? "")) return false;
          if (/^(物品名称|名称|品名)/i.test(rec.skuName ?? "")) return false;
          return shouldKeepRow(line, step.skipEmptySku ? skuEmpty : false);
        });
      }
      break;
    }
    case "mapFields": {
      const mapped: Partial<Record<OrderField, string>>[] = [];

      const mapOne = (row: string[]) => {
        const rec = createEmptyOrderRow("");
        for (const m of step.mappings) {
          let val = "";
          if (m.source === "footer" && m.footerField) {
            val = state.footer[m.footerField] ?? "";
          } else if (m.source === "static") {
            val = m.staticValue ?? "";
          } else if (typeof m.source === "number" || typeof m.source === "string") {
            val = resolveColumn(m.source, state.headers, row);
          }
          const transformed = applyTransform(val, m.transform);
          if (transformed.trim() || !rec[m.target]?.trim()) {
            rec[m.target] = transformed;
          }
        }
        return rec;
      };

      if (state.records.length && !state.rows.length) {
        mapped.push(...state.records);
      } else if (state.records.length && state.rows.length) {
        for (const rec of state.records) {
          mapped.push({ ...mapOne(state.rows[0] ?? []), ...rec });
        }
      } else {
        const totalRows = state.rows.length;
        for (let i = 0; i < state.rows.length; i++) {
          mapped.push(mapOne(state.rows[i]));
          if (
            onRowProgress &&
            (i % 50 === 0 || i === totalRows - 1)
          ) {
            onRowProgress(i + 1, totalRows);
          }
        }
      }
      state.records = mapped;
      break;
    }
    case "setDefaults": {
      state.records = state.records.map((rec) => ({
        ...step.defaults,
        ...rec,
      }));
      break;
    }
  }
}

export function executeRuleEngine(
  data: FilePreviewData,
  config: ParseRuleConfig,
  onProgress?: (p: ParseProgress) => void
): OrderRow[] {
  const hasMultiSheet = config.steps.some((s) => s.type === "processAllSheets");

  if (hasMultiSheet && data.sheets && data.sheets.length > 1) {
    const stepsWithoutMulti = config.steps.filter((s) => s.type !== "processAllSheets");
    const perSheetConfig: ParseRuleConfig = { ...config, steps: stepsWithoutMulti };
    return executeMultiSheetRule(data, perSheetConfig, onProgress);
  }

  const state = initState(data);
  const totalSteps = config.steps.length;
  const estimatedRows = estimateDataRows(data);

  config.steps.forEach((step, i) => {
    const reportProgress = (current: number, rowTotal: number) => {
      const stepBase = i / totalSteps;
      const stepPortion = 1 / totalSteps;
      const rowRatio = rowTotal > 0 ? current / rowTotal : 1;
      onProgress?.({
        percent: Math.min(
          100,
          Math.round((stepBase + stepPortion * rowRatio) * 100)
        ),
        current,
        total: rowTotal || estimatedRows,
        stage: `执行规则: ${step.type} · ${current}/${rowTotal || estimatedRows} 条`,
      });
    };

    if (step.type === "mapFields") {
      applyStep(state, step, reportProgress);
    } else {
      applyStep(state, step);
      reportProgress(
        Math.min(
          estimatedRows,
          Math.round(((i + 1) / totalSteps) * estimatedRows)
        ),
        estimatedRows
      );
    }
  });

  onProgress?.({
    percent: 100,
    current: state.records.length || estimatedRows,
    total: state.records.length || estimatedRows,
    stage: "解析完成",
  });

  return recordsToRows(state.records);
}

function executeMultiSheetRule(
  data: FilePreviewData,
  perSheetConfig: ParseRuleConfig,
  onProgress?: (p: ParseProgress) => void
): OrderRow[] {
  const allRows: OrderRow[] = [];
  const sheets = data.sheets!;
  const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
  let processedRows = 0;

  sheets.forEach((sheet) => {
    const sheetData: FilePreviewData = { sheets: [sheet] };
    const rows = executeRuleEngine(sheetData, perSheetConfig, (p) => {
      const sheetOffset = processedRows + p.current;
      onProgress?.({
        percent: Math.min(
          100,
          Math.round((sheetOffset / Math.max(totalRows, 1)) * 100)
        ),
        current: sheetOffset,
        total: totalRows,
        stage: `解析 Sheet: ${sheet.name} · ${p.current}/${sheet.rows.length} 条`,
      });
    });
    processedRows += sheet.rows.length;
    allRows.push(
      ...rows.map((r) => ({
        ...r,
        storeName: r.storeName?.trim() ? r.storeName : sheet.name,
      }))
    );
  });

  return allRows;
}

function buildMatrixTransposeRecords(
  rows: string[][],
  step: Extract<RuleStep, { type: "matrixTranspose" }>
): Partial<Record<OrderField, string>>[] {
  const headerRow = rows[step.headerRow] ?? [];
  const dataRows = rows.slice(step.dataStartRow);
  const newRecords: Partial<Record<OrderField, string>>[] = [];
  const skuCodeCol = step.skuCodeColumn ?? step.rowLabelColumn;
  const skuNameCol = step.skuNameColumn ?? step.rowLabelColumn;

  for (const row of dataRows) {
    if (isEmptyRow(row)) continue;
    const skuCode = trimCell(row[skuCodeCol]);
    const skuName = trimCell(row[skuNameCol]);
    if (!skuCode && !skuName) continue;

    headerRow.forEach((colHeader, colIdx) => {
      if (step.skipColumns?.includes(colIdx)) return;
      if (colIdx === skuCodeCol || colIdx === skuNameCol) return;
      if (
        step.rowLabelColumn === colIdx &&
        step.skuCodeColumn == null &&
        step.skuNameColumn == null
      ) {
        return;
      }

      const header = trimCell(colHeader);
      if (!header) return;
      if (step.skipHeaderPatterns?.some((p) => matchPattern(header, p))) {
        return;
      }

      const qty = row[colIdx]?.trim();
      if (!qty || qty === "0") return;

      newRecords.push({
        skuCode: skuCode || skuName,
        skuName: skuName || skuCode,
        skuQuantity: qty,
        storeName: header,
        ...step.staticFields,
      });
    });
  }

  return newRecords;
}

async function applyMatrixTransposeAsync(
  state: EngineState,
  step: Extract<RuleStep, { type: "matrixTranspose" }>,
  onRowProgress?: RowProgressReporter
): Promise<void> {
  const headerRow = state.rows[step.headerRow] ?? [];
  const dataRows = state.rows.slice(step.dataStartRow);
  const newRecords: Partial<Record<OrderField, string>>[] = [];
  const skuCodeCol = step.skuCodeColumn ?? step.rowLabelColumn;
  const skuNameCol = step.skuNameColumn ?? step.rowLabelColumn;
  const YIELD_EVERY = 40;
  const total = dataRows.length;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (isEmptyRow(row)) continue;
    const skuCode = trimCell(row[skuCodeCol]);
    const skuName = trimCell(row[skuNameCol]);
    if (!skuCode && !skuName) continue;

    headerRow.forEach((colHeader, colIdx) => {
      if (step.skipColumns?.includes(colIdx)) return;
      if (colIdx === skuCodeCol || colIdx === skuNameCol) return;
      if (
        step.rowLabelColumn === colIdx &&
        step.skuCodeColumn == null &&
        step.skuNameColumn == null
      ) {
        return;
      }

      const header = trimCell(colHeader);
      if (!header) return;
      if (step.skipHeaderPatterns?.some((p) => matchPattern(header, p))) {
        return;
      }

      const qty = row[colIdx]?.trim();
      if (!qty || qty === "0") return;

      newRecords.push({
        skuCode: skuCode || skuName,
        skuName: skuName || skuCode,
        skuQuantity: qty,
        storeName: header,
        ...step.staticFields,
      });
    });

    if (rowIdx % YIELD_EVERY === 0 || rowIdx === total - 1) {
      onRowProgress?.(rowIdx + 1, total);
      if (rowIdx > 0 && rowIdx % YIELD_EVERY === 0) {
        await yieldToMain();
      }
    }
  }

  state.records = newRecords;
  state.rows = [];
}

function recordToOrderRow(rec: Partial<Record<OrderField, string>>): OrderRow | null {
  if (
    !rec.skuCode &&
    !rec.skuName &&
    !rec.skuQuantity &&
    !rec.storeName &&
    !rec.recipientName
  ) {
    return null;
  }
  return {
    id: uuidv4(),
    externalCode: rec.externalCode ?? "",
    storeName: rec.storeName ?? "",
    recipientName: rec.recipientName ?? "",
    recipientPhone: rec.recipientPhone ?? "",
    recipientAddress: rec.recipientAddress ?? "",
    skuCode: rec.skuCode ?? "",
    skuName: rec.skuName ?? "",
    skuQuantity: rec.skuQuantity ?? "",
    weight: rec.weight ?? "",
    tempLayer: rec.tempLayer ?? "",
    skuSpec: rec.skuSpec ?? "",
    remark: rec.remark ?? "",
  };
}

function recordsToRows(records: Partial<Record<OrderField, string>>[]): OrderRow[] {
  const rows: OrderRow[] = [];
  for (const rec of records) {
    const row = recordToOrderRow(rec);
    if (row) rows.push(row);
  }
  return rows;
}

async function recordsToRowsAsync(
  records: Partial<Record<OrderField, string>>[],
  onProgress?: RowProgressReporter
): Promise<OrderRow[]> {
  const rows: OrderRow[] = [];
  const total = records.length;
  const YIELD_EVERY = 150;

  for (let i = 0; i < records.length; i++) {
    const row = recordToOrderRow(records[i]);
    if (row) rows.push(row);

    if (i % YIELD_EVERY === 0 || i === total - 1) {
      onProgress?.(i + 1, total);
      if (i > 0 && i % YIELD_EVERY === 0) {
        await yieldToMain();
      }
    }
  }

  return rows;
}

export async function executeRuleEngineAsync(
  data: FilePreviewData,
  config: ParseRuleConfig,
  onProgress?: (p: ParseProgress) => void
): Promise<OrderRow[]> {
  const hasMultiSheet = config.steps.some((s) => s.type === "processAllSheets");

  if (hasMultiSheet && data.sheets && data.sheets.length > 1) {
    return executeMultiSheetRuleAsync(data, config, onProgress);
  }

  const state = initState(data);
  const totalSteps = config.steps.length;
  const estimatedRows = estimateDataRows(data);

  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    const reportProgress = (current: number, rowTotal: number) => {
      const stepBase = i / totalSteps;
      const stepPortion = 1 / totalSteps;
      const rowRatio = rowTotal > 0 ? current / rowTotal : 1;
      onProgress?.({
        percent: Math.min(
          100,
          Math.round((stepBase + stepPortion * rowRatio) * 100)
        ),
        current,
        total: rowTotal || estimatedRows,
        stage: `执行规则: ${step.type} · ${current}/${rowTotal || estimatedRows} 条`,
      });
    };

    if (step.type === "mapFields" && state.rows.length > 80) {
      await applyMapFieldsAsync(state, step, reportProgress);
    } else if (step.type === "mapFields") {
      applyStep(state, step, reportProgress);
    } else if (
      step.type === "matrixTranspose" &&
      state.rows.slice(step.dataStartRow).length > 80
    ) {
      await applyMatrixTransposeAsync(state, step, reportProgress);
    } else {
      applyStep(state, step);
      reportProgress(
        Math.min(
          estimatedRows,
          Math.round(((i + 1) / totalSteps) * estimatedRows)
        ),
        estimatedRows
      );
    }
    await yieldToMain();
  }

  onProgress?.({
    percent: 95,
    current: state.records.length || estimatedRows,
    total: state.records.length || estimatedRows,
    stage: "生成预览行...",
  });

  const rows = await recordsToRowsAsync(state.records, (current, total) => {
    onProgress?.({
      percent: Math.min(
        100,
        95 + Math.round((current / Math.max(total, 1)) * 5)
      ),
      current,
      total,
      stage: `生成预览行 · ${current}/${total}`,
    });
  });

  onProgress?.({
    percent: 100,
    current: rows.length,
    total: rows.length,
    stage: "解析完成",
  });

  return rows;
}

async function applyMapFieldsAsync(
  state: EngineState,
  step: Extract<RuleStep, { type: "mapFields" }>,
  onRowProgress?: RowProgressReporter
): Promise<void> {
  const mapped: Partial<Record<OrderField, string>>[] = [];

  const mapOne = (row: string[]) => {
    const rec = createEmptyOrderRow("");
    for (const m of step.mappings) {
      let val = "";
      if (m.source === "footer" && m.footerField) {
        val = state.footer[m.footerField] ?? "";
      } else if (m.source === "static") {
        val = m.staticValue ?? "";
      } else if (typeof m.source === "number" || typeof m.source === "string") {
        val = resolveColumn(m.source, state.headers, row);
      }
      const transformed = applyTransform(val, m.transform);
      if (transformed.trim() || !rec[m.target]?.trim()) {
        rec[m.target] = transformed;
      }
    }
    return rec;
  };

  if (state.records.length && !state.rows.length) {
    mapped.push(...state.records);
  } else if (state.records.length && state.rows.length) {
    for (const rec of state.records) {
      mapped.push({ ...mapOne(state.rows[0] ?? []), ...rec });
    }
  } else {
    const totalRows = state.rows.length;
    const YIELD_EVERY = 50;
    for (let i = 0; i < state.rows.length; i++) {
      mapped.push(mapOne(state.rows[i]));
      if (i % YIELD_EVERY === 0 || i === totalRows - 1) {
        onRowProgress?.(i + 1, totalRows);
        if (i > 0 && i % YIELD_EVERY === 0) {
          await yieldToMain();
        }
      }
    }
  }
  state.records = mapped;
}

async function executeMultiSheetRuleAsync(
  data: FilePreviewData,
  config: ParseRuleConfig,
  onProgress?: (p: ParseProgress) => void
): Promise<OrderRow[]> {
  const stepsWithoutMulti = config.steps.filter((s) => s.type !== "processAllSheets");
  const perSheetConfig: ParseRuleConfig = { ...config, steps: stepsWithoutMulti };
  const allRows: OrderRow[] = [];
  const sheets = data.sheets!;
  const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0);
  let processedRows = 0;

  for (const sheet of sheets) {
    const sheetData: FilePreviewData = { sheets: [sheet] };
    const rows = await executeRuleEngineAsync(sheetData, perSheetConfig, (p) => {
      const sheetOffset = processedRows + p.current;
      onProgress?.({
        percent: Math.min(
          100,
          Math.round((sheetOffset / Math.max(totalRows, 1)) * 100)
        ),
        current: sheetOffset,
        total: totalRows,
        stage: `解析 Sheet: ${sheet.name} · ${p.current}/${sheet.rows.length} 条`,
      });
    });
    processedRows += sheet.rows.length;
    allRows.push(
      ...rows.map((r) => ({
        ...r,
        storeName: r.storeName?.trim() ? r.storeName : sheet.name,
      }))
    );
    await yieldToMain();
  }

  return allRows;
}

export function previewRuleOnSample(
  data: FilePreviewData,
  config: ParseRuleConfig,
  limit = 20
): OrderRow[] {
  return executeRuleEngine(data, config).slice(0, limit);
}
