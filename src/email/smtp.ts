import { readFile } from "node:fs/promises";

import { CliError } from "../errors.js";
import type { AppSettings } from "../types.js";
import { getEmailCredential } from "./keychain.js";

interface ResolvedEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  to: string;
  username: string;
}

export function resolveEmailAccountName(settings: AppSettings): string {
  return settings.email.username || settings.email.from;
}

function resolveEmailConfig(settings: AppSettings): ResolvedEmailConfig {
  const accountName = resolveEmailAccountName(settings);
  if (settings.email.host === "") {
    throw new CliError('email.host is required when email.enabled is true.');
  }
  if (settings.email.port <= 0) {
    throw new CliError('email.port is required when email.enabled is true.');
  }
  if (settings.email.to === "") {
    throw new CliError('email.to is required when email.enabled is true.');
  }
  if (settings.email.from === "") {
    throw new CliError(
      'email.from is required when email.enabled is true in this version.',
    );
  }
  if (accountName === "") {
    throw new CliError(
      'email.username or email.from is required when email.enabled is true.',
    );
  }

  return {
    host: settings.email.host,
    port: settings.email.port,
    secure: settings.email.secure,
    from: settings.email.from,
    to: settings.email.to,
    username: accountName,
  };
}

export async function sendDigestReportEmail(
  settings: AppSettings,
  reportPath: string,
  dateText: string,
): Promise<void> {
  const nodemailerModule = await import("nodemailer");
  const nodemailer = nodemailerModule.default;
  const config = resolveEmailConfig(settings);
  const password = await getEmailCredential(config.username);
  const reportBody = await readFile(reportPath, "utf8");

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: password,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject: `[Social Daily Digest] ${dateText}`,
      text: reportBody,
    });
  } catch {
    throw new CliError("Failed to send digest email via SMTP.");
  }
}

export async function sendTestEmail(settings: AppSettings): Promise<void> {
  const nodemailerModule = await import("nodemailer");
  const nodemailer = nodemailerModule.default;
  const config = resolveEmailConfig(settings);
  const password = await getEmailCredential(config.username);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: password,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject: "[Social Daily Digest] Test",
      text: "This is a test email from sns-digest.",
    });
  } catch {
    throw new CliError("Failed to send test email via SMTP.");
  }
}
