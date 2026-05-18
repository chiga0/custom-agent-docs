---
title: "MCP（Model Context Protocol）集成"
---

> 重写自 `handbook/layers/mcp.md`（A2 audit 评分 2/5）。原版只列了 checklist，没解释"MCP 跟 local tool / skill 的区别"，新手读完不知该用 MCP 做什么。本版以"MCP 是什么 + 一次 MCP tool 调用的完整事件链 + stdio vs Streamable HTTP transport"为骨架。

---

## 1. MCP 是什么，解决什么问题

MCP（Model Context Protocol）由 Anthropic 主导设计，是 **agent ↔ 外部能力提供者** 的开放协议。一个 MCP server 暴露三类资源：

| MCP 资源类型 | 类比 | 用途 |
|---|---|---|
| **Tools** | 可执行函数 | 让 agent 调用外部能力（运行测试、查 Jira、访问数据库） |
| **Resources** | 只读数据条目 | 让 agent 读取外部上下文（文件、API 响应、知识库片段） |
| **Prompts** | 参数化模板 | 让用户 / agent 触发标准化任务（"用 commit message 模板生成提交"） |

为什么 agent 框架要内建 MCP 而不是"每家自己写 plugin"：

| 没有 MCP 的世界 | 有 MCP 的世界 |
|---|---|
| Cursor / Claude Code / Aider 各自有 plugin schema；同一个工具要写 3 套适配 | 写一次 MCP server，三家通用 |
| plugin lifecycle / 错误处理 / 资源限额各家不同 | 同一套 `initialize` / `tools/list` / `tools/call` 协议；统一处理 |
| 外部能力供应商难以独立发版 | MCP server 是独立进程 / 独立 binary，独立 release |

**本项目立场**：MCP 是**唯一的外部能力扩展协议**。所有非 core 的 tool、resource、prompt 都通过 MCP；不允许自定义 plugin API。

## 2. 架构定位

```
        ┌─────────────────────────────────┐
        │  packages/core (SessionEngine)  │
        └─────────────┬───────────────────┘
                      │ 调用 ToolRouter
                      ▼
        ┌─────────────────────────────────┐
        │  ToolRouter                      │
        │   - local tool registry          │
        │   - mcp.<server>.<tool> registry │
        └─────────────┬───────────────────┘
                      │
        ┌─────────────▼───────────────────┐
        │  PermissionEngine                │ ← 所有工具调用必经
        └─────────────┬───────────────────┘
                      │ allow
                      ▼
        ┌─────────────────────────────────┐
        │  ToolExecutor                    │
        │   - local: 直接 exec             │
        │   - mcp: 通过 MCPClient 转发     │
        └─────────────┬───────────────────┘
                      │ mcp tool
                      ▼
        ┌─────────────────────────────────┐
        │  packages/mcp-client             │
        │   - servers registry             │
        │   - stdio transport adapter      │
        │   - http transport adapter       │
        └────┬─────────────────────┬──────┘
             │ stdio                │ http
   ┌─────────▼─────────┐   ┌───────▼───────────┐
   │ MCP server (子进程)│   │ MCP server (远程) │
   └───────────────────┘   └───────────────────┘
```

**`packages/mcp-client`** 是项目对 MCP 的 client-side 实现（M6 引入）。core 不直接 talk MCP；core 只用 ToolRouter / PermissionEngine 抽象。

## 3. MCP Server 生命周期

```
                配置文件 (mcp.config.json)
                       │
                       ▼
              MCPClient.connect(serverConfig)
                       │
       ┌───────────────┴───────────────┐
       │ stdio                          │ http (Streamable HTTP)
       ▼                                ▼
  spawn 子进程                      HTTP POST + SSE
  绑定 stdin/stdout                  跟踪 session id header
       │                                │
       └───────────────┬───────────────┘
                       ▼
            发 initialize JSON-RPC 请求
                       │
                       ▼
       Server 响应 initialize: capabilities, version, etc.
                       │
                       ▼
            发 tools/list, resources/list, prompts/list
                       │
                       ▼
       注册到 ToolRouter (namespaced: mcp.<server>.<tool>)
                       │
                       ▼
       ┌──────────────────────────────────────────┐
       │ 服务期：tools/call, resources/read,       │
       │         prompts/get （来自 PermissionEngine │
       │         allow 后的 ToolExecutor 调用）    │
       └──────────────────────────────────────────┘
                       │
                       ▼
       Server crash / 主动 shutdown
                       │
       ┌───────────────┴───────────────┐
       │ stdio: 子进程退出 → MCPClient  │
       │   监听 → emit mcp.server.crashed│
       │ http: SSE 断开 → 重试 N 次 →   │
       │   失败后 emit mcp.server.crashed│
       └───────────────────────────────┘
                       │
                       ▼
       从 ToolRouter 中 unregister 这台 server 的所有 tools
       影响的 turn 收到 tool 失败 → stopReason 视情况
```

约束：

- **MCP server 默认不可信**：所有响应都按"untrusted JSON"处理；不允许 server 反向控制 agent。
- **crash 隔离**：一台 server crash 只影响来自该 server 的 tool；其他 tool / session 不受影响。
- **server 不能直接进 event log**：所有可见动作都通过 `tool.*` / `mcp.*` event 流出，由 MCPClient 加工。

## 4. Stdio vs Streamable HTTP Transport

MCP 协议本身（JSON-RPC 消息格式）不变，但 transport 有两种：

| 维度 | stdio | Streamable HTTP |
|---|---|---|
| 部署位置 | 本地 binary，子进程 | 任意 HTTP 可达地址 |
| 启动方式 | `child_process.spawn` | HTTP `POST /mcp/...` + SSE |
| auth | 进程隔离即 auth | bearer token / mTLS |
| 重连 | 子进程 crash → 重 spawn | SSE 断开 → 客户端持 sequence cursor 续传 |
| 适用场景 | 本机 dev tools（filesystem、git、jq）；离线 | 团队共享服务（私有数据库、企业 API）；远程 |
| 启动延迟 | 50-500ms（看 binary） | 100ms-500ms（看网络） |

**对应到本项目**：M6 落地 stdio；M7 落地 Streamable HTTP。

## 5. Tool Namespace

不同 MCP server 可能暴露同名 tool（比如多个 server 都有 `read_file`）。命名空间：

```
local tools:           read_file, list_files, search_text, shell, apply_patch
MCP server "fs":       mcp.fs.read_text, mcp.fs.list_dir
MCP server "jira":     mcp.jira.get_issue, mcp.jira.search
MCP server "fs-v2":    mcp.fs-v2.read_text  ← 与 mcp.fs.read_text 共存无冲突
```

ToolRouter 的去重 / 路由规则：

1. 用户 / model 输入的 tool 名通过严格匹配解析。
2. 不允许 local tool 与 MCP tool **同名**（即不允许写 `mcp.fs.read_file` 把它命名成 `read_file` 让它覆盖 local）。
3. 不同 server 的同名 tool **靠 server name 区分**：`mcp.fs.read_text` ≠ `mcp.fs-v2.read_text`。
4. 模型给出的 tool 名如果是模糊的（"read_file"），ToolRouter 默认走 local tool；要调 MCP 必须用全名。

## 6. 一次 MCP Tool 调用的完整事件链

User: "查一下 Jira issue PROJ-123 的状态"。M6 + M3 落地后形态。

```
seq=N    user.message              {content: "查一下 Jira issue PROJ-123 的状态"}
seq=N+1  context.built              {tools: [..., "mcp.jira.get_issue", ...]}
seq=N+2  model.delta                {text: "我查一下..."}

seq=N+3  model.tool_call_requested  {tool: "mcp.jira.get_issue", args: {key: "PROJ-123"}}

         ↓ ToolRouter.resolve("mcp.jira.get_issue")
         ↓   → namespace=jira, mcp tool=get_issue
         ↓   → forward to MCPClient.servers.jira

seq=N+4  permission.requested       {
                                     tool: "mcp.jira.get_issue",
                                     args: {key: "PROJ-123"},
                                     riskAtDecision: "network",
                                     sourcedFrom: "default"
                                   }
                                   ← ApprovalUI 显示给 user
                                   ← user 点 "Allow for this session"
seq=N+5  permission.resolved        {decision: "allow", actor: "user", policyApplied: "session_allow"}

seq=N+6  mcp.call.started           {
                                     server: "jira",
                                     toolCallId: "tc_xyz",
                                     method: "tools/call",
                                     args: {name: "get_issue", arguments: {key: "PROJ-123"}}
                                   }

seq=N+7  tool.started               {tool: "mcp.jira.get_issue", toolCallId: "tc_xyz"}

         ↓ MCPClient 通过 stdio 发 JSON-RPC：
         ↓   {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{...}}
         ↓ MCP server 处理 → 返回结果

seq=N+8  mcp.call.completed         {server: "jira", toolCallId: "tc_xyz", durationMs: 420}
seq=N+9  tool.completed             {
                                     tool: "mcp.jira.get_issue",
                                     toolCallId: "tc_xyz",
                                     resultPreview: "PROJ-123: In Progress, assignee=...",
                                     resultSize: 1240
                                   }

seq=N+10 model.delta                {text: "PROJ-123 当前状态是 In Progress..."}
seq=N+11 turn.completed             {stopReason: "final"}
```

注意几点：

- `mcp.call.started / mcp.call.completed` 是 **transport 层 event**（让 MCP 调用本身可审计）；`tool.started / tool.completed` 是 **agent 层 event**（与 local tool 同形态）。两套 event 都进 event log，不互斥。
- `permission.requested.riskAtDecision: "network"` —— MCP 工具默认按 network risk 评估（除非 tool metadata 声明更低 risk）。
- 工具结果 `resultPreview` 是截断的；完整结果走 artifact storage（M9b）。

## 7. Resources：与 Tools 的关键区别

```
Tool         = "agent 可执行的动作"  → 模型主动调用，permission gate
Resource     = "agent 可读取的资源" → user / policy 显式 include，**不自动加 context**
Prompt       = "可参数化的模板"     → user / agent slash command 触发
```

为什么 resource 不自动加 context：

| 自动加的后果 | 显式 include 的好处 |
|---|---|
| 一个 MCP server 报"我有 50000 个 resource"，全部进 context → token / 钱 / 延迟爆炸 | user 知道在看什么；ContextBuilder 按 budget 分配 |
| Resource 内含恶意指令 → prompt injection 反向操控 agent | 至少用户主动选择过，进 context 时也带 `[mcp:server:resource]` 前缀 |
| 没法做权限粒度 | 每个 resource include 都走 PermissionEngine（risk=read 通常 allow） |

资源 include 的事件流：

```
seq=N    mcp.resource.requested    {server: "wiki", uri: "wiki://docs/architecture"}
seq=N+1  permission.requested      {risk: "read", sourcedFrom: "user_explicit_include"}
seq=N+2  permission.resolved       {decision: "allow"}
seq=N+3  mcp.resource.fetched      {server, uri, sizeBytes: 8240, contentHash: "sha256:..."}
seq=N+4  context.built             {sources: { mcpResources: ["wiki://docs/architecture"] }}
```

## 8. Prompts：参数化触发

MCP prompt 类似可被 slash command 触发的 SOP：

```yaml
# MCP server 暴露 prompt
name: bugfix_review
description: 对 bug 修复 PR 跑一遍 review checklist
arguments:
  - name: pr_number
    type: integer
    required: true
  - name: severity
    type: string
    enum: [critical, normal]
    required: false
```

用户在 Web/CLI 触发：`/prompt bugfix_review pr=456 severity=critical`。

事件流：

```
seq=N    user.message              {content: "/prompt bugfix_review pr=456 severity=critical"}
seq=N+1  mcp.prompt.invoked        {server, prompt: "bugfix_review", arguments: {pr_number: 456, severity: "critical"}}
seq=N+2  mcp.prompt.expanded       {messages: [...]}  ← server 返回 ChatML 列表
seq=N+3  user.message              {content: <expanded ChatML 的等价 user 输入>}
... 正常 turn 继续
```

约束：

- prompt 参数必须由 server schema 校验，client 端不接收 unknown 参数。
- 展开后的 messages 视同 user.message，**仍走 ContextBuilder 装载**——不能"插队"到 system prompt。

## 9. 与 Skill 的对比

| | Skill | MCP |
|---|---|---|
| **拥有方** | 本仓库（git）| 外部（独立 server 进程）|
| **格式** | `SKILL.md` + body | JSON-RPC handshake + tools/resources/prompts |
| **加载方式** | metadata eager + body lazy | tools/resources/prompts list 在 server connect 时加载 |
| **运行位置** | agent 进程内 | 独立 server 进程 / 远程 |
| **更新节奏** | 跟 repo commit | 跟 server release |
| **典型用途** | 项目 SOP（mainline-guardian / code-review-checklist）| 外部能力（jira / database / filesystem indexer / OS API）|

**简单决策**：

- 想固化一个**项目内的工作流** → skill。
- 想接入一个**外部能力提供者** → MCP server。
- 一个**通用能力**（多项目都会用） → 写成 MCP server 比 skill 复用性更好。

## 10. 安全模型

MCP server **默认不可信**——这条原则比"local tool 默认信任"严得多。

| 攻击面 | 防御 |
|---|---|
| MCP server 返回的工具输出含 `IGNORE PREVIOUS INSTRUCTIONS` | 输出按 untrusted text 进 context；ContextBuilder 加 `[mcp:server:tool]` 前缀；M9a 加 injection 检测 |
| MCP server 把 prompt 模板里塞恶意指令 | prompt 展开必须用户审查（slash command 是显式触发） |
| MCP server 暴露 `delete_database` tool 名诱导 model 调用 | tool 调用走 PermissionEngine；destructive 永远 ask |
| MCP server 进程消耗 CPU / 内存爆 | M6 设 cpu / mem cgroup（OS 级 sandbox）；超限 kill |
| MCP server 把 secrets（OAuth token）回吐给 model | secret redaction（M9a）覆盖 MCP 输出；client 默认 strip 已知 token pattern |
| 两台 MCP server 跨进程通信（旁路通道）| 进程隔离（每个 server 独立子进程）；client 不在 server 间转发 |

## 11. 测试策略

| 类型 | 测什么 |
|---|---|
| stdio lifecycle | server 启动 / initialize / shutdown 流程 |
| http lifecycle | session id header / SSE 断线重连 cursor |
| tools/list contract | server 返回的 schema 通过 client schema 校验 |
| tools/call 正常路径 | round-trip 一次 mcp.fs.read_text，事件链字节级稳定 |
| tools/call 失败 | server 抛 JSON-RPC error → client emit `mcp.call.failed` + `tool.failed` |
| permission gating | mcp tool 必须走 PermissionEngine；mock 默认 deny → tool 不执行 |
| namespace collision | 同时注册 `mcp.fs` 和 `mcp.fs-v2`，两个 server 的同名 tool 互不干扰 |
| resource explicit include | resources/list 拿到 50 个 resource；context 只装 user 显式 include 的 |
| prompt schema validation | unknown argument → client 拒绝 |
| server crash | stdio 子进程崩溃 → `mcp.server.crashed`；其他 server 不受影响 |
| secret redaction | tools/call 响应含 `sk_xxx` → 进 event log 前被 redact |

## 12. 常见误区

| 误区 | 纠正 |
|---|---|
| "MCP server 可信" | 默认不可信；输出按 untrusted 处理 |
| "MCP resource 自动装 context" | 不行；必须 user/policy 显式 include；每个 include 走 PermissionEngine |
| "MCP tool 是 skill 的另一种形态" | 不是；skill 是 repo 内工作流；MCP 是外部能力 |
| "MCP server 输出直接进 model prompt" | 输出走 ContextBuilder 的 transcript 投影；带 `[mcp:..]` 前缀 |
| "Streamable HTTP 是 MCP 私有协议" | MCP 把 stdio / Streamable HTTP 两种 transport 都标准化了；其他协议（如 ACP）借鉴了同样的 pattern |
| "一台 MCP server 必须支持所有方法" | 不必；`initialize` capabilities 协商哪些 method 可用 |
| "MCP server crash 会拖垮 agent" | 不会；MCPClient 隔离每台 server；crash 只影响该 server 的 tools |

## 13. 实现状态 / Roadmap

| Step | 状态 |
|---|---|
| MCP server config schema | M6-01 |
| stdio 子进程生命周期 | M6-01 |
| `initialize` / `tools/list` / `tools/call` | M6-01 + M6-02 |
| Namespace + 注入 ToolRouter | M6-02 |
| 经 PermissionEngine | M6-03 |
| crash recovery | M6-03 |
| Resources（`resources/list`、`resources/read`、explicit include） | M7-01 |
| Prompts（`prompts/list`、`prompts/get`） | M7-02 |
| Streamable HTTP transport | M7-03 |
| Sandbox profile（cgroup / OS 级） | M9a |
| Secret redaction in MCP output | M9a |

## 14. 进一步阅读

- [`tools-and-permissions.md`](tools-and-permissions.md) §10 — MCP tool 在 risk taxonomy 中的位置
- [`skills.md`](skills.md) §7 — Skill vs MCP 界线
- [`context.md`](context.md) §3 — MCP resource 在 token budget 中独立桶
- [`reference/event-schema.md`](../reference/event-schema.md)（待写）— `mcp.*` event payload schema
- MCP 官方规范：https://spec.modelcontextprotocol.io/
