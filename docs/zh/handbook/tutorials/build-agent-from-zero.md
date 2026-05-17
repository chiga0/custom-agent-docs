# 从零到一构建 Agent 框架

这篇文档用工程视角解释：如果你不是复制 Custom Agent，而是自己从 0 开始构建一套 agent 框架，应该按什么顺序做、每一步做出什么、如何避免架构走歪。

## 目标成品

最小可用 agent 框架应该具备：

- 可恢复 session。
- 可 replay 的 event log。
- 一个模型 provider。
- 一组受权限保护的本地 tools。
- 一个可观察的 Web client。
- 可加载项目指令。
- 可扩展到 MCP、skills、ACP 和 remote-control。

## Step 0：先定义主线

先写一句主线，而不是先写代码。

推荐主线：

> 构建一个 event-sourced agent core，用 adapters 隔离模型、工具、记忆、协议和客户端。

主线的作用是帮你拒绝诱惑：

- 不要先做漂亮 UI。
- 不要让 provider SDK 泄漏进 core。
- 不要让 tool 直接从 UI 执行。
- 不要让 memory 静默改变行为。
- 不要在 session/replay 稳定前做多 agent。

## Step 1：设计事件模型

先定义事件，而不是先定义数据库表。

最小事件：

```text
session.created
turn.started
user.message
context.built
model.requested
model.delta
model.tool_call_requested
permission.requested
permission.resolved
tool.started
tool.completed
tool.failed
turn.completed
turn.failed
session.compacted
```

事件必须包含：

- `id`
- `sessionId`
- `turnId`
- `sequence`
- `timestamp`
- `type`
- `payload`
- `schemaVersion`

为什么先做事件？

- 因为 Web、CLI、ACP、测试、审计都可以围绕事件构建。
- 因为 replay 是 agent 系统的调试生命线。
- 因为未来 remote-control 也可以复用事件语义。

## Step 2：实现 SessionEngine 的假模型版本

先不要接真实模型。

实现：

```text
createSession(cwd)
runTurn(sessionId, userMessage)
cancelTurn(turnId)
replaySession(sessionId)
```

假模型可以固定返回：

```text
"Project spine is ready."
```

验收：

- 用户输入能产生一串事件。
- 事件能写入 JSONL。
- replay 能重建 transcript。
- Web 能展示 timeline。

## Step 3：做 Web 可观测面

Web 不是后期 UI，它是调试工具。

最小 Web 页面：

- Session list。
- Transcript。
- Event timeline。
- Raw event inspector。
- Replay viewer。

为什么先做 Web？

- 因为 agent 行为很难只靠日志理解。
- 因为权限、tool call、context、diff 都需要可视化。
- 因为多 client 之前要先证明 core 行为稳定。

## Step 4：接入一个 ModelGateway

不要让 core 直接调用 provider SDK。

定义 provider port：

```text
ModelProvider.stream(request) -> AsyncIterable<ModelStreamEvent>
```

规范化输出：

- `text_delta`
- `tool_call_delta`
- `tool_call_completed`
- `usage`
- `error`

第一版只接一个 provider。其他 provider 等接口稳定后再加。

## Step 5：实现 ToolRouter 和 PermissionEngine

工具系统必须先有权限，再有执行。

最小 tools：

- `read_file`
- `list_files`
- `search_text`
- `shell`
- `apply_patch`
- `git_diff`

权限策略：

- read 默认可 allow。
- write/execute 默认 ask。
- network 默认 ask 或 deny。
- 高风险命令默认 deny 或强确认。

关键事件：

```text
permission.requested
permission.resolved
tool.started
tool.completed
tool.failed
```

## Step 6：实现 ContextBuilder

ContextBuilder 决定模型看到什么。

输入：

- 当前 user message。
- Session summary。
- Active instructions。
- Memory entries。
- Skill metadata。
- Tool schemas。
- MCP resources。

输出：

- Provider-neutral model request。
- `context.built` event。
- Token budget report。

常见坑：

- 把所有历史都塞进 prompt。
- 自动加载所有 skill body。
- 自动倾倒 MCP resources。
- Memory 没有来源和审计。

## Step 7：加 Instructions 和 Memory

先做 instruction hierarchy：

```text
global instructions
project AGENTS.md
directory AGENTS.md
session-specific instruction
```

再做 memory candidate：

```text
evidence -> candidate -> review -> apply -> durable memory
```

不要一开始就做 vector memory。先把可审计 memory 做清楚。

## Step 8：加 Skills

Skill 是可复用工作流，不是权限后门。

一个 skill 至少包含：

```text
SKILL.md
metadata:
  name
  description
  allowed_tools
```

启动时只加载 metadata。命中时才加载完整内容。

## Step 9：接 MCP

MCP 是外部能力边界，不是 core。

实现顺序：

1. stdio transport。
2. `initialize`。
3. `tools/list`。
4. `tools/call`。
5. resources。
6. prompts。
7. Streamable HTTP。

所有 MCP tool 仍然走 PermissionEngine。

## Step 10：接 ACP 和其他 clients

当 event model、session replay、permission flow 稳定后，再做 ACP。

ACP adapter 只负责：

- JSON-RPC。
- session method mapping。
- event-to-update。
- permission forwarding。

它不能拥有 agent 逻辑。

## Step 11：预留 Remote、Plugin、Automation

这些不是 MVP，但必须预留：

- remote runner。
- provider/skill/tool plugin registry。
- mobile remote-control。
- scheduled automations。

预留方式：

- 所有 runtime 行为事件化。
- Tool 统一走权限。
- Client 只走 session API。
- Artifact 有明确归属。
- Remote/local replay 语义一致。

## 最小开发顺序

推荐 issue 顺序：

1. Event schema。
2. JSONL event log。
3. Fake SessionEngine。
4. Web timeline。
5. Replay projection。
6. ModelGateway port。
7. First provider。
8. PermissionEngine。
9. Read/search tools。
10. Shell/patch tools。
11. ContextBuilder。
12. Skills。
13. MCP。
14. ACP。
15. Remote/plugin/automation ADR。

## 判断你是否走对了

你应该能做到：

- 任意 session 可以 replay。
- 任意 tool call 可以追到 permission decision。
- 任意 provider 可以替换而不改 core。
- 任意 client 可以通过 event stream 渲染。
- 任意 memory 写入可以审计和回滚。
- 任意新能力可以说清楚属于哪一层。

如果做不到，先补架构，不要继续堆功能。
