---
title: "Tool 与 Permission 层"
---

## 真实作用

Tool 层让模型可以影响外部世界。Permission 层确保这种影响被控制、审计和授权。

这是 coding agent 最危险也最有价值的部分。

工具可能来自：

- Local built-in tools。
- MCP tools。
- Skill scripts。
- Plugins。
- Remote runner tools。

不管来源是什么，都必须走同一个权限入口。

## 分层

```text
Model tool request
  -> ToolRouter
  -> PermissionEngine
  -> ToolExecutor
  -> ToolResult
  -> EventLog
```

## ToolRouter 职责

- 维护 tool registry。
- 做 tool namespace。
- 校验 tool args schema。
- 判断 tool source。
- 计算 risk hint。
- 请求 PermissionEngine。
- 分发到 executor。

## PermissionEngine 职责

- 根据 tool、args、cwd、source、session mode 判断风险。
- 返回 allow / deny / ask。
- 生成 permission event。
- 支持 client approval。
- 支持 policy override。

## ToolExecutor 职责

- 真正执行工具。
- 控制 timeout。
- 控制 output budget。
- 做 redaction。
- 返回 structured result。

Executor 不能自己决定是否允许执行。

## 风险分类

建议初始分类：

- `read`：读取项目文件或状态。
- `write`：修改文件、memory、配置。
- `execute`：运行命令、测试、脚本。
- `network`：访问外部网络。
- `credential`：读取或使用凭证。
- `destructive`：删除、覆盖、reset、deploy。

默认策略：

- `read` 可以自动 allow。
- `write` 默认 ask。
- `execute` 默认 ask。
- `network` 默认 ask。
- `credential` 默认 deny 或强确认。
- `destructive` 默认 deny 或强确认。

## 必须事件

- `permission.requested`
- `permission.resolved`
- `tool.started`
- `tool.delta`
- `tool.completed`
- `tool.failed`

没有这些事件，就无法审计。

## 最小工具集合

- `read_file`
- `list_files`
- `search_text`
- `shell`
- `apply_patch`
- `git_diff`

先做 read/search，再做 shell/patch。

## 常见坑

- MCP tool 绕过 PermissionEngine。
- Skill 直接执行 shell。
- UI 直接调用 tool executor。
- Tool output 太大导致 context 爆炸。
- Tool output 中 prompt injection 直接进入模型。
- 失败只显示在 UI，不写 event。

## 测试策略

- Permission policy matrix。
- Tool arg validation。
- Deny path 测试。
- Timeout 测试。
- Output truncation。
- Prompt injection in tool output。
- Dirty worktree preservation。
- MCP tool permission parity。
