# Handbook 重构与文档站施工计划

> 本文档配套 [[adr-0005]]。Phase 1 已由 2026-05-18 audit commit 完成；Phase 2-4 待下一轮工作循环逐步落地。

## 当前执行状态总览

| Phase | 本轮状态 |
|---|---|
| Phase 1 决策 + 新章节 | ✅ 上一轮完成 |
| Phase 2 站点脚手架 | ✅ 本轮完成（待 maintainer 绑 Cloudflare） |
| Phase 3 内容物理迁移 + drift CI | 待 M1 完结后 |
| Phase 4 P0 重写（3 章） | ✅ 本轮完成（tools-and-permissions / context / memory / from-zero） |
| Phase 4 P1-P2 重写（7 章） | 待下一轮 |
| Phase 5 多版本 + 英文 mirror | 待 v1 release |

## Phase 1 — 决策落档 + 关键新章节（已完成）

✅ 写完并 push 到 main：

- `adr/0004-acp-unified-transport.md` — ACP 统一 wire 协议
- `adr/0005-docs-site-architecture.md` — Starlight + Cloudflare + Pagefind + Vale
- `handbook/INTRO.md` — 5 分钟 mental model（新手入口）
- `handbook/GLOSSARY.md` — 术语表（化解 `[[adr-NNNN]] T?` / `stopReason` / `compaction` / `lazy loading` 等 forward-reference）
- `handbook/reference/adr-index.md` — ADR 0001-0005 索引 + T1-T5 含义对照
- `handbook/foundations/turn-lifecycle.md` — 一个 turn 的完整可视化
- `02-roadmap.md` M9 拆 9a / 9b / 9c；M8 改名 "ACP Production Hardening"
- `03-roadmap-status.md` 加 M1-ACP-STDIO / M1-ACP-HTTP；M9 拆分；decision log 加 4 条

## Phase 2 — 站点框架就位（✅ 本轮完成）

### 已经 push 的内容

- `package.json` + `astro.config.mjs` + `tsconfig.json` + `src/content.config.ts` 完整 Starlight 项目骨架。
- `src/content.config.ts` 用 `glob({ pattern: '**/*.{md,mdx}', base: './docs' })` loader 读现有 `docs/zh/` + `docs/en/`，**不物理迁移**任何 markdown。
- `.gitignore` / `.markdownlint.json` / 默认 prettier 不需要（站点不强制 prose linter 这一 phase）。
- `.github/workflows/docs-build.yaml` — npm ci → markdownlint → astro check → astro build；PR 阻断。
- `.github/workflows/docs-link-check.yaml` — 每周一 cron + 手动触发；外链坏链开 issue 但不阻 PR。
- `docs/zh/index.md` Splash 首页 + `docs/en/index.md` English 占位。
- `SITE-SETUP.md` 给 maintainer 的部署 + Cloudflare Pages 绑定步骤。

### 待 maintainer 一次性人工操作（不能自动化）

1. 在 Cloudflare Pages 控制台创建项目，绑定 GitHub repo（见 `SITE-SETUP.md`）。
2. 选定 prod 域名后，把 `astro.config.mjs` 的 `site:` 字段同步过去。
3. 验证 PR auto-preview 工作。

### 待原 Phase 2 计划但本轮没做（推到下一轮）

- Pagefind 搜索集成（Starlight 0.30+ 默认含有，但需要 verify build 后 `/_pagefind/` 资源生成）。
- 中文 → 英文导航切换 UI 字符串确认（Starlight 内置 i18n，但需要 build 后看视觉效果）。
- Cloudflare Pages 域名 + 自定义域名 + HTTPS 证书。
- 构建时间 benchmark（目标 < 30s）。

## Phase 3 — 内容物理迁移 + drift CI（M1 完结后）

任务：

1. 物理迁移 `docs/zh/handbook/layers/*.md` → `src/content/docs/zh/implementation/`。
2. 物理迁移 `docs/zh/adr/*.md` → `src/content/docs/zh/adr/`。
3. 物理迁移 governance 文件（roadmap / status / backlog / quality / PR module）到 `governance/`。
4. **关键 CI**：`docs-ref-check.yaml` —— 自研 script 扫 handbook 里的代码引用，clone `custom-agent` main 验证存在；失败阻 PR。
5. `docs-lint.yaml`：markdownlint + Vale；自定义 style pack 在 `.github/styles/Custom/`。
6. `docs-link-check.yaml` weekly cron。
7. 启用 prod 域名（待定，建议 `agent.dev.cn` 或类似）。

验收：handbook 全部在 site 上正确渲染；ref-check CI 在 PR 上守护；prod 域名访问正常。

## Phase 4 — 大规模内容重写（与 Phase 3 并行）

按 A2 audit 评分（1-5 分），优先重写得分 ≤ 2 的章节。

### ✅ P0 已完成（本轮）

| 章节 | 当前评分 | 落地 |
|---|---|---|
| `implementation/tools-and-permissions.md`（重写自 `layers/tool-permission.md`，2/5） | ✅ | 加权限决策树 + 完整事件链 worked example + 风险分类 rationale + 6 类常见误区 + prompt injection 防御 |
| `implementation/context.md` + `implementation/memory.md`（拆自 `layers/memory-context.md`，2/5） | ✅ | 拆成两章：context（per-turn 拼装）+ memory（跨-turn 持久化 + candidate workflow）；各自独立的测试策略、误区表 |
| `implementation/from-zero.md`（重写自 `tutorials/build-agent-from-zero.md`，4/5 但缺代码）| ✅ | 11 个 Step 含 TypeScript 片段 + checkpoint 测试代码 + 指向 `custom-agent` 实际文件的 deep link |

### 待重写（按 P1 / P2 优先级，下一轮逐步推进）
| P1 | `implementation/skills.md`（重写自 `layers/skills.md`）| 2/5 | 加 lazy loading 的"问题→方案"对比 diagram；说明 allowed_tools enforcement |
| P1 | `implementation/mcp.md`（重写自 `layers/mcp.md`）| 2/5 | 加 MCP 新手 overview；加一个 MCP tool 调用通过 PermissionEngine 的完整事件链 |
| P1 | `advanced/` 三章（拆自 `layers/future-capabilities.md`）| 2/5 | 拆成 remote-execution / plugin-system / automation 三个独立页；每页讲清楚"为什么延后 + 延后期间架构如何预留" |
| P2 | `implementation/core-layer.md`（重写自 `layers/agent-core.md`）| 3/5 | 把 TypeScript 类型定义部分移到 `reference/event-schema.md`；保留 narrative + 加 turn 状态机 visual |
| P2 | `implementation/model-gateway.md`（重写自 `layers/model-gateway.md`）| 3/5 | 提前 "why need adapter port" motivation；FakeProvider 后加一个 Anthropic adapter skeleton（M2 阶段补） |
| P2 | `implementation/storage-and-replay.md`（重写自 `layers/session-event-replay.md`）| 3/5 | 加 "why JSONL not DB" narrative；加 tail cache + write queue 内部图 |
| P2 | `implementation/client-adapters.md`（重写自 `layers/client-protocol-adapters.md`）| 3/5 | 按 [[adr-0004]] 重写：协议 = ACP，transport = stdio / Streamable HTTP；移除原三协议表 |

新增内容（按需）：

- `getting-started/quickstart.md` — clone repo → run test → 看 JSONL → 改个测试再跑（已在 [[adr-0005]] §1 列出，待写）
- `getting-started/project-structure.md` — `packages/` / `apps/` 各包职责一览
- `foundations/why-event-sourced.md` — 把"为什么这样设计"的部分从 INTRO 拆出来扩展
- `foundations/design-principles.md` — local-first / event-sourced / auditable / replayable 四原则详谈
- `foundations/threat-model.md` — 攻击面 + 信任域（M9a 落地时写）
- `reference/event-schema.md` — 所有 AgentEvent 类型的 canonical schema 表
- `reference/capability-model.md` — ModelCapabilities + risk taxonomy
- `reference/architecture-checklist.md` — 给 reviewer 用的设计审查清单
- `reference/faq.md` — 10-15 个常见问题
- `advanced/remote-execution.md` / `advanced/plugin-system.md` / `advanced/automation.md`

## Phase 5（v1 release 之后）

- 启用 Starlight Versions，存档 v1，开始 v2 写作。
- 英文 mirror（Phase 3 起逐章对照翻译，但不阻塞中文发布）。
- AI 问答助手 / 互动 playground 等扩展功能（独立子站，避免主站内容飘移）。

## 不在本计划范围

- 互动代码 playground（M9+ 评估）。
- 登录 / 用户系统（用 GitHub Discussions 即可）。
- 内嵌 AI 问答（避免内容飘移）。
- 切换默认中文为英文（中文是 canonical）。

## 工作分配建议

| 类型 | 推荐 owner | 备注 |
|---|---|---|
| Phase 2 项目脚手架 | docs agent（新角色） | 一次性投入；后续主要是内容工作 |
| Phase 3 内容迁移 | docs agent | 大量重复劳动，agent 友好 |
| Phase 4 P0 重写 | 资深 agent / human review | 关键章节，质量门槛高 |
| Phase 4 P1/P2 重写 | docs agent | 可批量推进 |
| docs-ref-check 实现 | tools agent | Node script，独立任务 |
