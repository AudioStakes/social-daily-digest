import path from "node:path";

import { getReportsDirectory } from "../paths.js";
import type { AppSettings, PlatformName, SocialPost } from "../types.js";
import { ensureDirectory, writeTextFile } from "../util/files.js";
import { formatDateInTimeZone } from "../util/time.js";

function renderPlatformLabel(platform: PlatformName): string {
  return platform === "x" ? "X" : "Facebook";
}

function indentLines(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function escapeMarkdownText(value: string): string {
  return value.replaceAll("\r", "").trim();
}

export async function writeMarkdownReport(
  settings: AppSettings,
  posts: SocialPost[],
  now: Date,
): Promise<string> {
  await ensureDirectory(getReportsDirectory());

  const reportDate = formatDateInTimeZone(now, settings.app.timezone);
  const reportPath = path.join(getReportsDirectory(), `${reportDate}.md`);

  let contents = `# Social Daily Digest\n\n${reportDate}\n`;

  if (posts.length === 0) {
    contents += `\nNo posts found in the last 24 hours.\n`;
    await writeTextFile(reportPath, contents);
    return reportPath;
  }

  const xPosts = posts.filter((post) => post.platform === "x");
  const facebookPosts = posts.filter((post) => post.platform === "facebook");

  contents += `\n## Summary\n\n* X: ${xPosts.length} posts\n* Facebook: ${facebookPosts.length} posts\n`;

  const sections: PlatformName[] = ["x", "facebook"];
  for (const platform of sections) {
    const platformPosts = posts.filter((post) => post.platform === platform);
    if (platformPosts.length === 0) {
      continue;
    }

    contents += `\n## ${renderPlatformLabel(platform)}\n`;
    const grouped = new Map<string, SocialPost[]>();

    for (const post of platformPosts) {
      const current = grouped.get(post.author) ?? [];
      current.push(post);
      grouped.set(post.author, current);
    }

    for (const [author, authorPosts] of grouped) {
      contents += `\n### ${escapeMarkdownText(author)}\n\n`;

      for (const post of authorPosts) {
        const body = escapeMarkdownText(post.text);
        contents += `* ${post.publishedAtLabel}\n`;
        contents += `${indentLines(body)}\n`;
        contents += `${indentLines(`[${post.url}](${post.url})`)}\n`;
      }
    }
  }

  await writeTextFile(reportPath, contents);
  return reportPath;
}
