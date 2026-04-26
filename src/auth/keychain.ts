import { CliError } from "../errors.js";
import { KEYCHAIN_SERVICE_PREFIX } from "../paths.js";
import type { PlatformName } from "../types.js";
import { runCommand } from "../util/command.js";

function getServiceName(platform: PlatformName): string {
  return `${KEYCHAIN_SERVICE_PREFIX}:${platform}`;
}

export async function setCredential(
  platform: PlatformName,
  accountName: string,
  password: string,
): Promise<void> {
  const result = await runCommand("security", [
    "add-generic-password",
    "-a",
    accountName,
    "-s",
    getServiceName(platform),
    "-w",
    password,
    "-U",
  ]);

  if (!result.success) {
    throw new CliError(
      `Failed to store ${platform} credential in macOS Keychain: ${result.stderr || result.stdout}`,
    );
  }
}

export async function deleteCredential(
  platform: PlatformName,
  accountName: string,
): Promise<boolean> {
  const result = await runCommand("security", [
    "delete-generic-password",
    "-a",
    accountName,
    "-s",
    getServiceName(platform),
  ]);

  if (result.success) {
    return true;
  }

  const missing = `${result.stdout}\n${result.stderr}`.includes(
    "could not be found",
  );
  if (missing) {
    return false;
  }

  throw new CliError(
    `Failed to delete ${platform} credential from macOS Keychain: ${result.stderr || result.stdout}`,
  );
}

export async function hasCredential(
  platform: PlatformName,
  accountName: string,
): Promise<boolean> {
  const result = await runCommand("security", [
    "find-generic-password",
    "-a",
    accountName,
    "-s",
    getServiceName(platform),
  ]);

  return result.success;
}

export async function getCredential(
  platform: PlatformName,
  accountName: string,
): Promise<string> {
  const result = await runCommand("security", [
    "find-generic-password",
    "-a",
    accountName,
    "-s",
    getServiceName(platform),
    "-w",
  ]);

  if (!result.success) {
    throw new CliError(
      `Missing ${platform} credential for "${accountName}". Run "sns-digest credentials set ${platform}".`,
    );
  }

  return result.stdout;
}
