type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

export interface ChatGptSessionAuth {
  accessToken: string;
  accountId?: string;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : undefined;
}

function decodeJwtPayload(token: string): JsonObject | undefined {
  const encoded = token.split(".")[1];
  if (!encoded) return undefined;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return asObject(JSON.parse(atob(padded)));
  } catch {
    return undefined;
  }
}

export function parseChatGptSession(value: unknown): ChatGptSessionAuth | undefined {
  const session = asObject(value);
  const accessToken = typeof session?.accessToken === "string" && session.accessToken.length > 0 && session.accessToken.length <= 32_768
    ? session.accessToken
    : undefined;
  if (!accessToken) return undefined;

  // Team/workspace accounts may require this header. Only inspect the local JWT
  // payload; the token and claims never leave the page bridge.
  const claims = decodeJwtPayload(accessToken);
  const authClaim = asObject(claims?.["https://api.openai.com/auth"]);
  const accountId = safeIdentifier(authClaim?.chatgpt_account_id) ?? safeIdentifier(claims?.chatgpt_account_id);
  return { accessToken, ...(accountId ? { accountId } : {}) };
}
