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
    minRows: 9,
    data: {
      sheets: [
        {
          name: "Sheet1",
          rows: [
            ["武汉配送中心 · 门店调拨单"],
            [
              "调拨单号：DB20260530001",
              "调出仓库：武汉配送中心",
              "调拨日期：2026-05-30",
              "经办人：王磊",
            ],
            ["▶ 调拨记录 #1"],
            [
              "调入门店",
              "尹三顺自助烤肉(银泰店)",
              "收货人",
              "王店长",
              "电话",
              "13900001111",
            ],
            ["收货地址", "汉口解放大道688号银泰百货B1层"],
            ["物品编码", "物品名称", "规格", "数量"],
            ["ZBWP0001", "茶语柠听紫苏风味糖浆", "750ml*6瓶/件", "3"],
            ["ZBWP0015", "寨寨香肠片", "2.5kg*6包/件", "5"],
            ["ZBWP0028", "Q寨寨五常香米", "25kg/包", "2"],
            ["▶ 调拨记录 #2"],
            [
              "调入门店",
              "尹三顺自助烤肉(金桥店)",
              "收货人",
              "李经理",
              "电话",
              "13800002222",
            ],
            ["收货地址", "武汉江岸区金桥大道38号永旺梦乐城2F"],
            ["物品编码", "物品名称", "规格", "数量"],
            ["ZBWP0025", "寨寨黑椒味牛肉片", "2.5kg*6包/件", "4"],
            ["ZBWP0030", "寨寨青花椒油", "400ml*12瓶/件", "2"],
            ["ZBWP0040", "寨寨专用火锅底料", "500g*10袋/件", "1"],
            ["▶ 调拨记录 #3"],
            [
              "调入门店",
              "尹三顺自助烤肉(金银潭店)",
              "收货人",
              "张主管",
              "电话",
              "13700003333",
            ],
            ["收货地址", "武汉东西湖区金银潭大道1号永旺梦乐城3"],
            ["物品编码", "物品名称", "规格", "数量"],
            ["ZBWP0035", "寨寨专用辣椒面", "500g*20包/件", "6"],
            ["ZBWP0001", "茶语柠听紫苏风味糖浆", "750ml*6瓶/件", "1"],
            ["ZBWP0028", "Q寨寨五常香米", "25kg/包", "3"],
            ["合计：3 个门店 | 9 种物品 | 总调拨数量：44 件/包"],
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
