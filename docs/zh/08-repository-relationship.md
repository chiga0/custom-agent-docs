# 仓库关系与协作规则

最后更新：2026-05-17

## 1. 仓库定位

Custom Agent 使用两个仓库：

| 仓库                | 定位           | 默认分支 | 内容                                                                         |
| ------------------- | -------------- | -------- | ---------------------------------------------------------------------------- |
| `custom-agent-docs` | 事实源与控制塔 | `main`   | 技术方案、架构设计、ADR、roadmap、Work ID、roadmap status、多 Agent 协作规则 |
| `custom-agent`      | 实现仓库       | `main`   | 代码、测试、CI、package README、实现细节、release artifacts                  |

## 2. 事实来源

以下内容以 `custom-agent-docs` 为准：

- 当前主线。
- 当前 milestone。
- Work ID 与状态。
- Roadmap sequencing。
- ADR。
- 多 Agent 并行范围。
- 冲突域。
- 架构边界。

实现仓库 `custom-agent` 只保留最小本地规则和指针，避免 roadmap 在两个地方漂移。

## 3. 本地目录约定

推荐本地目录：

```text
/Users/gawain/Documents/codebase/github/
  custom-agent/
  custom-agent-docs/
```

实现 agent 在 `custom-agent` 开工前，应读取：

- `../custom-agent-docs/docs/zh/07-roadmap-status.md`
- `../custom-agent-docs/docs/zh/02-roadmap.md`
- `../custom-agent-docs/docs/zh/06-implementation-backlog.md`
- `../custom-agent-docs/rules/mainline.md`

## 4. 分支策略

`custom-agent-docs` 只有一个长期分支：`main`。

允许短期 PR 分支，但所有 agent 默认只读取 `main` 上的事实状态。没有合并到 `main` 的规划不能当作事实依据。

`custom-agent` 也以 `main` 为主集成分支，功能开发通过短期分支和 PR 合入。

## 5. PR 顺序

如果实现工作会改变 roadmap/status/ADR：

1. 先在 `custom-agent-docs` 提 docs PR。
2. docs PR 合并后，记录 docs commit SHA。
3. 再在 `custom-agent` 提 implementation PR。
4. implementation PR 引用 Work ID 和 docs commit SHA。
5. implementation PR 合并后，如状态需要变为 `DONE`，再回到 `custom-agent-docs` 更新状态。

如果实现工作不改变 roadmap/status/ADR：

- 可以直接提 `custom-agent` PR。
- 但 PR 仍必须引用 `custom-agent-docs` 中已有 Work ID。

## 6. Implementation PR 必填信息

`custom-agent` PR 必须包含：

- Work ID。
- 对应 docs commit SHA。
- 读取的 roadmap status 文件路径。
- 是否需要更新 `custom-agent-docs`。
- 影响的冲突域。
- 测试与 Web regression 证据。

## 7. Docs PR 必填信息

`custom-agent-docs` PR 必须包含：

- 变更的事实源区域。
- 是否阻塞或解锁 implementation work。
- 是否新增、关闭或改变 Work ID。
- 是否需要同步 implementation repo。
- 是否需要新增 ADR。

## 8. 防漂移规则

- Roadmap/status 不在 `custom-agent` 中维护副本。
- `custom-agent` 的 `AGENTS.md` 只保留本地实现约束，并指向 docs repo。
- Work ID 只能在 `custom-agent-docs` 中定义。
- Implementation PR 不能自己发明 Work ID。
- 如果 docs repo 与 code repo 信息冲突，以 docs repo `main` 为准。

## 9. Agent 开工最小流程

每个实现 agent 在 `custom-agent` 开工前：

1. 拉取 `custom-agent-docs/main`。
2. 阅读 `docs/zh/07-roadmap-status.md`。
3. 确认目标 Work ID 是 `READY` 或已被明确分配。
4. 检查冲突域是否已有 `IN_PROGRESS` 或 `REVIEW`。
5. 在 implementation PR 中填写 Work ID 和 docs commit SHA。

每个文档 agent 在 `custom-agent-docs` 开工前：

1. 确认是否修改事实源。
2. 如果修改 Work ID 或 milestone 状态，说明对 implementation repo 的影响。
3. 如果解锁实现工作，明确写出哪些 Work ID 变为 `READY`。
