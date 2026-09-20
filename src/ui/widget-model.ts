import type { ProviderUsage, UsageWindow } from "../providers/types";
import { formatRelativeTime } from "../utils/dates";

export type Severity = "normal" | "warning" | "critical";

// Color is reserved for when a limit actually matters. Below 70% the widget
// stays neutral so it reads as part of the page rather than as an alert.
export const WARNING_PERCENT = 70;
export const CRITICAL_PERCENT = 90;

export function severity(percent: number): Severity {
  return percent >= CRITICAL_PERCENT ? "critical" : percent >= WARNING_PERCENT ? "warning" : "normal";
}

export function displayPercent(window: UsageWindow): number | undefined {
  if (typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100) {
    return window.usedPercent;
  }
  if (typeof window.remainingPercent === "number" && Number.isFinite(window.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100) {
    return 100 - window.remainingPercent;
  }
  return undefined;
}

/** Compact window name for the pill: "5h", "wk", "mo", … */
export function shortLabel(window: UsageWindow): string {
  if (window.shortLabel) return window.shortLabel;
  const text = `${window.id} ${window.label}`.toLowerCase();
  if (/five_hour|five-hour|5-hour|5 hour|session/.test(text)) return "5h";
  if (/seven_day|weekly|7-day|all models/.test(text)) return "wk";
  if (/monthly/.test(text)) return "mo";
  if (/daily/.test(text)) return "day";
  if (/annual/.test(text)) return "yr";
  const hours = text.match(/(\d+)-hour/);
  if (hours) return `${hours[1]}h`;
  const days = text.match(/(\d+)-day/);
  if (days) return `${days[1]}d`;
  return "";
}

/** "Reset in 2h 14m" → "2h 14m"; a reset that's already due → "now". */
export function compactReset(iso: string, now = Date.now()): string {
  const text = formatRelativeTime(iso, now);
  if (text === "Reset due") return "now";
  return text.replace(/^Reset in /, "");
}

export interface PillSegment {
  id: string;
  percent: number;
  label: string;
  severity: Severity;
  windowLabel: string;
  resetAt?: string;
}

/** One compact segment per displayable window, in the provider's order (shortest window first). */
export function pillSegments(usage: ProviderUsage | undefined): PillSegment[] {
  return (usage?.windows ?? []).flatMap((window) => {
    const percent = displayPercent(window);
    if (percent === undefined) return [];
    return [{
      id: window.id,
      percent,
      label: shortLabel(window) || window.label.slice(0, 8),
      severity: severity(percent),
      windowLabel: window.label,
      ...(window.resetAt ? { resetAt: window.resetAt } : {})
    }];
  });
}

const RANK: Record<Severity, number> = { normal: 0, warning: 1, critical: 2 };
/** The pill's outline and background follow its most urgent segment. */
export function overallSeverity(segments: PillSegment[]): Severity {
  return segments.reduce<Severity>((worst, segment) => RANK[segment.severity] > RANK[worst] ? segment.severity : worst, "normal");
}

/** Parses Chrome's computed `rgb()` / `rgba()` strings. */
export function parseRgb(value: string): { r: number; g: number; b: number; a: number } | undefined {
  const match = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return undefined;
  const alphaText = match[4];
  const a = alphaText === undefined ? 1 : alphaText.endsWith("%") ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a };
}

/** True when a computed background color is dark; undefined when it can't tell (e.g. transparent). */
export function isDarkBackground(value: string): boolean | undefined {
  const rgb = parseRgb(value);
  if (!rgb || rgb.a < 0.5) return undefined;
  const channel = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance < 0.4;
}
