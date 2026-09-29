CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL    PRIMARY KEY,
  telegram_id BIGINT       NOT NULL,
  chat_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  sent_at     TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at DESC, id DESC);

-- Web entries have no Telegram ids; `source` tells the two inputs apart.
-- Idempotent, so `npm run db:init` upgrades an existing table in place.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'telegram'
  CHECK (source IN ('telegram', 'web'));
ALTER TABLE messages ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL;
