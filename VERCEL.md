# Vercel 部署与数据库配置指南

## 一、部署到 Vercel

### 方式 A：Vercel Dashboard（推荐）

1. 打开 [vercel.com](https://vercel.com) 并登录
2. **Add New → Project**
3. 导入 Git 仓库（需先将本项目 push 到 GitHub/GitLab）
4. Framework 选 **Next.js**，直接 Deploy

### 方式 B：Vercel CLI

```bash
npm i -g vercel
cd d:\ideaProject\AI_test
vercel login
vercel link          # 关联 Vercel 项目
vercel               # 预览部署
vercel --prod        # 生产部署
```

---

## 二、创建并关联 Vercel Postgres 数据库

1. 进入 Vercel Dashboard → 你的项目
2. 顶部 **Storage** 标签 → **Create Database**
3. 选择 **Postgres**（由 Neon 提供，即 Vercel Marketplace 集成）
4. 输入数据库名称（如 `universal-import-db`）→ **Create**
5. 在 **Connect Project** 中选择当前项目 → **Connect**

连接成功后，Vercel 会自动向项目注入以下环境变量：

| 变量 | 说明 |
|------|------|
| `POSTGRES_URL` | 连接池 URL（应用运行时用这个） |
| `POSTGRES_URL_NON_POOLING` | 直连 URL（迁移/ drizzle-kit 用） |
| `POSTGRES_USER` | 用户名 |
| `POSTGRES_HOST` | 主机 |
| `POSTGRES_PASSWORD` | 密码 |
| `POSTGRES_DATABASE` | 数据库名 |

> 无需手动复制，关联项目后自动生效。

---

## 三、配置大模型环境变量

在 Vercel 项目 → **Settings → Environment Variables** 添加：

| 变量 | 值 | 环境 |
|------|-----|------|
| `LLM_API_KEY` | 你的 API Key | Production, Preview, Development |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 全部 |
| `LLM_MODEL` | `deepseek-chat` | 全部 |

添加后重新 Deploy 一次。

---

## 四、初始化数据库表

部署完成后，浏览器访问：

```
https://你的域名.vercel.app/api/init-db
```

返回 `{"ok":true}` 表示表创建成功。

---

## 五、本地开发连接 Vercel 数据库

```bash
vercel login
vercel link
vercel env pull .env.local    # 拉取线上环境变量到本地
npm run dev
```

`.env.local` 会包含 `POSTGRES_URL` 等变量，本地即可连接 Vercel 云端数据库。

---

## 六、验证清单

- [ ] Vercel 部署成功，页面可访问
- [ ] Storage 中 Postgres 已创建并 Connect 到项目
- [ ] `/api/init-db` 返回 ok
- [ ] `/import` 页面上传文件正常
- [ ] 提交下单后 `/orders` 可看到数据

---

## 常见问题

**Q: `vercel login` 报错 `is not a legal HTTP header value`（用户名/电脑名为中文）**  
A: 这是 Vercel CLI 的已知问题：会把**电脑主机名**（如 `方希`）写入 HTTP 请求头，中文主机名会触发报错。推荐用 **Token 登录**（无需 `vercel login`）：

1. 打开 [vercel.com/account/tokens](https://vercel.com/account/tokens) → **Create Token**
2. 在 PowerShell 中执行（将 `你的token` 替换为实际值）：

```powershell
cd d:\ideaProject\AI_test
$env:VERCEL_TOKEN="你的token"
npx vercel link
npx vercel --prod
```

3. 拉取环境变量到本地：

```powershell
$env:VERCEL_TOKEN="你的token"
npx vercel env pull .env.local
```

也可选：将电脑名称改为纯英文（设置 → 系统 → 关于 → 重命名这台电脑），之后 `vercel login` 即可正常使用。

**Q: 本地报 `POSTGRES_URL` 未定义**  
A: 执行 `vercel env pull .env.local`，或手动在 `.env.local` 填入 Vercel Dashboard → Storage → .env.local 标签页中的连接串。

**Q: `@vercel/postgres` deprecated 提示**  
A: Vercel 已将 Postgres 迁移至 Neon 原生集成，现有 `@vercel/postgres` + `POSTGRES_URL` 仍可正常使用，无需改代码。

**Q: 考试要求的数据库**  
A: Vercel Dashboard → Storage → Postgres 即满足「Vercel Marketplace 集成数据库」要求。
