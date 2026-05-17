# Session、Event Log 与 Replay

## 真实作用

Session 是用户与 agent 的长期交互容器。Event log 是 session 的事实来源。Replay 是调试、测试、审计和 remote-control 的基础。

没有 replay，agent 系统会很快变成黑盒。

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

### Transcript Projection

从事件生成用户可读 transcript：

- user message。
- assistant text。
- tool calls。
- tool results。
- final answer。

两者不要混在一起。Event 是事实，projection 是视图。

## Compaction

Compaction 不是删除历史，而是生成 summary event。

```text
old events -> summary -> session.compacted
```

原始事件仍可保留或归档。Summary 必须说明来源范围。

## 最小实现

1. JSONL append。
2. JSONL read。
3. sequence 校验。
4. replay projection。
5. corrupt line policy。
6. fixture normalization。

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
