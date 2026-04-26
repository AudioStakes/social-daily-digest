import { readFile } from "node:fs/promises";

import { CliError } from "../errors.js";
import type { AppSettings } from "../types.js";
import { getEmailCredential } from "./keychain.js";

const ICLOUD_SMTP_HOST = "smtp.mail.me.com";
const ICLOUD_SMTP_PORT = 587;

export function resolveEmailAddress(settings: AppSettings): string {
  return settings.email.address.trim();
}

export function isEmailEnabled(settings: AppSettings): boolean {
  return resolveEmailAddress(settings) !== "";
}

function getConfiguredAddressOrThrow(settings: AppSettings): string {
  const address = resolveEmailAddress(settings);
  if (address === "") {
    throw new CliError("config/settings.yaml is missing email.address.");
  }

  return address;
}

async function sendIcloudMail(params: {
  address: string;
  subject: string;
  body: string;
  errorMessage: string;
}): Promise<void> {
  const nodemailerModule = await import("nodemailer");
  const nodemailer = nodemailerModule.default;
  const password = await getEmailCredential(params.address);

  const transporter = nodemailer.createTransport({
    host: ICLOUD_SMTP_HOST,
    port: ICLOUD_SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: {
      user: params.address,
      pass: password,
    },
  });

  try {
    await transporter.sendMail({
      from: params.address,
      to: params.address,
      subject: params.subject,
      text: params.body,
    });
  } catch {
    throw new CliError(params.errorMessage);
  }
}

export async function sendDigestReportEmail(
  settings: AppSettings,
  reportPath: string,
  dateText: string,
): Promise<void> {
  const address = getConfiguredAddressOrThrow(settings);
  const reportBody = await readFile(reportPath, "utf8");

  await sendIcloudMail({
    address,
    subject: `[Social Daily Digest] ${dateText}`,
    body: reportBody,
    errorMessage: "Failed to send digest email via iCloud Mail SMTP.",
  });
}

export async function sendTestEmail(settings: AppSettings): Promise<void> {
  const address = getConfiguredAddressOrThrow(settings);

  await sendIcloudMail({
    address,
    subject: "[Social Daily Digest] Test",
    body: "This is a test email from social-daily-digest.",
    errorMessage: "Failed to send test email via iCloud Mail SMTP.",
  });
}
