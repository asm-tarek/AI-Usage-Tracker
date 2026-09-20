import type { ProviderId } from "../providers/types";
export function detectProvider(hostname = location.hostname): ProviderId | undefined {
  if (hostname === "chatgpt.com") return "chatgpt";
  if (hostname === "claude.ai") return "claude";
  return undefined;
}
