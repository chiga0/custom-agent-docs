---
title: "ADR 0003: 架构审计澄清（ACP / 通信 / cwd / provider SDK）"
---

# ADR 0003: 架构审计澄清（ACP / 通信 / cwd / provider SDK）

状态：Accepted

日期：2026-05-18

## 背景

M1 阶段（M1-01 已合入 main，M1-02 / M1-03 PR 在审）启动后，外部审计提出了 5 个需要明确的架构问题：

1. ACP 协议是否作为 agent ↔ client 标准协议？目前是否在自研 EventSource？
2. 长会话超出模型 context 上限时如何处理？
3. session 和 cwd 是否严格绑定？是否可中途修改？
4. core 与 client 之间的通信细节如何实现？
5. model provider 是自研还是依赖 `ai-sdk` / `@tanstack/ai` 等成熟包？

本 ADR 给出明确决策，纠正可能的误读。

## 决策

### 1. 内部 `AgentEvent` ≠ 对外通信协议

**事实：** 当前 `packages/core` 和 `packages/storage` 暴露的 `AsyncIterable<AgentEvent>` 是 **进程内抽象**，不是对外 wire 协议。`JsonlEventLog.replay()` 只读本地 JSONL 文件，`SessionEngine.runTurn()` 只是内部 generator。

**决策：** 永远区分两层：

- **内层（不变量）：** `AgentEvent` 是 session 真值，所有 client 看到的都必须是它的等价投影。
- **外层（协议层，按 client 适配）：**
  - **Web ↔ backend：** Server-Sent Events (SSE) over HTTP，由后续 M1-WEB-01 / M1-04 起步规范。
  - **CLI ↔ core：** 进程内调用，无 wire；CLI 把 event 序列化为 ANSI/文本输出。
  - **ACP ↔ core：** **以 Zed Agent Client Protocol 为准** —— JSON-RPC 2.0 over stdio（M8 落地）。core event 通过 `apps/acp-server` 的 mapper 转换为 ACP `session/update` 通知；不允许把 `AgentEvent` 直接外发。

**误读纠正：** 没有自研 EventSource 替代 ACP；目前还没有任何 wire 实现。M1 阶段 web client 渲染 fixture，M1-04 才开始通过 SSE 串起 backend↔web。ACP 是 M8 deliverable，并且坚持 **承接 Zed 规范，不自创协议**。

### 2. Context 超限的失败模式与短期兜底

**事实：** Memory candidate workflow + deterministic compaction 是 M4 设计，M1 阶段不实现。当前 fake provider 上限 8000 token，真正的 provider 在 M2 才接入。

**决策：**

- **M2 接真实 provider 时必须先做** `ModelProvider.preflightCheck(request)` 之类的硬上限检测：估算 prompt tokens + transcript tokens 是否超过 `capabilities.maxContextTokens`。
- **失败模式必须显式化：** 超限时 SessionEngine 不允许直接抛异常给调用方；必须发 `turn.completed { stopReason: "error", payload: { errorCode: "context_overflow" } }`，并把诊断细节落 stderr / telemetry。schema 后续添加 `errorCode` 字段时一起 evolve。
- **M4 deliverable 不变：** 引入 `context.built` event（已记入 schema 演进队列）+ `session.compacted` event；deterministic compaction 触发后才能跑下一个 turn。
- **M2 ~ M4 中间阶段：** 通过 `maxContextTokens` 硬截止 + 提示用户拆 session 兜底，**严禁让模型 API 自己 503/400 然后 hang。**

### 3. Session ↔ cwd 严格绑定，不可中途修改

**事实：** `SessionCreatedEvent.payload.cwd` 在 `createSession` 时写一次；schema 无 `session.cwd_changed` 事件；SessionEngine 无修改 API。

**决策：** **这是 design intent，明确写入 handbook：**

- Session 创建时绑定一个不可变 `cwd`，对应 workspace 根。
- 想换工作目录 → 新建 session。
- 工具（read/write/shell）可访问 cwd 子目录的相对路径，但 SessionEngine 不维护 "current directory" 漫游状态。
- 同业实践一致：Claude Code / Cursor / Aider 都是 session-per-workspace。

**好处：** replay 决定性（cwd 不变 = 工具调用路径稳定）；session index 行不需要分裂；权限/审计简单。

**取舍：** 用户多 repo 工作流稍麻烦（需要多个 session）。可接受。

### 4. 通信细节的实现路径

**事实：** 目前没有 wire-level 实现。`apps/web-client` 渲染静态 fixture；`apps/acp-server` 是空 stub；`apps/cli` 仅占位。

**决策（实现节奏）：**

- **M1-04 Replay API**（已规划，未开工）作为 **第一个真实 wire moment**：HTTP `GET /sessions/:id/replay` 返回 JSON 数组；`GET /sessions/:id/live` 返回 SSE 流。Web 客户端通过 fetch + EventSource 消费。这一 PR 起，wire 协议正式存在。
- **不引入 WebSocket 作为第一选择：** SSE 单向流足够，重连语义简单，浏览器原生支持；如果后续需要双向，再升级。
- **CLI**：进程内调用 `SessionEngine.runTurn`，按事件序列化为 ANSI；不通过 HTTP。
- **ACP**：JSON-RPC over stdio per Zed 规范；event → `session/update` notification 的映射逻辑住在 `apps/acp-server/src/event-mapper.ts`（M8）。

### 5. Model Provider 策略：自研 port，包装官方 SDK

**事实：** `ModelProvider` interface 在 M1-03 落地（`packages/core/src/ports/model-provider.ts`），只是 port 定义，不强制选择实现方式。

**决策：** **不直接依赖 `ai-sdk` / `@tanstack/ai` 作为顶层抽象；** 改采用三层结构：

- **自研 port：** `ModelProvider` (streaming + capabilities + AbortSignal) 留在 core。
- **adapter 内部使用厂商官方 SDK：** `@anthropic-ai/sdk` / `openai` / `@google/genai` 等 —— 不重新发明 HTTP / 重试 / 流式 chunk 解析。
- **不引入 `ai-sdk` 作为 transport 包装层。** 理由：
  - `ai-sdk` 的事件模型对 capability / 工具调用做了自己的抽象，与本项目"event-sourced + permission-engine-gated"的硬约束不完全契合。
  - 引入它意味着把 mainline event 模型间接绑定到 Vercel 的版本节奏。
  - 厂商官方 SDK 已经覆盖 SSE 流、retry、错误正常化等"管子"工作；不需要再加一层。

**例外可豁免：** 如果将来发现某个 provider 没有官方 SDK 且 `ai-sdk` 覆盖了它（罕见），可以在 **单个 adapter 内部** 引用 `ai-sdk`，但 core 仍然只依赖 port。

## 影响

- 新增 wire-protocol 设计要求：M1-04 起步实现 SSE；ACP 锁定 Zed 规范。
- `02-roadmap.md` / `07-implementation-backlog.md` 不需要变动 milestone 顺序，但 M2-01 deliverable 需补 "context overflow preflight" 项。
- handbook layer 文档同步细化：cwd 不可变、context 兜底、wire 协议归属。
- 不引入 `ai-sdk` 依赖；M2 adapter 直接用厂商 SDK。

## 后续工作

- M1-04 落 SSE replay/live 端点；同时定义 `apps/web-client` ↔ backend 的最小 wire 契约 + 契约测试。
- M2-01 PR 必须包含 "context overflow preflight" 测试，并把 `errorCode` 字段加入 schema evolution。
- 编辑 `handbook/layers/agent-core.md` 添加 cwd 不可变；`memory-context.md` 写明 M2~M4 兜底；`client-protocol-adapters.md` 写明 wire 归属；`model-gateway.md` 写明 SDK 选型。
- 多 agent 协作的 task-claim / reviewer-routing 规则在另一份 governance 更新中处理（不属于本 ADR）。
