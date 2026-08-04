/**
 * 压测：上传 10,000 行 Excel → 轮询至完成
 * 用法:
 *   BASE_URL=http://localhost:3000 RULE_ID=<uuid> npx tsx scripts/load-test-import.ts
 */
import * as fs from "fs";
import * as path from "path";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const RULE_ID = process.env.RULE_ID || "";
const FILE =
  process.env.LOAD_FILE ||
  path.join(process.cwd(), "test-data", "10000-orders.xlsx");

async function main() {
  if (!RULE_ID) throw new Error("请设置 RULE_ID（解析规则 UUID）");
  if (!fs.existsSync(FILE)) {
    throw new Error(`压测文件不存在: ${FILE}，请先 npm run seed:perf -- --excel-only`);
  }

  const form = new FormData();
  const buf = fs.readFileSync(FILE);
  form.append(
    "file",
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    path.basename(FILE)
  );
  form.append("ruleId", RULE_ID);

  const t0 = Date.now();
  const uploadRes = await fetch(`${BASE}/api/import-tasks`, {
    method: "POST",
    body: form,
  });
  const uploadJson = await uploadRes.json();
  const uploadMs = Date.now() - t0;
  if (!uploadRes.ok) {
    throw new Error(`上传失败: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  }

  console.log("上传响应:", uploadJson);
  console.log(`上传耗时: ${uploadMs}ms (目标 P95 ≤ 1000ms)`);

  const taskId = uploadJson.task_id as string;
  const started = Date.now();
  let last = "";
  while (true) {
    const res = await fetch(`${BASE}/api/import-tasks/${taskId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    const line = `${json.status} processed=${json.processed_rows}/${json.total_rows} ok=${json.success_rows} fail=${json.failed_rows}`;
    if (line !== last) {
      console.log(line);
      last = line;
    }
    const st = String(json.status || "").toUpperCase();
    if (["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(st)) {
      const totalMs = Date.now() - started;
      const totalSec = totalMs / 1000;
      console.log("---- 结果 ----");
      console.log(`总耗时: ${totalSec.toFixed(2)}s (目标 ≤ 60s) => ${totalSec <= 60 ? "PASS" : "FAIL"}`);
      console.log(`上传: ${uploadMs}ms => ${uploadMs <= 1000 ? "PASS" : "WARN"}`);
      console.log(`成功/失败: ${json.success_rows}/${json.failed_rows}`);
      console.log(`降级: ${json.degraded}`);
      if (uploadRes.status >= 500) console.log("出现 5xx");
      process.exit(totalSec <= 60 && uploadMs <= 2000 ? 0 : 1);
    }
    if (Date.now() - started > 5 * 60 * 1000) {
      throw new Error("轮询超时 5 分钟");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
