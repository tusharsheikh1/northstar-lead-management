-- Email / SMS outbox, invitations, password resets, reminder tracking.

ALTER TABLE users      ADD COLUMN phone text NOT NULL DEFAULT '';
ALTER TABLE leads      ADD COLUMN do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE tasks      ADD COLUMN reminder_sent_at timestamptz;
ALTER TABLE workspaces ADD COLUMN reminder_lead_minutes integer NOT NULL DEFAULT 60 CHECK (reminder_lead_minutes BETWEEN 5 AND 1440);
ALTER TABLE users ALTER COLUMN notifications SET DEFAULT '{"emailUpdates":true,"taskReminders":true,"weeklySummary":false,"smsReminders":false}';
UPDATE users SET notifications = notifications || '{"smsReminders":false}'::jsonb WHERE NOT (notifications ? 'smsReminders');

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,   -- recipient, when it is a teammate
  lead_id         uuid REFERENCES leads(id) ON DELETE CASCADE,    -- recipient, when it is a lead
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  channel         text NOT NULL CHECK (channel IN ('email','sms')),
  kind            text NOT NULL,
  to_address      text NOT NULL,
  subject         text,
  body            text NOT NULL,
  html            text,
  -- queued: waiting to send | sent: accepted by the provider | logged: dev mode, NOT delivered
  -- skipped: channel not configured | failed: gave up after retries
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','logged','skipped','failed')),
  error           text,
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key      text,
  provider_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE UNIQUE INDEX messages_dedupe_unique ON messages (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX messages_queue_idx ON messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX messages_workspace_idx ON messages (workspace_id, created_at DESC);
CREATE INDEX messages_lead_idx ON messages (lead_id, created_at DESC);

CREATE TABLE invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL CHECK (role IN ('Admin','Manager','Sales rep','Viewer')),
  token_hash   text NOT NULL UNIQUE,
  invited_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX invitations_workspace_idx ON invitations (workspace_id, created_at DESC);

CREATE TABLE password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
