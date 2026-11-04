CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  language      text NOT NULL DEFAULT 'en-US',
  time_zone     text NOT NULL DEFAULT 'auto',
  date_format   text NOT NULL DEFAULT 'MMM d, yyyy',
  monthly_target numeric(14,2) NOT NULL DEFAULT 40000 CHECK (monthly_target >= 0),
  probabilities jsonb NOT NULL DEFAULT '{"New":10,"Qualified":30,"Proposal":55,"Negotiation":75,"Won":100}',
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text NOT NULL,
  password_hash text,            -- NULL = sample member who cannot sign in
  job_title     text NOT NULL DEFAULT '',
  role          text NOT NULL DEFAULT 'Sales rep' CHECK (role IN ('Admin','Manager','Sales rep','Viewer')),
  color         text NOT NULL DEFAULT '#4169E1',
  photo         text,
  notifications jsonb NOT NULL DEFAULT '{"emailUpdates":true,"taskReminders":true,"weeklySummary":false}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Emails must be unique among accounts that can sign in; sample members (no password) may repeat across workspaces.
CREATE UNIQUE INDEX users_login_email_unique ON users (lower(email)) WHERE password_hash IS NOT NULL;
CREATE UNIQUE INDEX users_workspace_email_unique ON users (workspace_id, lower(email));
CREATE INDEX users_workspace_idx ON users (workspace_id);

CREATE TABLE leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name             text NOT NULL,
  company          text NOT NULL,
  email            text NOT NULL DEFAULT '',
  phone            text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Contacted','Qualified','Proposal','Negotiation','Won','Lost')),
  owner_id         uuid NOT NULL REFERENCES users(id),
  source           text NOT NULL DEFAULT 'Website',
  value            numeric(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_workspace_idx ON leads (workspace_id, last_activity_at DESC);
CREATE INDEX leads_owner_idx ON leads (owner_id);

CREATE TABLE deals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id        uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title          text NOT NULL,
  company        text NOT NULL,
  value          numeric(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  stage          text NOT NULL DEFAULT 'New' CHECK (stage IN ('New','Qualified','Proposal','Negotiation','Won','Lost')),
  owner_id       uuid NOT NULL REFERENCES users(id),
  priority       text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  expected_close timestamptz NOT NULL,
  lost_reason    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz
);
CREATE INDEX deals_workspace_idx ON deals (workspace_id, stage);
CREATE INDEX deals_lead_idx ON deals (lead_id);

CREATE TABLE tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title          text NOT NULL,
  lead_id        uuid REFERENCES leads(id) ON DELETE CASCADE,
  deal_id        uuid REFERENCES deals(id) ON DELETE SET NULL,
  owner_id       uuid NOT NULL REFERENCES users(id),
  assigned_by_id uuid NOT NULL REFERENCES users(id),
  due_at         timestamptz NOT NULL,
  priority       text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  completed      boolean NOT NULL DEFAULT false,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_workspace_idx ON tasks (workspace_id, due_at);

CREATE TABLE notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body         text NOT NULL,
  author_id    uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_lead_idx ON notes (lead_id, created_at DESC);

CREATE TABLE activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES users(id),
  verb         text NOT NULL,
  subject      text NOT NULL,
  detail       text,
  lead_id      uuid REFERENCES leads(id) ON DELETE CASCADE,
  deal_id      uuid REFERENCES deals(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES tasks(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_workspace_idx ON activities (workspace_id, created_at DESC);
