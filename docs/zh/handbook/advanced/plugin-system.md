---
title: "Plugin / Extension System"
---

# Plugin / Extension System

> 拆自 `handbook/layers/future-capabilities.md`。本章讲 **MVP 不做** 的插件系统，但 MVP 架构必须为未来的 plugin marketplace 留出位置而不破坏现有安全 / 边界约束。

---

## 1. Plugin 的范围

"插件"在本项目里意味着 **第三方扩展 5 类对象之一**：

| Plugin 类型 | 它扩展什么 | 已有 MVP 等价物 |
|---|---|---|
| **Provider plugin** | ModelProvider port 的新 adapter | M2-02 实现一个内置 OpenAI/Anthropic adapter |
| **MCP server plugin** | tool / resource / prompt 来源 | M6 内置 MCP client，server 本身就是 plugin |
| **Skill plugin** | 可复用工作流 | M5 skills 已是 plugin 形态（仓库内）；marketplace 是扩展分发渠道 |
| **Local tool plugin** | 新的本地工具 | M3 内置 read/shell/patch；plugin 加新工具如"AWS CLI 增强工具" |
| **Client adapter / UI 扩展** | 新的 client surface / 主题 | M1-M8 内置 Web/CLI/ACP；新增 IDE 扩展 / Slack bot 等 |

MVP 自己不做 plugin marketplace，但每个扩展点的 **port shape** 必须可以被外部第三方实现。

## 2. 为什么要预留

| 不预留的代价 | 预留好处 |
|---|---|
| 第三方想加新 provider → fork core | 提供 ModelProvider port + DIYable adapter |
| 第三方想加新工具 → 用 hacky patch 注入 ToolRouter | 标准 plugin manifest + 注册流程 |
| 多个团队各自 fork 项目 → 永远不能合并 | 一致的 capability + permission 声明 → 兼容性 |
| 安全策略碎片化（第三方 plugin 绕开 PermissionEngine） | plugin manifest 必须显式声明所需 permission，permission 加载时硬约束 |

## 3. Plugin 必须遵守的约束

不论 plugin 何时落地（M10+），下列约束**永远不能破**：

| 约束 | 体现 |
|---|---|
| **不能绕过 PermissionEngine** | plugin 引入的任何 tool 都要经过 PermissionEngine；不能"插件提供的工具默认 allow" |
| **不能绕过 event log** | plugin 触发的任何动作都生成 `AgentEvent`；不允许 plugin "私下" 改 state |
| **不能绕过 schema validation** | provider plugin 输出仍要 normalize 成 `ModelStreamEvent`；不允许穿透自有事件 |
| **不能绕过 memory candidate workflow** | plugin 不能直接写 durable memory；只能产生 candidate |
| **不能绕过 mainline rules** | plugin 不能让 core 依赖 client / provider SDK；架构 fitness test 检查这条 |
| **必须声明 capability** | manifest 声明 `requires: { tools: [...], permissions: [...], context: [...] }`；user 看了这个声明才决定装不装 |
| **必须可禁用** | 任何时候 plugin 可关停；关停后留下的 event 仍可 replay |
| **必须可审计 origin** | plugin 来源 / 签名 / 版本进 event payload `sourcedFrom` 字段 |

## 4. Plugin Manifest（最小形态）

```yaml
---
plugin:
  id: aws-cli-tools
  version: 1.4.0
  author: example.com
  signature: sha256:abc123...    # 可选；marketplace 强制
  sourceUrl: https://example.com/plugins/aws-cli-tools/1.4.0

provides:
  tools:
    - name: aws.s3.list
      riskHint: read
      argsSchema: ...
    - name: aws.s3.copy
      riskHint: write
      argsSchema: ...

requires:
  permissions:
    - network               # 明示要外发请求
  config:
    - awsProfileName
  capabilities:
    - process_spawn         # 要 spawn `aws` CLI

policy:
  defaultDenyOn:
    - tool: aws.s3.copy
      reason: "destructive in some buckets; user should explicitly approve session policy"
---
```

加载流程：

```
user/admin: "安装这个 plugin"
       │
       ▼
PluginManager.parseManifest(manifest)
       │
       ▼
显示 capability / permission diff 给 user → user 审批
       │
       ▼
plugin 注册到对应 registry:
   - tools → ToolRouter
   - provider → ModelGateway
   - skill → SkillRegistry
       │
       ▼
emit `plugin.installed` event
       │
       ▼
session 创建时若启用该 plugin → emit `plugin.activated` event
```

## 5. 安装来源

按可信度从高到低：

| 来源 | 信任度 | 验证 |
|---|---|---|
| 项目内置 plugin（随版本发布） | 完全可信 | 同 code review |
| Official marketplace（项目维护方策展） | 高 | 签名 + 评分 + 审计 |
| Third-party marketplace（社区策展） | 中 | 签名 + community trust |
| 本地路径 / git URL（开发模式） | 低 | 用户自负责；warning UI |

MVP 阶段不存在 marketplace；M10 开始评估。本机加载（git URL / 本地 path）作为 dev 模式可以早期支持。

## 6. Plugin Sandbox（M10 + M9a 联动）

| 风险 | 缓解 |
|---|---|
| plugin 跑恶意代码 | OS 级 sandbox（macOS sandbox profile / Linux seccomp / Windows AppContainer）；MCP server 同样 |
| plugin 读 secret 文件 | 默认拒绝 `~/.aws/credentials` 等敏感路径；显式 allow 才能访问 |
| plugin 网络滥用 | 出站 host allowlist；超频限流 |
| plugin 内嵌 secret | manifest 不允许 secret；user provides via session config |

OS 级 sandbox 是 M9a Security Hardening 的可复用基础；plugin 系统不重新发明轮子。

## 7. Plugin 与 MCP 的边界

很多"插件想做的事"用 MCP server 就能做。**MCP 是 plugin 系统的简化前置**。

| 用 MCP 够用的场景 | 必须 plugin 才行的场景 |
|---|---|
| 外部 API 包装（jira / github / linear） | 提供新的 ModelProvider |
| 新的 read-only 数据源 | 提供新的 client / UI 扩展 |
| 工作流模板（prompts）| 修改 ToolRouter 路由策略 |
| 简单的查询工具 | 提供 OS 级深度集成（macOS sandbox / linux 内核能力） |

**默认推荐**：先尝试用 MCP 解决；MCP 不够再考虑 plugin。

## 8. 不会做的事

| 不会做 | 理由 |
|---|---|
| 让 plugin 修改 ADR / mainline rules | 这些是 governance；plugin 不能改 |
| 让 plugin 直接 patch core 代码 | 破坏 architecture fitness；唯一扩展机制是 manifest 声明的 port |
| 让 plugin 提供 "system prompt 改写" | 与 [[adr-0002]] §"Self-modifying prompts" 冲突；除非走 proposal-review-apply-rollback 流程 |
| 让 plugin 提供 "auto-merge bot" | governance 范围，不在 runtime；后续做 CI bot 而非 runtime plugin |

## 9. 实施路径

| 阶段 | 工作 |
|---|---|
| M0-M9（当前） | 保持所有 port shape（ModelProvider / EventStore / PermissionEngine / SkillRegistry / ToolRouter） 可被外部实现 |
| M10-PLUGIN ADR | 定义 manifest schema / 安装流程 / sandbox / marketplace 策展模型 |
| M10-PLUGIN | 落实 PluginManager + 本地路径 / git URL 加载 |
| 后续 | Marketplace UI / 签名校验 / 安全审计流程 |

## 10. 进一步阅读

- [[adr-0002]] §"Plugin and extension system" — 总预留
- [`mcp.md`](../implementation/mcp.md) — 优先用 MCP 而非 plugin
- [`tools-and-permissions.md`](../implementation/tools-and-permissions.md) — plugin 引入的工具必须经此 gate
- [`remote-execution.md`](remote-execution.md) — plugin 在 remote daemon 上的部署约束
