# Connecting Microsoft 365 to Honor Logistics
*(~20 minutes, Onur does this himself)*

---

## Step 1 — Go to Azure Portal
- Open: `portal.azure.com`
- Sign in with Onur's Microsoft 365 admin account
- Search for **"App registrations"** → click it

---

## Step 2 — Create the app
- Click **New registration**
- Name: `Honor Logistics`
- Account type: **Single tenant** (this org only)
- Redirect URI: leave blank for now (not needed for Application permissions)
- Click **Register**

---

## Step 3 — Copy 2 values *(send these to Spock)*
- **Application (client) ID** — on the Overview page
- **Directory (tenant) ID** — on the Overview page

---

## Step 4 — Create a client secret
- Left menu → **Certificates & secrets**
- Click **New client secret**
- Description: `Honor Logistics App`
- Expiry: **24 months**
- Click Add → copy the **Value** immediately *(it disappears after you leave the page)*
- Send that value to Spock too

---

## Step 5 — Set permissions ⚠️ IMPORTANT
- Left menu → **API permissions**
- Click **Add a permission** → **Microsoft Graph** → **Application permissions** ← (NOT Delegated)
- Search and add: `Mail.Read`
- Click **Grant admin consent** → Yes

> **Why Application, not Delegated?**
> Delegated permissions require a user to be actively logged in — won't work for a background service running 24/7 on a server.
> Application permissions let the server authenticate directly using the Client ID + Secret, no user session needed.

---

## What to send Spock (3 values):
1. Application (client) ID
2. Directory (tenant) ID
3. Client Secret value

---

## What happens after it's connected
- Server authenticates directly using Client ID + Secret (no user login required)
- **Phase 1:** Polls Onur's inbox every few minutes for new emails from EFEX/clients
- **Phase 2 (later):** Upgrade to Graph webhooks for instant push notifications — better than polling, no delay, uses less API quota
- Emails from clients get parsed → job automatically created in Honor Logistics
- Onur reviews + confirms in the dashboard
- No emails are deleted, moved, or replied to automatically

---

## Security scope
`Mail.Read` (Application) — read access to mailbox only. Cannot send, delete, move, or access any other M365 service.
