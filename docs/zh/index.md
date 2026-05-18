---
title: Custom Agent
description: 本地优先、事件溯源的 AI coding agent 框架 — 从零实现指南 + 实施治理真值源
template: splash
hero:
  tagline: 本地优先、事件溯源的 AI coding agent 框架 — 从零实现指南 + 实施治理真值源
  actions:
    - text: 5 分钟读懂
      link: /zh/handbook/intro/
      icon: right-arrow
      variant: primary
    - text: 在 GitHub 上查看
      link: https://github.com/chiga0/custom-agent
      icon: external
---

## 这个站点是什么

`custom-agent` 是一个**本地优先（local-first）、事件溯源（event-sourced）** 的 AI coding agent 框架。本站点同时承载两类内容：

- **Agent 技术解析（handbook）**：解释 agent 框架背后的设计原理；面向"想理解 / 想从零实现"的开发者。
- **实施治理（governance）**：项目的 roadmap / status / ADR / quality 等真值源；面向参与开发 / review 的协作者（含 AI agents）。

## 立即开始

| 你是… | 推荐入口 |
|---|---|
| **想 1 小时通览整体** | [5 分钟读懂](/zh/handbook/intro/) → [Turn 生命周期](/zh/handbook/foundations/turn-lifecycle/) → [术语表](/zh/handbook/glossary/) |
| **想自己实现一套** | [Quickstart](/zh/handbook/getting-started/quickstart/) → [从零构建](/zh/handbook/implementation/from-zero/) |
| **想做架构 review** | [ADR 索引](/zh/handbook/reference/adr-index/) → [ADR-0001 核心边界](/zh/adr/0001-core-boundary/) |
| **想看治理 / 流程** | [Roadmap Status](/zh/03-roadmap-status/) → [Implementation Backlog](/zh/07-implementation-backlog/) |

## 三个非协商原则

1. **所有事实都在 event log 里** —— Web、CLI、ACP 客户端都是 event log 的投影；事件先落盘再外发。
2. **所有客户端都是 adapter** —— 统一通过 ACP 协议；不私创 wire 协议。
3. **所有工具必须过 PermissionEngine** —— 没有例外。

详见 [5 分钟读懂](/zh/handbook/intro/)。

## 当前状态

- M0 基础骨架：DONE
- M1 事件溯源 session core：进行中（M1-01 / M1-02 / M1-03 已合并）
- 文档站（本站）：[ADR-0005](/zh/adr/0005-docs-site-architecture/) Phase 1 完成

最新进展看 [Roadmap Status](/zh/03-roadmap-status/)。
