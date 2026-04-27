import { CliError } from "../errors.js";
import type { SocialPost } from "../types.js";

const USERS_ME_URL = "https://api.x.com/2/users/me";
const HOME_TIMELINE_URL = "https://api.x.com/2/users";

interface XUser {
  id: string;
  username?: string;
  name?: string;
}

interface XMedia {
  media_key: string;
  type: string;
}

interface XTweet {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  referenced_tweets?: Array<{ type?: string }>;
  attachments?: { media_keys?: string[] };
}

interface TimelineResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
    media?: XMedia[];
  };
  meta?: {
    next_token?: string;
  };
}

class XApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    super("Unexpected X API response.");
    this.name = "XApiResponseError";
  }
}

function isStartTimeParameterError(body: Record<string, unknown> | null): boolean {
  if (!body) {
    return false;
  }

  const errors = body.errors;
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some((error) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    const parameter = (error as { parameter?: unknown }).parameter;
    const message = (error as { message?: unknown }).message;
    return (
      parameter === "start_time" ||
      (typeof message === "string" && message.toLowerCase().includes("start_time"))
    );
  });
}

async function requestXApiJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new CliError("Network error while calling X API.");
  }

  if (response.status === 429) {
    throw new CliError("X API rate limit reached. Try again later.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new CliError(
      'X API access was denied. Confirm the app has tweet.read, users.read, and offline.access scopes, then run "sns-digest x auth login" again.',
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new XApiResponseError(response.status, body);
  }

  if (!body || typeof body !== "object") {
    throw new CliError("Unexpected X API response.");
  }

  return body;
}

async function getAuthenticatedUserId(accessToken: string): Promise<string> {
  const endpoint = new URL(USERS_ME_URL);
  endpoint.searchParams.set("user.fields", "username,name");
  const body = await requestXApiJson(endpoint.toString(), accessToken);

  const user = body.data as { id?: unknown } | undefined;
  if (!user || typeof user.id !== "string") {
    throw new CliError("Unexpected X API response.");
  }

  return user.id;
}

function mapTweetToSocialPost(
  tweet: XTweet,
  usersById: Map<string, XUser>,
  mediaByKey: Map<string, XMedia>,
): SocialPost {
  const author = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
  const authorName = author?.name?.trim() || "Unknown";
  const authorHandle = author?.username?.trim() || null;
  const createdAt = tweet.created_at;
  const publishedAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
  const mediaKeys = tweet.attachments?.media_keys ?? [];
  const mediaTypes = mediaKeys
    .map((mediaKey) => mediaByKey.get(mediaKey)?.type)
    .filter((type): type is string => typeof type === "string");

  return {
    platform: "x",
    author: authorName,
    authorHandle,
    text: tweet.text ?? "",
    url: authorHandle
      ? `https://x.com/${authorHandle}/status/${tweet.id}`
      : `https://x.com/i/web/status/${tweet.id}`,
    publishedAtLabel: createdAt ?? "",
    publishedAtMs: Number.isNaN(publishedAtMs) ? null : publishedAtMs,
    isRepost: (tweet.referenced_tweets ?? []).some(
      (reference) => reference.type === "retweeted",
    ),
    repostedAccount: null,
    hasImage: mediaTypes.some((type) => type === "photo"),
    hasVideo: mediaTypes.some((type) => type === "video" || type === "animated_gif"),
  };
}

export async function fetchXFeedViaApi(
  accessToken: string,
  cutoffMs: number,
): Promise<SocialPost[]> {
  const userId = await getAuthenticatedUserId(accessToken);

  const posts: SocialPost[] = [];
  let paginationToken: string | null = null;
  let shouldContinue = true;

  while (shouldContinue) {
    const endpoint = new URL(
      `${HOME_TIMELINE_URL}/${encodeURIComponent(userId)}/timelines/reverse_chronological`,
    );
    endpoint.searchParams.set("max_results", "100");
    endpoint.searchParams.set(
      "tweet.fields",
      "created_at,author_id,public_metrics,referenced_tweets,attachments",
    );
    endpoint.searchParams.set(
      "expansions",
      "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
    );
    endpoint.searchParams.set("user.fields", "username,name");
    endpoint.searchParams.set("media.fields", "type,url,preview_image_url");
    endpoint.searchParams.set("start_time", new Date(cutoffMs).toISOString());

    if (paginationToken) {
      endpoint.searchParams.set("pagination_token", paginationToken);
    }

    let responseBody: TimelineResponse;
    try {
      responseBody = (await requestXApiJson(
        endpoint.toString(),
        accessToken,
      )) as TimelineResponse;
    } catch (error) {
      if (
        error instanceof XApiResponseError &&
        error.status === 400 &&
        isStartTimeParameterError(error.body)
      ) {
        const fallbackEndpoint = new URL(endpoint.toString());
        fallbackEndpoint.searchParams.delete("start_time");
        responseBody = (await requestXApiJson(
          fallbackEndpoint.toString(),
          accessToken,
        )) as TimelineResponse;
      } else if (error instanceof XApiResponseError) {
        throw new CliError("Unexpected X API response.");
      } else {
        throw error;
      }
    }

    const tweets = responseBody.data ?? [];
    if (!Array.isArray(tweets)) {
      throw new CliError("Unexpected X API response.");
    }

    const usersById = new Map(
      (responseBody.includes?.users ?? [])
        .filter((user) => typeof user.id === "string")
        .map((user) => [user.id, user] as const),
    );
    const mediaByKey = new Map(
      (responseBody.includes?.media ?? [])
        .filter((media) => typeof media.media_key === "string")
        .map((media) => [media.media_key, media] as const),
    );

    for (const tweet of tweets) {
      if (!tweet || typeof tweet.id !== "string") {
        throw new CliError("Unexpected X API response.");
      }

      const post = mapTweetToSocialPost(tweet, usersById, mediaByKey);
      if (post.publishedAtMs !== null && post.publishedAtMs < cutoffMs) {
        shouldContinue = false;
        continue;
      }
      posts.push(post);
    }

    paginationToken = responseBody.meta?.next_token ?? null;
    if (!paginationToken) {
      break;
    }
  }

  return posts;
}
