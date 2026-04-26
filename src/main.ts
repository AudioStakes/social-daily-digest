#!/usr/bin/env node

import path from "node:path";
import readline from "node:readline/promises";

import type { BrowserContext, Page } from "playwright-core";

import {
  deleteCredential,
  hasCredential,
  setCredential,
} from "./auth/keychain.js";
import { launchChrome } from "./browser/chrome.js";
import {
  assertConfiguredProfileExists,
  discoverChromeProfiles,
  getDedicatedProfileLabel,
  resolveBrowserLaunchConfig,
  saveBrowserProfileSelection,
} from "./browser/profiles.js";
import {
  ensureRuntimeDirectories,
  getAccountName,
  initializeWorkspace,
  loadSettings,
} from "./config/settings.js";
import { crawlXFeed, loadXFeedSnapshotFromDisk } from "./crawler/x.js";
import {
  deleteEmailCredential,
  hasEmailCredential,
  setEmailCredential,
} from "./email/keychain.js";
import {
  isEmailEnabled,
  resolveEmailAddress,
  sendDigestReportEmail,
  sendTestEmail,
} from "./email/smtp.js";
import { CliError, ManualActionRequiredError } from "./errors.js";
import { promptHidden } from "./macos/prompt.js";
import { getChromeProfilePath, getChromeUserDataDir } from "./paths.js";
import { writeMarkdownReport } from "./report/markdown.js";
import { getScheduleStatus, installSchedule, uninstallSchedule } from "./schedule/launchd.js";
import type { PlatformName, SocialPost } from "./types.js";
import { formatDateInTimeZone } from "./util/time.js";

function printUsage(): void {
  console.log(`sns-digest

Commands:
  sns-digest init
  sns-digest credentials set x
  sns-digest credentials show
  sns-digest credentials delete x
  sns-digest email credentials set
  sns-digest email credentials show
  sns-digest email credentials delete
  sns-digest email test
  sns-digest browser profiles
  sns-digest run
  sns-digest schedule install
  sns-digest schedule uninstall
  sns-digest schedule show
`);
}

function parsePlatform(value: string | undefined): PlatformName {
  if (value === "x") {
    return value;
  }

  throw new CliError(`Unknown platform "${value ?? ""}". Use "x".`);
}

async function runInit(): Promise<void> {
  const result = await initializeWorkspace();
  const profiles = await discoverChromeProfiles();
  const dedicatedOptionLabel = getDedicatedProfileLabel();
  const options = [
    ...profiles.map((profile) => profile.profileDirectory),
    dedicatedOptionLabel,
  ];

  console.log("Available Chrome profiles:");
  console.log("");
  profiles.forEach((profile, index) => {
    const label =
      profile.displayName === profile.profileDirectory
        ? profile.profileDirectory
        : `${profile.displayName} (${profile.profileDirectory})`;
    console.log(`${index + 1}. ${label}`);
  });
  console.log(`${options.length}. ${dedicatedOptionLabel}`);
  console.log("");

  let selected = 1;
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl.question(
      "? Which Chrome profile should social-daily-digest use? [1]: ",
    );
    rl.close();

    const normalized = answer.trim();
    if (normalized !== "") {
      const parsed = Number(normalized);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > options.length) {
        throw new CliError(`Invalid profile selection "${normalized}".`);
      }

      selected = parsed;
    }
  } else {
    console.log("TTY not available. Defaulting to option 1.");
  }

  const selectedOption = options[selected - 1];
  const selectedProfileDirectory =
    selectedOption === dedicatedOptionLabel ? null : selectedOption;
  await saveBrowserProfileSelection(selectedProfileDirectory);

  console.log(
    result.createdConfig
      ? "Initialized config/settings.yaml and local directories."
      : "Local directories are ready. config/settings.yaml already exists.",
  );
  if (selectedProfileDirectory) {
    console.log(
      `Configured Chrome profile: ${selectedProfileDirectory} (${getChromeUserDataDir()})`,
    );
  } else {
    console.log("Configured dedicated Chrome profile: browser_profiles/chrome");
  }
}

async function runBrowserProfiles(): Promise<void> {
  const profiles = await discoverChromeProfiles();
  console.log("Available Chrome profiles:");

  if (profiles.length === 0) {
    console.log("- (none detected)");
    return;
  }

  for (const profile of profiles) {
    const label =
      profile.displayName === profile.profileDirectory
        ? profile.profileDirectory
        : `${profile.displayName} (${profile.profileDirectory})`;
    console.log(`- ${label}`);
  }
}

async function runCredentialSet(platform: PlatformName): Promise<void> {
  const settings = await loadSettings();
  const accountName = getAccountName(settings, platform);

  if (accountName === "") {
    throw new CliError(
      `config/settings.yaml is missing ${platform}.account_name. Set it before storing credentials.`,
    );
  }

  const password = await promptHidden(`${platform} password: `);
  if (password.trim() === "") {
    throw new CliError("Password cannot be empty.");
  }

  await setCredential(platform, accountName, password);
  console.log(
    `${platform} credential stored in macOS Keychain (optional; crawler uses manual login in Chrome).`,
  );
}

async function runCredentialShow(): Promise<void> {
  const settings = await loadSettings();
  const xConfigured =
    settings.x.account_name !== "" &&
    (await hasCredential("x", settings.x.account_name));

  console.log(`X: ${xConfigured ? "configured" : "not configured"}`);
}

async function runCredentialDelete(platform: PlatformName): Promise<void> {
  const settings = await loadSettings();
  const accountName = getAccountName(settings, platform);

  if (accountName === "") {
    throw new CliError(
      `config/settings.yaml is missing ${platform}.account_name, so there is no keychain account to delete.`,
    );
  }

  const deleted = await deleteCredential(platform, accountName);
  console.log(
    deleted
      ? `${platform} credential deleted from macOS Keychain.`
      : `${platform} credential was not present in macOS Keychain.`,
  );
}

async function runEmailCredentialSet(): Promise<void> {
  const settings = await loadSettings();
  const accountName = resolveEmailAddress(settings);
  if (accountName === "") {
    throw new CliError(
      "config/settings.yaml is missing email.address. Set it before storing email credentials.",
    );
  }

  const password = await promptHidden("iCloud Mail app-specific password: ");
  if (password.trim() === "") {
    throw new CliError("Password cannot be empty.");
  }

  await setEmailCredential(accountName, password);
  console.log("Email credential stored in macOS Keychain.");
}

async function runEmailCredentialShow(): Promise<void> {
  const settings = await loadSettings();
  const accountName = resolveEmailAddress(settings);

  if (accountName === "") {
    console.log("Email: not configured");
    return;
  }

  const configured = await hasEmailCredential(accountName);
  console.log(`Email: ${configured ? "configured" : "not configured"}`);
}

async function runEmailCredentialDelete(): Promise<void> {
  const settings = await loadSettings();
  const accountName = resolveEmailAddress(settings);
  if (accountName === "") {
    throw new CliError(
      "config/settings.yaml is missing email.address. Set it before deleting email credentials.",
    );
  }

  const deleted = await deleteEmailCredential(accountName);
  console.log(
    deleted
      ? "Email credential deleted from macOS Keychain."
      : "Email credential was not present in macOS Keychain.",
  );
}

async function runEmailTest(): Promise<void> {
  const settings = await loadSettings();
  await sendTestEmail(settings);
  console.log("Test email sent.");
}

async function runCrawler(): Promise<void> {
  await ensureRuntimeDirectories();
  const settings = await loadSettings();

  if (settings.x.account_name === "") {
    throw new CliError(
      'X is not configured. Set "x.account_name" in config/settings.yaml.',
    );
  }

  const now = new Date();
  const reportDate = formatDateInTimeZone(now, settings.app.timezone);
  const cutoffMs = now.getTime() - 24 * 60 * 60 * 1_000;
  const savedPosts = await loadXFeedSnapshotFromDisk(reportDate, cutoffMs);
  if (savedPosts) {
    console.log(`Using saved X snapshot: ${reportDate}`);
    console.log(`Collected ${savedPosts.length} x posts.`);

    const reportPath = await writeMarkdownReport(settings, savedPosts, now);
    console.log(`Report written to ${reportPath}`);

    if (isEmailEnabled(settings)) {
      const reportDateFromPath = path.basename(reportPath, ".md");
      await sendDigestReportEmail(settings, reportPath, reportDateFromPath);
      console.log("Digest email sent.");
    }
    return;
  }

  const posts: SocialPost[] = [];
  let context: BrowserContext | null = null;

  try {
    const launchConfig = resolveBrowserLaunchConfig(settings, getChromeProfilePath());
    if (launchConfig.usingDedicatedProfile) {
      console.log("Using dedicated Chrome profile: browser_profiles/chrome");
    } else {
      await assertConfiguredProfileExists(settings);
      console.log(`Using Chrome profile: ${launchConfig.profileDirectory}`);
      console.log(
        "Using a persistent social-daily-digest mirror of the selected Chrome profile.",
      );
    }

    context = await launchChrome(
      launchConfig.userDataDir,
      launchConfig.profileDirectory,
    );

    const page: Page = await context.newPage();
    try {
      console.log("Checking x...");
      const xPosts = await crawlXFeed(page, cutoffMs);
      console.log(`Collected ${xPosts.length} x posts.`);
      posts.push(...xPosts);
    } finally {
      await page.close();
    }
  } finally {
    if (context) {
      await context.close();
    }
  }

  const reportPath = await writeMarkdownReport(settings, posts, now);
  console.log(`Report written to ${reportPath}`);

  if (isEmailEnabled(settings)) {
    const reportDate = path.basename(reportPath, ".md");
    await sendDigestReportEmail(settings, reportPath, reportDate);
    console.log("Digest email sent.");
  }
}

async function runScheduleInstall(): Promise<void> {
  const settings = await loadSettings();
  await installSchedule(settings);
  console.log("LaunchAgent installed.");
}

async function runScheduleUninstall(): Promise<void> {
  await uninstallSchedule();
  console.log("LaunchAgent removed.");
}

async function runScheduleShow(): Promise<void> {
  const settings = await loadSettings();
  const status = await getScheduleStatus(settings);
  console.log(`Daily crawl time: ${status.timeText}`);
  console.log(`LaunchAgent: ${status.installed ? "installed" : "not installed"}`);
  console.log("Label: com.local.social-daily-digest");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, subcommand, third] = args;

  switch (command) {
    case undefined:
    case "--help":
    case "-h":
      printUsage();
      return;
    case "init":
      await runInit();
      return;
    case "credentials":
      if (subcommand === "show") {
        await runCredentialShow();
        return;
      }

      if (subcommand === "set") {
        await runCredentialSet(parsePlatform(third));
        return;
      }

      if (subcommand === "delete") {
        await runCredentialDelete(parsePlatform(third));
        return;
      }

      break;
    case "run":
      await runCrawler();
      return;
    case "browser":
      if (subcommand === "profiles") {
        await runBrowserProfiles();
        return;
      }
      break;
    case "email":
      if (subcommand === "credentials") {
        if (third === "set") {
          await runEmailCredentialSet();
          return;
        }
        if (third === "show") {
          await runEmailCredentialShow();
          return;
        }
        if (third === "delete") {
          await runEmailCredentialDelete();
          return;
        }
      }
      if (subcommand === "test") {
        await runEmailTest();
        return;
      }
      break;
    case "schedule":
      if (subcommand === "install") {
        await runScheduleInstall();
        return;
      }

      if (subcommand === "uninstall") {
        await runScheduleUninstall();
        return;
      }

      if (subcommand === "show") {
        await runScheduleShow();
        return;
      }

      break;
    default:
      break;
  }

  throw new CliError("Unknown command. Run \"sns-digest --help\" for usage.");
}

main().catch((error: unknown) => {
  if (error instanceof CliError || error instanceof ManualActionRequiredError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
