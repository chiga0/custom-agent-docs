// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Starlight 站点入口。
// - 中文 (zh) 是 canonical；English (en) follow。
// - 内容物理位置：./docs/zh/ 与 ./docs/en/（保留旧路径，避免大规模迁移）。
//   通过 src/content/config.ts 的 glob loader 读取。
// - 详见 docs/zh/adr/0005-docs-site-architecture.md。

export default defineConfig({
  site: "https://docs.custom-agent.dev", // TODO: 替换为实际部署域名
  integrations: [
    starlight({
      title: "Custom Agent",
      description: "Local-first event-sourced AI coding agent framework — from-zero implementation guide",
      defaultLocale: "zh",
      locales: {
        zh: { label: "中文" },
        en: { label: "English" },
      },
      social: {
        github: "https://github.com/chiga0/custom-agent",
      },
      sidebar: [
        {
          label: "新读者从这里",
          translations: { en: "Start Here" },
          items: [
            { label: "5 分钟读懂", translations: { en: "5-min Mental Model" }, link: "/zh/handbook/intro/" },
            { label: "术语表", translations: { en: "Glossary" }, link: "/zh/handbook/glossary/" },
            { label: "Quickstart", link: "/zh/handbook/getting-started/quickstart/" },
          ],
        },
        {
          label: "Foundations",
          translations: { en: "Foundations" },
          items: [
            { label: "分层架构", translations: { en: "Layered Architecture" }, link: "/zh/handbook/layered-architecture/" },
            { label: "Turn 生命周期", translations: { en: "Turn Lifecycle" }, link: "/zh/handbook/foundations/turn-lifecycle/" },
          ],
        },
        {
          label: "Implementation",
          translations: { en: "Implementation" },
          items: [
            { label: "从零构建", translations: { en: "From Zero" }, link: "/zh/handbook/implementation/from-zero/" },
            { label: "Tools 与 Permissions", translations: { en: "Tools & Permissions" }, link: "/zh/handbook/implementation/tools-and-permissions/" },
            { label: "Context", link: "/zh/handbook/implementation/context/" },
            { label: "Memory", link: "/zh/handbook/implementation/memory/" },
            { label: "Skills", link: "/zh/handbook/implementation/skills/" },
            { label: "MCP", link: "/zh/handbook/implementation/mcp/" },
          ],
        },
        {
          label: "Advanced（预留能力）",
          translations: { en: "Advanced (reserved capabilities)" },
          items: [
            { label: "Remote Execution", link: "/zh/handbook/advanced/remote-execution/" },
            { label: "Plugin / Extension", link: "/zh/handbook/advanced/plugin-system/" },
            { label: "Scheduled Automations", link: "/zh/handbook/advanced/automation/" },
          ],
        },
        {
          label: "Layers (现有，Phase 4 重写中)",
          translations: { en: "Layers (legacy, being rewritten)" },
          autogenerate: { directory: "zh/handbook/layers" },
          collapsed: true,
        },
        {
          label: "Reference",
          translations: { en: "Reference" },
          items: [
            { label: "ADR 索引", translations: { en: "ADR Index" }, link: "/zh/handbook/reference/adr-index/" },
          ],
        },
        {
          label: "Governance",
          translations: { en: "Governance" },
          items: [
            { label: "Roadmap", link: "/zh/02-roadmap/" },
            { label: "Roadmap Status", link: "/zh/03-roadmap-status/" },
            { label: "Implementation Backlog", link: "/zh/07-implementation-backlog/" },
            { label: "Quality & CI", link: "/zh/04-quality-ci-test-strategy/" },
          ],
        },
        {
          label: "ADR",
          autogenerate: { directory: "zh/adr" },
          collapsed: true,
        },
      ],
      lastUpdated: true,
      editLink: {
        baseUrl: "https://github.com/chiga0/custom-agent-docs/edit/main/",
      },
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
