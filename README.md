# social-daily-digest

`social-daily-digest` is a **macOS-only local CLI** that checks X once per day, writes a Markdown digest report, and can optionally email that report to your own iCloud address.

The tool is intentionally scoped for a single local user with macOS-native integrations (`security`, `osascript`, `open`, `launchctl`).

## MVP Scope

### In scope

- Local-only execution on macOS.
- Fetching the authenticated user's X home timeline via X API v2.
- OAuth 2.0 Authorization Code + PKCE login from local CLI.
- Refresh-token based token renewal (stored in macOS Keychain only).
- Generating a daily Markdown report at `reports/YYYY-MM-DD.md`.
- Optional self-email delivery of the generated report when configured.
- Daily scheduling through `launchd`.

### Non-goals

- Non-macOS support.
- Cloud-hosted crawling, storage, or notifications.
- DOM scraping, browser automation, or login bypass.

## Requirements

- macOS
- Node.js 20+
- X Developer App (OAuth 2.0 enabled)

## Setup

```bash
npm install
npm run build
npm link
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
  api:
    client_id: ""
    callback_url: "http://127.0.0.1:8787/callback"
```

- `x.account_name` is the Keychain account label used to store X API tokens.
- `x.api.client_id` is your X OAuth 2.0 client ID.
- `x.api.callback_url` should match your X app callback URL (public client + PKCE; no client secret required).

## X API Authentication (PKCE)

Configure your X Developer app with these scopes:

- `tweet.read`
- `users.read`
- `offline.access`

Then authenticate:

```bash
sns-digest x auth login
```

Useful auth commands:

```bash
sns-digest x auth status
sns-digest x auth logout
```

## Credentials and Security

- X API `access_token` / `refresh_token` / expiration are stored only in macOS Keychain.
- X API tokens are never written to YAML, `.env`, logs, SQLite, reports, or source code.
- Email app-specific password is stored only in macOS Keychain.
- `sns-digest credentials set x` remains separate (legacy SNS password storage) and is not used for X API auth.

## CLI Commands

```text
sns-digest init
sns-digest credentials set x
sns-digest credentials show
sns-digest credentials delete x
sns-digest x auth login
sns-digest x auth status
sns-digest x auth logout
sns-digest email credentials set
sns-digest email credentials show
sns-digest email credentials delete
sns-digest email test
sns-digest run
sns-digest schedule install
sns-digest schedule uninstall
sns-digest schedule show
```

## Runtime behavior (`sns-digest run`)

1. Load settings and runtime directories.
2. Reuse same-day JSON snapshot if available (`data/x_snapshots/YYYY-MM-DD.json`).
3. Read X API token from Keychain and refresh if expired.
4. Fetch authenticated user's home timeline via X API v2 (`users/me`, `reverse_chronological`).
5. Normalize to `SocialPost[]`, dedupe, and keep only the last 24 hours.
6. Generate `reports/YYYY-MM-DD.md`.
7. If `email.address` is set, send the report via iCloud SMTP.

> Note: Home timeline API returns the authenticated user's home timeline and is not guaranteed to be a complete archive of every followed account's posts.

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
