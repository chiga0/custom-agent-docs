---
title: "Quickstart：15 分钟跑出第一个 Turn"
---

读完 [INTRO.md](../INTRO.md) 后，按本指南动手验证你已经理解。

预期：clone 仓库 → 装依赖 → 跑测试 → 打开生成的 JSONL 文件 → 改一段代码看 event 流变化。

---

## 0. 前置

- Node.js 22+（M1 期最低要求；nvm/asdf 都行）。
- 基础 TypeScript 阅读能力。
- 15 分钟空闲。

```bash
node -v   # 应输出 v22.x 或更高
npm -v    # 应输出 10.x 或更高
```

## 1. Clone + 安装

```bash
git clone https://github.com/chiga0/custom-agent.git
cd custom-agent
npm install
```

第一次安装会编译 `better-sqlite3` 原生绑定（M1-02 用），耗时 30s 左右；后续装包会跳过。

## 2. 看仓库布局

```
custom-agent/
├── packages/
│   ├── schema/        ← AgentEvent 类型定义
│   ├── core/          ← SessionEngine + FakeStreamingProvider
│   ├── storage/       ← JsonlEventLog + SessionIndex
│   └── permissions/   ← (M3 引入；目前是空 placeholder)
├── apps/
│   ├── web-client/    ← M1 阶段仅静态 fixture 渲染
│   ├── cli/           ← M1 阶段占位
│   └── acp-server/    ← M1-ACP-STDIO 落地后填充
└── tests/
    └── architecture/  ← 架构 fitness test（守护包间禁止依赖）
```

## 3. 跑一遍现有测试

```bash
npm run test
```

应看到 30+ 个测试全过，含 storage / core 两侧的事件流测试。

## 4. 自己写一个最小脚本看 JSONL

测试用临时目录跑完就清理了。要看真实的 JSONL，建一个独立脚本：

```bash
mkdir -p /tmp/my-session
cat > /tmp/run-fake.mjs <<'EOF'
import { SessionEngine, FakeStreamingProvider, JsonlFileEventStore }
  from "./packages/core/src/index.ts";
// 注意：如果是 dist 或 build 产物路径不同，请改路径。直接 import .ts 需要在
// 项目根用 `npx tsx /tmp/run-fake.mjs`（tsx 已在 dev deps，或临时 npm i -g tsx）。

const store = new (await import("./packages/core/src/adapters/jsonl-event-store.ts"))
  .JsonlFileEventStore("/tmp/my-session");
const engine = new SessionEngine({
  eventStore: store,
  provider: new FakeStreamingProvider({ chunks: ["hi ", "there"] }),
});

const session = await engine.createSession({ cwd: "/tmp", client: "test" });
console.log("SESSION:", session.sessionId, "→ /tmp/my-session/" + session.sessionId + ".jsonl");

for await (const evt of engine.runTurn({ sessionId: session.sessionId, userMessage: "hello" })) {
  console.log("EVENT", evt.sequence, evt.type);
}
EOF

npx tsx /tmp/run-fake.mjs
cat /tmp/my-session/sess_*.jsonl
```

应该看到 6 行 JSON，类似：

```json
{"id":"evt_x","schemaVersion":1,"sessionId":"sess_x","sequence":1,"timestamp":"2026-...","type":"session.created","payload":{"cwd":"/tmp","client":"test"}}
{"id":"evt_x","schemaVersion":1,"sessionId":"sess_x","turnId":"turn_x","sequence":2,"timestamp":"2026-...","type":"turn.started","payload":{"promptPreview":"hi"}}
...
```

这就是 session 的事实真值。任何 client 看到的 transcript / timeline 都是这个 JSONL 的投影。

## 5. 改 FakeStreamingProvider 看变化

打开 `packages/core/src/providers/fake-provider.ts`，找到 `DEFAULT_CHUNKS`。改成你自己的话：

```ts
const DEFAULT_CHUNKS: readonly string[] = [
  "Hello ",
  "from ",
  "custom-agent.",
];
```

重新跑测试：

```bash
npm run test
```

应该有 1 个测试失败，因为它期望旧的 chunks。打开测试，把期望也改成新的 chunks。让测试再次绿。

**你刚刚做了什么**：你修改了 fake model 的输出 → SessionEngine 把它转换成 `model.delta` 事件 → 写进 JSONL → 测试 replay 出来比对。从 model 流到 event log 再到测试断言，这条 path 你已经摸完整了。

## 6. 看 turn 状态机

打开 `packages/core/src/session-engine.ts`，看 `TurnFsm` class。这是 M1-03 review 时增加的显式状态机：

```ts
const LEGAL_TRANSITIONS: Record<TurnState, ReadonlySet<TurnState>> = {
  idle: new Set(["running"]),
  running: new Set(["completed", "cancelled", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
};
```

任何状态转移走 `transition(to, reason)`，记录到 `history`。M1-03 测试里有一条专门断言历史链路是 `idle->running`。

完整 turn 时间线见 [`foundations/turn-lifecycle.md`](../foundations/turn-lifecycle.md)。

## 7. 你已经具备的能力

完成这 7 步后你应该能回答：

- `AgentEvent` 在哪里定义（`packages/schema/src/index.ts`）？
- 谁负责 append 一条 event（`SessionEngine` 通过 `EventStore.append`）？
- 序号是什么时候递增（commit 成功后，append 失败不递增——见 `commitEvent`）？
- 怎么取消一个 turn（`cancelTurn(sessionId)` → controller.abort → provider stream 看到 signal.aborted → SessionEngine 设 stopReason="cancelled"）？
- 怎么读回一个 session 的所有事件（`JsonlEventLog.replay()` async iterable）？

## 下一步

- **想理解架构**：[`foundations/turn-lifecycle.md`](../foundations/turn-lifecycle.md) → [`layered-architecture.md`](../layered-architecture.md)
- **想加新功能**：先读 [`03-roadmap-status.md`](../../03-roadmap-status.md) §7 看 M1-04 / M1-WEB-01 / M1-QA-01 哪个 `READY`；按 [PR Module](https://github.com/chiga0/custom-agent/blob/main/AGENTS.md) 走流程
- **遇到陌生词**：查 [GLOSSARY.md](../GLOSSARY.md)
- **想了解决策来源**：[reference/adr-index.md](../reference/adr-index.md)
