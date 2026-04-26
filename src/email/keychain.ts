import { CliError } from "../errors.js";
import { runCommand } from "../util/command.js";

const EMAIL_SERVICE_NAME = "social-daily-digest:email";

export async function setEmailCredential(
  accountName: string,
  password: string,
): Promise<void> {
  const result = await runCommand("security", [
    "add-generic-password",
    "-a",
    accountName,
    "-s",
    EMAIL_SERVICE_NAME,
    "-w",
    password,
    "-U",
  ]);

  if (!result.success) {
    throw new CliError("Failed to store email credential in macOS Keychain.");
  }
}

export async function deleteEmailCredential(
  accountName: string,
): Promise<boolean> {
  const result = await runCommand("security", [
    "delete-generic-password",
    "-a",
    accountName,
    "-s",
    EMAIL_SERVICE_NAME,
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

  throw new CliError("Failed to delete email credential from macOS Keychain.");
}

export async function hasEmailCredential(accountName: string): Promise<boolean> {
  const result = await runCommand("security", [
    "find-generic-password",
    "-a",
    accountName,
    "-s",
    EMAIL_SERVICE_NAME,
  ]);

  return result.success;
}

export async function getEmailCredential(accountName: string): Promise<string> {
  const result = await runCommand("security", [
    "find-generic-password",
    "-a",
    accountName,
    "-s",
    EMAIL_SERVICE_NAME,
    "-w",
  ]);

  if (!result.success) {
    throw new CliError(
      'Email is configured, but the iCloud Mail app-specific password is missing. Run "sns-digest email credentials set" and use an Apple app-specific password.',
    );
  }

  return result.stdout;
}
