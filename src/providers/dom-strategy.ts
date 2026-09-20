import type { ProviderId, ProviderUsage, UsageStrategy, UsageWindow } from "./types";
import { normalizePercentage } from "../usage/normalization";

export interface DomRule { id: string; label: string; headingPattern: RegExp }
export class SemanticUsageDomStrategy implements UsageStrategy {
  readonly name = "semantic-usage-page-dom";
  constructor(private readonly provider: ProviderId, private readonly rules: DomRule[]) {}
  async isAvailable(): Promise<boolean> { return /usage|limits?|quota/i.test(location.pathname + location.hash); }
  async fetch(): Promise<ProviderUsage | null> {
    const text = document.body?.innerText ?? "";
    const windows: UsageWindow[] = [];
    for (const rule of this.rules) {
      const heading = text.match(rule.headingPattern)?.[0];
      if (!heading) continue;
      const nearby = text.slice(Math.max(0, text.indexOf(heading)), text.indexOf(heading) + 500);
      const percent = nearby.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const normalized = normalizePercentage({ usedPercent: percent ? Number(percent[1]) : undefined });
      if (normalized.usedPercent !== undefined) windows.push({ id: rule.id, label: rule.label, ...normalized });
    }
    return windows.length ? { provider: this.provider, windows, fetchedAt: new Date().toISOString(), source: "dom" } : null;
  }
}
