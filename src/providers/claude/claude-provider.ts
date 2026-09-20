import { StrategyProvider } from "../base-provider";
import { SemanticUsageDomStrategy } from "../dom-strategy";
import { ClaudeNativeUsageStrategy } from "./claude-strategies";
export class ClaudeProvider extends StrategyProvider {
  readonly id = "claude" as const;
  constructor(location: Location) {
    super(location, [new ClaudeNativeUsageStrategy(), new SemanticUsageDomStrategy("claude", [
      { id: "five-hour", label: "Session / 5 hour", headingPattern: /(?:session|five|5)[ -]?hour/i },
      { id: "weekly", label: "Weekly", headingPattern: /weekly/i },
      { id: "opus-weekly", label: "Opus Weekly", headingPattern: /opus.*weekly|weekly.*opus/i }
    ])]);
  }
  matches(value: Location): boolean { return value.hostname === "claude.ai"; }
}
