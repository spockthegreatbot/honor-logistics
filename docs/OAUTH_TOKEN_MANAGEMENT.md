# OAuth Token Management — Design Requirements

**Rule: Token refresh must be built on day one, not added later.**

---

## Why This Matters

Both Xero and Microsoft 365 use OAuth tokens that expire:
- **Xero:** Access token expires every 30 minutes. Refresh token expires in 60 days (must be used at least once per 60 days or requires full re-auth).
- **Azure/M365:** Access token expires in 1 hour. No refresh token for Application permissions — use client credentials flow (Client ID + Secret → token directly, no user needed). Token auto-refreshes on expiry.

If refresh isn't handled: automation silently breaks. Invoices stop going out. Emails stop being ingested. Nobody notices until a client calls.

---

## Required Implementation

### Token Storage (Supabase `oauth_tokens` table)
```sql
CREATE TABLE oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- 'xero' | 'microsoft'
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  tenant_id TEXT, -- Xero tenant ID or Azure tenant ID
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Refresh Logic (per provider)

**Xero:**
- Access token: 30 min TTL → refresh before every API call if `expires_at < now() + 5min`
- Refresh token: 60 day TTL → if refresh token is older than 50 days, alert Onur to re-authenticate
- Endpoint: `POST https://identity.xero.com/connect/token` with `grant_type=refresh_token`
- Store new access + refresh token after every refresh (Xero rotates refresh tokens)

**Microsoft Graph:**
- Access token: 1 hour TTL → refresh before every call if `expires_at < now() + 5min`
- Refresh token: 90 days (or configured) → alert if approaching expiry
- Endpoint: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with `grant_type=refresh_token`

### Helper: `src/lib/oauth.ts`
```ts
export async function getValidToken(provider: 'xero' | 'microsoft'): Promise<string> {
  // 1. Load token from DB
  // 2. Check if expires_at < now() + 5min
  // 3. If yes: call refresh endpoint, save new tokens, return new access token
  // 4. If refresh fails: send Telegram alert to Onur + throw error
  // 5. Return valid access token
}
```

### Alerting on Token Failure
If refresh fails or token is about to expire beyond refresh window:
- Send Telegram alert to Honor Logistics group: "⚠️ Xero/M365 connection needs re-authentication. Login to honor-logistics.vercel.app/settings to reconnect."
- Log to `email_log` table with type `oauth_error`
- Stop the automation gracefully (don't silently fail)

### Settings Page: `/settings` → OAuth Tab
- Show connection status: ✅ Connected / ⚠️ Expiring soon / ❌ Disconnected
- Show token expiry date
- "Reconnect" button for each provider (triggers OAuth flow)
- Last successful sync timestamp

---

## Implementation Order (when creds arrive)
1. Create `oauth_tokens` table migration
2. Build `src/lib/oauth.ts` with `getValidToken()` + refresh logic
3. Build Xero OAuth callback + token storage
4. Build M365 OAuth callback + token storage
5. Wire `getValidToken()` into every Xero/M365 API call
6. Add Settings page OAuth status tab
7. Add Telegram alert on refresh failure

---

## Testing Requirements
- Test with intentionally expired token → must auto-refresh
- Test with expired refresh token → must alert, not crash
- Test token storage is encrypted at rest (Supabase RLS + encrypted column or env-level secret)
