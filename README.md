# Northstar CRM

A responsive lead-management web app (Overview, Leads, Pipeline, Tasks, Reports, Settings) built with
**React 18, TypeScript, Tailwind CSS, Lucide icons and Recharts**.

> **This is a demo workspace.** All data is realistic sample data stored in your browser's `localStorage`.
> There is no backend, sign-in, email delivery, billing or third-party integration. Anything that would need
> one is labelled **Not connected** / **Requires setup** in the UI and never pretends to succeed.

Design reference screenshots live in [`UI of northstar/`](./UI%20of%20northstar). The app is built from real
components; the screenshots are not used in the UI. (Settings had no reference screenshot, so it follows the same design system.)

## Run it

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build on http://localhost:4173
```

Use **Settings → Workspace → Reset demo data** to restore the seed data at any time.

## Project structure

```
src/
  types.ts                 Domain types (Lead, Deal, Task, Note, Activity, Owner, Settings, Database)
  data/
    seed.ts                Deterministic, date-relative sample data (63 leads, 52 deals, 27 tasks, notes, activity)
    repository.ts          Repository interface + localStorage implementation  <-- backend swap point
  store/StoreContext.tsx   Single shared store: all CRUD actions, activity log, toasts, persistence
  lib/                     Pure helpers: metrics, reports, dates, csv, format, validate
  hooks/                   useFormat (currency/date prefs), useFocusTrap, useSources
  components/
    ui/                    Button, Form controls, Badge, Avatar, Modal/Confirm, Drawer, Toast, Tabs, ...
    layout/                Sidebar + AppShell (desktop sidebar, tablet icon rail, mobile drawer)
    charts/                Recharts wrappers (revenue trend, donut, bars)
    leads/ pipeline/ tasks/  Feature components (forms, lead drawer, CSV import wizard)
  pages/                   Overview, Leads, Pipeline, Tasks, Reports, Settings
scripts/e2e.cjs           Playwright smoke test (73 checks)
```

### Adding a backend later

Components never touch `localStorage`. They call actions on the store, and the store persists through the
`Repository` interface (`load`, `save`, `reset`) in `src/data/repository.ts`. To go server-backed, implement that
interface against your API (or replace `commit()` in the store with per-entity mutations) and swap the exported
`repository`. Types in `src/types.ts` are the contract.

## Behaviour and metric definitions

One shared dataset powers every page, so a change on one page appears everywhere immediately.

- **Deal stage ↔ lead status:** moving a deal updates the linked lead's status; marking it Lost sets the lead to Lost.
- **Open pipeline** = deals not Won/Lost. **Weighted value** = Σ value × stage probability (configurable in Settings → Workspace).
- **Won revenue** (Pipeline cards) = Won deals closed this quarter. Pipeline summary cards respect owner/priority filters only.
- **Win rate** = won ÷ (won + lost) among deals closed in the period.
- **Avg. sales cycle** = mean days from deal creation to close for deals won in the period.
- **Lead conversion** (Reports) = leads created in the period that are now Won ÷ leads created in the period (cohort based, so very recent periods read low).
- **Funnel** = leads created in the period, counted by furthest stage reached; Lost leads count only toward "Leads".
- Change indicators compare with the equally long previous period and are hidden for "All time". Periods with no data show empty states / "—".
- **Tasks:** Overdue = open and due before today; Due today = open and due today; Upcoming = open, due tomorrow or later.

## Feature checklist

- **Overview:** KPIs with sparklines, pipeline by stage, tasks due today (completable), activity feed, source donut. Cards, rows and activities deep-link to filtered pages or records.
- **Leads:** search, sortable columns + sort menu, status tabs, owner/source/value filters, pagination, row selection, add/edit/delete (confirmed), bulk owner/status/delete, details drawer (contact, notes, deals, tasks, history), CSV import (column mapping, validation, duplicate detection) and CSV export (selected or filtered rows; formula-injection safe).
- **Pipeline:** kanban with drag-and-drop (plus Alt+←/→ keyboard and a stage select on touch devices), board/list toggle, owner/priority/close-date filters, add/edit deals, mark Lost (with reason) / reopen, per-column counts and totals.
- **Tasks:** summary cards, tabs, Overdue/Today/Tomorrow/Later groups, add/edit/delete/complete/reopen, calendar with day filter, daily progress, owner/priority/status filters.
- **Reports:** three tabs, date and owner filters, revenue vs. target, funnel, source and team tables, CSV export and print stylesheet.
- **Settings:** profile (photo upload), workspace (currency, language, time zone, date format, target, stage probabilities), team roles, notification preferences, integrations / security / billing with honest "Not connected / Requires setup" states, JSON export and reset.

## Known limitations

- Currency setting changes formatting only; amounts are not converted. Only English is available.
- Time zone affects displayed times; Today/Tomorrow grouping follows the device clock.
- Roles are labels; nothing is permission-gated because there is no authentication.
- No company logos or photos are bundled; avatars and logos are generated initials.
- `localStorage` is per browser profile and limited (~5 MB); profile photos are downscaled to keep it small.

## Testing

`scripts/e2e.cjs` drives the built app with Playwright and checks navigation, CRUD, validation, persistence
after reload, drag-and-drop, filters, bulk actions, CSV import/export, settings, tasks and report consistency.
