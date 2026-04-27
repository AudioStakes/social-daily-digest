import crypto from "node:crypto";
import http from "node:http";

import { CliError } from "../errors.js";
import type { AppSettings } from "../types.js";
import { runCommand } from "../util/command.js";
import {
  deleteXApiTokenRecord,
  getXApiTokenRecord,
  saveXApiTokenRecord,
  type XApiTokenRecord,
} from "./keychain.js";

const X_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REQUIRED_SCOPES = ["tweet.read", "users.read", "offline.access"];
const CALLBACK_TIMEOUT_MS = 180_000;

function assertXApiConfig(settings: AppSettings): void {
  if (settings.x.account_name === "") {
    throw new CliError('X is not configured. Set "x.account_name" in config/settings.yaml.');
  }
  if (settings.x.api.client_id === "") {
    throw new CliError('X API is not configured. Set "x.api.client_id" in config/settings.yaml.');
  }
}

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function getInvalidCallbackError(): CliError {
  return new CliError(
    'Set "x.api.callback_url" to a local callback URL with an explicit non-privileged port, such as "http://127.0.0.1:8787/callback".',
  );
}

function parseCallbackUrl(callbackUrl: string): URL {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new CliError('config/settings.yaml has invalid "x.api.callback_url".');
  }

  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw getInvalidCallbackError();
  }

  if (url.port === "") {
    throw getInvalidCallbackError();
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw getInvalidCallbackError();
  }

  return url;
}

async function waitForAuthCode(callbackUrl: URL, expectedState: string): Promise<string> {
  const port = Number(callbackUrl.port);

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const finalize = (fn: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      server.close();
      fn();
    };

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Missing request URL.");
        return;
      }

      const requestUrl = new URL(req.url, `${callbackUrl.protocol}//${callbackUrl.host}`);
      if (requestUrl.pathname !== callbackUrl.pathname) {
        res.statusCode = 404;
        res.end("Not found.");
        return;
      }

      const state = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      if (!state || state !== expectedState || !code) {
        res.statusCode = 400;
        res.end("Invalid OAuth callback parameters.");
        return;
      }

      res.statusCode = 200;
      res.end("X API authentication succeeded. You can close this tab.");
      finalize(() => resolve(code));
    });

    server.once("error", (error) => {
      finalize(() => reject(error));
    });

    server.listen(port, callbackUrl.hostname, () => {
      timeoutHandle = setTimeout(() => {
        finalize(() => reject(new CliError("Timed out waiting for OAuth callback.")));
      }, CALLBACK_TIMEOUT_MS);
    });
  });
}

function buildRateLimitError(response: Response): CliError {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && retryAfter.trim() !== "") {
    return new CliError(`X API rate limit exceeded. Retry after ${retryAfter} seconds.`);
  }

  return new CliError("X API rate limit exceeded. Wait a bit and try again.");
}

async function fetchToken(payload: URLSearchParams): Promise<XApiTokenRecord> {
  let response: Response;
  try {
    response = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });
  } catch {
    throw new CliError("Network error while calling X API.");
  }

  if (response.status === 429) {
    throw buildRateLimitError(response);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CliError(
      'X API access was denied. Confirm the app has tweet.read, users.read, and offline.access scopes, then run "sns-digest x auth login" again.',
    );
  }

  if (!response.ok) {
    throw new CliError("Unexpected X API response.");
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const accessToken = raw.access_token;
  const refreshToken = raw.refresh_token;
  const expiresIn = raw.expires_in;

  if (
    typeof accessToken !== "string" ||
    accessToken.trim() === "" ||
    typeof refreshToken !== "string" ||
    refreshToken.trim() === "" ||
    typeof expiresIn !== "number"
  ) {
    throw new CliError("Unexpected X API response.");
  }

  return {
    accessToken,
    refreshToken,
    expiresAtMs: Date.now() + Math.max(0, expiresIn - 60) * 1_000,
  };
}

export async function runXAuthLogin(settings: AppSettings): Promise<void> {
  assertXApiConfig(settings);

  const callbackUrl = parseCallbackUrl(settings.x.api.callback_url);
  const state = base64Url(crypto.randomBytes(24));
  const { verifier, challenge } = generatePkcePair();

  const authUrl = new URL(X_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", settings.x.api.client_id);
  authUrl.searchParams.set("redirect_uri", settings.x.api.callback_url);
  authUrl.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("Starting local callback server for X OAuth...");
  const waitForCode = waitForAuthCode(callbackUrl, state);

  const openResult = await runCommand("open", [authUrl.toString()]);
  if (!openResult.success) {
    console.log("Open the following URL in your browser:");
    console.log(authUrl.toString());
  }

  const code = await waitForCode;
  const token = await fetchToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.x.api.callback_url,
      client_id: settings.x.api.client_id,
      code_verifier: verifier,
    }),
  );

  await saveXApiTokenRecord(settings.x.account_name, token);
  console.log("X API token saved in macOS Keychain.");
}

export async function runXAuthStatus(settings: AppSettings): Promise<void> {
  assertXApiConfig(settings);

  const token = await getXApiTokenRecord(settings.x.account_name);
  if (!token) {
    console.log("X API token: not configured");
    return;
  }

  const expired = token.expiresAtMs <= Date.now();
  console.log(`X API token: configured (${expired ? "expired" : "valid"})`);
}

export async function runXAuthLogout(settings: AppSettings): Promise<void> {
  assertXApiConfig(settings);

  const deleted = await deleteXApiTokenRecord(settings.x.account_name);
  console.log(
    deleted
      ? "X API token deleted from macOS Keychain."
      : "X API token was not present in macOS Keychain.",
  );
}

export async function getValidXAccessToken(settings: AppSettings): Promise<string> {
  assertXApiConfig(settings);

  const token = await getXApiTokenRecord(settings.x.account_name);
  if (!token) {
    throw new CliError('X API authentication is required. Run "sns-digest x auth login".');
  }

  if (token.expiresAtMs > Date.now() + 30_000) {
    return token.accessToken;
  }

  if (token.refreshToken.trim() === "") {
    throw new CliError(
      'X API token refresh failed. Run "sns-digest x auth login" again.',
    );
  }

  try {
    const refreshed = await fetchToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        client_id: settings.x.api.client_id,
      }),
    );
    await saveXApiTokenRecord(settings.x.account_name, refreshed);
    return refreshed.accessToken;
  } catch (error) {
    if (
      error instanceof CliError &&
      (error.message.includes("X API access was denied") ||
        error.message.includes("X API rate limit exceeded"))
    ) {
      throw error;
    }

    throw new CliError(
      'X API token refresh failed. Run "sns-digest x auth login" again.',
    );
  }
}
