# social-daily-digest

macOS ローカル専用の CLI ツールです。X / Facebook を日次でクロールし、Markdown レポートを生成します。

## 設定

設定ファイル: `config/settings.yaml`

```yaml
app:
  timezone: Asia/Tokyo

schedule:
  notify_at: "08:00"

email:
  enabled: false
  host: "smtp.gmail.com"
  port: 587
  secure: false
  from: ""
  to: ""
  username: ""

x:
  account_name: ""

facebook:
  account_name: ""
```

- `email.enabled: false` の場合、メール設定が空でもエラーにしません。
- `email.enabled: true` の場合、SMTP 送信を実行します。
- `email.username` 未指定時は `email.from` を SMTP ユーザー名として利用します。

## 認証情報の保存方針

- SNS パスワードと SMTP パスワードは **macOS Keychain のみ** に保存します。
- YAML / `.env` / ログ / レポート / ソースコードにパスワードを保存しません。
- メール用 Keychain service 名: `social-daily-digest:email`
- メール用 Keychain account 名: `email.username || email.from`

## CLI

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

### Email コマンド

- `sns-digest email credentials set`
  - SMTP パスワードを対話入力で受け取り Keychain に保存します。
- `sns-digest email credentials show`
  - 保存済みかどうかのみ表示します（パスワードは非表示）。
- `sns-digest email credentials delete`
  - Keychain から SMTP パスワードを削除します。
- `sns-digest email test`
  - 現在設定 + Keychain パスワードでテストメールを送信します。

## run 時の動作

`email.enabled: true` のとき、`sns-digest run` はレポート生成後に次を実行します。

1. 生成済み `reports/YYYY-MM-DD.md` を読み込む
2. 件名 `[Social Daily Digest] YYYY-MM-DD` で送信
3. 本文は Markdown レポート本文をそのまま送信
4. 送信成功後、従来どおり macOS ダイアログを表示

`email.enabled: false` のときはメール送信処理をスキップします。
