# ADR 0005: docs 仓库升级为公开文档站（Astro Starlight + Cloudflare Pages）

状态：Accepted

日期：2026-05-18

## 背景

`custom-agent-docs` 目前是纯 Markdown 仓库，由多 agent 协作维护，承载：

1. **Agent 技术解析**（handbook / tutorials / layers）—— 对外当作"从 0 到 1 构建 agent 框架"的学习资料。
2. **实施治理**（roadmap / status / ADR / quality）—— 对内当作开发治理真值源。

目前的局限：

- Markdown 直读时缺少导航、搜索、版本切换。
- 中文文档为主、英文滞后，缺统一 i18n 入口。
- 同样的内容既要服务"想学习 agent 怎么实现"的外部读者，又要服务"agent 自己写代码用的 governance 文档"，**未来这两类内容会越来越多，没有站点就难以分层。**
- 多 agent 写作要求纯 Markdown 编辑路径（不能强制 .vue / .mdx / .astro 组件）。

## 决策

把 `custom-agent-docs` 升级为一个公开访问的文档站。技术选型与部署如下。

### 1. 框架：Astro Starlight

候选对比（详尽版见调研报告，略）：

| 维度 | Docusaurus 3 | VitePress | **Starlight** | Nextra |
|---|---|---|---|---|
| 纯 Markdown 友好 | ✅ | ✅ | ✅ | ❌ MDX 优先 |
| 内置 i18n（zh+en） | ✅（JSON 较繁琐） | ✅ | ✅（含 UI 翻译） | 需手配 Next i18n |
| Mermaid | ✅ 官方插件 | ✅ 第三方插件 | ⚠ 暂 SVG 回退 | ⚠ MDX 写组件 |
| 内置搜索 | Algolia / 本地 | Pagefind / Algolia | ✅ Pagefind 零配置 | Pagefind 构建期 |
| 版本切换 | ✅ 原生 | ❌ 手工 | ✅ Versions 插件 | ❌ 手工 |
| 冷启 / 构建 | 5-15s | <1s | <1s | 2-5s |
| Bundle 大小 | 150-200KB | 40-60KB | 35-50KB | 80-120KB |
| Agent 编辑友好度 | ✅ | ✅ | ✅ | ❌ |

选 Starlight 的理由：

- **纯 Markdown 优先**：所有页面以 `.md` 编辑，agent 不需要懂 Astro 语法即可改文档。
- **i18n 一等公民**：`src/content/docs/zh/` + `src/content/docs/en/`，开箱即用的语言切换器 + 中文 UI 字符串。
- **构建快**：冷启 <500ms，对频繁内容迭代友好。
- **Astro 生态向上**：2026 年 weekly 200k+ download；社区版本插件成熟到能上生产。
- **Cloudflare 部署亲和**：APAC 边缘节点强，对中文读者首屏快。
- **Mermaid 暂时缺失**：用 SVG 内嵌（`![alt](diagram.svg)`）回退；社区已请求原生支持，预计 6 个月内补齐；不阻塞 launch。

### 2. 部署：Cloudflare Pages

- 免费层够用（unlimited bandwidth、500 builds / 月）。
- APAC 边缘节点（上海 / 新加坡 / 东京）—— 中文读者首屏快。
- GitHub 集成自动 PR preview deploy。
- 备选 Vercel：同等可行，未来若引入互动组件再考虑切换；当前 Cloudflare 胜。

### 3. 搜索：Pagefind（零配置本地搜索）

- 构建期生成搜索索引；运行时 0 后端。
- 适合 <1000 篇文档的规模。
- 如果未来想升级到 Algolia DocSearch（OSS 免费），切换成本低。

### 4. 版本切换：Starlight Versions 插件

- v1（M1-M3 之前）发布前不开 versioning，主分支直发。
- v1 发布后激活 Versions 插件，存档 v1 文档目录。
- v2 在新顶层目录写。读者通过站点版本切换器查阅历史。

### 5. 站点目录结构（重要）

```
custom-agent-docs/
├─ astro.config.mjs              # Starlight 配置入口
├─ src/
│  ├─ content/
│  │  ├─ config.ts               # content collection schema
│  │  └─ docs/
│  │     ├─ zh/                  # ← 中文为主
│  │     │  ├─ index.md          # 首页
│  │     │  ├─ getting-started/
│  │     │  │  ├─ quickstart.md
│  │     │  │  ├─ project-structure.md
│  │     │  │  └─ first-test.md
│  │     │  ├─ foundations/
│  │     │  │  ├─ why-event-sourced.md
│  │     │  │  ├─ design-principles.md
│  │     │  │  ├─ architecture-overview.md
│  │     │  │  ├─ turn-lifecycle.md
│  │     │  │  └─ threat-model.md
│  │     │  ├─ implementation/
│  │     │  │  ├─ from-zero.md         # 教程：从空仓到第一个 turn
│  │     │  │  ├─ core-layer.md
│  │     │  │  ├─ model-gateway.md
│  │     │  │  ├─ tools-and-permissions.md
│  │     │  │  ├─ storage-and-replay.md
│  │     │  │  ├─ context-and-memory.md
│  │     │  │  ├─ skills.md
│  │     │  │  ├─ mcp.md
│  │     │  │  └─ client-adapters.md
│  │     │  ├─ reference/
│  │     │  │  ├─ event-schema.md
│  │     │  │  ├─ capability-model.md
│  │     │  │  ├─ adr-index.md
│  │     │  │  ├─ glossary.md
│  │     │  │  ├─ faq.md
│  │     │  │  └─ architecture-checklist.md
│  │     │  ├─ governance/
│  │     │  │  ├─ roadmap.md
│  │     │  │  ├─ roadmap-status.md
│  │     │  │  ├─ backlog.md
│  │     │  │  ├─ quality-and-ci.md
│  │     │  │  └─ pr-module.md
│  │     │  ├─ advanced/
│  │     │  │  ├─ remote-execution.md
│  │     │  │  ├─ plugin-system.md
│  │     │  │  └─ automation.md
│  │     │  └─ adr/
│  │     │     ├─ 0001-core-boundary.md
│  │     │     ├─ 0002-future-capability-reservation.md
│  │     │     ├─ 0003-architecture-audit-clarifications.md
│  │     │     ├─ 0004-acp-unified-transport.md
│  │     │     └─ 0005-docs-site-architecture.md (本文)
│  │     └─ en/                  # ← 英文镜像，同结构
│  └─ assets/                    # 图片、SVG diagram
├─ public/                       # 静态资源（favicon 等）
├─ .github/
│  ├─ workflows/
│  │  ├─ docs-lint.yaml          # markdownlint + Vale
│  │  ├─ docs-build.yaml         # Starlight build 验证
│  │  ├─ docs-link-check.yaml    # 周期 cron：外链巡检
│  │  └─ docs-ref-check.yaml     # 自研：handbook 引用 custom-agent 函数是否仍存在
│  └─ styles/                    # Vale 自定义 style pack
├─ scripts/
│  └─ validate-handbook-refs.mjs # ref checker 实现
├─ .markdownlint.yaml
├─ .vale.ini
└─ package.json
```

**关键点**：

- **当前 `docs/zh/` 不会一次性物理迁移**到 `src/content/docs/zh/`。迁移工作量大且会撕碎正在进行的 PR；采用 **"先放一层 redirect / symlink，等 site 框架稳定再分批移文件"** 的过渡策略。
- governance（roadmap / status / backlog / quality / PR Module）和 handbook 在站点上是 **并列顶级章节**，两者都对外公开 —— 满足"既能作为 agent 技术解析、也能作为 agent 实现方案解析"的需求。
- adr 单独成为顶级章节，便于交叉引用（ADR-0001 ~ 0005）。

### 6. CI/CD 流水线

`custom-agent-docs/.github/workflows/`：

| Workflow | 触发 | 内容 |
|---|---|---|
| `docs-build.yaml` | push / PR | `npm ci && npm run build`；失败阻断 |
| `docs-lint.yaml` | push / PR | `markdownlint` + Vale prose 检查 |
| `docs-ref-check.yaml` | PR | 自研 script：扫 handbook 中代码引用 (`packages/core/...:Foo`)，clone custom-agent main 校验目标真实存在；缺失则 fail |
| `docs-link-check.yaml` | 每周 cron | `markdown-link-check` 对外链；坏链开 issue（不阻 PR） |
| Cloudflare Pages PR preview | PR 自动 | 每个 PR 一个唯一 preview URL，评论里贴出 |

**docs-ref-check 是新引入的关键 CI**：解决"handbook 写了 `runTurn(...)` 但代码已重命名"的 drift 问题。脚本逻辑：

1. 用 regex 扫 `src/content/docs/**/*.md` 提取代码引用（自定义 syntax，如 `@ref(packages/core/src/session-engine.ts:SessionEngine.runTurn)`）。
2. clone or fetch `custom-agent` main HEAD。
3. 静态分析（grep / TypeScript AST 简单查找）确认引用目标存在。
4. 任何 missing ref 在 PR 上输出 inline 注释 + fail check。

### 7. 写作风格 / Vale

- 基线套用 Google Developer Documentation Style 子集。
- 自定义增量规则：
  - 禁用"显然"、"轻松"等贬低读者难度的副词。
  - 中英文混排规则：英文术语首次出现注中文，之后纯英文。
  - 必须给出代码示例的章节（`implementation/*`、`reference/event-schema`）—— 若无 code block 报警。

## 实施分阶段

### Phase 1（本 ADR push 后立即可做）

- 在 docs 仓库根加 `.tool-versions` / `package.json` / `astro.config.mjs` 骨架。
- 把 ADR、roadmap、backlog 等放进对应 governance / adr 章节。
- handbook 关键新章节（INTRO / GLOSSARY / turn-lifecycle / adr-index）就位。
- 暂不强制移动现有 `docs/zh/handbook/layers/*.md`，先在新结构里以 frontmatter `redirect` 软引用。

### Phase 2（下一个工作循环）

- 部署 Cloudflare Pages 项目，绑定 GitHub repo。
- CI 三件套（lint / build / link-check）落地。
- 完成中文首页 + 顶级导航文案。
- 对外公布 staging URL（不上 prod 域名）。

### Phase 3（M1 完结后）

- 物理迁移所有 `docs/zh/handbook/layers/*.md` 到 `src/content/docs/zh/implementation/`。
- 启动 `docs-ref-check.yaml`，开始守护 handbook ↔ 代码一致性。
- 启用 prod 域名（如 `agent.dev.cn` 或类似）。
- 启动英文 mirror 工作（M3 之前完成 INTRO + GLOSSARY 英文）。

### Phase 4（v1 发布之后）

- 启用 Starlight Versions，存档 v1，开始 v2 写作。

## 验收

- Phase 1 完成意味着：本 ADR + 关键新 handbook 章节都在 main 上；Astro 项目能本地 build 出空架子；CI build 通过。
- Phase 2 完成意味着：staging 站点可访问；PR 自动 preview 链接生效。
- Phase 3 完成意味着：handbook 全部在 site 中渲染；ref-check CI 守护。
- Phase 4 完成意味着：multi-version 切换可用。

## 不做的事

- 不引入互动 playground（M9+ 再评估）。
- 不引入登录 / 用户系统 / 评论系统（用 GitHub Discussions 即可）。
- 不引入 AI 问答助手（避免内容飘移；将来要做也用独立子站）。
- 不切换默认中文为英文（中文是 canonical，英文 follow）。
