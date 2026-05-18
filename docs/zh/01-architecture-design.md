---
title: "架构设计"
---

## 设计目标

构建一个 local-first AI coding agent。核心能力沉在可复用 agent core 中，Web、CLI、TUI、IDE、ACP、channel client 都只是 adapter。

Core 负责 agent 行为。Client 只负责展示、输入、权限交互、diff 展示和协议映射。

## 项目主线

> 构建一个 local-first、event-sourced 的 agent core，并用严格 adapter 隔离 models、tools、memory、skills、protocols 和 clients。

这是所有 roadmap、代码评审和 AI-assisted 开发的架构锚点。

## 系统形态

```text
apps/
  web-client
  cli
  acp-server

packages/
  core
  schema
  model-gateway
  tool-router
  local-tools
  mcp-client
  memory
  skills
  permissions
  storage
  telemetry
```

## 运行流程

```text
Client
  -> AgentHost API
  -> SessionEngine
  -> ContextBuilder
  -> ModelGateway
  -> ToolRouter
  -> PermissionEngine
  -> ToolExecutor
  -> EventLog
  -> Client event stream
```

事件流是产品骨架。Client 断开后可以通过 event log 重建 session。

## 事件模型

事件 schema 必须稳定、版本化，并以 JSONL 形式持久化。

最小事件类型：

- `session.created`
- `turn.started`
- `user.message`
- `context.built`
- `model.requested`
- `model.delta`
- `model.tool_call_requested`
- `permission.requested`
- `permission.resolved`
- `tool.started`
- `tool.delta`
- `tool.completed`
- `tool.failed`
- `memory.candidate_created`
- `skill.loaded`
- `turn.completed`
- `turn.failed`
- `session.compacted`

## 核心包职责

### `schema`

统一管理公共 TypeScript/Zod schema：

- Event schema。
- Tool schema。
- Session schema。
- Permission request schema。
- Provider normalized stream schema。
- MCP server config schema。

任何包都不能复制一份临时 contract。

### `core`

负责 `SessionEngine`、turn state machine、cancellation、compaction trigger 和 orchestration。

禁止依赖：

- Web UI。
- CLI UI。
- ACP server。
- Provider SDK。
- MCP transport implementation。

Core 只通过 port/interface 与外部通信。

### `model-gateway`

负责 provider adapter：

- OpenAI Responses。
- Anthropic Messages。
- Gemini。
- OpenAI-compatible provider，例如 Qwen、DashScope、OpenRouter。

Provider 输出统一规范化为 core stream events。Provider-specific metadata 可以放到 `_meta`，但 core 不能基于 provider 原始 payload 写分支逻辑。

### `tool-router`

负责工具发现、命名空间、可用性判断和调用路由。

工具来源：

- Built-in local tools。
- MCP tools。
- Skill-provided scripts。
- Future remote tools。

Router 不直接执行工具。它必须先请求 `PermissionEngine`，再交给 executor。

### `permissions`

负责审批和策略决策。

输入：

- Tool name。
- Arguments。
- CWD。
- Session mode。
- Source：model、user、skill、MCP prompt。
- Risk classification。

输出：

- Allow。
- Deny。
- Ask user。
- Ask client via ACP。

### `mcp-client`

负责 MCP server 生命周期：

- 启动 stdio server。
- 连接 Streamable HTTP server。
- Initialize。
- Discover tools/resources/prompts。
- Call tools。
- Read resources。
- Health、timeout、shutdown。

MCP tools 默认不可信，必须经过权限系统。

### `memory`

负责 context files 和 durable memory。

层次：

1. Global user instructions。
2. Project instructions。
3. Directory-scoped instructions。
4. Reviewed project memory。
5. Reviewed user memory。
6. Auto-memory candidates。

自动 memory 先生成候选 diff，不能直接写入持久 memory。

### `skills`

负责 skill discovery 和 lazy loading。

Skill 是一个包含 `SKILL.md` 的目录。

启动时只加载 metadata：

- Name。
- Description。
- Trigger。
- Allowed tools。

完整 skill body 只在用户命令、模型选择或 router heuristic 命中时加载。

### `storage`

负责：

- Session JSONL。
- SQLite indexes。
- Artifact files。
- Transcript replay。
- Compaction summaries。

Append-only event log 是事实来源。SQLite 只是索引，不是事实来源。

### `telemetry`

负责本地可观测性：

- Token usage。
- Latency。
- Tool duration。
- Permission decision counts。
- Error categories。
- Regression scenario result history。

Telemetry 默认 local-first，远端导出必须 opt-in。

## Client Adapters

### Web Client

第一优先级 client，也是测试和回归面。

职责：

- Session list。
- Event timeline。
- Transcript view。
- Tool call inspector。
- Permission approval panel。
- Diff viewer。
- Scenario runner。
- Replay viewer。

### CLI

CLI 是薄 wrapper，调用同一套 host API。

职责：

- Prompt input。
- Stream output。
- Approval prompts。
- Slash commands。
- Non-interactive mode。

### ACP Server

ACP 是 protocol adapter，不拥有业务逻辑。

职责：

- JSON-RPC transport。
- ACP method mapping。
- Session lifecycle。
- Permission forwarding。
- Core event 到 `session/update` 的映射。

## 配置模型

采用分层配置：

1. Built-in defaults。
2. System config。
3. User config。
4. Project config。
5. Environment variables。
6. CLI flags 或 client-provided session config。

配置必须启动时校验，并能在 Web client 中查看。

## MVP 范围与架构预留

以下能力不在 MVP 主实现中交付，但不能被架构堵死。MVP 阶段需要预留稳定边界，避免后续补能力时重写 core。

### MVP 不交付，但必须预留

- Remote control / remote execution。
  - MVP 不实现云端 workspace 和远程执行平面。
  - 但 `SessionEngine`、event stream、permission flow、artifact storage、client adapters 必须支持未来 remote runner。
  - 远程控制必须复用同一套 event log、permission events 和 replay contract。
- Plugin and extension system。
  - MVP 不做插件市场。
  - 但 provider、skills、MCP servers、local tools、client adapters 都必须按 registry/adapter 方式扩展。
  - 后续插件不能绕过 `PermissionEngine`、schema contracts 或 mainline rules。
- Mobile client and remote-control client。
  - MVP 不做移动端。
  - 但移动端应被视为 remote-control client，而不是新的 agent core。
  - 移动端只消费 session/event/permission API，不拥有 agent orchestration。
- Scheduled/background automations。
  - MVP 不做定时任务。
  - 但 session trigger、job policy、permission review、audit log 应预留后台运行语义。
  - 自动任务不能静默执行高风险 tool，也不能绕过用户授权策略。
- Product-level multi-agent orchestration。
  - MVP 不做产品内多 agent 团队协作。
  - 但当前项目开发过程允许多个开发 agent 并行，这是 repo governance 层能力，不等于产品 runtime multi-agent。
  - 后续如加入产品内 multi-agent，必须复用 event log、session graph 和 permission model。

### 明确延后研究

- Vector-store memory。
  - 暂时延后。
  - MVP 采用可审计、可 diff、可回滚的 Markdown/reviewed memory。
  - 后续是否加入 vector memory 取决于检索质量、隐私、安全和可解释性评估。
- Self-modifying system prompts。
  - 暂时延后。
  - 不允许 agent 静默自改系统提示词或核心策略。
  - 后续如果探索自进化 agent，必须先设计 proposal/review/apply/rollback 流程，并通过 ADR。

## 架构 Fitness Rules

- `core` 不能 import `apps/*`。
- `core` 不能 import provider SDK。
- `core` 不能直接 import MCP transport code。
- Tool call 不能绕过 permission decision。
- Session state 必须能从 JSONL 重建。
- 新 public event 必须有 schema、fixture、replay test 和文档。
- 每个 roadmap phase 结束时必须有 Web regression scenario。
