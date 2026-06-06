import type { LinePattern, OrderField, ParseRuleConfig } from "@/types";

/** 完整 7 列数据行：序号 类别 编码 名称 规格 单位 数量 */
const FULL_ITEM_ROW =
  /^(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*$/;

/** 带 ZBWP 编码的数据行 */
const ZBWP_ITEM_ROW =
  /^(\d+)\s+(\S+)\s+(ZBWP\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*$/i;

/** pdf-parse 文本规范化：全角→半角、空白、分页符 */
export function normalizePdfExtractedText(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\f/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[：]/g, ":")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** 统一识别 ZBWP 编码（含 ZBWP 0001、ZBWP-0001、竖排拆分） */
export const ZBWP_CODE_RE = /ZBWP[\s-]*(\d+)/gi;

export function normalizeZbwpToken(token: string): string | null {
  const m = token.match(/^ZBWP[\s-]*(\d+)$/i);
  return m ? `ZBWP${m[1]}` : null;
}

/** 合并 ZBWP 与数字分行/空格拆分 */
export function normalizeZbwpCodes(text: string): string {
  let t = text;
  t = t.replace(/ZBWP[\s-]+(\d+)/gi, "ZBWP$1");
  t = t.replace(/ZBWP\s*\n\s*(\d+)/gi, "ZBWP$1");
  const lines = t.split("\n");
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^ZBWP$/i.test(line)) {
      const next = lines[i + 1]?.trim() ?? "";
      if (/^\d+$/.test(next)) {
        merged.push(`ZBWP${next}`);
        i++;
        continue;
      }
    }
    merged.push(line);
  }
  return merged.join("\n");
}

/** 无空格粘连文本：在 ZBWP 编码与中文边界插入空格 */
export function expandCompactPdfTable(text: string): string {
  if (!/ZBWP/i.test(text)) return text;
  const compact = !/\s+ZBWP/i.test(text) && text.length > 20;
  if (!compact && /\d+\s+\S+\s+ZBWP\d+/i.test(text)) return text;
  return text
    .replace(/(ZBWP\d+)/gi, " $1 ")
    .replace(/([\u4e00-\u9fffA-Za-z])(ZBWP)/gi, "$1 $2")
    .replace(/(ZBWP\d+)([\u4e00-\u9fffA-Za-z])/gi, "$1 $2")
    .replace(/(\d)([\u4e00-\u9fffA-Za-z])/g, "$1 $2")
    .replace(/([\u4e00-\u9fffA-Za-z])(\d+(?:\.\d+)?)(?=\s|$)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** pdf-parse 常把多条物品挤在同一行，按 ZBWP 行首拆成多行 */
export function splitInlinePdfItemRows(text: string): string {
  return text
    .replace(
      /([^\n])\s+(?=\d{1,4}\s+\S+\s+ZBWP[\s-]*\d+)/gi,
      "$1\n"
    )
    .replace(/([^\n])\s+(?=(?:\S+\s+)?ZBWP[\s-]*\d+)/gi, "$1\n");
}

const TABLE_HEADER_RE =
  /^(物品类别|物品编码|物品名称|规格型号|订货单位|发货数量|备注|序号)$/;
const TABLE_HEADER_COMBINED_RE =
  /物品类别.*物品编码|物品编码.*物品名称/;

function isTableHeaderLine(line: string): boolean {
  const t = line.trim();
  return TABLE_HEADER_RE.test(t) || TABLE_HEADER_COMBINED_RE.test(t);
}

function isLikelyCategoryCell(line: string): boolean {
  const t = line.trim();
  if (!t || /^ZBWP[\s-]*\d+$/i.test(t) || /^\d{1,4}$/.test(t)) return false;
  if (isTableHeaderLine(t)) return false;
  if (/^(合计|总计|小计|收货|制单|创建|发货|打印|配送单|单据)/.test(t)) return false;
  return true;
}

function isZbwpOnlyLine(line: string): boolean {
  return Boolean(normalizeZbwpToken(line.trim()) || /^ZBWP[\s-]*\d+$/i.test(line.trim()));
}

/** pdf-parse 常按「列优先」抽取表格：先全部序号，再全部编码… */
export function reconstructColumnMajorPdfTable(text: string): string {
  const rawLines = text.split("\n").map((l) => l.trim());
  const runs: Array<{ start: number; count: number }> = [];
  let i = 0;
  while (i < rawLines.length) {
    if (isZbwpOnlyLine(rawLines[i] ?? "")) {
      const start = i;
      while (i < rawLines.length && isZbwpOnlyLine(rawLines[i] ?? "")) i++;
      if (i - start >= 2) runs.push({ start, count: i - start });
    } else {
      i++;
    }
  }
  if (!runs.length) return text;

  type Segment = { from: number; to: number; rows: string[] };
  const segments: Segment[] = [];

  for (const run of runs) {
    const { start, count: n } = run;
    if (start + 4 * n > rawLines.length) continue;

    const codeCol = rawLines.slice(start, start + n);
    const nameCol = rawLines.slice(start + n, start + 2 * n);
    const specCol = rawLines.slice(start + 2 * n, start + 3 * n);
    const unitCol = rawLines.slice(start + 3 * n, start + 4 * n);
    const qtyCol = rawLines.slice(start + 4 * n, start + 5 * n);

    if (!codeCol.every((l) => isZbwpOnlyLine(l))) continue;
    if (!nameCol.every((l) => l.trim() && !isZbwpOnlyLine(l) && !/^\d+(?:\.\d+)?$/.test(l.trim())))
      continue;
    if (!specCol.every((l) => l.trim())) continue;
    if (!unitCol.every((l) => l.trim())) continue;
    if (!qtyCol.every((l) => /^\d+(?:\.\d+)?$/.test(l.trim()))) continue;

    let catCol: string[] | null = null;
    let idxCol: string[] | null = null;
    let from = start;

    if (start >= n) {
      const maybeCat = rawLines.slice(start - n, start);
      if (maybeCat.every((l) => isLikelyCategoryCell(l))) {
        catCol = maybeCat.map((l) => l.trim());
        from = start - n;
      }
    }
    if (catCol && start >= 2 * n) {
      const maybeIdx = rawLines.slice(start - 2 * n, start - n);
      if (maybeIdx.every((l) => /^\d{1,4}$/.test(l.trim()))) {
        idxCol = maybeIdx.map((l) => l.trim());
        from = start - 2 * n;
      }
    }
    if (!catCol && start >= n) {
      const maybeIdx = rawLines.slice(start - n, start);
      if (maybeIdx.every((l) => /^\d{1,4}$/.test(l.trim()))) {
        idxCol = maybeIdx.map((l) => l.trim());
        catCol = Array(n).fill("物品");
        from = start - n;
      }
    }
    if (!idxCol) {
      idxCol = Array.from({ length: n }, (_, k) => String(k + 1));
    }
    if (!catCol) {
      catCol = Array(n).fill("物品");
    }

    const rows: string[] = [];
    for (let r = 0; r < n; r++) {
      const code =
        normalizeZbwpToken(codeCol[r].trim()) ??
        codeCol[r].trim().replace(/[\s-]+/g, "");
      rows.push(
        `${idxCol[r]} ${catCol[r]} ${code} ${nameCol[r].trim()} ${specCol[r].trim()} ${unitCol[r].trim()} ${qtyCol[r].trim()}`
      );
    }

    segments.push({ from, to: start + 5 * n, rows });
  }

  if (!segments.length) return text;

  segments.sort((a, b) => a.from - b.from);
  const out: string[] = [];
  let cursor = 0;
  for (const seg of segments) {
    while (cursor < seg.from) {
      const line = rawLines[cursor] ?? "";
      if (line && !isTableHeaderLine(line)) out.push(line);
      cursor++;
    }
    out.push(...seg.rows);
    cursor = seg.to;
  }
  while (cursor < rawLines.length) {
    const line = rawLines[cursor] ?? "";
    if (line && !isTableHeaderLine(line)) out.push(line);
    cursor++;
  }
  return out.join("\n");
}

/**
 * pdf-parse 常把表格抽成「每列一行」竖排，合并为单行
 */
export function reconstructVerticalTableRows(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (
      /^\d{1,4}$/.test(line) &&
      i + 6 < lines.length &&
      /^ZBWP[\s-]*\d+$/i.test(lines[i + 2])
    ) {
      out.push(lines.slice(i, i + 7).join(" "));
      i += 7;
      continue;
    }

    if (/^\d{1,4}$/.test(line)) {
      const window = lines.slice(i, Math.min(i + 12, lines.length));
      const zbwpIdx = window.findIndex((l) => /^ZBWP[\s-]*\d+$/i.test(l));
      if (zbwpIdx >= 1) {
        const qty7 = window[zbwpIdx + 4];
        if (
          zbwpIdx + 4 < window.length &&
          /^\d+(?:\.\d+)?$/.test(qty7) &&
          !/^\d+(?:\.\d+)?$/.test(window[zbwpIdx + 3] ?? "")
        ) {
          const idx = window[0];
          const cat = window[1] ?? "";
          const code = normalizeZbwpToken(window[zbwpIdx]) ?? window[zbwpIdx];
          const name = window[zbwpIdx + 1] ?? "";
          const spec = window[zbwpIdx + 2] ?? "";
          const unit = window[zbwpIdx + 3] ?? "";
          out.push(`${idx} ${cat} ${code} ${name} ${spec} ${unit} ${qty7}`);
          i += zbwpIdx + 5;
          continue;
        }
        const qty4 = window[zbwpIdx + 2];
        if (zbwpIdx + 2 < window.length && /^\d+(?:\.\d+)?$/.test(qty4)) {
          const idx = window[0];
          const cat = window[1] ?? "";
          const code = normalizeZbwpToken(window[zbwpIdx]) ?? window[zbwpIdx];
          const name = window[zbwpIdx + 1] ?? "";
          out.push(`${idx} ${cat} ${code} ${name} ${qty4}`);
          i += zbwpIdx + 3;
          continue;
        }
      }
    }

    out.push(line);
    i++;
  }

  return out.join("\n");
}

/** 合并规格列换行断行 */
export function normalizePdfTableLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }

    if (out.length > 0) {
      const prev = out[out.length - 1].trim();
      const prevParts = prev.split(/\s+/);
      const isPartialItem =
        /^\d+$/.test(prevParts[0] ?? "") &&
        prevParts.length >= 4 &&
        prevParts.length < 7 &&
        !FULL_ITEM_ROW.test(prev) &&
        !ZBWP_ITEM_ROW.test(prev);

      const isContinuation =
        isPartialItem &&
        !/^(\d+)\s+\S+\s+(ZBWP)?\d/i.test(line) &&
        !/^合计/.test(line) &&
        !/^(单据|收货|制单|创建|发货|打印|第\d+页)/.test(line);

      if (isContinuation) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

/** 统一 PDF 预处理流水线 */
export function preparePdfTextForParsing(text: string): string {
  let t = normalizePdfExtractedText(text);
  t = normalizeZbwpCodes(t);
  t = reconstructColumnMajorPdfTable(t);
  t = expandCompactPdfTable(t);
  t = normalizeZbwpCodes(t);
  t = splitInlinePdfItemRows(t);
  t = reconstructVerticalTableRows(t);
  t = normalizePdfTableLines(t);
  return t;
}

function stripFooterFromLine(line: string): string {
  return line
    .split(
      /\s+(?:收货人|收货电话|收货地址|制单日期|创建人|发货人|打印次数|合计|总计|小计)(?:[:：]|\s|$)/
    )[0]
    .trim();
}

/** 去掉行内页脚字段，避免物品行正则误匹配电话等尾部数字 */
export function stripPdfItemLineFooter(line: string): string {
  return stripFooterFromLine(line);
}

function stripBeforeNextItem(tokens: string[]): string[] {
  for (let i = 1; i < tokens.length - 2; i++) {
    if (/^\d{1,4}$/.test(tokens[i]) && /^ZBWP[\s-]*\d+$/i.test(tokens[i + 2] ?? "")) {
      return tokens.slice(0, i);
    }
  }
  const nextCode = tokens.findIndex(
    (tok, i) => i > 0 && (normalizeZbwpToken(tok) || /^ZBWP[\s-]*\d+$/i.test(tok))
  );
  return nextCode > 0 ? tokens.slice(0, nextCode) : tokens;
}

function stripFooterTokens(tokens: string[]): string[] {
  const idx = tokens.findIndex(
    (tok) =>
      /^(收货人|收货电话|收货地址|制单日期|创建人|发货人|打印次数|合计|总计|小计|单据编号|单号)$/.test(tok) ||
      /^收货/.test(tok)
  );
  return idx >= 0 ? tokens.slice(0, idx) : tokens;
}

function parseFlexibleTail(
  tail: string[]
): { name: string; spec: string; qty: string } | null {
  if (tail.length < 2) return null;
  const qty = tail[tail.length - 1];
  if (!/^\d+(?:\.\d+)?$/.test(qty)) return null;

  if (tail.length === 2) {
    return { name: tail[0], spec: "", qty };
  }
  if (tail.length === 3) {
    return { name: tail[0], spec: tail[1], qty };
  }

  const spec = tail[tail.length - 3];
  const name = tail.slice(0, -3).join(" ").trim() || tail[0];
  return { name, spec, qty };
}

function parseZbwpTokenWindow(
  tokens: string[],
  codeIdx: number
): Partial<Record<OrderField, string>> | null {
  const rawCode = tokens[codeIdx];
  const code = normalizeZbwpToken(rawCode) ?? (/^ZBWP[\s-]*\d+$/i.test(rawCode) ? rawCode.replace(/[\s-]+/g, "") : null);
  if (!code) return null;
  const tail = stripBeforeNextItem(
    stripFooterTokens(tokens.slice(codeIdx + 1))
  );
  const parsed = parseFlexibleTail(tail);
  if (!parsed) return null;

  return {
    skuCode: code,
    skuName: parsed.name,
    skuSpec: parsed.spec,
    skuQuantity: parsed.qty,
  };
}

/** 全局扫描 ZBWP 物品行（单行多物品、名称含空格等） */
export function scanPdfDeliveryItems(
  text: string,
  alreadyPrepared = false
): Partial<Record<OrderField, string>>[] {
  const prepared = alreadyPrepared ? text : preparePdfTextForParsing(text);
  const items: Partial<Record<OrderField, string>>[] = [];
  const seen = new Set<string>();

  const pushItem = (item: Partial<Record<OrderField, string>> | null) => {
    if (!item?.skuCode?.trim() || !item.skuQuantity?.trim()) return;
    const key = `${item.skuCode}|${item.skuQuantity}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const line of prepared.split("\n")) {
    pushItem(tryParsePdfDeliveryItemLine(line));
  }
  if (items.length) return items;

  const flat = prepared.replace(/\s+/g, " ");
  const rowRe = /\d{1,4}\s+\S+\s+ZBWP[\s-]*\d+/gi;
  let match: RegExpExecArray | null;
  const starts: number[] = [];
  while ((match = rowRe.exec(flat)) !== null) {
    starts.push(match.index);
  }
  for (let i = 0; i < starts.length; i++) {
    let chunk = flat.slice(starts[i], starts[i + 1] ?? flat.length).trim();
    chunk = stripFooterFromLine(chunk);
    pushItem(tryParsePdfDeliveryItemLine(chunk));
  }
  if (items.length) return items;

  const tokens = flat.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (!normalizeZbwpToken(tokens[i]) && !/^ZBWP[\s-]*\d+$/i.test(tokens[i])) continue;
    pushItem(parseZbwpTokenWindow(tokens, i));
  }

  if (!items.length) {
    const re = /(?:^|\s)((?:\d{1,4}\s+\S+\s+)?(?:\S+\s+)?)(ZBWP[\s-]*\d+)\s*(.*?)(?=\s+\d{1,4}\s+\S+\s+ZBWP[\s-]*\d+|\s+收货人|\s+合计|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null) {
      const chunk = `${m[1] ?? ""}${m[2]} ${m[3] ?? ""}`.trim();
      pushItem(tryParsePdfDeliveryItemLine(stripFooterFromLine(chunk)));
    }
  }

  return items;
}

/** 宽松解析含 ZBWP 的单行（正则未命中时的兜底） */
export function tryParsePdfDeliveryItemLine(
  line: string
): Partial<Record<OrderField, string>> | null {
  const t = stripFooterFromLine(line.trim());
  if (!/ZBWP[\s-]*\d/i.test(t)) return null;

  const strict = t.match(
    /^(\d+)\s+(\S+)\s+(ZBWP\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)(?:\s+\S*)?\s*$/i
  );
  if (strict) {
    return {
      skuCode: strict[3],
      skuName: strict[4],
      skuSpec: strict[5],
      skuQuantity: strict[7],
    };
  }

  const noIndex = t.match(
    /^(ZBWP\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*$/i
  );
  if (noIndex) {
    return {
      skuCode: noIndex[1],
      skuName: noIndex[2],
      skuSpec: noIndex[3],
      skuQuantity: noIndex[5],
    };
  }

  const embedded = t.match(
    /(\d+)\s+(\S+)\s+(ZBWP\d+)\s+(.+?)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*$/i
  );
  if (embedded) {
    const mid = embedded[4].trim().split(/\s+/);
    if (mid.length >= 1) {
      const unit = mid[mid.length - 1];
      const spec = mid.length >= 2 ? mid[mid.length - 2] : unit;
      const name =
        mid.length >= 3 ? mid.slice(0, -2).join(" ") : mid.slice(0, -1).join(" ") || mid[0];
      return {
        skuCode: embedded[3],
        skuName: name,
        skuSpec: spec,
        skuQuantity: embedded[6],
      };
    }
  }

  const tokens = t.split(/\s+/).filter(Boolean);
  const codeIdx = tokens.findIndex(
    (tok) => normalizeZbwpToken(tok) || /^ZBWP[\s-]*\d+$/i.test(tok)
  );
  if (codeIdx >= 0) {
    return parseZbwpTokenWindow(tokens, codeIdx);
  }

  return null;
}

export function detectPdfDeliveryTable(text: string): {
  hasTable: boolean;
  zbwpRows: number;
  sevenColRows: number;
  sampleLine?: string;
} {
  const scanned = scanPdfDeliveryItems(text);
  const normalized = preparePdfTextForParsing(text);
  let sevenColRows = 0;
  let sampleLine: string | undefined;

  for (const line of normalized.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (FULL_ITEM_ROW.test(t) && !/ZBWP/i.test(t)) {
      sevenColRows++;
      if (!sampleLine) sampleLine = t;
    }
  }

  if (scanned.length && !sampleLine) {
    sampleLine = `${scanned[0].skuCode} ${scanned[0].skuName} ${scanned[0].skuQuantity}`;
  }

  return {
    hasTable: scanned.length > 0 || sevenColRows > 0,
    zbwpRows: scanned.length,
    sevenColRows,
    sampleLine,
  };
}

const PDF_LINE_PATTERNS: LinePattern[] = [
  { field: "externalCode", pattern: "单据编号[:\\s]*(\\S+)" },
  { field: "externalCode", pattern: "单号[:\\s]*(\\S+)" },
  { field: "storeName", pattern: "收货机构[:\\s]*(.+)" },
  { field: "recipientName", pattern: "收货人[:\\s]*(\\S+)" },
  {
    field: "recipientPhone",
    pattern: "收货(?:电话)?[:\\s]*(\\d[\\d\\-+]+)",
  },
  { field: "recipientPhone", pattern: "电话[:\\s]*(\\d[\\d\\-+]+)" },
  { field: "recipientAddress", pattern: "收货地址[:\\s]*(.+)" },
  { field: "recipientAddress", pattern: "地址[:\\s]*(.+)" },
  {
    isItemLine: true,
    pattern:
      "^(\\d+)\\s+(\\S+)\\s+(ZBWP\\d+)\\s+(.+?)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s*$",
    itemFields: {
      skuCode: 3,
      skuName: 4,
      skuQuantity: 6,
    },
  },
  {
    isItemLine: true,
    pattern:
      "^(\\d+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)(?:\\s+\\S*)?\\s*$",
    itemFields: {
      skuCode: 3,
      skuName: 4,
      skuSpec: 5,
      skuQuantity: 7,
    },
  },
  {
    isItemLine: true,
    pattern:
      "^(ZBWP\\d+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s*$",
    itemFields: {
      skuCode: 1,
      skuName: 2,
      skuSpec: 3,
      skuQuantity: 5,
    },
  },
];

/** 黔寨寨类 PDF 配送单 */
export function buildPdfDeliveryRuleConfig(): ParseRuleConfig {
  return {
    fileTypes: ["pdf"],
    description:
      "PDF 配送单 7 列表格（序号/类别/物品编码/物品名称/规格/单位/发货数量）+ 页脚收货信息",
    steps: [
      {
        type: "textBlockSplit",
        /** 整份 PDF 同一 block，页脚收货信息可合并到所有物品行 */
        blockSeparator: "<<<PDF_BLOCK>>>",
        linePatterns: PDF_LINE_PATTERNS,
      },
      {
        type: "filterRows",
        skipPatterns: ["合计", "总计", "小计", "物品类别", "物品编码", "规格型号"],
        skipEmptySku: true,
      },
      { type: "setDefaults", defaults: { tempLayer: "常温", weight: "1" } },
    ],
  };
}

export function buildPdfRuleFromText(text: string): {
  config: ParseRuleConfig;
  analysis: string;
  confidence: "high" | "medium" | "low";
  guessedMappings: string[];
} {
  const detected = detectPdfDeliveryTable(text);
  const config = buildPdfDeliveryRuleConfig();

  if (detected.hasTable) {
    return {
      config,
      analysis:
        `检测到 PDF 配送单表格（ZBWP 行 ${detected.zbwpRows}，7 列行 ${detected.sevenColRows}）。` +
        `skuCode=物品编码，skuName=物品名称，skuQuantity=发货数量。` +
        (detected.sampleLine ? ` 样例：${detected.sampleLine.slice(0, 80)}` : ""),
      confidence: detected.zbwpRows >= 3 ? "high" : "medium",
      guessedMappings: ["pdf-parse 竖排/换行已自动合并", "页脚收货信息格式"],
    };
  }

  return {
    config,
    analysis:
      "已应用黔寨寨类 PDF 默认规则（含竖排表格合并）。请试解析并在「PDF 提取原文」中核对。",
    confidence: /ZBWP[\s-]*\d/i.test(text) ? "medium" : "low",
    guessedMappings: ["pdf-parse 文本格式", "表格行列对齐", "收货信息字段"],
  };
}

export function sanitizePdfRuleConfig(
  config: ParseRuleConfig,
  _text?: string
): ParseRuleConfig {
  const base = buildPdfDeliveryRuleConfig();
  return {
    ...base,
    description: config.description || base.description,
  };
}
