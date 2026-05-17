# Docs Pull Request

## Source Of Truth Area

-

## Roadmap Status Impact

- Work ID：
- 状态变更：
- 是否阻塞 implementation：
- 是否解锁 implementation：
- 是否需要同步 `custom-agent`：

## Summary

-

## Packages Changed

-

## Boundary Impact

- [ ] 没有 core/client boundary change。
- [ ] 没有 provider payload 泄漏进 core。
- [ ] 没有 MCP transport 泄漏进 core。
- [ ] 没有 client 直接写 session storage。

## Permission Impact

- [ ] 没有 tool execution behavior change。
- [ ] Tool execution 仍经过 `PermissionEngine`。
- [ ] 需要时已添加 permission tests。

## Memory / Context Impact

- [ ] 没有 memory behavior change。
- [ ] Memory changes 可审计、可回滚。
- [ ] Context budget behavior 变更已测试。

## Event / Replay Impact

- [ ] 没有 event schema change。
- [ ] Event schema fixtures 已更新。
- [ ] Replay tests 已更新。

## Tests

-

## Web Regression

-

## Mainline Guardian

Result:

Blocking findings:

## Rollback Plan

-
