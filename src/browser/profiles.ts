import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

import { CliError } from "../errors.js";
import { getChromeUserDataDir, getConfigPath } from "../paths.js";
import type { AppSettings } from "../types.js";
import { pathExists, writeTextFile } from "../util/files.js";

const DEDICATED_PROFILE_LABEL = "Create/use dedicated social-daily-digest profile";

export interface ChromeProfileOption {
  profileDirectory: string;
  displayName: string;
}

export interface BrowserLaunchConfig {
  userDataDir: string;
  profileDirectory: string | null;
  usingDedicatedProfile: boolean;
}

function compareProfileOptions(a: ChromeProfileOption, b: ChromeProfileOption): number {
  if (a.profileDirectory === "Default") {
    return -1;
  }

  if (b.profileDirectory === "Default") {
    return 1;
  }

  return a.profileDirectory.localeCompare(b.profileDirectory, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function resolveDisplayNames(
  userDataDir: string,
): Promise<Map<string, string>> {
  const localStatePath = path.join(userDataDir, "Local State");
  if (!(await pathExists(localStatePath))) {
    return new Map();
  }

  try {
    const localStateRaw = await readFile(localStatePath, "utf8");
    const parsed = JSON.parse(localStateRaw) as {
      profile?: {
        info_cache?: Record<string, { name?: unknown }>;
      };
    };

    const infoCache = parsed.profile?.info_cache ?? {};
    const names = new Map<string, string>();

    for (const [directory, value] of Object.entries(infoCache)) {
      const profileName = value?.name;
      if (typeof profileName === "string" && profileName.trim() !== "") {
        names.set(directory, profileName.trim());
      }
    }

    return names;
  } catch {
    return new Map();
  }
}

export async function discoverChromeProfiles(
  userDataDir = getChromeUserDataDir(),
): Promise<ChromeProfileOption[]> {
  if (!(await pathExists(userDataDir))) {
    return [];
  }

  const entries = await readdir(userDataDir, { withFileTypes: true });
  const displayNames = await resolveDisplayNames(userDataDir);
  const candidates = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (entry.name === "Default" || /^Profile\s+\d+$/.test(entry.name)),
    )
    .map((entry) => ({
      profileDirectory: entry.name,
      displayName: displayNames.get(entry.name) ?? entry.name,
    }))
    .sort(compareProfileOptions);

  return candidates;
}

export function getDedicatedProfileLabel(): string {
  return DEDICATED_PROFILE_LABEL;
}

export function resolveBrowserLaunchConfig(
  settings: AppSettings,
  dedicatedProfilePath: string,
): BrowserLaunchConfig {
  if (!settings.browser) {
    return {
      userDataDir: dedicatedProfilePath,
      profileDirectory: null,
      usingDedicatedProfile: true,
    };
  }

  return {
    userDataDir: settings.browser.user_data_dir,
    profileDirectory: settings.browser.profile_directory,
    usingDedicatedProfile: false,
  };
}

export async function assertConfiguredProfileExists(settings: AppSettings): Promise<void> {
  if (!settings.browser) {
    return;
  }

  const targetProfile = path.join(
    settings.browser.user_data_dir,
    settings.browser.profile_directory,
  );

  if (!(await pathExists(targetProfile))) {
    throw new CliError(
      `Configured Chrome profile directory was not found: ${targetProfile}. Run "sns-digest init" again or update config/settings.yaml.`,
    );
  }

  const metadata = await stat(targetProfile);
  if (!metadata.isDirectory()) {
    throw new CliError(
      `Configured Chrome profile path is not a directory: ${targetProfile}. Run "sns-digest init" again or update config/settings.yaml.`,
    );
  }
}

export async function saveBrowserProfileSelection(
  profileDirectory: string | null,
): Promise<void> {
  const configPath = getConfigPath();
  const raw = await readFile(configPath, "utf8");
  const parsed = (YAML.parse(raw) ?? {}) as Record<string, unknown>;

  if (!profileDirectory) {
    delete parsed.browser;
  } else {
    parsed.browser = {
      user_data_dir: getChromeUserDataDir(),
      profile_directory: profileDirectory,
    };
  }

  await writeTextFile(configPath, YAML.stringify(parsed));
}
