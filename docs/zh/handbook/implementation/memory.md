---
title: "Memory（agent 跨 turn 记住什么）"
---

> 拆自 `handbook/layers/memory-context.md`。本文只讲"长期记忆"——agent 在 turn 之间应该记住什么、怎么持久化、怎么审计。**当下 turn 看到的内容（context）见 [`context.md`](context.md)**。

---

## 1. Memory 解决的问题

"agent 跨 turn 记住"听起来简单，但坑很多：

| 痛点 | 错误做法的后果 |
|---|---|
| 用户告诉过 agent "我喜欢 tab 缩进 4"，下一个 turn agent 又用 2 空格 | 用户体验崩 |
| Agent 自己"判断"用户偏好直接写 memory | 用户没授权；写错很难发现 |
| Memory 写了又改、改了又删，没有审计 | 出问题无法回溯 |
| Memory 内容混进 context 但没标"这是记忆"，模型把它当 system instruction | 容易被 prompt injection 改写记忆 |
| Memory 是 vector embedding，召回不确定 | 复现失败、隐私边界乱 |

**MVP 立场**：只做 **reviewed Markdown memory**。每一条 memory entry 都对应一份人类可读的 Markdown 文件，写入前必须经过用户审批。**显式不引入 vector memory**（见 [[adr-0002]]）。

## 2. 四层 memory tier

```
┌──────────────────────────────────────────────────┐
│ User memory     ~/.config/custom-agent/memory/   │
│   跨所有项目；偏个人偏好                          │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ Project memory  <repo>/.custom-agent/memory/      │
│   仅当前 repo；偏项目约定                         │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ Session memory  <session-id>.memory.json (临时)   │
│   只在本 session 有效；不持久化为 durable         │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ Candidate       <repo>/.custom-agent/candidates/  │
│   agent 提议但未审批；durable 但不进 context      │
└──────────────────────────────────────────────────┘
```

**优先级**：context build 时按 user → project → session 顺序，**下游覆盖上游**——和 instruction hierarchy 一致。Candidate 永不进 context，只在 ApprovalUI 中显示。

## 3. Candidate workflow（核心创新）

agent 自己不能直接写 durable memory。它只能产生"candidate"——一份待审议的 diff，由用户决定是否合入。

```
                evidence (turn 中的 user message / tool output / model.delta)
                       │
                       ▼
               agent 产生 candidate
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
      candidate.created  ←──── 写入 .custom-agent/candidates/
      event 入 log              <id>.md (含 diff + rationale)
            │
            ▼
      ApprovalUI 把 candidate 显示给 user
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
  apply   edit    discard
   │        │        │
   ▼        ▼        ▼
candidate.applied  candidate.discarded
event 入 log       event 入 log
   │
   ▼
durable memory file 更新 (.custom-agent/memory/<key>.md)
   │
   ▼
memory.updated event 入 log
```

**关键不变性**：

- **agent 永不绕过 candidate 直接写 durable**：所有 durable memory 写入都对应一条 `candidate.applied` event。
- **rollback 必须可能**：`candidate.applied` event 含 "before" 内容快照；user 后悔可以 revert 触发 `memory.reverted` event。
- **candidate 即使被 discard 也留在 event log**：discard 不是删除，是审计痕迹（用户拒绝过这个建议）。

## 4. Memory entry 文件格式

每条 memory entry 是一份 frontmatter + body 的 Markdown：

```markdown
---
id: mem_pref_indent
type: preference
scope: user | project | session
createdAt: 2026-05-18T10:30:00Z
appliedFrom: cand_2026_xxx
appliedBy: user
sources:
  - sessionId: sess_x
    turnId: turn_y
    evidence: "user 在 turn y 说 '我用 4 space 不用 tab'"
relatedSessions: []
---

用户偏好缩进：4 spaces，不要 tab。

适用于所有项目。除非用户明确说切换。
```

frontmatter 字段：

- `id`：稳定 ID；其他 event 用 `mem_pref_indent` 引用。
- `type`：`preference` / `convention` / `fact` / `forbidden`；ContextBuilder 按类型决定写进 prompt 的什么位置。
- `scope`：影响 PolicyStore + ContextBuilder 装哪一桶。
- `appliedFrom`：candidate id 反查；闭环审计。
- `sources`：哪些 turn 的什么内容触发了这条 memory；replay 时能定位。
- `relatedSessions`：可选，跟踪这条 memory 改变了哪些后续 session 的行为。

body 是人类可读的 Markdown，**模型也读得到**——但 ContextBuilder 装进 prompt 时会标记 "这是来自 memory 系统的内容"，避免模型把它当 instruction 误用。

## 5. Candidate 生成的算法（agent 自己怎么决定提哪些）

M4-04 落地时引入。粗略策略：

1. **明显偏好信号**：user 直接说"我喜欢/不喜欢/请记住/以后..." → 高优先级 candidate。
2. **重复纠正**：user 在多个 turn 内反复纠正同一类错误 → 中优先级 candidate。
3. **环境约定**：project 内 `.editorconfig` / `package.json` 中的设置发生变化 → 低优先级 candidate（建议同步到 memory，避免 agent 用旧约定）。
4. **隐式偏好（保守）**：例如 user 接受 agent 输出 5 次都没修改空白，可能可以提一个 candidate。**MVP 不做**，避免误读。

**candidate.rationale 必须列出"为什么提这条"**：让 user 一眼能判断是否合理。

## 6. Memory 在 context 中的位置

ContextBuilder（见 [`context.md`](context.md) §3）的 memory 桶按以下顺序填：

1. `type: forbidden` 永远先装（"禁止 push --force" 这类必须给模型看到）。
2. `type: preference` / `convention` 按 `scope` 优先级（user > project > session）+ recency 装。
3. 超出预算时按 `relatedSessions` 关联度截断（与当前 session 相关的优先保留）。

**装入 prompt 时的呈现**：

```
[memory:user:preference]
缩进 4 spaces，不要 tab。

[memory:project:convention]
本 repo 提交信息必须带 conventional commit prefix。

[memory:project:forbidden]
禁止使用 git push --force（已被 user 标记多次）。
```

prefix `[memory:scope:type]` 让模型能区分这是记忆 vs 系统指令；也方便 prompt injection 检测时定位污染来源。

## 7. Memory 与 Replay

**memory entry 不存进 event log**（它们是 durable 文件，独立持久化）。但所有 memory 变更（candidate.created / applied / discarded / reverted、memory.updated）都进 event log。

Replay 一个老 session 时：

- ContextBuilder 用**当时的 memory 状态**装 context。
- 实现：每条 memory 文件有 git 历史（用户审批/修改/删除都是 git commit）；replay 时按 session createdAt 切到对应 commit 的 memory 视图。
- 或更简单：把每次 `memory.updated` event 含 "after" 快照存进 event log payload，replay 时用这个快照。

**M4-04 选择后者**：snapshot 进 event log。代价是 log 体积稍大，收益是 replay 完全自包含。

## 8. 为什么不引入 Vector Memory

[[adr-0002]] 已说明。简述：

| Vector memory 的"理想" | MVP 立场认为的真实代价 |
|---|---|
| 跨项目"语义召回"，agent 显得很智能 | 召回不确定 → 复现失败时无法定位是 retrieval 错还是 model 错 |
| 大规模存储用户历史 | 隐私边界乱：哪些可以跨项目召回、哪些不可以？很难讲清 |
| Embedding 模型自动 update memory | 写错的 memory 难以回滚（vector 没有 diff） |
| 经典 RAG 配套 prompt injection 防御 | 检索结果中含恶意内容时，注入面更大 |
| 自动化"记住 user 偏好" | 隐式记忆 = 用户未授权 |

**等 reviewed Markdown memory 上线、有真实用户使用 6 个月以上、能明确指出"哪类需求确实必须 vector 才能满足"**，再考虑加 vector layer，且仍保留"reviewed candidate"作为唯一 durable 写入门户。

## 9. 实现状态

- M1 / M2 / M3：暂无 memory layer。
- **M4-04 实装 candidate workflow**：candidate.created / .applied / .discarded events；ApprovalUI 渲染 candidate；durable memory 文件落 `.custom-agent/memory/`。
- M4-04 完成后：M5 skill 可以 declare "需要读 memory tier"；context.built 算 memory 桶。
- 后续（M9b+）：memory.reverted、bulk export / import、跨项目同步策略。

## 10. 测试策略

- **candidate apply / discard 单测**：apply 后 durable 文件落地；discard 后 durable 不变；rollback event 链可 replay 还原原状。
- **memory 在 prompt 中的呈现 golden test**：给定 memory entry 集合，断言 ContextBuilder 装进 prompt 的字节级稳定。
- **prompt injection through memory**：恶意 candidate 注入"忽略之前指令"——必须被 contextBuilder 检测出（M9a）。
- **跨项目隔离测试**：project A 的 memory 不能漏给 project B 的 session。
- **空 memory case**：所有 tier 都空时 context.built 仍 valid。

## 11. 常见误区

| 误区 | 纠正 |
|---|---|
| "agent 学到东西就立即写 memory" | 不行；必须先产 candidate，user 审批后才 durable |
| "memory entry 删了就完事" | 不行；删除是一条 `memory.deleted` event，原内容仍在 git 历史中（可审计） |
| "candidate 一旦 discard 就丢" | 不行；discarded candidate 留在 event log，让审计能看"用户拒绝过这种建议" |
| "memory 是 vector store，模糊召回更智能" | MVP 不做；reviewed Markdown 是唯一形态 |
| "memory 内容直接拼成 system prompt" | 不行；要带 `[memory:scope:type]` 前缀，模型知道"这是记忆" |

## 12. 进一步阅读

- [`context.md`](context.md) — 每 turn 装 model request 的过程
- [[adr-0002]] §"延后研究：Vector Memory" — 为什么不引入向量记忆
- [`tools-and-permissions.md`](tools-and-permissions.md) §8 — prompt injection 通过 memory 路径的防御
- [`reference/event-schema.md`](../reference/event-schema.md)（待写）— `candidate.*` / `memory.*` event payload schema
