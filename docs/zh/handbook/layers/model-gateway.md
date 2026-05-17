# Model Gateway 层

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

```ts
type ModelProvider = {
  id: string;
  capabilities: ModelCapabilities;
  stream(
    request: ModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
};
```

`ModelRequest` 应该包含：

- messages。
- tools schema。
- model id。
- temperature / reasoning / max tokens。
- metadata。

`ModelStreamEvent` 应该包含：

- `text_delta`
- `reasoning_delta`
- `tool_call_delta`
- `tool_call_completed`
- `usage`
- `completed`
- `failed`

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
