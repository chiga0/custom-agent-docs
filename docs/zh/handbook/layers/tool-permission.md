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
- M3-01 acceptance "tool executor 不能绕过 permission result" 当前是 **结构性** 保证（`requestPermission` 返回 `Promise`，调用者拿不到 sync decision 来跳过事件提交）；M3-02 ToolRouter 落地后须补一个端到端测试，断言通往 executor 的唯一路径经过 `await engine.requestPermission(...)`。

#### SessionEngine 接入约定（M3-02 wiring）

`PermissionEngine.requestPermission` 不知道 `sessionId` / `turnId` — 它只接收 `toolName` / `risk` / `reason` 等工具上下文。事件 envelope 字段（`id` / `sessionId` / `turnId` / `sequence` / `timestamp` / `schemaVersion`）由 `PermissionEventSink` 适配器在写入 EventStore 时填。M3-02 ToolRouter 创建 sink 闭包时 capture 当前 turn 的 `sessionId` + `turnId`，组装成完整 `AgentEvent` 再 append。这样 engine 保持 session-agnostic，复用在 ACP 之外的场景也成立。

`argsPreview` 上限 512 字符（engine 安全网），更精细的 redaction / 截断在 ToolRouter 层做。

## ToolExecutor 职责

- 真正执行工具。
- 控制 timeout。
- 控制 output budget。
- 做 redaction。
- 返回 structured result。

Executor 不能自己决定是否允许执行。

## 风险分类（schema `ToolRisk` 联合）

M3-01 schema 落地 4 类（`packages/schema` `ToolRisk` 联合）：

- `read`：读取项目文件或状态。
- `write`：修改文件、memory、配置。
- `execute`：运行命令、测试、脚本。
- `network`：访问外部网络。

默认策略 `DEFAULT_POLICY`：

- `read` → `allow`。
- `write` / `execute` / `network` → `ask`。
- `defaultDecision` → `ask`。

**M3-03+ 候选扩展**（未落地，按需 PR + ADR）：

- `credential`（读取或使用凭证）— 默认 deny 或强确认。
- `destructive`（删除、reset、deploy）— 默认 deny 或强确认。

新增 risk 需要同时改 `ToolRisk` 联合 + `DEFAULT_POLICY` + handbook，避免现在的 doc-vs-schema 漂移再发生。

## 必须事件

M3-01 + M3-02 已落地：

- `tool.permission_requested` ✅（M3-01）
- `tool.permission_resolved` ✅（M3-01）
- `tool.started` ✅（M3-02，含 `toolCallId` + 可选 `permissionRequestId`）
- `tool.delta` ✅（M3-02，`kind: "stdout" | "stderr" | "result"`）
- `tool.completed` ✅（M3-02，含 `deltaCount` + `truncated`）
- `tool.failed` ✅（M3-02，含 `errorCode`）

`ToolErrorCode` 联合：`permission_denied / path_unsafe / not_found / io_error / budget_exceeded / cancelled / unknown`。

没有这些事件，就无法审计。

## ToolRouter 与 3 个 read-only 工具（M3-02 落地）

`packages/tools/` 实现：

```ts
const router = new ToolRouter({
  permissionEngine,
  toolEventSink,   // 由 SessionEngine 适配器在 M3-02b 接 EventStore
  cwd: session.cwd,
  tools: DEFAULT_READONLY_TOOLS,   // read_file / list_files / search_text
  outputBudgetBytes: 64 * 1024,
});

const { toolCallId, outcome } = await router.dispatch(
  { toolName: "read_file", args: { path: "src/index.ts" }, reason: "agent wants to read" },
);
```

`dispatch` 生命周期：

1. tool 未注册 → 立刻 emit `tool.failed { not_found }`；**不**询问 PermissionEngine。
2. PermissionEngine `requestPermission` → 同时 emit 一对 `tool.permission_*` 事件。
3. 拒绝（policy 或 user）→ emit `tool.failed { permission_denied }`，executor 永不运行。
4. 允许 → emit `tool.started`（带 `permissionRequestId` 配对回 §M3-01 事件）。
5. `tool.execute(args, ctx)`；每次 `ctx.emit(chunk)` 走 BudgetAccumulator → emit `tool.delta`。
6. 完成 → `tool.completed { deltaCount, truncated }`；失败 → `tool.failed { errorCode, message }`。

### 3 个工具

| 工具 | risk | 行为 | 安全网 |
|------|------|------|--------|
| `read_file` | read | 读 UTF-8 文件 → 一条 `result` chunk | path traversal → `path_unsafe`；ENOENT → `not_found` |
| `list_files` | read | 列目录，可 `recursive`，跳 hidden + `node_modules/.git/dist/...` | 同上；非目录 → `io_error` |
| `search_text` | read | 字面量子串递归搜，按扩展名识别文本文件 | 同上；`maxMatches` 默认 200；二进制扩展名跳过 |

`OutputBudget` 默认 64 KiB；超出后剩余 chunk 被截断 + 末尾追加 `…[output truncated: budget exceeded]`，`tool.completed.truncated=true`。

### Path safety

`resolveInsideCwd(cwd, rawPath)` 是唯一允许的路径解析入口：

- `..` 越界 → `undefined`
- `/etc/passwd` 等绝对路径在 cwd 外 → `undefined`
- 兄弟前缀攻击（`/tmp/cwd-evil` 当 cwd 是 `/tmp/cwd`）→ `undefined`（用 `cwd + sep` 后缀防御）

### Gitignore 延后

M3-02 用一个固定 skip-list（`node_modules / .git / dist / build / coverage / .next / .turbo / .vite`）+ 跳过 dotfiles 近似。真 .gitignore 解析（含 negation、glob）M3-02b 接 `ignore` 包，与 SessionEngine 模型循环一起落地。

## 最小工具集合

- `read_file` ✅（M3-02）
- `list_files` ✅（M3-02）
- `search_text` ✅（M3-02）
- `shell`（M3-03）
- `apply_patch`（M3-03+）
- `git_diff`（M3-03+）

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
