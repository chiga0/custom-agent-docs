# 技术手册

这部分文档不是单纯的实现记录，而是面向开发者的技术手册：解释每一层真实作用、为什么这样设计、如何从 0 到 1 构建一套 agent 框架、如何在当前项目中落地。

## 阅读路径

如果你是第一次从零构建 agent 框架，建议按顺序阅读：

1. [从零到一构建 Agent 框架](tutorials/build-agent-from-zero.md)
2. [分层架构总览](layered-architecture.md)
3. [Agent Core 层](layers/agent-core.md)
4. [Model Gateway 层](layers/model-gateway.md)
5. [Tool 与 Permission 层](layers/tool-permission.md)
6. [Session、Event Log 与 Replay](layers/session-event-replay.md)
7. [Memory 与 Context 层](layers/memory-context.md)
8. [Skill 系统](layers/skills.md)
9. [MCP 集成层](layers/mcp.md)
10. [Client 与 Protocol Adapters](layers/client-protocol-adapters.md)
11. [Remote、Plugin、Automation 预留](layers/future-capabilities.md)

## 文档类型

- `layers/`：解释系统每一层的真实作用、边界、输入输出、实现策略。
- `modules/`：解释项目 package/module 的职责、API 形状和实现细节。
- `tutorials/`：面向从零构建的教程和演练。

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
