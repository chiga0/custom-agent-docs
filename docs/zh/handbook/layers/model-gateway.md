---
title: "Model Gateway 层"
---

## 真实作用

Model Gateway 把不同模型供应商的 API 差异隔离起来，让 Agent Core 只看到统一的模型流。

不同 provider 的差异包括：

- 消息格式。
- system/developer/user/tool role 表达。
- streaming chunk 格式。
- tool call 增量格式。
- token usage 字段。
- reasoning 内容。
- error/retry 语义。

Model Gateway 的目标不是抹平所有能力，而是把差异显式建模为 capability。

## 核心职责

- 定义 provider-neutral request。
- 定义 normalized stream event。
- 实现 provider adapters。
- 暴露 capability model。
- 处理 provider error normalization。
- 记录 usage、latency 和 raw metadata 的安全子集。

## 不应该做什么

Model Gateway 不应该：

- 决定业务上下文放什么。
- 决定工具是否允许执行。
- 写 session event log。
- 直接操作 UI。
- 直接读取 memory。

## Provider Port

M1-03 落地的 minimal shape（`packages/core/src/ports/model-provider.ts`）：

```ts
type ModelProvider = {
  id: string;
  capabilities: ModelCapabilities;
  preflightCheck(request: ModelRequest): PreflightResult;     // M2-01
  stream(
    request: ModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
};

type PreflightResult =
  | { ok: true; estimatedTokens: number }
  | {
      ok: false;
      reason: "context_overflow";
      estimatedTokens: number;
      maxContextTokens: number;
    };
```

`ModelRequest`（M1 最小集）：

- `modelId`
- `messages: { role, content }[]`
- `metadata?` — provider-specific 透传字段

M3+ 会扩展到 tools schema / temperature / reasoning budget；当前 port 故意保持最小。

`ModelStreamEvent` 联合体（M1 最小集）：

- `text_delta`
- `completed`（带 `usage`）
- `failed`（带 `reason`）

M3 添加 `tool_call_delta` / `tool_call_completed`，M2-02 真实 provider 时按需添加 `reasoning_delta` / `usage` 中间帧。

### Preflight 契约（[[adr-0003]] §2 / M2-01）

`preflightCheck` 必须：

- 同步（或近同步）— 在 turn 每次 runTurn 前都会跑，必须 cheap。
- 离线 — **不可** 触网；用 provider 自己的 tokenizer 或保守的字符近似（fake provider 用 4 字符≈1 token 的启发式）。
- 把 `request.messages` 的 token 估算与 `capabilities.maxContextTokens` 比较；超限时返回 `{ ok: false, reason: "context_overflow", … }`。

**SessionEngine 失败映射规则：** preflight 返回 `ok: false` 时，**不抛异常**，直接发 `turn.completed { stopReason: "error", errorCode: "context_overflow" }` 并 return。也就是说 turn 仍然是"开始→失败终止"的完整生命周期，replay 看到的也是同样的事件序列。

这条规则的意义：

- 调用方（acp-server / web client）永远只看到 `turn.completed` 作为终止事件，不会出现"抛异常然后 PromptResponse hang/5xx"。
- 错误码进 schema，是 transcript projection 的可见字段，UI 可以显示"超出上下文窗口"友好提示。
- M2-02 真实 provider 适配时只需要正确实现 `preflightCheck` + 厂商 tokenizer，不需要改 SessionEngine 的状态机。

### 已知 wire-surface 限制（M2-01 → M2-02 衔接）

M2-01 让 `errorCode` 落到 `AgentEvent.payload`，但**还没**让它穿过 ACP wire：

- `apps/acp-server/src/event-mapper.ts` 对 `turn.completed` 返回 `null`（按 ACP 规范，turn 的最终状态通过 `PromptResponse.stopReason` 表达而不是 `session/update`）。
- `mapStopReason` 把 core 的 `"error"` 翻成 ACP `"refusal"`，丢弃 `errorCode`。

后果：M2-01 的 errorCode **仅**可在事件日志 replay（`session/load`）和 acp-server `stderr` 诊断日志中看到，ACP `PromptResponse` 仍然只有 `stopReason: "refusal"`。

M2-02 真实 provider 接入时必须修这个 wire 间隙：

- 选项 (a)：在 ACP `SessionUpdate` 联合上加一个 `turn_error` 变体（需要 schema + mapper + web client + daemon 测试一起改）。
- 选项 (b)：让 `PromptResponse.stopReason` 引入新值 `"context_overflow"` —— 与 Zed ACP 规范偏离，需要先开 ADR。
- 选项 (c)：维持现状，客户端通过 `session/load` 后读 `turn.completed` payload 获取 errorCode —— 不增加 wire 表面，但要求所有想看 errorCode 的客户端实现 replay 路径。

M2-02 author 选择哪条之前不应该误以为 M2-01 已经把错误码暴露给客户端。

## Capability Model

不要靠 if provider name 判断行为，应该声明能力：

- 是否支持 tool call。
- 是否支持 parallel tool call。
- 是否支持 reasoning stream。
- 是否支持 JSON schema tool params。
- 是否支持 prompt cache。
- 是否支持 image/input files。
- 最大上下文长度。

## Raw Payload 策略

可以保存 raw payload 吗？

可以，但要注意：

- 只能在 adapter 层用于 debug。
- 不能让 core 测试依赖 raw payload。
- 需要 redaction。
- 需要 output budget。
- 不能持久化 secrets。

## 最小实现

第一版：

- Fake provider。
- 一个真实 provider。
- Text streaming。
- Tool call completed。
- Usage summary。
- Error normalization。

### Fake Provider (M1-03 + M2-01)

实际落地在 `packages/core/src/providers/fake-provider.ts`。M1-03 引入；M2-01 补 `preflightCheck` 实现。

```ts
export class FakeStreamingProvider implements ModelProvider {
  readonly id = "fake-streaming";
  readonly capabilities: ModelCapabilities; // maxContextTokens via ctor opts

  preflightCheck(request: ModelRequest): PreflightResult {
    const chars = request.messages.reduce((a, m) => a + m.content.length, 0);
    const est = Math.ceil(chars / 4); // 4 chars/token heuristic
    return est > this.capabilities.maxContextTokens
      ? { ok: false, reason: "context_overflow", estimatedTokens: est, maxContextTokens: this.capabilities.maxContextTokens }
      : { ok: true, estimatedTokens: est };
  }

  async *stream(_req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    for (const delta of this.chunks) {
      if (signal.aborted) { yield { type: "failed", reason: "aborted" }; return; }
      yield { type: "text_delta", delta };
    }
    yield { type: "completed", usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
```

关键契约（contract test 在 `fake-provider.test.ts` 8 个用例锁定）：

- `stream` 必须是 `async *` AsyncGenerator。
- `signal.aborted === true` 时立即终止并 yield `failed/aborted`；SessionEngine 据此把 turn 标 cancelled。
- `preflightCheck` 不触网、不抛、对超限场景返回 `ok: false`。
- fake provider 不写 event log；只 yield `ModelStreamEvent`，由 SessionEngine 决定哪些翻成 `AgentEvent`。
- 测试构造时建议显式传 `chunks` + `maxContextTokens`，让 golden / preflight 失败用例确定性可控。

### `packages/model-gateway` 包结构（M2-02a）

ModelProvider port + `ProviderError` 错误类层级都在 `packages/core/src/ports/`（co-located 让 SessionEngine 可以直接 `instanceof`-check + 调 `toTurnErrorCode`，不需要反向依赖 model-gateway）。concrete adapter 在 `packages/model-gateway/src/providers/`。架构 fitness 强制：

- `packages/core` → `packages/model-gateway` 反向依赖**禁止**。
- `packages/schema` / `packages/storage` / `packages/permissions` → `packages/model-gateway` 同理禁止。

`@custom-agent/core` 与 `@custom-agent/model-gateway` 都导出同一份 `ProviderError`、`toTurnErrorCode`——后者是前者的薄 re-export，runtime 类身份一致，`instanceof` 跨 barrel 工作。adapter 作者按 ergonomics 从任一 barrel 导入皆可。

`@custom-agent/model-gateway` barrel 额外导出：

- `RecordedProvider` + `ProviderFixture` / `RecordedProviderEvent` / `RecordedProviderError` 形状。

### `ProviderError` 错误归一化（M2-02a）

每个真 provider adapter 在 SDK 异常进入 SessionEngine **之前** 必须翻成下列类之一：

| 类 | code | 语义 |
| --- | --- | --- |
| `ProviderRateLimit` | `rate_limit` | 上游限流，可携 `retryAfterMs` |
| `ProviderUnauthorized` | `unauthorized` | 凭证错误 |
| `ProviderContextOverflow` | `context_overflow` | 流式途中才发现超窗（preflight 应已拦截，少见） |
| `ProviderServerError` | `server_error` | 上游 5xx |
| `ProviderUnknownError` | `unknown` | 兜底，保留 cause |

`toTurnErrorCode(error)`：
- `ProviderContextOverflow` → `"context_overflow"`
- 其余 → `"provider_failure"`

SessionEngine 在 catch 路径里 `instanceof ProviderError ? toTurnErrorCode(error) : "unknown"`：

- 真正的 `ProviderError` 子类按映射落 `errorCode`（rate_limit / unauthorized / server_error / unknown → `provider_failure`；context_overflow → `context_overflow`）。
- 任何裸 `Error`（provider 适配器 bug、未包装的网络异常）落 `errorCode = "unknown"`，永不静默掩盖。

集成测试 `packages/model-gateway/src/integration.test.ts` 同时 pin 两条路径：`ProviderRateLimit` throw → `provider_failure`，`ProviderContextOverflow` throw → `context_overflow`。

### `RecordedProvider`（M2-02a 离线 CI）

`packages/model-gateway/src/providers/recorded.ts`。从 `ProviderFixture` 重放一次模型交互——没网络、没 key、没 secret。

```ts
const provider = new RecordedProvider({
  fixture: {
    tokenEstimate: 12,
    maxContextTokens: 8_000,
    events: [
      { kind: "text_delta", delta: "Hello, " },
      { kind: "text_delta", delta: "world." },
      { kind: "completed", usage: { promptTokens: 5, completionTokens: 2 } },
    ],
  },
});
```

失败注入（M2-02b 真 adapter 的参考形态）：

```ts
{ tokenEstimate: 1, maxContextTokens: 1000,
  events: [{ kind: "text_delta", delta: "partial" }],
  failBefore: 1,
  failWith: { kind: "rate_limit", message: "slow down", retryAfterMs: 1500 } }
```

集成测试 `packages/model-gateway/src/integration.test.ts` 用 RecordedProvider 驱动 SessionEngine 跑完整 turn——这是 model-gateway 与 core 边界的端到端凭据，不依赖网络也不依赖 fake provider。

### M2-02b 真实 Provider 适配（TODO）

新 provider 应该：

1. 复用厂商官方 SDK 做 HTTP / SSE / 鉴权。
2. 在 adapter 内部 tokenize 一次，把 `preflightCheck` 接到真 tokenizer（避免重新发明字符近似）。
3. 在 `stream` 内部把厂商原生 chunk 翻译成 `ModelStreamEvent`，特别注意：原生 SDK 异常**必须**翻成 `ProviderError` 子类（见 §ProviderError），SessionEngine 不应直接看到 SDK 异常。
4. 记录 fixture（请求 + 响应）以便 network-disabled CI replay；fixture 文件可由 RecordedProvider 直接消费，二者共享 `ProviderFixture` 形状。
5. 决定 `errorCode` 上 wire 方案（见上文「已知 wire-surface 限制」）。

## 成熟实现

后续：

- 多 provider。
- Provider fallback。
- Retry/backoff。
- Rate limit handling。
- Prompt cache。
- Reasoning budget。
- Recorded fixtures。
- Cost accounting。

## SDK 选型策略（[[adr-0003]] T5）

`ModelProvider` port 是项目自己的契约，**不**包装 `ai-sdk` / `@tanstack/ai` 这类聚合包。原因：

- 这些聚合包对 capability / 工具调用做了自己的抽象，与本项目"event-sourced + 所有工具调用必须经过 PermissionEngine"的硬约束不完全契合。
- 引入它意味着把 mainline event 模型间接绑定到上游版本节奏。

**正确做法：**

- adapter 内部使用厂商**官方 SDK**（`@anthropic-ai/sdk`、`openai`、`@google/genai` 等）——不重新发明 HTTP / 重试 / 流式 chunk 解析。
- adapter 把厂商原生 chunk 类型翻译成 `ModelStreamEvent` 联合体后再交给 core。
- core 永不直接 `import` 任何厂商 SDK；架构 fitness test 会守住该边界。

**例外可豁免：** 如果将来某个 provider 没有官方 SDK 且 `ai-sdk` 覆盖了它（罕见），可以在 **单个 adapter 内部** 引用 `ai-sdk`，但 core 仍只依赖 port。

## 常见坑

- Core 直接 import SDK。
- Provider adapter 直接写 event log。
- Tool call chunk 没有合并成稳定结构。
- Usage 只在 UI 显示，不进 telemetry。
- Fixture 依赖实时网络。

## 测试策略

- Fake provider contract test。
- Recorded provider fixture test。
- Stream chunk normalization test。
- Tool call reconstruction test。
- Error normalization test。
- Network-disabled CI test。
