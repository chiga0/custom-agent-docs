# Package Map

本文解释当前实现仓库 `custom-agent` 中每个 package 应承担什么职责，以及未来扩展时应如何拆分。

## 当前包

### `packages/schema`

真实作用：

- 定义公共 schema。
- 定义 event envelope。
- 定义 tool/session/permission/provider contracts。

不应该：

- 依赖 core。
- 依赖 client。
- 包含业务逻辑。

### `packages/core`

真实作用：

- SessionEngine。
- Turn state machine。
- Orchestration。

不应该：

- import provider SDK。
- import Web/CLI/ACP。
- 直接执行 tools。

### `packages/storage`

真实作用：

- Event log。
- Session index。
- Replay source。
- Artifact storage。

不应该：

- 决定 agent 行为。
- 构造 prompt。
- 做权限判断。

### `packages/permissions`

真实作用：

- Permission request。
- Policy evaluation。
- Approval decision。
- Risk classification。

不应该：

- 执行工具。
- 操作 UI。
- 直接读写 session。

## 未来包

### `packages/model-gateway`

Provider adapters 和 normalized model stream。

### `packages/tool-router`

Tool registry、namespace、arg validation、routing。

### `packages/local-tools`

read/search/shell/patch/git tools 的执行实现。

### `packages/mcp-client`

MCP transports、server lifecycle、tools/resources/prompts。

### `packages/memory`

Instructions、memory candidates、durable memory、context memory selection。

### `packages/skills`

Skill discovery、metadata parsing、lazy loading、allowed tools。

### `packages/telemetry`

Usage、latency、tool duration、error categories、local metrics。

## 判断是否需要新包

需要新包的信号：

- 有清晰独立边界。
- 有独立测试策略。
- 有多个上游调用方。
- 拆出后能减少 core 依赖。

不需要新包的信号：

- 只是一个小 helper。
- 只有一个调用方。
- 为了“看起来架构化”而拆。

新增 package 前应写 ADR 或更新 roadmap status。
