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

## Cloudflare Pages 部署（需要 maintainer 手动一次）

由于 Cloudflare 项目绑定需要登录控制台，下面的步骤需要 maintainer 一次性完成；之后所有 push / PR 都自动触发 build + deploy。

### 1. 登录 Cloudflare

进入 [Cloudflare Pages 控制台](https://dash.cloudflare.com/?to=/:account/pages)。

### 2. 创建项目

- 点击 "Create a project" → "Connect to Git"。
- 选 GitHub → 授权 → 选 `chiga0/custom-agent-docs` 仓库。
- 项目名：`custom-agent-docs`（建议；将变成 staging URL 子域名）。

### 3. 配置 build

| 设置 | 值 |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/`（不需要改）|
| Environment variable | `NODE_VERSION = 22` |

### 4. 部署后

- 自动 staging：`custom-agent-docs.pages.dev`。
- PR preview：自动开启；每个 PR 一个 `pr-<num>.custom-agent-docs.pages.dev`。
- Prod 域名（自定义）：在项目 → Custom Domains 添加；建议 `docs.custom-agent.dev` 或类似（需要持有该域名）。

### 5. 同步到 `astro.config.mjs`

把 `astro.config.mjs` 中 `site:` 改为最终 prod 域名（影响 sitemap / RSS / 绝对 URL）。

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
