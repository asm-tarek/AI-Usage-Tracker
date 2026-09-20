let debugEnabled = false;
export const logger = {
  setDebug(value: boolean) { debugEnabled = value; },
  debug(message: string, safeDetails?: Record<string, unknown>) {
    if (debugEnabled) console.debug(`[AI Usage Tracker] ${message}`, safeDetails ?? "");
  },
  warn(message: string) { if (debugEnabled) console.warn(`[AI Usage Tracker] ${message}`); }
};
