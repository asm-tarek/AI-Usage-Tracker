import type { ProviderId, ProviderUsage } from "../providers/types";

export type WidgetPosition = "top-center" | "top-right" | "bottom-right" | "top-left" | "bottom-left";
export interface UserSettings {
  enabled: boolean;
  providers: Record<ProviderId, boolean>;
  refreshIntervalMinutes: 1 | 5 | 15 | 30;
  position: WidgetPosition;
  /** Show the full details card permanently instead of the compact pill. */
  alwaysExpanded: boolean;
  /** Minimized to just the arrow tab. */
  collapsed: boolean;
  showResetCountdown: boolean;
  showLastUpdated: boolean;
  notificationsEnabled: boolean;
  notificationThreshold: number;
  debug: boolean;
}
export interface CachedUsage { data: ProviderUsage; savedAt: number }
export interface ExtensionStorage {
  version: 3;
  settings: UserSettings;
  providers: Partial<Record<ProviderId, CachedUsage>>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  providers: { chatgpt: true, claude: true },
  refreshIntervalMinutes: 5,
  position: "bottom-right",
  alwaysExpanded: false,
  collapsed: false,
  showResetCountdown: true,
  showLastUpdated: true,
  notificationsEnabled: false,
  notificationThreshold: 80,
  debug: false
};
export const DEFAULT_STORAGE: ExtensionStorage = { version: 3, settings: DEFAULT_SETTINGS, providers: {} };
