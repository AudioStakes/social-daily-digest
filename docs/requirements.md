# Requirements Notes

## Product Goal

Avoid manually opening noisy social feeds. The Mac should check X once per day,
generate a local Markdown digest, and let the user choose whether to view it.

## MVP Capabilities

* `sns-digest init` creates local directories and starter config
* `sns-digest credentials` stores account passwords in macOS Keychain
* `sns-digest run` launches Google Chrome with a dedicated profile
* The crawler attempts a normal login when the session is missing
* Manual verification steps are surfaced to the user instead of bypassed
* A Markdown report is written to `reports/YYYY-MM-DD.md`
* A macOS dialog asks whether to open the report
* `sns-digest schedule` installs and manages a daily `launchd` job

## Constraints

* macOS only
* Google Chrome only
* One local user
* One account per platform
* Local execution only
* No plaintext passwords
* No cloud sync or external notifications

## Engineering Choices

* Use `security` CLI instead of a native keychain binding to reduce install
  friction while still keeping secrets in macOS Keychain only.
* Use Playwright with an explicit Google Chrome executable path so the app does
  not depend on bundled Chromium.
* Keep the report format deterministic and Markdown-first for easy inspection.
