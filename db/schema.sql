-- Physiotherapy Treatment at Home: appointment-enquiry schema (PostgreSQL 13+)
-- Idempotent: safe to run repeatedly via `npm run migrate`.

CREATE TABLE IF NOT EXISTS enquiries (
  id                 BIGSERIAL PRIMARY KEY,
  reference          TEXT NOT NULL UNIQUE,
  patient_name       TEXT NOT NULL,
  contact_number     TEXT NOT NULL,           -- normalised E.164, e.g. +919876543210
  preferred_date     DATE NOT NULL,
  preferred_time     TEXT NOT NULL,
  locality           TEXT NOT NULL,
  service_requirement TEXT NOT NULL,          -- patient's own words; never a diagnosis
  therapist_preference TEXT NOT NULL DEFAULT 'no_preference'
                     CHECK (therapist_preference IN ('female','male','no_preference')),
  consent_at         TIMESTAMPTZ NOT NULL,
  consent_text       TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('website','whatsapp','staff')),
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','awaiting_clinic_review','awaiting_patient_response',
                                       'confirmed','reschedule_requested','cancelled','completed')),
  urgent_flag        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status);
CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_phone_idx ON enquiries (contact_number);
CREATE INDEX IF NOT EXISTS enquiries_pdate_idx ON enquiries (preferred_date);

CREATE TABLE IF NOT EXISTS enquiry_notes (
  id          BIGSERIAL PRIMARY KEY,
  enquiry_id  BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  author_id   BIGINT,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enquiry_status_history (
  id          BIGSERIAL PRIMARY KEY,
  enquiry_id  BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification outbox: every notification is persisted before sending so that
-- failures never lose the enquiry and can be retried.
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  enquiry_id  BIGINT REFERENCES enquiries(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                   -- staff_new_enquiry | staff_patient_update | patient_status_update
  channel     TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','sent','delivered','read','failed','not_configured','skipped_opted_out')),
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  provider_message_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status);
CREATE INDEX IF NOT EXISTS notifications_provider_idx ON notifications (provider_message_id);

-- Conversation state for web chat and WhatsApp.
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,                -- web:<random> | wa:<phone>
  channel     TEXT NOT NULL,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency for inbound webhooks (duplicate deliveries are ignored).
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id    TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_optouts (
  phone       TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  enquiry_id  BIGINT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
