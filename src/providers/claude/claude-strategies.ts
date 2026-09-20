import { UsageError, type ProviderUsage, type StrategyContext, type UsageErrorCode, type UsageStrategy } from "../types";
import { parseClaudeUsage } from "./claude-parser";

const MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
const REQUEST_TYPE = "CLAUDE_USAGE_REQUEST";
const RESPONSE_TYPE = "CLAUDE_USAGE_RESPONSE";
const ALLOWED_ERRORS = new Set<UsageErrorCode>([
  "NOT_LOGGED_IN", "USAGE_ENDPOINT_NOT_FOUND", "RESPONSE_FORMAT_CHANGED", "NETWORK_ERROR",
  "RATE_LIMITED", "UNSUPPORTED_ACCOUNT", "UNKNOWN"
]);

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

export class ClaudeNativeUsageStrategy implements UsageStrategy {
  readonly name = "claude-native-internal-api";
  async isAvailable(context: StrategyContext): Promise<boolean> { return context.location.hostname === "claude.ai"; }
  async fetch(): Promise<ProviderUsage | null> {
    return new Promise<ProviderUsage | null>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new UsageError("NETWORK_ERROR", "Timed out waiting for Claude usage response."));
      }, 10_000);
      const finish = (callback: () => void) => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        callback();
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = asObject(event.data);
        if (message?.source !== MESSAGE_SOURCE || message.type !== RESPONSE_TYPE || message.provider !== "claude") return;
        const payload = asObject(message.payload);
        if (!payload || typeof payload.ok !== "boolean") return;
        if (!payload.ok) {
          const code = typeof payload.errorCode === "string" && ALLOWED_ERRORS.has(payload.errorCode as UsageErrorCode)
            ? payload.errorCode as UsageErrorCode : "UNKNOWN";
          finish(() => reject(new UsageError(code, "Claude native usage request failed.")));
          return;
        }
        const parsed = parseClaudeUsage(payload.usage, payload.organization, typeof payload.fetchedAt === "string" ? payload.fetchedAt : undefined);
        const rawUsage = asObject(payload.usage);
        const containsWindowData = rawUsage && Object.values(rawUsage).some((value) => {
          const window = asObject(value);
          return window && (window.utilization !== undefined || window.resets_at !== undefined || window.reset_at !== undefined);
        });
        finish(() => parsed
          ? resolve(parsed)
          : reject(new UsageError(
            containsWindowData ? "RESPONSE_FORMAT_CHANGED" : "UNSUPPORTED_ACCOUNT",
            containsWindowData
              ? "Claude usage response did not contain valid recognized windows."
              : "Claude did not expose usage windows for this account."
          )));
      };
      window.addEventListener("message", onMessage);
      window.postMessage({ source: MESSAGE_SOURCE, type: REQUEST_TYPE, provider: "claude", force: true }, location.origin);
    });
  }
}
