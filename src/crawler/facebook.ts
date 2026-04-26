import type { Page } from "playwright-core";

import { ManualActionRequiredError } from "../errors.js";
import type { SocialPost } from "../types.js";
import { assertNoManualChallenge, dedupePosts, filterRecentPosts } from "./common.js";

async function isLoggedIn(page: Page): Promise<boolean> {
  if (page.url().includes("/login")) {
    return false;
  }

  if ((await page.locator('input[name="email"]').count()) > 0) {
    return false;
  }

  return (await page.locator('[role="feed"], [role="main"] [role="article"]').count()) > 0;
}

async function loginToFacebook(
  page: Page,
  accountName: string,
  password: string,
): Promise<void> {
  await page.goto("https://www.facebook.com/login", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_000);

  await page.locator('input[name="email"]').first().fill(accountName);
  await page.locator('input[name="pass"]').first().fill(password);
  await page.locator('button[name="login"]').first().click();
  await page.waitForTimeout(4_000);

  await assertNoManualChallenge(page, "Facebook", [
    /checkpoint/i,
    /two-step/i,
    /confirm your identity/i,
    /security check/i,
    /captcha/i,
  ]);
}

async function scrapePosts(page: Page, cutoffMs: number): Promise<SocialPost[]> {
  await page.goto("https://www.facebook.com/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3_000);

  for (let index = 0; index < 3; index += 1) {
    await page.mouse.wheel(0, 2_200);
    await page.waitForTimeout(1_500);
  }

  const posts = await page.evaluate(() => {
    const articleSelectors = [
      '[role="feed"] [role="article"]',
      '[role="main"] [role="article"]',
    ];

    const articleElements = articleSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)),
    );

    return articleElements
      .map((article) => {
        const link = article.querySelector(
          'a[href*="/posts/"], a[href*="/permalink/"], a[href*="/stories/"], a[href*="story_fbid="], a[href*="/videos/"]',
        ) as HTMLAnchorElement | null;
        const timeElement = article.querySelector("time") as HTMLTimeElement | null;
        const legacyTime = article.querySelector("abbr[data-utime]") as HTMLElement | null;
        const authorNode = article.querySelector("h2 span, h3 span, strong span");
        const textNodes = Array.from(
          article.querySelectorAll(
            'div[data-ad-comet-preview="message"] span, div[dir="auto"] span',
          ),
        );

        const text = textNodes
          .map((node) => node.textContent?.trim() ?? "")
          .filter((part) => part !== "")
          .join("\n")
          .trim();

        const href = link?.href ?? "";
        const timeRaw =
          timeElement?.getAttribute("datetime") ??
          legacyTime?.getAttribute("data-utime") ??
          null;

        let publishedAtMs: number | null = null;
        if (timeElement?.getAttribute("datetime")) {
          const parsed = Date.parse(timeElement.getAttribute("datetime") ?? "");
          publishedAtMs = Number.isNaN(parsed) ? null : parsed;
        } else if (legacyTime?.getAttribute("data-utime")) {
          const epochSeconds = Number(legacyTime.getAttribute("data-utime"));
          publishedAtMs = Number.isNaN(epochSeconds)
            ? null
            : epochSeconds * 1_000;
        }

        return {
          platform: "facebook" as const,
          author: authorNode?.textContent?.trim() ?? "Unknown",
          text,
          url: href,
          publishedAtLabel:
            timeElement?.textContent?.trim() ??
            legacyTime?.textContent?.trim() ??
            timeRaw ??
            "Unknown time",
          publishedAtMs,
        };
      })
      .filter((post) => post.url !== "" && post.text !== "");
  });

  return filterRecentPosts(dedupePosts(posts), cutoffMs);
}

export async function crawlFacebookFeed(
  page: Page,
  accountName: string,
  getPassword: () => Promise<string>,
  cutoffMs: number,
): Promise<SocialPost[]> {
  await page.goto("https://www.facebook.com/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2_000);

  if (!(await isLoggedIn(page))) {
    const password = await getPassword();
    await loginToFacebook(page, accountName, password);
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3_000);
  }

  await assertNoManualChallenge(page, "Facebook", [
    /checkpoint/i,
    /two-step/i,
    /confirm your identity/i,
    /security check/i,
    /captcha/i,
  ]);

  if (!(await isLoggedIn(page))) {
    throw new ManualActionRequiredError(
      "Facebook login could not be completed automatically.",
    );
  }

  return await scrapePosts(page, cutoffMs);
}
