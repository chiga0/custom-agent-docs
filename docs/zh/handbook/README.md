---
title: "技术手册"
---

这部分文档不是单纯的实现记录，而是面向开发者的技术手册：解释每一层真实作用、为什么这样设计、如何从 0 到 1 构建一套 agent 框架、如何在当前项目中落地。

## 新读者从这里开始

- **[INTRO.md](INTRO.md)** — 5 分钟读懂整个 framework；mental model + 三个非协商原则 + 一个 turn 的极简流程。**读完 INTRO 再读其他章节。**
- **[GLOSSARY.md](GLOSSARY.md)** — 术语表（`ACP` / `AgentEvent` / `stopReason` / `compaction` / `lazy loading` / `cwd binding` / ...）；遇到不认识的词查这里。
- **[reference/adr-index.md](reference/adr-index.md)** — ADR 0001-0005 索引；`[[adr-NNNN]] §X` 引用的 X 含义对照都在这。
- **[foundations/turn-lifecycle.md](foundations/turn-lifecycle.md)** — 一个 turn 的完整事件级时间线 + FSM + cancel / error 分支。

## 阅读路径（按目标分流）

### 路径 A：1 小时通览

适合"我想理解 agent framework 大致怎么回事"。

1. [INTRO.md](INTRO.md)
2. [foundations/turn-lifecycle.md](foundations/turn-lifecycle.md)
3. [GLOSSARY.md](GLOSSARY.md)（速翻）
4. [reference/adr-index.md](reference/adr-index.md)（速翻）

### 路径 B：从零自己实现

适合"我打算 fork 这个 repo 或者照着自己写一个 agent framework"。

1. [INTRO.md](INTRO.md)
2. [tutorials/build-agent-from-zero.md](tutorials/build-agent-from-zero.md)（**注：当前版本是设计笔记；Phase 4 重写后会含可跑代码 + checkpoint**）
3. [layered-architecture.md](layered-architecture.md)
4. [layers/agent-core.md](layers/agent-core.md)
5. [layers/session-event-replay.md](layers/session-event-replay.md)
6. [layers/model-gateway.md](layers/model-gateway.md)
7. [layers/tool-permission.md](layers/tool-permission.md)
8. [layers/memory-context.md](layers/memory-context.md)
9. [layers/skills.md](layers/skills.md)
10. [layers/mcp.md](layers/mcp.md)
11. [layers/client-protocol-adapters.md](layers/client-protocol-adapters.md)
12. [layers/future-capabilities.md](layers/future-capabilities.md)

### 路径 C：架构 review / 安全审查

适合 reviewer agent / 资深审查者。

1. [INTRO.md](INTRO.md)
2. [foundations/turn-lifecycle.md](foundations/turn-lifecycle.md)
3. [../adr/0001-core-boundary.md](../adr/0001-core-boundary.md)
4. [../adr/0003-architecture-audit-clarifications.md](../adr/0003-architecture-audit-clarifications.md)
5. [../adr/0004-acp-unified-transport.md](../adr/0004-acp-unified-transport.md)
6. [layered-architecture.md](layered-architecture.md) §design-check-questions

### 路径 D：开发治理 / PR 流程

1. [`../03-roadmap-status.md`](../03-roadmap-status.md)
2. [`../../../custom-agent/AGENTS.md`](https://github.com/chiga0/custom-agent/blob/main/AGENTS.md)（PR Module / Task Claim / Reviewer Routing）
3. [`../04-quality-ci-test-strategy.md`](../04-quality-ci-test-strategy.md)
4. [`../07-implementation-backlog.md`](../07-implementation-backlog.md)

## 文档类型

- `INTRO.md` / `GLOSSARY.md` — 入口与术语表（**优先读**）。
- `foundations/` — 概念基础与设计原则；不变性强，给"为什么这样"提供答案。
- `tutorials/` — 从零构建演练（Phase 4 重写后含 checkpoint）。
- `layers/` — 解释系统每一层的真实作用、边界、输入输出、实现策略。
- `modules/` — 解释项目 package/module 的职责、API 形状和实现细节。
- `reference/` — 索引型材料（ADR 索引、glossary、event schema、FAQ 等）。

详见 [RESTRUCTURE-PLAN.md](RESTRUCTURE-PLAN.md)（Phase 2-4 的重构与文档站施工计划）。

## 写作要求

每篇技术文档都应回答：

- 这一层解决什么真实问题？
- 它不应该解决什么问题？
- 输入和输出是什么？
- 依赖谁，不应该依赖谁？
- 最小实现怎么写？
- 成熟实现需要补哪些能力？
- 常见坑是什么？
- 如何测试？
- 在当前 roadmap 中处于什么阶段？

新增文档请优先使用 [技术文档模板](templates/technical-doc-template.md)。

## 站点化路线

handbook 当前是纯 Markdown；将通过 [Astro Starlight + Cloudflare Pages + Pagefind] 升级为公开访问的文档站。施工分 4 phase（决策 → 框架 → 内容迁移 → 重写）。详见 [[adr-0005]] + [RESTRUCTURE-PLAN.md](RESTRUCTURE-PLAN.md)。
