export {};

const MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
const REQUEST_TYPE = "CLAUDE_USAGE_REQUEST";
const RESPONSE_TYPE = "CLAUDE_USAGE_RESPONSE";
const MAX_ORGANIZATIONS = 5;
const MIN_REFRESH_MS = 30_000;
// Manual refreshes may bypass the 30-second reuse window, but rapid repeated
// clicks still reuse the latest answer instead of re-hitting the provider.
const MIN_FORCED_REFRESH_MS = 5_000;

type JsonObject = Record<string, unknown>;
let lastAttempt = 0;
let inFlight: Promise<void> | undefined;
let lastPayload: JsonObject | undefined;

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function organizationList(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject).filter((item): item is JsonObject => item !== undefined);
  const root = asObject(value);
  const nested = root?.organizations;
  return Array.isArray(nested) ? nested.map(asObject).filter((item): item is JsonObject => item !== undefined) : [];
}

function organizationId(value: JsonObject): string | undefined {
  const id = value.uuid ?? value.id ?? value.organization_id;
  return typeof id === "string" && id.length > 0 && id.length < 200 ? id : undefined;
}

function post(payload: JsonObject): void {
  lastPayload = payload;
  window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "claude", payload }, location.origin);
}

interface JsonResponse {
  status: number;
  data?: unknown;
  redirectedToSignIn: boolean;
}

async function fetchJson(path: string): Promise<JsonResponse> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  let data: unknown;
  try { data = await response.json(); } catch { data = undefined; }
  const redirectedToSignIn = response.redirected && /(?:login|signin|auth)/i.test(new URL(response.url, location.origin).pathname);
  return { status: response.status, redirectedToSignIn, ...(data === undefined ? {} : { data }) };
}

function hasUsageWindows(value: unknown): boolean {
  const root = asObject(value);
  return !!root && Object.values(root).some((entry) => {
    const item = asObject(entry);
    return item && typeof item.utilization === "number";
  });
}

async function retrieve(): Promise<void> {
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
      // Claude can return an empty organization list to a signed-out page
      // instead of an HTTP authentication error.
      post({ ok: false, errorCode: "NOT_LOGGED_IN" });
      return;
    }
    let lastSuccessful: { usage: unknown; organization: JsonObject } | undefined;
    for (const organization of organizations) {
      const id = organizationId(organization);
      if (!id) continue;
      const usageResponse = await fetchJson(`/api/organizations/${encodeURIComponent(id)}/usage`);
      if (usageResponse.status === 429) {
        post({ ok: false, errorCode: "RATE_LIMITED" });
        return;
      }
      if (usageResponse.status < 200 || usageResponse.status >= 300 || usageResponse.data === undefined) continue;
      lastSuccessful = { usage: usageResponse.data, organization };
      if (hasUsageWindows(usageResponse.data)) break;
    }
    if (!lastSuccessful) {
      post({ ok: false, errorCode: "USAGE_ENDPOINT_NOT_FOUND" });
      return;
    }
    post({ ok: true, usage: lastSuccessful.usage, organization: lastSuccessful.organization, fetchedAt: new Date().toISOString() });
  } catch {
    post({ ok: false, errorCode: "NETWORK_ERROR" });
  }
}

function requestUsage(force = false): void {
  if (location.hostname !== "claude.ai") return;
  // An in-flight retrieval always posts a response, which answers this request too.
  if (inFlight) return;
  const age = Date.now() - lastAttempt;
  if (lastPayload && age < (force ? MIN_FORCED_REFRESH_MS : MIN_REFRESH_MS)) {
    // Every request must receive a response; the content script otherwise
    // waits for its timeout and reports the provider as unavailable.
    window.postMessage({ source: MESSAGE_SOURCE, type: RESPONSE_TYPE, provider: "claude", payload: lastPayload }, location.origin);
    return;
  }
  inFlight = retrieve().finally(() => { inFlight = undefined; });
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = asObject(event.data);
  if (message?.source !== MESSAGE_SOURCE || message.type !== REQUEST_TYPE || message.provider !== "claude") return;
  requestUsage(message.force === true);
});

// No automatic retrieval at document_start: the content script requests usage
// once it is ready, so an eager call here only duplicated the network requests.
