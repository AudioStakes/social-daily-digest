import { cp, access, mkdir, rm } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";

import { CliError } from "../errors.js";
import { getManagedChromeProfilesRoot } from "../paths.js";
import { runCommand } from "../util/command.js";

const DEFAULT_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOCK_FILE_NAMES = new Set([
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  "lockfile",
]);

function shouldSkipSnapshotEntry(entryPath: string): boolean {
  const baseName = path.basename(entryPath);
  return LOCK_FILE_NAMES.has(baseName);
}

function getManagedProfileMirrorRoot(profileDirectory: string): string {
  const profileHash = crypto
    .createHash("sha256")
    .update(profileDirectory)
    .digest("hex")
    .slice(0, 12);
  return path.join(getManagedChromeProfilesRoot(), `${profileDirectory}-${profileHash}`);
}

async function ensureManagedChromeProfile(
  sourceUserDataDir: string,
  profileDirectory: string,
): Promise<string> {
  const managedRoot = getManagedProfileMirrorRoot(profileDirectory);
  const markerPath = path.join(managedRoot, profileDirectory);

  await mkdir(getManagedChromeProfilesRoot(), { recursive: true });
  if (await access(markerPath).then(() => true).catch(() => false)) {
    return managedRoot;
  }

  await rm(managedRoot, { recursive: true, force: true });
  await mkdir(managedRoot, { recursive: true });
  await cp(sourceUserDataDir, managedRoot, {
    recursive: true,
    force: true,
    filter: (entryPath) => !shouldSkipSnapshotEntry(entryPath),
  });

  return managedRoot;
}

async function closeManagedChromeProcesses(managedRoot: string): Promise<void> {
  const lookup = await runCommand("pgrep", ["-fal", managedRoot]);
  if (!lookup.success || lookup.stdout === "") {
    return;
  }

  const result = await runCommand("pkill", ["-f", managedRoot]);
  if (!result.success) {
    throw new CliError(
      `Failed to close an existing sns-digest Chrome process for ${managedRoot}.`,
    );
  }
}

export async function getChromeExecutablePath(): Promise<string> {
  const configured = process.env.SNS_DIGEST_CHROME_PATH || DEFAULT_CHROME_PATH;

  try {
    await access(configured);
    return configured;
  } catch {
    throw new CliError(
      `Google Chrome was not found at ${configured}. Install Google Chrome or set SNS_DIGEST_CHROME_PATH.`,
    );
  }
}

export async function launchChrome(
  userDataDir: string,
  profileDirectory: string | null,
): Promise<BrowserContext> {
  const executablePath = await getChromeExecutablePath();
  const args = [
    "--start-maximized",
    "--disable-blink-features=AutomationControlled",
  ];
  const usingManagedMirror = profileDirectory !== null;
  const runtimeUserDataDir = usingManagedMirror
    ? await ensureManagedChromeProfile(userDataDir, profileDirectory)
    : userDataDir;

  if (usingManagedMirror) {
    await closeManagedChromeProcesses(runtimeUserDataDir);
  }

  if (profileDirectory) {
    args.push(`--profile-directory=${profileDirectory}`);
  }

  try {
    const context = await chromium.launchPersistentContext(runtimeUserDataDir, {
      executablePath,
      headless: false,
      ignoreDefaultArgs: ["--enable-automation"],
      viewport: {
        width: 1440,
        height: 900,
      },
      args,
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        configurable: true,
        get: () => undefined,
      });
    });

    return context;
  } catch (error) {
    if (
      error instanceof Error &&
      /singleton|profile|in use|already running|lock/i.test(error.message)
    ) {
      throw new CliError(
        "The selected Chrome profile mirror could not be opened.",
      );
    }

    throw error;
  }
}
