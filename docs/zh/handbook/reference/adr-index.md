# ADR 索引

所有 Architecture Decision Records 的目录。其他文档中以 `[[adr-NNNN]]` 引用本表的某个条目。

---

## ADR 0001：Core 边界与 Event-Sourced 架构

**状态**：Accepted | **日期**：2026-05-17 | **文件**：[adr/0001-core-boundary.md](../../adr/0001-core-boundary.md)

锁定 core 的职责（session 编排、turn 状态机、event 发射、replay 语义）与禁区（不依赖 Web/CLI/ACP/provider SDK/MCP transport）。所有后续 ADR 都建立在这条边界上。

---

## ADR 0002：MVP 后能力的架构预留

**状态**：Accepted | **日期**：2026-05-17 | **文件**：[adr/0002-future-capability-reservation.md](../../adr/0002-future-capability-reservation.md)

把"现在不做"的能力拆成两类：

- **预留**：remote execution / plugin registry / mobile remote-control / scheduled automations / 产品级 multi-agent
- **延后研究**：vector memory / self-modifying system prompts

前者必须复用 session event stream / permission events / artifact model / replay contract；后者不进 MVP。

---

## ADR 0003：架构审计澄清

**状态**：Accepted | **日期**：2026-05-18 | **文件**：[adr/0003-architecture-audit-clarifications.md](../../adr/0003-architecture-audit-clarifications.md)

回应外部审计 5 个问题，落定 5 项决策。本 ADR 内的"T1-T5"含义对照表（被其他 handbook 文档引用）：

| 引用 | 主题 | 决策摘要 |
|---|---|---|
| `[[adr-0003]] T1` | ACP / 内部 AsyncIterable / wire 协议归属 | **已被 ADR-0004 替代**——参见 ADR-0004，不再保留三协议表 |
| `[[adr-0003]] T2` | context overflow 失败模式 | M2 接真 provider 前必须 preflight；超限发 `turn.completed(stopReason=error, errorCode=context_overflow)`，禁止让模型 API 自身 hang |
| `[[adr-0003]] T3` | session ↔ cwd 严格绑定 | `session.cwd` 创建后不可变；想换目录就新建 session；同业实践一致 |
| `[[adr-0003]] T4` | client-core 通信细节 | **已被 ADR-0004 替代**——M1-04 起 wire 直接走 ACP Streamable HTTP |
| `[[adr-0003]] T5` | Model Provider SDK 策略 | 自研 `ModelProvider` port；adapter 内部用厂商**官方 SDK**；不引入 `ai-sdk` / `@tanstack/ai` 作顶层抽象 |

⚠️ **T1 / T4 已被 [[adr-0004]] 取代**。其他 handbook 文档里的旧引用应迁移到 `[[adr-0004]] §<节号>`。

---

## ADR 0004：ACP 作为统一 client-core 协议，stdio + Streamable HTTP 双 transport

**状态**：Accepted | **日期**：2026-05-18 | **文件**：[adr/0004-acp-unified-transport.md](../../adr/0004-acp-unified-transport.md)

修订 ADR-0003 §T1 / §T4。核心：

| 引用 | 主题 | 决策摘要 |
|---|---|---|
| `[[adr-0004]] §1` | 唯一协议 = ACP | 所有 core ↔ client 都用 Zed ACP JSON-RPC；`AgentEvent` 经 mapper 翻成 `session/update` |
| `[[adr-0004]] §2` | 两种 transport | **stdio**（Zed 原生）+ **Streamable HTTP**（项目扩展，命名对齐 MCP） |
| `[[adr-0004]] §3` | 组件层 | `apps/acp-server`（stdio canonical）+ `apps/acp-daemon`（HTTP+SSE 网关，1:1 spawn 子进程） |
| `[[adr-0004]] §4` | CLI / TUI 也走 HTTP | 取消"进程内特殊路径"；远程化场景统一 |
| `[[adr-0004]] §5` | 1 session = 1 acp-server 子进程 | 隔离干净 / crash 半径小 / 对标 LSP per-project |
| `[[adr-0004]] §6` | 修正 ADR-0003 | T1 / T4 作废，其他 T2/T3/T5 仍有效 |

新增 Work item：

- **M1-ACP-STDIO**：实现 `apps/acp-server` 最小 stdio 帧 + ACP session 方法子集
- **M1-ACP-HTTP**：实现 `apps/acp-daemon` + Streamable HTTP transport spec

---

## ADR 0005：docs 仓库升级为公开文档站

**状态**：Accepted | **日期**：2026-05-18 | **文件**：[adr/0005-docs-site-architecture.md](../../adr/0005-docs-site-architecture.md)

把 `custom-agent-docs` 从纯 Markdown 提升为公开学习资源 + 治理真值源的统一文档站。

| 引用 | 主题 | 决策 |
|---|---|---|
| `[[adr-0005]] §1` | 框架 | **Astro Starlight**（纯 Markdown 优先 / 内置 i18n / 快冷启 / 30 KB bundle） |
| `[[adr-0005]] §2` | 部署 | **Cloudflare Pages**（APAC 边缘节点 / 免费层 / 自动 PR preview） |
| `[[adr-0005]] §3` | 搜索 | **Pagefind**（零配置本地搜索） |
| `[[adr-0005]] §4` | 版本 | **Starlight Versions** 插件（v1 发布后启用） |
| `[[adr-0005]] §5` | 目录结构 | `src/content/docs/{zh,en}/{getting-started, foundations, implementation, reference, governance, advanced, adr}/` |
| `[[adr-0005]] §6` | CI 流水线 | docs-build / docs-lint（markdownlint + Vale） / docs-ref-check / weekly link-check / Cloudflare preview |
| `[[adr-0005]] §7` | 写作风格 | Google dev style 子集 + 自定义 Vale rules |

实施分 4 个 phase，phase 1（决策落档 + 关键新章节）由本轮工作完成。

---

## 引用规约

- 文档中引用某个 ADR 的具体决策点：用 `[[adr-NNNN]] §M` 或 `[[adr-NNNN]] §M / 第 X 段`。
- 引用 ADR 整体：用 `[[adr-NNNN]]`。
- 旧引用迁移：`[[adr-0003]] T1 / T4` 已弃用，请改为 `[[adr-0004]]`；其他 T2 / T3 / T5 仍正常引用 `[[adr-0003]]`。

新 ADR 编写约定：见 [`adr/0001-core-boundary.md`](../../adr/0001-core-boundary.md) 末尾约定（状态、日期、背景、决策、影响、后续工作）。
