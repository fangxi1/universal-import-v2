import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
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

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .references(() => importBatches.id)
    .notNull(),
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
});

export type ParseRule = typeof parseRules.$inferSelect;
export type NewParseRule = typeof parseRules.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
