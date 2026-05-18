---
title: "MCP 集成层"
---

> ⚠️ **本章节已被 [`implementation/mcp.md`](../implementation/mcp.md) 重写并扩充**（Phase 4 P1）。本文件保留为历史快照；新读者请直接读重写版。

## 真实作用

MCP 让 agent 连接外部工具、资源和 prompt templates。它是能力扩展协议，不是 agent core。

Agent 在 MCP 中通常扮演 client：

```text
Agent MCP Client -> MCP Server -> tools/resources/prompts
```

## MCP 提供什么

- Tools：可调用动作。
- Resources：可读取上下文资源。
- Prompts：可复用 prompt templates。
- Transports：stdio、Streamable HTTP。

## 集成原则

- MCP server 默认不可信。
- MCP tools 必须走 PermissionEngine。
- MCP resources 不能自动倾倒进 context。
- MCP prompts 需要显式调用。
- MCP server crash 要可见、可恢复。

## 最小实现顺序

1. Server config schema。
2. Stdio process lifecycle。
3. `initialize`。
4. `tools/list`。
5. `tools/call`。
6. Timeout/cancel。
7. Health state。
8. Resources。
9. Prompts。
10. Streamable HTTP。

## Tool Namespace

不同 MCP server 可能暴露同名 tool。

建议命名：

```text
mcp.<serverName>.<toolName>
```

不要让 MCP tool 覆盖 local tool。

## Resources 策略

Resource 是上下文，不是自动 prompt。

加入 context 前需要：

- 用户选择。
- policy 允许。
- budget 检查。
- source 标注。

## 常见坑

- MCP tool 直接执行。
- MCP server 输出无限大。
- Resource 自动加入 context。
- Server crash 后 session 卡死。
- OAuth/token 混进 event log。

## 测试策略

- Fake MCP server。
- Initialize contract。
- Tool list/call contract。
- Namespace collision。
- Timeout/cancel。
- Server crash recovery。
- Resource explicit inclusion。
