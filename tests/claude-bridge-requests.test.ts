import { describe, expect, it } from "vitest";

// Every request posted to the bridge must receive a response. Previously a
// forced request within 30 seconds of the last fetch was silently dropped,
// leaving the content script to time out and show an error.
describe("Claude bridge request handling", () => {
  it("answers every request, refetching forced requests after the short floor", async () => {
    let now = 1_000_000;
    const realNow = Date.now;
    Date.now = () => now;
    let fetches = 0;
    const origin = "https://claude.ai";
    const win = new EventTarget() as EventTarget & { postMessage: (data: unknown) => void };
    win.postMessage = (data: unknown) => queueMicrotask(() => {
      const event = new Event("message");
      Object.assign(event, { data, origin, source: win });
      win.dispatchEvent(event);
    });
    Object.assign(globalThis, {
      window: win,
      location: { hostname: "claude.ai", origin },
      fetch: async (path: string) => {
        fetches += 1;
        const body = path === "/api/organizations"
          ? [{ uuid: "org" }]
          : { five_hour: { utilization: 10, resets_at: "2030-01-01T00:00:00Z" } };
        return { status: 200, redirected: false, url: origin + path, json: async () => body };
      }
    });

    const request = (force: boolean) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no response")), 200);
      const onMessage = (event: Event) => {
        const data = (event as Event & { data: Record<string, unknown> }).data;
        if (data.type !== "CLAUDE_USAGE_RESPONSE") return;
        clearTimeout(timer);
        win.removeEventListener("message", onMessage);
        resolve(data.payload as Record<string, unknown>);
      };
      win.addEventListener("message", onMessage);
      win.postMessage({ source: "AI_USAGE_TRACKER_V1", type: "CLAUDE_USAGE_REQUEST", provider: "claude", force });
    });

    try {
      await import("../src/injected/claude-usage-bridge");
      expect(fetches).toBe(0); // no eager fetch at document_start

      expect((await request(true)).ok).toBe(true);
      expect(fetches).toBe(2);

      now += 1_000; // rapid manual refresh reuses the last answer
      expect((await request(true)).ok).toBe(true);
      expect(fetches).toBe(2);

      now += 10_000; // past the forced floor, still inside the 30s window
      expect((await request(true)).ok).toBe(true);
      expect(fetches).toBe(4);

      now += 5_000; // unforced request inside the 30s window reuses
      expect((await request(false)).ok).toBe(true);
      expect(fetches).toBe(4);
    } finally {
      Date.now = realNow;
    }
  });
});
