import { readFile } from "node:fs/promises";
import YAML from "yaml";

import { CliError } from "../errors.js";
import {
  getBrowserProfileRoot,
  getChromeProfilePath,
  getConfigDirectory,
  getConfigExamplePath,
  getConfigPath,
  getDataDirectory,
  getLogsDirectory,
  getReportsDirectory,
} from "../paths.js";
import type { AppSettings, PlatformName } from "../types.js";
import { ensureDirectory, pathExists, writeTextFile } from "../util/files.js";
import { assertValidDailyTime, assertValidTimeZone } from "../util/time.js";

const DEFAULT_SETTINGS = `app:
  timezone: Asia/Tokyo

schedule:
  notify_at: "08:00"

email:
  enabled: false
  host: "smtp.gmail.com"
  port: 587
  secure: false
  from: ""
  to: ""
  username: ""

x:
  account_name: ""

facebook:
  account_name: ""
`;

function normalizePlatformConfig(value: unknown): { account_name: string } {
  if (!value || typeof value !== "object") {
    return { account_name: "" };
  }

  const accountName = (value as { account_name?: unknown }).account_name;
  return {
    account_name: typeof accountName === "string" ? accountName.trim() : "",
  };
}

function validateSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    throw new CliError("config/settings.yaml must contain a YAML object.");
  }

  const data = value as Record<string, unknown>;
  const timeZone = (data.app as { timezone?: unknown } | undefined)?.timezone;
  const notifyAt = (data.schedule as { notify_at?: unknown } | undefined)
    ?.notify_at;
  const emailData = data.email as
    | {
        enabled?: unknown;
        host?: unknown;
        port?: unknown;
        secure?: unknown;
        from?: unknown;
        to?: unknown;
        username?: unknown;
      }
    | undefined;

  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new CliError("app.timezone is required in config/settings.yaml.");
  }

  if (typeof notifyAt !== "string" || notifyAt.trim() === "") {
    throw new CliError(
      "schedule.notify_at is required in config/settings.yaml.",
    );
  }

  assertValidTimeZone(timeZone.trim());
  assertValidDailyTime(notifyAt.trim());

  const emailEnabled = emailData?.enabled;
  const emailHost = emailData?.host;
  const emailPort = emailData?.port;
  const emailSecure = emailData?.secure;
  const emailFrom = emailData?.from;
  const emailTo = emailData?.to;
  const emailUsername = emailData?.username;

  return {
    app: {
      timezone: timeZone.trim(),
    },
    schedule: {
      notify_at: notifyAt.trim(),
    },
    email: {
      enabled: typeof emailEnabled === "boolean" ? emailEnabled : false,
      host: typeof emailHost === "string" ? emailHost.trim() : "",
      port:
        typeof emailPort === "number" && Number.isInteger(emailPort)
          ? emailPort
          : 0,
      secure: typeof emailSecure === "boolean" ? emailSecure : false,
      from: typeof emailFrom === "string" ? emailFrom.trim() : "",
      to: typeof emailTo === "string" ? emailTo.trim() : "",
      username:
        typeof emailUsername === "string" ? emailUsername.trim() : "",
    },
    x: normalizePlatformConfig(data.x),
    facebook: normalizePlatformConfig(data.facebook),
  };
}

export async function ensureRuntimeDirectories(): Promise<void> {
  await ensureDirectory(getConfigDirectory());
  await ensureDirectory(getBrowserProfileRoot());
  await ensureDirectory(getChromeProfilePath());
  await ensureDirectory(getDataDirectory());
  await ensureDirectory(getLogsDirectory());
  await ensureDirectory(getReportsDirectory());
}

export async function initializeWorkspace(): Promise<{
  createdConfig: boolean;
}> {
  await ensureRuntimeDirectories();

  const configExists = await pathExists(getConfigPath());
  if (!configExists) {
    await writeTextFile(getConfigPath(), DEFAULT_SETTINGS);
  }

  if (!(await pathExists(getConfigExamplePath()))) {
    await writeTextFile(getConfigExamplePath(), DEFAULT_SETTINGS);
  }

  return {
    createdConfig: !configExists,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  if (!(await pathExists(getConfigPath()))) {
    throw new CliError(
      `Missing ${getConfigPath()}. Run "sns-digest init" first.`,
    );
  }

  const raw = await readFile(getConfigPath(), "utf8");
  const parsed = YAML.parse(raw);
  return validateSettings(parsed);
}

export function getConfiguredPlatforms(settings: AppSettings): PlatformName[] {
  const platforms: PlatformName[] = [];

  if (settings.x.account_name !== "") {
    platforms.push("x");
  }

  if (settings.facebook.account_name !== "") {
    platforms.push("facebook");
  }

  return platforms;
}

export function getAccountName(
  settings: AppSettings,
  platform: PlatformName,
): string {
  return settings[platform].account_name;
}
