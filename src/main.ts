#!/usr/bin/env node

import path from "node:path";

import {
  deleteCredential,
  hasCredential,
  setCredential,
} from "./auth/keychain.js";
import {
  ensureRuntimeDirectories,
  getAccountName,
  initializeWorkspace,
  loadSettings,
} from "./config/settings.js";
import { fetchAndSaveXFeedSnapshot, loadXFeedSnapshotFromDisk } from "./crawler/x.js";
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
import { writeMarkdownReport } from "./report/markdown.js";
import { getScheduleStatus, installSchedule, uninstallSchedule } from "./schedule/launchd.js";
import type { PlatformName } from "./types.js";
import { formatDateInTimeZone } from "./util/time.js";
import {
  getValidXAccessToken,
  runXAuthLogin,
  runXAuthLogout,
  runXAuthStatus,
} from "./x/auth.js";

function printUsage(): void {
  console.log(`sns-digest

Commands:
  sns-digest init
  sns-digest credentials set x
  sns-digest credentials show
  sns-digest credentials delete x
  sns-digest x auth login
  sns-digest x auth status
  sns-digest x auth logout
  sns-digest email credentials set
  sns-digest email credentials show
  sns-digest email credentials delete
  sns-digest email test
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
  console.log(
    result.createdConfig
      ? "Initialized config/settings.yaml and local directories."
      : "Local directories are ready. config/settings.yaml already exists.",
  );
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
    `${platform} credential stored in macOS Keychain (optional; X API authentication uses \"sns-digest x auth login\").`,
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

  console.log("Checking x via X API...");
  const accessToken = await getValidXAccessToken(settings);
  const posts = await fetchAndSaveXFeedSnapshot(accessToken, reportDate, cutoffMs);
  console.log(`Collected ${posts.length} x posts.`);

  const reportPath = await writeMarkdownReport(settings, posts, now);
  console.log(`Report written to ${reportPath}`);

  if (isEmailEnabled(settings)) {
    const reportDateFromPath = path.basename(reportPath, ".md");
    await sendDigestReportEmail(settings, reportPath, reportDateFromPath);
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
    case "x":
      if (subcommand === "auth") {
        const settings = await loadSettings();
        if (third === "login") {
          await runXAuthLogin(settings);
          return;
        }
        if (third === "status") {
          await runXAuthStatus(settings);
          return;
        }
        if (third === "logout") {
          await runXAuthLogout(settings);
          return;
        }
      }
      break;
    case "run":
      await runCrawler();
      return;
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
