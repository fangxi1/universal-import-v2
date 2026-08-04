import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const parseRules = pgTable("parse_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").references(() => parseRules.id),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  successRows: integer("success_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .references(() => importBatches.id)
      .notNull(),
    taskId: text("task_id"),
    lineNo: integer("line_no"),
    externalCode: text("external_code"),
    storeName: text("store_name"),
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    recipientAddress: text("recipient_address"),
    skuCode: text("sku_code").notNull(),
    skuName: text("sku_name").notNull(),
    skuQuantity: text("sku_quantity").notNull(),
    weight: text("weight"),
    tempLayer: text("temp_layer"),
    skuSpec: text("sku_spec"),
    remark: text("remark"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_orders_external_code").on(t.externalCode),
    index("idx_orders_task_id").on(t.taskId),
  ]
);

export const skuMaster = pgTable(
  "sku_master",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skuCode: text("sku_code").notNull(),
    name: text("name").notNull(),
    spec: text("spec"),
    unit: text("unit").default("件"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_sku_master_code").on(t.skuCode)]
);

export const importTasks = pgTable(
  "import_tasks",
  {
    id: text("id").primaryKey(),
    fileName: text("file_name").notNull(),
    ruleId: uuid("rule_id").references(() => parseRules.id),
    orderBatchId: uuid("order_batch_id").references(() => importBatches.id),
    status: text("status").notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    successRows: integer("success_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    totalBatches: integer("total_batches").notNull().default(0),
    completedBatches: integer("completed_batches").notNull().default(0),
    traceId: text("trace_id").notNull(),
    degraded: boolean("degraded").notNull().default(false),
    degradeReason: text("degrade_reason"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size").default(0),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_import_tasks_status_created").on(t.status, t.createdAt)]
);

export const importTaskFiles = pgTable("import_task_files", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => importTasks.id),
  contentBase64: text("content_base64").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const importTaskBatches = pgTable(
  "import_task_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: text("task_id")
      .notNull()
      .references(() => importTasks.id),
    unitId: text("unit_id").notNull(),
    batchIndex: integer("batch_index").notNull(),
    startRow: integer("start_row").notNull(),
    endRow: integer("end_row").notNull(),
    status: text("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    successRows: integer("success_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    lockedAt: timestamp("locked_at"),
    completedAt: timestamp("completed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_import_task_batches_unit").on(t.taskId, t.unitId),
    index("idx_import_task_batches_status").on(t.status),
  ]
);

export const importTaskParsedRows = pgTable(
  "import_task_parsed_rows",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => importTasks.id),
    lineNo: integer("line_no").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [uniqueIndex("uq_import_task_parsed_rows").on(t.taskId, t.lineNo)]
);

export const importTaskErrors = pgTable(
  "import_task_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: text("task_id")
      .notNull()
      .references(() => importTasks.id),
    unitId: text("unit_id"),
    batchIndex: integer("batch_index"),
    rowNumber: integer("row_number").notNull(),
    fieldName: text("field_name"),
    rawValue: text("raw_value"),
    errorCode: text("error_code").notNull(),
    errorReason: text("error_reason").notNull(),
    suggestion: text("suggestion"),
    traceId: text("trace_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_import_task_errors_task_unit").on(t.taskId, t.unitId),
    index("idx_import_task_errors_code").on(t.errorCode),
  ]
);

export const eventOutbox = pgTable(
  "event_outbox",
  {
    id: text("id").primaryKey(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    traceId: text("trace_id").notNull(),
    status: text("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at").defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => [index("idx_event_outbox_status_retry").on(t.status, t.nextRetryAt)]
);

export const batchPerformanceLog = pgTable(
  "batch_performance_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: text("task_id").notNull(),
    unitId: text("unit_id").notNull(),
    batchIndex: integer("batch_index").notNull(),
    parseDurationMs: integer("parse_duration_ms").notNull().default(0),
    ruleDurationMs: integer("rule_duration_ms").notNull().default(0),
    validateDurationMs: integer("validate_duration_ms").notNull().default(0),
    insertDurationMs: integer("insert_duration_ms").notNull().default(0),
    totalDurationMs: integer("total_duration_ms").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
    status: text("status").notNull(),
    traceId: text("trace_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_batch_perf_task_unit").on(t.taskId, t.unitId)]
);

export const traceEvents = pgTable(
  "trace_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: text("trace_id").notNull(),
    taskId: text("task_id"),
    unitId: text("unit_id"),
    eventName: text("event_name").notNull(),
    eventStatus: text("event_status").notNull().default("ok"),
    message: text("message"),
    meta: jsonb("meta"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => [index("idx_trace_events_trace_time").on(t.traceId, t.occurredAt)]
);

export type ParseRule = typeof parseRules.$inferSelect;
export type NewParseRule = typeof parseRules.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportTask = typeof importTasks.$inferSelect;
export type SkuMaster = typeof skuMaster.$inferSelect;
