export type PlatformName = "x" | "facebook";

export interface PlatformConfig {
  account_name: string;
}

export interface AppSettings {
  app: {
    timezone: string;
  };
  schedule: {
    notify_at: string;
  };
  x: PlatformConfig;
  facebook: PlatformConfig;
}

export interface SocialPost {
  platform: PlatformName;
  author: string;
  text: string;
  url: string;
  publishedAtLabel: string;
  publishedAtMs: number | null;
}
