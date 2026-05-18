---
title: "从零构建一套 Agent 框架"
---

> 重写自 `handbook/tutorials/build-agent-from-zero.md`。原版是设计笔记；本版每个 step 含可跑代码 + checkpoint（让你知道这一步完成了）+ 指向 `custom-agent` 实际文件的引用。

读完后你能：

- 在自己 fork 的仓库里走完 M0-M1，跑出第一个 fake turn 并落 event log。
- 理解每一步为什么必须存在，不是"先 follow 教程，等做完再问为什么"。
- 知道下一阶段（M2-M5）每一步的入口在哪。

**前置阅读**：[`INTRO.md`](../INTRO.md)、[`foundations/turn-lifecycle.md`](../foundations/turn-lifecycle.md)、[`GLOSSARY.md`](../GLOSSARY.md)。

---

## Step 0：写下"主线"，再写代码

时间预算：30 分钟纯写文档。

目标：先把"要做什么 / 不做什么"写明白。**没有 mainline，开发就像没指南针的徒步。**

具体动作：

1. 在仓库根新建 `rules/mainline.md`，写出：
   - **要做的**：local-first agent core / 事件溯源 / 全 client 走 ACP / 权限统一审批。
   - **不做的**：vector memory / 自修改 prompt / 多 agent 编排 / 私有 wire 协议。
2. 新建 `AGENTS.md`（governance）：列出**非协商架构纪律**（参考本项目 [`AGENTS.md`](https://github.com/chiga0/custom-agent/blob/main/AGENTS.md)）。
3. 在 `docs/zh/02-roadmap.md` 列 milestone（M0-M9）。

**Checkpoint**：你应该能在没看代码的情况下回答 "agent 处理一次 turn 时哪些事情会发生 / 哪些事情绝对不能发生"。

**完成标志**：`rules/mainline.md` + `AGENTS.md` + `02-roadmap.md` 三份文档存在；你能用 5 分钟向别人讲清楚整个项目。

---

## Step 1：定义 event schema（`packages/schema`）

时间预算：1-2 小时。

目标：在写任何 runtime 代码之前，**先把"事件长什么样"锁死**。事件是 session 的事实真值，schema 不稳代码一定崩。

具体动作：

```ts
// packages/schema/src/index.ts
export type EventEnvelope<TType extends string, TPayload extends Record<string, unknown>> = {
  id: string;
  schemaVersion: 1;
  sessionId: string;
  turnId?: string;
  sequence: number;
  timestamp: string;
  type: TType;
  payload: TPayload;
};

export type SessionCreatedEvent = EventEnvelope<"session.created", {
  cwd: string;
  client: "web" | "cli" | "acp" | "test";
}>;

export type TurnStartedEvent = EventEnvelope<"turn.started", {
  promptPreview: string;
}>;

export type UserMessageEvent = EventEnvelope<"user.message", {
  content: string;
}>;

export type ModelDeltaEvent = EventEnvelope<"model.delta", {
  text: string;
}>;

export type TurnCompletedEvent = EventEnvelope<"turn.completed", {
  stopReason: "final" | "cancelled" | "error";
}>;

export type AgentEvent =
  | SessionCreatedEvent
  | TurnStartedEvent
  | UserMessageEvent
  | ModelDeltaEvent
  | TurnCompletedEvent;

export const eventTypes = [
  "session.created", "turn.started", "user.message",
  "model.delta", "turn.completed",
] as const;

export function isAgentEvent(value: unknown): value is AgentEvent {
  // ... schema 校验
}
```

注意要点：

- **不要先做 6 种 event**，先做 5 种。MVP 只需 session 创建 + turn 内的 user/model 流式 + turn 收尾。
- **`schemaVersion: 1` 不是可选**：未来 evolution 时一眼能识别旧 event。
- **`turnId?` 是可选**：`session.created` 没有 turn；其他都有。
- **不预先加 `meta` / `extra` 字段**：等真正有用例再加，避免 schema 提前过设计。

参考实现：[`packages/schema/src/index.ts`](https://github.com/chiga0/custom-agent/blob/main/packages/schema/src/index.ts)。

**Checkpoint**：

```ts
import { isAgentEvent } from "@yourproject/schema";

const valid = {
  id: "evt_1", schemaVersion: 1,
  sessionId: "sess_1", sequence: 1,
  timestamp: "2026-01-01T00:00:00.000Z",
  type: "session.created",
  payload: { cwd: "/tmp", client: "test" },
};
console.assert(isAgentEvent(valid) === true);

const invalid = { ...valid, schemaVersion: 2 };
console.assert(isAgentEvent(invalid) === false);
```

**完成标志**：schema 单测 7-10 条全过；coverage on `isAgentEvent` 100%。

---

## Step 2：实现 append-only event log（`packages/storage`）

时间预算：3-4 小时。

目标：把事件 append 到 JSONL 文件，可以读回；保证 sequence 严格递增、单写、可被多次读。

具体动作：

```ts
// packages/storage/src/event-log.ts
import { appendFile, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { isAgentEvent, type AgentEvent } from "@yourproject/schema";

export class JsonlEventLog {
  private tailEvent: AgentEvent | undefined;
  private tailLoaded = false;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async append(event: AgentEvent): Promise<void> {
    await this.appendMany([event]);
  }

  async appendMany(events: readonly AgentEvent[]): Promise<void> {
    // 1) 同步 validate sequence 严格递增
    // 2) 在 writeQueue 链上排队（避免同实例并发写出 TOCTOU）
    // 3) lazy-load tail event 作 cache
    // 4) appendFile（不要每次重读全文件）
  }

  async *replay(): AsyncIterable<AgentEvent> {
    // 流式按 64KB 分块 + StringDecoder + 行 buffer
    // 不要 readFile 全文（大 session 内存爆）
  }
}
```

最容易踩的三个坑（**最重要**，挨个理解）：

1. **每次 append 都 readFile 全部历史校验 tail** = 整个 session N 次写就是 O(N²)。**必须**用 tail cache（append 后递增；instance 内 lazy-init 一次即可）。
2. **同一 instance 并发 `append()`** = TOCTOU 窗口。用 internal `writeQueue: Promise` 串行化。
3. **`replay()` 内部 `await readAll()` 再 yield** = 名字叫 streaming 实际不是。直接 `fs.open` + `read(64KB chunks)` + 行 buffer 才是真流式。

参考实现：[`packages/storage/src/event-log.ts`](https://github.com/chiga0/custom-agent/blob/main/packages/storage/src/event-log.ts)（M1-01 经历了一轮 review 修复，结论代码已含上述三个 fix）。

**Checkpoint**（真测试，用 vitest 之类的）：

```ts
test("append 多次后 replay 顺序一致", async () => {
  const log = new JsonlEventLog("/tmp/test.jsonl");
  await log.append({ id: "evt_1", schemaVersion: 1, sessionId: "s1",
    sequence: 1, timestamp: "...", type: "session.created",
    payload: { cwd: "/tmp", client: "test" } });
  await log.append({ ... sequence: 2 ... });

  const events = [];
  for await (const e of log.replay()) events.push(e);
  expect(events.map(e => e.sequence)).toEqual([1, 2]);
});

test("乱序 sequence 必须抛错", async () => {
  // 先 append seq=2 再 append seq=1
  await expect(log.append(seq1AfterSeq2)).rejects.toThrow(/sequence/);
});

test("并发 append 不破坏顺序", async () => {
  await Promise.all([
    log.append(makeEvent(1)),
    log.append(makeEvent(2)),
    log.append(makeEvent(3)),
  ]);
  // 三个 append 应该串行成功
});

test("trailing partial 行容忍 / 严格两种模式", async () => {
  // 写一个故意截断的尾行
  // skip-trailing-partial 模式：readAll 不抛
  // strict 模式：readAll 抛 EventLogDecodeError
});
```

**完成标志**：8-12 条 storage 测试全过；`appendFile + JsonlEventLog` 在并发 / partial / sequence violation 三类边界都被覆盖。

---

## Step 3：实现 SessionEngine + FakeStreamingProvider（`packages/core`）

时间预算：4-6 小时。

目标：把 user prompt 翻译成 turn FSM + event 序列；用 fake provider 不接真模型 API。

具体动作分两步：

### 3.1 定义 ports

```ts
// packages/core/src/ports/model-provider.ts
export type ModelStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "completed"; usage?: ModelUsage }
  | { type: "failed"; reason: string };

export type ModelProvider = {
  readonly id: string;
  readonly capabilities: ModelCapabilities;
  stream(req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
};

// packages/core/src/ports/event-store.ts
export type EventStore = {
  append(sessionId: string, event: AgentEvent): Promise<void>;
  replay(sessionId: string): AsyncIterable<AgentEvent>;
};
```

### 3.2 SessionEngine 主体

```ts
// packages/core/src/session-engine.ts
export class SessionEngine {
  async createSession(input: CreateSessionInput): Promise<Session> {
    const event: AgentEvent = {
      id: this.createId("evt"), schemaVersion: 1,
      sessionId: this.createId("sess"), sequence: 1,
      timestamp: this.now().toISOString(),
      type: "session.created",
      payload: { cwd: input.cwd, client: input.client },
    };
    await this.appendOrFail(event.sessionId, event);  // 失败抛 EventStoreFailure
    // 把 session state 加入内存 Map，nextSequence=2
    return { sessionId, cwd, client, createdAt };
  }

  async *runTurn(input: RunTurnInput): AsyncIterable<AgentEvent> {
    // 1) FSM 创建：idle → running
    // 2) yield turn.started + user.message
    // 3) for await provider.stream(): yield model.delta
    //    - 每条 yield 前先 check signal.aborted（防 post-cancel leak）
    //    - EventStoreFailure 与 provider error 分流（前者 rethrow，后者 stopReason=error）
    // 4) yield turn.completed(stopReason)
    // 5) finally：清掉 currentTurn
  }

  async cancelTurn(input: CancelTurnInput): Promise<void> {
    // idempotent：currentTurn?.controller.abort()
  }
}
```

不写 `commit-sequence-after-append-succeeds` 这条不变性 = 失败重试时会留 sequence gap。**`commitEvent` 必须**：

```ts
private async commitEvent(state, partial) {
  const sequence = state.nextSequence;   // 1) reserve
  const event = { ...partial, sequence };
  await this.appendOrFail(state.sessionId, event);  // 2) try append
  state.nextSequence = sequence + 1;     // 3) commit only on success
  return event;
}
```

### 3.3 FakeStreamingProvider

```ts
export class FakeStreamingProvider implements ModelProvider {
  id = "fake-streaming";
  capabilities = { streaming: true, toolCall: false, ... };
  constructor(private readonly opts: { chunks?: string[]; throwAfterFirstChunk?: boolean } = {}) {}

  async *stream(_req, signal) {
    let emitted = 0;
    for (const delta of this.opts.chunks ?? DEFAULT_CHUNKS) {
      if (signal.aborted) { yield { type: "failed", reason: "aborted" }; return; }
      yield { type: "text_delta", delta };
      emitted++;
      if (this.opts.throwAfterFirstChunk && emitted === 1) throw new Error("synthetic");
    }
    yield { type: "completed", usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
```

参考实现：

- [`packages/core/src/session-engine.ts`](https://github.com/chiga0/custom-agent/blob/main/packages/core/src/session-engine.ts)
- [`packages/core/src/providers/fake-provider.ts`](https://github.com/chiga0/custom-agent/blob/main/packages/core/src/providers/fake-provider.ts)
- [`packages/core/src/adapters/jsonl-event-store.ts`](https://github.com/chiga0/custom-agent/blob/main/packages/core/src/adapters/jsonl-event-store.ts)

**Checkpoint** —— 应该写出来这些测试都过：

1. **Happy path**：`createSession` + `runTurn` 产 `[session.created, turn.started, user.message, model.delta×N, turn.completed(final)]`，sequence 严格递增。
2. **Cancel mid-stream**：在第一条 `model.delta` 后 `cancelTurn`，第二条 delta 不应出现，最终是 `turn.completed(cancelled)`。
3. **External abort signal**：传入的 `signal.abort()` 等效于 `cancelTurn`。
4. **Provider failure**：`throwAfterFirstChunk` 产 `turn.completed(error)`，**不**向 iterable 外抛异常。
5. **EventStore failure**：mock store append 失败 → 抛 `EventStoreFailure`；session.nextSequence 不前进；下次 retry 复用同序号。
6. **Multi turn sequence continuity**：第二个 turn 接着第一个 turn 的 sequence 继续递增。

**完成标志**：core 9+ 测试全过，外加 JsonlFileEventStore 集成测试（实际写 JSONL → replay 还原）。

---

## Step 4：搭最薄的 Web 壳（`apps/web-client`）

时间预算：4-6 小时。

目标：把 event log 渲染成时间线 UI。**不**调用 SessionEngine（M1 阶段 web 只读 fixture）；从 M1-04 起改为通过 ACP daemon 拉取。

具体动作：

1. 用 Vite + 纯 TypeScript（不引重的框架，M1 阶段不必要）。
2. 准备 fixture JSONL 文件，包含一个完整的 fake session。
3. `main.ts` 读 fixture（或 fetch 一个 jsonl URL），按 sequence 排序，渲染：
   - session 标头（cwd / client / 创建时间）
   - turn 时间线：每个 turn 一个 card，含 user.message + model.delta 拼接 + turn.completed 状态。

**为什么不直接对接 SessionEngine**：M1 阶段还没 wire 协议（M1-04 才有 ACP HTTP）；fixture 渲染先把 UI 调对。Web 调通后，wire 一替换就上。

参考：[`apps/web-client/`](https://github.com/chiga0/custom-agent/tree/main/apps/web-client)。

**Checkpoint**：

- 用 Playwright（或 puppeteer）跑：load fixture → 截图断言 → 截图 baseline 比对。
- 关 backend 跑 web，UI 仍能渲染（fixture 自包含）。

**完成标志**：web 能渲染 fixture transcript；截图 baseline 入 repo；CI 上 Playwright 跑通。

---

## Step 5：ACP stdio server + Streamable HTTP daemon

时间预算：6-10 小时。

目标：把 `apps/acp-server` 写成 Zed ACP JSON-RPC over stdio 的 canonical wire 形态；`apps/acp-daemon` 写成 HTTP+SSE 网关，按 session 1:1 spawn 子进程。

详见 [`adr/0004-acp-unified-transport.md`](../../adr/0004-acp-unified-transport.md)。M1-ACP-STDIO + M1-ACP-HTTP 两个 work item 落地后，本 step 才算完成。

最小集：

- `apps/acp-server`：实现 `initialize` / `session/new` / `session/prompt` / `session/cancel` / `session/update`（notification）。mapper 把 `AgentEvent` → `session/update` payload。
- `apps/acp-daemon`：HTTP server 监听 localhost；接收 `session/new` 即 spawn 子进程；ACP frame 经 HTTP+SSE 透传到子进程 stdio。

**Checkpoint**：

- `node apps/acp-server/dist/index.js` 跑起，echo JSON-RPC 请求/响应。
- Zed editor 把 binary 作为 external agent 挂上，跑一次 turn。
- Web client 通过 daemon HTTP+SSE 跑一次 turn；与 Zed 看到相同的 event 序列。

---

## Step 6：接真实 ModelProvider（M2）

时间预算：1 周。

目标：把 `FakeStreamingProvider` 替换为一个真 provider adapter（Anthropic / OpenAI / Google）。

具体动作：

1. 在 `packages/model-gateway`（新包）里写 `AnthropicProvider implements ModelProvider`。
2. adapter 内部直接 `import "@anthropic-ai/sdk"`；core **永不** import 厂商 SDK。
3. capability detection：runtime 探测 `supports_tool_call` 等。
4. **`context_overflow` preflight**（[[adr-0003]] §T2）：估算 prompt tokens 超 `maxContextTokens` 时直接 `turn.completed(stopReason=error, errorCode=context_overflow)`，**不调 model API**。
5. **不**包装 `ai-sdk` / `@tanstack/ai`（[[adr-0003]] §T5）。

**Checkpoint**：

- 离线 fixture 测试：把 SDK 调用 mock，回放 recorded chunk，断言 normalized stream event 一致。
- 在线 smoke：一次真 API 调，看 turn 走完。
- context overflow 测试：故意构造一个超长 transcript，断言 turn 停在 `errorCode: context_overflow`，**没**消费 API quota。

---

## Step 7-11：tools / permissions / context / skills / MCP

详见对应 chapter（[`tools-and-permissions.md`](tools-and-permissions.md)、[`context.md`](context.md)、[`memory.md`](memory.md)、[`layers/skills.md`](../layers/skills.md) 暂用、[`layers/mcp.md`](../layers/mcp.md) 暂用）。后两章正在 Phase 4 P1 重写中。

各 step 内容：

| Step | 主题 | 入口 | 时间 |
|---|---|---|---|
| 7 | Tools + PermissionEngine | M3-01 ~ M3-04 | 1-2 周 |
| 8 | ContextBuilder + budget | M4-01 ~ M4-02 | 1 周 |
| 9 | Memory candidate | M4-04 | 1 周 |
| 10 | Skill lazy-load | M5-01 ~ M5-03 | 1-2 周 |
| 11 | MCP stdio + HTTP | M6 + M7 | 2-3 周 |

每个 step 都参考对应 chapter 的"实现状态"+"测试策略"+"常见误区"小节。

---

## 全部完成后你应该具备的能力

1. 在没有内置框架的情况下，把"事件溯源 agent core"作为第一性原理落地。
2. 区分 "model API 直接接入" vs "ports + adapters + capability model" 的代价差异。
3. 看到一段陌生的 agent 代码，能立刻问出 ：
   - 这条工具调用经过 PermissionEngine 了吗？
   - 这条 event 写盘了再 yield 还是反过来？
   - context 装的时候 budget 算了吗？
   - cancel 路径 abort signal 接到了吗？
   - 同一 session 跨 turn 怎么共享 / 隔离？
4. 在自己 fork 的仓库里完成 M0-M5（约 6-8 周）。
5. 把不熟悉的能力（remote control / plugin / 多 agent）按 [[adr-0002]] 的方式预留，而不是急着实装。

## 推荐顺序与并行

- **必须串行**：Step 0 → 1 → 2 → 3。前三步是地基。
- **可并行**（M1 阶段）：Step 4 web fixture 渲染 / Step 5 ACP stdio / golden transcript fixtures。
- **必须串行**（M2 之后）：先 6（真 provider）再 7（工具/权限）再 8（context）再 9（memory）再 10（skill）再 11（MCP）。这个顺序的因果性在 02-roadmap.md 详述。

下一步：开始 Step 0，或者直接读 [`getting-started/quickstart.md`](../getting-started/quickstart.md) 在已有仓库里跑一遍。
