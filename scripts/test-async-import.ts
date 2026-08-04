/**
 * 异步导入关键链路自动化测试
 * 运行: npm run test:async-import
 *
 * 需要可用的 POSTGRES_URL；可选 BASE_URL 做 HTTP 级测试。
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import { maskPhone, maskAddress, maskRawValue } from "../src/lib/async/mask";
import { validateParsedBatch } from "../src/lib/async/batch-validate";
import { buildEnvelope, EVENT_TYPES } from "../src/lib/async/events";
import { newEventId, newTaskId, newTraceId } from "../src/lib/async/ids";
import type { OrderRow } from "../src/types";

function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    console.log(`✓ ${name}`);
    passed += 1;
  } else {
    console.error(`✗ ${name}`);
    failed += 1;
  }
}

function sampleRow(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "r1",
    externalCode: "OUT-1",
    storeName: "门店A",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    skuCode: "SKU_00001",
    skuName: "商品1",
    skuQuantity: "2",
    weight: "1",
    tempLayer: "常温",
    skuSpec: "",
    remark: "",
    ...over,
  };
}

async function main() {
  loadEnvFile();

  // 脱敏
  assert(maskPhone("13800138000") === "138****8000", "手机号脱敏");
  assert(maskAddress("上海市浦东新区压测路1号").includes("***"), "地址脱敏");
  assert(maskRawValue("recipientPhone", "13800138000").includes("****"), "字段脱敏");

  // 事件信封
  const env = buildEnvelope({
    eventId: newEventId(),
    eventType: EVENT_TYPES.ImportBatchCreated,
    aggregateId: newTaskId(),
    traceId: newTraceId(),
    payload: { task_id: "t", unit_id: "unit_001", start_row: 1, end_row: 10 },
  });
  assert(env.schema_version === 1, "事件 schema_version");
  assert(typeof env.occurred_at === "string", "事件 occurred_at");

  // 本地格式校验
  const local = await validateParsedBatch(
    [
      { lineNo: 1, row: sampleRow({ skuQuantity: "-1" }) },
      { lineNo: 2, row: sampleRow({ recipientPhone: "123", storeName: "", recipientName: "a", recipientAddress: "b" }) },
      { lineNo: 3, row: sampleRow({ skuCode: "" }) },
    ],
    { checkExternalDupInBatch: false }
  );
  // SKU lookup may degrade if no DB; still expect format errors
  assert(
    local.errors.some((e) => e.errorCode === "E004"),
    "数量非法 → E004"
  );
  assert(
    local.errors.some((e) => e.errorCode === "E003") ||
      local.errors.some((e) => e.errorCode === "E002"),
    "电话/必填错误可定位"
  );

  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    console.log("跳过 DB 集成测试（未配置数据库）");
  } else {
    const sql = neon(url);
    const { ensureTables } = await import("../src/lib/db");
    await ensureTables();

    // Outbox 同事务：写入后可读
    const taskId = newTaskId();
    const traceId = newTraceId();
    const eventId = newEventId();
    const envelope = buildEnvelope({
      eventId,
      eventType: EVENT_TYPES.ImportTaskCreated,
      aggregateId: taskId,
      traceId,
      payload: { task_id: taskId },
    });

    await sql.transaction([
      sql`
        INSERT INTO import_tasks (
          id, file_name, status, total_rows, total_batches, trace_id
        ) VALUES (${taskId}, 'unit-test.xlsx', 'pending', 10, 1, ${traceId})
      `,
      sql`
        INSERT INTO event_outbox (
          id, aggregate_id, event_type, schema_version, payload, trace_id, status
        ) VALUES (
          ${eventId}, ${taskId}, ${EVENT_TYPES.ImportTaskCreated}, 1,
          ${JSON.stringify(envelope)}::jsonb, ${traceId}, 'pending'
        )
      `,
      sql`
        INSERT INTO trace_events (trace_id, task_id, event_name, event_status, message)
        VALUES (${traceId}, ${taskId}, ${EVENT_TYPES.ImportTaskCreated}, 'ok', 'unit test')
      `,
    ]);

    const outbox = (await sql`
      SELECT status FROM event_outbox WHERE id = ${eventId}
    `) as Array<{ status: string }>;
    assert(outbox[0]?.status === "pending", "任务与 Outbox 同事务写入");

    const traces = (await sql`
      SELECT COUNT(*)::int AS cnt FROM trace_events WHERE trace_id = ${traceId}
    `) as Array<{ cnt: number }>;
    assert((traces[0]?.cnt ?? 0) >= 1, "Trace 时间线生成");

    // 非法 task_id 保护（HTTP，若 BASE_URL 可用）
    const base = process.env.BASE_URL;
    if (base) {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/import-tasks/not-a-task`);
      assert(res.status === 400 || res.status === 404, "非法 task_id 查询保护");
    } else {
      console.log("跳过 HTTP 非法 task 测试（未设置 BASE_URL）");
    }

    // 生成极小 Excel 验证上传时延（需服务与规则）
    const ruleId = process.env.RULE_ID;
    if (base && ruleId) {
      const rows = [
        ["压测"],
        ["", ""],
        ["外部编码", "SKU编码", "SKU名称", "规格", "发货数量"],
        ["OUT-T1", "SKU_00001", "商品1", "规格1", "1"],
        ["合计"],
        ["收货人：测试", "收货电话：13800138000", "收货地址：上海测试路1号"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "出库单");
      const tmp = path.join(process.cwd(), "test-data", "_unit-upload.xlsx");
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      XLSX.writeFile(wb, tmp);
      const form = new FormData();
      form.append(
        "file",
        new Blob([fs.readFileSync(tmp)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "unit.xlsx"
      );
      form.append("ruleId", ruleId);
      const t0 = Date.now();
      const up = await fetch(`${base.replace(/\/$/, "")}/api/import-tasks`, {
        method: "POST",
        body: form,
      });
      const ms = Date.now() - t0;
      const body = await up.json();
      assert(up.ok, "上传接口成功");
      assert(ms <= 1000, `上传接口 1 秒内返回（实际 ${ms}ms）`);
      assert(Boolean(body.task_id && body.trace_id), "返回 task_id/trace_id");
    } else {
      console.log("跳过上传时延 HTTP 测试（需 BASE_URL + RULE_ID）");
    }
  }

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
