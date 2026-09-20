# ChatGPT provider

**Last investigated:** 2026-09-16  
**Verification status:** Endpoint, required bearer authentication, and response fields verified from current client implementations; authenticated browser behavior still requires local verification.

## Current mechanism

The primary strategy uses the signed-in browser cookie for a same-origin `GET /api/auth/session`, then uses its short-lived access token for `GET /backend-api/wham/usage`. Team accounts also receive `ChatGPT-Account-Id` when that claim is present. These are undocumented ChatGPT endpoints and may change without notice.

Authentication stays inside the MAIN-world bridge. The access token is held only in a local variable for the quota request; it is never posted to the content script, stored, or logged. Cookies remain browser-managed and are never read directly.

Before the response crosses into the isolated extension context, the bridge removes identity, email, account, credit, and unrelated fields. It retains only:

- `plan_type`;
- primary and secondary quota windows;
- used percentage, window duration, and reset fields;
- code-review quota windows when returned;
- named additional/model-specific quota windows when returned.

The widget intentionally shows only the main `rate_limit` windows. Paid accounts label the 18,000-second window **5-hour limit** and the 604,800-second window **Weekly limit**. When `plan_type` identifies a free account and a monthly native window is returned, the widget shows **Plan: ChatGPT Free** and **Monthly free limits**, suppressing other windows. Code-review and additional/model-specific windows are not displayed. `used_percent` always means consumed percentage.

## Scope

This endpoint reports ChatGPT/Codex plan usage exposed by the current usage dashboard. It must not be described as every ChatGPT model's message cap. Model-specific limits are shown only when the response includes them under `additional_rate_limits`.

## Fallback and limitations

- A semantic DOM fallback recognizes an explicit weekly usage label on a Usage/Limits route.
- The internal endpoint is unofficial and can change.
- Authenticated account variants and logged-out behavior still require local verification.
- Raw endpoint responses are not logged or persisted.
