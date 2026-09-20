import { StrategyProvider } from "../base-provider";
import { SemanticUsageDomStrategy } from "../dom-strategy";
import { ChatGptNativeUsageStrategy } from "./chatgpt-strategies";
export class ChatGptProvider extends StrategyProvider {
  readonly id = "chatgpt" as const;
  constructor(location: Location) { super(location, [new ChatGptNativeUsageStrategy(), new SemanticUsageDomStrategy("chatgpt", [{ id: "weekly", label: "Weekly", headingPattern: /weekly (?:usage|limit)/i }])]); }
  matches(value: Location): boolean { return value.hostname === "chatgpt.com"; }
}
