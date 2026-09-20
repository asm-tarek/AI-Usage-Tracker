import { logger } from "../utils/logger";
import { UsageError, type ProviderId, type ProviderUsage, type UsageProvider, type UsageStrategy } from "./types";

export abstract class StrategyProvider implements UsageProvider {
  abstract readonly id: ProviderId;
  constructor(protected readonly location: Location, private readonly strategies: UsageStrategy[]) {}
  abstract matches(location: Location): boolean;
  async getUsage(): Promise<ProviderUsage> { return this.refreshUsage(); }
  async refreshUsage(): Promise<ProviderUsage> {
    const errors: string[] = [];
    let firstUsageError: UsageError | undefined;
    for (const strategy of this.strategies) {
      try {
        if (!(await strategy.isAvailable({ provider: this.id, location: this.location }))) continue;
        logger.debug("Trying usage strategy", { provider: this.id, strategy: strategy.name });
        const result = await strategy.fetch({ provider: this.id, location: this.location });
        if (result?.windows.length) return result;
      } catch (error) {
        if (error instanceof UsageError && !firstUsageError) firstUsageError = error;
        errors.push(error instanceof UsageError ? error.code : "UNKNOWN");
        logger.debug("Usage strategy failed", { provider: this.id, strategy: strategy.name, reason: errors.at(-1) });
      }
    }
    if (firstUsageError) throw firstUsageError;
    throw new UsageError("USAGE_ENDPOINT_NOT_FOUND", `No verified usage strategy returned data (${errors.join(", ") || "none configured"}).`);
  }
}
