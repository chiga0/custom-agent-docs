# Docs Repository Instructions

## Mission

Maintain the planning, architecture, roadmap, ADR, Work ID, and multi-agent coordination source of truth for Custom Agent.

The implementation repository is `custom-agent`: https://github.com/chiga0/custom-agent

## Default Language

Chinese documentation under `docs/zh` is canonical for day-to-day project planning.

English documentation under `docs/en` may lag behind and should be synchronized when needed for external collaboration.

## Non-Negotiable Rules

- `docs/zh/07-roadmap-status.md` is the central roadmap status source.
- Every implementation Work ID must be registered in the roadmap status document.
- Architecture decisions must be captured as ADRs.
- Status changes must explain what changed, why, and which implementation repo PR or commit they relate to.
- Do not duplicate implementation code here.
- Do not make roadmap status optimistic; only mark `DONE` after the corresponding implementation PR is merged and verified.

## Required Updates

Update docs before or together with implementation when changing:

- Architecture boundaries.
- Event schema strategy.
- Roadmap sequencing.
- Work ID ownership or status.
- Permission, memory, MCP, ACP, skills, or client strategy.
- Multi-agent coordination rules.

## PR Rule

Every docs PR must state:

- Which section is the source of truth being changed.
- Whether implementation work is blocked, unlocked, or unaffected.
- Whether `custom-agent` needs a matching PR.
