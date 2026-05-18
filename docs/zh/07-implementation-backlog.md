---
title: "实施 Backlog"
---

这份 backlog 把 roadmap 转成 issue/PR 粒度。除非实现非常小，否则每个条目都应该对应一个 PR。

## 每项通用完成标准

- PR 中标明 roadmap id。
- Package ownership 清晰。
- 添加或更新测试。
- 说明 Web regression 影响。
- 不削弱 architecture fitness rule。
- `mainline-guardian` 无 blocking finding。

## M0：项目骨架

### M0-01：创建 Monorepo Skeleton

依赖：无

交付：

- `apps/web-client`。
- `apps/cli`。
- `apps/acp-server`。
- `packages/core`。
- `packages/schema`。
- `packages/storage`。
- `packages/permissions`。

测试：

- Workspace install。
- Empty package typecheck。

验收：

- CI 可以发现所有 packages。
- 没有 package circular dependencies。

### M0-02：添加 Architecture Fitness Test Harness

依赖：M0-01

交付：

- Import boundary test。
- Circular dependency test。
- Forbidden dependency list。

测试：

- Positive fixture。
- `core -> apps/*` negative fixture。

验收：

- Core import client package 时 CI 失败。

### M0-03：添加 Event Schema Foundation

依赖：M0-01

交付：

- Versioned event envelope。
- Initial event union。
- Fixture normalization helper。

测试：

- Schema parse tests。
- Fixture round-trip tests。

验收：

- Fake event log 可以完整从磁盘校验。

### M0-04：添加 Web Shell

依赖：M0-03

交付：

- Session list screen。
- Transcript screen。
- Event timeline screen。
- Fixture event loader。

测试：

- Playwright loads fixture session。
- Screenshot smoke test。

验收：

- Web 可以在没有 backend 的情况下渲染 static fake session。

## M1：Session Core

### M1-01：实现 Append-Only Event Log

依赖：M0-03

交付：

- JSONL writer。
- JSONL reader。
- Event ordering guarantees。
- Corrupt-line recovery policy。

测试：

- Append/replay test。
- Crash-safe partial write test。

验收：

- Replay 返回已 committed 的完全相同 events。

### M1-02：实现 Session Index

依赖：M1-01

交付：

- SQLite session index。
- Turn index。
- Rebuild index from JSONL。

测试：

- Index rebuild test。
- Missing index recovery test。

验收：

- 删除 SQLite 后可以从 JSONL 重建 session list。

### M1-03：实现 Fake Provider Turn

依赖：M1-01

交付：

- `SessionEngine.createSession`。
- `SessionEngine.runTurn`。
- Fake streaming model provider。

测试：

- Turn state machine test。
- Cancellation test。

验收：

- SessionEngine 可以产生可 replay 的 backend fake streaming events；Web 通过真实 SSE 消费 live stream 的验收归入 M1-04 / M1-WEB-01。

### M1-04：实现 Replay API

依赖：M1-01、M1-03、M1-ACP-HTTP

交付：

- Session replay endpoint：作为 ACP Streamable HTTP `session/load` 子集，从 daemon HTTP 端点拉取 session 历史 event。
- Normalized transcript projection。
- 详见 [[adr-0004]]：M1-04 起 wire 直接走 ACP，不引入私有 SSE。

测试：

- Golden transcript test。
- Replay/live equivalence test。

验收：

- Web replay 与 live transcript 一致；两者都通过 ACP daemon HTTP 消费。

### M1-ACP-STDIO：实现 apps/acp-server

依赖：M1-01、M1-03

交付：

- `apps/acp-server` package：单进程 ACP server，按 Zed ACP 规范读 stdin / 写 stdout 处理 JSON-RPC。
- 最小方法集：`initialize`、`session/new`、`session/prompt`、`session/cancel`、`session/update`（通知）。
- mapper：把 `AgentEvent` 翻译为 `session/update` 通知 payload。
- 进程内 1 session 模型；多 session 由 daemon 多 spawn 子进程实现。

测试：

- ACP fixture：握手 / 创建 session / runTurn 流式 update / cancel。
- mapper round-trip 测试：相同 AgentEvent 序列经过 mapper 应产生 deterministic ACP update 序列。

验收：

- Zed editor 直接 spawn `apps/acp-server` 可完成一次 fake turn。
- 详见 [[adr-0004]] §3。

### M1-ACP-HTTP：实现 apps/acp-daemon

依赖：M1-ACP-STDIO

交付：

- `apps/acp-daemon` package：HTTP+SSE 网关，监听本地端口。
- 项目自有 "ACP Streamable HTTP" transport spec 文档（与 Zed ACP 协议分离，仅 transport 扩展）。
- 实现 session id header / 断线重连 cursor / 默认 bearer token auth。
- 收到 `session/new` 即 spawn 一个 `apps/acp-server` 子进程；HTTP 帧透传到子进程 stdio。

测试：

- HTTP 端到端 fixture：HTTP POST `session/prompt` + SSE 收 `session/update`。
- 断线重连：客户端持 sequence cursor，断开重连后续传。
- 多 session 并发：3 个 session 并行无串扰。
- 子进程 crash → daemon 标记 session 失败但不影响其他 session。

验收：

- Web client 可通过本地 daemon 完成一次 fake turn。
- 详见 [[adr-0004]] §3-§5。

## M2：Model Gateway

### M2-01：定义 Model Provider Port

依赖：M1-03

交付：

- Provider interface。
- Normalized stream event types。
- Capability model。

测试：

- Fake provider contract test。

验收：

- Core 只依赖 provider port，不依赖 SDK。

### M2-02：添加第一个真实 Provider

依赖：M2-01

交付：

- 一个 provider adapter。
- Fixture recording format。
- Error normalization。

测试：

- Recorded stream fixture test。
- Network-disabled CI test。

验收：

- 本地可使用真实 provider。
- CI 不需要网络也能测试 provider behavior。

## M3：Tools 与 Permissions

### M3-01：实现 Permission Engine

依赖：M1-03

交付：

- Permission request schema。
- Policy evaluator。
- Ask/allow/deny decisions。

测试：

- Policy matrix tests。
- Permission event emission tests。

验收：

- Tool executor 不能绕过 permission result。

### M3-02：实现 Read/Search Tools

依赖：M3-01

交付：

- `read_file`。
- `list_files`。
- `search_text`。
- Output budget。

测试：

- Path safety tests。
- Gitignore behavior tests。
- Output truncation tests。

验收：

- Read-only tool calls 在 Web event timeline 可见。

### M3-03：实现 Shell Tool

依赖：M3-01

交付：

- Command execution。
- Timeout。
- CWD restriction。
- Environment redaction。

测试：

- Deny dangerous command。
- Timeout。
- Output budget。

验收：

- Risky shell calls 默认需要 approval。

### M3-04：实现 Patch Tool

依赖：M3-01

交付：

- Apply patch。
- Diff capture。
- Dirty worktree warning。

测试：

- Patch success。
- Patch conflict。
- Existing user change preservation。

验收：

- Web diff viewer 展示当前 turn 的 generated changes。

## M4：Context、Instructions 与 Compaction

### M4-01：实现 Instruction Discovery

依赖：M1-03

交付：

- Global instruction file loading。
- Project instruction file loading。
- Directory-scoped instruction loading。
- Configurable fallback file names。

测试：

- Nested instruction order。
- Override behavior。
- Missing file behavior。
- Max bytes behavior。

验收：

- Web context inspector 按顺序展示每个 loaded instruction source。

### M4-02：实现 Context Budget Accounting

依赖：M4-01、M2-01

交付：

- Context part model。
- Token estimation。
- Budget categories。
- Truncation policy。

测试：

- Budget calculation fixtures。
- Deterministic truncation tests。

验收：

- 每次 model request 都记录带 budget details 的 `context.built` event。

### M4-03：实现 Deterministic Compaction

依赖：M4-02

交付：

- Compaction trigger。
- Summary event。
- Replay integration。
- Instruction preservation。

测试：

- Compaction replay test。
- Instruction survival test。
- Golden transcript after compaction。

验收：

- Compacted session 可以继续运行并 replay，且不丢失 active instructions。

### M4-04：实现 Memory Candidate Workflow

依赖：M4-01

交付：

- Memory candidate schema。
- Markdown diff candidate storage。
- Review/apply/discard model。
- Web memory candidate panel。

测试：

- Candidate creation。
- Candidate apply。
- Candidate discard。
- Rollback。

验收：

- Durable memory write 必须先产生可审计 candidate event。

## M5：Skills

### M5-01：实现 Skill Discovery

依赖：M4-02

交付：

- Skill directory scan。
- `SKILL.md` metadata parser。
- Skill registry。
- Startup metadata context。

测试：

- Valid skill metadata。
- Invalid skill metadata。
- Duplicate skill names。

验收：

- Base context 只包含 skill metadata，不包含完整 skill body。

### M5-02：实现 Skill Lazy Loading

依赖：M5-01

交付：

- Skill invocation model。
- Full body load on demand。
- `skill.loaded` event。
- Allowed tool policy。

测试：

- Lazy-load behavior。
- Tool policy enforcement。
- Missing skill behavior。

验收：

- Skill bodies 只在 invocation 时加载，并且不能超出 declared tool policy。

### M5-03：添加 Skill UX 与 Regression

依赖：M5-02

交付：

- `/skill list`。
- `/skill run`。
- Web skill inspector。
- Regression skill fixture。

测试：

- CLI command test。
- Web skill inspector test。
- End-to-end skill scenario。

验收：

- Skill 可以驱动 repeatable workflow，并产生可见 events 和 Web regression evidence。

## M6：MCP Stdio

### M6-01：实现 MCP Server Lifecycle

依赖：M3-01

交付：

- MCP server config schema。
- Stdio process startup。
- Initialize handshake。
- Shutdown。
- Health state。

测试：

- Fake MCP server initialize。
- Startup failure。
- Shutdown cleanup。

验收：

- Web MCP panel 展示 configured servers 和 health。

### M6-02：实现 MCP Tool Discovery 与 Calls

依赖：M6-01

交付：

- `tools/list`。
- `tools/call`。
- Tool namespace。
- Include/exclude config。
- Tool output normalization。

测试：

- Tool list contract。
- Tool call contract。
- Namespace collision。
- Invalid arguments。

验收：

- MCP tools 以 namespaced identifiers 出现在 tool registry 中。

### M6-03：把 MCP 接入 Permissions

依赖：M6-02

交付：

- MCP risk classification。
- Permission event integration。
- Timeout and cancellation。
- Server crash recovery behavior。

测试：

- MCP tool requires approval。
- MCP timeout。
- MCP cancellation。
- MCP crash during call。

验收：

- MCP tool 不能绕过 permission decision。

## M7：MCP Resources、Prompts 与 HTTP

### M7-01：实现 MCP Resources

依赖：M6-01

交付：

- `resources/list`。
- `resources/read`。
- Resource selection model。
- Web resource browser。

测试：

- Resource list contract。
- Resource read contract。
- Explicit inclusion only。

验收：

- MCP resources 只能通过显式用户或 policy action 加入 context。

### M7-02：实现 MCP Prompts

依赖：M6-01

交付：

- `prompts/list`。
- `prompts/get`。
- Prompt argument validation。
- Prompt invocation UX。

测试：

- Prompt list contract。
- Prompt get contract。
- Missing argument behavior。

验收：

- MCP prompts 可以作为 user-invoked commands 暴露。

### M7-03：实现 Streamable HTTP MCP

依赖：M6-02

交付：

- HTTP transport。
- Protocol version header。
- Session id header handling。
- SSE response handling。
- Reconnect behavior。

测试：

- HTTP initialize。
- SSE response stream。
- Session id propagation。
- 404 session restart behavior。

验收：

- Streamable HTTP MCP test server 通过与 stdio 相同的 tool contract suite。

## M8：ACP Server

### M8-01：实现 ACP JSON-RPC Transport

依赖：M1-04

交付：

- JSON-RPC message parser。
- Request/response mapping。
- Error model。
- Initialization method。

测试：

- Valid JSON-RPC request。
- Invalid JSON-RPC request。
- Initialize negotiation。

验收：

- ACP client 可以 initialize 并接收 declared capabilities。

### M8-02：实现 ACP Session Methods

依赖：M8-01、M1-04

交付：

- `session/new`。
- `session/load`。
- `session/prompt`。
- `session/cancel`。
- Session id mapping。

测试：

- New session。
- Load session。
- Prompt session。
- Cancel turn。

验收：

- ACP session behavior 与 core session behavior 一致。

### M8-03：把 Core Events 转成 ACP Updates

依赖：M8-02

交付：

- Event-to-update mapper。
- Permission request forwarding。
- Tool update forwarding。
- Plan/update extension hooks。

测试：

- Streaming update fixture。
- Permission request fixture。
- Tool call fixture。

验收：

- ACP replay 与 Web replay 展示等价 turn semantics。

## M9：Hardening 与 Beta

### M9-01：添加 Sandbox Execution Profiles

依赖：M3-03

交付：

- Sandbox config schema。
- Local sandbox adapter。
- Policy integration。
- Web sandbox visibility。

测试：

- Read-only sandbox。
- Workspace-write sandbox。
- Denied path write。

验收：

- Shell 和 patch behavior 可以被 sandbox policy 约束。

### M9-02：添加 Secret Redaction 与 Audit Export

依赖：M1-01、M3-03

交付：

- Secret pattern redactor。
- Log redaction pipeline。
- Audit export。
- Redaction test fixtures。

测试：

- API-key-like string redaction。
- Redaction before persistence。
- Audit export integrity。

验收：

- Secret-looking values 在 durable logs 前被 redacted。

### M9-03：添加 Release Packaging

依赖：M8-03

交付：

- CLI package。
- Web build package。
- ACP server entrypoint。
- Version metadata。
- Release dry run。

测试：

- Clean install smoke test。
- Version command。
- Packaged Web launch。

验收：

- 干净机器可以安装并运行 beta build。

### M9-04：添加 Beta Regression Suite

依赖：M9-01、M9-02

交付：

- Fixture repo suite。
- Golden event logs。
- Playwright screenshot baselines。
- Replay compatibility suite。

测试：

- Basic coding task。
- Permission denial。
- MCP tool call。
- Skill workflow。
- Compaction/resume。

验收：

- Release candidates 必须通过完整 beta regression suite。

## M10：Remote、Extensions 与 Automations

M10 在 M9 之后启动，当前仅保留规划级 backlog，不建议实现。

### M10-01：Remote Runner Architecture ADR

依赖：M8-03、M9-01

交付：

- Remote runner protocol ADR。
- Remote workspace capability model。
- Artifact sync 与 audit model。
- Remote permission forwarding。

测试：

- Contract fixture design。
- Permission parity design。

验收：

- Remote execution 不改变 core event/replay contract。

### M10-02：Plugin Registry Architecture ADR

依赖：M5-02、M6-02

交付：

- Provider plugin registry design。
- Skill package install/version design。
- MCP server plugin isolation design。
- Plugin permission declaration model。

测试：

- Plugin metadata fixture design。
- Disabled plugin behavior design。

验收：

- 插件系统不能绕过 schema、permission、memory audit 和 mainline rules。

### M10-03：Mobile Remote-Control Design

依赖：M8-03、M10-01

交付：

- Mobile control surface design。
- Permission approval UX。
- Session notification model。
- Job control model。

测试：

- Mobile control event fixture design。

验收：

- 移动端只作为 remote-control client，不拥有 agent orchestration。

### M10-04：Scheduled Automation Architecture ADR

依赖：M1-04、M3-01、M9-02

交付：

- Job trigger model。
- Schedule policy。
- Background permission model。
- Audit and failure replay model。

测试：

- Scheduled job event fixture design。
- Permission denial/retry design。

验收：

- 定时任务复用 session/event/replay，不另建隐藏任务系统。

## Deferred Research：Vector Memory 与 Self-Evolution

这些项目当前不进入 implementation backlog，只允许调研或 ADR 草案。

- Vector-store memory：等 reviewed Markdown memory 证明不足后再评估。
- Self-modifying system prompts：必须先有 proposal/review/apply/rollback 模型和安全 ADR。
