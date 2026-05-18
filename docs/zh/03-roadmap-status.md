# Roadmap 状态中心

最后更新：2026-05-18

维护方式：每个影响 roadmap、milestone、工作状态、并行开发范围的 PR 都必须更新本文件，或在 PR 中说明为什么不需要更新。

## 1. 当前主线

> 构建一个 local-first、event-sourced 的 agent core，并用严格 adapter 隔离 models、tools、memory、skills、protocols 和 clients。

当前主线约束：

- Web client 是第一回归和可观测面。
- CLI、ACP、IDE、channel client 都只能是 adapter。
- `core` 不得依赖 client、provider SDK 或 MCP transport implementation。
- Tool execution 必须经过 `PermissionEngine`。
- Event log 是 session replay 的事实来源。
- 中文文档 `docs/zh` 是默认规划和治理文档。

## 2. 当前阶段

当前阶段：`M1: Event-Sourced Session Core`

阶段状态：`READY`

说明：

- `M0: Project Spine and Governance` 已完成 bootstrap，项目已有 monorepo、CI、基础 schema、core/storage/permissions 占位、Web shell、architecture fitness test、中文默认文档和 mainline rules。
- 下一步进入 `M1`，重点是把当前占位实现推进为真正的 append-only event log、session index、session replay 和 Web event timeline。
- `M2+` 暂不并行实现，除非先完成对应 ADR 并确认不会扰动 M1 event/session 边界。

## 3. 状态定义

| 状态          | 含义                                   | 可否开工             |
| ------------- | -------------------------------------- | -------------------- |
| `DONE`        | 已合并，验收通过                       | 不需要开工           |
| `READY`       | 依赖已满足，可以被 agent 认领          | 可以                 |
| `CLAIMED`     | 已被 agent/PR 认领，但尚未提交主要实现 | 谨慎，避免同范围重复 |
| `IN_PROGRESS` | 正在实现，有 branch 或 PR              | 不建议同范围并行     |
| `REVIEW`      | PR 已提交，等待 review/CI              | 不建议改同范围       |
| `BLOCKED`     | 存在阻塞，需要先解除                   | 不可开工             |
| `TODO`        | 未准备好，依赖未满足                   | 不可开工             |
| `DEFERRED`    | 有意延后                               | 不可开工             |

## 4. Milestone 总览

| Milestone                               | 状态       | 当前判断                                         | 入口文档                                                             |
| --------------------------------------- | ---------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| M0 Project Spine and Governance         | `DONE`     | 初始化完成，后续只做补强                         | [Backlog](07-implementation-backlog.md#m0项目骨架)                   |
| M1 Event-Sourced Session Core           | `READY`    | 当前推荐主攻方向                                 | [Roadmap](02-roadmap.md#m1event-sourced-session-core)                |
| M2 Model Gateway                        | `TODO`     | 等 M1 event/session 边界稳定                     | [Roadmap](02-roadmap.md#m2model-gateway)                             |
| M3 Local Tools and Permission Engine    | `TODO`     | 等 M1 session/event 与 M2 provider port 初步稳定 | [Roadmap](02-roadmap.md#m3local-tools-与-permission-engine)          |
| M4 Context, Instructions and Compaction | `TODO`     | 等 M1-M3 基础能力成型                            | [Roadmap](02-roadmap.md#m4context-builderinstructions-与-compaction) |
| M5 Skills                               | `TODO`     | 等 context builder 成型                          | [Roadmap](02-roadmap.md#m5skills)                                    |
| M6 MCP Stdio                            | `TODO`     | 等 tool router/permission engine 成型            | [Roadmap](02-roadmap.md#m6mcp-stdio)                                 |
| M7 MCP Resources, Prompts and HTTP      | `TODO`     | 等 M6 完成                                       | [Roadmap](02-roadmap.md#m7mcp-resources-与-prompts)                  |
| M8 ACP Production Hardening             | `TODO`     | 等 M1-ACP-* + M2-M7 闭环；改名见 [[adr-0004]]    | [Roadmap](02-roadmap.md#m8acp-production-hardening)                  |
| M9a Security Hardening                  | `TODO`     | 拆自原 M9，与 9b/9c 可并行                       | [Roadmap](02-roadmap.md#m9asecurity-hardening)                       |
| M9b Production Ops                      | `TODO`     | 拆自原 M9                                        | [Roadmap](02-roadmap.md#m9bproduction-ops)                           |
| M9c QA and Regression                   | `TODO`     | 拆自原 M9                                        | [Roadmap](02-roadmap.md#m9cqa--regression)                           |
| M10 Remote, Extensions and Automations  | `TODO`     | M9 后评估，当前只做架构预留                      | [Roadmap](02-roadmap.md#m10remoteextensions-与-automations)          |
| Deferred Research                       | `DEFERRED` | Vector memory 和 self-evolution 暂不进主线       | [Roadmap](02-roadmap.md#deferred-researchmemory-与-self-evolution)   |

## 5. 当前活跃工作

| Work ID | 状态 | Owner/Agent | Branch/PR | 范围 | 冲突域 | 下一步 |
| ------- | ---- | ----------- | --------- | ---- | ------ | ------ |
| 暂无 | `-` | - | - | - | - | M1-02 / M1-03 已合入；下一步推荐认领 M1-04 Replay API |

## 6. 推荐并行切分

在 `M1` 阶段，允许并行的工作必须尽量写入不同包或不同边界。

推荐并行 lanes：

| Lane                     | 可并行范围                                                  | 不应触碰                 | 备注                                |
| ------------------------ | ----------------------------------------------------------- | ------------------------ | ----------------------------------- |
| M1-A Event Log           | `packages/storage`、event log tests                         | Web UI、大量 schema 重构 | 实现 JSONL append/replay            |
| M1-B Session Index       | `packages/storage` index adapter                            | Core state machine       | 可先用内存/SQLite adapter 设计      |
| M1-C Core Session Engine | `packages/core` state machine                               | Web UI、provider SDK     | 依赖 event schema 小步演进          |
| M1-D Web Timeline        | `apps/web-client` timeline UI                               | Core orchestration       | 只消费 fixture/event API            |
| M1-E Replay Projection   | `packages/core` projection 或 `packages/storage` projection | Provider 和 tools        | 明确 transcript projection contract |

同一时间最多建议：

- 1 个 agent 修改 `packages/schema`。
- 1 个 agent 修改 `packages/core`。
- 1 个 agent 修改 `packages/storage`。
- 1 个 agent 修改 `apps/web-client`。

如果一个 PR 同时修改 `schema + core + storage + web`，它应被视为高冲突 PR，需要拆分或在本文件登记为独占工作。

## 7. M1 工作项状态

| Work ID   | Backlog 项                 | 状态    | 依赖               | 推荐 owner 类型    | 验收摘要                                                  |
| --------- | -------------------------- | ------- | ------------------ | ------------------ | --------------------------------------------------------- |
| M1-01     | Append-Only Event Log      | `DONE`  | M0-03              | storage agent      | merged to main (`e0cf5aa`) — JSONL event log + replay     |
| M1-02     | Session Index              | `DONE`  | M1-01              | storage agent      | merged to main (`aadeb8b`) — SQLite session/turn index + JSONL rebuild |
| M1-03     | Fake Provider Turn         | `DONE`  | M1-01              | core agent         | merged to main (`34501d7`) — SessionEngine + fake streaming provider |
| M1-04     | Replay API                 | `READY` | M1-01, M1-03       | core/storage agent | ACP Streamable HTTP `session/load` 子集；详见 [[adr-0004]] |
| M1-ACP-STDIO | ACP stdio server         | `READY` | M1-01, M1-03       | core agent         | `apps/acp-server`：Zed ACP JSON-RPC over stdio 最小子集；详见 [[adr-0004]] |
| M1-ACP-HTTP | ACP Streamable HTTP daemon | `TODO` | M1-ACP-STDIO      | core agent         | `apps/acp-daemon`：HTTP+SSE 网关 + 项目自有 transport spec |
| M1-WEB-01 | Web Event Timeline         | `READY` | 初始 event fixture | web agent          | Web 可展示 live/replayed event stream（通过 ACP daemon）  |
| M1-QA-01  | Golden Transcript Fixtures | `READY` | M1-01 初版 schema  | qa agent           | normalized replay fixture 稳定                            |

## 8. 未开始队列

以下内容暂不建议开工：

- M2 real model provider。
- M3 shell/patch tools。
- M4 auto-memory 或 compaction。
- M5 skill lazy loading。
- M6/M7 MCP。
- M8 ACP server。
- M10 remote runner、plugin registry、mobile remote-control、scheduled automations。
- Vector memory。
- Self-modifying system prompts / self-evolving agent。

例外条件：

- 只写 design/ADR，不落实现。
- 或者该工作是 M1 的前置 spike，并且不会改变 runtime mainline。
- 或者维护者明确把状态改为 `READY`。

以下内容允许作为文档工作并行推进：

- Handbook 分层技术说明。
- 从零构建教程。
- ADR 草案。
- 模块实现解析。

文档工作不能改变 implementation 状态，除非同时更新本文件的决策记录。

## 9. Agent 开工协议

每个 agent 开工前必须：

1. 阅读 [AGENTS.md](../../AGENTS.md)。
2. 阅读 [主线规则](../../rules/mainline.md)。
3. 阅读本文档。
4. 确认目标 work item 是 `READY`，或已有维护者说明可以开工。
5. 在 PR 描述中写明 `Work ID`。
6. 如果会触碰 `schema`、`core`、`storage`、`permissions`、`apps/web-client` 中两个以上区域，先把它登记为高冲突工作。

每个 agent 提 PR 时必须：

- 更新本文件中对应 work item 状态。
- 在 `当前活跃工作` 中登记或清理自己的 PR。
- 说明是否改变当前阶段判断。
- 补充测试和 Web regression 证据。
- 运行或说明未运行的检查。

## 10. PR 状态更新规则

PR 创建时：

- 对应 work item 从 `READY` 改为 `IN_PROGRESS`。
- 在 `当前活跃工作` 表中添加一行。
- 填写 branch/PR、owner/agent、scope、conflict domain。

PR 进入 review 时：

- 状态改为 `REVIEW`。
- 下一步写成 review/CI/merge。

PR 合并后：

- 对应 work item 改为 `DONE`。
- 从 `当前活跃工作` 表中移除。
- 若解锁后续 work item，把后续项从 `TODO` 改为 `READY`。
- 更新 `当前阶段`，必要时推进 milestone 状态。

PR 关闭或放弃后：

- 对应 work item 恢复 `READY` 或改为 `BLOCKED`。
- 从 `当前活跃工作` 表中移除。
- 写清楚遗留问题。

## 11. 冲突域

常见冲突域：

- `schema-events`：event schema、event fixtures、migration。
- `core-session`：session engine、turn lifecycle、cancellation。
- `storage-log`：JSONL event log、replay。
- `storage-index`：SQLite 或 session index。
- `web-timeline`：Web transcript、timeline、fixture rendering。
- `permissions`：permission policy、risk classification。
- `docs-roadmap`：roadmap/status/governance docs。
- `ci-quality`：CI、lint、typecheck、test config。

同一冲突域已有 `IN_PROGRESS` 或 `REVIEW` 时，新 agent 不应直接开工，除非工作是只读分析或维护者明确允许。

## 12. 当前决策记录

| 日期       | 决策                   | 原因                                                        | 影响                                                       |
| ---------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 2026-05-17 | 中文文档为默认维护入口 | 多 agent 协作需要统一工作语言                               | `docs/zh` 为准，`docs/en` 可滞后                           |
| 2026-05-17 | 当前阶段推进到 M1      | M0 bootstrap 已完成                                         | 新 PR 优先围绕 event log、session、replay、Web timeline    |
| 2026-05-17 | M2+ 暂不实现           | 避免 provider/tool/protocol 过早压垮 core 边界              | 只允许 ADR/spike，不允许主实现                             |
| 2026-05-17 | 重分类 MVP 非目标      | remote/plugin/mobile/schedule 是未来能力，不应被架构排除    | M10 进入 roadmap；vector memory 与 self-evolution 延后研究 |
| 2026-05-17 | 增加技术手册           | docs repo 不只做实现记录，也要帮助开发者从零构建 agent 框架 | `docs/zh/handbook` 成为技术解释和教程入口                  |
| 2026-05-18 | M1-01 合入 main        | PR #1 通过 Round 2 mainline-guardian PASS；merge SHA `e0cf5aa` | M1-02 / M1-03 解锁，可由 storage / core agent 并行认领 |
| 2026-05-18 | M1-03 spec 细化         | handbook agent-core / model-gateway 补齐 Session 类型、cancellation、event 顺序、fake provider 示例 | docs commit `22239a5`；M1-03 开发 agent 可直接 ramp up |
| 2026-05-18 | 架构审计 ADR-0003       | 用户审计提出 5 个澄清点（ACP / context overflow / cwd / wire / SDK 策略）；ADR-0003 落定决策 | handbook 5 处对应同步；M2-01 deliverable 增加 context-overflow preflight；不引入 ai-sdk 作为顶层包 |
| 2026-05-18 | M1-02 合入 main        | PR #2 通过 Round 2 implementation review PASS；merge SHA `aadeb8b` | SQLite session index 完成；M1 storage projection 可用 |
| 2026-05-18 | M1-03 合入 main        | PR #4 通过 Round 3 post-rebase review PASS；merge SHA `34501d7` | M1-04 Replay API 解锁 |
| 2026-05-18 | ADR-0004 ACP 统一 wire | 取消 web / cli / acp 各自一套 wire；ACP 唯一协议 + stdio / Streamable HTTP 双 transport；1 session = 1 acp-server 子进程；TUI 也走 HTTP | ADR-0003 §T1 / §T4 作废；新增 M1-ACP-STDIO / M1-ACP-HTTP work item；M8 改名 "ACP Production Hardening"；M1-04 改为 ACP HTTP session/load 子集 |
| 2026-05-18 | M9 拆 9a / 9b / 9c      | 原 M9 体量过大（sandbox + redaction + packaging + regression 全混在一起）；按风险类型拆为 Security / Production Ops / QA & Regression；observability / config / security baseline 提前到 M1-M3 同步埋点 | 详见 02-roadmap.md M9 节 |
| 2026-05-18 | ADR-0005 docs 站升级    | 选定 Astro Starlight + Cloudflare Pages + Pagefind + Vale；目录分 getting-started / foundations / implementation / reference / governance / advanced / adr 七大类；CI 加 docs-ref-check 守护 handbook ↔ 代码一致性 | 分 4 phase 实施；本轮完成 Phase 1（决策 + 关键新章节） |
| 2026-05-18 | docs Phase 2 + Phase 4 P0 | Phase 2: Astro Starlight 项目脚手架（package.json / astro.config.mjs / src/content.config.ts / docs/zh/index.md splash / docs-build.yaml / docs-link-check.yaml / SITE-SETUP.md）；Phase 4 P0: 重写 3 个弱章节（implementation/tools-and-permissions.md / context.md + memory.md 拆分 / from-zero.md 含 checkpoint 代码） | maintainer 需在 Cloudflare 控制台一次性绑定项目（见 SITE-SETUP.md）；Phase 3 内容物理迁移待 M1 完结 |

## 13. 更新检查清单

改本文件时，检查：

- 当前阶段是否准确。
- Milestone 状态是否与 PR 结果一致。
- 活跃工作表是否有过期项。
- Work ID 是否能追到 backlog 或 roadmap。
- 是否引入了新的冲突域。
- 是否需要同步 [实施 Backlog](07-implementation-backlog.md)。
- 是否需要新增 ADR。
