// src/utils/dates.ts
function formatRelativeTime(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff)) return "Unknown reset time";
  if (diff <= 0) return "Reset due";
  const minutes = Math.floor(diff / 6e4);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const mins = minutes % 60;
  if (days) return `Reset in ${days}d ${hours}h`;
  if (hours) return `Reset in ${hours}h ${mins}m`;
  return `Reset in ${Math.max(1, mins)}m`;
}
function formatAge(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1e3));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

// src/ui/widget-model.ts
var WARNING_PERCENT = 70;
var CRITICAL_PERCENT = 90;
function severity(percent) {
  return percent >= CRITICAL_PERCENT ? "critical" : percent >= WARNING_PERCENT ? "warning" : "normal";
}
function displayPercent(window2) {
  if (typeof window2.usedPercent === "number" && Number.isFinite(window2.usedPercent) && window2.usedPercent >= 0 && window2.usedPercent <= 100) {
    return window2.usedPercent;
  }
  if (typeof window2.remainingPercent === "number" && Number.isFinite(window2.remainingPercent) && window2.remainingPercent >= 0 && window2.remainingPercent <= 100) {
    return 100 - window2.remainingPercent;
  }
  return void 0;
}
function shortLabel(window2) {
  if (window2.shortLabel) return window2.shortLabel;
  const text = `${window2.id} ${window2.label}`.toLowerCase();
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
function compactReset(iso, now = Date.now()) {
  const text = formatRelativeTime(iso, now);
  if (text === "Reset due") return "now";
  return text.replace(/^Reset in /, "");
}
function pillSegments(usage) {
  return (usage?.windows ?? []).flatMap((window2) => {
    const percent = displayPercent(window2);
    if (percent === void 0) return [];
    return [{
      id: window2.id,
      percent,
      label: shortLabel(window2) || window2.label.slice(0, 8),
      severity: severity(percent),
      windowLabel: window2.label,
      ...window2.resetAt ? { resetAt: window2.resetAt } : {}
    }];
  });
}
var RANK = { normal: 0, warning: 1, critical: 2 };
function overallSeverity(segments) {
  return segments.reduce((worst, segment) => RANK[segment.severity] > RANK[worst] ? segment.severity : worst, "normal");
}
function parseRgb(value) {
  const match = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return void 0;
  const alphaText = match[4];
  const a = alphaText === void 0 ? 1 : alphaText.endsWith("%") ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a };
}
function isDarkBackground(value) {
  const rgb = parseRgb(value);
  if (!rgb || rgb.a < 0.5) return void 0;
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance < 0.4;
}

// src/ui/usage-widget.ts
var css = `
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
function providerName(id) {
  return id === "chatgpt" ? "ChatGPT" : "Claude";
}
function loggedOutMessage(_id) {
  return "Sign in to view usage data. Usage information isn\u2019t available while signed out.";
}
var HEADER_TOP = 12;
var CHATGPT_HOME_GAP = 70;
function isOpaqueBackground(style) {
  const match = style.backgroundColor.match(/rgba?\(([^)]+)\)/);
  if (!match) return false;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || Number(parts[3]) >= 0.85;
}
function hasSolidBackdrop(host, centerX, y) {
  return document.elementsFromPoint(centerX, y).filter((element) => element !== host && !host.contains(element) && element !== document.documentElement && element !== document.body).some((element) => {
    const style = getComputedStyle(element);
    return isOpaqueBackground(style) && isScrollIndependent(element);
  });
}
function isScrollIndependent(element) {
  for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.position === "fixed" || style.position === "sticky") return true;
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight + 4) return false;
  }
  return document.documentElement.scrollHeight <= window.innerHeight + 4;
}
var isChatGptHome = () => location.hostname.endsWith("chatgpt.com") && location.pathname === "/";
function findPlacement(width) {
  const viewport = window.innerWidth;
  const centre = viewport / 2;
  if (!isChatGptHome()) return { top: HEADER_TOP, centerX: Math.round(centre) };
  const minCenter = Math.max(width / 2, 136) + 12;
  return { top: HEADER_TOP, centerX: Math.round(Math.max(minCenter, centre - CHATGPT_HOME_GAP - width / 2)) };
}
var UsageWidget = class {
  constructor(provider, settings) {
    this.provider = provider;
    this.currentSettings = settings;
    this.host.id = "ai-usage-tracker-host";
    const title = `Usage limits \xB7 ${providerName(provider)}`;
    this.root.innerHTML = `<style>${css}</style><div class="anchor"><div class="dock"><button class="pill" type="button" aria-controls="details" aria-expanded="false"></button><button class="toggle" type="button"></button></div><div class="popover" id="details" role="region" aria-label="${title}"><div class="card"><header><span class="title">${title}</span><button class="icon refresh" type="button" aria-label="Refresh usage" title="Refresh">\u21BB</button><button class="icon close" type="button" aria-label="Close usage details" title="Close" hidden>\xD7</button></header><div class="body"></div></div></div></div>`;
    this.anchor = this.root.querySelector(".anchor");
    this.pill = this.root.querySelector(".pill");
    this.toggle = this.root.querySelector(".toggle");
    this.body = this.root.querySelector(".body");
    this.closeButton = this.root.querySelector(".close");
    this.root.querySelector(".refresh").addEventListener("click", () => this.onRefresh?.());
    this.body.addEventListener("click", (event) => {
      if (event.target?.closest(".retry")) this.onRefresh?.();
    });
    this.pill.addEventListener("click", () => {
      this.anchor.classList.remove("dismissed");
      this.setPinned(!this.pinned);
    });
    this.toggle.addEventListener("click", () => {
      const collapsed = !this.currentSettings.collapsed;
      this.currentSettings = { ...this.currentSettings, collapsed };
      this.setPinned(false);
      this.render();
      this.onCollapsedChange?.(collapsed);
    });
    this.closeButton.addEventListener("click", () => this.dismiss());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.dismiss();
    });
    this.anchor.addEventListener("pointerleave", () => this.anchor.classList.remove("dismissed"));
    this.anchor.addEventListener("focusout", (event) => {
      if (!this.anchor.contains(event.relatedTarget)) this.anchor.classList.remove("dismissed");
    });
    if (settings.position === "top-center" && !settings.alwaysExpanded) this.anchor.classList.add("placing");
    this.watchTheme();
    this.watchPlacement();
    this.render();
  }
  provider;
  host = document.createElement("div");
  root = this.host.attachShadow({ mode: "open" });
  anchor;
  pill;
  toggle;
  body;
  closeButton;
  state = { kind: "loading" };
  currentSettings;
  pinned = false;
  disposers = [];
  onRefresh;
  onCollapsedChange;
  mount() {
    if (!this.host.isConnected) document.documentElement.append(this.host);
  }
  ensureMounted() {
    this.mount();
  }
  remove() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.host.remove();
  }
  update(state) {
    this.state = state;
    this.render();
  }
  updateSettings(settings) {
    this.currentSettings = settings;
    this.render();
  }
  /** Refreshes relative time text in place without touching focus or hover. */
  tick(now = Date.now()) {
    this.root.querySelectorAll("[data-reset-at]").forEach((node) => {
      node.textContent = formatRelativeTime(node.dataset.resetAt ?? "", now);
    });
    this.root.querySelectorAll("[data-reset-compact]").forEach((node) => {
      node.textContent = compactReset(node.dataset.resetCompact ?? "", now);
    });
    this.root.querySelectorAll("[data-fetched-at]").forEach((node) => {
      node.textContent = formatAge(node.dataset.fetchedAt ?? "", now);
    });
  }
  dismiss() {
    this.setPinned(false);
    this.anchor.classList.add("dismissed");
    this.pill.focus({ preventScroll: true });
  }
  setPinned(pinned) {
    if (this.currentSettings.alwaysExpanded) return;
    this.pinned = pinned;
    this.renderChrome();
  }
  visibleUsage() {
    if (this.state.kind === "ready") return this.state.usage;
    if (this.state.kind === "loading" || this.state.kind === "error") return this.state.cached;
    return void 0;
  }
  render() {
    this.renderChrome();
    this.renderPill();
    this.renderBody();
    this.placeClear();
  }
  renderChrome() {
    const collapsed = this.currentSettings.collapsed && !this.currentSettings.alwaysExpanded;
    this.toggle.innerHTML = `<span class="chev">${collapsed ? "\u2039" : "\u203A"}</span>`;
    this.toggle.setAttribute("aria-label", collapsed ? "Expand usage widget" : "Minimize usage widget");
    this.toggle.setAttribute("title", collapsed ? "Expand" : "Minimize");
    const always = this.currentSettings.alwaysExpanded;
    if (always) this.pinned = false;
    this.anchor.className = `anchor ${this.currentSettings.position}${always ? " always" : ""}${this.pinned ? " open" : ""}${collapsed ? " collapsed" : ""}${this.anchor.classList.contains("placing") ? " placing" : ""}${this.anchor.classList.contains("over-content") ? " over-content" : ""}${this.anchor.classList.contains("scrolling") ? " scrolling" : ""}${this.anchor.classList.contains("dismissed") ? " dismissed" : ""}`;
    this.pill.setAttribute("aria-expanded", String(this.pinned || always));
    this.closeButton.hidden = !this.pinned;
  }
  renderPill() {
    const name = providerName(this.provider);
    const segments = pillSegments(this.visibleUsage());
    if (!segments.length) {
      this.anchor.dataset.severity = "normal";
      const status = this.state.kind === "loading" ? "loading" : this.state.kind === "logged-out" ? "sign in to view" : this.state.kind === "unavailable" ? "not available for this account" : "temporarily unavailable";
      this.pill.innerHTML = `<span class="seg"><span class="pct">\u2013</span></span>`;
      this.pill.setAttribute("aria-label", `Usage limits \xB7 ${name}: ${status}`);
      return;
    }
    this.anchor.dataset.severity = overallSeverity(segments);
    const showResets = this.currentSettings.showResetCountdown;
    this.pill.innerHTML = segments.map((segment) => {
      const reset = showResets && segment.resetAt ? `<span class="rst"><span data-reset-compact="${escapeHtml(segment.resetAt)}">${compactReset(segment.resetAt)}</span></span>` : "";
      return `<span class="seg ${segment.severity}"><span class="lbl">${escapeHtml(segment.label)}</span><span class="pct">${Math.round(segment.percent)}%</span>${reset}</span>`;
    }).join(`<span class="sep"></span>`);
    const spoken = segments.map((segment) => {
      const reset = showResets && segment.resetAt ? `, ${formatRelativeTime(segment.resetAt).toLowerCase()}` : "";
      return `${segment.windowLabel} ${Math.round(segment.percent)}% used${reset}`;
    }).join("; ");
    this.pill.setAttribute("aria-label", `Usage limits \xB7 ${name}: ${spoken}`);
  }
  renderBody() {
    const usage = this.visibleUsage();
    let html = usage ? this.renderUsage(usage) : "";
    if (this.state.kind === "loading" && !usage) html = `<div class="status">Loading usage\u2026</div>`;
    if (this.state.kind === "error") html += `<div class="status error">${escapeHtml(this.state.message)}</div><button class="retry" type="button">Retry</button>`;
    if (this.state.kind === "unavailable") html = `<div class="status">${escapeHtml(this.state.message)}</div>`;
    if (this.state.kind === "logged-out") html = `<div class="status">${escapeHtml(loggedOutMessage(this.provider))}</div>`;
    this.body.innerHTML = html;
  }
  renderUsage(usage) {
    const windows = usage.windows.map((window2) => {
      const used = displayPercent(window2);
      if (used === void 0) return "";
      const level = severity(used);
      const label = escapeHtml(window2.label);
      const reset = this.currentSettings.showResetCountdown && window2.resetAt ? `<div class="meta" data-reset-at="${escapeHtml(window2.resetAt)}" title="${escapeHtml(new Date(window2.resetAt).toLocaleString())}">${formatRelativeTime(window2.resetAt)}</div>` : "";
      return `<section class="window ${level}"><div class="row"><span class="name">${label}</span><span class="value">${Math.round(used * 10) / 10}%</span></div><div class="track" role="progressbar" aria-label="${label} used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${used}"><div class="bar ${level}" style="width:${used}%"></div></div>${reset}</section>`;
    }).join("");
    const cached = usage.stale || usage.source === "cache" ? '<span class="badge">Cached</span>' : "";
    const age = this.currentSettings.showLastUpdated ? `<div class="status">Updated <span data-fetched-at="${escapeHtml(usage.fetchedAt)}">${formatAge(usage.fetchedAt)}</span>${cached}</div>` : "";
    return `${usage.plan ? `<div class="plan">Plan: ${escapeHtml(usage.plan)}</div>` : ""}${windows}${age}`;
  }
  /**
   * Follows the site's own light/dark theme (which can differ from the OS
   * setting) by reading the page's actual background color.
   */
  watchTheme() {
    const apply = () => {
      let dark;
      for (const element of [document.body, document.documentElement]) {
        if (!element) continue;
        dark = isDarkBackground(getComputedStyle(element).backgroundColor);
        if (dark !== void 0) break;
      }
      dark ??= window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = dark ? "dark" : "light";
      if (this.host.dataset.theme !== theme) this.host.dataset.theme = theme;
    };
    const timers = [];
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
  watchPlacement() {
    const timers = [];
    const schedule = (...delays) => {
      for (const delay of delays) timers.push(window.setTimeout(() => this.placeClear(), delay));
      while (timers.length > 8) window.clearTimeout(timers.shift());
    };
    schedule(0, 300, 1200, 3e3);
    timers.push(window.setTimeout(() => this.anchor.classList.remove("placing"), 2e3));
    const onResize = () => schedule(150);
    const onNavigation = () => schedule(300, 1200);
    let scrollTimer;
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
  placeClear() {
    if (this.currentSettings.position !== "top-center" || this.currentSettings.alwaysExpanded) {
      this.anchor.style.removeProperty("top");
      this.anchor.style.removeProperty("left");
      this.anchor.classList.remove("placing");
      return;
    }
    if (this.pinned || this.anchor.matches(":hover")) return;
    if (!this.host.isConnected) return;
    const box = this.root.querySelector(".dock").getBoundingClientRect();
    if (!box.width) return;
    const { top, centerX } = findPlacement(box.width);
    if (this.anchor.style.top !== `${top}px`) this.anchor.style.top = `${top}px`;
    if (this.anchor.style.left !== `${centerX}px`) this.anchor.style.left = `${centerX}px`;
    this.anchor.classList.toggle("over-content", !hasSolidBackdrop(this.host, centerX, top + (box.height || 26) / 2));
    if (this.state.kind !== "loading" || this.visibleUsage()) this.anchor.classList.remove("placing");
  }
};
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

// src/storage/storage-types.ts
var DEFAULT_SETTINGS = {
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

// src/storage/storage.ts
var LEGACY_ROOT_KEY = "aiUsageTracker";
var SCHEMA_KEY = "schemaVersion";
var SETTINGS_KEY = "settings";
var SPLIT_SCHEMA_VERSION = 4;
var PROVIDER_IDS = ["chatgpt", "claude"];
var usageKey = (provider) => `usage:${provider}`;
function normalizeSettings(value) {
  const old = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_SETTINGS,
    ...old,
    providers: {
      chatgpt: old.providers?.chatgpt ?? DEFAULT_SETTINGS.providers.chatgpt,
      claude: old.providers?.claude ?? DEFAULT_SETTINGS.providers.claude
    }
  };
}
function migrateStorage(value) {
  if (!value || typeof value !== "object") return { version: 3, settings: structuredClone(DEFAULT_SETTINGS), providers: {} };
  const candidate = value;
  const oldProviders = candidate.providers;
  const providers = {};
  if (oldProviders?.chatgpt) providers.chatgpt = oldProviders.chatgpt;
  if (candidate.version === 3 && oldProviders?.claude) providers.claude = oldProviders.claude;
  return { version: 3, settings: normalizeSettings(candidate.settings), providers };
}
var migration;
function ensureMigrated() {
  migration ??= (async () => {
    const existing = await chrome.storage.local.get([SCHEMA_KEY, LEGACY_ROOT_KEY]);
    if (existing[SCHEMA_KEY] === SPLIT_SCHEMA_VERSION) return;
    const legacy = migrateStorage(existing[LEGACY_ROOT_KEY]);
    const items = { [SCHEMA_KEY]: SPLIT_SCHEMA_VERSION, [SETTINGS_KEY]: legacy.settings };
    for (const id of PROVIDER_IDS) {
      const cached = legacy.providers[id];
      if (cached) items[usageKey(id)] = cached;
    }
    await chrome.storage.local.set(items);
    await chrome.storage.local.remove(LEGACY_ROOT_KEY);
  })().catch((error) => {
    migration = void 0;
    throw error;
  });
  return migration;
}
async function readSettings() {
  await ensureMigrated();
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}
async function writeSettings(settings) {
  await ensureMigrated();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
async function getCachedUsage(provider) {
  await ensureMigrated();
  const key = usageKey(provider);
  return (await chrome.storage.local.get(key))[key];
}
async function setCachedUsage(data) {
  await ensureMigrated();
  const cached = { data, savedAt: Date.now() };
  await chrome.storage.local.set({ [usageKey(data.provider)]: cached });
}
async function clearCachedUsage(provider) {
  await ensureMigrated();
  await chrome.storage.local.remove(usageKey(provider));
}
var isSettingsChange = (changes) => SETTINGS_KEY in changes;
function cacheAgeMs(cached, now = Date.now()) {
  return Math.max(0, now - cached.savedAt);
}
function isCacheFresh(cached, intervalMinutes, now = Date.now()) {
  return cacheAgeMs(cached, now) < intervalMinutes * 6e4;
}

// src/usage/usage-service.ts
var refreshes = /* @__PURE__ */ new Map();
var lastAttempt = /* @__PURE__ */ new Map();
var MIN_ATTEMPT_INTERVAL_MS = 6e4;
async function refreshUsage(provider, force = false) {
  const settings = await readSettings();
  const cached = await getCachedUsage(provider.id);
  if (!force && cached && isCacheFresh(cached, settings.refreshIntervalMinutes)) return cached.data;
  const now = Date.now();
  if (!force && now - (lastAttempt.get(provider.id) ?? 0) < MIN_ATTEMPT_INTERVAL_MS && cached) return { ...cached.data, source: "cache", stale: true };
  const active = refreshes.get(provider.id);
  if (active) return active;
  lastAttempt.set(provider.id, now);
  const operation = provider.refreshUsage().then(async (usage) => {
    await setCachedUsage(usage);
    return usage;
  }).finally(() => refreshes.delete(provider.id));
  refreshes.set(provider.id, operation);
  return operation;
}

// src/utils/logger.ts
var debugEnabled = false;
var logger = {
  setDebug(value) {
    debugEnabled = value;
  },
  debug(message, safeDetails) {
    if (debugEnabled) console.debug(`[AI Usage Tracker] ${message}`, safeDetails ?? "");
  },
  warn(message) {
    if (debugEnabled) console.warn(`[AI Usage Tracker] ${message}`);
  }
};

// src/providers/types.ts
var UsageError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "UsageError";
  }
  code;
  cause;
};

// src/providers/base-provider.ts
var StrategyProvider = class {
  constructor(location2, strategies) {
    this.location = location2;
    this.strategies = strategies;
  }
  location;
  strategies;
  async getUsage() {
    return this.refreshUsage();
  }
  async refreshUsage() {
    const errors = [];
    let firstUsageError;
    for (const strategy of this.strategies) {
      try {
        if (!await strategy.isAvailable({ provider: this.id, location: this.location })) continue;
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
};

// src/usage/normalization.ts
var validPercent = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
function normalizePercentage(input) {
  const used = validPercent(input.usedPercent) ? input.usedPercent : void 0;
  const remaining = validPercent(input.remainingPercent) ? input.remainingPercent : void 0;
  if (used !== void 0) return { usedPercent: used, remainingPercent: remaining ?? 100 - used };
  if (remaining !== void 0) return { usedPercent: 100 - remaining, remainingPercent: remaining };
  return {};
}
function normalizeResetAt(value) {
  if (typeof value !== "string" && typeof value !== "number") return void 0;
  const normalized = typeof value === "number" && value > 0 && value < 1e12 ? value * 1e3 : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
}

// src/providers/dom-strategy.ts
var SemanticUsageDomStrategy = class {
  constructor(provider, rules) {
    this.provider = provider;
    this.rules = rules;
  }
  provider;
  rules;
  name = "semantic-usage-page-dom";
  async isAvailable() {
    return /usage|limits?|quota/i.test(location.pathname + location.hash);
  }
  async fetch() {
    const text = document.body?.innerText ?? "";
    const windows = [];
    for (const rule of this.rules) {
      const heading = text.match(rule.headingPattern)?.[0];
      if (!heading) continue;
      const nearby = text.slice(Math.max(0, text.indexOf(heading)), text.indexOf(heading) + 500);
      const percent = nearby.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const normalized = normalizePercentage({ usedPercent: percent ? Number(percent[1]) : void 0 });
      if (normalized.usedPercent !== void 0) windows.push({ id: rule.id, label: rule.label, ...normalized });
    }
    return windows.length ? { provider: this.provider, windows, fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), source: "dom" } : null;
  }
};

// src/providers/chatgpt/chatgpt-parser.ts
function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function durationLabel(seconds, fallback, freePlan) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return fallback;
  if (seconds === 18e3) return "5-hour limit";
  if (seconds === 86400) return "Daily";
  if (seconds === 604800) return "Weekly limit";
  if (seconds >= 2419200 && seconds <= 2678400) return freePlan ? "Monthly free limits" : "Monthly limit";
  if (seconds >= 31449600 && seconds <= 31622400) return "Annual";
  if (seconds % 86400 === 0) return `${seconds / 86400}-day`;
  if (seconds % 3600 === 0) return `${seconds / 3600}-hour`;
  return fallback;
}
function parseWindow(raw, id, fallbackLabel, freePlan, prefix) {
  const value = asObject(raw);
  if (!value) return void 0;
  const percent = normalizePercentage({ usedPercent: value.used_percent });
  if (percent.usedPercent === void 0) return void 0;
  const label = `${prefix ? `${prefix} \xB7 ` : ""}${durationLabel(value.limit_window_seconds, fallbackLabel, freePlan)}`;
  const resetAt = normalizeResetAt(value.reset_at);
  return { id, label, ...percent, ...resetAt ? { resetAt } : {}, ...prefix ? { model: prefix } : {} };
}
function appendRateLimit(windows, raw, idPrefix, freePlan, labelPrefix) {
  const rateLimit = asObject(raw);
  if (!rateLimit) return;
  const primary = parseWindow(rateLimit.primary_window, `${idPrefix}-primary`, "Primary", freePlan, labelPrefix);
  const secondary = parseWindow(rateLimit.secondary_window, `${idPrefix}-secondary`, "Secondary", freePlan, labelPrefix);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
}
function parseChatGptUsage(raw, fetchedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const usage = asObject(raw);
  if (!usage) return null;
  const rawPlan = typeof usage.plan_type === "string" && usage.plan_type.length <= 100 ? usage.plan_type : void 0;
  const freePlan = rawPlan ? /(?:^|[_-])free(?:$|[_-])/i.test(rawPlan) : false;
  let windows = [];
  appendRateLimit(windows, usage.rate_limit, "general", freePlan);
  if (freePlan) {
    const monthly = windows.filter((window2) => window2.label === "Monthly free limits");
    if (monthly.length) windows = monthly;
  }
  if (!windows.length) return null;
  const plan = rawPlan ? { free: "ChatGPT Free", plus: "ChatGPT Plus", pro: "ChatGPT Pro", team: "ChatGPT Team", enterprise: "ChatGPT Enterprise" }[rawPlan.toLowerCase()] ?? rawPlan.split(/[_-]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ") : void 0;
  return {
    provider: "chatgpt",
    windows,
    fetchedAt: normalizeResetAt(fetchedAt) ?? (/* @__PURE__ */ new Date()).toISOString(),
    source: "internal-api",
    ...plan ? { plan } : {}
  };
}

// src/providers/chatgpt/chatgpt-strategies.ts
var MESSAGE_SOURCE = "AI_USAGE_TRACKER_V1";
var REQUEST_TYPE = "CHATGPT_USAGE_REQUEST";
var RESPONSE_TYPE = "CHATGPT_USAGE_RESPONSE";
var ALLOWED_ERRORS = /* @__PURE__ */ new Set([
  "NOT_LOGGED_IN",
  "USAGE_ENDPOINT_NOT_FOUND",
  "RESPONSE_FORMAT_CHANGED",
  "NETWORK_ERROR",
  "PERMISSION_ERROR",
  "RATE_LIMITED",
  "UNSUPPORTED_ACCOUNT",
  "UNKNOWN"
]);
function asObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
var ChatGptNativeUsageStrategy = class {
  name = "chatgpt-wham-native-usage";
  async isAvailable(context) {
    return context.location.hostname === "chatgpt.com";
  }
  async fetch() {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new UsageError("NETWORK_ERROR", "Timed out waiting for ChatGPT usage response."));
      }, 1e4);
      const finish = (callback) => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        callback();
      };
      const onMessage = (event) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = asObject2(event.data);
        if (message?.source !== MESSAGE_SOURCE || message.type !== RESPONSE_TYPE || message.provider !== "chatgpt") return;
        const payload = asObject2(message.payload);
        if (!payload || typeof payload.ok !== "boolean") return;
        if (!payload.ok) {
          const code = typeof payload.errorCode === "string" && ALLOWED_ERRORS.has(payload.errorCode) ? payload.errorCode : "UNKNOWN";
          finish(() => reject(new UsageError(code, "ChatGPT native usage request failed.")));
          return;
        }
        const parsed = parseChatGptUsage(payload.usage, typeof payload.fetchedAt === "string" ? payload.fetchedAt : void 0);
        finish(() => parsed ? resolve(parsed) : reject(new UsageError("RESPONSE_FORMAT_CHANGED", "ChatGPT usage response did not contain recognized windows.")));
      };
      window.addEventListener("message", onMessage);
      window.postMessage({ source: MESSAGE_SOURCE, type: REQUEST_TYPE, provider: "chatgpt", force: true }, location.origin);
    });
  }
};

// src/providers/chatgpt/chatgpt-provider.ts
var ChatGptProvider = class extends StrategyProvider {
  id = "chatgpt";
  constructor(location2) {
    super(location2, [new ChatGptNativeUsageStrategy(), new SemanticUsageDomStrategy("chatgpt", [{ id: "weekly", label: "Weekly", headingPattern: /weekly (?:usage|limit)/i }])]);
  }
  matches(value) {
    return value.hostname === "chatgpt.com";
  }
};

// src/providers/claude/claude-parser.ts
var WINDOWS = {
  five_hour: { label: "Current session", shortLabel: "cs" },
  // Claude names this limit "All models" or "This week" depending on the
  // account's Usage page layout, while the data is identical. "Weekly limit"
  // is accurate for every account.
  seven_day: { label: "Weekly limit", shortLabel: "wk" }
};
var HIDDEN_WEEKLY_KEYS = /* @__PURE__ */ new Set(["seven_day_nimbus", "seven_day_quill"]);
var MODEL_NAMES = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
var PLAN_LABELS = {
  default_claude_ai: "Claude Pro",
  pro: "Claude Pro",
  claude_pro: "Claude Pro",
  max: "Claude Max",
  max_5x: "Claude Max 5\xD7",
  max_20x: "Claude Max 20\xD7",
  team: "Claude Team",
  enterprise: "Claude Enterprise",
  free: "Claude Free"
};
function asObject3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function safeText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100 ? value.trim() : void 0;
}
function normalizePlan(value) {
  const plan = safeText(value);
  if (!plan) return void 0;
  return PLAN_LABELS[plan.toLowerCase()] ?? plan.split(/[_-]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}
function planFrom(organization, usage) {
  const org = asObject3(organization);
  const value = usage.plan_name ?? usage.subscription_plan ?? usage.subscription_type ?? usage.subscription_tier ?? org?.plan_name ?? org?.subscription_plan ?? org?.subscription_type ?? org?.subscription_tier ?? org?.rate_limit_tier;
  return normalizePlan(value);
}
function compactName(name) {
  const letters = name.replace(/weekly|limit|only/gi, "").replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 ? letters.slice(0, 2).toLowerCase() : "wk";
}
function weeklyDefinition(key, window2) {
  const displayName = safeText(window2.display_name) ?? safeText(window2.model_name);
  if (displayName) {
    const name2 = displayName.replace(/^weekly\s*[·:\-–]\s*/i, "").trim() || displayName;
    return { label: name2, shortLabel: compactName(name2) };
  }
  const suffix = key.replace(/^seven_day_/, "");
  const name = MODEL_NAMES[suffix] ?? suffix.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  return { label: name, shortLabel: compactName(name) };
}
function parseClaudeUsage(rawUsage, organization, fetchedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const usage = asObject3(rawUsage);
  if (!usage) return null;
  const windows = [];
  const extraWeeklyKeys = Object.keys(usage).filter((key) => /^seven_day_[a-z0-9_]+$/.test(key) && !HIDDEN_WEEKLY_KEYS.has(key));
  for (const key of ["five_hour", "seven_day", ...extraWeeklyKeys]) {
    const rawWindow = usage[key];
    const candidate = asObject3(rawWindow);
    if (!candidate || typeof candidate.utilization !== "number") continue;
    const definition = WINDOWS[key] ?? weeklyDefinition(key, candidate);
    const percentage = normalizePercentage({ usedPercent: candidate.utilization });
    if (percentage.usedPercent === void 0) continue;
    const resetAt = normalizeResetAt(candidate.resets_at ?? candidate.reset_at);
    if (key !== "five_hour" && !resetAt) continue;
    windows.push({
      id: key,
      label: definition.label,
      shortLabel: definition.shortLabel,
      ...percentage,
      ...resetAt ? { resetAt } : {}
    });
  }
  if (!windows.length) return null;
  const plan = planFrom(organization, usage);
  return {
    provider: "claude",
    windows,
    fetchedAt: normalizeResetAt(fetchedAt) ?? (/* @__PURE__ */ new Date()).toISOString(),
    source: "internal-api",
    ...plan ? { plan } : {}
  };
}

// src/providers/claude/claude-strategies.ts
var MESSAGE_SOURCE2 = "AI_USAGE_TRACKER_V1";
var REQUEST_TYPE2 = "CLAUDE_USAGE_REQUEST";
var RESPONSE_TYPE2 = "CLAUDE_USAGE_RESPONSE";
var ALLOWED_ERRORS2 = /* @__PURE__ */ new Set([
  "NOT_LOGGED_IN",
  "USAGE_ENDPOINT_NOT_FOUND",
  "RESPONSE_FORMAT_CHANGED",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "UNSUPPORTED_ACCOUNT",
  "UNKNOWN"
]);
function asObject4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
var ClaudeNativeUsageStrategy = class {
  name = "claude-native-internal-api";
  async isAvailable(context) {
    return context.location.hostname === "claude.ai";
  }
  async fetch() {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new UsageError("NETWORK_ERROR", "Timed out waiting for Claude usage response."));
      }, 1e4);
      const finish = (callback) => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        callback();
      };
      const onMessage = (event) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const message = asObject4(event.data);
        if (message?.source !== MESSAGE_SOURCE2 || message.type !== RESPONSE_TYPE2 || message.provider !== "claude") return;
        const payload = asObject4(message.payload);
        if (!payload || typeof payload.ok !== "boolean") return;
        if (!payload.ok) {
          const code = typeof payload.errorCode === "string" && ALLOWED_ERRORS2.has(payload.errorCode) ? payload.errorCode : "UNKNOWN";
          finish(() => reject(new UsageError(code, "Claude native usage request failed.")));
          return;
        }
        const parsed = parseClaudeUsage(payload.usage, payload.organization, typeof payload.fetchedAt === "string" ? payload.fetchedAt : void 0);
        const rawUsage = asObject4(payload.usage);
        const containsWindowData = rawUsage && Object.values(rawUsage).some((value) => {
          const window2 = asObject4(value);
          return window2 && (window2.utilization !== void 0 || window2.resets_at !== void 0 || window2.reset_at !== void 0);
        });
        finish(() => parsed ? resolve(parsed) : reject(new UsageError(
          containsWindowData ? "RESPONSE_FORMAT_CHANGED" : "UNSUPPORTED_ACCOUNT",
          containsWindowData ? "Claude usage response did not contain valid recognized windows." : "Claude did not expose usage windows for this account."
        )));
      };
      window.addEventListener("message", onMessage);
      window.postMessage({ source: MESSAGE_SOURCE2, type: REQUEST_TYPE2, provider: "claude", force: true }, location.origin);
    });
  }
};

// src/providers/claude/claude-provider.ts
var ClaudeProvider = class extends StrategyProvider {
  id = "claude";
  constructor(location2) {
    super(location2, [new ClaudeNativeUsageStrategy(), new SemanticUsageDomStrategy("claude", [
      { id: "five-hour", label: "Session / 5 hour", headingPattern: /(?:session|five|5)[ -]?hour/i },
      { id: "weekly", label: "Weekly", headingPattern: /weekly/i },
      { id: "opus-weekly", label: "Opus Weekly", headingPattern: /opus.*weekly|weekly.*opus/i }
    ])]);
  }
  matches(value) {
    return value.hostname === "claude.ai";
  }
};

// src/providers/provider-registry.ts
function providerFor(location2) {
  return [new ChatGptProvider(location2), new ClaudeProvider(location2)].find((provider) => provider.matches(location2));
}

// src/content/widget-manager.ts
var TICK_MS = 3e4;
async function startWidget() {
  const provider = providerFor(location);
  if (!provider) return () => void 0;
  let settings = await readSettings();
  logger.setDebug(settings.debug);
  if (!settings.enabled || !settings.providers[provider.id]) return () => void 0;
  const widget = new UsageWidget(provider.id, settings);
  widget.mount();
  widget.update({ kind: "loading" });
  let lastUsage;
  let lastRefreshAt = 0;
  let refreshTimer;
  let disposed = false;
  const intervalMs = () => settings.refreshIntervalMinutes * 6e4;
  const scheduleNext = () => {
    window.clearTimeout(refreshTimer);
    if (disposed) return;
    const wait = Math.max(0, lastRefreshAt + intervalMs() - Date.now());
    refreshTimer = window.setTimeout(() => {
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
        lastUsage = void 0;
        await clearCachedUsage(provider.id);
        widget.update({ kind: "logged-out", provider: provider.id });
        return;
      }
      if (provider.id === "claude" && error instanceof UsageError && error.code === "UNSUPPORTED_ACCOUNT") {
        lastUsage = void 0;
        await clearCachedUsage(provider.id);
        widget.update({
          kind: "unavailable",
          message: "Usage information isn\u2019t available for this Claude account. Claude Free does not currently provide a Usage page."
        });
        return;
      }
      widget.update({
        kind: "error",
        ...lastUsage ? { cached: { ...lastUsage, stale: true } } : {},
        message: error instanceof UsageError && error.code === "RATE_LIMITED" ? "Usage refresh is temporarily rate-limited. Please retry shortly." : `${provider.id === "claude" ? "Claude" : "ChatGPT"} usage is temporarily unavailable. Retry shortly.`
      });
    } finally {
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
  const tickTimer = window.setInterval(() => {
    if (!document.hidden) widget.tick();
  }, TICK_MS);
  const onVisibilityChange = () => {
    if (document.hidden) return;
    widget.tick();
    if (Date.now() - lastRefreshAt >= intervalMs()) void runRefresh(false);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      widget.ensureMounted();
    }, 250);
  });
  observer.observe(document.documentElement, { childList: true });
  const onStorage = (changes, areaName) => {
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

// src/content/index.ts
var GLOBAL_KEY = "__AI_USAGE_TRACKER_CLEANUP__";
var trackerWindow = window;
trackerWindow[GLOBAL_KEY]?.();
void startWidget().then((cleanup) => {
  trackerWindow[GLOBAL_KEY] = cleanup;
});
var lastUrl = location.href;
var handleNavigation = () => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  window.dispatchEvent(new CustomEvent("ai-usage-tracker:navigation"));
};
window.addEventListener("popstate", handleNavigation);
var navigationObserver = new MutationObserver(handleNavigation);
navigationObserver.observe(document, { childList: true, subtree: true });
//# sourceMappingURL=content.js.map
