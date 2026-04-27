import { readFile } from "node:fs/promises";

import { getXSnapshotPath, getXSnapshotsDirectory } from "../paths.js";
import type { SocialPost } from "../types.js";
import { ensureDirectory, pathExists, writeTextFile } from "../util/files.js";
import { dedupePosts, filterRecentPosts } from "./common.js";
import { fetchXFeedViaApi } from "../x/api.js";

function isSocialPost(value: unknown): value is SocialPost {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SocialPost>;
  return (
    candidate.platform === "x" &&
    typeof candidate.author === "string" &&
    (typeof candidate.authorHandle === "string" || candidate.authorHandle === null) &&
    typeof candidate.text === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.publishedAtLabel === "string" &&
    (typeof candidate.publishedAtMs === "number" || candidate.publishedAtMs === null) &&
    typeof candidate.isRepost === "boolean" &&
    (typeof candidate.repostedAccount === "string" || candidate.repostedAccount === null) &&
    typeof candidate.hasImage === "boolean" &&
    typeof candidate.hasVideo === "boolean"
  );
}

async function saveTimelineSnapshot(posts: SocialPost[], reportDate: string): Promise<void> {
  await ensureDirectory(getXSnapshotsDirectory());
  const snapshotPath = getXSnapshotPath(reportDate);
  await writeTextFile(snapshotPath, JSON.stringify(posts, null, 2));
}

export async function loadXFeedSnapshotFromDisk(
  reportDate: string,
  cutoffMs: number,
): Promise<SocialPost[] | null> {
  const snapshotPath = getXSnapshotPath(reportDate);
  if (!(await pathExists(snapshotPath))) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch {
    console.warn(`Ignoring invalid X snapshot at ${snapshotPath}. Fetching fresh API data.`);
    return null;
  }

  if (!Array.isArray(parsed) || !parsed.every(isSocialPost)) {
    console.warn(`Ignoring malformed X snapshot at ${snapshotPath}. Fetching fresh API data.`);
    return null;
  }

  return filterRecentPosts(dedupePosts(parsed), cutoffMs);
}

export async function fetchAndSaveXFeedSnapshot(
  accessToken: string,
  reportDate: string,
  cutoffMs: number,
): Promise<SocialPost[]> {
  const posts = await fetchXFeedViaApi(accessToken, cutoffMs);
  const normalized = filterRecentPosts(dedupePosts(posts), cutoffMs);
  await saveTimelineSnapshot(normalized, reportDate);
  return normalized;
}
