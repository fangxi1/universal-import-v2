/**
 * 生成考点4标准测试文件：1000 条 Excel
 * 运行: npm run benchmark:excel
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

const OUT_DIR = path.join(process.cwd(), "public", "benchmark");
const ROW_COUNT = 1000;

function buildRows() {
  const rows: string[][] = [
    ["junk1", "", "", "", "", "", ""],
    ["junk2", "", "", "", "", "", ""],
    ["junk3", "", "", "", "", "", ""],
    [
      "外部编码",
      "SKU编码",
      "SKU名称",
      "数量",
      "规格",
      "备注",
      "门店",
    ],
  ];

  for (let i = 1; i <= ROW_COUNT; i++) {
    rows.push([
      `OUT-${String(i).padStart(5, "0")}`,
      `SKU-${i}`,
      `测试商品${i}`,
      String((i % 50) + 1),
      "标准",
      "",
      `门店${(i % 20) + 1}`,
    ]);
  }

  rows.push(["合计", "", "", "", "", "", ""]);
  rows.push([
    "收货人：性能测试",
    "电话：13800138000",
    "地址：北京市海淀区",
    "",
    "",
    "",
    "",
  ]);

  return rows;
}

const rows = buildRows();
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "出库单");

fs.mkdirSync(OUT_DIR, { recursive: true });
const xlsxPath = path.join(OUT_DIR, "standard-1000.xlsx");
XLSX.writeFile(wb, xlsxPath);

console.log(`已生成 ${xlsxPath}（${ROW_COUNT} 条数据行）`);
console.log("导入：上传该文件 → 选「标准表格+尾部收货信息」→ 执行解析");
