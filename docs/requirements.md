# Requirements Notes

## Product Goal

Avoid manually opening noisy social feeds. The Mac should check X once per day,
generate a local Markdown digest, and let the user choose whether to view it.

## MVP Capabilities

* `sns-digest init` creates local directories and starter config
* `sns-digest x auth login` performs OAuth 2.0 PKCE for X API
* `sns-digest run` fetches X home timeline via X API v2
* Token refresh uses `offline.access` and macOS Keychain storage
* A Markdown report is written to `reports/YYYY-MM-DD.md`
* `sns-digest schedule` installs and manages a daily `launchd` job

## Constraints

* macOS only
* One local user
* One account per platform
* Local execution only
* No plaintext passwords/tokens
* No cloud sync or external notifications

## Engineering Choices

* Use `security` CLI instead of native keychain bindings to keep install simple while storing secrets only in macOS Keychain.
* Use OAuth 2.0 Authorization Code + PKCE (public client, no client secret in YAML).
* Keep report format deterministic and Markdown-first for easy inspection.
