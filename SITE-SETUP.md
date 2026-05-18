# Docs Site 部署与维护指南

本文档解释如何在本地起站、如何把站点部署到 Cloudflare Pages、CI 流水线 跑什么。

详见 [`docs/zh/adr/0005-docs-site-architecture.md`](docs/zh/adr/0005-docs-site-architecture.md) 的整体决策。

---

## 本地起站

```bash
# 一次性安装依赖
npm install

# 起 dev server（默认 http://localhost:4321）
npm run dev

# 静态 build（产出在 dist/）
npm run build

# 预览 build 出来的产物
npm run preview
```

要求 Node 22+。`better-sqlite3` 等原生包**不在 docs 仓库**——仅 Astro/Starlight 依赖。

## 内容编辑约定

- 所有内容文件在 `docs/zh/` 和 `docs/en/`。Astro/Starlight 通过 `src/content.config.ts` 的 `glob` loader 读取（不需要物理迁移到 `src/content/docs/`）。
- 每篇 Markdown **可选**含 frontmatter（`title` / `description`）；不写则 Starlight 自动从首个 `# ` 标题推断。
- 引用 ADR：用 `[[adr-NNNN]]`（自定义符号；目前由人眼解析；未来 docs-ref-check CI 自动校验）。
- 引用代码：用 `packages/<pkg>/src/<file>.ts:<symbol>` 形式（未来 docs-ref-check 验证）。
- 中英混排：术语首次出现给中英文双标，后续可纯英文。

## Cloudflare 部署（Workers + Static Assets）

当前项目（`custom-agent`，绑定域名 `agent.chigao.site`）走 **Cloudflare Workers + Static Assets** 模式：纯静态产物（`dist/`）通过 wrangler 上传到 Workers，不需要 SSR。

### 仓库内已经就位的文件

| 文件 | 作用 |
|---|---|
| `wrangler.toml` | Workers 项目配置（assets directory / compatibility flags） |
| `public/.assetsignore` | wrangler 必需文件；列出 `dist/` 中不上传的资源（空 = 全部上传） |
| `astro.config.mjs` `site:` | 已指向 `https://agent.chigao.site` 让 sitemap / 绝对 URL 正确 |

### 在 Cloudflare Dashboard 一次性操作

1. **绑定 GitHub repo**：Workers → custom-agent → Settings → Build → connect `chiga0/custom-agent-docs`。
2. **Build 配置**（如未自动检测）：
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`（此命令读 `wrangler.toml`）
   - Root directory: `/`
3. **Custom domain**：Settings → Triggers → Custom Domains → Add `agent.chigao.site`。
4. **DNS**：在 `chigao.site` zone 添加 CNAME `agent` → `custom-agent.<account>.workers.dev`（或让 Cloudflare 自动建）。proxy 状态 `Proxied`（橙色云）。
5. **环境变量**：Settings → Variables and Secrets → 加 `NODE_VERSION=22`（如果默认 Node 版本不对）。

### 部署触发

push 到 `main` 自动触发 build + deploy（首次绑定 GitHub 后即生效）。PR 自动 preview 由 Cloudflare 控制；如未开启在 Workers → Settings → Build → "Preview deployments" 打开。

### 备选方案：切到 Cloudflare Pages（更简单，无需 wrangler.toml）

如果你想切到 Pages 模式：

1. 删掉当前 Workers 项目。
2. 在 Pages 控制台 Create project → Connect Git。
3. Build command: `npm run build` / Build output directory: `dist` / 不需要 deploy command。
4. 仓库根的 `wrangler.toml` 和 `public/.assetsignore` 可以删（Pages 不读）。

Workers vs Pages 对当前纯静态站点的可见差异：
- Workers 提供 observability dashboard 更细；Pages 集成 GitHub workflow 更顺。
- Workers + Static Assets 是 Cloudflare 2025 后主推方向；Pages 仍长期维护。
- 两者底层 edge 网络与 APAC 表现一致。

## CI 流水线

GitHub Actions 在 `.github/workflows/` 下：

| Workflow | 触发 | 干什么 |
|---|---|---|
| `docs-build.yaml` | push / PR | npm ci → markdownlint → astro check → astro build；失败阻断 PR |
| `docs-link-check.yaml` | weekly cron + 手动 | markdown-link-check 外链；失败开 issue（不阻断 PR）|

**未读到的 CI（Phase 3 实装）**：

- `docs-ref-check.yaml`：扫 handbook 中的代码引用（`packages/core/src/...:Symbol`），clone `custom-agent` main 静态验证；引用失效则阻 PR。
- Vale prose lint：自定义 style pack 校验中英文文档一致性 / 禁用词。

## 后续 phase

Phase 1 / 2 / 3 / 4 详见 `docs/zh/handbook/RESTRUCTURE-PLAN.md`。

- **Phase 1**：✅ 决策 + 关键新章节（[[adr-0004]] / [[adr-0005]] / INTRO / GLOSSARY / turn-lifecycle / adr-index / quickstart）。
- **Phase 2**：✅ Astro Starlight 脚手架 + 基础 CI（本提交）。
- **Phase 3**（M1 完结后）：内容物理迁移到 `src/content/docs/` + docs-ref-check + Vale + prod 域名启用。
- **Phase 4**（与 Phase 3 并行）：按 A2 audit 评分重写弱章节（已完成：tools-and-permissions / context / memory / from-zero）。
- **Phase 5**（v1 release 后）：Starlight Versions + 英文 mirror。
