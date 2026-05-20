---
title: "Client 与 Protocol Adapters"
---

> 本章节已根据 [[adr-0004]] 与 M1 实际落地（M1-ACP-STDIO、M1-ACP-HTTP、M1-04、M1-WEB-01）整体重写。Web / CLI / TUI / IDE / Mobile 都是同一份 **Zed Agent Client Protocol (ACP)** 的 client，只是 transport 不同。不再存在"每个 client 一套 wire"的旧模型。

## 真实作用

Client 和 protocol adapter 负责把 agent core 的事件流呈现给用户或外部系统。

它们不拥有 agent 行为；不存储 session state；不构建 context；不直接执行 tool。

## 内外两层

- **内层（agent core 拥有）：** `AgentEvent` 是 session 的真值；`SessionEngine.runTurn()` 返回的 `AsyncIterable<AgentEvent>` 是进程内抽象，**不是对外协议**。任何 client 都不能拿到原始 `AgentEvent` JSON。
- **外层（外部协议 = Zed ACP）：** 唯一的对外协议是 ACP。所有 client（Web / CLI / TUI / IDE / Mobile）都通过 ACP 的 `session/update` 通知接收事件，通过 `initialize` / `session/new` / `session/load` / `session/prompt` / `session/cancel` 发起请求。

`apps/acp-server/src/event-mapper.ts` 是唯一的 `AgentEvent → SessionUpdate` 翻译入口。**禁止** 直接把 `AgentEvent` 通过任何 wire 透传给外部。

## Transport 矩阵（ADR-0004）

ACP 协议只有一套；transport 有两种实现：

| Transport | 实现位置 | 谁用 |
| --------- | -------- | ---- |
| stdio (JSON-RPC, 1 行 1 帧) | `apps/acp-server` | 编辑器直接 spawn（Zed 等） |
| Streamable HTTP + SSE | `apps/acp-daemon` 转发到 `apps/acp-server` 子进程 | Web / TUI / Mobile / 远程 client |

详细 wire spec 见 `apps/acp-daemon/SPEC.md`（HTTP+SSE 的 endpoint、auth、cursor、replay 语义、session id 校验规则）。

## ACP Server（`apps/acp-server`）— M1-ACP-STDIO

- 单进程拥有最多一个 session。多 session 由 daemon 多 spawn 子进程实现。
- 实现 `Agent` 接口：`initialize` / `authenticate` / `newSession` / `loadSession` / `prompt` / `cancel`。
- 用官方 Zed ACP SDK 的 `AgentSideConnection + ndJsonStream` 处理 framing / dispatch / cancel-as-notification 等协议细节。
- 持久化通过 `JsonlSessionStore`：`<ACP_EVENT_LOG_ROOT>/<sessionId>.jsonl`，单 session 单文件。
- `loadSession` 是 M1-04 的入口：读 JSONL → `mapEventToUpdate` → 发 `session/update` 通知 → 返回 `{}`。loadSession 后 prompt 被拒绝（"replay only"），engine 状态未从事件重建。

## ACP Daemon（`apps/acp-daemon`）— M1-ACP-HTTP

- HTTP+SSE 网关。POST `/rpc` 收 JSON-RPC，GET `/events` 推 `session/update`，GET `/healthz` liveness。
- Bearer token 鉴权（fail-closed），`X-ACP-Session-Id` 路由 + body `params.sessionId` 一致性校验（不一致 400）。
- 每个 ACP session 对应一个 `apps/acp-server` 子进程；session 之间 crash 隔离。
- session id 必须匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`（防 path traversal / header injection / 日志噪音）。
- 子进程通过 `ACP_EVENT_LOG_ROOT` 环境变量共享 event log root，让 writer / replay 子进程都能定位同一份 JSONL。
- Per-session SSE cursor：环形 buffer 256 条，monotonic 1-起步，`Last-Event-ID` 重连，cursor 超出窗口写 `event: cursor_lost` 并关闭。
- 子进程 crash 时发 `event: terminated` + `data: {"jsonrpc":"2.0","method":"_daemon/terminated","params":{...}}`，30 s grace 后 GC。

## Web Client（`apps/web-client`）— M1-WEB-01

Web 是第一回归面与可观测面，纯 ACP client：

- 配置 daemon URL + bearer token。
- `Start new session` → `session/new` → 绑定 SSE → `session/prompt` 驱动一轮 turn。
- `Load by id` → `session/load` → SSE 回放历史 `session/update`。
- `End session` 主动断开 SSE。

实现按 4 层切分：

- `transcript.ts` 纯 reducer：`applySessionUpdate(state, update)`，role-coalescing user/agent 文本块。
- `sse.ts` 纯解析器：手写 SSE 帧解析（fetch + ReadableStream，不用 EventSource——它发不了 bearer header）。
- `daemon-client.ts` wire helpers：`newSession` / `loadSession` / `prompt` / `subscribe()`（AsyncIterable&lt;StreamEvent&gt;）。
- `main.ts` DOM glue：按钮、输入、transcript 渲染、状态行；render 函数 `renderTranscriptHtml` 对 user/agent 文本做 HTML escape。

forward-compat：transcript reducer 对未知 `SessionUpdate` 变种（tool_call / plan）no-op，保证 M3+ 协议拓展不会让 web shell 崩。

## CLI（`apps/cli`）— 占位

未实现。计划：

- 同样走 ACP wire（stdio 或 daemon HTTP）。
- 渲染 streaming text + 接收 approval prompt。
- 不实现自己的 agent loop。

## 远程 / Mobile / IDE / TUI

都是同一份 ACP client。Mobile remote-control 等高级形态见 [[advanced/remote-execution]]。

## 边界规则（mainline-guardian 守护）

`tests/architecture/architecture-fitness.test.ts` 强制：

- `apps/acp-daemon` 不得依赖 `packages/core`（daemon 是纯 transport）。
- `apps/web-client` 不得依赖 `packages/core` / `packages/storage`（web 只走 ACP wire）。
- `packages/core` 不得依赖 `apps/*`（client 不能反向耦合 core）。

违反者 CI 直接 fail。

## 测试策略（每层各管一段）

- ACP server：单元 + JSONL 持久化 + ACP `session/load` 回放与 `session/new + prompt` 等价。
- ACP daemon：HTTP+SSE 单元（mock 子进程）+ smoke（real subprocess via `process.execPath`）+ live≡replay 等价 smoke。
- Web client：transcript reducer / SSE parser / daemon-client wire 三类纯单元 + view escape 测试。
- 跨包：`packages/qa-fixtures` 提供 canonical fake turn 的 normalized fixture，daemon / acp-server / web client 任何一层 drift 都会同时被 golden 与 live≡replay 触发。

## 常见坑

- Client 直接读写 `packages/storage` —— 用 ACP `session/load`。
- 自创 wire 协议 —— ADR-0004 之后只有 ACP。
- 在 ACP server / daemon 里放业务逻辑 —— 只许 mapping、路由、forwarding。
- 用 EventSource —— 它不允许自定义 header；daemon 的 bearer auth 走不通。
- session id 没校验直接当文件名 —— path traversal 漏洞；daemon 已加正则校验，client 端应同样不构造 hostile 值。
