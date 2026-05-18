# Context（ContextBuilder：决定模型这一次看到什么）

> 拆自 `handbook/layers/memory-context.md`。原文把"Context"（model 当下看到的）和"Memory"（agent 跨 turn 记住的）混在一起，新手读完很难分清。**本文只讲 Context；Memory 见 [`memory.md`](memory.md)**。

---

## 1. ContextBuilder 解决的问题

每一次模型调用都需要装一个"prompt + 历史 + tool 列表"的包裹给 provider。新手最容易踩三个坑：

1. **把全部历史塞进去**：第 10 轮对话 prompt 长 50k tokens，agent 卡死 / 烧钱。
2. **把 memory 直接拼成 system instruction**：模型不知道哪一段是用户授权的、哪一段是 agent 自己 derive 的；prompt injection 容易污染 memory。
3. **每个 client 自己拼**：Web 把 transcript 拼成一种样子，CLI 又拼一种；replay 失真。

ContextBuilder 就一件事：**接收原料（instruction / transcript / memory / tools / MCP resources），按预算装出一个 provider-neutral request，并发一条 `context.built` event 让审计看到怎么装的。**

输入 vs 输出：

```
输入：
  - session id + turn id
  - 当前 turn 的用户消息
  - 用户/项目/目录/session instructions
  - 历史 transcript (含 model.delta、tool.completed 等，按需投影成 ChatML)
  - 启用的 memory entries
  - 启用的 tool schemas（含 MCP）
  - 启用的 MCP resources（必须显式 include）
  - capability hints（max_context_tokens、supports_tool_call 等）

输出：
  - ModelRequest（provider-neutral，已经按 budget 截断）
  - context.built event（含 token breakdown，便于审计 / replay）
```

## 2. Instruction Hierarchy

Instructions 是分层覆盖的。顺序从弱到强：

```
1. global user instructions       ← ~/.config/custom-agent/AGENTS.md
2. project root AGENTS.md         ← <repo>/AGENTS.md
3. directory-scoped AGENTS.md     ← <repo>/<subdir>/AGENTS.md（当 cwd 在 subdir 时）
4. session instruction            ← 由 createSession 传入或运行时 set
5. runtime safety policy          ← 内置；不能被项目文件覆盖（防止 repo 内 AGENTS.md 关掉安全约束）
```

规则：

- **下游覆盖上游**——但 #5 永远不能被任何 #1-#4 覆盖。
- **追加 vs 覆盖**：同名字段（如 `coding_style`）下游覆盖；列表型字段（如 `forbidden_commands`）下游**追加**。
- **不消化未知字段**：未识别的 frontmatter key 透传给模型，由模型自行解读；ContextBuilder 不发明语义。

实现位置：M4-01 `Instruction Discovery`（`packages/core/src/context/instructions/`，预计）。

## 3. Token Budget 分桶

`maxContextTokens` 来自 `ModelProvider.capabilities`。ContextBuilder 按预算分桶：

| 桶 | 默认比例（占 maxContextTokens） | 策略 |
|---|---|---|
| **Instructions** | 8% | 不截断；如果超出预算说明 AGENTS.md 写得太多，必须配置硬限报警 |
| **Memory entries** | 5% | 优先包含本 turn 高相关条目；超额按 recency 截断 |
| **Tool schemas** | 10% | 只装 ToolRouter 此 turn 标记可用的工具；MCP server schema 按需 lazy-load |
| **MCP resources (explicit)** | 7% | 必须 user/policy explicit include 才进；不自动加 |
| **Transcript** | 60% | 主体；按 sliding window + 必要时进入 compaction（M4-03）|
| **Reserve（completion budget）** | 10% | 留给模型输出 |

比例可在 PolicyStore 覆盖。

**预算检查时机**：装好 ModelRequest 后，在调 `ModelProvider.stream` **之前** 做 preflight。超额则不发请求，按 [[adr-0003]] §T2 走 context_overflow 失败：

```ts
// 伪代码
const built = contextBuilder.build({...});
if (built.totalTokens > provider.capabilities.maxContextTokens) {
  // M2-M4 中间阶段：直接 stopReason=error
  emit("turn.completed", { stopReason: "error", errorCode: "context_overflow" });
  return;
}
// M4 完成后：触发 compaction → 重试一次
```

## 4. `context.built` event

每次 build 都 emit 一条。这是事后审计 / replay 的关键。

```jsonc
{
  "type": "context.built",
  "sessionId": "sess_x",
  "turnId": "turn_y",
  "sequence": N,
  "timestamp": "...",
  "payload": {
    "modelId": "openai-gpt-4o",
    "providerCapabilities": {
      "maxContextTokens": 128000,
      "supportsToolCall": true
    },
    "tokensByBucket": {
      "instructions": 1240,
      "memory": 480,
      "toolSchemas": 3210,
      "mcpResources": 0,
      "transcript": 9821,
      "reserve": 12800
    },
    "totalTokens": 27551,
    "sources": {
      "instructions": ["global", "project:/Users/u/repo/AGENTS.md"],
      "memory": ["mem_a", "mem_b"],
      "tools": ["read_file", "shell", "mcp:fs.read_text"]
    },
    "truncated": {
      "transcript": { "droppedEvents": 12, "summaryEventRef": null }
    }
  }
}
```

字段含义：

- `tokensByBucket` 让人直接看每桶用了多少。
- `sources` 记录原料来源（哪些 instructions 文件、哪些 memory id），方便 replay 在原始 instructions 修改后比对。
- `truncated.transcript.droppedEvents` 表示这次有多少历史事件被丢弃；`summaryEventRef` 在 M4 启用 compaction 后指向对应 `session.compacted` event。

**重要**：`context.built.payload` **不存 ModelRequest 实际内容**（messages 数组太大且含 transcript 副本）。只存元信息。

## 5. Transcript 投影

ContextBuilder 不直接把 event log 倒进 transcript；要做 **投影**：

| AgentEvent type | 投影成 ChatML role | 备注 |
|---|---|---|
| `user.message` | `{ role: "user", content: payload.content }` | 1:1 |
| `model.delta` | 合并连续 deltas → `{ role: "assistant", content }` | 合并是 buffer 操作，不写新 event |
| `tool.completed` | `{ role: "tool", tool_call_id, content: stdoutPreview / result }` | 完整 stdout 在 artifact storage（M9b）；这里用 preview |
| `permission.resolved (deny)` | `{ role: "tool", tool_call_id, content: "<denied by policy: ...>" }` | 让模型看到为什么被拒，避免无意义重试 |
| `session.created` | 不投影 | 装作模型不知道 session metadata，避免模型把 cwd 当 instruction |
| `turn.started` / `context.built` / `permission.*` | 不投影 | 内部审计事件，不进 prompt |

**特殊处理**：

- 合并 `model.delta` 时，遇到 tool_call 中断要打断合并：assistant 的"思考 → 工具调用 → 思考 → 工具调用"必须在 ChatML 里也是多条 assistant 消息（与 tool 消息交替），否则模型读不出意图。
- compaction 之后的转录用 `session.compacted.payload.summary` 替换被压缩范围。

## 6. 与 `Memory` 的关系（划清边界）

Memory 是**可选的、长期的**额外内容；Context 是**每 turn 必算**的当下 view。

```
Memory (跨 turn 记什么)            Context (当下看什么)
   │                                 │
   │     ┌──── Memory entries ──────►│
   │     │                           │
   │     │     ┌── instructions ────►│
   │     │     │                     │
   │     │     │     ┌── transcript ►│
   │     │     │     │               │
   │     │     │     │     ┌── tools►│
   │     │     │     │     │         │
   ▼     ▼     ▼     ▼     ▼         │
（Memory layer）                    （ContextBuilder layer）
跨 session 持久                      每 turn 计算一次
受 candidate review 约束             无 review；纯函数
不写 prompt                          组装 prompt
                                    
```

详见 [`memory.md`](memory.md)。

## 7. 实现状态

- M1（当前）：暂无 ContextBuilder；FakeStreamingProvider 直接 ignore request 的 messages 内容。
- M2-01（接真 provider）：必须先实现最小 ContextBuilder（instructions + transcript + reserve；memory 可选；MCP 不接）+ context_overflow preflight。
- M4-01：完整 instruction discovery。
- M4-02：完整 budget accounting + `context.built` event 入 schema。
- M4-03：deterministic compaction 触发 → 重试 path。

## 8. 测试策略

- **builder 单测**：给定 instructions / transcript / memory / tools 输入，断言 `tokensByBucket` 精确数字 + `sources` 一致。
- **桶比例覆盖**：每桶超额时按预定策略截断（不抢其他桶）。
- **transcript 投影测试**：model.delta 合并 + tool.completed 注入 + permission.deny 注入的 ChatML 输出。
- **golden context test**：给定 fixture session，build 出的 ModelRequest 字节级稳定（M4-QA-01）。
- **prompt injection through memory test**：恶意 memory 条目能不能伪装成 system instruction（应该被 contextBuilder 标记并 quarantine）。

## 9. 常见误区

| 误区 | 纠正 |
|---|---|
| "transcript 全部历史都装就行" | 不行；要按 budget 截断或 compaction，否则 token / 钱 / 延迟都爆 |
| "memory 直接当成 system instruction" | 不行；memory 是独立桶，sources 字段记录来源，便于审计 |
| "MCP server 一接入，所有 resource 都自动装 context" | 不行；resource 必须 explicit include；详见 [`layers/mcp.md`](../layers/mcp.md)（Phase 4 P1 重写中） |
| "ContextBuilder 算完 prompt 直接送 model 就行" | 不行；要先 emit `context.built` event 再调 stream；先持久化后副作用 |
| "context.built 里塞 ModelRequest 全文" | 不行；只放元信息，否则 event log 会有 transcript 副本爆炸 |

## 10. 进一步阅读

- [`memory.md`](memory.md) — Memory candidate workflow + 持久化模型
- [`foundations/turn-lifecycle.md`](../foundations/turn-lifecycle.md) §3 — `context.built` 在 turn 时间线中的位置
- [`reference/event-schema.md`](../reference/event-schema.md)（待写）— `context.built` payload schema
- [[adr-0003]] §T2 — context overflow 兜底
