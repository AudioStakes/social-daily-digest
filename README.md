もちろんです。コードブロックなしで、そのまま全文コピーしやすい形にします。

README.md

# social-daily-digest

A macOS-only local CLI tool that crawls X and Facebook once per day, generates a daily report, and asks whether you want to view it.

The goal is simple:

I do not want to open noisy social media timelines manually.
I want my Mac to check X and Facebook once a day, collect posts from the accounts I follow, and show me the result only when I choose to view it.

---

## Scope

This project is intentionally narrow.

### Supported

* macOS only
* Google Chrome only
* X
* Facebook
* One local user
* One account per platform
* Local execution only
* Daily crawl via launchd
* Credentials stored in macOS Keychain
* Login session stored in a dedicated local Chrome profile
* Markdown report output
* Simple macOS dialog after crawling

### Not supported

* Windows
* Linux
* Firefox
* Safari
* Cloud execution
* Multiple users
* Web UI
* Mobile app
* External notification services
* Discord, Slack, Telegram, email, ntfy
* CAPTCHA solving
* MFA bypass
* Bot-detection bypass
* Scraping data unavailable to the logged-in user

---

## Design Principles

1. Local-first
   Everything runs on the user’s Mac.

2. Minimal configuration
   Only the account names and daily crawl time are configured in YAML.

3. No plaintext passwords
   X and Facebook passwords must never be stored in YAML, .env, SQLite, logs, or source files.

4. macOS Keychain only
   Passwords are stored only in macOS Keychain.

5. Dedicated Chrome profile
   The tool uses its own Chrome profile instead of the user’s normal Chrome profile.

6. No external push service
   After crawling, the tool uses a simple macOS dialog:

   Your daily social report is ready. Would you like to view it?

7. User-controlled viewing
   If the user chooses to view the result, Terminal.app opens and displays the generated Markdown report.

---

## Configuration

The only configuration file is:

config/settings.yaml

Example:

app:
timezone: Asia/Tokyo

schedule:
notify_at: "08:00"

x:
account_name: "your_x_username_or_email"

facebook:
account_name: "your_facebook_email_or_username"

If an account name is empty, that platform is skipped.

Example:

facebook:
account_name: ""

---

## Authentication

This project uses two local authentication mechanisms.

### 1. macOS Keychain

The user enters the X or Facebook password once through the CLI.

The password is saved to macOS Keychain.

It is not saved in:

* YAML
* .env
* SQLite
* logs
* source code
* browser profile metadata

Credential service names:

social-daily-digest:x
social-daily-digest:facebook

### 2. Dedicated Chrome Profile

The tool uses a dedicated Chrome profile directory, for example:

browser_profiles/chrome/

This profile stores cookies and browser session data.

If the session is still valid, the tool reuses it.
If the session has expired, the tool retrieves the password from Keychain and attempts a normal login.

If X or Facebook asks for MFA, passkey confirmation, CAPTCHA, suspicious login verification, or any other manual challenge, the tool must stop automation and let the user complete the step manually.

The tool must never attempt to bypass verification challenges.

---

## CLI

The CLI command name is:

sns-digest

### Commands

sns-digest init
sns-digest credentials set x
sns-digest credentials set facebook
sns-digest credentials show
sns-digest credentials delete x
sns-digest credentials delete facebook
sns-digest run
sns-digest schedule install
sns-digest schedule uninstall
sns-digest schedule show

---

## Command Behavior

### sns-digest init

Initializes the local project files and directories.

Creates:

config/settings.yaml
browser_profiles/
data/
logs/
reports/

---

### sns-digest credentials set x

Stores the X password in macOS Keychain.

The account name is read from:

x:
account_name: "..."

The password is entered interactively and hidden in the terminal.

---

### sns-digest credentials set facebook

Stores the Facebook password in macOS Keychain.

The account name is read from:

facebook:
account_name: "..."

The password is entered interactively and hidden in the terminal.

---

### sns-digest credentials show

Shows whether credentials exist.

It must never print passwords.

Example output:

X: configured
Facebook: not configured

---

### sns-digest credentials delete x

Deletes the stored X password from macOS Keychain.

---

### sns-digest credentials delete facebook

Deletes the stored Facebook password from macOS Keychain.

---

### sns-digest run

Runs the crawler immediately.

Expected behavior:

1. Load config/settings.yaml
2. Check configured platforms
3. Launch Google Chrome using the dedicated profile
4. Check login state
5. If logged out, retrieve credentials from macOS Keychain
6. Attempt normal login
7. If manual verification appears, ask the user to complete it
8. Crawl posts from the last 24 hours
9. Generate a Markdown report
10. Show a macOS dialog:

Your daily social report is ready. Would you like to view it?

If the user chooses to view the report, Terminal.app opens and displays it.

---

### sns-digest schedule install

Installs a daily launchd job.

The execution time is read from:

schedule:
notify_at: "08:00"

The generated LaunchAgent should be installed at:

~/Library/LaunchAgents/com.local.social-daily-digest.plist

The launchd job should run the crawler once per day.

---

### sns-digest schedule uninstall

Removes the installed LaunchAgent.

---

### sns-digest schedule show

Displays the configured daily run time and launchd installation status.

Example:

Daily crawl time: 08:00 Asia/Tokyo
LaunchAgent: installed
Label: com.local.social-daily-digest

---

## Scheduling

Daily execution is handled by macOS launchd.

The tool does not run as a daemon or background server.

Example LaunchAgent behavior:

08:00
launchd starts sns-digest
sns-digest crawls X and/or Facebook
sns-digest writes reports/YYYY-MM-DD.md
sns-digest shows the macOS dialog

---

## Completion Dialog

After crawling, the tool shows a standard macOS dialog using osascript.

Message:

our daily social report is ready. Would you like to view it?

Buttons:

View
Close

If the user selects View, Terminal.app opens and displays the latest report with cat.

Example behavior:

cat reports/2026-04-26.md

The MVP should use osascript display dialog, not Notification Center.

---

## Report

Reports are written as Markdown files.

Path:

reports/YYYY-MM-DD.md

Example:

# Social Daily Digest

2026-04-26

## Summary

* X: 12 posts
* Facebook: 5 posts

## X

### Example Account

* 07:42
  Post text...
  [https://x.com/example/status/](https://x.com/example/status/)...

## Facebook

### Example Page

* 06:10
  Post text...
  [https://www.facebook.com/](https://www.facebook.com/)...

If no new posts are found:

# Social Daily Digest

2026-04-26

No posts found in the last 24 hours.

---

## Crawl Target

The MVP target is intentionally simple.

### Target period

Last 24 hours from execution time

### Target pages

The crawler should use each platform’s feed or following-equivalent page.

MVP does not need to:

* discover all followed accounts
* crawl each profile page
* support exclusion lists
* support multiple accounts
* support advanced filtering

Those can be added later.

---

## Security Requirements

The implementation must follow these requirements:

* Do not store SNS passwords in config files
* Do not store SNS passwords in .env
* Do not store SNS passwords in SQLite
* Do not log passwords
* Do not log cookies
* Do not log authentication headers
* Do not print Keychain values
* Do not use the user’s normal Chrome profile
* Do not bypass MFA, passkeys, CAPTCHA, or suspicious-login checks
* Do not access content unavailable to the logged-in user
* Do not send crawled content to external services

---

## Local Directories

Suggested structure:

social-daily-digest/
README.md
package.json
tsconfig.json
.gitignore
config/
settings.yaml
settings.example.yaml
browser_profiles/
chrome/
data/
logs/
reports/
src/
main.ts
auth/
config/
crawler/
macos/
report/
schedule/

---

## Git Ignore Policy

The following should not be committed:

node_modules/
dist/
config/settings.yaml
browser_profiles/
data/
logs/
reports/
.DS_Store

---

## Recommended Implementation Stack

* Node.js
* TypeScript
* Playwright
* Google Chrome channel
* macOS Keychain via keytar
* YAML config parser
* launchd
* osascript
* Markdown report files

---

## Playwright Browser Policy

The project must use Google Chrome only.

Do not support:

* bundled Chromium
* Firefox
* WebKit
* Safari

The crawler should launch Chrome through Playwright using the Chrome channel and a dedicated persistent profile.

Conceptually:

chromium.launchPersistentContext(profilePath, {
channel: "chrome",
headless: false
});

Headed mode should be the default because login challenges may require user interaction.

---

## macOS Dialog Policy

Use osascript.

Example:

osascript -e 'display dialog "Your daily social report is ready. Would you like to view it?" buttons {"Close", "View"} default button "View"'

If the user chooses View, open Terminal.app and display the latest report.

---

## launchd Policy

The LaunchAgent label should be:

com.local.social-daily-digest

The plist path should be:

~/Library/LaunchAgents/com.local.social-daily-digest.plist

The daily time should be generated from:

schedule:
notify_at: "08:00"

The actual launchd job should invoke a generated wrapper script rather than directly depending on the user’s shell environment.

Suggested wrapper path:

~/.social-daily-digest/bin/run.sh

---

## MVP Acceptance Criteria

The MVP is complete when:

* sns-digest init creates the expected files and directories
* config/settings.yaml contains only the minimal YAML fields
* sns-digest credentials set x stores the X password in macOS Keychain
* sns-digest credentials set facebook stores the Facebook password in macOS Keychain
* sns-digest credentials show shows configured/not configured status without printing secrets
* sns-digest run opens Google Chrome with a dedicated profile
* The tool attempts to log in using Keychain credentials if needed
* The tool does not bypass manual verification challenges
* The tool creates reports/YYYY-MM-DD.md
* The tool shows the dialog Your daily social report is ready. Would you like to view it?
* Choosing View opens Terminal.app and displays the report
* sns-digest schedule install installs a launchd job
* sns-digest schedule uninstall removes the launchd job
* The tool runs once per day at schedule.notify_at

---

## Non-goals for MVP

The MVP should not implement:

* external notifications
* account exclusion lists
* following-account discovery
* per-account profile crawling
* AI summarization
* HTML reports
* web dashboard
* settings UI
* multi-platform browser support
* multi-OS support
* cloud sync
* cloud deployment
* OAuth/API integrations
* automatic CAPTCHA or MFA handling

---

## Future Ideas

Possible future additions:

* Exclude noisy accounts
* Per-platform enable/disable flags
* HTML report output
* AI-generated summary
* Searchable local archive
* Open report in a native viewer
* Account discovery from following list
* Profile-by-profile crawling fallback
* External notifications
* Menu bar app

These are intentionally excluded from the MVP.
