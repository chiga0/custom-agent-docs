# Custom Agent Docs

This repository is the planning and governance source of truth for [custom-agent](https://github.com/chiga0/custom-agent).

中文文档是默认维护入口。English documents are kept for later synchronization.

## Source Of Truth

- [中文文档入口](docs/zh/README.md)
- [技术手册](docs/zh/handbook/README.md)
- [Roadmap 状态中心](docs/zh/07-roadmap-status.md)
- [仓库关系与协作规则](docs/zh/08-repository-relationship.md)
- [架构设计](docs/zh/01-architecture-design.md)
- [可执行路线图](docs/zh/02-roadmap.md)
- [实施 Backlog](docs/zh/06-implementation-backlog.md)

## Repository Relationship

- `custom-agent-docs`: architecture, roadmap, ADRs, Work IDs, roadmap status, and multi-agent coordination.
- `custom-agent`: implementation, tests, CI, package-level notes, and release artifacts.

Implementation PRs in `custom-agent` must reference a `Work ID` from this repository and the docs commit SHA they are based on.

## Branch Policy

The only long-lived branch is `main`.

Short-lived PR branches are allowed, but `main` is the authoritative state read by implementation agents.
