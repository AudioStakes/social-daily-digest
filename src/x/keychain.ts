import { CliError } from "../errors.js";
import { KEYCHAIN_SERVICE_PREFIX } from "../paths.js";
import { runCommand } from "../util/command.js";

export interface XApiTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
}

const X_API_TOKEN_SERVICE = `${KEYCHAIN_SERVICE_PREFIX}:x-api-token`;

export async function saveXApiTokenRecord(
  accountName: string,
  token: XApiTokenRecord,
): Promise<void> {
  const payload = JSON.stringify(token);
  const result = await runCommand("security", [
    "add-generic-password",
    "-a",
    accountName,
    "-s",
    X_API_TOKEN_SERVICE,
    "-w",
    payload,
    "-U",
  ]);

  if (!result.success) {
    throw new CliError(
      `Failed to store X API token in macOS Keychain: ${result.stderr || result.stdout}`,
    );
  }
}

export async function getXApiTokenRecord(
  accountName: string,
): Promise<XApiTokenRecord | null> {
  const result = await runCommand("security", [
    "find-generic-password",
    "-a",
    accountName,
    "-s",
    X_API_TOKEN_SERVICE,
    "-w",
  ]);

  if (!result.success) {
    const missing = `${result.stdout}\n${result.stderr}`.includes("could not be found");
    if (missing) {
      return null;
    }

    throw new CliError(
      `Failed to read X API token from macOS Keychain: ${result.stderr || result.stdout}`,
    );
  }

  try {
    const parsed = JSON.parse(result.stdout) as Partial<XApiTokenRecord>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAtMs !== "number"
    ) {
      throw new Error("invalid shape");
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAtMs: parsed.expiresAtMs,
    };
  } catch {
    throw new CliError("Unexpected X API response.");
  }
}

export async function deleteXApiTokenRecord(accountName: string): Promise<boolean> {
  const result = await runCommand("security", [
    "delete-generic-password",
    "-a",
    accountName,
    "-s",
    X_API_TOKEN_SERVICE,
  ]);

  if (result.success) {
    return true;
  }

  const missing = `${result.stdout}\n${result.stderr}`.includes("could not be found");
  if (missing) {
    return false;
  }

  throw new CliError(
    `Failed to delete X API token from macOS Keychain: ${result.stderr || result.stdout}`,
  );
}
