
## V3 集成 API（供运单全流程管理系统调用）

为对接 V3，V2 新增 `/api/integration/*` 路由（不修改现有 `/api/orders` 行为）。

### 环境变量

| 变量 | 说明 |
|------|------|
| `INTEGRATION_API_KEY` | V3 调用鉴权 Key（Header: `X-API-Key`） |

### 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/integration/waybills` | 按 externalCode 聚合的运单列表 |
| GET | `/api/integration/waybills/:waybillNo` | 运单详情（waybillNo = externalCode） |
| GET | `/api/integration/waybills/:waybillNo/skus/:sku/validate` | SKU 归属校验 |
| GET/POST | `/api/integration/waybills/:waybillNo/exception-flag` | 异常状态回写 |

### 字段映射

- V2 `orders.external_code` → V3 运单号
- V2 `orders.sku_code` → V3 扫描 SKU
- V2 `orders.store_name` → V3 仓库/租户隔离

详见 V3 项目 `docs/V2_API.md`。
