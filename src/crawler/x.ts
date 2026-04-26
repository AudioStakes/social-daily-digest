import type { Page } from "playwright-core";

import { ManualActionRequiredError } from "../errors.js";
import { showManualActionDialog } from "../macos/terminal.js";
import type { SocialPost } from "../types.js";
import {
  assertNoManualChallenge,
  dedupePosts,
  filterRecentPosts,
} from "./common.js";

async function isLoggedIn(page: Page): Promise<boolean> {
  if (page.url().includes("/i/flow/login")) {
    return false;
  }

  if ((await page.locator('input[name="text"]').count()) > 0) {
    return false;
  }

  if ((await page.locator('input[name="password"]').count()) > 0) {
    return false;
  }

  return (await page.locator("article").count()) > 0;
}

async function scrapePosts(page: Page, cutoffMs: number): Promise<SocialPost[]> {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);

  for (let index = 0; index < 3; index += 1) {
    await page.mouse.wheel(0, 2_000);
    await page.waitForTimeout(1_500);
  }

  const posts = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll("article"));

    return articles
      .map((article) => {
        const statusLink = article.querySelector(
          'a[href*="/status/"]',
        ) as HTMLAnchorElement | null;
        const time = article.querySelector("time") as HTMLTimeElement | null;
        const textNodes = Array.from(
          article.querySelectorAll('[data-testid="tweetText"], div[lang]'),
        );
        const authorNode = article.querySelector(
          '[data-testid="User-Name"] span',
        );

        const text = textNodes
          .map((node) => node.textContent?.trim() ?? "")
          .filter((part) => part !== "")
          .join("\n")
          .trim();

        const url = statusLink?.href ?? "";
        const author = authorNode?.textContent?.trim() ?? "Unknown";
        const publishedAtRaw = time?.getAttribute("datetime") ?? null;
        const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : null;

        return {
          platform: "x" as const,
          author,
          text,
          url,
          publishedAtLabel:
            time?.textContent?.trim() || (publishedAtRaw ? publishedAtRaw : "Unknown time"),
          publishedAtMs: Number.isNaN(publishedAtMs) ? null : publishedAtMs,
        };
      })
      .filter((post) => post.url !== "" && post.text !== "");
  });

  return filterRecentPosts(dedupePosts(posts), cutoffMs);
}

export async function crawlXFeed(
  page: Page,
  cutoffMs: number,
): Promise<SocialPost[]> {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);

  if (!(await isLoggedIn(page))) {
    await showManualActionDialog(
      "X needs manual login. Complete login in the opened Google Chrome window, then click OK to continue.",
    );
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
  }

  await assertNoManualChallenge(page, "X", [
    /captcha/i,
    /suspicious/i,
    /account\/access/i,
    /challenge/i,
    /verify/i,
  ]);

  if (!(await isLoggedIn(page))) {
    throw new ManualActionRequiredError(
      "X login is still incomplete after manual login confirmation.",
    );
  }

  return await scrapePosts(page, cutoffMs);
}
