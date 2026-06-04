---
title: "Roadmap 状态中心"
---

最后更新：2026-05-29（M2、M3 全部 DONE，准备 M4）

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

当前阶段：`M4: Context, Instructions and Compaction` — M0–M3 全部 DONE，进入 M4。

阶段状态：`READY`

说明：

- `M0: Project Spine and Governance` 已完成。
- `M1: Event-Sourced Session Core` 已完成。
- `M2: Model Gateway` 已完成：Provider Port + RecordedProvider + AnthropicProvider 真实适配器 + usage 回传链路。
- `M3: Local Tools and Permission Engine` 已完成：PermissionEngine + ToolRouter + read_file/list_files/search_text/shell/git_diff/apply_patch + gitignore 解析 + 模型 tool-use loop + Web tool cards/diff viewer。
- 下一阶段是 `M4: Context, Instructions and Compaction`。

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
| M1 Event-Sourced Session Core           | `DONE`     | 全部 work item 合入 main；进入 review/refactor/handbook 收尾 | [Roadmap](02-roadmap.md#m1event-sourced-session-core)                |
| M2 Model Gateway                        | `DONE`     | AnthropicProvider 适配 + usage 回传 + RecordedProvider | [Roadmap](02-roadmap.md#m2model-gateway)                             |
| M3 Local Tools and Permission Engine    | `DONE`     | PermissionEngine + 6 tools + tool-use loop + Web UI | [Roadmap](02-roadmap.md#m3local-tools-与-permission-engine)          |
| M4 Context, Instructions and Compaction | `READY`    | M1-M3 基础能力已成型，可开工                     | [Roadmap](02-roadmap.md#m4context-builderinstructions-与-compaction) |
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
| （当前无活跃工作） | `N/A` | `N/A` | `N/A` | 活跃工作表已清空 | 无 | 等待下一项 Work ID 登记 |

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

## 7. M1 / M2 / M3 工作项状态

M1 全部 DONE（详见 §4 milestone 总览）：

| Work ID   | Backlog 项                 | 状态    | 依赖               | 推荐 owner 类型    | 验收摘要                                                  |
| --------- | -------------------------- | ------- | ------------------ | ------------------ | --------------------------------------------------------- |
| M1-01     | Append-Only Event Log      | `DONE`  | M0-03              | storage agent      | merged to main (`e0cf5aa`) — JSONL event log + replay     |
| M1-02     | Session Index              | `DONE`  | M1-01              | storage agent      | merged to main (`aadeb8b`) — SQLite session/turn index + JSONL rebuild |
| M1-03     | Fake Provider Turn         | `DONE`  | M1-01              | core agent         | merged to main (`34501d7`) — SessionEngine + fake streaming provider |
| M1-04     | Replay API                 | `DONE`  | M1-01, M1-03, M1-ACP-HTTP | core/storage agent | merged to main (`ac22643`) — ACP `session/load` over Streamable HTTP：acp-server loadSession + 共享 event log root + acp-daemon 路由 + live≡replay 等价 smoke |
| M1-ACP-STDIO | ACP stdio server         | `DONE` | M1-01, M1-03       | core agent         | merged to main (`d005879`) — official Zed ACP SDK stdio server + schema subpath + 69 tests |
| M1-ACP-HTTP | ACP Streamable HTTP daemon | `DONE`  | M1-ACP-STDIO      | core agent         | merged to main (`2c3414f`) — apps/acp-daemon HTTP+SSE 网关 + 项目自有 transport spec + 1:1 子进程 + bearer auth + session GC + header/body sessionId 一致性 |
| M1-WEB-01 | Web Event Timeline         | `DONE`  | M1-ACP-HTTP, M1-04 | web agent          | merged to main (`7f39c9f`) — Web client 通过 ACP daemon HTTP 渲染 live/replay；29 个新测试覆盖 transcript reducer、SSE 解析、wire shape、XSS 转义 |
| M1-QA-01  | Golden Transcript Fixtures | `DONE`  | M1-01 初版 schema  | qa agent           | merged to main (`5cddb0c`) — packages/qa-fixtures（normalized projection + golden fixture + live/replay/fixture 三层等价断言） |

M2 工作项：

| Work ID | Backlog 项 | 状态 | 依赖 | 推荐 owner 类型 | 验收摘要 |
| ------- | ---------- | ---- | ---- | --------------- | -------- |
| M2-01 | Define Model Provider Port | `DONE` | M1-03 | core agent | merged to main (`d314c65`) — `preflightCheck` + `PreflightResult` + SessionEngine 把超限映射成 `turn.completed { stopReason: "error", errorCode: "context_overflow" }` + schema `TurnErrorCode` + fake provider contract test（21 files / 187 tests） |
| M2-02a | Model Gateway scaffold + RecordedProvider | `DONE` | M2-01 | core/provider agent | merged to main (`c34a986`) — 新 `packages/model-gateway/` + RecordedProvider + ProviderError taxonomy（co-located 在 core ports）+ SessionEngine 接 toTurnErrorCode；24 files / 205 tests |
| M2-02b | First Real Provider Adapter | `DONE` | M2-02a | core/provider agent | merged to main (`73b070b`) — AnthropicProvider adapter + Messages API streaming + usage 回传 + ProviderError 翻译 |

M3 工作项：

| Work ID | Backlog 项 | 状态 | 依赖 | 推荐 owner 类型 | 验收摘要 |
| ------- | ---------- | ---- | ---- | --------------- | -------- |
| M3-01 | Permission Engine | `DONE` | M1-03 | core/permissions agent | merged to main (`6288cd7`) — PermissionEngine + DEFAULT_POLICY + ApprovalSource + EventSink + 2 个 schema 事件类型；24 files / 222 tests |
| M3-02 | Read/Search Tools (a) | `DONE` | M3-01 | core agent | merged to main (`c7aa2fe`) — 新 `packages/tools/` + Tool port + ToolRouter + 3 个工具 + 4 类 `tool.*` 事件 + path safety + 64 KiB 输出预算 + 顺序保留 delta chain；30 files / 268 tests |
| M3-02b | Tools wire into SessionEngine | `DONE` | M3-02 + M2-02b | core agent | merged to main (PR #15 `65a2e69` + PR #17 `618aa27`) — tool-use loop in SessionEngine + ToolCallHandler port + gitignore 解析 + Web tool cards/diff viewer + usage accounting |
| M3-03 | Shell Tool | `DONE` | M3-01 | core agent | merged to main (PR #15 `65a2e69`) — shell executor + denylist risk classifier + timeout/abort + PermissionEngine 守护 |

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
| 2026-05-18 | docs Phase 4 P1 完成 | 重写 A2 audit 2/5 评分的剩余 5 个章节：implementation/skills.md（lazy-loading 问题方案对比图 + allowed_tools 与 PermissionEngine 协作 + 事件链） / implementation/mcp.md（server 生命周期 + tool/resource/prompt 三类对比 + 完整事件链） / advanced/remote-execution.md（mobile 定位 + auth scope 分级） / advanced/plugin-system.md（manifest schema + 与 MCP 边界）/ advanced/automation.md（trigger 模型 + 自动化权限 timeout）；旧 layers/{skills,mcp,future-capabilities}.md 加 stale notice 指向重写版。本地 build 验证 99 pages（+10）/ 15487 词（+2211）/ 1.86s | Phase 4 P2 剩 4 章（core-layer / model-gateway / storage-and-replay / client-adapters）；Phase 3 仍待 M1 完结 |
| 2026-05-18 | M1-ACP-STDIO 合入 main | PR #5 通过 Codex Round 3 mainline-guardian PASS；merge SHA `d005879` | ACP stdio canonical wire 完成；M1-ACP-HTTP 可 rebase main 并推进 ready review |
| 2026-05-19 | M1-ACP-HTTP rebase 完成 + promote ready | PR #6 rebase 到 main（单 commit `b5bc812` 在 `d005879` 之上），本地 quality gate 全绿（15 files / 116 tests），base 已切到 main | M1-ACP-HTTP 进入 REVIEW；等 cross-reviewer Round 2 PASS → admin merge |
| 2026-05-19 | M1-ACP-HTTP / M1-QA-01 self-review 双轮 + admin merge | 维护者 explicit 授权，跳过 cross-reviewer：(a) Round 1 self-review 发到 thread（P1 + P2 + P3）；(b) 在 branch 上落地全部 P1 + 主要 P2 + 关键 P3 patch；(c) Round 2 self-review PASS；(d) `gh pr merge --admin` 依次合入 | PR #6 → main (`2c3414f`)，PR #7 → main (`5cddb0c`)；M1 实质完成 ACP 双 transport + golden 回归基础设施。M1 剩余主项：M1-04 Replay API、M1-WEB-01 Web Event Timeline |
| 2026-05-20 | M1-04 self-review 双轮 + admin merge | 同维护者授权流程：claim → 实现（acp-server loadSession + 共享 event log root + acp-daemon session/load 路由 + SPEC.md §4/§6.2 + 12 个测试包括 live≡replay smoke）→ Round 1 self-review（0 P1 + 4 P2 + 3 P3）→ patch（eager-GC、stderr observability、registerSession helper、additionalDirectories void、import cleanup）→ Round 2 PASS → admin merge | PR #8 → main (`ac22643`)；M1 剩余主项仅 M1-WEB-01；M1 wire 层全部完成 |
| 2026-05-20 | M1-WEB-01 self-review 双轮 + admin merge → M1 milestone DONE | 同流程：claim → 实现（apps/web-client 引入 transcript reducer + SSE 解析 + daemon-client + DOM glue + 29 个测试）→ Round 1 self-review（0 P1 + 5 P2 + 3 P3）→ patch（fitness edge web-client→core/storage、daemon-client beforeEach hoist、End-session 按钮）→ Round 2 PASS → admin merge。M1 全部 work item 进入 DONE | PR #9 → main (`7f39c9f`)；M1 milestone 翻 DONE；M2 Model Gateway 翻 READY；下一阶段先做 review/refactor/handbook 收尾再启动 M2 |
| 2026-05-20 | M1 closeout：cross-cutting audit + refactor + handbook 同步 | Explore agent 在 main 上扫描 7 个 M1 PR，输出 P1×3 + P2×9 + P3×3 审计报告。PR #10 落地 P1：daemon initialize 之前 `loadSession: false` 与 child `true` drift；session id 加 `[A-Za-z0-9][A-Za-z0-9_-]{0,127}` 格式校验（防 path traversal / header injection）；其余 P2/P3 通过 SPEC.md §5/§6.2/§7 文档化 + `requestChildOrCleanup` helper 去重。docs handbook `layers/client-protocol-adapters.md` 整段重写，`layers/session-event-replay.md` 增补 M1 落地映射 | PR #10 → main (`dff3eea`)；docs main (`27357a2`)；M1 milestone 完成「实现 + review + refactor + handbook」全链路；下一阶段开 M2 Model Gateway |
| 2026-05-20 | M2-01 Model Provider Port self-review 双轮 + admin merge | 同流程：claim → 实现（schema TurnErrorCode + ModelProvider.preflightCheck + FakeStreamingProvider 实现 + SessionEngine preflight 失败映射 turn.completed errorCode + 11 个新测试）→ Round 1 self-review（0 P1 + 3 P2 + 3 P3）→ patch（schema additive evolution guards + handbook 记 wire-surface 限制 disposition 给 M2-02）→ Round 2 PASS → admin merge | PR #11 → main (`d314c65`)；handbook docs main (`3627c4a`)；M2-01 DONE，M2-02 READY 待选 errorCode 上 wire 方案 |
| 2026-05-20 | M2-02 拆 a/b + M2-02a self-review 双轮 + admin merge | 原 M2-02 "first real provider" 拆为 M2-02a（架构 scaffold + RecordedProvider，离线 CI）+ M2-02b（真 SDK adapter，留给后续 PR）。M2-02a：新 `packages/model-gateway/`、ProviderError 5 类层级、`toTurnErrorCode`、RecordedProvider with `failBefore/failWith` 注入；Round 1 P2 #1 触发 ProviderError 从 model-gateway 迁回 `packages/core/src/ports/`，SessionEngine catch 路径直接 instanceof + toTurnErrorCode（rate_limit → provider_failure，context_overflow → context_overflow）；handbook 更新 | PR #12 → main (`c34a986`)；handbook docs main (`def0a46`)；M2-02a DONE，M2-02b READY 待选真 SDK + wire 方案 |
| 2026-05-20 | M3-01 PermissionEngine self-review 双轮 + admin merge | 同流程：claim → 实现（schema 加 ToolPermission{Requested,Resolved}Event + ToolRisk/PermissionDecision/Outcome 类型 + PermissionEngine class with byTool > byRisk > defaultDecision policy + Promise-return-shape 防 bypass + ApprovalSource/EventSink 注入 ports + 16 个新测试）→ Round 1 self-review（0 P1 + 4 P2 + 3 P3）→ patch（PermissionEventInput 改用 Pick<schema event> 派生 + argsPreview 512 字符截断防 audit DoS + handbook 记 SessionEngine wiring 约定）→ Round 2 PASS → admin merge | PR #13 → main (`6288cd7`)；handbook docs main (`8eecd83`)；M3-01 DONE，M3-02 Read/Search Tools READY（需要构建 ToolRouter 走 PermissionEngine）|
| 2026-05-20 | M3-02 拆 + 主 PR self-review 双轮 + admin merge | M3-02 拆分：本 PR 落 tools + ToolRouter + 3 read-only 工具 + 4 类 tool.* 事件；M3-02b 延后接 SessionEngine 模型循环 + gitignore。**主 PR**：schema 加 ToolStarted/Delta/Completed/Failed + ToolErrorCode 联合；新 `packages/tools/` 含 Tool port、ToolRouter（PermissionEngine gate + 4 lifecycle 事件 + UTF-8-safe 64 KiB BudgetAccumulator + resolveInsideCwd 含 sibling-prefix 攻击防御）、read_file/list_files/search_text；架构 fitness 加 5 条 forbidden edges（tools 是 leaf）；45 个新测试。Round 1 self-review（0 P1 + 4 P2 + 4 P3）→ patch（最关键：delta emit 改成顺序保留 promise chain + drain-before-terminal，防 fire-and-forget 导致 completed 跑赢 delta；handbook ToolRisk drift 修正）→ Round 2 PASS → admin merge | PR #14 → main (`c7aa2fe`)；handbook docs main (`a8955f1`)；M3-02 DONE，M3-02b 等 M2-02b 真 provider 落地后启动模型循环工作 |

## 13. 更新检查清单

改本文件时，检查：

- 当前阶段是否准确。
- Milestone 状态是否与 PR 结果一致。
- 活跃工作表是否有过期项。
- Work ID 是否能追到 backlog 或 roadmap。
- 是否引入了新的冲突域。
- 是否需要同步 [实施 Backlog](07-implementation-backlog.md)。
- 是否需要新增 ADR。
