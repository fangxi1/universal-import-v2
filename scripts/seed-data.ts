/**
 * 压测数据准备：20,000 SKU 主数据 + 10,000 行 Excel
 * 运行: npm run seed:perf
 * 清理: npm run seed:perf -- --clean
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";

const SKU_COUNT = 20_000;
const ORDER_ROWS = 10_000;
const INVALID_SKU_COUNT = 50;

function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function skuCode(i: number) {
  return `SKU_${String(i).padStart(5, "0")}`;
}

function getSql() {
  loadEnvFile();
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("缺少 POSTGRES_URL / DATABASE_URL");
  return neon(url);
}

// neon 泛型在脚本侧易冲突，这里用宽松类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlClient = any;

async function ensureSkuTable(sql: SqlClient) {
  await sql`
    CREATE TABLE IF NOT EXISTS sku_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      spec TEXT,
      unit TEXT DEFAULT '件',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function clean(sql: SqlClient) {
  await ensureSkuTable(sql);
  await sql`DELETE FROM sku_master WHERE sku_code LIKE 'SKU_%'`;
  console.log("已清理压测 SKU 主数据");
}

async function seedSkus(sql: SqlClient) {
  await ensureSkuTable(sql);
  await sql`DELETE FROM sku_master WHERE sku_code LIKE 'SKU_%'`;

  const chunk = 200;
  for (let start = 1; start <= SKU_COUNT; start += chunk) {
    const end = Math.min(SKU_COUNT, start + chunk - 1);
    const stmts = [];
    for (let i = start; i <= end; i++) {
      const code = skuCode(i);
      const name = `压测商品${i}`;
      const spec = `规格${(i % 20) + 1}`;
      const unit = i % 2 === 0 ? "件" : "箱";
      stmts.push(
        sql`
          INSERT INTO sku_master (sku_code, name, spec, unit)
          VALUES (${code}, ${name}, ${spec}, ${unit})
          ON CONFLICT (sku_code) DO UPDATE SET name = EXCLUDED.name, spec = EXCLUDED.spec
        `
      );
    }
    await sql.transaction(stmts);
    if (start === 1 || end % 2000 === 0 || end === SKU_COUNT) {
      console.log(`SKU 进度 ${end}/${SKU_COUNT}`);
    }
  }
  console.log(`已写入 ${SKU_COUNT} 条 SKU 主数据`);
}

function buildExcel() {
  const rows: string[][] = [
    ["异步导入压测出库单"],
    ["生成脚本 scripts/seed-data.ts"],
    [
      "外部编码",
      "SKU编码",
      "SKU名称",
      "规格",
      "发货数量",
      "重量",
      "温层",
    ],
  ];

  for (let i = 1; i <= ORDER_ROWS; i++) {
    const useInvalid = i <= INVALID_SKU_COUNT;
    const skuIdx = useInvalid ? 90000 + i : ((i * 17) % SKU_COUNT) + 1;
    const code = useInvalid
      ? `INVALID_${String(i).padStart(5, "0")}`
      : skuCode(skuIdx);
    rows.push([
      `OUT-${String(i).padStart(5, "0")}`,
      code,
      useInvalid ? `非法商品${i}` : `压测商品${skuIdx}`,
      `规格${(i % 20) + 1}`,
      String((i % 10) + 1),
      String(((i % 50) + 1) / 10),
      ["常温", "冷藏", "冷冻", "恒温"][i % 4],
    ]);
  }

  rows.push(["合计", "", "", "", "", "", ""]);
  rows.push([
    "收货人：压测收货人",
    "收货电话：13800138000",
    "收货地址：上海市浦东新区压测路1号",
    "",
    "",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "出库单");

  const outDir = path.join(process.cwd(), "test-data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "10000-orders.xlsx");
  XLSX.writeFile(wb, outPath);
  console.log(
    `已生成 ${outPath}（${ORDER_ROWS} 行，含 ${INVALID_SKU_COUNT} 个非法 SKU）`
  );
  return outPath;
}

async function main() {
  const doClean = process.argv.includes("--clean");
  const excelOnly = process.argv.includes("--excel-only");
  if (excelOnly) {
    buildExcel();
    console.log("完成（仅生成 Excel）");
    return;
  }
  const sql = getSql();
  if (doClean) {
    await clean(sql);
    return;
  }
  await seedSkus(sql);
  buildExcel();
  console.log("完成。清理: npm run seed:perf -- --clean");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
