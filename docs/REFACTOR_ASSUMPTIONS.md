# 重构假设说明（V2 异步事件驱动导入）

## 1. 为什么选择异步事件驱动

同步链路在 10,000 行场景下会长时间占用 Serverless 请求，易触发超时与连接池打满。上传接口只负责落盘与建任务，后台 Worker 分批处理，可水平扩展并提供进度可见性。

## 2. 处理单元大小

默认 **1000 行/批**（`IMPORT_BATCH_SIZE`）。理由：单批校验/写入可在 Serverless 60s 内完成；10,000 行拆为 10 个可重试单元；失败重试成本可控。

## 3. Worker / Consumer 容量规划

- 本地：Outbox Dispatcher 直调 Worker，并发 `IMPORT_WORKER_CONCURRENCY=3`
- 生产：Upstash QStash 投递 HTTP Worker，同样限制应用侧并发约 3，保护 Neon 连接池
- 全量解析只由一名 Worker 执行（`line_no=0` 哨兵锁），其余批次读解析缓存切片

## 4. 10,000 单/分钟推导

| 项 | 值 |
|---|---|
| 数据量 | 10,000 行 |
| 批次 | 10 × 1000 |
| 解析+规则（一次） | 目标 ≤ 8s |
| 单批校验+写入 | 目标 ≤ 4s |
| 并发 3 | 墙钟约 ceil(10/3)*4 + 8 ≈ 22s |
| 结论 | 预留余量后可落在 60s 内；以压测报告实测为准 |

## 5. 数据库连接与并发

- 使用 Neon HTTP（无长连接池占满问题，但仍限制 Worker 并发）
- 批量 `IN` 查询 SKU（chunk 500），批量 UPSERT（chunk 200）
- 禁止逐行 SELECT/INSERT 主路径

## 6. Outbox 如何避免消息丢失

任务、批次、`event_outbox`、文件元数据在 **同一 SQL transaction** 写入。Dispatcher 扫描 `pending/failed` 投递；宕机后 Cron `/api/cron/outbox-dispatch` 恢复。禁止上传接口直接 `queue.add` 而无本地 Outbox。

## 7. 处理单元幂等

- `import_task_batches (task_id, unit_id)` 唯一
- 已 `completed` 的批次快速返回
- `orders` 唯一键 `(task_id, line_no)` UPSERT
- 进度用「本批最终值替换」而非盲目累加
- 重试前清理该 unit 的旧错误行

## 8. 部分行失败策略

成功行入库、失败行写 `import_task_errors`，任务状态 `partial_success`。原因：大促导入不能因少量脏数据整批回滚；用户可按错误码修复后重传（新 task）。

## 9. SKU 校验降级

当 `sku_master` 查询超过 `SKU_VALIDATE_TIMEOUT_MS`（默认 3000ms）或连接失败：跳过 SKU 存在性校验，仅做本地格式校验；任务 `degraded=true`，UI 明确提示。新任务在依赖恢复后自动走正常校验。本期不对历史降级任务自动补校验（可后续加补扫 Job）。

## 10. 敏感数据脱敏

错误表与 Trace 展示中，手机号保留前三后四，地址保留前 6 字；超长 raw_value 截断。

## 11. 压测数据生成与清理

```bash
npm run seed:perf              # 灌入 20,000 SKU + 生成 test-data/10000-orders.xlsx
npm run seed:perf -- --clean   # 清理 SKU_% 主数据
npm run seed:perf -- --excel-only
```

Outbox / 错误 / 性能日志建议按 `created_at` 定期归档（保留 7–30 天），可用 SQL 清理脚本扩展。

## 12. 想向产品/运维提问的问题

1. 重复上传同一文件是拒绝、覆盖还是生成新 task？（本期：始终新 task）
2. 降级导入是否必须强制人工复核门禁？
3. 失败行是否支持「只重跑失败行」而不重建全任务？
4. 生产 QStash 与 Neon 的配额/告警阈值期望是多少？
5. 是否需要对接钉钉机器人作为 P0 告警通道？
