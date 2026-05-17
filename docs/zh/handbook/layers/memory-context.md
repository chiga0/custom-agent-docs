# Memory 与 Context 层

## 真实作用

Context 决定模型当前能看到什么。Memory 决定模型跨 session 能记住什么。

这两层会直接影响 agent 行为，因此必须可解释、可审计、可回滚。

## ContextBuilder 做什么

ContextBuilder 把多种来源合成一次模型请求：

- System/developer instructions。
- User prompt。
- Session transcript。
- Compaction summary。
- Project instructions。
- Memory entries。
- Skill metadata。
- Tool schemas。
- MCP resources。

输出：

- Provider-neutral model request。
- Context budget report。
- `context.built` event。

## Instruction Hierarchy

建议顺序：

```text
global user instructions
project root AGENTS.md
directory-scoped AGENTS.md
session instruction
runtime safety policy
```

需要明确：

- 谁覆盖谁。
- 哪些只能追加。
- 哪些不能被项目文件覆盖。

## Memory 分类

- User memory：用户偏好，跨项目。
- Project memory：项目约定，当前 repo。
- Session memory：当前 session 临时状态。
- Candidate memory：待审查候选。

MVP 只做 reviewed memory，不做静默 auto-memory。

## Memory Candidate 流程

```text
evidence
  -> candidate
  -> diff
  -> review
  -> apply | discard
  -> durable memory
```

每一步都应有事件。

## Token Budget

ContextBuilder 必须知道预算：

- Instructions budget。
- Transcript budget。
- Tool schema budget。
- Memory budget。
- Skill metadata budget。
- Resource budget。

不要等 provider 报 context too long 才处理。

## Vector Memory 为什么延后

Vector memory 有价值，但早期会带来：

- 检索不可解释。
- 隐私边界不清。
- 错误记忆难回滚。
- 与 prompt injection 风险叠加。
- 测试不稳定。

所以先做 Markdown/reviewed memory。

## 常见坑

- 自动加载所有历史。
- 自动加载所有 skill body。
- 自动加载所有 MCP resources。
- Memory 无来源。
- Memory 无删除机制。
- Compaction summary 编造事实。

## 测试策略

- Instruction order。
- Context budget calculation。
- Truncation determinism。
- Memory candidate apply/discard。
- Compaction summary source range。
- Prompt injection through memory。
