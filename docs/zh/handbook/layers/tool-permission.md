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

### M3-01 落地状态

`packages/permissions/src/index.ts` 现在导出真实 `PermissionEngine` 类。形态：

```ts
const engine = new PermissionEngine({
  policy: { /* 见下 */ },
  approvalSource: async (req, signal) => /* ask 人类 / client */,
  eventSink: { emit: (e) => /* 把 e 持久化为 AgentEvent */ },
});

const resolution = await engine.requestPermission(
  { toolName: "shell", risk: "execute", reason: "run npm test" },
  signal,
);
// resolution.outcome: "allowed" | "denied"
// resolution.source : "policy" | "user"
```

签名是 **Promise** 即便 policy 同步给 `allow`/`deny`，让调用者不能"读完同步 decision 就跳过 ask 与事件提交"。

#### Policy 形状

```ts
type PermissionPolicy = {
  byTool?: Record<string, "allow" | "ask" | "deny">; // per-tool override
  byRisk?: Partial<Record<ToolRisk, "allow" | "ask" | "deny">>;
  defaultDecision?: "allow" | "ask" | "deny";
};
```

`DEFAULT_POLICY` = `{ read: allow, write: ask, execute: ask, network: ask, default: ask }`。

#### ask 流程取消

调用者传入的 `AbortSignal` 在 ask 等待期间触发 → 直接 resolve 为 `outcome: "denied"`、`source: "policy"`、`reason: "cancelled"`。和 turn cancellation 语义一致：任何取消的意图最终都不执行。

#### 事件契约

每次 `requestPermission` 一定 emit 两条事件：

| 事件 | 时机 | payload 关键字段 |
|------|------|----------------|
| `tool.permission_requested` | 调用之初，同步 policy 决策已知 | `requestId` / `toolName` / `risk` / `decision` / `reason` / `argsPreview?` / `toolCallId?` |
| `tool.permission_resolved` | policy decides 或 ask 返回后 | `requestId`（同上）/ `outcome` (allowed/denied) / `source` (policy/user) / `reason?` |

`requestId` 在两条事件间一一对应，方便重放时把任意工具调用还原成"申请 → 决定"两步。事件被 schema additive 加入 `AgentEvent` 联合，但 ACP wire 暂不暴露（M3-02 ToolRouter 接 ACP `request_permission` 时再开 wire）。

#### 强制不绕过

- `PermissionEngine` 不知道任何具体工具实现；它只暴露 `requestPermission`/`evaluate`。
- ToolRouter（M3-02+）会 `await engine.requestPermission(...)`，根据 `outcome` 决定是否 invoke ToolExecutor。
- ToolExecutor 不接受 `PermissionEngine` 引用，没有自己绕开的入口。
- 架构 fitness 将在 M3-02 增加 `apps/* → packages/permissions` 之外的 tool 路径不允许调用 executor 的边界规则。

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

M3-01 已落地：

- `tool.permission_requested` ✅
- `tool.permission_resolved` ✅

M3-02+ 计划：

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
