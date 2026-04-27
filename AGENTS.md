# AGENTS.md

## Purpose

This repository contains a macOS-only local CLI tool named `sns-digest`.
It fetches the X home timeline via X API v2, stores
credentials in macOS Keychain, writes a daily Markdown report, and integrates
with `launchd`.

## Working Agreements

* Preserve the README MVP scope. Do not add non-macOS support, cloud services,
  external notifications, or browser engines other than Google Chrome.
* Never store SNS passwords in source files, `.env`, YAML, logs, SQLite, or
  reports. Credentials belong only in macOS Keychain.
* Keep the dedicated browser profile isolated under `browser_profiles/`.
* Default to practical, testable code over speculative abstraction.
* Prefer small modules with explicit boundaries for config, auth, crawling,
  report generation, macOS integration, and scheduling.

## Implementation Notes

* Runtime: Node.js + TypeScript
* X integration: X API v2 (OAuth 2.0 PKCE + refresh token)
* macOS integrations: `security`, `osascript`, `open`, and `launchctl`
* Config format: YAML in `config/settings.yaml`

## Validation

Before finalizing changes when possible:

* Run `npm run build`
* Run `npm run lint`
* Smoke test the CLI help and setup commands

For browser crawling, prefer safe smoke tests that do not require real
credentials unless the task specifically asks for live-account verification.
