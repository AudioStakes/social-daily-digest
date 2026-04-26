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
  address: ""

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
  const emailAddress = (data.email as { address?: unknown } | undefined)?.address;

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

  return {
    app: {
      timezone: timeZone.trim(),
    },
    schedule: {
      notify_at: notifyAt.trim(),
    },
    email: {
      address: typeof emailAddress === "string" ? emailAddress.trim() : "",
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
