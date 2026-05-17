# Agent Core 层

## 真实作用

Agent Core 是整个系统的行为中枢。它不负责 UI，不负责调用具体模型 SDK，不负责直接执行 shell，也不负责持久化细节。它负责把一次用户请求推进成可审计、可回放的一串状态转移。

核心职责：

- 管理 session 和 turn。
- 调用 ContextBuilder 构建上下文。
- 调用 ModelGateway 获取模型流。
- 识别模型请求的 tool call。
- 调用 ToolRouter 和 PermissionEngine。
- 把所有关键动作写成 events。
- 处理 cancellation、failure、retry、compaction。

## 不应该做什么

Agent Core 不应该：

- import Web/CLI/ACP client。
- import OpenAI/Anthropic/Gemini SDK。
- 直接 spawn MCP server。
- 直接执行 shell。
- 直接读写 memory 文件。
- 直接操作 SQLite。

它只依赖抽象 port：

- `ModelProvider`
- `ContextBuilder`
- `ToolRouter`
- `PermissionEngine`
- `EventStore`
- `Clock`
- `IdGenerator`

## 最小 API

```ts
type SessionEngine = {
  createSession(input: CreateSessionInput): Promise<Session>;
  runTurn(input: RunTurnInput): AsyncIterable<AgentEvent>;
  cancelTurn(input: CancelTurnInput): Promise<void>;
  replaySession(input: ReplaySessionInput): AsyncIterable<AgentEvent>;
};
```

### 输入输出类型契约

M1-03 阶段的最小形态：

```ts
type CreateSessionInput = {
  cwd: string;
  client: "web" | "cli" | "acp" | "test";
};

type Session = {
  sessionId: string;
  cwd: string;
  client: CreateSessionInput["client"];
  createdAt: string; // ISO-8601
};

type RunTurnInput = {
  sessionId: string;
  userMessage: string;
  // 由调用方提供；M1-03 通常由 web/cli 适配器在 user 取消时 abort
  signal?: AbortSignal;
};

type CancelTurnInput = {
  sessionId: string;
  // 不传时取消该 session 的当前 turn；传时只取消匹配 turn
  turnId?: string;
};

type ReplaySessionInput = {
  sessionId: string;
};
```

约束：

- `createSession` 必须先把 `session.created` 写入 event log，然后返回 Session（即 `Session` 中字段必须来自该 event）。
- `runTurn` 每次调用必须生成新的 `turnId`，并保证返回的 `AsyncIterable` 在 turn 终止事件（`turn.completed | turn.failed | turn.cancelled`）发出后立即结束迭代。
- `replaySession` 必须按 sequence 严格递增顺序读取 event log，不允许加任何投影。

## Turn 状态机

### 状态集

```text
idle → running → (completed | cancelled | failed)
```

更细粒度内部子状态（用于实现，不必直接暴露）：

```text
running:
  -> context.building
  -> model.streaming
  -> tool.pending?     ← M3 引入
  -> permission.pending? ← M3 引入
  -> tool.running?     ← M3 引入
  -> model.streaming?  ← M3 引入
```

M1-03 阶段只走 `idle → running (model.streaming) → completed | cancelled`，工具相关分支保留接口位置但暂不触发。

### 状态机必须显式

- 用一个 `TurnState` enum + 集中的 transition 函数实现，不能散落在 async callback 里。
- 任何状态转移都必须既写 event 又更新内存状态机；两者不能错位。

### M1-03 最小路径 event 顺序

`runTurn` 一次成功调用必须按顺序产生这些 event（sequence 严格递增）：

```text
1. turn.started        (turnId, payload.promptPreview = 用户输入前 N 字符)
2. user.message        (turnId, payload.content = 用户完整输入)
3. model.delta × N     (turnId, payload.text = 每段增量文本)
4. turn.completed      (turnId, payload.stopReason = "final" | "cancelled" | "error")
```

- `session.created` 只在 `createSession` 阶段产生，不属于 `runTurn` 的输出。
- 单个 turn 内的 sequence 必须连续递增；跨 turn 时只要求 session 全局递增。
- `model.delta` 数量 ≥ 1（即使整个回复只有一段文本也至少发一条）。

### Cancellation 语义

- `cancelTurn(input)` 是幂等的：重复调用应静默成功，不重复发 event。
- 调用 `cancelTurn` 后：
  1. SessionEngine 立即 abort 关联的 `AbortController.signal`，传给 `ModelProvider.stream(...)`。
  2. provider stream 完成 abort（可能 yield 出剩余 buffer 或直接抛错），SessionEngine 不再 emit 新的 `model.delta`。
  3. SessionEngine 发 `turn.completed` 且 `stopReason = "cancelled"`（**不引入** 单独的 `turn.cancelled` event；统一用 `stopReason` 区分）。
  4. `runTurn` 的 AsyncIterable 在最后一条 event 后结束。
- 若 turn 已自然结束，`cancelTurn` 应 no-op（不抛错）。
- AbortSignal 是 SessionEngine 内部创建，与 turn 同生命周期；调用方可以通过 `RunTurnInput.signal` 提供外部 signal，SessionEngine 用 `AbortSignal.any([external, internal])` 合并。

### Failure 语义

provider 抛错或 schema 校验失败：

- SessionEngine 必须发 `turn.completed` 且 `stopReason = "error"`，而不是把异常往上抛出 `runTurn` 的 iterable。
- 异常细节先记入 stderr / telemetry，**事件 payload 不允许携带堆栈** 以避免泄漏内部路径。
- 后续的 turn 必须能正常发起，不能因前一次失败卡死。

**Provider 失败 vs EventStore 失败必须区分（[[adr-0003]] T2）：** 模型流自身抛错走 `stopReason="error"`；持久化（`eventStore.append`）抛错属于 infrastructure failure，必须让 sequence 不留缺口并且把诊断分类记入 telemetry，**不可被外层 `catch` 误并入 provider failure**。具体实现 SHOULD：保留 sequence → 调 append → append 成功后递增 sequence + yield；append 失败时不递增 sequence、直接 throw 让 SessionEngine 决定后续策略。

### Session ↔ cwd 不可变（[[adr-0003]] T3）

- `createSession` 时绑定一个不可变 `cwd`，对应 workspace 根。
- **SessionEngine 不暴露任何修改 cwd 的 API**；schema 也不引入 `session.cwd_changed` event。
- 想换工作目录 → 新建 session。
- 工具（read/write/shell）可访问 cwd 子目录的相对路径或绝对路径，但 SessionEngine 不维护 "current directory" 漫游状态。
- 这条约束让 replay 决定性、session index 行不分裂、权限审计简单。与 Claude Code / Cursor / Aider 同业实践一致。

## 输入输出

输入：

- User message。
- Session id。
- CWD。
- Client capabilities。
- Policy mode。
- Optional selected tools/resources/skills。

输出：

- Agent events。
- Final assistant message projection。
- Updated session index。

## 最小实现

第一版（M1-03）只做：

- `createSession` 写 `session.created` 后返回 `Session`。
- `runTurn` 按"M1-03 最小路径 event 顺序"产生事件序列。
- ModelProvider port 由 fake provider 实现（详见 [model-gateway 层文档](model-gateway.md#fake-provider-m1-03)）。
- EventStore 用 M1-01 的 `JsonlEventLog`，所有 event 落盘后再 yield 给 iterable 消费者。
- `cancelTurn` 通过 AbortSignal 让 provider 退出，发 `turn.completed (stopReason=cancelled)`。
- Web 客户端：M1-03 只通过 replay/fixture 渲染事件；live streaming 端到端通过 `runTurn` 的 AsyncIterable 留给 M1-04 (Replay API) 统一规范，本阶段 web 不直接调用 `runTurn`。

不要第一版就接真实 provider 和 shell。

### 与存储的协作流程

`runTurn` 内部每发一条 event 必须经过：

1. 生成 event（id / sequence / timestamp）。
2. 通过 `EventStore.append(event)` 持久化。
3. yield 给调用方 iterable。

顺序不能颠倒——先持久化再 yield，确保任何下游消费者看到的事件都已落盘。

## 成熟实现

成熟后补：

- Cancellation token。
- Tool-call loop。
- Max turns / max tool calls。
- Error taxonomy。
- Context compaction。
- Retry/backoff。
- Concurrent session safety。
- Event schema migration。
- Remote runner parity。

## 常见坑

- Core 里直接判断 provider 原始字段。
- Core 里直接拼 prompt。
- Tool call 结果不落 event。
- Cancellation 只停 UI，不停模型流或 tool。
- Error 只抛异常，不进入 event log。

## 测试策略

Unit tests：

- State machine transitions。
- Fake provider streaming。
- Tool request lifecycle。
- Cancellation。
- Failure path。

Golden tests：

- 给定输入，输出事件序列稳定。
- Replay projection 与 live projection 一致。

Architecture tests：

- `core` 不 import `apps/*`。
- `core` 不 import provider SDK。
- `core` 不 import MCP transport。
