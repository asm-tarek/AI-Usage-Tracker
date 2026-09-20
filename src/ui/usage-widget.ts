import type { ProviderId, ProviderUsage } from "../providers/types";
import type { UserSettings } from "../storage/storage-types";
import { formatAge, formatRelativeTime } from "../utils/dates";
import { compactReset, displayPercent, isDarkBackground, overallSeverity, pillSegments, severity } from "./widget-model";

export { displayPercent } from "./widget-model";

export type WidgetState =
  | { kind: "loading"; cached?: ProviderUsage }
  | { kind: "ready"; usage: ProviderUsage }
  | { kind: "error"; cached?: ProviderUsage; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "logged-out"; provider: ProviderId };

// Design intent: a small, neutral pill that is easy to glance past. Color only
// appears near a limit, details open on hover or keyboard focus, and nothing
// animates when data refreshes in the background.
const css = `
:host{all:initial;--surface:#fff;--text:#1f1f1f;--text-2:#5f6368;--muted:#80868b;--border:rgba(0,0,0,.2);--track:rgba(0,0,0,.08);--neutral-fill:#8a8f94;--ok-text:#1e7b34;--warn-text:#9a6200;--warn-border:#e3b35a;--warn-fill:#d89614;--crit-text:#b3261e;--crit-border:#f0b4ae;--crit-fill:#d93025;--crit-bg:#fdecea;--hover:rgba(0,0,0,.06);--shadow:0 6px 20px rgba(0,0,0,.12);font:13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}
:host([data-theme=dark]){--surface:#303030;--text:#ececec;--text-2:#c4c4c4;--muted:#8e8e8e;--border:rgba(255,255,255,.24);--track:rgba(255,255,255,.1);--neutral-fill:#9a9a9a;--ok-text:#6fd08c;--warn-text:#f2c46d;--warn-border:#7a5a1a;--warn-fill:#e0a93b;--crit-text:#f6a39c;--crit-border:#7c2f2a;--crit-fill:#ec5b50;--crit-bg:#3d1f1d;--hover:rgba(255,255,255,.08);--shadow:0 6px 20px rgba(0,0,0,.45)}
.anchor{position:fixed;z-index:2147483000;display:flex}
/* Two panels side by side: a full-height arrow strip, then the readings. */
.dock{display:flex;align-items:stretch}
.toggle{order:-1;display:grid;place-items:center;width:16px;padding:0;border:1px solid var(--border);border-radius:10px 0 0 10px;background:var(--surface);color:var(--muted);font-size:12px;line-height:1;cursor:pointer}
.chev{display:block;transform:scaleY(1.9)}
.toggle:hover{color:var(--text);background-image:linear-gradient(var(--hover),var(--hover))}
.toggle:focus-visible{outline:2px solid #1a73e8;outline-offset:1px;z-index:1}
.dock .pill{border-left:0;border-radius:0 10px 10px 0;padding-left:8px}
.collapsed .toggle{width:18px;height:42px;border-right:1px solid var(--border);border-radius:9px}
.collapsed .pill{display:none}
[data-severity=warning].collapsed .toggle{color:var(--warn-text);border-color:var(--warn-border)}
[data-severity=critical].collapsed .toggle{color:var(--crit-text);border-color:var(--crit-border)}
.anchor.placing{visibility:hidden}
/* Over bare page content (ChatGPT's chat view has no solid header bar), the
   pill steps out of the way while the page scrolls so text stays readable. */
.anchor.over-content.scrolling:not(:hover):not(.open) .pill{opacity:.15}
@media (prefers-reduced-motion:no-preference){.anchor.over-content .pill{transition:opacity .2s ease}}
.top-center{top:12px;left:50%;transform:translateX(-50%)}.top-right{top:72px;right:18px}.bottom-right{right:18px;bottom:96px}.top-left{top:72px;left:18px}.bottom-left{left:18px;bottom:96px}
button{font-family:inherit}
.pill{display:grid;gap:3px;padding:7px 10px;box-sizing:border-box;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text-2);font-size:12px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:left;cursor:pointer}
.pill:hover{border-color:var(--text-2)}
.pill:focus-visible,.icon:focus-visible,.retry:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}
.seg{display:grid;grid-template-columns:14px 30px auto;gap:4px;align-items:baseline}
.lbl{font-weight:400;color:var(--text-2)}
.pct{font-weight:600;color:var(--text);text-align:right}
.rst{font-weight:400;color:var(--text-2)}
.sep{display:none}
/* Only the percentage carries status color, so the numbers are easy to find and the pill itself stays calm. */
.seg.normal .pct{color:var(--ok-text)}.seg.warning .pct{color:var(--warn-text)}.seg.critical .pct{color:var(--crit-text)}
.popover{position:absolute;visibility:hidden;opacity:0;pointer-events:none;transition:visibility 0s linear .15s,opacity 0s linear .15s}
.bottom-right .popover,.bottom-left .popover{bottom:100%;padding-bottom:8px}
.top-center .popover,.top-right .popover,.top-left .popover{top:100%;padding-top:8px}
.top-center .popover{left:50%;transform:translateX(-50%)}
.bottom-right .popover,.top-right .popover{right:0}
.bottom-left .popover,.top-left .popover{left:0}
.anchor:not(.dismissed):has(.pill:hover) .popover,.anchor:not(.dismissed):has(.popover:hover) .popover,.anchor:not(.dismissed):has(:focus-visible) .popover,.anchor.open .popover{visibility:visible;opacity:1;pointer-events:auto;transition-delay:0s}
.always .pill{display:none}
.always .popover{position:static;padding:0;visibility:visible;opacity:1;pointer-events:auto}
.card{width:256px;box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:10px 12px}
header{display:flex;align-items:center;gap:2px;margin-bottom:8px}
.title{flex:1;font-weight:600}
.icon{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:6px;background:transparent;color:var(--text-2);font-size:15px;line-height:1;cursor:pointer}
.icon:hover{background:var(--hover);color:var(--text)}
.icon[hidden]{display:none}
.plan{font-size:11.5px;color:var(--text-2);margin-bottom:8px}
.window+.window{margin-top:10px}
.row{display:flex;justify-content:space-between;gap:8px}
.name{font-weight:500}
.value{font-variant-numeric:tabular-nums}
.window.normal .value{color:var(--ok-text)}.window.warning .value{color:var(--warn-text)}.window.critical .value{color:var(--crit-text)}
.track{height:4px;margin:5px 0 3px;background:var(--track);border-radius:999px;overflow:hidden}
.bar{height:100%;border-radius:999px;background:var(--neutral-fill)}
.bar.warning{background:var(--warn-fill)}.bar.critical{background:var(--crit-fill)}
.meta,.status{font-size:11.5px;color:var(--muted)}
.status{margin-top:10px}.status:first-child{margin-top:0}
.error{color:var(--crit-text)}
.badge{margin-left:4px;padding:0 5px;border:1px solid var(--border);border-radius:8px;font-size:10.5px}
.retry{margin-top:8px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--text);font-size:12px;cursor:pointer}
.retry:hover{background:var(--hover)}
@media (max-width:900px){.rst{display:none}.seg{grid-template-columns:18px 34px}}
@media (max-width:520px){.card{width:min(256px,calc(100vw - 36px))}}
`;

function providerName(id: ProviderId): string { return id === "chatgpt" ? "ChatGPT" : "Claude"; }
export function loggedOutMessage(_id: ProviderId): string {
  return "Sign in to view usage data. Usage information isn’t available while signed out.";
}

const HEADER_TOP = 12;
// ChatGPT's home page keeps its Chat/Cowork switcher in the middle of the top
// row, so the pill is parked left of centre there, with no obstacle checks.
const CHATGPT_HOME_GAP = 70;

/** True when an element's own background would hide content behind it. */
function isOpaqueBackground(style: CSSStyleDeclaration): boolean {
  const match = style.backgroundColor.match(/rgba?\(([^)]+)\)/);
  if (!match) return false;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || Number(parts[3]) >= 0.85;
}

/**
 * Whether a solid bar sits behind the pill's row. Only a pinned bar counts
 * (sticky or fixed, with an opaque background): the page's own background is
 * no protection, because its text scrolls straight past the pill.
 */
export function hasSolidBackdrop(host: Element, centerX: number, y: number): boolean {
  return document.elementsFromPoint(centerX, y)
    .filter((element) => element !== host && !host.contains(element) && element !== document.documentElement && element !== document.body)
    .some((element) => {
      const style = getComputedStyle(element);
      return isOpaqueBackground(style) && isScrollIndependent(element);
    });
}

/**
 * True when an element stays put as the page scrolls: a sticky or fixed bar,
 * or anything outside a scrolling container. Message text fails this, which is
 * what separates real header furniture from content passing underneath.
 */
export function isScrollIndependent(element: Element): boolean {
  for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.position === "fixed" || style.position === "sticky") return true;
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 4) return false;
  }
  return document.documentElement.scrollHeight <= window.innerHeight + 4;
}

export const isChatGptHome = (): boolean => location.hostname.endsWith("chatgpt.com") && location.pathname === "/";

/**
 * Where the pill sits in the top row: centred everywhere, except ChatGPT's
 * home page, whose centre holds the Chat/Cowork switcher. No page inspection
 * is involved, so the pill never shifts around as a page renders.
 */
export function findPlacement(width: number): { top: number; centerX: number } {
  const viewport = window.innerWidth;
  const centre = viewport / 2;
  if (!isChatGptHome()) return { top: HEADER_TOP, centerX: Math.round(centre) };
  const minCenter = Math.max(width / 2, 136) + 12;
  return { top: HEADER_TOP, centerX: Math.round(Math.max(minCenter, centre - CHATGPT_HOME_GAP - width / 2)) };
}

export class UsageWidget {
  private readonly host = document.createElement("div");
  private readonly root = this.host.attachShadow({ mode: "open" });
  private readonly anchor: HTMLDivElement;
  private readonly pill: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly body: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private state: WidgetState = { kind: "loading" };
  private currentSettings: UserSettings;
  private pinned = false;
  private readonly disposers: Array<() => void> = [];
  onRefresh: (() => void) | undefined;
  onCollapsedChange: ((collapsed: boolean) => void) | undefined;

  constructor(private readonly provider: ProviderId, settings: UserSettings) {
    this.currentSettings = settings;
    this.host.id = "ai-usage-tracker-host";
    const title = `Usage limits · ${providerName(provider)}`;
    // The structure is built once; updates only replace the pill contents and
    // card body, so the pill and header buttons keep hover and keyboard focus.
    // The pill comes first so Tab moves from it into the card's buttons.
    this.root.innerHTML = `<style>${css}</style><div class="anchor"><div class="dock"><button class="pill" type="button" aria-controls="details" aria-expanded="false"></button><button class="toggle" type="button"></button></div><div class="popover" id="details" role="region" aria-label="${title}"><div class="card"><header><span class="title">${title}</span><button class="icon refresh" type="button" aria-label="Refresh usage" title="Refresh">↻</button><button class="icon close" type="button" aria-label="Close usage details" title="Close" hidden>×</button></header><div class="body"></div></div></div></div>`;
    this.anchor = this.root.querySelector<HTMLDivElement>(".anchor")!;
    this.pill = this.root.querySelector<HTMLButtonElement>(".pill")!;
    this.toggle = this.root.querySelector<HTMLButtonElement>(".toggle")!;
    this.body = this.root.querySelector<HTMLDivElement>(".body")!;
    this.closeButton = this.root.querySelector<HTMLButtonElement>(".close")!;

    this.root.querySelector(".refresh")!.addEventListener("click", () => this.onRefresh?.());
    this.body.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest(".retry")) this.onRefresh?.();
    });
    this.pill.addEventListener("click", () => { this.anchor.classList.remove("dismissed"); this.setPinned(!this.pinned); });
    // The arrow minimizes the widget to a small tab, and restores it.
    this.toggle.addEventListener("click", () => {
      const collapsed = !this.currentSettings.collapsed;
      this.currentSettings = { ...this.currentSettings, collapsed };
      this.setPinned(false);
      this.render();
      this.onCollapsedChange?.(collapsed);
    });
    // Closing must win over hover: the pointer is still on the card when × is
    // clicked, so the card stays dismissed until the pointer leaves the widget.
    this.closeButton.addEventListener("click", () => this.dismiss());
    this.root.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape") this.dismiss();
    });
    this.anchor.addEventListener("pointerleave", () => this.anchor.classList.remove("dismissed"));
    this.anchor.addEventListener("focusout", (event) => {
      if (!this.anchor.contains((event as FocusEvent).relatedTarget as Node | null)) this.anchor.classList.remove("dismissed");
    });

    // Hidden until the first placement decides where it belongs.
    if (settings.position === "top-center" && !settings.alwaysExpanded) this.anchor.classList.add("placing");
    this.watchTheme();
    this.watchPlacement();
    this.render();
  }

  mount(): void { if (!this.host.isConnected) document.documentElement.append(this.host); }
  ensureMounted(): void { this.mount(); }
  remove(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.host.remove();
  }
  update(state: WidgetState): void { this.state = state; this.render(); }
  updateSettings(settings: UserSettings): void { this.currentSettings = settings; this.render(); }

  /** Refreshes relative time text in place without touching focus or hover. */
  tick(now = Date.now()): void {
    this.root.querySelectorAll<HTMLElement>("[data-reset-at]").forEach((node) => {
      node.textContent = formatRelativeTime(node.dataset.resetAt ?? "", now);
    });
    this.root.querySelectorAll<HTMLElement>("[data-reset-compact]").forEach((node) => {
      node.textContent = compactReset(node.dataset.resetCompact ?? "", now);
    });
    this.root.querySelectorAll<HTMLElement>("[data-fetched-at]").forEach((node) => {
      node.textContent = formatAge(node.dataset.fetchedAt ?? "", now);
    });
  }

  private dismiss(): void {
    this.setPinned(false);
    this.anchor.classList.add("dismissed");
    this.pill.focus({ preventScroll: true });
  }

  private setPinned(pinned: boolean): void {
    if (this.currentSettings.alwaysExpanded) return;
    this.pinned = pinned;
    this.renderChrome();
  }

  private visibleUsage(): ProviderUsage | undefined {
    if (this.state.kind === "ready") return this.state.usage;
    if (this.state.kind === "loading" || this.state.kind === "error") return this.state.cached;
    return undefined;
  }

  private render(): void {
    this.renderChrome();
    this.renderPill();
    this.renderBody();
    // The pill's width changes with its contents, so re-check where it fits.
    this.placeClear();
  }

  private renderChrome(): void {
    const collapsed = this.currentSettings.collapsed && !this.currentSettings.alwaysExpanded;
    // The arrow points the way the widget will go: "›" folds it toward the
    // corner, "‹" opens it back out.
    this.toggle.innerHTML = `<span class="chev">${collapsed ? "‹" : "›"}</span>`;
    this.toggle.setAttribute("aria-label", collapsed ? "Expand usage widget" : "Minimize usage widget");
    this.toggle.setAttribute("title", collapsed ? "Expand" : "Minimize");
    const always = this.currentSettings.alwaysExpanded;
    if (always) this.pinned = false;
    this.anchor.className = `anchor ${this.currentSettings.position}${always ? " always" : ""}${this.pinned ? " open" : ""}${collapsed ? " collapsed" : ""}${this.anchor.classList.contains("placing") ? " placing" : ""}${this.anchor.classList.contains("over-content") ? " over-content" : ""}${this.anchor.classList.contains("scrolling") ? " scrolling" : ""}${this.anchor.classList.contains("dismissed") ? " dismissed" : ""}`;
    this.pill.setAttribute("aria-expanded", String(this.pinned || always));
    this.closeButton.hidden = !this.pinned;
  }

  private renderPill(): void {
    const name = providerName(this.provider);
    const segments = pillSegments(this.visibleUsage());
    if (!segments.length) {
      this.anchor.dataset.severity = "normal";
      const status = this.state.kind === "loading" ? "loading"
        : this.state.kind === "logged-out" ? "sign in to view"
        : this.state.kind === "unavailable" ? "not available for this account"
        : "temporarily unavailable";
      this.pill.innerHTML = `<span class="seg"><span class="pct">–</span></span>`;
      this.pill.setAttribute("aria-label", `Usage limits · ${name}: ${status}`);
      return;
    }
    this.anchor.dataset.severity = overallSeverity(segments);
    // Every limit and its reset time are visible at a glance, so the card is
    // only needed for the plan name. "Show reset countdown" turns times off.
    const showResets = this.currentSettings.showResetCountdown;
    this.pill.innerHTML = segments.map((segment) => {
      const reset = showResets && segment.resetAt
        ? `<span class="rst"><span data-reset-compact="${escapeHtml(segment.resetAt)}">${compactReset(segment.resetAt)}</span></span>`
        : "";
      return `<span class="seg ${segment.severity}"><span class="lbl">${escapeHtml(segment.label)}</span><span class="pct">${Math.round(segment.percent)}%</span>${reset}</span>`;
    }).join(`<span class="sep"></span>`);
    const spoken = segments.map((segment) => {
      const reset = showResets && segment.resetAt ? `, ${formatRelativeTime(segment.resetAt).toLowerCase()}` : "";
      return `${segment.windowLabel} ${Math.round(segment.percent)}% used${reset}`;
    }).join("; ");
    this.pill.setAttribute("aria-label", `Usage limits · ${name}: ${spoken}`);
  }

  private renderBody(): void {
    const usage = this.visibleUsage();
    let html = usage ? this.renderUsage(usage) : "";
    if (this.state.kind === "loading" && !usage) html = `<div class="status">Loading usage…</div>`;
    if (this.state.kind === "error") html += `<div class="status error">${escapeHtml(this.state.message)}</div><button class="retry" type="button">Retry</button>`;
    if (this.state.kind === "unavailable") html = `<div class="status">${escapeHtml(this.state.message)}</div>`;
    if (this.state.kind === "logged-out") html = `<div class="status">${escapeHtml(loggedOutMessage(this.provider))}</div>`;
    this.body.innerHTML = html;
  }

  private renderUsage(usage: ProviderUsage): string {
    const windows = usage.windows.map((window) => {
      const used = displayPercent(window);
      if (used === undefined) return "";
      const level = severity(used);
      const label = escapeHtml(window.label);
      const reset = this.currentSettings.showResetCountdown && window.resetAt
        ? `<div class="meta" data-reset-at="${escapeHtml(window.resetAt)}" title="${escapeHtml(new Date(window.resetAt).toLocaleString())}">${formatRelativeTime(window.resetAt)}</div>`
        : "";
      return `<section class="window ${level}"><div class="row"><span class="name">${label}</span><span class="value">${Math.round(used * 10) / 10}%</span></div><div class="track" role="progressbar" aria-label="${label} used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${used}"><div class="bar ${level}" style="width:${used}%"></div></div>${reset}</section>`;
    }).join("");
    const cached = usage.stale || usage.source === "cache" ? '<span class="badge">Cached</span>' : "";
    const age = this.currentSettings.showLastUpdated
      ? `<div class="status">Updated <span data-fetched-at="${escapeHtml(usage.fetchedAt)}">${formatAge(usage.fetchedAt)}</span>${cached}</div>`
      : "";
    return `${usage.plan ? `<div class="plan">Plan: ${escapeHtml(usage.plan)}</div>` : ""}${windows}${age}`;
  }

  /**
   * Follows the site's own light/dark theme (which can differ from the OS
   * setting) by reading the page's actual background color.
   */
  private watchTheme(): void {
    const apply = () => {
      let dark: boolean | undefined;
      for (const element of [document.body, document.documentElement]) {
        if (!element) continue;
        dark = isDarkBackground(getComputedStyle(element).backgroundColor);
        if (dark !== undefined) break;
      }
      dark ??= window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = dark ? "dark" : "light";
      if (this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    };
    const timers: number[] = [];
    // Sites often transition their background when switching themes, so check
    // again once that transition has had time to finish.
    const schedule = () => {
      timers.push(window.setTimeout(apply, 50), window.setTimeout(apply, 500));
      while (timers.length > 6) window.clearTimeout(timers.shift());
    };
    apply();
    const attributes = ["class", "style", "data-theme", "data-mode", "data-color-scheme"];
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: attributes });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: attributes });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", schedule);
    this.disposers.push(() => {
      observer.disconnect();
      media.removeEventListener("change", schedule);
      timers.forEach((timer) => window.clearTimeout(timer));
    });
  }

  /**
   * Top center sits inside the site's header strip, but headers differ by site
   * and page. The pill never covers visible header content (text, buttons,
   * icons): it shifts sideways to the nearest free stretch of the header, and
   * only drops below the header when there's no room.
   */
  private watchPlacement(): void {
    const timers: number[] = [];
    const schedule = (...delays: number[]) => {
      for (const delay of delays) timers.push(window.setTimeout(() => this.placeClear(), delay));
      while (timers.length > 8) window.clearTimeout(timers.shift());
    };
    // Single-page apps render their header after load and on every navigation.
    schedule(0, 300, 1200, 3000);
    // Never leave the pill hidden if measuring keeps failing.
    timers.push(window.setTimeout(() => this.anchor.classList.remove("placing"), 2000));
    const onResize = () => schedule(150);
    const onNavigation = () => schedule(300, 1200);
    // Page text scrolling past the pill: dim it until scrolling stops.
    let scrollTimer: number | undefined;
    const onScroll = () => {
      this.anchor.classList.add("scrolling");
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => this.anchor.classList.remove("scrolling"), 450);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("ai-usage-tracker:navigation", onNavigation);
    window.addEventListener("popstate", onNavigation);
    this.disposers.push(() => {
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      window.removeEventListener("ai-usage-tracker:navigation", onNavigation);
      window.removeEventListener("popstate", onNavigation);
      timers.forEach((timer) => window.clearTimeout(timer));
    });
  }

  private placeClear(): void {
    if (this.currentSettings.position !== "top-center" || this.currentSettings.alwaysExpanded) {
      this.anchor.style.removeProperty("top");
      this.anchor.style.removeProperty("left");
      this.anchor.classList.remove("placing");
      return;
    }
    // Never move the pill while someone is using it.
    if (this.pinned || this.anchor.matches(":hover")) return;
    if (!this.host.isConnected) return;
    const box = this.root.querySelector<HTMLElement>(".dock")!.getBoundingClientRect();
    if (!box.width) return;
    const { top, centerX } = findPlacement(box.width);
    if (this.anchor.style.top !== `${top}px`) this.anchor.style.top = `${top}px`;
    if (this.anchor.style.left !== `${centerX}px`) this.anchor.style.left = `${centerX}px`;
    this.anchor.classList.toggle("over-content", !hasSolidBackdrop(this.host, centerX, top + (box.height || 26) / 2));
    // Stay hidden until there are real numbers: the placeholder pill is narrower,
    // so revealing it first would show the pill move once data arrives.
    if (this.state.kind !== "loading" || this.visibleUsage()) this.anchor.classList.remove("placing");
  }

}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}
