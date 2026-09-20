import type { ProviderId } from "../providers/types";
export type ExtensionMessage = { type: "GET_STATE" } | { type: "REFRESH_ACTIVE"; provider: ProviderId };
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "GET_STATE" || (message.type === "REFRESH_ACTIVE" && ["chatgpt", "claude"].includes(String(message.provider)));
}
