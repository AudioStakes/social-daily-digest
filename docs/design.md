# Design Overview

## Modules

* `src/main.ts`: CLI entrypoint and command dispatch
* `src/config/`: YAML config loading, validation, and initialization
* `src/auth/`: macOS Keychain integration
* `src/browser/`: Chrome profile and Playwright bootstrap
* `src/crawler/`: platform-specific login and feed scraping
* `src/report/`: Markdown report generation and file writing
* `src/macos/`: dialogs and Terminal launching
* `src/schedule/`: wrapper script, plist generation, and `launchctl` actions

## Command Flow

### `init`

Create the local directories and `config/settings.yaml` when missing.

### `credentials set <platform>`

1. Load config and account name
2. Prompt for password without echo
3. Save to macOS Keychain under `social-daily-digest:<platform>`

### `run`

1. Load config
2. Skip disabled platforms
3. Launch Chrome persistent context from `browser_profiles/chrome`
4. For each enabled platform:
   * open feed
   * check logged-in state
   * attempt password login when logged out
   * stop and prompt if a manual challenge is detected
   * scrape posts newer than 24 hours when possible
5. Write the Markdown report
6. Show a macOS dialog and optionally open Terminal

### `schedule install`

1. Build a wrapper shell script at `~/.social-daily-digest/bin/run.sh`
2. Generate `~/Library/LaunchAgents/com.local.social-daily-digest.plist`
3. Load the agent with `launchctl`

## Error Handling

* Validation errors should be actionable and mention the config path
* Missing credentials should not print secrets and should mention the command to
  fix the issue
* Browser login challenges should raise a clear manual-action-required error
