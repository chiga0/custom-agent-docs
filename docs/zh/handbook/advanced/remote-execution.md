---
title: "Remote Execution（远端执行 / Mobile Remote-Control）"
---

> 拆自 `handbook/layers/future-capabilities.md`。本章讲 **MVP 不做但架构必须预留** 的远端执行能力——把 agent runtime 放在远程主机 / 容器 / 云端，本地客户端（含 mobile）只做"遥控 + 审批 + 观察"。

---

## 1. 为什么要预留 remote execution

local-first 是 M0-M9 的主线，但下面四类场景在 M9 之后基本无法回避：

| 场景 | 为什么 local-first 不够 |
|---|---|
| 笔记本休眠时 agent 还在跑测试 | local agent 进程被 OS suspend；任务挂死 |
| 跨设备工作（公司笔记本起一个 session，家里继续） | local-only 状态没法同步到第二台机 |
| Mobile 想审批 / 取消正在跑的 turn | mobile 没有跑 agent runtime 的能力 |
| 团队共享一台云端 GPU 跑昂贵 provider 调用 | 多人 share local process 是反模式 |

**如果 MVP 架构不预留 remote**，到 M10 才补会发现：

- Session state 散在内存（无法跨主机迁移）→ 需重写 SessionEngine
- Event stream 假设 in-process 单消费者 → 需重写 EventStore port
- Permission UI 假设同 OS 弹窗 → 需重写 Approval lifecycle

所以 MVP 的设计原则是 **"远端化"不是新能力，而是把同一套抽象搬到不同位置**。

## 2. 远端化必须复用的抽象

```text
locally:                              remotely (M10+):
┌──────────────────┐                  ┌──────────────────────────┐
│ Web client       │                  │ Web client (any device)  │
└────┬─────────────┘                  └────────────┬─────────────┘
     │ ACP Streamable HTTP                          │ ACP Streamable HTTP over TLS
     │ (loopback)                                   │ (public address + auth)
     ▼                                              ▼
┌──────────────────┐                  ┌──────────────────────────┐
│ apps/acp-daemon  │                  │ apps/acp-daemon          │
│ on localhost     │                  │ on remote host           │
└────┬─────────────┘                  └────────────┬─────────────┘
     │ spawn child per session                     │ spawn child per session
     ▼                                              ▼
┌──────────────────┐                  ┌──────────────────────────┐
│ apps/acp-server  │                  │ apps/acp-server          │
│  ↓ uses          │                  │  ↓ uses                  │
│ packages/core    │                  │ packages/core            │
│ SessionEngine    │                  │ SessionEngine            │
└──────────────────┘                  └──────────────────────────┘
```

**唯一变化是 daemon 的网络位置 + auth**。其他都不变：

- ACP 协议 / Streamable HTTP transport ：相同（[[adr-0004]]）
- Event log JSONL 格式：相同（M1-01）
- PermissionEngine 决策：相同（M3）
- SessionEngine 状态机：相同（M1-03）
- Tools / Skills / MCP：相同

所以 "remote agent" **不是新功能**，是 daemon 部署位置的迁移。

## 3. Remote-Specific 关注点

### 3.1 Authentication / Authorization

| 层 | local 默认 | remote 必须 |
|---|---|---|
| daemon HTTP listener | localhost:port | TLS + bearer token / mTLS |
| client 自我标识 | OS process owner | 显式 credential 协商 |
| auth scope | full session 控制 | 可分级（read-only viewer / approver / driver） |

| Scope | 能做 | 不能做 |
|---|---|---|
| viewer | replay 已有 session、监听 live update | 不能 prompt、不能 approve |
| approver | viewer + 回复 `permission.requested` | 不能 prompt、不能 cancel |
| driver | approver + `session/prompt`、`session/cancel`、`session/new` | 不能管理 daemon 配置 |
| admin | driver + daemon 配置、provider key 管理 | (本机管理员) |

scope 必须落到 ACP capability negotiation（`initialize` 响应里告诉 client "你能做什么"）。

### 3.2 Network 失败语义

local daemon 不会"断网"。remote daemon 会。

| 情况 | 处理 |
|---|---|
| client 网络断 | client 持 `sequenceCursor` 续传；daemon 保留 SSE buffer N 秒；超时 client 主动 reconnect |
| daemon 主动 push 时连接掉 | daemon 持 outbound queue per session；client 重连时按 cursor 续 |
| daemon 重启（云端运维事件） | session 进程状态依赖 event log；client 重连时由新 daemon 实例从 JSONL replay 恢复 session view |

ACP Streamable HTTP transport spec（[[adr-0004]] §2）必须包含这套语义。本地 daemon 共享同套实现——避免两套代码。

### 3.3 Artifact 同步

agent 产生的 artifact（修改的文件、生成的 diff、长 stdout）在 remote 模式下需要回流到 client：

| 类型 | 处理 |
|---|---|
| 小 artifact（< 1MB） | 直接进 event payload preview |
| 大 artifact | 落 daemon 端的 artifact storage；event 含 URI + content hash；client 按需 fetch |
| 用户工作树（workspace files） | **不**自动同步；session.cwd 是 daemon 端的路径；本地客户端不假设有同样的文件系统 |

**关键**：mobile 客户端**永远不要假设有 workspace 副本**。它能做的是：viewer / approver / driver 级动作；不可能本地 diff 一个 daemon 端的 worktree。这定义了 mobile 的产品边界。

### 3.4 Permission UI 的异步性

local：approval 弹窗当下出现，user 立刻点击。
remote：approval 可能在用户在地铁里时触发；需要 push 通知 + 30-300s timeout。

| 设计点 | 处理 |
|---|---|
| 触发媒介 | push notification（mobile / 桌面）；email fallback |
| timeout | session policy 配置；默认 deny on timeout |
| 多人参与 | 同一 session 多 approver 在线时谁先点谁先算；其他 approver 收到"已被 X 批准/拒绝"通知 |
| 长 turn 内多次 ask | 每次都重新触发通知；不能用前次 approval 一直放行（destructive 永不复用 [[tools-and-permissions]]） |

## 4. Mobile Remote-Control 的定位

Mobile 是 **remote client 的特殊形态**——不是新概念。

```text
Mobile 是什么：               Mobile 不是什么：
✓ ACP Streamable HTTP client  ✗ agent runtime
✓ replay viewer               ✗ tool executor
✓ approval surface            ✗ memory writer
✓ session monitor             ✗ session orchestrator
✓ notification consumer       ✗ workspace editor
```

mobile App 的 minimum viable surface：

| Tab | 功能 |
|---|---|
| Sessions | list / search / filter；点进去看 replay |
| Approvals | 待批准的 `permission.requested`；带 risk 颜色和 rationale |
| Notifications | 高风险动作 / 长 turn 完成 / 失败 |
| Settings | daemon endpoint / token / push 偏好 |

**不做的事**（明确写到 mobile 产品 spec）：

- ❌ mobile 直接调用 tool / 修改文件
- ❌ mobile 写 memory candidate（candidate workflow 走 main client）
- ❌ mobile 安装 MCP server / skill
- ❌ mobile 跑 SessionEngine

## 5. 实施路径

| 阶段 | 工作内容 |
|---|---|
| M1-M9（当前） | 保留所有抽象的 location-independent 性质：ACP wire、event log JSONL、PermissionEngine、SessionEngine 都不假设 in-process 单 user |
| M10-01 ADR | 写 Remote Runner ADR；定义 scope / auth / artifact / push 通知模型；不写代码 |
| M10-RUNNER | 落实 remote daemon TLS + auth；扩 `initialize` capabilities 协商 scope |
| M10-MOBILE | 写 mobile client（约 React Native）；只读 + approval surface |
| 后续 | 多人协作（multi-driver）；session migration（local → remote 迁移）；offline mode |

## 6. 反模式（要避免的设计）

| 反模式 | 为什么不行 |
|---|---|
| daemon 上跑 N 个 session 共享一个 event log 文件 | 失去 [[adr-0004]] 的 "1 session = 1 子进程" 隔离；一台 session crash 拖垮其他 |
| mobile 直接调用 PermissionEngine.check | PermissionEngine 是 server-side 决策点；mobile 是 approver UI，不是决策方 |
| session 状态分布在 daemon memory + client memory | session 真值只在 event log；client / mobile 都按 replay 投影 |
| 引入 WebSocket 替代 SSE | SSE 单向流够用；引入 WebSocket 等于增加协议复杂度（连接管理 / 帧分片）；用 SSE 续传 cursor 解决重连 |
| remote agent 自动同步整个 workspace 到本地 | mobile 上行没意义；笔记本同步要单独设计；MVP 不做 |
| auth 用 OS keychain 直接放 daemon-side | secret 落到远端机器风险大；用短期 token + refresh 模式 |

## 7. 进一步阅读

- [[adr-0002]] §"Remote control / remote execution" — 总框架性预留
- [[adr-0004]] §2 §5 — ACP Streamable HTTP 设计直接服务 remote
- [`plugin-system.md`](plugin-system.md) — plugin 系统在 remote 下的部署约束
- [`automation.md`](automation.md) — scheduled job 也以 session 为基础
