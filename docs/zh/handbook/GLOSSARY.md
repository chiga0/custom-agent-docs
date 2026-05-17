# 术语表（Glossary）

按字母 / 拼音排序。每条解释力求 2-3 句说清"是什么 + 为什么这样"，并指向更详细的文档。

---

## A

### ACP（Agent Client Protocol）

由 Zed 主导的开放协议，定义 agent core 与外部 client 之间的 JSON-RPC 消息。本项目把它作为**唯一**的对外通信协议（stdio 由 Zed 原生定义，HTTP+SSE 由本项目以"Streamable HTTP transport"扩展），详见 [[adr-0004]]。

### AgentEvent

JSONL event log 中的一条记录。Schema 定义在 `packages/schema`，固定字段：`id / schemaVersion / sessionId / turnId? / sequence / timestamp / type / payload`。**事件先落盘再外发**，是 session 的事实真值。

### AsyncIterable<AgentEvent>

`SessionEngine.runTurn()` 与 `JsonlEventLog.replay()` 的内部返回类型。**进程内抽象，不是 wire 协议**——所有外部 client 通过 ACP 看到事件，不直接消费 AsyncIterable。

## C

### capability model

`ModelProvider.capabilities` 上的布尔/数值字段集合：`streaming`、`toolCall`、`parallelToolCall`、`reasoning`、`maxContextTokens` 等。Core 不 `if provider.id === "openai"` 做判断；改读 capability 做能力决策。

### compaction

对 session 历史事件做摘要折叠 + 写一条 `session.compacted` event 记录被折叠范围。**原始事件不删除**，只是后续 turn 在装 context 时改读 compaction summary。M4 引入。

### context.built event

每次构建 model request 都要发的事件，payload 含 budget breakdown（指令多少 token、transcript 多少 token 等）。M4 引入。

### conflict domain

`03-roadmap-status.md §11` 定义的并行边界：`schema-events / core-session / storage-log / storage-index / web-timeline / permissions / docs-roadmap / ci-quality`。**同一域同时不允许两个 PR 进行中**。

### cwd 绑定

session 创建时把 `cwd: string` 写入 `session.created` 事件载荷，**之后不可变**。想换工作目录就新建 session。同业（Claude Code / Cursor / Aider）一致。详见 [[adr-0003]] T3。

## D

### daemon（`apps/acp-daemon`）

HTTP+SSE 网关进程：监听端口，接收 ACP Streamable HTTP 请求，按 session 1:1 spawn 一个 `acp-server` 子进程做 stdio 转发。详见 [[adr-0004]] §3。

## E

### EventLogDecodeError / EventLogSequenceError

`JsonlEventLog` 在读 / 写时分别可能抛出的两个错误类。前者表示某行 JSON 解码失败或 schema 校验失败；后者表示 sequence 不严格递增。

### EventStore（port）

`packages/core/src/ports/event-store.ts` 中的接口：`append(sessionId, event)` + `replay(sessionId): AsyncIterable<AgentEvent>`。SessionEngine 只依赖 port，不直接 import JsonlEventLog。

### EventStoreFailure

SessionEngine 在 append 失败时抛出的专门错误类，与 provider 流式错误区分开来。被 `runTurn` 的外层 catch 用 `instanceof` 分流（M1-03 引入）。

## F

### FakeStreamingProvider

`packages/core/src/providers/fake-provider.ts`。实现 `ModelProvider` port 的测试 provider，按 `chunks` 数组依次 yield `text_delta`，遇到 AbortSignal 立即结束。**不写 event log**——只 yield ModelStreamEvent，由 SessionEngine 翻译成 AgentEvent。

## J

### JsonlEventLog

`packages/storage/src/event-log.ts`。append-only JSONL 写入器；带 tail cache、in-process write queue、trailing partial 行容忍。

## L

### lazy-loaded skill

skill metadata（name、description、allowed_tools）在启动时加载；**skill 内容仅在 invocation 时读**，避免 context bloat。M5 引入。

## M

### mainline-guardian

`skills/mainline-guardian/SKILL.md` 定义的 review skill。每个 substantial change 在 merge 前都要跑一次；产出 `Result: PASS | FAIL` + blocking findings。

### MCP（Model Context Protocol）

Anthropic 主导的工具协议，让 agent 通过统一 JSON-RPC 调用外部"MCP server"提供的 tools / resources / prompts。本项目在 M6（stdio）/M7（Streamable HTTP）阶段接入。

### MCP resource

MCP server 暴露的只读数据条目；和 tool 的区别是 **不可执行，且必须用户/policy 显式 include 才会进入 context**，避免一次拉所有资源把 context 撑爆。

### ModelProvider（port）

`packages/core/src/ports/model-provider.ts`。统一 provider 接口：`id / capabilities / stream(request, signal) → AsyncIterable<ModelStreamEvent>`。Core 永不 import 厂商 SDK，所有 import 留在 adapter 里。

### ModelStreamEvent

`ModelProvider.stream` yield 的 normalized 事件，类型：`text_delta / completed / failed`（M1-03 起；后续加 `tool_call_delta`、`tool_call_completed`、`usage` 等）。

## P

### PermissionEngine

`packages/permissions`。所有 tool 执行前必经一道：输入 `(tool, args, risk, cwd, policy)` → 返回 `allow / deny / ask`。M3 引入。

### permission.requested / permission.resolved

权限审批的两条事件：`requested` 在 ToolRouter 发现需要审批时写；`resolved` 在 PermissionEngine（或人工 approve UI）给出结论后写。

## R

### Replay

按 sequence 升序读 JSONL，把事件依次"还原"成 session / turn 视图。两种 replay：

- **state replay**：rebuild session object
- **transcript replay**：抽出 user/assistant 消息生成对话视图

两者必须**确定性**——同样 JSONL 输入产出完全一致。

### Round 2 PASS

`mainline-guardian` review 的第二轮结果。约定：**Round 1 给出 finding；作者修复后作者贴 author response；reviewer 跑 Round 2**。Round 2 PASS + 非作者 reviewer 是 merge 的必要条件。

## S

### Session

container of turns；由一次 `createSession(cwd, client)` 开启，绑定不可变 cwd。schema 见 `packages/schema` 的 `SessionCreatedEvent`。

### session.created event

session lifecycle 的第一条事件，sequence = 1，payload 含 `cwd` + `client` (`"web" | "cli" | "acp" | "test"`)。

### sequence

session 内事件的严格递增整数。从 1（`session.created`）开始；JsonlEventLog 在 read 路径用 `validateEventOrder` 做不变性守护。

### Streamable ACP HTTP

本项目对 Zed ACP 的 transport 扩展：HTTP POST 上行 + SSE 响应下行 + session id header + 断线重连 cursor。**协议（ACP）不动，transport 是项目自定义**。详见 [[adr-0004]] §2。

### stopReason

`turn.completed.payload.stopReason`，取值 `"final" | "cancelled" | "error"`。`cancelled` 涵盖用户取消和 abort signal；`error` 涵盖 provider 失败 + (M2 起) context_overflow 等可恢复错误。

## T

### TurnState (FSM)

`packages/core/src/session-engine.ts` 中的 `TurnFsm`：`idle → running → completed | cancelled | failed`。每次状态转移走 `transition(to, reason)`，记录到 `history`，便于回放/观测。

### Turn

一次 user prompt → final reply 的往返；一个 session 多个 turn，turn 内 sequence 连续递增。`SessionEngine.runTurn` 返回 `AsyncIterable<AgentEvent>`。

## W

### Work ID

`custom-agent-docs/docs/zh/03-roadmap-status.md §7` 表中的标识，如 `M1-01`、`M1-WEB-01`。每个 PR 必须挂一个 Work ID。

### Write Queue（in-process）

`JsonlEventLog` 内部的 `writeQueue: Promise<unknown>` —— 同一实例内的并发 append 通过 `then` 链串行化，消除 TOCTOU 窗口。M1-01 review fix 引入。

---

## 还没列入的术语

- M3 引入：`ToolRouter` / `ToolExecutor` / `risk taxonomy`
- M4 引入：`ContextBuilder` / `instruction hierarchy` / `memory candidate` / `compaction trigger`
- M5 引入：`SKILL.md` / `allowed_tools` / `skill metadata`
- M6/M7 引入：`MCP server` / `resource selection` / `prompt invocation` / `Streamable HTTP MCP`
- M8 升级：`session/load` / `session/update` 的完整 ACP 消息集合

这些条目随对应 milestone 落地时补全。

---

约定：

- 引用其他 ADR：用 `[[adr-NNNN]]` 形如 `[[adr-0003]]`，对应 `reference/adr-index.md` 中的条目。
- 引用代码：用 `packages/<pkg>/src/<file>.ts:<symbol>` 形式。
- 中英混排：术语首次出现给中英文双标（如 "事件溯源（event-sourced）"），后续可纯英文。
