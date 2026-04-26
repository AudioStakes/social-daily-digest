export type PlatformName = "x" | "facebook";

export interface PlatformConfig {
  account_name: string;
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
