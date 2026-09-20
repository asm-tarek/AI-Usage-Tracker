import { describe, expect, it } from "vitest";
import { parseChatGptSession } from "../src/injected/chatgpt-session";

function jwt(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${encoded}.signature`;
}

describe("ChatGPT browser session parser", () => {
  it("keeps the access token transient and extracts a workspace account id", () => {
    const accessToken = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" } });
    expect(parseChatGptSession({ accessToken })).toEqual({ accessToken, accountId: "acct_123" });
  });

  it("accepts a valid session when no account id is present", () => {
    const accessToken = jwt({ sub: "user_123" });
    expect(parseChatGptSession({ accessToken })).toEqual({ accessToken });
  });

  it("rejects missing or malformed session data", () => {
    expect(parseChatGptSession({ user: { name: "Tarek" } })).toBeUndefined();
    expect(parseChatGptSession(null)).toBeUndefined();
  });
});
