import { UsageWidget } from "../ui/usage-widget";
import { refreshUsage } from "../usage/usage-service";
import { providerFor } from "../providers/provider-registry";
import { clearCachedUsage, isSettingsChange, readSettings, writeSettings } from "../storage/storage";
import { logger } from "../utils/logger";
import { UsageError, type ProviderUsage } from "../providers/types";

const TICK_MS = 30_000;

export async function startWidget(): Promise<() => void> {
  const provider = providerFor(location);
  if (!provider) return () => undefined;
  let settings = await readSettings();
  logger.setDebug(settings.debug);
  if (!settings.enabled || !settings.providers[provider.id]) return () => undefined;
  const widget = new UsageWidget(provider.id, settings);
  widget.mount();
  // Do not render account-unverified cache on provider pages. A fresh request
  // prevents the previous account's usage from appearing after account switch.
  widget.update({ kind: "loading" });

  // Last usage verified in this page session. Shown alongside transient errors
  // from later refreshes so a background failure doesn't blank the widget.
  let lastUsage: ProviderUsage | undefined;
  let lastRefreshAt = 0;
  let refreshTimer: number | undefined;
  let disposed = false;

  const intervalMs = () => settings.refreshIntervalMinutes * 60_000;
  const scheduleNext = () => {
    window.clearTimeout(refreshTimer);
    if (disposed) return;
    const wait = Math.max(0, lastRefreshAt + intervalMs() - Date.now());
    refreshTimer = window.setTimeout(() => {
      // Hidden tabs don't poll; the visibilitychange handler catches up.
      if (!document.hidden) void runRefresh(false);
    }, wait);
  };

  const runRefresh = async (force = false) => {
    window.clearTimeout(refreshTimer);
    try {
      lastUsage = await refreshUsage(provider, force);
      widget.update({ kind: "ready", usage: lastUsage });
    } catch (error) {
      if (error instanceof UsageError && error.code === "NOT_LOGGED_IN") {
        lastUsage = undefined;
        await clearCachedUsage(provider.id);
        widget.update({ kind: "logged-out", provider: provider.id });
        return;
      }
      if (provider.id === "claude" && error instanceof UsageError && error.code === "UNSUPPORTED_ACCOUNT") {
        lastUsage = undefined;
        await clearCachedUsage(provider.id);
        widget.update({
          kind: "unavailable",
          message: "Usage information isn’t available for this Claude account. Claude Free does not currently provide a Usage page."
        });
        return;
      }
      widget.update({
        kind: "error",
        ...(lastUsage ? { cached: { ...lastUsage, stale: true } } : {}),
        message: error instanceof UsageError && error.code === "RATE_LIMITED"
          ? "Usage refresh is temporarily rate-limited. Please retry shortly."
          : `${provider.id === "claude" ? "Claude" : "ChatGPT"} usage is temporarily unavailable. Retry shortly.`
      });
    } finally {
      // Measured from completion: the cache timestamp is written when the fetch
      // finishes, so scheduling from the start would find the cache still
      // "fresh" at the next tick and silently skip every other refresh.
      lastRefreshAt = Date.now();
      scheduleNext();
    }
  };
  widget.onRefresh = () => void runRefresh(true);
  widget.onCollapsedChange = (collapsed) => {
    settings = { ...settings, collapsed };
    void writeSettings(settings);
  };
  void runRefresh(true);

  const tickTimer = window.setInterval(() => { if (!document.hidden) widget.tick(); }, TICK_MS);
  const onVisibilityChange = () => {
    if (document.hidden) return;
    widget.tick();
    if (Date.now() - lastRefreshAt >= intervalMs()) void runRefresh(false);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // The host is appended directly to <html>, so only direct children matter;
  // observing the whole subtree fired constantly while responses streamed in.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => { scheduled = false; widget.ensureMounted(); }, 250);
  });
  observer.observe(document.documentElement, { childList: true });

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    // Usage cache writes (from this or other tabs) don't affect display settings.
    if (areaName !== "local" || !isSettingsChange(changes)) return;
    void readSettings().then((next) => {
      const intervalChanged = next.refreshIntervalMinutes !== settings.refreshIntervalMinutes;
      settings = next;
      logger.setDebug(next.debug);
      widget.updateSettings(next);
      if (intervalChanged) scheduleNext();
    });
  };
  chrome.storage.onChanged.addListener(onStorage);

  return () => {
    disposed = true;
    window.clearTimeout(refreshTimer);
    window.clearInterval(tickTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    observer.disconnect();
    chrome.storage.onChanged.removeListener(onStorage);
    widget.remove();
  };
}
