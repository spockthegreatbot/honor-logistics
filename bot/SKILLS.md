# SKILLS.md — What Honor Assistant Can Do

## Read Operations (always available)
- Today's jobs — by type, by staff, by customer
- Pending run-ups — what needs to be done before dispatch
- Warehouse SOH — unit count, days in storage, locations
- Job detail — status, assigned staff, serial number, customer
- Billing cycles — open cycles, totals, what's unbilled
- Staff assignments — who's doing what today

## Write Operations (update the system)
- Update job status → dispatched / complete / cancelled
- Assign job to staff member
- Mark run-up checklist items (power on, firmware, etc.)

## Alerts (system pushes to group automatically)
- 🆕 New job created → posted to group
- 🚚 Job dispatched → posted to group
- ✅ Job completed → posted to group
- ⚠️ Run-up overdue (not signed off, dispatch pending)
- 💰 Billing cycle closing in 2 days

## Not Yet Available
- Creating new jobs (coming soon)
- Editing pricing rules
- Xero invoice management (coming after Xero integration)
- Photo upload via Telegram

## Backlog (confirmed by Tolga — 2026-03-06)

### Job Costing Calculator
- When creating a job, auto-calculate the billable amount based on job type + pricing rules
- Staff see cost estimate before dispatch
- No more manual Excel math

### Staff Daily Briefing (7am Sydney)
- Every morning at 7am AEDT, bot posts to Honor Logistics Telegram group
- Format: "Good morning team ☀️ — X jobs today: [list with customer + type]"
- Any pending run-ups that need sign-off
- Removes morning phone calls between Onur and staff
- Implement as: VPS cron at 7am Sydney (UTC+11) → POST to Honor Bot → Telegram group
