---
title: "Remote、Plugin、Automation 预留"
---

# Remote、Plugin、Automation 预留

## 为什么现在就要想未来能力

Remote-control、插件系统、移动端、定时任务、多 agent 不是 MVP 主实现，但如果 MVP 架构没有预留，将来会被迫重写 core。

预留的关键不是提前实现，而是保持边界正确。

## Remote Control / Remote Execution

未来 remote runner 应复用：

- Session id。
- Event stream。
- Permission events。
- Artifact model。
- Replay projection。
- Audit log。

Remote runner 不应该有另一套隐藏状态机。

建议模型：

```text
Client -> AgentHost -> SessionEngine -> RemoteRunnerAdapter -> Remote Workspace
```

remote 与 local 差异放在 runner adapter，不放进 core。

## Plugin and Extension System

插件扩展点：

- Provider adapters。
- Skills。
- MCP servers。
- Local tools。
- Client adapters。
- Themes/UI extensions。

插件必须声明：

- name。
- version。
- capabilities。
- required permissions。
- tool schemas。
- config schema。

插件不能绕过：

- Schema validation。
- PermissionEngine。
- Memory audit。
- Event log。
- Mainline rules。

## Mobile Remote-Control

移动端定位：

- Remote-control client。
- Approval device。
- Notification surface。
- Session monitor。

不定位为：

- Agent runtime。
- Tool executor。
- Memory writer。

## Scheduled Automations

定时任务必须建模为 session trigger：

```text
schedule fired -> session/turn created -> permission policy -> events -> audit
```

不要做隐藏 cron executor。

必须考虑：

- 用户授权范围。
- 失败通知。
- 重试策略。
- 高风险操作审批。
- 日志和 replay。

## Product-Level Multi-Agent

产品内 multi-agent 需要等以下能力稳定：

- Event model。
- Session graph。
- Permission model。
- Task delegation event。
- Conflict resolution。
- Tool ownership。

当前项目里的多个开发 agent 并行，是 repo governance 问题，不是 runtime multi-agent。

## Vector Memory

延后原因：

- 检索不可解释。
- 误召回风险。
- 隐私边界复杂。
- 删除和回滚困难。
- 测试不稳定。

先做 reviewed Markdown memory。

## Self-Modifying Prompts

自进化 agent 只能走：

```text
proposal -> review -> apply -> observe -> rollback
```

禁止：

- 静默修改 system prompt。
- 静默修改 permission policy。
- 静默修改 mainline rules。

## 当前 Roadmap 位置

- M10：Remote、Extensions、Automations。
- Deferred Research：Vector memory、Self-evolution。

在 M10 前，只允许 ADR、spike、接口预留，不允许主功能实现。
