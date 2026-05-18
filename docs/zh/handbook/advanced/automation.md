---
title: "Scheduled Automations / Background Jobs"
---

> 拆自 `handbook/layers/future-capabilities.md`。本章讲 **MVP 不做** 的定时任务 / 后台任务能力——但 MVP 必须把"任务"建模为 session，避免后期另起一套隐藏任务系统。也兼带提一下产品级 multi-agent 编排（同一根 session 模型下的扩展）。

---

## 1. 场景

| 场景 | 现在没法做 |
|---|---|
| "每天早上 9 点跑一遍依赖更新 check" | local agent 进程不在线时无法触发 |
| "每个 PR 创建后自动跑 code review skill" | 没有 event-driven 触发机制 |
| "构建失败时 agent 自动尝试修复" | 没有外部 event → session trigger 通道 |
| "每周生成项目健康报告" | 没有持久化的 schedule storage |

**为什么"等到 M10 再做"是可接受的**：定时任务在没有 remote runtime（[[remote-execution]]）之前没有 production 部署位置；M9 之前 local-first agent 谈定时意义不大。

**为什么必须在 MVP 阶段就在心里有这条线**：如果 MVP 设计成"session 是用户驱动的"，到 M10 才发现要支持"系统驱动的 session"会撕裂 session 模型。

## 2. 核心原则：任务也是 session

```text
不要：                              要：
┌────────────────────┐             ┌────────────────────────────┐
│ Scheduler           │             │ Scheduler                  │
│  ↓                  │             │  ↓ trigger fire            │
│ TaskRunner          │             │ daemon API:                │
│ （独立 runtime）    │             │   session/new from schedule│
│  ↓                  │             │  ↓                         │
│ TaskState           │             │ 普通 SessionEngine.runTurn │
│ TaskLog             │             │  → 普通 event log          │
│  → 与 session 完全  │             │  → 普通 PermissionEngine   │
│    无关             │             │  → 普通 replay / web view  │
└────────────────────┘             └────────────────────────────┘
                                    
（坏：两套状态机、两套 audit）       （好：一套抽象服务两类触发）
```

**所有定时任务都是 session**。trigger 不同（user message vs cron fired），但 session 行为不区分。

## 3. 触发模型

3 类 trigger，统一进 daemon 内部触发器：

| Trigger | 例子 | 落地位置 |
|---|---|---|
| **Schedule** | cron 表达式："0 9 ** *" | daemon 内置 scheduler，存储在 `~/.config/.../schedules.json` |
| **External event** | webhook（GitHub PR opened）、文件系统变化 | daemon 暴露 webhook endpoint 接收外部触发 |
| **Session reaction** | "上一个 turn `turn.completed` 后立即跑这个 skill" | event log subscriber pattern |

trigger 触发后：

```text
trigger fires
   │
   ▼
emit `automation.triggered` event (含 sourceTriggerId)
   │
   ▼
daemon 调用 session/new + session/prompt
   │  with messages: 由 trigger spec 模板化得到
   │
   ▼
正常 turn 走完
   │
   ▼
emit `automation.completed` event (含 sourceTriggerId, sessionId, outcome)
```

任意 web / mobile 客户端可 query `automation.*` event 看历史触发与结果。

## 4. 权限：自动化的特殊麻烦

定时任务的 ApprovalUI 麻烦：触发时用户可能不在线。

| 处理 | 策略 |
|---|---|
| **预先批准 session policy** | trigger 注册时一并定义"这个 schedule 自动允许 read tools，不允许 destructive" |
| **timeout policy** | turn 内遇到 `ask` 决策且无人 approve → 30 min timeout → 视为 deny → emit `turn.completed(stopReason=error, errorCode=permission_timeout)` |
| **push 通知到 user** | 远端 user 收到 mobile push；可在外面 approve（[[remote-execution]] §3.4） |
| **完全无人模式** | high-trust 项目可注册"全部 read tools auto-allow"的 schedule；但 destructive **永远** 走 timeout deny |

**永远不能放宽的约束**：destructive 决策**任何 trigger 下都不能预先批准**。timeout 触发后必须 deny + 通知 user。

## 5. 安全：自动化扩大攻击面

定时任务让攻击者多一个入口：

| 攻击面 | 缓解 |
|---|---|
| 攻击者注入恶意 schedule | schedule 创建 / 修改要经过 user 审批；schedule 列表在 ApprovalUI 可见 |
| 触发频率过高烧 provider quota | 每个 schedule 配速率限制；超频 → emit `automation.rate_limited` |
| 自动化 session 内 prompt injection（如 webhook payload 含恶意指令） | trigger 数据按 untrusted 处理；与 MCP tool output 同等级 |
| schedule 调用外部 webhook → 信息泄漏 | 出站 host allowlist；与 plugin sandbox 共用 |
| user 离线时 destructive 动作被批准 | destructive 永不被 schedule policy 预批；timeout deny |

## 6. 重试与失败

| 状态 | 处理 |
|---|---|
| `turn.completed(stopReason=error)` | schedule 重试策略：N 次 + 指数退避；超限后开 incident issue |
| `permission_timeout` | 不重试（user 没在；硬重试只会再 timeout）；emit `automation.skipped` |
| provider quota 耗尽 | 退避到下一个 quota 周期；emit `automation.deferred` |
| session crash | daemon level supervisor 重启 acp-server；session 用 event log replay 恢复 |

所有重试 / 跳过都进 event log，audit 可看完整时间线。

## 7. Product-Level Multi-Agent 编排

多 agent 协作是定时任务的高级延伸——一个 session 跑完后触发另一个 session（"agent A 跑完 PR review，自动让 agent B 跑 lint fix"）。

需要的能力：

| 能力 | 状态 |
|---|---|
| Session graph（一个 session 触发另一个） | MVP event log + automation trigger 已经能支持 |
| Task delegation event | M10+ 新增 `task.delegated` / `task.completed_by_peer` |
| Agent role | manifest 声明 agent 擅长 / 不擅长什么；用于路由决策 |
| Conflict resolution | 两个 agent 都想改同一文件 → 走 candidate workflow，user 最终拍板 |
| Tool ownership | 不允许同时 N 个 agent 调用同一 destructive tool；用 lock event |

**MVP 不引入 multi-agent runtime**——但 session model + event log + permission engine 都已经为它准备好了：

- 多 agent 编排 = 多 session 嵌套调用
- 跨 agent 通信 = event log 共享 / subscribe
- 工具竞争 = PermissionEngine + lock event

到 M10 写 ADR 时只需要补 task.* event 类型，不需要重写 core。

## 8. 反模式

| 反模式 | 原因 |
|---|---|
| 写一个独立的 BackgroundTaskManager service | 与 session 模型并列两套 state；audit / replay 分裂 |
| 自动化绕过 PermissionEngine | 任何工具调用都要经过 gate；自动化 = 预先批准的 policy，**不是**免审批 |
| schedule 的 cron 字符串运行时变更（自我修改） | schedule 修改也走 candidate / audit；不允许 agent 自己加新 schedule |
| 把"agent 自我训练循环"做成 automation | self-evolving 走 [[adr-0002]] §"Self-Modifying Prompts" 流程；不能用 schedule 偷偷 self-update |

## 9. 实施路径

| 阶段 | 工作 |
|---|---|
| M0-M9（当前） | 保持 session 抽象 location/trigger 无关；event log subscriber pattern 落地（M9b ops） |
| M10-AUTOMATION ADR | 写 trigger 模型 / schedule storage / 失败重试 / 安全模型 |
| M10-AUTOMATION | 实装 daemon 内置 scheduler + webhook receiver + ApprovalUI 集成 |
| M10-MULTI-AGENT | 补 task.delegated 等 event 类型；编写 ADR；不强制 |
| 后续 | marketplace 集成的 automation 模板 |

## 10. 进一步阅读

- [[adr-0002]] §"Scheduled / background automations" + §"Product-level multi-agent exploration" — 总预留
- [`remote-execution.md`](remote-execution.md) — automation 默认要 remote daemon 才有意义
- [`plugin-system.md`](plugin-system.md) — plugin 提供新的 automation trigger 模板
- [`../implementation/tools-and-permissions.md`](../implementation/tools-and-permissions.md) §7 — Policy 持久化（schedule 预批准的载体）
