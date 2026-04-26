import type { Page } from "playwright-core";
import { readFile } from "node:fs/promises";

import { ManualActionRequiredError } from "../errors.js";
import { getXSnapshotPath, getXSnapshotsDirectory } from "../paths.js";
import type { SocialPost } from "../types.js";
import { dedupePosts, filterRecentPosts } from "./common.js";
import { ensureDirectory, pathExists, writeTextFile } from "../util/files.js";
import { formatDateInTimeZone } from "../util/time.js";

const X_HOME_URL = "https://x.com/home";
const MAX_SCROLL_PASSES = 400;
const STALLED_SCROLL_LIMIT = 30;
const SCROLL_SETTLE_ATTEMPTS = 8;
const SCROLL_SETTLE_DELAY_MS = 1_500;

async function isLoggedIn(page: Page): Promise<boolean> {
  if (page.url().includes("/i/flow/login")) {
    return false;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const articleCount = await page.locator("article").count();
    const followingTabCount = await page
      .locator('[role="tab"]')
      .filter({ hasText: /^Following$/i })
      .count();
    const profileHandleCount = await page
      .locator('a[href="/AudioStakes"], a[href="/home"], button[aria-label*="Account menu"]')
      .count();

    if (articleCount > 0 || followingTabCount > 0 || profileHandleCount > 0) {
      return true;
    }

    if ((await page.locator('input[name="password"]').count()) > 0) {
      return false;
    }

    if (attempt < 4) {
      await page.waitForTimeout(1_500);
    }
  }

  return false;
}

async function assertNoXManualChallenge(page: Page): Promise<void> {
  const url = page.url();

  if (/account\/access|captcha|challenge/i.test(url)) {
    throw new ManualActionRequiredError(
      "X requires manual login or verification in Google Chrome.",
    );
  }

  const blockingChallengeVisible =
    (await page
      .locator('input[name="password"], input[name="text"], iframe[src*="captcha"]')
      .count()) > 0;

  if (blockingChallengeVisible) {
    throw new ManualActionRequiredError(
      "X requires manual login or verification in Google Chrome.",
    );
  }

  const bodyText = ((await page.locator("body").textContent()) ?? "").toLowerCase();
  const explicitChallengeText = [
    "enter your phone number or username",
    "confirm your identity",
    "unusual login activity",
    "suspicious login prevented",
    "something went wrong. try reloading",
  ];

  if (explicitChallengeText.some((text) => bodyText.includes(text))) {
    throw new ManualActionRequiredError(
      "X requires manual login or verification in Google Chrome.",
    );
  }
}

async function openFollowingTimeline(page: Page): Promise<void> {
  if (!page.url().startsWith(X_HOME_URL)) {
    await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
  }

  const followingTab = page
    .locator('[role="tab"]')
    .filter({ hasText: /^Following$/i })
    .first();

  if ((await followingTab.count()) === 0) {
    throw new ManualActionRequiredError(
      'X "Following" tab was not found. Confirm the home timeline is available in Google Chrome.',
    );
  }

  await followingTab.click();
  await page.waitForTimeout(2_000);
}

async function collectVisiblePosts(page: Page): Promise<SocialPost[]> {
  return await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll("article"));

    return articles
      .map((article) => {
        const statusLink = article.querySelector(
          'a[href*="/status/"]',
        ) as HTMLAnchorElement | null;
        const statusHref = statusLink?.getAttribute("href") ?? "";
        const resolvedStatusUrl = statusHref !== "" ? new URL(statusHref, "https://x.com").href : "";
        const time = article.querySelector("time") as HTMLTimeElement | null;
        const textNodes = Array.from(article.querySelectorAll('[data-testid="tweetText"], div[lang]'))
          .filter((node) => node.closest("article") === article);
        const authorNode = article.querySelector(
          '[data-testid="User-Name"] span',
        );
        const userLinks = Array.from(
          article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'),
        ) as HTMLAnchorElement[];
        const socialContextNode = article.querySelector('[data-testid="socialContext"]');
        const statusPath = resolvedStatusUrl !== "" ? new URL(resolvedStatusUrl).pathname : "";
        const socialContextText = socialContextNode?.textContent?.trim() ?? "";
        const reposter = socialContextText.replace(/\s+reposted$/i, "").trim();
        const userHandles = userLinks
          .map((link) => {
            const href = link.getAttribute("href") ?? "";
            return href.startsWith("/") && !href.includes("/status/") ? href.slice(1) : "";
          })
          .filter((handle) => handle !== "");
        const authorHandle = userHandles[0] ?? null;
        const repostedAccount =
          userHandles.find((handle) => handle !== authorHandle) ??
          statusPath.split("/")[1] ??
          "";
        const hasImage =
          article.querySelector('[data-testid="tweetPhoto"]') !== null ||
          article.querySelector('img[src*="pbs.twimg.com/media"]') !== null;
        const hasVideo =
          article.querySelector('video, [data-testid="videoPlayer"]') !== null;

        const text = textNodes
          .map((node) => node.textContent?.trim() ?? "")
          .filter((part) => part !== "")
          .join("\n")
          .trim();

        const url = resolvedStatusUrl;
        const isRepost = /reposted/i.test(socialContextText);
        const author = isRepost
          ? reposter || authorNode?.textContent?.trim() || "Unknown"
          : authorNode?.textContent?.trim() ?? "Unknown";
        const publishedAtRaw = time?.getAttribute("datetime") ?? null;
        const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : null;

        return {
          platform: "x" as const,
          author,
          authorHandle,
          text: isRepost ? "" : text,
          url,
          publishedAtLabel:
            time?.textContent?.trim() || (publishedAtRaw ? publishedAtRaw : "Unknown time"),
          publishedAtMs: Number.isNaN(publishedAtMs) ? null : publishedAtMs,
          isRepost,
          repostedAccount: isRepost && repostedAccount !== "" ? repostedAccount : null,
          hasImage,
          hasVideo,
          articleHtml: article.outerHTML,
        };
      })
      .filter((post) => post.url !== "");
  });
}

async function saveTimelineSnapshot(posts: SocialPost[], reportDate: string): Promise<string> {
  const snapshotDir = getXSnapshotsDirectory();
  await ensureDirectory(snapshotDir);
  const snapshotPath = getXSnapshotPath(reportDate);
  const articleHtml = posts
    .map((post) => post.articleHtml ?? "")
    .filter((value) => value !== "")
    .join("\n");
  const html = `<!DOCTYPE html><html><body><main>${articleHtml}</main></body></html>`;
  await writeTextFile(snapshotPath, html);
  return snapshotPath;
}

async function parsePostsFromSavedHtml(
  page: Page,
  html: string,
): Promise<SocialPost[]> {
  return await page.evaluate((rawHtml) => {
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    const articles = Array.from(doc.querySelectorAll("article"));

    return articles
      .map((article) => {
        const statusLink = article.querySelector(
          'a[href*="/status/"]',
        ) as HTMLAnchorElement | null;
        const statusHref = statusLink?.getAttribute("href") ?? "";
        const resolvedStatusUrl = statusHref !== "" ? new URL(statusHref, "https://x.com").href : "";
        const time = article.querySelector("time") as HTMLTimeElement | null;
        const textNodes = Array.from(article.querySelectorAll('[data-testid="tweetText"], div[lang]'))
          .filter((node) => node.closest("article") === article);
        const authorNode = article.querySelector(
          '[data-testid="User-Name"] span',
        );
        const userLinks = Array.from(
          article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'),
        ) as HTMLAnchorElement[];
        const socialContextNode = article.querySelector('[data-testid="socialContext"]');
        const statusPath = resolvedStatusUrl !== "" ? new URL(resolvedStatusUrl).pathname : "";
        const socialContextText = socialContextNode?.textContent?.trim() ?? "";
        const reposter = socialContextText.replace(/\s+reposted$/i, "").trim();
        const userHandles = userLinks
          .map((link) => {
            const href = link.getAttribute("href") ?? "";
            return href.startsWith("/") && !href.includes("/status/") ? href.slice(1) : "";
          })
          .filter((handle) => handle !== "");
        const authorHandle = userHandles[0] ?? null;
        const repostedAccount =
          userHandles.find((handle) => handle !== authorHandle) ??
          statusPath.split("/")[1] ??
          "";
        const hasImage =
          article.querySelector('[data-testid="tweetPhoto"]') !== null ||
          article.querySelector('img[src*="pbs.twimg.com/media"]') !== null;
        const hasVideo =
          article.querySelector('video, [data-testid="videoPlayer"]') !== null;

        const text = textNodes
          .map((node) => node.textContent?.trim() ?? "")
          .filter((part) => part !== "")
          .join("\n")
          .trim();

        const url = resolvedStatusUrl;
        const isRepost = /reposted/i.test(socialContextText);
        const author = isRepost
          ? reposter || authorNode?.textContent?.trim() || "Unknown"
          : authorNode?.textContent?.trim() ?? "Unknown";
        const publishedAtRaw = time?.getAttribute("datetime") ?? null;
        const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : null;

        return {
          platform: "x" as const,
          author,
          authorHandle,
          text: isRepost ? "" : text,
          url,
          publishedAtLabel:
            time?.textContent?.trim() || (publishedAtRaw ? publishedAtRaw : "Unknown time"),
          publishedAtMs: Number.isNaN(publishedAtMs) ? null : publishedAtMs,
          isRepost,
          repostedAccount: isRepost && repostedAccount !== "" ? repostedAccount : null,
          hasImage,
          hasVideo,
          articleHtml: article.outerHTML,
        };
      })
      .filter((post) => post.url !== "");
  }, html);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMatches(pattern: RegExp, value: string): string[] {
  return Array.from(value.matchAll(pattern), (match) => match[1] ?? "");
}

function parsePostsFromSavedHtmlInNode(html: string): SocialPost[] {
  const articleMatches = html.match(/<article[\s\S]*?<\/article>/g) ?? [];

  return articleMatches
    .map((articleHtml) => {
      const statusHref =
        articleHtml.match(/href="([^"]*\/status\/[^"]+)"/)?.[1] ?? "";
      const resolvedStatusUrl =
        statusHref !== "" ? new URL(statusHref, "https://x.com").href : "";
      const statusPath =
        resolvedStatusUrl !== "" ? new URL(resolvedStatusUrl).pathname : "";
      const publishedAtRaw =
        articleHtml.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null;
      const publishedAtMs = publishedAtRaw ? Date.parse(publishedAtRaw) : null;
      const socialContextHtml =
        articleHtml.match(/data-testid="socialContext"[^>]*>([\s\S]*?)<\/[^>]+>/)?.[1] ?? "";
      const socialContextText = normalizeWhitespace(stripTags(socialContextHtml));
      const reposter = socialContextText.replace(/\s+reposted$/i, "").trim();
      const userHandles = extractMatches(
        /data-testid="User-Name"[\s\S]*?href="\/([^"/?#]+)"/g,
        articleHtml,
      );
      const dedupedHandles = [...new Set(userHandles)];
      const authorHandle = dedupedHandles[0] ?? null;
      const repostedAccount =
        dedupedHandles.find((handle) => handle !== authorHandle) ??
        statusPath.split("/")[1] ??
        "";
      const authorNameHtml =
        articleHtml.match(/data-testid="User-Name"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ??
        "";
      const authorName = normalizeWhitespace(stripTags(authorNameHtml)) || "Unknown";
      const textParts = extractMatches(
        /(?:data-testid="tweetText"[^>]*>|<div[^>]*lang="[^"]*"[^>]*>)([\s\S]*?)<\/div>/g,
        articleHtml,
      )
        .map((part) => normalizeWhitespace(stripTags(part)))
        .filter((part) => part !== "");
      const isRepost = /reposted/i.test(socialContextText);
      const hasImage =
        articleHtml.includes('data-testid="tweetPhoto"') ||
        articleHtml.includes("pbs.twimg.com/media");
      const hasVideo =
        articleHtml.includes('data-testid="videoPlayer"') ||
        articleHtml.includes("<video");

      return {
        platform: "x" as const,
        author: isRepost ? reposter || authorName : authorName,
        authorHandle,
        text: isRepost ? "" : textParts.join("\n").trim(),
        url: resolvedStatusUrl,
        publishedAtLabel: publishedAtRaw ?? "Unknown time",
        publishedAtMs: Number.isNaN(publishedAtMs) ? null : publishedAtMs,
        isRepost,
        repostedAccount: isRepost && repostedAccount !== "" ? repostedAccount : null,
        hasImage,
        hasVideo,
      };
    })
    .filter((post) => post.url !== "");
}

export async function loadXFeedSnapshot(
  page: Page,
  reportDate: string,
  cutoffMs: number,
): Promise<SocialPost[] | null> {
  const snapshotPath = getXSnapshotPath(reportDate);
  if (!(await pathExists(snapshotPath))) {
    return null;
  }

  const snapshotHtml = await readFile(snapshotPath, "utf8");
  const parsedPosts = await parsePostsFromSavedHtml(page, snapshotHtml);
  return filterRecentPosts(dedupePosts(parsedPosts), cutoffMs);
}

export async function loadXFeedSnapshotFromDisk(
  reportDate: string,
  cutoffMs: number,
): Promise<SocialPost[] | null> {
  const snapshotPath = getXSnapshotPath(reportDate);
  if (!(await pathExists(snapshotPath))) {
    return null;
  }

  const snapshotHtml = await readFile(snapshotPath, "utf8");
  const parsedPosts = parsePostsFromSavedHtmlInNode(snapshotHtml);
  return filterRecentPosts(dedupePosts(parsedPosts), cutoffMs);
}

async function scrollToTimelineBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll("article"));
    const lastArticle = articles.at(-1);
    if (lastArticle) {
      lastArticle.scrollIntoView({ block: "end" });
    } else {
      window.scrollBy(0, window.innerHeight * 2);
    }
  });
}

async function aggressivelyAdvanceTimeline(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 3);
    });
    await page.waitForTimeout(2_500);
    await scrollToTimelineBottom(page);
    await page.waitForTimeout(2_500);
  }
}

async function waitForTimelineAdvance(
  page: Page,
  previousLastPostUrl: string,
  previousVisibleCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < SCROLL_SETTLE_ATTEMPTS; attempt += 1) {
    await page.waitForTimeout(SCROLL_SETTLE_DELAY_MS);

    const visiblePosts = await collectVisiblePosts(page);
    const currentLastPostUrl = visiblePosts.at(-1)?.url ?? "";
    if (
      visiblePosts.length > previousVisibleCount ||
      (currentLastPostUrl !== "" && currentLastPostUrl !== previousLastPostUrl)
    ) {
      return;
    }
  }
}

async function scrapePosts(page: Page, cutoffMs: number): Promise<SocialPost[]> {
  await openFollowingTimeline(page);
  await page.waitForSelector("article", { timeout: 15_000 });
  await page.waitForTimeout(4_000);

  const collected = new Map<string, SocialPost>();
  let previousCount = 0;
  let stalledScrolls = 0;
  let previousLastPostUrl = "";

  for (let index = 0; index < MAX_SCROLL_PASSES; index += 1) {
    const visiblePosts = await collectVisiblePosts(page);
    for (const post of visiblePosts) {
      collected.set(post.url, post);
    }

    const tailPosts = visiblePosts
      .slice(-10)
      .map((post) => post.publishedAtMs)
      .filter((value): value is number => value !== null);
    const tailOlderThanCutoffCount = tailPosts.filter((value) => value < cutoffMs).length;

    if (tailPosts.length >= 5 && tailOlderThanCutoffCount >= 5) {
      break;
    }

    const currentLastPostUrl = visiblePosts.at(-1)?.url ?? "";
    if (collected.size === previousCount && currentLastPostUrl === previousLastPostUrl) {
      stalledScrolls += 1;
    } else {
      stalledScrolls = 0;
      previousCount = collected.size;
      previousLastPostUrl = currentLastPostUrl;
    }

    if (stalledScrolls >= STALLED_SCROLL_LIMIT) {
      await aggressivelyAdvanceTimeline(page);
      stalledScrolls = 0;
    }

    const previousVisibleCount = visiblePosts.length;
    await scrollToTimelineBottom(page);
    await waitForTimelineAdvance(page, currentLastPostUrl, previousVisibleCount);
  }

  const reportDate = formatDateInTimeZone(new Date(), "Asia/Tokyo");
  const snapshotPath = await saveTimelineSnapshot(Array.from(collected.values()), reportDate);
  const snapshotHtml = await readFile(snapshotPath, "utf8");
  const parsedPosts = await parsePostsFromSavedHtml(page, snapshotHtml);

  return filterRecentPosts(dedupePosts(parsedPosts), cutoffMs);
}

export async function crawlXFeed(
  page: Page,
  cutoffMs: number,
): Promise<SocialPost[]> {
  await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);

  if (!(await isLoggedIn(page))) {
    await assertNoXManualChallenge(page);
    throw new ManualActionRequiredError("X login is required in Google Chrome.");
  }

  await assertNoXManualChallenge(page);
  return await scrapePosts(page, cutoffMs);
}
