import type { FilePreviewData } from "@/types";
import { PRESET_RULES } from "./rules";
import { executeRuleEngine } from "@/lib/engine/rule-engine";

/** 9 份出库单结构的合成预览数据（用于规则引擎自测，非文件名硬编码） */
export const PRESET_FIXTURES: Array<{
  presetName: string;
  examLabel: string;
  data: FilePreviewData;
  minRows: number;
}> = [
  {
    presetName: "标准表格+尾部收货信息",
    examLabel: "黎明屯配送发货单（干扰头+表体+尾部收货信息）",
    minRows: 1,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["出库通知", "", "", "", ""],
            ["单位：测试", "", "", "", ""],
            ["日期：2024-01-01", "", "", "", ""],
            ["外部编码", "SKU编码", "SKU名称", "数量", "规格"],
            ["OUT001", "SKU-A", "商品A", "10", "箱"],
            ["OUT002", "SKU-B", "商品B", "5", "件"],
            ["合计", "", "", "", ""],
            ["收货人：张三", "电话：13800138000", "地址：北京市朝阳区", "", ""],
          ],
        },
      ],
    },
  },
  {
    presetName: "按单号跨行聚合",
    examLabel: "湖南仓发货明细（同单号跨行聚合）",
    minRows: 2,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["标题行", "", "", "", "", "", "", "", ""],
            ["配送单号", "收件人", "电话", "地址", "收货门店", "物品编码", "物品名称", "数量", "规格"],
            ["DN001", "李四", "13900139000", "上海市浦东新区", "门店A", "C001", "物品1", "3", "箱"],
            ["DN001", "", "", "", "", "C002", "物品2", "2", "件"],
            ["DN002", "王五", "13700137000", "广州市天河区", "门店B", "C003", "物品3", "1", "箱"],
          ],
        },
      ],
    },
  },
  {
    presetName: "SKU×门店矩阵转置",
    examLabel: "欢乐牧场模板（SKU×门店矩阵）",
    minRows: 2,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["SKU信息", "门店信息", "门店信息", "门店信息"],
            ["SKU/门店", "门店甲", "门店乙", "门店丙"],
            ["SKU-100", "10", "0", "5"],
            ["SKU-200", "3", "8", "0"],
          ],
        },
      ],
    },
  },
  {
    presetName: "PDF配送单",
    examLabel: "黔寨寨配送单（PDF文本+底部签收）",
    minRows: 3,
    data: {
      text: [
        "配送单",
        "单据编号 PS2604210007",
        "收货机构 黔寨寨贵州烙锅（鞍山首店）",
        "物品类别 物品编码 物品名称 规格型号 订货单位 发货数量",
        "1 饮品类 ZBWP0001 茶语柠听紫苏风味糖浆 750ml*6瓶/件 件 2",
        "36 工作服 ZBWP0094 后厨上衣 XL码 件 12",
        "41 工作服 ZBWP0099 帽子（通用） 均码 件 50",
        "合计 350",
        "收货人 荣丽",
        "收货电话 13130093946",
        "收货地址 辽宁省鞍山市铁东区建国大道700号万象汇（常温货地址）",
      ].join("\n"),
    },
  },
  {
    presetName: "多Sheet门店出库",
    examLabel: "多门店分Sheet出库单",
    minRows: 2,
    data: {
      sheets: [
        {
          name: "北京店",
          rows: [
            ["", "", "", ""],
            ["", "", "", ""],
            ["SKU编码", "SKU名称", "数量", "备注"],
            ["S1", "商品1", "4", ""],
            ["收货人：钱七", "电话：13500135000", "地址：北京市", ""],
          ],
        },
        {
          name: "上海店",
          rows: [
            ["", "", "", ""],
            ["", "", "", ""],
            ["SKU编码", "SKU名称", "数量", "备注"],
            ["S2", "商品2", "6", ""],
            ["收货人：孙八", "电话：13400134000", "地址：上海市", ""],
          ],
        },
      ],
    },
  },
  {
    presetName: "卡片式调拨单",
    examLabel: "门店调拨单(卡片式)",
    minRows: 2,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["▶ 调拨记录 T001"],
            ["物品编码", "物品名称", "数量"],
            ["T-SKU1", "调拨品1", "10"],
            ["收货门店：西部仓", "收件人：周九", "电话：13300133000", "地址：成都市"],
            ["─────────────────"],
            ["▶ 调拨记录 T002"],
            ["物品编码", "物品名称", "数量"],
            ["T-SKU2", "调拨品2", "8"],
            ["收货门店：东部仓", "收件人：吴十", "电话：13200132000", "地址：杭州市"],
          ],
        },
      ],
    },
  },
  {
    presetName: "Word纯文本配送确认",
    examLabel: "Word纯文本配送确认",
    minRows: 1,
    data: {
      text: [
        "单号：WD-001",
        "门店：测试门店",
        "收件人：郑一",
        "电话：13100131000",
        "地址：南京市鼓楼区",
        "━━━━━━━━━━━━━━",
        "1. SKU-W1 | 文档商品1 | 规格A | 5",
        "2. SKU-W2 | 文档商品2 | 规格B | 3",
      ].join("\n"),
    },
  },
  {
    presetName: "日期×门店矩阵+复合单元格",
    examLabel: "日期×门店矩阵+复合单元格",
    minRows: 2,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["门店", "1月1日", "1月2日"],
            ["华东店", "苹果 x 2\n香蕉 x 3", "橙子 x 5"],
            ["华南店", "葡萄 x 1", "西瓜 x 2\n芒果 x 4"],
          ],
        },
      ],
    },
  },
  {
    presetName: "PDF多单拆分",
    examLabel: "PDF多单拆分",
    minRows: 2,
    data: {
      text: [
        "配送签收单",
        "单号：M-001",
        "收货人：冯二",
        "电话：13000130000",
        "地址：武汉市",
        "P001 商品P1 4",
        "-----",
        "配送签收单",
        "单号：M-002",
        "收货人：陈三",
        "电话：12900129000",
        "地址：西安市",
        "P002 商品P2 7",
      ].join("\n"),
    },
  },
];

export function verifyAllPresets(): {
  passed: number;
  failed: number;
  results: Array<{
    presetName: string;
    examLabel: string;
    ok: boolean;
    rowCount: number;
    message: string;
  }>;
} {
  const results = PRESET_FIXTURES.map((fixture) => {
    const preset = PRESET_RULES.find((p) => p.name === fixture.presetName);
    if (!preset) {
      return {
        presetName: fixture.presetName,
        examLabel: fixture.examLabel,
        ok: false,
        rowCount: 0,
        message: "未找到对应预设规则",
      };
    }

    try {
      const rows = executeRuleEngine(fixture.data, preset.config);
      const ok = rows.length >= fixture.minRows;
      return {
        presetName: fixture.presetName,
        examLabel: fixture.examLabel,
        ok,
        rowCount: rows.length,
        message: ok
          ? `解析 ${rows.length} 条`
          : `仅解析 ${rows.length} 条，期望 ≥ ${fixture.minRows}`,
      };
    } catch (e) {
      return {
        presetName: fixture.presetName,
        examLabel: fixture.examLabel,
        ok: false,
        rowCount: 0,
        message: e instanceof Error ? e.message : "解析异常",
      };
    }
  });

  return {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
