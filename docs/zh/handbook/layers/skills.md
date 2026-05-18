---
title: "Skill 系统"
---

# Skill 系统

> ⚠️ **本章节已被 [`implementation/skills.md`](../implementation/skills.md) 重写并扩充**（Phase 4 P1）。本文件保留为历史快照；新读者请直接读重写版。

## 真实作用

Skill 是可复用工作流。它把某类任务的步骤、约束、工具使用方式、领域知识打包起来，让 agent 在需要时加载。

Skill 不是插件市场，也不是权限后门。

## Skill 解决什么问题

- 降低重复 prompt。
- 把复杂流程模块化。
- 让领域 workflow 可版本化。
- 避免所有知识常驻 context。

## Skill 不解决什么问题

- 不负责执行权限。
- 不负责长期 memory。
- 不负责替代 MCP。
- 不负责修改 core 行为。

## 基本结构

```text
skills/
  mainline-guardian/
    SKILL.md
    scripts/
    assets/
```

`SKILL.md` metadata：

```yaml
---
name: mainline-guardian
description: Review a change against project mainline.
allowed_tools:
  - read_file
  - search_text
---
```

## Lazy Loading

启动时只加载：

- name。
- description。
- trigger。
- allowed_tools。

完整 body 只在命中时加载。

为什么？

- 控制 context size。
- 降低无关 skill 干扰。
- 让 skill 更像工具目录而不是巨大 system prompt。

## 权限模型

Skill 声明 allowed tools，但最终仍要经过 PermissionEngine。

```text
Skill allowed_tools -> ToolRouter eligibility -> PermissionEngine decision
```

Skill 不能直接执行 shell。

## 常见坑

- Skill trigger 太宽泛。
- 所有 skill body 常驻 context。
- Skill 里藏权限策略。
- Skill 修改 memory 但无审计。
- Skill 与 MCP tool 重名。

## 测试策略

- Metadata parser。
- Duplicate skill names。
- Lazy load。
- Allowed tools enforcement。
- Skill invocation event。
- Skill output budget。
