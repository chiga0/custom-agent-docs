---
title: "Session、Event Log 与 Replay"
---

## 真实作用

Session 是用户与 agent 的长期交互容器。Event log 是 session 的事实来源。Replay 是调试、测试、审计和 remote-control 的基础。

没有 replay，agent 系统会很快变成黑盒。

> M1 落地状态：JSONL append/read（M1-01）+ SQLite session index（M1-02）+ SessionEngine 内存重建（M1-03）+ ACP `session/load` 跨进程回放（M1-04）+ golden 投影回归（M1-QA-01）全部完成；本章以 M1 实现为准。

## Session 包含什么

- Session id。
- CWD / workspace。
- Client info。
- Turns。
- Events。
- Artifacts。
- Active instructions。
- Compaction summaries。
- Memory candidates。

## Event Log 设计

推荐 append-only JSONL：

```json
{
  "schemaVersion": 1,
  "id": "evt_1",
  "sessionId": "sess_1",
  "sequence": 1,
  "type": "session.created",
  "payload": {}
}
```

为什么 JSONL？

- 易读。
- 易 append。
- 易 diff。
- 可部分恢复。
- 适合 golden fixtures。

SQLite 可以做 index，但不要做事实来源。

## Event Envelope

建议字段：

- `schemaVersion`
- `id`
- `sessionId`
- `turnId`
- `sequence`
- `timestamp`
- `type`
- `payload`
- `meta`

## Replay 的两种含义

### Event Replay

按顺序读取事件，重建 session 状态。

M1 提供两条 event replay 路径：

- **进程内**：`SessionEngine` 启动时把 JSONL 重读进内存，恢复 turn 状态机。
- **跨进程**：ACP `session/load`（M1-04）。Daemon spawn 一个新的 `apps/acp-server` 子进程，子进程通过共享的 `ACP_EVENT_LOG_ROOT` 找到 JSONL，每条事件经 `event-mapper` 翻成 `session/update` 通知发回客户端。Web client 用同一个 transcript reducer 同时消费 live 和 replay 两路 SSE。

M1 的 `session/load` 是 **replay-only** 语义：仅回放历史 `session/update`，不在子进程里重建 engine 状态机。`session/prompt` 在 loadSession 之后被拒绝。继续运行已加载 session 需要"resume"语义，是 M2+ 工作。

### Transcript Projection

从事件生成用户可读 transcript：

- user message。
- assistant text。
- tool calls（M3+）。
- tool results（M3+）。
- final answer。

两者不要混在一起。Event 是事实，projection 是视图。

`packages/qa-fixtures/src/projection.ts` 是 canonical 投影：把 `AgentEvent[]` 归一成 `{type, payload}[]`，再 key-sort + JSON.stringify 生成 byte-stable 字符串。golden test 用同一份投影同时断言 live ≡ replay 与 fixture，任何一层 drift 都会被同时打破。

## Compaction

Compaction 不是删除历史，而是生成 summary event。

```text
old events -> summary -> session.compacted
```

原始事件仍可保留或归档。Summary 必须说明来源范围。

## 最小实现（M1 落地）

1. JSONL append/read：`packages/storage/src/event-log.ts` (`JsonlEventLog`)。tail-cache + write queue。
2. Sequence 校验：每条 event 的 `sequence` 单调递增，replay 时不连续就抛 `InvalidEventLog`。
3. Session index：`packages/storage/src/session-index.ts`（SQLite），从 JSONL 重建，事实来源仍是 JSONL。
4. Replay projection：`packages/qa-fixtures/src/projection.ts`（normalize）+ `apps/acp-server/src/event-mapper.ts`（ACP wire mapping）。
5. ACP `session/load`：`apps/acp-server/src/agent.ts loadSession()` + `apps/acp-daemon/src/session-manager.ts loadSession()`。
6. Golden fixture：`packages/qa-fixtures/src/__fixtures__/m1-fake-turn.golden.json` + 三层等价断言。
7. Live≡replay smoke：`apps/acp-daemon/src/smoke.test.ts` end-to-end 真子进程跑一遍 new + prompt 然后 load，断言两路 SSE byte-equal。

## 常见坑

- 只在内存里维护 session state。
- UI state 成为事实来源。
- SQLite index 与 JSONL 不一致。
- Event 没有 schema version。
- Replay 和 live 行为不一致。
- Tool output 没有落 event。

## 测试策略

- Append/read round trip。
- Crash-safe partial write。
- Index rebuild from JSONL。
- Golden transcript。
- Live/replay equivalence。
- Schema migration。
- Corrupt event handling。
