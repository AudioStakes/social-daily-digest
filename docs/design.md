# Design Overview

## Modules

* `src/main.ts`: CLI entrypoint and command dispatch
* `src/config/`: YAML config loading, validation, and initialization
* `src/auth/`: legacy credential keychain integration
* `src/x/`: X API OAuth (PKCE), token refresh, and API client
* `src/crawler/`: snapshot IO + post normalization helpers
* `src/report/`: Markdown report generation and file writing
* `src/macos/`: macOS-specific prompts
* `src/schedule/`: wrapper script, plist generation, and `launchctl` actions

## Command Flow

### `init`

Create local directories and `config/settings.yaml` when missing.

### `x auth login`

1. Load config (`x.account_name`, `x.api.client_id`, `x.api.callback_url`)
2. Generate PKCE verifier/challenge + state
3. Start local callback server
4. Open X OAuth authorization URL
5. Exchange code for `access_token` + `refresh_token`
6. Save token payload to macOS Keychain

### `run`

1. Load config and ensure runtime directories
2. Reuse same-day JSON snapshot when available
3. Read token from Keychain; refresh if expired
4. Call X API (`/2/users/me`, `/2/users/{id}/timelines/reverse_chronological`)
5. Normalize to `SocialPost[]`, dedupe, and filter to last 24h
6. Write the Markdown report
7. Optionally send report by iCloud email

## Error Handling

* Validation errors are actionable and mention config fields.
* Missing/expired auth reports explicit `sns-digest x auth login` guidance.
* API 429/401/403 are mapped to clear `CliError` messages.
* Tokens and secrets are never logged.
