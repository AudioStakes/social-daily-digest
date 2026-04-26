import path from "node:path";

import { getReportsDirectory } from "../paths.js";
import type { AppSettings, SocialPost } from "../types.js";
import { ensureDirectory, writeTextFile } from "../util/files.js";
import { formatDateInTimeZone, formatDateTimeInTimeZone } from "../util/time.js";

function indentLines(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function escapeMarkdownText(value: string): string {
  return value.replaceAll("\r", "").trim();
}

function buildPostMeta(post: SocialPost, timeZone: string): string {
  const parts: string[] = [];

  if (post.publishedAtMs !== null) {
    parts.push(formatDateTimeInTimeZone(new Date(post.publishedAtMs), timeZone));
  } else {
    parts.push(post.publishedAtLabel);
  }

  if (post.isRepost) {
    parts.push("REPOST");
  }

  if (post.repostedAccount) {
    parts.push(`of @${post.repostedAccount}`);
  }

  if (post.hasImage) {
    parts.push("IMAGE");
  }

  if (post.hasVideo) {
    parts.push("VIDEO");
  }

  return parts.join(" | ");
}

function buildAuthorLabel(post: SocialPost): string {
  if (post.authorHandle) {
    return `${post.author} @${post.authorHandle}`;
  }

  return post.author;
}

function buildDayLabel(post: SocialPost, timeZone: string): string {
  if (post.publishedAtMs === null) {
    return "Unknown day";
  }

  return formatDateTimeInTimeZone(new Date(post.publishedAtMs), timeZone).slice(0, 4);
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

  contents += `\n## Summary\n\n* X: ${posts.length} posts\n`;

  contents += `\n## X\n`;
  const grouped = new Map<string, SocialPost[]>();

  for (const post of posts) {
    const current = grouped.get(buildAuthorLabel(post)) ?? [];
    current.push(post);
    grouped.set(buildAuthorLabel(post), current);
  }

  for (const [author, authorPosts] of grouped) {
    contents += `\n### ${escapeMarkdownText(author)}\n\n`;

    let currentDay = "";
    for (const post of authorPosts) {
      const dayLabel = buildDayLabel(post, settings.app.timezone);
      if (dayLabel !== currentDay) {
        currentDay = dayLabel;
        contents += `\n#### ${dayLabel}\n\n`;
      }

      contents += `* ${buildPostMeta(post, settings.app.timezone)}\n`;
      if (!post.isRepost) {
        const body = escapeMarkdownText(post.text);
        if (body !== "") {
          contents += `${indentLines(body)}\n`;
        }
      }
      contents += `${indentLines(`[link](${post.url})`)}\n`;
    }
  }

  await writeTextFile(reportPath, contents);
  return reportPath;
}
