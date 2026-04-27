export type PlatformName = "x";

export interface XApiConfig {
  client_id: string;
  callback_url: string;
}

export interface PlatformConfig {
  account_name: string;
  api: XApiConfig;
}

export interface AppSettings {
  app: {
    timezone: string;
  };
  browser: {
    user_data_dir: string;
    profile_directory: string;
  } | null;
  schedule: {
    notify_at: string;
  };
  email: {
    address: string;
  };
  x: PlatformConfig;
}

export interface SocialPost {
  platform: PlatformName;
  author: string;
  authorHandle: string | null;
  text: string;
  url: string;
  publishedAtLabel: string;
  publishedAtMs: number | null;
  isRepost: boolean;
  repostedAccount: string | null;
  hasImage: boolean;
  hasVideo: boolean;
  articleHtml?: string;
}
