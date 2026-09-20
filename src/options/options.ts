import { readSettings, writeSettings } from "../storage/storage";
import type { UserSettings, WidgetPosition } from "../storage/storage-types";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
async function load() {
  const s = await readSettings();
  el<HTMLInputElement>("enabled").checked = s.enabled;
  el<HTMLInputElement>("alwaysExpanded").checked = s.alwaysExpanded;
  el<HTMLSelectElement>("position").value = s.position;
  el<HTMLInputElement>("countdown").checked = s.showResetCountdown;
  el<HTMLInputElement>("updated").checked = s.showLastUpdated;
  el<HTMLInputElement>("chatgpt").checked = s.providers.chatgpt;
  el<HTMLInputElement>("claude").checked = s.providers.claude;
  el<HTMLSelectElement>("interval").value = String(s.refreshIntervalMinutes);
  el<HTMLInputElement>("threshold").value = String(s.notificationThreshold);
  el<HTMLInputElement>("debug").checked = s.debug;
}
el<HTMLFormElement>("settings").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = await readSettings();
  const settings: UserSettings = {
    ...current,
    enabled: el<HTMLInputElement>("enabled").checked,
    alwaysExpanded: el<HTMLInputElement>("alwaysExpanded").checked,
    position: el<HTMLSelectElement>("position").value as WidgetPosition,
    showResetCountdown: el<HTMLInputElement>("countdown").checked,
    showLastUpdated: el<HTMLInputElement>("updated").checked,
    providers: { chatgpt: el<HTMLInputElement>("chatgpt").checked, claude: el<HTMLInputElement>("claude").checked },
    refreshIntervalMinutes: Number(el<HTMLSelectElement>("interval").value) as UserSettings["refreshIntervalMinutes"],
    notificationThreshold: Math.min(100, Math.max(1, Number(el<HTMLInputElement>("threshold").value) || 80)),
    debug: el<HTMLInputElement>("debug").checked
  };
  await writeSettings(settings);
  el<HTMLOutputElement>("status").value = "Saved";
});
void load();
