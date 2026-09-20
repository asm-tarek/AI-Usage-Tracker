"use strict";
(() => {
  // src/injected/claude-usage-bridge.ts
  var MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
  var REQUEST_TYPE = "CLAUDE_USAGE_REQUEST";
  var RESPONSE_TYPE = "CLAUDE_USAGE_RESPONSE";
  var MAX_ORGANIZATIONS = 5;
  var MIN_REFRESH_MS = 3e4;
  var MIN_FORCED_REFRESH_MS = 5e3;
  var lastAttempt = 0;
  var inFlight;
  var lastPayload;
  function asObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  }
  function organizationList(value) {
    if (Array.isArray(value)) return value.map(asObject).filter((item) => item !== void 0);
    const root = asObject(value);
    const nested = root?.organizations;
    return Array.isArray(nested) ? nested.map(asObject).filter((item) => item !== void 0) : [];
  }
  function organizationId(value) {
    const id = value.uuid ?? value.id ?? value.organization_id;
    return typeof id === "string" && id.length > 0 && id.length < 200 ? id : void 0;
  }
  function post(payload) {
    lastPayload = payload;
    window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "claude", payload }, location.origin);
  }
  async function fetchJson(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = void 0;
    }
    const redirectedToSignIn = response.redirected && /(?:login|signin|auth)/i.test(new URL(response.url, location.origin).pathname);
    return { status: response.status, redirectedToSignIn, ...data === void 0 ? {} : { data } };
  }
  function hasUsageWindows(value) {
    const root = asObject(value);
    return !!root && Object.values(root).some((entry) => {
      const item = asObject(entry);
      return item && typeof item.utilization === "number";
    });
  }
  async function retrieve() {
    lastAttempt = Date.now();
    try {
      const organizationsResponse = await fetchJson("/api/organizations");
      if (organizationsResponse.status === 401 || organizationsResponse.status === 403 || organizationsResponse.redirectedToSignIn) {
        post({ ok: false, errorCode: "NOT_LOGGED_IN" });
        return;
      }
      if (organizationsResponse.status === 429) {
        post({ ok: false, errorCode: "RATE_LIMITED" });
        return;
      }
      if (organizationsResponse.status < 200 || organizationsResponse.status >= 300) {
        post({ ok: false, errorCode: "NETWORK_ERROR" });
        return;
      }
      const organizations = organizationList(organizationsResponse.data).slice(0, MAX_ORGANIZATIONS);
      if (!organizations.length) {
        post({ ok: false, errorCode: "NOT_LOGGED_IN" });
        return;
      }
      let lastSuccessful;
      for (const organization of organizations) {
        const id = organizationId(organization);
        if (!id) continue;
        const usageResponse = await fetchJson(`/api/organizations/${encodeURIComponent(id)}/usage`);
        if (usageResponse.status === 429) {
          post({ ok: false, errorCode: "RATE_LIMITED" });
          return;
        }
        if (usageResponse.status < 200 || usageResponse.status >= 300 || usageResponse.data === void 0) continue;
        lastSuccessful = { usage: usageResponse.data, organization };
        if (hasUsageWindows(usageResponse.data)) break;
      }
      if (!lastSuccessful) {
        post({ ok: false, errorCode: "USAGE_ENDPOINT_NOT_FOUND" });
        return;
      }
      post({ ok: true, usage: lastSuccessful.usage, organization: lastSuccessful.organization, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() });
    } catch {
      post({ ok: false, errorCode: "NETWORK_ERROR" });
    }
  }
  function requestUsage(force = false) {
    if (location.hostname !== "claude.ai") return;
    if (inFlight) return;
    const age = Date.now() - lastAttempt;
    if (lastPayload && age < (force ? MIN_FORCED_REFRESH_MS : MIN_REFRESH_MS)) {
      window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "claude", payload: lastPayload }, location.origin);
      return;
    }
    inFlight = retrieve().finally(() => {
      inFlight = void 0;
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = asObject(event.data);
    if (message?.source !== MESSAGE_SOURCE || message.type !== REQUEST_TYPE || message.provider !== "claude") return;
    requestUsage(message.force === true);
  });
})();
//# sourceMappingURL=claude-bridge.js.map
