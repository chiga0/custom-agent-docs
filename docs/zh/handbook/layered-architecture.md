---
title: "分层架构总览"
---

## 为什么 Agent 框架必须分层

一个 coding agent 看起来像“把用户消息发给模型，然后执行工具”，但真实系统很快会变复杂：

- 模型 provider 不同，streaming 和 tool call 格式不同。
- Session 需要恢复、压缩、回放、审计。
- Tools 可能来自本地、MCP、插件、远端 runner。
- 权限必须统一，否则 shell、patch、MCP、skill 会各自开后门。
- Client 形态很多：Web、CLI、IDE、ACP、移动端、channel。
- Memory 和 skills 会影响上下文，如果不可审计，会导致行为漂移。

如果不分层，项目会变成 provider、UI、tool、memory、协议互相交叉引用的泥球。

本项目采用一条主线：

> 构建一个 local-first、event-sourced 的 agent core，并用严格 adapter 隔离 models、tools、memory、skills、protocols 和 clients。

## 核心分层

```text
Client / Protocol Layer
  Web, CLI, TUI, IDE, ACP, Mobile, Channels

Agent Host API
  Thin API around sessions, events, permissions, replay

Agent Core
  SessionEngine, turn state machine, orchestration

Context Layer
  Instructions, memory, skills metadata, MCP resources, compaction

Model Gateway
  Provider adapters, normalized stream events, tool call normalization

Tool Layer
  Tool registry, tool router, local tools, MCP tools, plugin tools

Permission Layer
  Policy, approval, risk classification, audit

Storage Layer
  Event log, indexes, artifacts, replay, snapshots

Observability / Quality
  Telemetry, golden transcripts, Web regression, architecture fitness
```

## 一次 Turn 发生了什么

```text
1. Client sends user prompt
2. AgentHost creates or loads session
3. SessionEngine starts a turn
4. ContextBuilder builds model input
5. ModelGateway streams normalized model events
6. Model requests a tool call
7. ToolRouter resolves the tool
8. PermissionEngine decides allow / deny / ask
9. ToolExecutor runs if allowed
10. Tool result is appended to event log
11. Model continues or finalizes
12. Client renders events
13. Session can be replayed from event log
```

## 事实来源

系统运行时的事实来源不是 UI state，也不是 provider response，而是 append-only event log。

这意味着：

- Client 可以断线重连。
- Web 和 CLI 可以展示同一段 session。
- 测试可以重放 golden transcript。
- 审计可以追踪谁批准了哪个工具。
- 未来 remote execution 可以沿用同一套事件语义。

## 分层边界

### Client 不能拥有 agent 逻辑

Client 只能：

- 发 prompt。
- 渲染 event stream。
- 展示 permission request。
- 展示 diff、timeline、context。
- 调用 session/replay API。

Client 不能：

- 构造 model prompt。
- 直接执行 tool。
- 直接写 event log。
- 直接改变 memory。

### Core 不能知道 provider SDK

Core 只能看到 normalized events：

- `model.delta`
- `model.tool_call_requested`
- `model.completed`
- `model.failed`

Core 不能判断“这是 OpenAI 的字段还是 Anthropic 的字段”。

### Tool 不能绕过 Permission

所有工具，无论来源是 local、MCP、plugin、skill、remote runner，都必须走：

```text
ToolRouter -> PermissionEngine -> ToolExecutor
```

### Memory 必须可审计

Memory 影响长期行为，因此不能静默写入。MVP 阶段采用：

```text
conversation evidence -> memory candidate -> user/reviewer approval -> durable memory
```

## 架构成熟度阶段

### Stage 1：Local Event Core

先实现本地 session、event log、fake model、Web timeline。

目标是证明：

- turn 可以运行。
- event 可以 replay。
- Web 可以观察系统。

### Stage 2：Real Model + Safe Tools

加入 model provider、read/search/shell/patch、permission engine。

目标是证明：

- agent 能完成真实小任务。
- 工具行为可审计。
- 危险动作需要授权。

### Stage 3：Context + Skills + MCP

加入 instruction hierarchy、memory candidates、skills、MCP。

目标是证明：

- 上下文可控。
- 能力可扩展。
- 外部工具不破坏安全边界。

### Stage 4：Protocol + Remote

加入 ACP、remote-control、mobile、automation、plugin registry。

目标是证明：

- core 可以被多种 client 驱动。
- remote 和 local 在 event/replay 层语义一致。

## 设计检查问题

每当新增能力，问：

1. 它属于哪一层？
2. 它的输入输出是什么？
3. 它是否需要新 event？
4. 它是否会执行 tool？
5. 它是否影响 memory/context？
6. 它是否能 replay？
7. Web 是否能观察？
8. 它是否绕过了 adapter 边界？

答不清，就先写 ADR，不要直接实现。
