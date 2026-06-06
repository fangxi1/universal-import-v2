/**
 * 解析 demos/ 目录下的真实考核文件（若存在）
 * 运行: npm run test:demos
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { PRESET_RULES } from "../src/lib/presets/rules";
import { executeRuleEngine } from "../src/lib/engine/rule-engine";
import type { FilePreviewData } from "../src/types";

const DEMOS_DIR = path.join(process.cwd(), "demos");

/** 文件名关键词 → 预设规则名（仅用于本地测试脚本，不在引擎代码中使用） */
const FILE_RULE_HINTS: Array<{ pattern: RegExp; ruleName: string; examName: string }> = [
  { pattern: /黎明屯/i, ruleName: "标准表格+尾部收货信息", examName: "黎明屯配送发货单" },
  { pattern: /湖南仓/i, ruleName: "按单号跨行聚合", examName: "湖南仓发货明细" },
  { pattern: /欢乐牧场/i, ruleName: "SKU×门店矩阵转置", examName: "欢乐牧场模板" },
  { pattern: /黔寨寨/i, ruleName: "PDF配送单", examName: "黔寨寨配送单" },
  { pattern: /多门店|分Sheet/i, ruleName: "多Sheet门店出库", examName: "多门店分Sheet出库单" },
  { pattern: /调拨|卡片/i, ruleName: "卡片式调拨单", examName: "门店调拨单(卡片式)" },
];

function readExcel(filePath: string): FilePreviewData {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheets = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const rows = raw.map((r) =>
      (Array.isArray(r) ? r : []).map((c) => (c == null ? "" : String(c)))
    );
    return { name, rows };
  });
  return { sheets };
}

function findDemoFiles(): string[] {
  if (!fs.existsSync(DEMOS_DIR)) return [];
  return fs
    .readdirSync(DEMOS_DIR)
    .filter((f) => /\.(xlsx|xls|docx|pdf)$/i.test(f))
    .map((f) => path.join(DEMOS_DIR, f));
}

const files = findDemoFiles();

console.log("\n=== Demo 文件规则解析验证 ===\n");

if (files.length === 0) {
  console.log("demos/ 目录下暂无 Excel/Word/PDF 文件。");
  console.log("请将考核出库单放入 demos/ 后重新运行 npm run test:demos");
  console.log("参见 demos/README.md\n");
  process.exit(0);
}

let passed = 0;
let failed = 0;

for (const filePath of files) {
  const base = path.basename(filePath);
  const hint = FILE_RULE_HINTS.find((h) => h.pattern.test(base));
  if (!hint) {
    console.log(`? ${base} — 未配置规则映射，跳过`);
    continue;
  }

  const preset = PRESET_RULES.find((p) => p.name === hint.ruleName);
  if (!preset) {
    console.log(`✗ ${base} — 未找到预设「${hint.ruleName}」`);
    failed++;
    continue;
  }

  if (/\.pdf$/i.test(base)) {
    console.log(`○ ${base} — PDF 需浏览器上传 + /api/extract-pdf，CLI 跳过`);
    continue;
  }

  if (/\.docx$/i.test(base)) {
    console.log(`○ ${base} — Word 需浏览器上传，CLI 跳过`);
    continue;
  }

  try {
    const data = readExcel(filePath);
    const t0 = performance.now();
    const rows = executeRuleEngine(data, preset.config);
    const ms = performance.now() - t0;
    if (rows.length > 0) {
      console.log(`✓ ${hint.examName} (${base})`);
      console.log(`   规则：${hint.ruleName} · 解析 ${rows.length} 条 · ${ms.toFixed(0)}ms\n`);
      passed++;
    } else {
      console.log(`✗ ${hint.examName} (${base}) — 解析结果为空，请微调 mapFields\n`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${base} — ${e instanceof Error ? e.message : "解析失败"}\n`);
    failed++;
  }
}

console.log(`合计：${passed} 通过，${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
