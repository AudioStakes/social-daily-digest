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
  profilePath: string,
): Promise<BrowserContext> {
  const executablePath = await getChromeExecutablePath();

  return await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: false,
    viewport: {
      width: 1440,
      height: 900,
    },
    args: ["--start-maximized"],
  });
}
