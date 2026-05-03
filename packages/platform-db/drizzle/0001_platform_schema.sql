CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id text PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id text PRIMARY KEY,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  prompt text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text,
  license text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_models (
  id text PRIMARY KEY,
  provider_id text NOT NULL,
  base_url text NOT NULL,
  image_model text NOT NULL,
  state text NOT NULL DEFAULT 'closed',
  cooldown_ms integer NOT NULL DEFAULT 300000,
  opened_at timestamptz,
  open_until timestamptz,
  last_failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_url, image_model)
);

CREATE TABLE IF NOT EXISTS provider_api_keys (
  id text PRIMARY KEY,
  provider_model_id text NOT NULL,
  label text NOT NULL,
  key_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'healthy',
  cooldown_until timestamptz,
  max_in_flight integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_model_health_events (
  id text PRIMARY KEY,
  provider_model_id text NOT NULL,
  api_key_id text,
  status text NOT NULL,
  latency_ms integer,
  image_bytes integer,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  mode text NOT NULL,
  prompt text NOT NULL,
  image_model text NOT NULL,
  status text NOT NULL,
  selected_api_key_id text,
  error_category text,
  size text,
  quality text,
  resolution text,
  reference_image_count integer NOT NULL DEFAULT 0,
  timeout_ms integer NOT NULL DEFAULT 240000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation_results (
  id text PRIMARY KEY,
  job_id text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  bytes integer NOT NULL,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_credit_accounts (
  user_id text PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  event_type text NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  amount_cny integer NOT NULL,
  credits integer NOT NULL,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id text PRIMARY KEY,
  admin_user_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_status ON generation_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_health_events_provider_created ON provider_model_health_events (provider_model_id, created_at);
