# 万能导入 V2 — 智能多格式批量下单系统

基于 Next.js App Router + TypeScript + Vercel Postgres 的出库单智能解析与批量导入系统。

## 功能特性

- **通用规则引擎**：JSON 配置驱动，支持 skipRows、extractTable、extractFooter、groupBy、matrixTranspose、多Sheet、卡片拆分、纯文本、复合单元格、PDF 拆分等
- **AI 辅助生成规则**：大模型分析文件结构并生成推荐规则（非直接解析数据），用户确认后保存
- **多格式支持**：Excel (.xlsx/.xls)、Word (.docx)、PDF
- **数据预览**：虚拟列表渲染 1000+ 条数据，类 Excel 在线编辑
- **校验与提交**：A/B 组收货信息校验、电话格式、重复检测、批量提交到数据库

## 技术栈

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS 4
- Vercel Postgres (Neon) + Drizzle ORM
- @tanstack/react-virtual（虚拟列表）
- xlsx / mammoth / pdf-parse

## 快速开始

```bash
npm install
cp .env.example .env.local
# 配置 POSTGRES_URL 和 LLM_API_KEY
npm run dev
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `POSTGRES_URL` | Vercel Postgres 连接串（Dashboard → Storage 创建） |
| `LLM_API_KEY` | 大模型 API Key（DeepSeek / OpenAI 等） |
| `LLM_BASE_URL` | API 地址，默认 `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名称，默认 `deepseek-chat` |

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入项目
3. 在 Vercel Dashboard → Storage 创建 Postgres 数据库并关联项目
4. 配置 `LLM_API_KEY` 等环境变量
5. 部署后访问 `/api/init-db` 初始化数据库表

## 大模型说明

- **用途**：分析上传文件的预览结构，生成 ParseRuleConfig JSON 规则（不是直接输出运单数据）
- **Prompt 设计**：System Prompt 定义规则引擎步骤类型与输出格式；User Prompt 包含文件前 15 行预览
- **无 API Key 时**：自动使用启发式规则生成（仍可手动微调）
- **推测标注**：AI 返回 `guessedMappings` 数组，UI 以橙色标签展示需用户确认的项目

## 目录结构

```
src/
├── app/           # 页面与 API 路由
├── components/    # UI 组件
├── lib/
│   ├── ai/        # LLM 客户端
│   ├── db/        # 数据库
│   ├── engine/    # 规则引擎 + 文件提取
│   ├── export/    # Excel 导出
│   └── validation/
└── types/         # TypeScript 类型
```

## 预设规则与考点3自测

系统内置 **9 套预设规则**（`/rules` →「导入预设规则」），分别覆盖 9 种出库单结构类型，**引擎代码无文件名/列名硬编码**，列映射均写在 JSON 规则配置中。

## 考点4 性能

| 指标 | 实现 |
|------|------|
| 1000 单 ≤10s | Web Worker 解析 Excel + 分片规则引擎 + 性能面板计时 |
| 渲染 ≤3s | `@tanstack/react-virtual` 虚拟列表，仅渲染可见行 |
| 不阻塞 UI | `yieldToMain` / Worker / 大列表延迟持久化 |
| 内存 | 大文件预览截断存储，>500 行不写 localStorage |

```bash
npm run benchmark:excel   # 生成 public/benchmark/standard-1000.xlsx
npm run test:perf         # Node 端规则引擎基准
```

答辩演示：上传 `standard-1000.xlsx` → 选「标准表格+尾部收货信息」→ 解析，查看预览页**性能指标**面板。

```bash
npm run test:presets   # 本地验证 9/9 兼容性
# 或访问 GET /api/rules/verify-presets
```

| 预设规则 | 覆盖场景 | 引擎步骤 |
|---------|---------|---------|
| 标准表格+尾部收货信息 | 干扰头+表体+尾部收货 | skipRows, extractTable, extractFooter, mapFields, setDefaults |
| 按单号跨行聚合 | 同单多行共享收货人 | groupBy, mapFields |
| SKU×门店矩阵转置 | 矩阵行列转置 | matrixTranspose, setDefaults |
| PDF配送单 | PDF 文本块 | textBlockSplit, filterRows |
| 多Sheet门店出库 | 每 Sheet 一门店 | processAllSheets, extractFooter, mapFields |
| 卡片式调拨单 | 卡片边界+内表 | cardSplit(innerSteps), mapFields |
| Word纯文本配送确认 | 段落+分隔线 | textBlockSplit |
| 日期×门店矩阵+复合单元格 | 日期列×门店行 | dateStoreMatrix |
| PDF多单拆分 | 一单多 PDF | pdfSplit, textBlockSplit |

## 反思题参考

1. **规则粒度**：太粗则无法覆盖复杂格式差异；太细则每条规则接近硬编码，维护成本高
2. **规则 vs 直接解析**：规则可复用、可审计、性能更好；直接解析适合一次性或极不规则的文件
3. **纯人工预估**：约 3-5 天（规则引擎设计 1-2 天 + 9 种格式规则调试 1-2 天 + UI/DB 1 天）
