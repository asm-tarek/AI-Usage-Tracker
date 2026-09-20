import { readStorage } from "../storage/storage";
import { isExtensionMessage } from "../utils/messaging";

chrome.runtime.onInstalled.addListener(() => void readStorage());
chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!isExtensionMessage(message)) return false;
  if (message.type === "GET_STATE") {
    void readStorage().then((state) => respond({ ok: true, state })).catch(() => respond({ ok: false }));
    return true;
  }
  return false;
});
