# 异步导入 API

鉴权：浏览器页面接口暂不强制 API Key（与现有 V2 一致）。Cron/Worker 使用 `CRON_SECRET` / QStash 签名。

## POST /api/import-tasks

`multipart/form-data`：`file` + `ruleId`

响应：

```json
{
  "task_id": "task_xxx",
  "trace_id": "trace_xxx",
  "status": "PENDING",
  "total_rows": 10000,
  "total_batches": 10,
  "upload_ms": 320
}
```

## GET /api/import-tasks/:taskId

任务进度、吞吐、ETA、降级标记、最近错误摘要。

## GET /api/import-tasks/:taskId/errors

Query：`batch`、`error_code`、`page`、`page_size`

## GET /api/import-tasks/:taskId/batches

批次状态 + 最近一次性能日志。

## GET /api/traces?task_id=&trace_id=&file_name=&error_code=

任务搜索。

## GET /api/traces/:traceId

时间线 + 错误节点。支持 `batch`、`row_from`、`row_to`、`error_code`。

## GET /api/import-monitor/summary

吞吐、队列积压、阶段 P50/P95/P99、错误分布、慢批次 TOP10。

## POST /api/workers/import-batch

内部 Worker。Header：`x-cron-secret` 或 QStash `Upstash-Signature`。

## GET /api/cron/outbox-dispatch

投递 Outbox → 队列/本地 Worker。

## GET /api/cron/stale-batches

恢复卡死 `processing` 批次。

## 事件契约

统一信封：`event_id`、`event_type`、`schema_version`、`aggregate_id`、`trace_id`、`occurred_at`、`payload`。

至少包含：`ImportTaskCreated`、`ImportBatchCreated`、`ImportBatchStarted`、`ImportBatchSucceeded`、`ImportBatchFailed`、`ImportTaskCompleted`、`ImportTaskPartialSuccess`、`ImportTaskDegraded`。

字段只增不删；消费者忽略未知字段；破坏性变更提升 `schema_version`。
