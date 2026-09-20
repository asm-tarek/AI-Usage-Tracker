"use strict";
(() => {
  // src/injected/chatgpt-session.ts
  function asObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  }
  function safeIdentifier(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value) ? value : void 0;
  }
  function decodeJwtPayload(token) {
    const encoded = token.split(".")[1];
    if (!encoded) return void 0;
    try {
      const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return asObject(JSON.parse(atob(padded)));
    } catch {
      return void 0;
    }
  }
  function parseChatGptSession(value) {
    const session = asObject(value);
    const accessToken = typeof session?.accessToken === "string" && session.accessToken.length > 0 && session.accessToken.length <= 32768 ? session.accessToken : void 0;
    if (!accessToken) return void 0;
    const claims = decodeJwtPayload(accessToken);
    const authClaim = asObject(claims?.["https://api.openai.com/auth"]);
    const accountId = safeIdentifier(authClaim?.chatgpt_account_id) ?? safeIdentifier(claims?.chatgpt_account_id);
    return { accessToken, ...accountId ? { accountId } : {} };
  }

  // src/injected/chatgpt-usage-bridge.ts
  var MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
  var REQUEST_TYPE = "CHATGPT_USAGE_REQUEST";
  var RESPONSE_TYPE = "CHATGPT_USAGE_RESPONSE";
  var MIN_REFRESH_MS = 3e4;
  var MIN_FORCED_REFRESH_MS = 5e3;
  var lastAttempt = 0;
  var lastPayload;
  var inFlight;
  function asObject2(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  }
  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function sanitizeWindow(value) {
    const input = asObject2(value);
    if (!input) return void 0;
    const usedPercent = finiteNumber(input.used_percent);
    if (usedPercent === void 0) return void 0;
    const output = { used_percent: usedPercent };
    const duration = finiteNumber(input.limit_window_seconds);
    const resetAt = finiteNumber(input.reset_at);
    const resetAfter = finiteNumber(input.reset_after_seconds);
    if (duration !== void 0) output.limit_window_seconds = duration;
    if (resetAt !== void 0) output.reset_at = resetAt;
    if (resetAfter !== void 0) output.reset_after_seconds = resetAfter;
    return output;
  }
  function sanitizeRateLimit(value) {
    const input = asObject2(value);
    if (!input) return void 0;
    const primary = sanitizeWindow(input.primary_window);
    const secondary = sanitizeWindow(input.secondary_window);
    if (!primary && !secondary) return void 0;
    return { ...primary ? { primary_window: primary } : {}, ...secondary ? { secondary_window: secondary } : {} };
  }
  function sanitizeUsage(value) {
    const input = asObject2(value);
    if (!input) return void 0;
    const rateLimit = sanitizeRateLimit(input.rate_limit);
    const codeReview = sanitizeRateLimit(input.code_review_rate_limit);
    const additionalInput = Array.isArray(input.additional_rate_limits) ? input.additional_rate_limits : [];
    const additional = additionalInput.slice(0, 20).flatMap((entry) => {
      const item = asObject2(entry);
      const nestedRateLimit = sanitizeRateLimit(item?.rate_limit);
      if (!item || !nestedRateLimit) return [];
      const name = typeof item.limit_name === "string" && item.limit_name.length <= 200 ? item.limit_name : "Additional limit";
      return [{ limit_name: name, rate_limit: nestedRateLimit }];
    });
    if (!rateLimit && !codeReview && !additional.length) return void 0;
    const plan = typeof input.plan_type === "string" && input.plan_type.length <= 100 ? input.plan_type : void 0;
    return {
      ...plan ? { plan_type: plan } : {},
      ...rateLimit ? { rate_limit: rateLimit } : {},
      ...codeReview ? { code_review_rate_limit: codeReview } : {},
      ...additional.length ? { additional_rate_limits: additional } : {}
    };
  }
  function post(payload) {
    lastPayload = payload;
    window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "chatgpt", payload }, location.origin);
  }
  async function retrieve() {
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
      const sessionAuth = parseChatGptSession(await sessionResponse.json());
      if (!sessionAuth) {
        post({ ok: false, errorCode: "NOT_LOGGED_IN" });
        return;
      }
      const response = await fetch("/backend-api/wham/usage", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionAuth.accessToken}`,
          ...sessionAuth.accountId ? { "ChatGPT-Account-Id": sessionAuth.accountId } : {}
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
      post({ ok: true, usage: sanitized, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() });
    } catch {
      post({ ok: false, errorCode: "NETWORK_ERROR" });
    }
  }
  function requestUsage(force = false) {
    if (location.hostname !== "chatgpt.com") return;
    if (inFlight) return;
    const age = Date.now() - lastAttempt;
    if (lastPayload && age < (force ? MIN_FORCED_REFRESH_MS : MIN_REFRESH_MS)) {
      window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "chatgpt", payload: lastPayload }, location.origin);
      return;
    }
    inFlight = retrieve().finally(() => {
      inFlight = void 0;
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = asObject2(event.data);
    if (message?.source !== MESSAGE_SOURCE || message.type !== REQUEST_TYPE || message.provider !== "chatgpt") return;
    requestUsage(message.force === true);
  });
})();
//# sourceMappingURL=chatgpt-bridge.js.map
