# Northstar CRM

A lead-management web app: **React 18 + TypeScript + Tailwind + Recharts** frontend and a
**Node.js (Express + TypeScript) + PostgreSQL** backend with email/password authentication.

Pages: Overview, Leads, Pipeline, Tasks, Reports, Settings. Design references live in [`UI of northstar/`](./UI%20of%20northstar)
(Settings had no reference screenshot, so it follows the same design system).

## Quick start

Requires Node 18+ and PostgreSQL 14+.

```bash
# 1. Database (any Postgres works; this starts one with Docker)
docker compose up -d db

# 2. Install both projects
npm run setup

# 3. Configure the API (defaults match docker-compose.yml)
cp server/.env.example server/.env

# 4. Run API (http://localhost:3000, auto-migrates the schema) and frontend (http://localhost:5173)
npm run server          # terminal 1
npm run dev             # terminal 2
```

Open http://localhost:5173, choose **Create a workspace**, and leave **Start with sample data** ticked to explore with
realistic records (you can delete them in Settings → Workspace → Data).

Vite proxies `/api` to the API, so the session cookie is same-origin and no CORS setup is needed in development.

### Production

```bash
npm run build                                   # frontend -> dist/
cd server && NODE_ENV=production \
  DATABASE_URL=postgres://... JWT_SECRET=$(openssl rand -hex 32) npm start
```

In production the API also serves `dist/` (single deployable) and **refuses to start without a strong `JWT_SECRET`**.
Put it behind HTTPS (the session cookie is `Secure` in production). Migrations run automatically on start
(`npm run server:migrate` runs them alone).

| Env var (server/.env) | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Signs session tokens. Required (≥32 chars) when `NODE_ENV=production` |
| `PORT` | API port (default 3000) |
| `AUTH_RATE_LIMIT` | Sign-in/register attempts per IP per 15 min (default 30) |
| `CORS_ORIGIN` | Only if the frontend is served from a different origin than the API |
| `APP_URL` | Public address of the web app; used for links inside emails (invites, password reset) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | Email delivery. Leave `SMTP_HOST` empty to keep email off |
| `SMS_PROVIDER` `SMS_API_KEY` `SMS_SENDER_ID` `SSLWIRELESS_SID` | SMS delivery for Bangladesh (see below). Leave `SMS_PROVIDER` empty to keep SMS off |
| `DISABLE_SCHEDULER` | `true` stops the reminder / summary / outbox worker on this instance |

## Architecture

```
src/                         Frontend
  api/client.ts              fetch wrapper (cookies, error handling)
  store/SessionContext.tsx   sign-in state;  store/StoreContext.tsx  workspace data + async actions
  pages/ components/ lib/    UI, charts, metric and report calculations
server/
  migrations/*.sql           Schema (applied in order, tracked in schema_migrations)
  src/app.ts                 Express app (helmet, cookies, routes, SPA hosting in production)
  src/routes/                auth, leads, deals, tasks, account (profile/team/workspace)
  src/validation.ts          zod schemas for every request body
  src/snapshot.ts            Builds the workspace snapshot the frontend consumes
  src/messaging/             SMTP + SMS gateways, outbox/dispatcher, templates, reminder & weekly scheduler
  src/seed/                  Sample-data generator and loader
  test/*.test.ts             Integration tests against a real Postgres (+ real SMTP and mock SMS gateways)
  scripts/dev-sink.ts        Local SMTP server + mock SMS gateway for development
scripts/e2e.cjs              Playwright end-to-end test of the whole stack
```

**How data flows.** The server owns all business rules (cascading deletes, deal-stage → lead-status sync, activity
log, close dates). Every mutation endpoint runs in a transaction and responds with `{ result, data }`, where `data`
is the fresh workspace snapshot; the frontend simply replaces its state with it. Deal moves and task check-offs are applied
optimistically and reconciled with the response. Metrics and reports are computed in the frontend from that snapshot.

### Data model (PostgreSQL)

`workspaces` · `users` (workspace members; `password_hash` is NULL for sample members who cannot sign in) · `leads` ·
`deals` (FK → leads, cascade) · `tasks` (FK → leads cascade, deals set-null) · `notes` · `activities`.
Money is `numeric(14,2)`, timestamps are `timestamptz`, enums are `CHECK` constrained. Every row carries a
`workspace_id`, and every query filters by the signed-in user's workspace (tested for cross-tenant isolation).

### API (all under `/api`, JSON, session cookie)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` · `/auth/login` · `/auth/logout` · `GET /auth/me` · `POST /auth/change-password` · `/auth/forgot-password` · `/auth/reset-password` · `GET /auth/invitation` · `POST /auth/accept-invite` |
| Data | `GET /data` (workspace snapshot) |
| Messaging | `GET/POST /invitations` · `DELETE /invitations/:id` · `GET /integrations/status` · `POST /integrations/email/test` · `/integrations/sms/test` · `GET /integrations/messages` (admin) · `POST /leads/:id/email` · `/leads/:id/sms` · `GET /leads/:id/messages` |
| Leads | `POST /leads` · `PATCH /leads/:id` · `PATCH /leads/bulk` · `POST /leads/bulk-delete` · `POST /leads/import` · `POST /leads/:id/notes` |
| Deals | `POST /deals` · `PATCH /deals/:id` · `POST /deals/:id/move` · `/lost` · `/reopen` · `DELETE /deals/:id` |
| Tasks | `POST /tasks` · `PATCH /tasks/:id` · `POST /tasks/:id/complete` · `DELETE /tasks/:id` |
| Account | `PATCH /me` · `PATCH /me/notifications` · `POST /users` · `PATCH /users/:id/role` · `PATCH /workspace` · `POST /workspace/sample-data` · `DELETE /workspace/data` |

Errors are `{ "error": "message", "fields": { "field": "message" } }` with 400 (validation), 401, 403, 404, 409.

### Security notes

- Passwords hashed with bcrypt; sign-in is rate limited and does not reveal whether an email exists.
- Session = signed JWT in an `HttpOnly`, `SameSite=Lax` cookie (7 days); the user and role are re-read from the database on every request.
- All SQL is parameterised; request bodies are validated with zod; `helmet` sets security headers; CSV export neutralises spreadsheet formulas.
- Roles: **Admin** (everything, incl. team/workspace settings/data reset), **Manager** and **Sales rep** (create/edit leads, deals, tasks), **Viewer** (read-only). Enforced on the server.

## Email and SMS

Everything outgoing goes through an **outbox** table (`messages`): requests never wait on a provider, failures are
retried (after 2 and 4 minutes, then marked `failed`), and every message has an honest status:
`queued` → `sent` (accepted by the provider), `logged` (development mode, **not delivered**), `skipped`
(channel not configured) or `failed`. Admins see the log in Settings → Integrations; each lead shows its own history.
A background worker (in the API process; guarded by a Postgres advisory lock so several instances are safe) sends the queue and runs the scheduled jobs.

**What is sent**

| Message | Channel | Trigger |
| --- | --- | --- |
| Team invitation | Email | Admin → Settings → Team → *Invite by email* (link valid 7 days, single use) |
| Password reset | Email | *Forgot password?* (link valid 1 hour, single use; same answer whether or not the email exists) |
| Task reminder | Email + SMS (opt-in, needs a BD mobile on your profile) | Open task due within the workspace's lead time (default 60 min) |
| Weekly summary | Email (opt-in) | Mondays from 08:00 in the workspace time zone (UTC if "Browser default") |
| Assignment / deal won-or-lost | Email | A lead, task or deal is assigned to you, or someone else closes your deal |
| Message to a lead | Email or SMS | *Messages → Email / SMS* in the lead panel (blocked for leads marked **Do not contact**) |

**Email** uses plain SMTP (nodemailer), so any provider works (Gmail/Workspace, Amazon SES, SendGrid, Mailgun, Brevo, your own server).
Set the `SMTP_*`, `MAIL_FROM` and `APP_URL` variables, then use *Settings → Integrations → Send test*.

**SMS (Bangladesh)** supports three gateways. Pick one with `SMS_PROVIDER`:

| `SMS_PROVIDER` | Gateway | Needs |
| --- | --- | --- |
| `bulksmsbd` | BulkSMSBD | `SMS_API_KEY`, `SMS_SENDER_ID` |
| `alphasms` | Alpha SMS (sms.net.bd) | `SMS_API_KEY` (`SMS_SENDER_ID` optional) |
| `sslwireless` | SSL Wireless SMS Plus | `SMS_API_KEY` (API token), `SSLWIRELESS_SID` |

Numbers are validated and normalised to `8801XXXXXXXXX` (operators 013–019); anything else is refused rather than sent. Text over 480 characters is
rejected, and Bangla (Unicode) messages use 70-character segments, which the send dialog explains.

> **Verify before relying on it.** The three gateway adapters follow each provider's published HTTP API and are tested against
> local mock servers that imitate those APIs, **not against live accounts**. Before going live, send a real test SMS from
> *Settings → Integrations* with your own account and sender ID, and check each gateway's current docs, sender-ID/masking approval
> rules (BTRC requirements) and balance. Only message people who have agreed to be contacted.

**Try it locally without any provider** — a tiny local SMTP server + mock SMS gateway records what would be sent:

```bash
npm run sink            # SMTP :1025, SMS gateway :1026, viewer http://127.0.0.1:1027/
# then start the API with:
SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMS_PROVIDER=bulksmsbd SMS_API_KEY=dev SMS_SENDER_ID=NSTAR \
SMS_API_URL=http://127.0.0.1:1026/sms npm run server
```

`EMAIL_TRANSPORT=log` / `SMS_PROVIDER=log` simply print messages to the API log (status `logged`, never claimed as delivered).
Sample-data leads use the reserved `.example` domain and non-Bangladeshi numbers, so demo records can never email or text a real person.

## Metric definitions

- **Open pipeline** = deals not Won/Lost. **Weighted value** = Σ value × stage probability (Settings → Workspace).
- **Win rate** = won ÷ (won + lost) among deals closed in the period. **Avg. sales cycle** = mean days from deal creation to close, deals won in the period.
- **Lead conversion** (Reports) = leads created in the period that are now Won ÷ leads created in the period (cohort based).
- **Funnel** = leads created in the period by furthest stage reached; Lost leads count only toward "Leads".
- Pipeline "Won revenue" = Won deals closed this quarter. Tasks: Overdue = open and due before today.
- Change indicators compare with the equally long previous period and are hidden for "All time"; empty periods show empty states or "—".

## Testing

```bash
npm run server:test     # 32 API integration tests (needs a Postgres; uses database `northstar_test`).
                        # Email tests deliver over real SMTP to a local test server; SMS tests use mock gateways.
npm run e2e             # 127 browser checks. Needs `npm run sink`, the API (started with the sink variables above and
                        # AUTH_RATE_LIMIT=1000) on :3000, and `npm run build && npm run preview` on :4173
```

Create the test database once with `createdb northstar_test` (or set `TEST_DATABASE_URL`). The e2e script needs
`playwright` installed and creates its own throwaway account each run; start the API with `AUTH_RATE_LIMIT=1000`
if you run it repeatedly.

## Not built yet (shown as "Not connected" / "Requires setup" in the UI)

Third-party integrations (Google, Slack, Zapier, HubSpot, webhooks), two-factor authentication, billing, translations,
email/SMS delivery receipts (a message is marked `sent` when the provider accepts it, not when it reaches the phone or inbox),
inbound replies, and per-lead unsubscribe links. Currency is formatting only (no conversion). SMS targets Bangladeshi mobile numbers only.
