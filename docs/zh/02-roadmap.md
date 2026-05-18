---
title: "可执行路线图"
---

# 可执行路线图

路线图以“可测试增量”为单位推进。每个 milestone 结束时都必须有可运行 Web 回归面，而不是只交付 library code。

当前执行状态、Work ID、活跃 PR 和并行冲突域以 [Roadmap 状态中心](03-roadmap-status.md) 为准。

## M0：项目骨架与治理

目标周期：1 周

目标：建立 repo skeleton、规则、CI baseline 和 architecture fitness checks，先把项目骨架立住。

任务：

- 创建 monorepo structure。
- 添加 `AGENTS.md`、`rules/mainline.md` 和 `mainline-guardian` skill。
- 添加 package boundary 和 import rules。
- 添加 schema package 和初始 event types。
- 添加 CI workflow skeleton。
- 添加 PR template。
- 添加 ADR template。
- 添加 Web app shell 和空 session list。

验收：

- CI 运行 lint、typecheck、unit tests、architecture checks。
- Fake session fixture 可以在 Web 渲染。
- 跨边界 import violation 会让 CI 失败。
- 每个 PR 必须引用 roadmap item。

## M1：Event-Sourced Session Core

目标周期：2 周

目标：构建不带 tools 的最小 session engine。

任务：

- 实现 append-only JSONL event log。
- 实现 SQLite session/turn index。
- 实现 `SessionEngine.createSession`。
- 实现使用 fake model provider 的 `SessionEngine.runTurn`。
- 实现 cancellation。
- 实现 session replay。
- 建立 Web event timeline 和 transcript viewer。

验收：

- User message 可以产生 deterministic fake assistant response。
- Session replay 能重建完全一致 transcript。
- Web 可以显示 live 和 replayed events。
- Golden transcript tests 通过。

## M2：Model Gateway

目标周期：2 周

目标：接入一个真实 model provider，并隐藏在 normalized stream interface 后面。

任务：

- 定义 `ModelProvider` interface。
- 先实现一个 provider，优先 OpenAI Responses 或 OpenAI-compatible。
- 规范化 text delta、tool call request、usage 和 errors。
- 添加 recorded response fixture tests。
- 添加 token 和 cost accounting fields。
- 添加 Web model request inspector。

验收：

- 一个真实模型可以在 session 中回答。
- Core 不使用 provider-specific raw payload。
- Fixture tests 不需要网络。
- Web 展示 model latency、usage 和 normalized stream events。

## M3：Local Tools 与 Permission Engine

目标周期：2 周

目标：让 agent 具备安全的本地 coding 能力。

任务：

- 实现 `PermissionEngine`。
- 实现 local tools：
  - `read_file`
  - `list_files`
  - `search_text`
  - `shell`
  - `apply_patch`
  - `git_diff`
- 添加 command risk classifier。
- 添加 output budget 和 truncation。
- 添加 Web approval UI。
- 添加 Web diff viewer。

验收：

- 每个 tool call 都有 permission event。
- Read-only tools 可被 policy 自动 approve。
- Shell 和 patch 默认需要 approval。
- Tool output 有边界，并在 Web 可见。
- Regression scenario 可以修改 fixture repo 并显示 diff。

## M4：Context Builder、Instructions 与 Compaction

目标周期：2 周

目标：让 session 能感知项目规则，同时避免上下文无限膨胀。

任务：

- 实现 instruction discovery：
  - global file
  - project root file
  - directory-scoped file
- 默认支持 `AGENTS.md`。
- 支持 configurable fallback names。
- 添加 context budget accounting。
- 添加 deterministic compaction。
- 添加 Web context inspector。

验收：

- Nested instructions 按文档顺序加载。
- Model call 前可见 context budget。
- Compaction 产生可 replay 的 `session.compacted` event。
- Instructions 在 compaction 后仍保留。

## M5：Skills

目标周期：2 周

目标：把可复用 workflow 打包为 skills，但不让它们污染每次 prompt。

任务：

- 实现 skill discovery。
- 解析 skill metadata。
- 启动时只加载 metadata。
- Invocation 时 lazy-load 完整 `SKILL.md`。
- 添加 `allowed_tools` enforcement。
- 添加 `/skill list` 和 `/skill run`。
- 添加 Web skill inspector。

验收：

- Skills 不能使用声明之外的 tools。
- Skill load events 出现在 transcript。
- Regression skill 可以跑一个文档化 workflow。
- 新增 skill 只增加 metadata 上下文，不加载完整 body。

## M6：MCP Stdio

目标周期：2 周

目标：通过 MCP 接入外部工具，同时不绕过权限。

任务：

- 实现 MCP stdio transport。
- 实现 server lifecycle。
- 实现 `initialize`。
- 实现 `tools/list` 和 `tools/call`。
- 实现 tool namespacing。
- 实现 include/exclude tool config。
- 添加 timeout、cancellation 和 health state。
- 添加 Web MCP server panel。

验收：

- 本地 MCP server 可以暴露 tool。
- MCP tool calls 经过 `PermissionEngine`。
- Tool name conflicts 通过 namespace 解决。
- Server crash 可见且可恢复。
- Fake MCP server contract tests 通过。

## M7：MCP Resources 与 Prompts

目标周期：1-2 周

目标：支持 MCP context 和 reusable prompt templates。

任务：

- 实现 `resources/list`。
- 实现 `resources/read`。
- 实现 `prompts/list`。
- 实现 `prompts/get`。
- 添加 resource selection model。
- 添加 prompt invocation model。
- 添加 Web resource/prompt browser。

验收：

- Resource content 只能显式加入 context。
- Prompt templates 可以由用户命令调用。
- MCP resources 不会自动倾倒进 model context。

## M8：ACP Production Hardening

> 2026-05-18 [[adr-0004]] 修订：M8 不再是"第一次实装 ACP"。最小 ACP 实装已被前移到 M1 末尾（**M1-ACP-STDIO / M1-ACP-HTTP**），因为 ADR-0004 把 ACP 设为唯一对外 wire 协议，所有 client（含 Web）从 M1-04 起都依赖它。M8 改为针对生产部署的 hardening。

目标周期：2 周

目标：把 M1 阶段落地的 ACP server / daemon 推到 production-ready。

任务：

- ACP authentication（默认 localhost-only + bearer token，可选 mTLS）。
- ACP rate limiting + backpressure。
- daemon 进程监控（health check、子进程崩溃重启、僵尸进程清理）。
- 远程化场景的 TLS termination。
- ACP fixture suite 扩充（涵盖 error taxonomy / load 已 compaction session / 并发 session）。
- 与 Zed 实际集成的兼容性测试（捕获 Zed ACP 上游变更）。

验收：

- 单机 50+ 并发 session 不卡 / 不漏。
- ACP error event 类型完整且被测试。
- Zed editor 能直接挂 `apps/acp-server` 跑标准用例。
- daemon 自动重启崩溃的 acp-server 子进程，session 视图能 replay 还原。

## M9：Hardening 与 Beta（已拆分为 M9a / M9b / M9c）

> 2026-05-18 audit 修订：原 M9 单 milestone 体量过大（sandbox + redaction + packaging + regression 全混在一起），按风险类型拆为三个并行 milestone。

### M9a：Security Hardening

目标周期：2 周

目标：完成 production deploy 前必须的安全防御。

任务：

- 添加 sandbox profile support（read-only / workspace-write / denied paths）。
- 添加 secret pattern redaction（API key / token / 私钥）。
- 添加 prompt injection 防御策略（model output / MCP resource / tool output 都要 sanitize）。
- 写正式 threat model 文档（攻击面 / 信任域 / 缓解措施）。
- 第三方 / 自审 security review（pen-test 风格 audit）。

验收：

- 已知 dangerous shell（`rm -rf /`、`git push --force` 等）默认 deny。
- API-key-like 字符串在落 event log 之前被 redact。
- prompt injection 测试 fixture 覆盖 ≥ 5 类常见攻击（tool output 内带 `IGNORE PREVIOUS` 等）。
- threat model 公开发布在 `handbook/foundations/threat-model.md`。

### M9b：Production Ops

目标周期：2 周

目标：让 binary 能"在干净机器装上、跑起来、出问题能查"。

任务：

- 添加 release packaging（CLI binary / Web bundle / acp-server / acp-daemon entrypoints / 版本元数据）。
- 添加 provider retry / backoff / rate-limit awareness。
- 添加 failure taxonomy（哪些错误重试、哪些直接 stopReason=error）。
- 添加结构化日志 + 可选 telemetry export（默认本地，opt-in remote）。
- 添加 config & secrets 管理 path（OS keychain / `.env` / env var 优先级；多 provider 切换）。
- 自动更新 / crash report 机制（opt-in）。

验收：

- `npm run release:dry` 可以产出可分发 artifact。
- 干净机器从 zero 安装到首次 turn ≤ 5 min。
- failure taxonomy 写成代码 + 文档；error event 中含 `errorCode` 字段。
- 默认 telemetry off；on 时 schema 已落档。

### M9c：QA & Regression

目标周期：2 周

目标：build 一个能护住 release 质量的 regression harness。

任务：

- 添加 golden transcript fixture suite（典型 coding task / 取消 / 失败 / MCP 调用 / compaction）。
- 添加 Playwright Web E2E baseline（screenshot diff、approval flow）。
- 添加 replay/live equivalence test 自动化。
- 添加 fuzz testing（event schema、permission policy、tool args）。
- 自定义 reference checker：handbook 引用的 function / class 在代码中仍存在。
- benchmark scenarios（大 repo / 长 transcript / 多 turn）。

验收：

- regression suite 跑通后才能 release。
- handbook ↔ 代码 drift 在 CI 报警。
- 大 repo fixture 不会意外超出 context budget。
- 取消 / 失败 / MCP fixture 都有 golden assert。

---

### 跨切关注点（M1-M3 同步埋点，不放到 M9）

audit 把以下三类"基础设施"提前到 M1-M3 阶段做最小骨架，避免 M9 才补：

- **Observability scaffold（M1 期内）**：结构化日志接口 + event log 已经天然是 audit trail，但需明确"哪些动作写日志、哪些不写"。M1-04 时把 SSE / ACP HTTP 的请求日志 schema 定下来。
- **Config & Secrets baseline（M2 落 provider 时）**：API key 读写路径必须先定，否则 M9b 才补会撕大量代码。M2-01 PR 必须包含最简 config loader（env / `.env` / 默认值）和 redaction 函数 stub。
- **Security baseline check（M3 落工具时）**：M3-03 shell tool 必须出 denylist + sandbox profile 接口（即便 sandbox 实装在 M9a）。M3-01 PermissionEngine 设计时就考虑 audit export 的字段。

## M10：Remote、Extensions 与 Automations

目标周期：M9 之后单独评估。

目标：在 core/event/permission/replay 稳定后，扩展 remote-control、插件化和后台自动化能力。

任务：

- Remote control / remote execution：
  - 设计 remote runner protocol。
  - 抽象 workspace capability、artifact sync、remote command policy。
  - 让 Web/mobile/CLI 都通过同一 session event API 控制远端任务。
- Plugin and extension system：
  - 设计 provider plugin registry。
  - 设计 custom skill package 安装与版本策略。
  - 设计 MCP server/plugin 配置隔离。
  - 建立插件权限声明、审计和禁用机制。
- Mobile and remote-control client：
  - 设计 lightweight mobile control surface。
  - 只提供 session list、transcript、permission approval、notification 和 job control。
  - 不在移动端实现 agent orchestration。
- Scheduled/background automations：
  - 设计 job trigger model。
  - 设计 schedule policy、permission review、audit log 和 failure handling。
  - 后台任务必须复用 session/event/replay，而不是另起一套任务系统。
- Product-level multi-agent exploration：
  - 研究 session graph、task delegation、agent role、conflict resolution。
  - 不允许在 core 稳定前引入多 agent runtime。

验收：

- Remote execution 与 local execution 在 event/replay 层语义一致。
- 插件不能绕过 schema、permission、memory audit 和 mainline rules。
- Mobile/remote-control client 不拥有 agent core 逻辑。
- Scheduled automations 具备审计、权限和失败复盘能力。

## Deferred Research：Memory 与 Self-Evolution

目标周期：M10 后再评估。

研究项：

- Vector-store memory：
  - 评估检索质量、隐私边界、安全风险、可解释性和回滚策略。
  - 在 Markdown/reviewed memory 不够用前不进入主线实现。
- Self-modifying system prompts / self-evolving agent：
  - 只允许 proposal/review/apply/rollback 模式。
  - 不允许 agent 静默修改系统提示词、权限策略或主线规则。
  - 必须先通过 ADR 和安全 review。

## Roadmap 完成规则

任何 milestone 不能只靠代码完成，必须同时满足：

- 有 Web regression scenario。
- Unit tests 覆盖 core behavior。
- Contract tests 覆盖 external protocol behavior。
- 文档已更新。
- `mainline-guardian` 无 blocking findings。
