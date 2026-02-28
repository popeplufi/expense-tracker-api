CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  replaced_by UUID NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id ON refresh_tokens(session_id);

CREATE TABLE IF NOT EXISTS device_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  identity_public_key TEXT NOT NULL,
  signed_pre_key TEXT NOT NULL,
  one_time_pre_keys JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NULL,
  actor_username TEXT NULL,
  action TEXT NOT NULL,
  method TEXT,
  path TEXT,
  status_code INT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS chats (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_envelopes (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_message_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  sent_at_client TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sender_user_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_envelopes_chat_created
  ON message_envelopes(chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id BIGINT NOT NULL REFERENCES message_envelopes(id) ON DELETE CASCADE,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NULL,
  seen_at TIMESTAMPTZ NULL,
  PRIMARY KEY (message_id, recipient_user_id)
);

INSERT INTO users (username, password_hash)
VALUES ('admin', '$2b$12$0f7e3A1F4Nkrptdr5Pjci.OjR6v5VhQvQm8nM6wIY5J5J9OcW7jYS')
ON CONFLICT (username) DO NOTHING;
-- Default admin password hash above corresponds to: admin12345
