# social-daily-digest

`social-daily-digest` is a **macOS-only local CLI** that checks X and Facebook once per day, writes a Markdown digest report, and can optionally email that report to your own iCloud address.

The tool is intentionally scoped for a single local user with a dedicated Google Chrome profile and macOS-native integrations (`security`, `osascript`, `open`, `launchctl`).

## MVP Scope

### In scope

- Local-only execution on macOS.
- Crawling X and Facebook with Playwright using local Google Chrome.
- Manual-first login with session reuse via a dedicated local Google Chrome profile.
- Optional storage of platform credentials in macOS Keychain for future compatibility.
- Generating a daily Markdown report at `reports/YYYY-MM-DD.md`.
- Optional self-email delivery of the generated report when configured.
- Daily scheduling through `launchd`.

### Non-goals

- Non-macOS support.
- Cloud-hosted crawling, storage, or notifications.
- Browser engines other than local Google Chrome.

## Requirements

- macOS
- Node.js 20+
- Google Chrome installed in the standard macOS Applications path

## Setup

```bash
npm install
npm run build
```

Initialize local directories and create starter config:

```bash
sns-digest init
```

## Configuration

Main config file: `config/settings.yaml`

```yaml
app:
  timezone: Asia/Tokyo

schedule:
  notify_at: "08:00"

email:
  address: "your-address@icloud.com"

x:
  account_name: ""

facebook:
  account_name: ""
```

### Email setting behavior

The email setting must be exactly:

```yaml
email:
  address: "your-address@icloud.com"
```

- If `email.address` is empty, email delivery is skipped.
- If `email.address` is set, `sns-digest run` sends the generated report to that same address.
- The same address is used as SMTP username, sender (`from`), and recipient (`to`).
- SMTP details are fixed internally for iCloud Mail (`smtp.mail.me.com:587`, STARTTLS).
- No additional email YAML fields are required or used.

## Credentials and Security

### SNS credentials

X and Facebook login is handled manually inside the opened Google Chrome window.

You can still store X / Facebook passwords in macOS Keychain as **optional / reserved for future compatibility**, but the crawler does **not** auto-type these values into login forms:

```bash
sns-digest credentials set x
sns-digest credentials set facebook
```

### Email credential (Apple app-specific password)

For iCloud Mail SMTP, create an **Apple app-specific password** and store it via CLI:

```bash
sns-digest email credentials set
```

- Do **not** use your normal Apple Account password.
- The app-specific password is stored only in macOS Keychain.
- Keychain service name: `social-daily-digest:email`
- Keychain account name: `email.address`

### Security requirements

- Do not store SNS or email passwords in YAML, `.env`, SQLite, logs, reports, or source code.
- Email password must be stored only in macOS Keychain.
- Do not print Keychain secret values.
- The crawler does not bypass MFA, passkeys, CAPTCHA, suspicious login checks, or account verification. Complete those steps manually in Chrome when prompted.

## CLI Commands

```text
sns-digest init
sns-digest credentials set x
sns-digest credentials set facebook
sns-digest credentials show
sns-digest credentials delete x
sns-digest credentials delete facebook
sns-digest email credentials set
sns-digest email credentials show
sns-digest email credentials delete
sns-digest email test
sns-digest run
sns-digest schedule install
sns-digest schedule uninstall
sns-digest schedule show
```

### Email commands

- `sns-digest email credentials set`
  - Reads `email.address` from `config/settings.yaml`
  - Prompts for the iCloud app-specific password with hidden input
  - Stores password in macOS Keychain
- `sns-digest email credentials show`
  - Prints only configured/not configured status
  - Never prints the password
- `sns-digest email credentials delete`
  - Deletes the stored Keychain password for configured `email.address`
- `sns-digest email test`
  - Sends a test email to `email.address` from `email.address`

## Runtime behavior (`sns-digest run`)

1. Open configured platforms (X/Facebook) in the dedicated Chrome profile under `browser_profiles/`.
2. Reuse any existing logged-in session from that dedicated profile.
3. If a platform is logged out, show a macOS dialog asking for manual login in the opened Chrome window.
4. After you click **OK**, navigate again to the platform home/feed and verify login state.
5. Continue crawling only when login is confirmed; otherwise fail with a clear manual-login-required error.
6. Crawl configured platforms (X/Facebook).
7. Generate `reports/YYYY-MM-DD.md`.
8. If `email.address` is set, send the report by email with subject `[Social Daily Digest] YYYY-MM-DD` and plain-text body equal to the Markdown report content.
9. Show the existing macOS completion dialog.

## Scheduling

Install daily `launchd` job:

```bash
sns-digest schedule install
```

Remove job:

```bash
sns-digest schedule uninstall
```

Show current status:

```bash
sns-digest schedule show
```

## MVP Acceptance Criteria

- `sns-digest init` creates local workspace/config.
- `sns-digest run` generates a deterministic daily Markdown report.
- Optional email delivery succeeds when `email.address` is configured and a Keychain credential exists.
- Email delivery is skipped cleanly when `email.address` is empty.
- All credentials remain in macOS Keychain only.
- Scheduling works through `launchd`.
