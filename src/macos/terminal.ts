import { CliError } from "../errors.js";
import { runCommand } from "../util/command.js";

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export async function showCompletionDialog(): Promise<boolean> {
  const result = await runCommand("osascript", [
    "-e",
    'button returned of (display dialog "Your daily social report is ready. Would you like to view it?" buttons {"Close", "View"} default button "View")',
  ]);

  if (!result.success) {
    throw new CliError(
      `Failed to show macOS dialog: ${result.stderr || result.stdout}`,
    );
  }

  return result.stdout === "View";
}

export async function showManualActionDialog(platformLabel: string): Promise<void> {
  await runCommand("osascript", [
    "-e",
    `display dialog "Manual verification is required for ${platformLabel}. Complete it in Google Chrome, then rerun sns-digest run." buttons {"OK"} default button "OK"`,
  ]);
}

export async function openReportInTerminal(reportPath: string): Promise<void> {
  const command = `cat "${reportPath.replaceAll('"', '\\"')}"`;
  const script = [
    'tell application "Terminal"',
    "activate",
    `do script "${escapeAppleScriptString(command)}"`,
    "end tell",
  ].join("\n");

  const result = await runCommand("osascript", ["-e", script]);

  if (!result.success) {
    throw new CliError(
      `Failed to open Terminal.app: ${result.stderr || result.stdout}`,
    );
  }
}
