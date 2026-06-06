#!/usr/bin/env npx tsx
import { verifyAllPresets } from "../src/lib/presets/verify-presets";

const { passed, failed, results } = verifyAllPresets();

console.log("\n=== 万能导入 V2 · 9 份出库单规则兼容性自测 ===\n");

for (const r of results) {
  const mark = r.ok ? "✓" : "✗";
  console.log(`${mark} ${r.examLabel}`);
  console.log(`   规则：${r.presetName}`);
  console.log(`   结果：${r.message}\n`);
}

console.log(`合计：${passed}/9 通过，${failed} 失败\n`);

process.exit(failed > 0 ? 1 : 0);
