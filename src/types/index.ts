export const ORDER_FIELDS = [
  "externalCode",
  "storeName",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
  "skuCode",
  "skuName",
  "skuQuantity",
  "weight",
  "tempLayer",
  "skuSpec",
  "remark",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

export const FIELD_LABELS: Record<OrderField, string> = {
  externalCode: "外部编码",
  storeName: "收货门店",
  recipientName: "收件人姓名",
  recipientPhone: "收件人电话",
  recipientAddress: "收件人地址",
  skuCode: "SKU物品编码",
  skuName: "SKU物品名称",
  skuQuantity: "SKU发货数量",
  weight: "重量(kg)",
  tempLayer: "温层",
  skuSpec: "SKU规格型号",
  remark: "备注",
};

export interface OrderRow {
  id: string;
  externalCode: string;
  storeName: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  skuCode: string;
  skuName: string;
  skuQuantity: string;
  weight: string;
  tempLayer: string;
  skuSpec: string;
  remark: string;
}

export interface ValidationError {
  rowIndex: number;
  field: OrderField | "row";
  message: string;
}

export interface ParseProgress {
  percent: number;
  current: number;
  total: number;
  stage: string;
}

/** 规则引擎步骤类型 */
export type RuleStep =
  | { type: "skipRows"; count: number }
  | { type: "skipUntilMatch"; pattern: string; maxScan?: number }
  | { type: "extractTable"; headerRow?: number; endMarker?: string; skipPatterns?: string[] }
  | {
      type: "extractFooter";
      patterns: FooterPattern[];
      scanFromBottom?: number;
      /** 卡片式：收货信息在卡片顶部时使用 */
      scanFromTop?: number;
    }
  | { type: "groupBy"; keyField: string; inheritFields: string[] }
  | {
      type: "matrixTranspose";
      rowLabelColumn: number;
      headerRow: number;
      dataStartRow: number;
      skipColumns?: number[];
      skuCodeColumn?: number;
      skuNameColumn?: number;
      skipHeaderPatterns?: string[];
      staticFields?: Record<string, string>;
    }
  | { type: "processAllSheets"; sheetNames?: string[] }
  | { type: "cardSplit"; startMarker: string; endMarker?: string; innerSteps?: RuleStep[] }
  | {
      type: "textBlockSplit";
      blockSeparator: string;
      linePatterns: LinePattern[];
    }
  | {
      type: "compositeCellSplit";
      column: string | number;
      itemPattern: string;
      delimiter?: string;
    }
  | {
      type: "dateStoreMatrix";
      storeColumn: number;
      dateHeaderRow: number;
      dataStartRow: number;
      cellItemPattern: string;
    }
  | { type: "pdfSplit"; orderMarker: string; maxOrders?: number }
  | { type: "filterRows"; skipPatterns: string[]; skipEmptySku?: boolean }
  | { type: "mapFields"; mappings: FieldMapping[]; guessed?: string[] }
  | { type: "setDefaults"; defaults: Partial<Record<OrderField, string>> };

export interface FooterPattern {
  field: OrderField;
  labelPattern: string;
  valueGroup?: number;
}

export interface LinePattern {
  field?: OrderField;
  pattern: string;
  isItemLine?: boolean;
  itemFields?: Partial<Record<OrderField, number>>;
}

export interface FieldMapping {
  target: OrderField;
  source: string | number | "footer" | "static";
  staticValue?: string;
  footerField?: OrderField;
  transform?: "trim" | "number" | "phone";
}

export interface ParseRuleConfig {
  fileTypes: Array<"xlsx" | "xls" | "docx" | "pdf">;
  steps: RuleStep[];
  description?: string;
}

export interface ParseRuleRecord {
  id: string;
  name: string;
  description: string | null;
  config: ParseRuleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AiGeneratedRule {
  config: ParseRuleConfig;
  guessedMappings: string[];
  analysis: string;
  confidence: "high" | "medium" | "low";
  /** 是否已调用大模型（评委验收用） */
  llmInvoked?: boolean;
  llmModel?: string;
  /** 规则配置是否经结构检测校验/优化（保留 LLM 分析结论） */
  configRefined?: boolean;
}

export interface FilePreviewData {
  sheets?: Array<{ name: string; rows: string[][] }>;
  text?: string;
  pageCount?: number;
}

export interface SubmitResult {
  success: number;
  failed: number;
  errors: Array<{ rowIndex: number; message: string }>;
}
