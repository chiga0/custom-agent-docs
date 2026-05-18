---
title: "5 分钟读懂 Agent Framework"
---

如果你只想读 1 篇文档就理解整个项目，就读这篇。

读完后你应该能回答：

- 这个 framework 到底解决什么问题？
- 为什么选 "event-sourced + local-first"？
- 一个 turn 是怎么发生的？
- 边界为什么这么划分？
- 哪些事情**故意**不做？

---

## 1. 这是什么

一个本地优先（local-first）、**事件溯源（event-sourced）** 的 AI coding agent 框架。

定位类比：你想象一个**像 Claude Code / Cursor / Aider 那样能听懂用户、写代码、跑命令、改文件的 agent**，但：

- 整套 runtime（session、turn、provider 调用、工具执行、权限决策、replay）都跑在你自己机器上；
- 每一个有意义的动作都先写成 event 落盘，再让 client 看到；
- 客户端（Web / CLI / TUI / IDE 等）都是 thin adapter，**没有任何一个 client 能绕过 core 直接执行工具或写存储**。

## 2. 为什么这样设计

三个非协商的设计原则。每条原则都从过去同类系统的真实痛点反推出来。

### 原则 1：所有事实都在 event log 里

**痛点**：传统 chat agent 把状态散在内存、UI buffer、数据库之间；Web 一个状态、CLI 一个状态、调试时只能"猜测"agent 当时看到了什么。

**做法**：所有有意义的动作（`session.created`、`turn.started`、`user.message`、`model.delta`、`tool.executed`、`permission.resolved`、`turn.completed` ...）都写成 `AgentEvent` 追加到 JSONL 文件。**事件先落盘，才让 client 看到。**

**好处**：

- 客户端只是 event log 的投影 → Web / CLI / replay 看到的内容完全一致。
- 删掉所有 client 进程，重启后只读 JSONL 就能恢复所有可见状态。
- 调试 / 审计 / 合规审查直接看 JSONL，不用搭额外的 telemetry。

### 原则 2：所有客户端都是 adapter

**痛点**：把"业务逻辑"散到每个客户端 → Web 改了 cancel 行为，CLI 没跟上 → 实际行为变成"取决于你用哪个壳"。

**做法**：core 不知道 Web / CLI / IDE 长什么样。**统一通过 Agent Client Protocol（ACP）** 与外部通信。ACP 由 Zed 主导定义；项目在 stdio 之上扩展了 Streamable HTTP transport，但**协议本身不私改**。

**好处**：

- 加一个新 client 只需要写 adapter，不需要 fork core。
- Zed / 任意 ACP 兼容 editor 可以直接 spawn `apps/acp-server` 接入。
- 远程化 / mobile 是同一个协议在不同 transport 上跑，不需要造新轮子。

详见 [[adr-0004]]。

### 原则 3：所有 tool 必须过 PermissionEngine

**痛点**：agent 要写文件、跑 shell、调用 MCP server——如果 tool 执行路径有任何一条绕过权限审批，安全模型就破了。

**做法**：每一次工具调用都生成 `permission.requested` 事件 → PermissionEngine 给出 `allow / deny / ask` → 落 `permission.resolved` → 才允许 `tool.started`。**没有例外**。

**好处**：

- 用户能审计每一次危险动作的批准链路。
- 加新的工具类型（local / MCP / skill 内嵌）都自动走同一道闸。
- 出问题时事件链是完整的，能 replay 还原。

## 3. 一个 turn 是怎么发生的（极简版）

### M1 阶段（现状）

只有 model 流式回复，没有工具调用：

```text
User: "hello"
   │
   ▼
SessionEngine.runTurn()                       ← 进入 turn FSM (idle → running)
   │
   ├─→ append turn.started event              ← sequence=2
   ├─→ append user.message event              ← sequence=3
   │
   ├─→ ModelGateway.stream(request)
   │   ├─→ yield text_delta "hi"
   │   │   └─→ append model.delta event       ← sequence=4
   │   ├─→ yield text_delta " there"
   │   │   └─→ append model.delta event       ← sequence=5
   │   └─→ yield completed
   │
   └─→ append turn.completed(stopReason=final) ← sequence=6
       │
       ▼
   AsyncIterable<AgentEvent> 终结
```

### M3 之后（含 tool call 的形态，作为预览）

工具调用 + 权限审批，事件链更长。**注意：M1 阶段不会出现以下任何 tool / permission 事件**——只有当 M3 PermissionEngine + ToolRouter 落地后才会。

完整 M3 时序见 [foundations/turn-lifecycle](foundations/turn-lifecycle.md) §3。

完整的 turn 状态机 / 事件顺序见 [foundations/turn-lifecycle](foundations/turn-lifecycle.md)。

## 4. 六个核心层（先记名字，再按需深入）

| 层 | 干什么 | 关键产出 |
|---|---|---|
| **Core**（`packages/core`）| Turn 状态机、Session 编排、Event 发射 | `SessionEngine`、`AgentEvent` |
| **Context & Memory**（M4） | 把 instructions / transcript / memory / tool schemas 拼成 model request | `ContextBuilder`、`context.built` event |
| **Model Gateway**（M2） | provider 适配；隔离 OpenAI / Anthropic / Google 等差异 | `ModelProvider` port + adapter |
| **Tools & Permissions**（M3） | 路由 + 风险评估 + 批准；本地工具 + MCP 工具 | `ToolRouter`、`PermissionEngine`、`ToolExecutor` |
| **Storage**（`packages/storage`）| JSONL append-only log + SQLite session index | `JsonlEventLog`、`SessionIndex` |
| **Clients / Protocol Adapters**（M8 之前） | Web / CLI / TUI / Zed-ACP 适配 | `apps/acp-server`、`apps/acp-daemon`、`apps/web-client`、`apps/cli` |

详细职责见各章 `implementation/` 文档。

## 5. 故意不做的事

| 故意不做 | 为什么 | 见 |
|---|---|---|
| Vector memory | 检索不可解释、隐私边界差、记忆错误难回滚 | [[adr-0002]] |
| 自修改 system prompt | 安全模型还不成熟，缺 proposal/review/rollback | [[adr-0002]] |
| 多 agent 业务编排 | M9 之前不引入；先把单 agent runtime 跑稳 | [[adr-0002]] |
| 私有 wire 协议 | 用 ACP 统一；不在 web / CLI 上自创 SSE | [[adr-0004]] |
| 包装 `ai-sdk` / `@tanstack/ai` | adapter 直接用厂商官方 SDK；不引第三方抽象 | [[adr-0003]] |

## 6. 推荐阅读路径

| 你是… | 推荐顺序 |
|---|---|
| **想 1 小时通览** | 这篇 → [foundations/turn-lifecycle](foundations/turn-lifecycle.md) → [GLOSSARY](GLOSSARY.md) → [reference/adr-index](reference/adr-index.md) |
| **想从零实现** | 这篇 → [getting-started/quickstart](getting-started/quickstart.md) → 现有 [tutorials/build-agent-from-zero](tutorials/build-agent-from-zero.md)（Phase 4 重写中）→ 各层 layers/ 文档 |
| **想做架构 review** | 这篇 → [`adr/0001-core-boundary`](../adr/0001-core-boundary.md) → [`adr/0003`](../adr/0003-architecture-audit-clarifications.md) → [`adr/0004`](../adr/0004-acp-unified-transport.md) → [layered-architecture](layered-architecture.md) §design-check-questions |
| **想看治理 / 流程** | [03-roadmap-status](../03-roadmap-status.md) → [AGENTS.md (PR Module)](https://github.com/chiga0/custom-agent/blob/main/AGENTS.md) → [04-quality-ci-test-strategy](../04-quality-ci-test-strategy.md) |

## 7. 此时此刻项目走到哪了

| 阶段 | 状态 |
|---|---|
| M0 基础骨架 | DONE |
| M1 事件溯源 session core | 进行中（M1-01 merged；M1-02 / M1-03 PR open） |
| M2+ model gateway / tools / memory / MCP | 等 M1 完结 |
| 文档站点（本仓库 docs site） | Phase 1 — 决策已落档 [[adr-0005]] |

最新版本可看 [`03-roadmap-status.md`](../03-roadmap-status.md) §5（当前活跃工作）和 §7（M1 工作项）。

---

读到这里，你已经具备开始 [getting-started/quickstart.md](getting-started/quickstart.md) 的所有上下文。后面每一篇都假设你已经理解了这 5 分钟概览。
