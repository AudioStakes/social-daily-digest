import type { Page } from "playwright-core";

import { ManualActionRequiredError } from "../errors.js";
import type { SocialPost } from "../types.js";

export async function clickFirstVisible(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.click({ timeout: 5_000 });
      return true;
    }
  }

  return false;
}

export function dedupePosts(posts: SocialPost[]): SocialPost[] {
  const seen = new Set<string>();
  const deduped: SocialPost[] = [];

  for (const post of posts) {
    if (seen.has(post.url)) {
      continue;
    }

    seen.add(post.url);
    deduped.push(post);
  }

  return deduped;
}

export function filterRecentPosts(
  posts: SocialPost[],
  cutoffMs: number,
): SocialPost[] {
  return posts.filter((post) => {
    if (post.publishedAtMs === null) {
      return false;
    }

    return post.publishedAtMs >= cutoffMs;
  });
}

export async function assertNoManualChallenge(
  page: Page,
  platformLabel: string,
  patterns: RegExp[],
): Promise<void> {
  const url = page.url();
  const bodyText = (await page.locator("body").textContent()) ?? "";
  const normalized = `${url}\n${bodyText}`;

  if (patterns.some((pattern) => pattern.test(normalized))) {
    throw new ManualActionRequiredError(
      `${platformLabel} requested a manual verification step.`,
    );
  }
}
