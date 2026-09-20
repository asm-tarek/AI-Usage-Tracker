# Claude provider

**Last investigated:** 2026-09-16  
**Verification status:** Retrieval and authenticated response verified locally by the user on 2026-09-16; exact labels remain rollout-dependent.

## Current mechanism

The primary strategy makes a same-origin authenticated `GET /api/organizations`, selects up to five returned organizations, and requests `GET /api/organizations/{organization-id}/usage`. These are undocumented Claude web-app endpoints and may change. The browser supplies the existing session in MAIN world; the extension does not read or store cookies.

The parser shows the limits Claude's own Usage page shows. Today that is `five_hour` as **Current session** (pill label **cs**) and `seven_day` as **Weekly limit** (pill label **wk**). Claude's page names the weekly limit **All models** or **This week** depending on the account's page layout, while the data is identical, so the extension uses one name that is accurate for every account. Claude's **Weekly limits** section heading is not displayed because it has no quota value of its own. Each row must contain a numeric `utilization` from 0–100 and may include `resets_at`/`reset_at`.

Every weekly window requires both a valid percentage and a valid reset timestamp; Claude leaves numeric values behind in windows its Usage page treats as unavailable. Additional weekly windows (`seven_day_*`, for example a model-specific weekly cap) follow the same rule, so they appear automatically once Claude reports them with a reset time, in response order. They are named from `display_name`/`model_name` when present, otherwise from the key (`seven_day_sonnet` → **Sonnet**). Their pill label is the name's first two letters in lowercase (**so**), or **wk** for a general weekly limit; the details card shows full names. The internal rollout codenames Nimbus and Quill are always excluded. Raw responses are neither logged nor persisted.

If the endpoint fails, a semantic DOM fallback remains available on a Claude Usage/Limits route.

## Local verification

After loading the extension while signed in, compare the widget to Settings → Usage. If they differ, provide:

- sanitized request pathname and HTTP method;
- whether an organization/account identifier is required and where the page obtains it (field names only);
- sanitized top-level response field names;
- one sanitized object for each displayed window;
- which number is used vs. remaining, and whether it is 0–1 or 0–100;
- reset field name and timestamp format;
- HTTP status when logged out.

Sanitized expected shape:

```json
{
  "five_hour": {
    "utilization": 42,
    "resets_at": "2026-09-20T12:00:00Z"
  }
}
```

## Known limitations

- The internal API is unofficial and can change without notice.
- Multi-organization accounts use the first organization returning recognized usage windows.
- Claude Free accounts do not currently expose a Usage page or structured usage windows. The widget reports that usage is unavailable for the account instead of suggesting a temporary retry.
- DOM fallback may break if labels change.
