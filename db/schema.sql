CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL    PRIMARY KEY,
  telegram_id BIGINT       NOT NULL,
  chat_id     BIGINT       NOT NULL,
  text        TEXT         NOT NULL,
  sent_at     TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS messages_sent_at_idx ON messages (sent_at DESC);
