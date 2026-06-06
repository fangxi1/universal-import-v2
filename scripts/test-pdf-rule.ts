import { buildPdfRuleFromText } from "../src/lib/engine/pdf-delivery-rule";
import { executeRuleEngine } from "../src/lib/engine/rule-engine";

const SAMPLE = [
  "配送单",
  "单据编号 PS2604210007",
  "收货机构 黔寨寨贵州烙锅（鞍山首店）",
  "1 饮品类 ZBWP0001 茶语柠听紫苏风味糖浆 750ml*6瓶/件 件 2",
  "36 工作服 ZBWP0094 后厨上衣 XL码 件 12",
  "41 工作服 ZBWP0099 帽子（通用） 均码 件 50",
  "合计 350",
  "收货人 荣丽",
  "收货电话 13130093946",
  "收货地址 辽宁省鞍山市铁东区建国大道700号",
].join("\n");

const { config } = buildPdfRuleFromText(SAMPLE);
const rows = executeRuleEngine({ text: SAMPLE }, config);

console.log("\n=== PDF 7 列表格解析测试 ===\n");
console.log(`解析 ${rows.length} 条（期望 ≥3）\n`);

for (const r of rows.slice(0, 5)) {
  console.log(
    `${r.skuCode} | ${r.skuName} | ${r.skuQuantity} | ${r.recipientName} | ${r.externalCode}`
  );
}

const VERTICAL = [
  "配送单",
  "单据编号 PS2604210007",
  "1",
  "饮品类",
  "ZBWP0001",
  "茶语柠听紫苏风味糖浆",
  "750ml*6瓶/件",
  "件",
  "2",
  "36",
  "工作服",
  "ZBWP0094",
  "后厨上衣",
  "XL码",
  "件",
  "12",
  "收货人 荣丽",
  "收货电话 13130093946",
].join("\n");

const { config: vConfig } = buildPdfRuleFromText(VERTICAL);
const vRows = executeRuleEngine({ text: VERTICAL }, vConfig);

console.log(`竖排表格解析 ${vRows.length} 条（期望 ≥2）`);

const ONE_LINE =
  "配送单 单据编号 PS2604210007 收货机构 黔寨寨 1 饮品类 ZBWP0001 茶语 柠听 750ml 件 2 36 工作服 ZBWP0094 后厨上衣 XL码 件 12 收货人 荣丽 收货电话 13130093946";
const { config: oConfig } = buildPdfRuleFromText(ONE_LINE);
const oRows = executeRuleEngine({ text: ONE_LINE }, oConfig);
console.log(`单行多物品解析 ${oRows.length} 条（期望 ≥2）`);

const FOUR_COL = [
  "配送单",
  "1",
  "饮品类",
  "ZBWP0001",
  "茶语柠听",
  "2",
  "收货人 荣丽",
].join("\n");
const { config: fConfig } = buildPdfRuleFromText(FOUR_COL);
const fRows = executeRuleEngine({ text: FOUR_COL }, fConfig);
console.log(`竖排4列解析 ${fRows.length} 条（期望 ≥1）`);

const SPLIT_CODE = "1 饮品类 ZBWP 0001 茶语柠听 2";
const { config: sConfig } = buildPdfRuleFromText(SPLIT_CODE);
const sRows = executeRuleEngine({ text: SPLIT_CODE }, sConfig);
console.log(`拆分编码解析 ${sRows.length} 条（期望 ≥1）`);

/** 模拟 pdf-parse 列优先抽取（黔寨寨真实 PDF 常见格式） */
const COLUMN_MAJOR = [
  "黔寨寨贵州烙锅（鞍山首店）-配送单",
  "单据编号 PS2604210007",
  "收货机构 黔寨寨贵州烙锅（鞍山首店）",
  "物品类别",
  "物品编码",
  "物品名称",
  "规格型号",
  "订货单位",
  "发货数量",
  "1",
  "2",
  "3",
  "饮品类",
  "饮品类",
  "熟烙类",
  "ZBWP0001",
  "ZBWP0002",
  "ZBWP0015",
  "茶语柠听紫苏风味糖浆",
  "茶语柠听Pro",
  "寨寨香肠片",
  "750ml*6瓶/件",
  "750ml*6瓶/件",
  "2.5kg*6包/件",
  "件",
  "件",
  "件",
  "2",
  "1",
  "40",
  "第1页 / 共2页",
  "36",
  "37",
  "38",
  "工作服",
  "工作服",
  "工作服",
  "ZBWP0094",
  "ZBWP0095",
  "ZBWP0096",
  "后厨上衣",
  "后厨上衣",
  "后厨上衣",
  "XL码",
  "2XL码",
  "3XL码",
  "件",
  "件",
  "件",
  "12",
  "10",
  "8",
  "合计",
  "350",
  "收货人 荣丽",
  "收货电话 13130093946",
  "收货地址 辽宁省鞍山市铁东区建国大道700号",
].join("\n");

const { config: cConfig } = buildPdfRuleFromText(COLUMN_MAJOR);
const cRows = executeRuleEngine({ text: COLUMN_MAJOR }, cConfig);
console.log(`列优先表格解析 ${cRows.length} 条（期望 ≥6）`);

const ok =
  rows.length >= 3 &&
  rows.some((r) => r.skuCode === "ZBWP0001" && r.skuQuantity === "2") &&
  rows.some((r) => r.skuCode === "ZBWP0094" && r.skuQuantity === "12") &&
  rows.every((r) => r.recipientName === "荣丽" || r.recipientName === "") &&
  vRows.length >= 2 &&
  vRows.some((r) => r.skuCode === "ZBWP0001") &&
  oRows.length >= 2 &&
  oRows.some((r) => r.skuCode === "ZBWP0094" && r.skuQuantity === "12") &&
  fRows.length >= 1 &&
  fRows.some((r) => r.skuCode === "ZBWP0001" && r.skuQuantity === "2") &&
  sRows.length >= 1 &&
  sRows.some((r) => r.skuCode === "ZBWP0001") &&
  cRows.length >= 6 &&
  cRows.some((r) => r.skuCode === "ZBWP0001" && r.skuQuantity === "2") &&
  cRows.some((r) => r.skuCode === "ZBWP0094" && r.skuQuantity === "12") &&
  cRows.every((r) => r.recipientName === "荣丽" || r.recipientName === "");

console.log(ok ? "\n✓ 通过\n" : "\n✗ 失败\n");
process.exit(ok ? 0 : 1);
