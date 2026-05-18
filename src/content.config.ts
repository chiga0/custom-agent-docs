// Astro 5 content collection config.
//
// Starlight 默认从 src/content/docs/ 读内容；我们的内容物理位置在
// ./docs/zh/ 和 ./docs/en/（保持旧路径不大规模迁移）。用 Astro 内置
// glob loader 把它们 mount 进 docs collection。

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    // 用自定义 glob loader 而不是默认 docsLoader()，是因为内容在 ./docs/
    // 而不是 ./src/content/docs/。
    // 只读 docs/zh + docs/en 下的内容，跳过 docs/README.md 等非内容页文件
    loader: glob({ pattern: "{zh,en}/**/*.{md,mdx}", base: "./docs" }),
    schema: docsSchema(),
  }),
};

// Keep docsLoader import alive in case we switch back to default Starlight
// layout in a future migration.
void docsLoader;
