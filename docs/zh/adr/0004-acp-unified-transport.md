---
title: "ADR 0004: ACP 作为统一 client-core 协议，stdio + Streamable HTTP 双 transport"
---

状态：Accepted

日期：2026-05-18

修订记录：取代 ADR-0003 §T1 / §T4 中"web=SSE / cli=进程内 / acp=stdio"的三协议描述。

## 背景

ADR-0003 的初版决策保留了三种 wire 形态：

- Web ↔ backend：私有 SSE。
- CLI ↔ core：进程内直接调用。
- ACP ↔ core：JSON-RPC stdio（Zed 原生）。

随后用户指出该方案让每个 client 各自实现一套协议，重复 mapper 工作量、并削弱了"client 是 adapter"的原则。Anthropic 的 MCP 已经为同类系统验证了"一套 JSON-RPC + 双 transport（stdio / Streamable HTTP）"的可行性。

进一步约束：

- 后期会有 remote-control / 远端 Web TUI / mobile 等场景；如果 CLI/TUI 走"进程内"特殊路径，远程化时要再造一遍轮子。
- 我们不应自创协议；ACP 是 Zed 主导的开放协议，**沿用是默认选项**。

## 决策

### 1. 协议层：唯一选择 ACP

所有 core ↔ client 通信都使用 **ACP（Agent Client Protocol）** JSON-RPC 2.0 消息格式作为契约：

- `session/new`、`session/load`、`session/prompt`、`session/cancel`、`session/update`（通知）等方法严格按 Zed ACP 规范实现。
- `AgentEvent`（事件溯源真值）由 mapper 转译为 ACP `session/update` 通知；外发到任何 client 前必经此 mapper。
- 不存在"私有 web 协议"或"私有 CLI 协议"。

### 2. Transport 层：两种 binding

| Transport | 用途 | 规范来源 |
|---|---|---|
| **stdio** | core 作为 acp-server 子进程暴露 JSON-RPC over stdio；editor（Zed 等）原生兼容 | Zed ACP 原生 |
| **ACP Streamable HTTP** | HTTP POST + SSE 响应 + session id header；用于 Web / mobile / 远程 TUI / 任何浏览器或跨主机消费者 | 项目自有扩展（命名对齐 MCP 的 "Streamable HTTP" 模式） |

**ACP Streamable HTTP 必须以独立 transport spec 落档**（项目自己的扩展，绝不冒名 Zed ACP），明确：

- 协议版本号 header
- 握手语义（initialize、capability negotiation）
- session id header 传递规则
- SSE 响应 chunk 边界
- 断线重连：客户端持本地 sequence cursor，服务端按 sequence 续传
- auth：默认 localhost only + bearer token；可选 mTLS

### 3. 组件层：acp-server + acp-daemon

新增两个一级 package：

- **`apps/acp-server`** — core 的 **canonical wire 形态**：单进程，读 stdin、写 stdout，按 Zed ACP 处理 JSON-RPC。一个进程一个 session。editor / IDE / 任何能 spawn 子进程的工具直接挂这个 binary，**不需要我们的 daemon**。
- **`apps/acp-daemon`** — HTTP+SSE 网关：监听端口、定义 ACP Streamable HTTP transport。每收到 `session/new` 就 spawn 一个 acp-server 子进程，全程做 1:1 复用，crash 隔离。

```text
              ┌─────────────────────┐
              │  packages/core      │
              │  (SessionEngine)    │  in-process TS API
              └─────────┬───────────┘
                        │ import
              ┌─────────▼──────────────┐
              │  apps/acp-server       │
              │  (stdio JSON-RPC)      │  Zed-native wire form
              └──┬──────────────────┬──┘
                 │                  │
            stdio│                  │spawn child per session
                 │                  │
       ┌─────────▼──────┐    ┌──────▼──────────────┐
       │ Zed / external │    │ apps/acp-daemon     │
       │ editors        │    │ (HTTP + SSE shell)  │
       └────────────────┘    └──────┬──────────────┘
                                    │ HTTP + SSE
                                    │
                ┌────────────┬──────┴──────┬────────────┐
                │            │             │            │
          ┌─────▼─────┐ ┌────▼────┐ ┌──────▼─────┐ ┌────▼───────┐
          │ Web client│ │ CLI     │ │ TUI        │ │ Mobile/etc │
          └───────────┘ └─────────┘ └────────────┘ └────────────┘
```

### 4. CLI / TUI 也走 HTTP，不开特殊后门

最初的草案曾允许 CLI / TUI 直接 spawn `acp-server` stdio 走"零启动延迟"。**该豁免取消。**

- CLI / TUI 默认 connect to local daemon（`localhost:<port>`），与 Web 走完全一致的 ACP Streamable HTTP。
- 没有 daemon 时，CLI 可以选择 `--standalone` flag 自起一个临时 daemon（一进程内同时含 daemon + acp-server），不暴露端口。
- 进程内直接 `import @custom-agent/core` 是 **测试 / 集成场景** 的优化路径，不是 production wire 形态。

理由：

- 未来 remote-control / 远端 web-TUI / mobile 都要走网络；如果 CLI/TUI 走特殊路径，远程化时要造第二套客户端。
- 没有特殊例外 = 没有维护两套消费者的负担。
- 测试中 mock daemon 比 mock stdio 简单。

### 5. Session 进程模型：1 session = 1 acp-server 子进程

daemon 收到 ACP `session/new` 时：

1. 分配 sessionId。
2. spawn 一个 acp-server 子进程，将 stdin / stdout / stderr 接到 daemon 内部 pipe。
3. 把 ACP 帧从 HTTP+SSE 透传到该子进程的 stdio。
4. 跨进程隔离：一个 session crash 只影响自身；其他 session 进程不受影响。

理由（vs 单进程多 session 复用）：

- 隔离干净：内存、文件 handle、未关闭的子进程都不会泄漏到其他 session。
- M1-01 的 `JsonlEventLog` 已经是"per file write queue + tail cache"模型，一个 session 一个进程刚好对齐。
- crash 半径最小。
- 代价是单机 50+ 并发 session 时的进程开销（可接受；后续 worker pool 模式如有必要再加）。
- 对标 LSP server-per-project。

### 6. ADR-0003 的修正项

ADR-0003 §T1 / §T4 的下述描述作废：

> - Web ↔ backend：Server-Sent Events (SSE) over HTTP
> - CLI ↔ core：进程内调用，无 wire
> - ACP ↔ core：JSON-RPC over stdio

以本 ADR 的"ACP 统一协议 + stdio 与 Streamable HTTP 双 transport"取代。ADR-0003 §T2 / §T3 / §T5（context overflow、cwd 不可变、不引入 ai-sdk）仍然有效。

## 影响

### 立刻生效

- M1-04 Replay API 不再设计私有 SSE，而是实现 **ACP Streamable HTTP 的 `session/load` + `session/update` 子集**，让 web client 通过相同的 wire 渲染 replay。
- handbook/layers/client-protocol-adapters.md 需要重写：去除三协议表格，改写为"协议=ACP；transport=stdio / Streamable HTTP"。
- M8 ACP Server 提前到 M2 之后：因为 wire 协议变成阻塞依赖，不再是后期适配工作。
- 引入两个新 work item：
  - **M1-ACP-STDIO**：实现 `apps/acp-server` 最小 stdio 帧 + `session/new` + `session/prompt` + `session/cancel` + `session/update`。
  - **M1-ACP-HTTP**：实现 `apps/acp-daemon`，定义 Streamable HTTP transport spec 文档，1:1 spawn 子进程。

### 风险与缓解

1. **Zed ACP 演进风险**：我们 follow Zed 主仓库；任何破坏性变更通过 capability negotiation handshake 隔离。
2. **Streamable HTTP 是项目扩展**：它**不是** Zed ACP 的一部分；在 transport spec 文档中清晰区分"协议（Zed ACP）"与"transport（项目扩展）"。
3. **session 进程开销**：M1-M2 阶段 daemon 默认开销低；如果未来观测到并发瓶颈，再评估 worker pool 模式。
4. **CLI 启动延迟**：每次启动新 session 需要 daemon 在线（本地默认自启）。`--standalone` 兜底。

## 后续工作

- 编辑 `handbook/layers/client-protocol-adapters.md`：删除三协议表，按本 ADR 重写。
- 新增 `apps/acp-server` + `apps/acp-daemon` package 占位（M1-ACP-STDIO / M1-ACP-HTTP work item）。
- 在 `02-roadmap.md` 把 M1-04 Replay API 描述改为 "Streamable HTTP `session/load` 子集"。
- 在 `07-implementation-backlog.md` 增加 M1-ACP-STDIO / M1-ACP-HTTP 条目。
- M8 ACP Server 重命名为 "M8 ACP Production Hardening"（认证、限流、TLS、远程化），实现层面提前到 M1 末尾。
