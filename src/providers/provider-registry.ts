import { ChatGptProvider } from "./chatgpt/chatgpt-provider";
import { ClaudeProvider } from "./claude/claude-provider";
import type { UsageProvider } from "./types";
export function providerFor(location: Location): UsageProvider | undefined {
  return [new ChatGptProvider(location), new ClaudeProvider(location)].find((provider) => provider.matches(location));
}
