import { readStorage } from "../storage/storage";
import type { ProviderId } from "../providers/types";
import { formatRelativeTime } from "../utils/dates";

const names: Record<ProviderId, string> = { chatgpt: "ChatGPT", claude: "Claude" };
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c] ?? c); }
async function render() {
  const state = await readStorage();
  const container = document.querySelector<HTMLDivElement>("#providers");
  if (!container) return;
  container.innerHTML = (Object.keys(names) as ProviderId[]).map((id) => {
    const usage = state.providers[id]?.data;
    const lines = usage?.windows.map((w) => `<div class="line"><span>${escapeHtml(w.label)}</span><span>${w.usedPercent === undefined ? "Unknown" : `${Math.round(w.usedPercent)}%`}${w.resetAt ? ` · ${formatRelativeTime(w.resetAt).replace("Reset in ", "")}` : ""}</span></div>`).join("") ?? '<div class="line">No cached usage</div>';
    return `<section class="provider"><h2>${names[id]}</h2>${lines}</section>`;
  }).join("");
}
document.querySelector("#options")?.addEventListener("click", () => void chrome.runtime.openOptionsPage());
document.querySelector("#refresh")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.reload(tab.id);
  window.close();
});
void render();
