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
  src/seed/                  Sample-data generator and loader
  test/api.test.ts           Integration tests against a real Postgres
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
| Auth | `POST /auth/register` · `/auth/login` · `/auth/logout` · `GET /auth/me` · `POST /auth/change-password` |
| Data | `GET /data` (workspace snapshot) |
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

## Metric definitions

- **Open pipeline** = deals not Won/Lost. **Weighted value** = Σ value × stage probability (Settings → Workspace).
- **Win rate** = won ÷ (won + lost) among deals closed in the period. **Avg. sales cycle** = mean days from deal creation to close, deals won in the period.
- **Lead conversion** (Reports) = leads created in the period that are now Won ÷ leads created in the period (cohort based).
- **Funnel** = leads created in the period by furthest stage reached; Lost leads count only toward "Leads".
- Pipeline "Won revenue" = Won deals closed this quarter. Tasks: Overdue = open and due before today.
- Change indicators compare with the equally long previous period and are hidden for "All time"; empty periods show empty states or "—".

## Testing

```bash
npm run server:test     # 14 API integration tests (needs a Postgres; uses database `northstar_test`)
npm run e2e             # 90 browser checks: API on :3000 and `npm run build && npm run preview` on :4173 must be running
```

Create the test database once with `createdb northstar_test` (or set `TEST_DATABASE_URL`). The e2e script needs
`playwright` installed and creates its own throwaway account each run; start the API with `AUTH_RATE_LIMIT=1000`
if you run it repeatedly.

## Not built yet (shown as "Not connected" / "Requires setup" in the UI)

Email delivery (invitations, reminders, weekly summaries), third-party integrations (Google, Slack, Zapier, HubSpot),
two-factor authentication, password-reset-by-email, billing, and translations. Adding a team member creates their
account directly with an initial password the admin shares. Currency is formatting only (no conversion).
