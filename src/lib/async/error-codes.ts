export const ERROR_CODES = {
  E001: "E001",
  E002: "E002",
  E003: "E003",
  E004: "E004",
  E005: "E005",
  E006: "E006",
  E007: "E007",
  E008: "E008",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_LABELS: Record<ErrorCode, string> = {
  E001: "SKU 不存在",
  E002: "必填字段缺失",
  E003: "电话格式错误",
  E004: "数量不是正数",
  E005: "外部编码重复",
  E006: "规则映射失败",
  E007: "数据库写入失败",
  E008: "文件格式不支持",
};

export const ERROR_SUGGESTIONS: Record<ErrorCode, string> = {
  E001: "请核对 SKU 编码是否在商品主数据中存在，或先维护主数据后再导入",
  E002: "请补全必填字段（SKU编码/名称/数量，以及门店或收货人信息）",
  E003: "请修正为合法手机号或座机格式，例如 13800138000",
  E004: "请将数量修改为正整数",
  E005: "请检查文件中是否存在重复外部编码，或改用唯一单号",
  E006: "请检查解析规则列映射是否与文件表头一致",
  E007: "请稍后重试；若持续失败请联系运维查看数据库状态",
  E008: "请上传 xlsx/xls/docx/pdf 等受支持的文件格式",
};
