#!/usr/bin/env node
// 给 docs/zh + docs/en 下所有 .md 文件添加最小 frontmatter（title 必填）。
// 如果文件已有 frontmatter 则跳过。
// title 优先从首个 # H1 推断；推断不到则用文件名。

import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const FILES = [];

for await (const entry of glob("docs/{zh,en}/**/*.md", { cwd: ROOT })) {
  FILES.push(path.join(ROOT, entry));
}

let updated = 0;
let skipped = 0;

for (const file of FILES) {
  const content = await readFile(file, "utf8");

  if (content.startsWith("---")) {
    skipped += 1;
    continue;
  }

  const h1 = content.match(/^#\s+(.+?)$/m);
  const title = h1
    ? h1[1].trim()
    : path
        .basename(file, ".md")
        .replace(/^\d+-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  const frontmatter = `---\ntitle: ${JSON.stringify(title)}\n---\n\n`;
  await writeFile(file, frontmatter + content, "utf8");
  updated += 1;
}

console.log(`Updated ${updated} files, skipped ${skipped} (already had frontmatter).`);
