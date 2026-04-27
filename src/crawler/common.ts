import type { SocialPost } from "../types.js";

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
