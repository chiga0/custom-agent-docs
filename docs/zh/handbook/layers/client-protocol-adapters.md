# Client 与 Protocol Adapters

> ⚠️ **本章节部分内容已被 [[adr-0004]] 取代** —— 原"三种 wire 协议"表格 / "ACP=stdio, Web=SSE, CLI=进程内"的描述作废。新决策：统一 ACP 协议 + stdio / Streamable HTTP 两种 transport，所有 client 都是 ACP adapter。本文件 Phase 4 重写时一并更新；目前请以 [[adr-0004]] 为准。

## 真实作用

Client 和 protocol adapter 负责把 agent core 的事件流呈现给用户或外部系统。

它们不拥有 agent 行为。

## 内外两层区分（[[adr-0003]] T1 / T4）

明确两层：

- **内层（不变量，由 core 拥有）：** `AgentEvent` 是 session 真值；`SessionEngine.runTurn()` 返回 `AsyncIterable<AgentEvent>` 只是进程内抽象，**不是对外协议**。
- **外层（每个 client 自己定义的 wire）：**

| Client | Wire 协议 | 实现位置 | 状态 |
| ------ | --------- | -------- | ---- |
| Web | HTTP + Server-Sent Events (SSE) | `apps/web-client` + 后续 backend route | M1-04 起步规范 |
| CLI | 进程内直接调用，按事件序列化为 ANSI/文本 | `apps/cli` | 占位中，M1-04 之后落地 |
| ACP | JSON-RPC 2.0 over stdio（**严格遵守 Zed Agent Client Protocol**） | `apps/acp-server` | M8 deliverable |

**禁止：** 直接把 `AgentEvent` JSON 通过 ws/sse 透传给外部。每个 client 都必须经过 mapper 把 `AgentEvent` 翻译成对应协议的 update 类型。不存在"自研 EventSource 协议"，async-iterable 仅用于进程内编排。

Client 类型：

- Web。
- CLI。
- TUI。
- IDE。
- ACP。
- Mobile。
- Channel integrations。

## 统一接口

所有 client 应围绕同一组能力：

- Create/load session。
- Send prompt。
- Stream events。
- Resolve permission request。
- Replay session。
- Inspect artifacts。
- Cancel turn。

## Web Client

Web 是第一回归面。

必须优先支持：

- Session list。
- Transcript。
- Event timeline。
- Permission panel。
- Tool inspector。
- Diff viewer。
- Context inspector。
- Regression runner。

## CLI

CLI 是薄 adapter。

职责：

- 读取用户输入。
- 渲染 streaming text。
- 展示 approval prompt。
- 支持 slash commands。
- 支持 non-interactive mode。

CLI 不应该实现自己的 agent loop。

## ACP Server

ACP 是 protocol adapter。

职责：

- JSON-RPC transport。
- Method mapping。
- Event-to-update。
- Permission forwarding。
- Error mapping。

ACP 不应该：

- 构建 context。
- 执行 tools。
- 修改 memory。
- 拥有 session state machine。

## Mobile Remote-Control

移动端未来作为 remote-control client：

- 查看 session。
- 接收通知。
- 批准权限。
- 暂停/恢复/取消任务。
- 查看结果和 diff 摘要。

移动端不应该运行 agent core。

## 常见坑

- Web 直接写 storage。
- CLI 和 Web 各自维护 session state。
- ACP adapter 复制 core state machine。
- Mobile 为了方便绕过 permission API。
- Client projection 与 replay projection 不一致。

## 测试策略

- Event fixture rendering。
- Live/replay equivalence。
- Permission approval flow。
- Cancel flow。
- ACP JSON-RPC fixtures。
- Mobile control event fixtures。
