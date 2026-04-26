import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KEYCHAIN_SERVICE_PREFIX = "social-daily-digest";
export const LAUNCH_AGENT_LABEL = "com.local.social-daily-digest";

export function getProjectRoot(): string {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

export function getConfigDirectory(): string {
  return path.join(getProjectRoot(), "config");
}

export function getConfigPath(): string {
  return path.join(getConfigDirectory(), "settings.yaml");
}

export function getConfigExamplePath(): string {
  return path.join(getConfigDirectory(), "settings.example.yaml");
}

export function getBrowserProfileRoot(): string {
  return path.join(getProjectRoot(), "browser_profiles");
}

export function getChromeProfilePath(): string {
  return path.join(getBrowserProfileRoot(), "chrome");
}

export function getManagedChromeProfilesRoot(): string {
  return path.join(getBrowserProfileRoot(), "managed");
}

export function getChromeUserDataDir(): string {
  return path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Google",
    "Chrome",
  );
}

export function getDataDirectory(): string {
  return path.join(getProjectRoot(), "data");
}

export function getXSnapshotsDirectory(): string {
  return path.join(getDataDirectory(), "x_snapshots");
}

export function getXSnapshotPath(reportDate: string): string {
  return path.join(getXSnapshotsDirectory(), `${reportDate}.html`);
}

export function getLogsDirectory(): string {
  return path.join(getProjectRoot(), "logs");
}

export function getReportsDirectory(): string {
  return path.join(getProjectRoot(), "reports");
}

export function getDistEntryPath(): string {
  return path.join(getProjectRoot(), "dist", "main.js");
}

export function getLaunchAgentDirectory(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

export function getLaunchAgentPlistPath(): string {
  return path.join(getLaunchAgentDirectory(), `${LAUNCH_AGENT_LABEL}.plist`);
}

export function getWrapperDirectory(): string {
  return path.join(os.homedir(), ".social-daily-digest", "bin");
}

export function getWrapperPath(): string {
  return path.join(getWrapperDirectory(), "run.sh");
}
