/**
 * 考点4性能基准：1000 条规则引擎解析耗时（不含 UI）
 * 运行: npm run test:perf
 */
import { executeRuleEngine } from "../src/lib/engine/rule-engine";
import { PRESET_RULES } from "../src/lib/presets/rules";

const ROW_COUNT = 1000;

function buildPreviewData() {
  const rows: string[][] = [
    ["junk1", "", "", "", "", ""],
    ["junk2", "", "", "", "", ""],
    ["junk3", "", "", "", "", ""],
    ["外部编码", "SKU编码", "SKU名称", "数量", "规格", "备注"],
  ];
  for (let i = 1; i <= ROW_COUNT; i++) {
    rows.push([
      `OUT-${i}`,
      `SKU-${i}`,
      `商品${i}`,
      String((i % 30) + 1),
      "箱",
      "",
    ]);
  }
  rows.push(["合计", "", "", "", "", ""]);
  rows.push([
    "收货人：张三",
    "电话：13800138000",
    "地址：测试地址",
    "",
    "",
    "",
  ]);
  return { sheets: [{ name: "Sheet1", rows }] };
}

const preset = PRESET_RULES.find((p) => p.name === "标准表格+尾部收货信息");
if (!preset) {
  console.error("未找到标准表格预设规则");
  process.exit(1);
}

const data = buildPreviewData();
const t0 = performance.now();
const result = executeRuleEngine(data, preset.config);
const parseMs = performance.now() - t0;

console.log("\n=== 考点4 性能基准（Node 环境 · 规则引擎）===\n");
console.log(`输入行数: ${ROW_COUNT}`);
console.log(`解析输出: ${result.length} 条`);
console.log(`规则执行: ${parseMs.toFixed(0)}ms`);
console.log(`\n说明：浏览器端另有 Worker 解析 Excel + 虚拟列表渲染，`);
console.log(`完整流程请在 /import 上传 public/benchmark/standard-1000.xlsx 查看性能面板。\n`);

if (result.length < ROW_COUNT) {
  console.warn(`警告: 输出 ${result.length} 条，少于 ${ROW_COUNT} 条`);
  process.exit(1);
}

if (parseMs > 3000) {
  console.warn(`警告: 规则执行 ${parseMs.toFixed(0)}ms > 3s（Node 单线程）`);
}

process.exit(0);
