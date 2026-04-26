import { access } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright-core";

import { CliError } from "../errors.js";

const DEFAULT_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
  const args = ["--start-maximized"];

  if (profileDirectory) {
    args.push(`--profile-directory=${profileDirectory}`);
  }

  try {
    return await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      viewport: {
        width: 1440,
        height: 900,
      },
      args,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /singleton|profile|in use|already running|lock/i.test(error.message)
    ) {
      throw new CliError(
        "The selected Chrome profile appears to be in use. Close Google Chrome and try again, or choose the dedicated social-daily-digest profile.",
      );
    }

    throw error;
  }
}
