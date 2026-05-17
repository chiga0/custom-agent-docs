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

## Turn 状态机

```text
idle
  -> turn.started
  -> context.built
  -> model.streaming
  -> tool.pending?
  -> permission.pending?
  -> tool.running?
  -> model.streaming?
  -> turn.completed | turn.failed | turn.cancelled
```

状态机必须显式，不能散落在 async callback 中。

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

第一版可以只做：

- `createSession` 写 `session.created`。
- `runTurn` 写 `turn.started`、`user.message`、fake `model.delta`、`turn.completed`。
- EventStore 用 JSONL。
- Web 通过 replay 显示事件。

不要第一版就接真实 provider 和 shell。

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
