import { rm } from "node:fs/promises";

import { CliError } from "../errors.js";
import {
  LAUNCH_AGENT_LABEL,
  getDistEntryPath,
  getLaunchAgentDirectory,
  getLaunchAgentPlistPath,
  getLogsDirectory,
  getProjectRoot,
  getWrapperDirectory,
  getWrapperPath,
} from "../paths.js";
import type { AppSettings } from "../types.js";
import {
  chmodExecutable,
  ensureDirectory,
  pathExists,
  writeTextFile,
} from "../util/files.js";
import { runCommand } from "../util/command.js";

function escapeShellSingleQuotes(value: string): string {
  return value.replaceAll("'", "'\\''");
}

function buildWrapperScript(): string {
  const projectRoot = getProjectRoot();
  const distEntryPath = getDistEntryPath();
  const logPath = `${getLogsDirectory()}/launchd.log`;

  return `#!/bin/zsh
set -euo pipefail
cd '${escapeShellSingleQuotes(projectRoot)}'
mkdir -p '${escapeShellSingleQuotes(getLogsDirectory())}'
exec '${escapeShellSingleQuotes(process.execPath)}' '${escapeShellSingleQuotes(distEntryPath)}' run >> '${escapeShellSingleQuotes(logPath)}' 2>&1
`;
}

function buildPlist(settings: AppSettings): string {
  const [hourText, minuteText] = settings.schedule.notify_at.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${getWrapperPath()}</string>
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${getLogsDirectory()}/launchd.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${getLogsDirectory()}/launchd.stderr.log</string>
  <key>WorkingDirectory</key>
  <string>${getProjectRoot()}</string>
</dict>
</plist>
`;
}

async function unloadLaunchAgent(): Promise<void> {
  const plistPath = getLaunchAgentPlistPath();
  if (!(await pathExists(plistPath))) {
    return;
  }

  await runCommand("launchctl", ["unload", plistPath]);
}

export async function installSchedule(settings: AppSettings): Promise<void> {
  await ensureDirectory(getWrapperDirectory());
  await ensureDirectory(getLaunchAgentDirectory());
  await ensureDirectory(getLogsDirectory());

  await writeTextFile(getWrapperPath(), buildWrapperScript());
  await chmodExecutable(getWrapperPath());
  await writeTextFile(getLaunchAgentPlistPath(), buildPlist(settings));

  await unloadLaunchAgent();
  const loadResult = await runCommand("launchctl", ["load", getLaunchAgentPlistPath()]);
  if (!loadResult.success) {
    throw new CliError(
      `Failed to install launchd job: ${loadResult.stderr || loadResult.stdout}`,
    );
  }
}

export async function uninstallSchedule(): Promise<void> {
  await unloadLaunchAgent();

  if (await pathExists(getLaunchAgentPlistPath())) {
    await rm(getLaunchAgentPlistPath(), { force: true });
  }

  if (await pathExists(getWrapperPath())) {
    await rm(getWrapperPath(), { force: true });
  }
}

export async function getScheduleStatus(settings: AppSettings): Promise<{
  installed: boolean;
  timeText: string;
}> {
  const listResult = await runCommand("launchctl", ["list", LAUNCH_AGENT_LABEL]);
  const plistExists = await pathExists(getLaunchAgentPlistPath());

  return {
    installed: plistExists || listResult.success,
    timeText: `${settings.schedule.notify_at} ${settings.app.timezone}`,
  };
}
