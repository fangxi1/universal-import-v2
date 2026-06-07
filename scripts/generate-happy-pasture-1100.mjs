/**
 * 按欢乐牧场模板0430.xlsx 结构生成 1100 条合规运单数据。
 * 每行 SKU 仅在 1 个门店列填正整数数量 → 解析后 1100 条运单，均通过系统校验。
 */
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { isLikelyStoreMatrixHeader } from "../src/lib/engine/store-matrix-rule.ts";

const templatePath =
  "C:/Users/方希/Desktop/AI考试附件/demos/欢乐牧场模板0430.xlsx";
const outputName = "欢乐牧场模板0430_1100条.xlsx";
const TARGET_ORDERS = 1100;

const WAREHOUSE = "武汉汉阳仓";
const OWNER = "欢乐牧场";

const SKU_SAMPLES = [
  "26/30海老盒装熟虾4KG",
  "100g欢乐牧场牛油火锅底料（2023新）",
  "穆林农场肥牛25kg",
  "冷冻带头带壳生南美白虾 50-60（9kg）",
  "4490牛胸-抄码",
  "牧原冻猪一极带皮五花",
  "绿祥农场肥牛2kg",
  "安格斯牛上脑切片500g",
  "草原羔羊卷450g",
  "手打虾滑300g",
];

function pad(n, len) {
  return String(n).padStart(len, "0");
}

function colIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? "").trim();
    if (patterns.some((p) => (typeof p === "string" ? h === p : p.test(h)))) {
      return i;
    }
  }
  return -1;
}

function detectStoreColumns(headers) {
  return headers
    .map((h, i) => ({ h: String(h ?? "").trim(), i }))
    .filter(({ h }) => isLikelyStoreMatrixHeader(h))
    .map(({ i }) => i);
}

function buildDataRow(headers, storeColIndexes, skuIndex) {
  const skuNo = skuIndex + 1;
  const storeCol = storeColIndexes[skuIndex % storeColIndexes.length];
  const qty = (skuIndex % 9) + 1;
  const inStock = 300 + (skuIndex % 150);
  const available = inStock - qty;

  const skuName = `${SKU_SAMPLES[skuIndex % SKU_SAMPLES.length]}-${pad(skuNo, 4)}`;
  const skuCode = `HLMC-${pad(skuNo, 5)}`;

  const row = headers.map(() => "");

  const setByHeader = (patterns, value) => {
    const idx = colIndex(headers, patterns);
    if (idx >= 0) row[idx] = value;
  };

  setByHeader(["仓库名称"], WAREHOUSE);
  setByHeader(["货主名称"], OWNER);
  setByHeader([/^SKU名称$/], skuName);
  setByHeader([/^SKU条码$/], skuCode);
  setByHeader([/外部商品编码/], skuCode);
  setByHeader([/库存状态/], "正常");
  setByHeader([/库存单位/], "正品");
  setByHeader([/^规格$/], skuIndex % 3 === 0 ? "箱" : "");
  setByHeader([/在库/], String(inStock));
  setByHeader([/可用/], String(available));
  setByHeader([/待移/], "0");
  setByHeader([/分配/], "0");
  setByHeader([/冻结/], "0");

  for (const idx of storeColIndexes) {
    row[idx] = idx === storeCol ? String(qty) : "0";
  }

  const balanceIdx = colIndex(headers, [/结余|合计|总计|下单后/]);
  if (balanceIdx >= 0) row[balanceIdx] = String(available);

  return row;
}

async function main() {
  if (!existsSync(templatePath)) {
    throw new Error(`模板不存在: ${templatePath}`);
  }

  const wb = XLSX.read(readFileSync(templatePath));
  const sheetName = wb.SheetNames[0];
  const templateRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  const headerRow = [...(templateRows[0] ?? [])];
  if (!headerRow.some((h) => /SKU名称/.test(String(h)))) {
    throw new Error("模板第1行未找到 SKU 表头");
  }

  const storeColIndexes = detectStoreColumns(headerRow);
  if (storeColIndexes.length < 2) {
    throw new Error(`未识别到足够门店列，仅 ${storeColIndexes.length} 列`);
  }

  const dataRows = Array.from({ length: TARGET_ORDERS }, (_, i) =>
    buildDataRow(headerRow, storeColIndexes, i)
  );
  const outRows = [headerRow, ...dataRows];

  const preview = { sheets: [{ name: sheetName, rows: outRows }] };
  const { executeRuleEngine } = await import("../src/lib/engine/rule-engine.ts");
  const { sanitizeStoreMatrixRuleConfig, buildStoreMatrixRuleConfig } =
    await import("../src/lib/engine/store-matrix-rule.ts");
  const { validateAllRows } = await import(
    "../src/lib/validation/order-validator.ts"
  );

  const config = sanitizeStoreMatrixRuleConfig(
    buildStoreMatrixRuleConfig(),
    preview
  );
  const parsed = executeRuleEngine(preview, config);
  const errors = validateAllRows(parsed);

  if (parsed.length !== TARGET_ORDERS) {
    throw new Error(`解析 ${parsed.length} 条，期望 ${TARGET_ORDERS} 条`);
  }
  if (errors.length > 0) {
    console.error("校验错误示例:", errors.slice(0, 8));
    throw new Error(`校验失败 ${errors.length} 条`);
  }

  const outWb = XLSX.utils.book_new();
  const outWs = XLSX.utils.aoa_to_sheet(outRows);
  XLSX.utils.book_append_sheet(outWb, outWs, sheetName);

  const outPath = join(dirname(templatePath), outputName);
  writeFileSync(outPath, XLSX.write(outWb, { type: "buffer", bookType: "xlsx" }));

  const storeNames = storeColIndexes.map((i) => headerRow[i]);
  console.log("生成成功:", outPath);
  console.log("SKU 数据行:", TARGET_ORDERS);
  console.log("解析运单:", parsed.length);
  console.log("门店列:", storeNames.join("、"));
  console.log("系统校验: 全部通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
