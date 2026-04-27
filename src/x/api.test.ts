import test from "node:test";
import assert from "node:assert/strict";

import { CliError } from "../errors.js";
import { dedupePosts, filterRecentPosts } from "../crawler/common.js";
import { fetchXFeedViaApi } from "./api.js";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (input: RequestInfo | URL) => Promise<Response>): void {
  globalThis.fetch = handler as typeof fetch;
}

test("maps timeline response to SocialPost and media flags", async () => {
  const nowIso = "2026-04-27T12:00:00.000Z";
  mockFetch(async (input) => {
    const url = String(input);
    if (url.includes("/users/me")) {
      return new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 });
    }

    return new Response(
      JSON.stringify({
        data: [
          {
            id: "t1",
            text: "hello",
            author_id: "u1",
            created_at: nowIso,
            referenced_tweets: [{ type: "retweeted" }],
            attachments: { media_keys: ["m1", "m2"] },
          },
        ],
        includes: {
          users: [{ id: "u1", username: "alice", name: "Alice" }],
          media: [
            { media_key: "m1", type: "photo" },
            { media_key: "m2", type: "video" },
          ],
        },
        meta: {},
      }),
      { status: 200 },
    );
  });

  const posts = await fetchXFeedViaApi("token", Date.parse("2026-04-27T00:00:00.000Z"));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, "https://x.com/alice/status/t1");
  assert.equal(posts[0].isRepost, true);
  assert.equal(posts[0].hasImage, true);
  assert.equal(posts[0].hasVideo, true);
});

test("filters old posts and dedupes by URL", async () => {
  const cutoff = Date.parse("2026-04-27T00:00:00.000Z");
  const posts = [
    {
      platform: "x" as const,
      author: "a",
      authorHandle: "alice",
      text: "1",
      url: "https://x.com/alice/status/1",
      publishedAtLabel: "",
      publishedAtMs: cutoff + 1,
      isRepost: false,
      repostedAccount: null,
      hasImage: false,
      hasVideo: false,
    },
    {
      platform: "x" as const,
      author: "a",
      authorHandle: "alice",
      text: "dup",
      url: "https://x.com/alice/status/1",
      publishedAtLabel: "",
      publishedAtMs: cutoff + 2,
      isRepost: false,
      repostedAccount: null,
      hasImage: false,
      hasVideo: false,
    },
    {
      platform: "x" as const,
      author: "b",
      authorHandle: "bob",
      text: "old",
      url: "https://x.com/bob/status/2",
      publishedAtLabel: "",
      publishedAtMs: cutoff - 1,
      isRepost: false,
      repostedAccount: null,
      hasImage: false,
      hasVideo: false,
    },
  ];

  const recent = filterRecentPosts(dedupePosts(posts), cutoff);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].url, "https://x.com/alice/status/1");
});


test("handles empty timeline response", async () => {
  mockFetch(async (input) => {
    const url = String(input);
    if (url.includes("/users/me")) {
      return new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 });
    }

    return new Response(JSON.stringify({ meta: { result_count: 0 } }), { status: 200 });
  });

  const posts = await fetchXFeedViaApi("token", Date.parse("2026-04-27T00:00:00.000Z"));
  assert.equal(posts.length, 0);
});

test("maps 429/401/403 to readable errors", async () => {
  for (const status of [429, 401, 403]) {
    mockFetch(async () => new Response("{}", { status }));
    await assert.rejects(
      fetchXFeedViaApi("token", Date.now()),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        return true;
      },
    );
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
