---
title: "Skills（可复用工作流）"
---

> 重写自 `handbook/layers/skills.md`（A2 audit 评分 2/5）。原版是 checklist，新读者无法判断"skill 跟 tool / MCP / instruction 有什么区别"。本版以"lazy-load 解决什么 + skill 调用完整事件链"为骨架。

---

## 1. 为什么 Skill 必须存在

直接用 instructions 表达"标准工作流"会撞三堵墙：

| 痛点 | 不做 skill 系统的后果 |
|---|---|
| 标准 SOP 写在 `AGENTS.md` 里 | 每次 turn context 都装一整套 SOP；token 浪费 + 噪音干扰小任务 |
| 用户每次都要复述"代码 review 要看哪 6 点" | 复述偏差 / 漏点；模型经常 "本次只看了 3 点" |
| SOP 跨项目复用 | 复制粘贴 → 各项目 SOP 渐行渐远 → governance 失控 |
| 工作流要执行特定工具（`gh pr view` → `git diff` → ...） | 工具调用顺序 / 必备约束写在 prompt 里容易被模型"创意发挥" |

Skill = **一个可识别（metadata）+ 可懒加载（body）+ 可受权限约束（allowed_tools）的工作流包**。它**不是**：

- ❌ 插件市场（M10 + plugin system 才是）
- ❌ 权限绕道（skill 必须经过 PermissionEngine）
- ❌ 长期 memory（memory 系统有独立的 candidate workflow）
- ❌ system prompt 的替代品（指令分层有自己的 hierarchy）

## 2. Skill 文件结构

```text
skills/
└── mainline-guardian/          ← skill 名 = 目录名
    ├── SKILL.md                ← metadata 在 frontmatter，body 在下面
    ├── scripts/                ← 可选：skill 用到的辅助脚本
    │   └── check-boundaries.ts
    └── assets/                 ← 可选：模板、checklist 等静态资源
        └── review-template.md
```

`SKILL.md` 头部（这部分被 lazy-load 时就读进 context）：

```yaml
---
name: mainline-guardian
description: 在 merge 前对一个 PR 做主线对齐审查；输出 PASS/FAIL + blocking findings。
trigger:
  patterns:
    - "review (this )?pr"
    - "跑一遍 mainline guardian"
    - "merge 前检查"
allowed_tools:
  - read_file
  - search_text
  - git_diff
  - list_files
version: 1.2.0
---
```

body（**仅在 skill 被命中并加载时才进 context**）：完整的 SOP 步骤、checklist 模板、示例输出格式等。可以很长。

## 3. Lazy Loading：解决的根本问题

```
没有 lazy loading：                    有 lazy loading：
┌────────────────────────┐           ┌────────────────────────┐
│  context              │           │  context              │
│  ┌──────────────────┐ │           │  ┌──────────────────┐ │
│  │ system prompt    │ │           │  │ system prompt    │ │
│  ├──────────────────┤ │           │  ├──────────────────┤ │
│  │ instructions     │ │           │  │ instructions     │ │
│  ├──────────────────┤ │           │  ├──────────────────┤ │
│  │ memory           │ │           │  │ memory           │ │
│  ├──────────────────┤ │           │  ├──────────────────┤ │
│  │ tool schemas     │ │           │  │ tool schemas     │ │
│  ├──────────────────┤ │           │  ├──────────────────┤ │
│  │ skill A body     │ │           │  │ skill registry:  │ │
│  │  (1200 token)    │ │           │  │   - A: desc/...  │ │ ← 仅 metadata
│  ├──────────────────┤ │           │  │   - B: desc/...  │ │ ← 仅 metadata
│  │ skill B body     │ │           │  │   - C: desc/...  │ │ ← 仅 metadata
│  │  (3400 token)    │ │           │  │   ...            │ │
│  ├──────────────────┤ │           │  │   (共 800 token) │ │
│  │ skill C body     │ │           │  ├──────────────────┤ │
│  │  (2100 token)    │ │           │  │ transcript       │ │
│  ├──────────────────┤ │           │  └──────────────────┘ │
│  │ skill D body     │ │           │                       │
│  │  (1600 token)    │ │           │  Model 命中后才装 body:│
│  ├──────────────────┤ │           │  ┌──────────────────┐ │
│  │ transcript       │ │           │  │ + skill A body   │ │ ← 命中后注入
│  └──────────────────┘ │           │  │   (1200 token)   │ │
│                       │           │  └──────────────────┘ │
│  ⚠ 8000+ token 常驻   │           │  ✓ 2000 token 常驻    │
└────────────────────────┘           └────────────────────────┘
```

**关键收益**：

- 10 个 skill 注册 ≈ 800 token 常驻；命中 1 个再加 1200 → 总 2000 token。比"全部常驻"省 75%+。
- 无关 skill 不会污染 prompt（模型不会被"看见"的 skill body 暗示）。
- 跨项目复用：项目里有 50 个 skill 也只看 metadata。

## 4. Skill 命中（trigger）

Trigger 决定 ContextBuilder 何时把哪些 skill body 注入 context。有 4 类策略：

| Trigger 类型 | 例子 | 命中时机 |
|---|---|---|
| **显式调用** | user 输入 `/skill mainline-guardian` | turn 起步前注入 |
| **pattern 匹配** | regex 在 user message 上匹配 | turn 起步前注入 |
| **model 主动选择** | model 工具调用 `invoke_skill { name: "mainline-guardian" }` | turn 中段动态注入；inject 后 model 重新 stream |
| **policy 强制** | "本 repo 任何 merge 前必须自动跑 mainline-guardian" | session 创建时注入；整个 session 不卸载 |

**安全提醒**：trigger 不是凭空让模型有"新能力"——它只是把 metadata 暴露给模型。**模型真正调用的工具仍要经过 PermissionEngine**。

## 5. Skill 调用完整事件链

以 user 输入 `/skill mainline-guardian` 为例。M5 落地后形态。

```
seq=N    user.message              {content: "/skill mainline-guardian"}
seq=N+1  skill.loaded              {
                                     name: "mainline-guardian",
                                     version: "1.2.0",
                                     loadedBytes: 8432,
                                     contextTokensAdded: 1200,
                                     allowedTools: ["read_file","search_text","git_diff","list_files"]
                                   }
seq=N+2  context.built              {sources: { skills: ["mainline-guardian"] }, ...}

seq=N+3  model.delta                {text: "我先看一下 PR 的 diff..."}
seq=N+4  model.tool_call_requested  {tool: "git_diff", args: {ref: "HEAD"}}

         ↓ PermissionEngine.check(tool="git_diff", allowedBy=["skill:mainline-guardian"])
         ↓ skill 的 allowed_tools 是输入之一，但不能放宽 PermissionEngine 默认决策

seq=N+5  permission.requested       {tool: "git_diff", sourcedBy: "skill:mainline-guardian"}
seq=N+6  permission.resolved        {decision: "allow", reason: "read risk + session policy"}
seq=N+7  tool.started               {tool: "git_diff"}
seq=N+8  tool.completed             {result: "...", durationMs: 89}

seq=N+9  model.delta                {text: "diff 涉及 5 个文件..."}
... (重复 tool 调用)

seq=N+M  skill.completed            {name: "mainline-guardian", finalStop: "produced PASS"}
seq=N+M+1 turn.completed            {stopReason: "final"}
```

注意几点：

- `skill.loaded` 后才会有 `context.built`——ContextBuilder 把 skill body 装进 turn-scope context。
- 工具调用走 PermissionEngine 时，`sourcedBy: "skill:..."` 帮 audit 知道这次调用源自 skill。
- skill 内允许的 tool 是 PermissionEngine 决策的 input，但**不替代** PermissionEngine——destructive 工具即便 skill 声明 allowed，仍要 ask。

## 6. allowed_tools 的语义（重点）

`allowed_tools` 是 **能力声明 + 上限**，不是"自动批准"。

```
input: tool=git_diff  →  PermissionEngine 看：
                          - tool.risk: read
                          - skill.allowed_tools 含 git_diff ✓ （否则直接 deny）
                          - sessionPolicy / projectPolicy
                          - history
                          → decision
```

`allowed_tools` 的作用：

1. **过滤上限**：skill 声明 `[read_file, search_text]`，skill body 怎么"诱导"模型 model 都不能调用 shell。
2. **审计 source**：`sourcedBy: "skill:..."` 进 event log。
3. **policy 输入**：policy 可以写"skill 声明的 read 工具自动 allow"，但 destructive 永远不放。

**反模式**：

- ❌ `allowed_tools: ["*"]` 等于关闭 skill 的能力沙箱（很多 skill 系统设计成默认全开是错的）。
- ❌ "skill 用一个用户没装的 MCP 工具"：MCP server 不在线时 skill 整体失败，不能"降级到本地工具"。
- ❌ skill 内嵌 secrets / 密钥：skill 是版本化的，secrets 不能进 git。

## 7. Skill 与 Tool / Instruction / Memory / MCP 的界线

| 系统 | 时间尺度 | 持久性 | 加载策略 | 用户授权方式 |
|---|---|---|---|---|
| **Instruction**（AGENTS.md） | session 全程 | durable（git） | 全部 eager load | 维护者写入 repo |
| **Skill** | turn 局部（命中才装） | durable（git） | metadata eager + body lazy | 维护者写入 repo |
| **Tool** | turn 局部 | code | tool schema eager | 通过 PermissionEngine 单次 / 批次 |
| **Memory** | 跨 turn / 跨 session | durable（candidate-审批后） | 每 turn ContextBuilder 装 | candidate workflow |
| **MCP** | 外部进程 | runtime（process） | server 启动后 tools list eager | MCP server 配置 + PermissionEngine |

简单说：**"加载一组工作流"用 skill；"agent 自己学到 user 偏好"用 memory；"暴露外部工具"用 MCP；"项目硬约束"用 instruction**。

## 8. 命中冲突 / 名字碰撞

- 多个 skill metadata 都 match 同一个 user query → ContextBuilder **保留所有命中**但按 ranking 注入（短描述优先 / 最近用过优先）。
- skill 名重复（`a/SKILL.md` + `b/SKILL.md` 都叫 `mainline-guardian`）→ skill registry **加载时拒绝**，emit `skill.registry_error` event。
- skill 与 MCP tool 命名冲突 → 走 `mcp.<server>.<tool>` namespace（详见 [`mcp.md`](mcp.md)），skill 仍用裸名。

## 9. 测试策略

| 类型 | 测什么 |
|---|---|
| metadata parser | invalid YAML / 缺 name / 缺 allowed_tools → 拒绝加载并发 `skill.registry_error` |
| trigger matching | 给定 user message + skill registry，期望命中集合稳定 |
| lazy load | 启动只读 metadata；命中后才读 body；body bytes 进 `skill.loaded.payload.loadedBytes` |
| allowed_tools enforcement | skill body 诱导调用未声明工具 → PermissionEngine 直接 deny + emit `permission.resolved { reason: "tool not in skill.allowed_tools" }` |
| context budget | skill body 装 context 后总 token ≤ `provider.maxContextTokens`；超出时按 budget 分桶截断 |
| invocation event golden | `/skill X` 走完一遍，event 序列字节级稳定 |
| name collision | 重名 skill registry 加载报错且不污染其他 skill |

## 10. 常见误区

| 误区 | 纠正 |
|---|---|
| "skill 是更高级的 prompt" | 不只是 prompt：还含 metadata、trigger、allowed_tools、audit；调用全程进 event log |
| "skill 命中后就可以自动跑工具" | 不行；每个工具调用仍要走 PermissionEngine；skill `allowed_tools` 只是过滤上限 |
| "skill 可以修改 memory / instruction / policy" | 不行；durable 修改都要走 candidate / PR / policy 审批；skill 只是 turn 内工作流 |
| "skill body 越详细越好" | 不行；body 占 context 桶；trigger 命中率低的 skill 也跟着膨胀 token 估算 |
| "skill 是插件市场雏形" | 不是；插件系统是 M10；skill 是 repo 内 SOP 版本化包装 |

## 11. 实现状态 / Roadmap

| Step | 状态 |
|---|---|
| `skills/` 目录约定 + SKILL.md 模板 | ✅ 已在 `custom-agent` repo |
| skill registry / discovery | M5-01（READY？ 见 [03-roadmap-status](../../03-roadmap-status.md)）|
| lazy-load + body inject | M5-02 |
| trigger pattern matching | M5-02 |
| skill UX（`/skill list`、`/skill run`）+ Web inspector | M5-03 |
| skill 与 MCP 共存策略 | M5-03 / M6 联动 |
| skill 版本管理 | M10（与 plugin registry 一起；本阶段先做单版本）|

## 12. 进一步阅读

- [`tools-and-permissions.md`](tools-and-permissions.md) §6 — `allowed_tools` 与 PermissionEngine 决策树的关系
- [`context.md`](context.md) §3 — skill 在 token budget 中的桶位（独立桶）
- [`mcp.md`](mcp.md) §6 — MCP tool 与 skill 命名空间隔离
- [`reference/event-schema.md`](../reference/event-schema.md)（待写）— `skill.*` event payload schema
