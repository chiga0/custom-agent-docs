---
title: "ADR 0002: MVP 后能力的架构预留"
---

状态：Accepted

日期：2026-05-17

## 背景

早期架构文档中把以下能力列为 MVP 非目标：

- Cloud execution。
- Plugin marketplace。
- Multi-agent teams。
- Mobile client。
- Background scheduled automations。
- Vector-store memory。
- Self-modifying system prompts。

该表述容易被误读为“长期不考虑”。实际项目方向需要支持未来 remote-control、扩展机制、移动端控制面和定时任务，只是不应在 MVP 阶段实现这些能力。

## 决策

将能力分为三类：

1. MVP 主线能力。
2. MVP 不实现但必须预留的未来能力。
3. 明确延后研究的高不确定能力。

MVP 不实现但必须预留：

- Remote control / remote execution。
- Plugin and extension system。
- Mobile remote-control client。
- Scheduled/background automations。
- Product-level multi-agent orchestration。

明确延后研究：

- Vector-store memory。
- Self-modifying system prompts / self-evolving agent。

## 设计约束

Remote control / remote execution：

- 必须复用 session event stream、permission events、artifact model 和 replay contract。
- 不能引入另一套隐藏任务状态机。

Plugin and extension system：

- Provider、skill、MCP server、tool、client adapter 都必须通过 registry/adapter 扩展。
- 插件不能绕过 schema、permission、memory audit 和 mainline rules。

Mobile remote-control client：

- 移动端只作为 remote-control client。
- 移动端不拥有 agent orchestration。

Scheduled/background automations：

- 定时任务必须复用 session/event/replay。
- 高风险动作仍需权限策略和审计。

Product-level multi-agent：

- 在 core event model、session graph、permission model 稳定前不实现。
- 当前多 Agent 并行开发属于 repo governance，不等于产品 runtime multi-agent。

Vector memory：

- 等 reviewed Markdown memory 被证明不足后再评估。
- 必须先解决隐私、安全、可解释性、回滚和检索质量问题。

Self-modifying system prompts：

- 不允许静默自改系统提示词、权限策略或主线规则。
- 若未来探索，必须采用 proposal/review/apply/rollback 模式。

## 后果

正向影响：

- 避免早期实现过载。
- 又不会把未来 remote-control、插件、移动端、定时任务堵死。
- 多 Agent 开发时，大家能区分“暂不实现”和“架构不考虑”。

负向影响：

- MVP 设计时需要多关注 adapter boundary。
- 一些接口需要提前考虑 remote/session/permission parity。

## 执行约束

- `docs/zh/01-architecture-design.md` 必须使用“架构预留”而不是笼统“非目标”。
- `docs/zh/02-roadmap.md` 必须保留 M10 future capability lane。
- M10 之前不允许实现 remote runner、plugin marketplace、mobile client 或 scheduled automation 主功能。
- 若要提前实现，必须先更新 roadmap status 并新增 ADR。

## 关联

- Roadmap: [M10 Remote, Extensions 与 Automations](../02-roadmap.md#m10remoteextensions-与-automations)
- Status: [Roadmap 状态中心](../03-roadmap-status.md)
