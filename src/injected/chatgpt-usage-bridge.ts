export {};

import { parseChatGptSession, type ChatGptSessionAuth } from "./chatgpt-session";

const MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
const REQUEST_TYPE = "CHATGPT_USAGE_REQUEST";
const RESPONSE_TYPE = "CHATGPT_USAGE_RESPONSE";
const MIN_REFRESH_MS = 30_000;
// Manual refreshes may bypass the 30-second reuse window, but rapid repeated
// clicks still reuse the latest answer instead of re-hitting the provider.
const MIN_FORCED_REFRESH_MS = 5_000;

type JsonObject = Record<string, unknown>;
let lastAttempt = 0;
let lastPayload: JsonObject | undefined;
let inFlight: Promise<void> | undefined;

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeWindow(value: unknown): JsonObject | undefined {
  const input = asObject(value);
  if (!input) return undefined;
  const usedPercent = finiteNumber(input.used_percent);
  if (usedPercent === undefined) return undefined;
  const output: JsonObject = { used_percent: usedPercent };
  const duration = finiteNumber(input.limit_window_seconds);
  const resetAt = finiteNumber(input.reset_at);
  const resetAfter = finiteNumber(input.reset_after_seconds);
  if (duration !== undefined) output.limit_window_seconds = duration;
  if (resetAt !== undefined) output.reset_at = resetAt;
  if (resetAfter !== undefined) output.reset_after_seconds = resetAfter;
  return output;
}

function sanitizeRateLimit(value: unknown): JsonObject | undefined {
  const input = asObject(value);
  if (!input) return undefined;
  const primary = sanitizeWindow(input.primary_window);
  const secondary = sanitizeWindow(input.secondary_window);
  if (!primary && !secondary) return undefined;
  return { ...(primary ? { primary_window: primary } : {}), ...(secondary ? { secondary_window: secondary } : {}) };
}

function sanitizeUsage(value: unknown): JsonObject | undefined {
  const input = asObject(value);
  if (!input) return undefined;
  const rateLimit = sanitizeRateLimit(input.rate_limit);
  const codeReview = sanitizeRateLimit(input.code_review_rate_limit);
  const additionalInput = Array.isArray(input.additional_rate_limits) ? input.additional_rate_limits : [];
  const additional = additionalInput.slice(0, 20).flatMap((entry) => {
    const item = asObject(entry);
    const nestedRateLimit = sanitizeRateLimit(item?.rate_limit);
    if (!item || !nestedRateLimit) return [];
    const name = typeof item.limit_name === "string" && item.limit_name.length <= 200 ? item.limit_name : "Additional limit";
    return [{ limit_name: name, rate_limit: nestedRateLimit }];
  });
  if (!rateLimit && !codeReview && !additional.length) return undefined;
  const plan = typeof input.plan_type === "string" && input.plan_type.length <= 100 ? input.plan_type : undefined;
  return {
    ...(plan ? { plan_type: plan } : {}),
    ...(rateLimit ? { rate_limit: rateLimit } : {}),
    ...(codeReview ? { code_review_rate_limit: codeReview } : {}),
    ...(additional.length ? { additional_rate_limits: additional } : {})
  };
}

function post(payload: JsonObject): void {
  lastPayload = payload;
  window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "chatgpt", payload }, location.origin);
}

async function retrieve(): Promise<void> {
  lastAttempt = Date.now();
  try {
    const sessionResponse = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (sessionResponse.status === 401 || sessionResponse.status === 403) {
      post({ ok: false, errorCode: "NOT_LOGGED_IN" });
      return;
    }
    if (!sessionResponse.ok) {
      post({ ok: false, errorCode: "NETWORK_ERROR" });
      return;
    }
    const sessionAuth: ChatGptSessionAuth | undefined = parseChatGptSession(await sessionResponse.json());
    if (!sessionAuth) {
      // The session endpoint commonly returns HTTP 200 with no access token
      // when the visitor is signed out. Treat that as an authentication state,
      // not as a provider outage or response-format failure.
      post({ ok: false, errorCode: "NOT_LOGGED_IN" });
      return;
    }

    const response = await fetch("/backend-api/wham/usage", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${sessionAuth.accessToken}`,
        ...(sessionAuth.accountId ? { "ChatGPT-Account-Id": sessionAuth.accountId } : {})
      },
      cache: "no-store"
    });
    if (response.status === 401) {
      post({ ok: false, errorCode: "PERMISSION_ERROR" });
      return;
    }
    if (response.status === 403) {
      post({ ok: false, errorCode: "UNSUPPORTED_ACCOUNT" });
      return;
    }
    if (response.status === 429) {
      post({ ok: false, errorCode: "RATE_LIMITED" });
      return;
    }
    if (!response.ok) {
      post({ ok: false, errorCode: "NETWORK_ERROR" });
      return;
    }
    const sanitized = sanitizeUsage(await response.json());
    if (!sanitized) {
      post({ ok: false, errorCode: "RESPONSE_FORMAT_CHANGED" });
      return;
    }
    post({ ok: true, usage: sanitized, fetchedAt: new Date().toISOString() });
  } catch {
    post({ ok: false, errorCode: "NETWORK_ERROR" });
  }
}

function requestUsage(force = false): void {
  if (location.hostname !== "chatgpt.com") return;
  // An in-flight retrieval always posts a response, which answers this request too.
  if (inFlight) return;
  const age = Date.now() - lastAttempt;
  if (lastPayload && age < (force ? MIN_FORCED_REFRESH_MS : MIN_REFRESH_MS)) {
    // Every request must receive a response; the content script otherwise
    // waits for its timeout and reports the provider as unavailable.
    window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "chatgpt", payload: lastPayload }, location.origin);
    return;
  }
  inFlight = retrieve().finally(() => { inFlight = undefined; });
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = asObject(event.data);
  if (message?.source !== MESSAGE_SOURCE || message.type !== REQUEST_TYPE || message.provider !== "chatgpt") return;
  requestUsage(message.force === true);
});

// No automatic retrieval at document_start: the content script requests usage
// once it is ready, so an eager call here only duplicated the network requests.
