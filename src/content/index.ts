import { startWidget } from "./widget-manager";

const GLOBAL_KEY = "__AI_USAGE_TRACKER_CLEANUP__";
type TrackerWindow = Window & { [GLOBAL_KEY]?: () => void };
const trackerWindow = window as TrackerWindow;
trackerWindow[GLOBAL_KEY]?.();
void startWidget().then((cleanup) => { trackerWindow[GLOBAL_KEY] = cleanup; });

let lastUrl = location.href;
const handleNavigation = () => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  window.dispatchEvent(new CustomEvent("ai-usage-tracker:navigation"));
};
window.addEventListener("popstate", handleNavigation);
const navigationObserver = new MutationObserver(handleNavigation);
navigationObserver.observe(document, { childList: true, subtree: true });
