# 一个 Turn 的完整生命周期

每一次 `用户输入 → agent 最终回复` 都被建模为一个 **turn**。这一章把"turn 内到底发生了什么"拆到事件级，配合 FSM 图、最小路径例子、含工具调用的完整例子、cancel / error 分支。读完后你应该能拿一段 jsonl 直接复原 turn 行为。

---

## 1. Turn 状态机

```
        ┌──────────┐
        │   idle   │  (创建 Turn 时进入)
        └─────┬────┘
              │ 写 turn.started
              ▼
        ┌──────────┐
        │  running │
        └─────┬────┘
   ┌──────────┼──────────┐
   │          │          │
   ▼          ▼          ▼
completed  cancelled   failed
(stop:final)(stop:cancelled)(stop:error)
```

约束：

- 只有 `idle → running`、`running → {completed, cancelled, failed}` 是合法转移；其他全部抛错。
- 终态没有出边。下一个 turn 创建一个新的 FSM 实例。
- 终态对应一条 `turn.completed` 事件，**`stopReason` 字段标识到达的具体终态**。
- 项目**不引入** `turn.cancelled` 单独事件类型——cancel / error 都通过 `turn.completed.stopReason` 区分，保持事件 schema 收敛。

实现：`packages/core/src/session-engine.ts` 的 `TurnFsm` class（M1-03 落地）。

## 2. 最小路径（happy path，无工具）

输入：用户说 `"hello"`，FakeStreamingProvider 配置 chunks = `["hi", " there"]`。

```
sequence  type              payload
────────  ────────────────  ─────────────────────────────
1         session.created   {cwd:"/tmp", client:"test"}
2         turn.started      {promptPreview:"hello"}
3         user.message      {content:"hello"}
4         model.delta       {text:"hi"}
5         model.delta       {text:" there"}
6         turn.completed    {stopReason:"final"}
```

不变性：

- `sequence` 在 session 内严格递增，无重号无缺号（M1-01 + M1-03 review 后保证）。
- 每条事件**先落盘 (`eventStore.append`)，再 yield 给 `AsyncIterable<AgentEvent>` 的消费者**。
- `session.created` 在 session 创建时一次性写，不算 turn 内事件。

## 3. 含工具调用的路径（M3 落地后形态）

⚠️ 下面是 **M3 完成后**的预期事件链。M1-M2 阶段不会出现 tool 相关事件。

```
sequence  type                            payload (摘要)
────────  ──────────────────────────────  ──────────────────────────────────
N         turn.started                    {promptPreview:"重命名 src/foo.ts ..."}
N+1       user.message                    {content:"重命名 src/foo.ts 为 bar.ts"}
N+2       context.built                   {tokens:{instruction:..., transcript:...}}
N+3       model.delta                     {text:"我先确认文件存在,然后重命名。"}
N+4       model.tool_call_requested       {tool:"shell", args:{cmd:"ls src/foo.ts"}}
N+5       permission.requested            {tool:"shell", risk:"read"}
N+6       permission.resolved             {decision:"allow", policy:"read-allow"}
N+7       tool.started                    {tool:"shell", cmd:"ls src/foo.ts"}
N+8       tool.completed                  {result:"src/foo.ts\n", exitCode:0}
N+9       model.delta                     {text:"存在,我现在重命名。"}
N+10      model.tool_call_requested       {tool:"shell", args:{cmd:"mv src/foo.ts src/bar.ts"}}
N+11      permission.requested            {tool:"shell", risk:"destructive"}
N+12      permission.resolved             {decision:"ask"}     ← 等 user/UI 应答
   ...
N+13      permission.resolved             {decision:"allow", actor:"user"}
N+14      tool.started                    {tool:"shell", cmd:"mv ..."}
N+15      tool.completed                  {exitCode:0}
N+16      model.delta                     {text:"完成。"}
N+17      turn.completed                  {stopReason:"final"}
```

注意：

- **每个工具调用**都经过 `permission.requested → permission.resolved → tool.started → tool.completed | tool.failed` 四联事件，没有例外。
- `permission.resolved` 可以出现两次：第一次 PermissionEngine 返回 `"ask"`，第二次是 user/UI 给出最终决定。
- 工具结果 (`tool.completed.payload.result`) 由 ContextBuilder 装回 next model call 的输入。Model 看不到 sequence、event 元数据；只看到工具输出本身。

## 4. 取消（cancel）分支

两种触发：

1. **外部 AbortSignal**（CLI 按 Ctrl+C、Web 关闭页面、ACP `session/cancel` 等）：
2. **`SessionEngine.cancelTurn(sessionId, turnId?)` 显式调用**。

两条路径汇入同一个 controller：

```
                ┌─────────────────┐
                │ AbortSignal     │
                │ (external)      │
                └────────┬────────┘
                         │
              ┌──────────▼──────────┐
              │  internal controller│  ← SessionEngine 内 AbortController
              └──────────┬──────────┘
                         │ signal -> ModelProvider.stream(req, signal)
                         ▼
                  provider 看到 abort
                         │
                         ▼
         停止 yield model.delta / 退出 stream
                         │
                         ▼
   SessionEngine 检测 signal.aborted (在 yield 每条 delta 之前 guard)
                         │
                         ▼
   写 turn.completed(stopReason="cancelled") -> yield -> AsyncIterable 终结
```

关键不变性（M1-03 review 后保证）：

- **post-cancel guard**：SessionEngine 在 yield 每条 `model.delta` 之前先看 `signal.aborted`，确保即便 provider 没及时退出也不会泄漏一条 abort 后的 delta 进 event log。
- `cancelTurn` 是幂等的：重复调用 / cancel 一个已完成 turn 都不会抛错或重写事件。
- 没有单独的 `turn.cancelled` event；仍用 `turn.completed` + `stopReason="cancelled"`。

## 5. 失败（error）分支

两种典型来源：

### 5.1 Provider 流式错误

provider yield `{ type: "failed", reason: "..." }` 或 `stream()` 抛异常：

- SessionEngine 把 stopReason 设为 `"error"`。
- FSM `running → failed`。
- 仍 emit `turn.completed { stopReason: "error" }` 给消费者（不向外暴露异常）。
- 后续 turn 仍可以正常创建（FSM 是 per-turn 的）。

### 5.2 EventStore append 失败（M1-03 review 引入区分）

如果 `eventStore.append` 拒绝（磁盘满、permission、网络）：

- SessionEngine 抛 `EventStoreFailure`，并保留原始 cause。
- 与 provider 失败**分流**：caller 可 `instanceof EventStoreFailure` 判定基础设施问题。
- `sequence` 在 append 失败时**不递增**——下次重试可以复用原 sequence，event log 无 gap。

## 6. 与 Storage 的关系

```
SessionEngine.runTurn()
       │
       ▼  
emit AgentEvent ─────────→ EventStore.append(sessionId, event)   ← 必须先落盘
       │
       ▼
yield to AsyncIterable consumer
```

EventStore 在 M1-03 是 port（`packages/core/src/ports/event-store.ts`），默认实现是 `JsonlFileEventStore`（M1-03 暂在 core 仓内、M1-04 计划迁到 `packages/storage`）。

读 / replay 由 `JsonlEventLog.replay()`（M1-01）提供：流式按 sequence 升序 yield，支持 `skip-trailing-partial` / `strict` 两种 trailing-partial 行恢复模式。

## 7. 关于 cwd

每个 session 创建时绑定一个 `cwd`，**不可变**。turn 内任何工具调用都以这个 cwd 为根（M3 ToolRouter 强制）。换工作目录 = 新建 session。详见 [[adr-0003]] §T3。

## 8. 关于 context overflow（M4 之前的兜底）

在真正接入 provider（M2-01）的同时，必须实现 "context overflow preflight"：

- estimate `prompt_tokens + transcript_tokens`，超过 `provider.capabilities.maxContextTokens` 时**不要调模型 API**。
- 直接发 `turn.completed { stopReason: "error" }` 并把诊断写 telemetry（M2 起 schema 加 `errorCode` 字段，`errorCode = "context_overflow"`）。
- M4 完成 deterministic compaction 之后，超限触发 compaction → 重试，而不是直接报错。

详见 [[adr-0003]] §T2。

## 9. Replay：从 event log 还原 turn

按 sequence 顺序读 JSONL：

```ts
import { JsonlEventLog } from "@custom-agent/storage";

const log = new JsonlEventLog("/path/to/sess_xxx.jsonl");
for await (const event of log.replay()) {
  if (event.type === "model.delta") {
    process.stdout.write(event.payload.text);
  }
  // ... 其他 event 类型按需
}
```

**两种 replay 视图**：

- **state replay**：rebuild session/turn 状态机，常用于测试。
- **transcript replay**：抽取 user/assistant 消息流，常用于 UI / 调试。

两者必须**确定性**：同样的 JSONL 输入必须产出完全一致的输出（不依赖 `Date.now()` / 随机数 / 网络）。

## 10. 常见误解纠正

| 误解 | 纠正 |
|---|---|
| "Web 通过 SSE 收 `AgentEvent`" | Web 收的是 ACP `session/update` 通知；core 的 AsyncIterable 只在进程内 |
| "cancel 写一条 `turn.cancelled` 事件" | 没有 `turn.cancelled`；用 `turn.completed.stopReason="cancelled"` |
| "provider 失败时 `runTurn` 抛异常" | 不抛；总是 emit `turn.completed { stopReason:"error" }` |
| "model.delta 数量可以是 0" | 不行；至少 1 条（即便整条回复只有一段文本）|
| "sequence 可以重号 / 跳号" | 不行；M1-03 commitEvent 保证 append 成功后才递增，失败不留 gap |
| "新 SessionEngine 进程能继续 disk 上的 session" | M1-03 暂不支持；session 状态当前只在内存 Map；hydration 留给 M1-04 Replay API |

---

下一步推荐：

- 读 [implementation/core-layer](../implementation/core-layer.md)（重写中）—— turn 状态机的代码层细节。
- 读 [implementation/storage-and-replay](../implementation/storage-and-replay.md)（重写中）—— JsonlEventLog 内部、tail cache、write queue。
- 读 [reference/glossary](../GLOSSARY.md) —— 复杂术语解释。
