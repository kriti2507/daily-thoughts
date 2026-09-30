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

-- Daily check-in. Questions are retired, never deleted, and each answer keeps
-- a copy of the wording it was given, so editing a question never changes the
-- past.
CREATE TABLE IF NOT EXISTS questions (
  id          BIGSERIAL    PRIMARY KEY,
  text        TEXT         NOT NULL,
  position    INTEGER      NOT NULL,
  retired_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answers (
  id             BIGSERIAL    PRIMARY KEY,
  day            DATE         NOT NULL,
  question_id    BIGINT       NOT NULL REFERENCES questions (id),
  question_text  TEXT         NOT NULL,
  text           TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (day, question_id)
);

-- Starter questions, inserted only into an empty table.
INSERT INTO questions (text, position)
SELECT q.text, q.position
FROM (VALUES
  ('What made me anxious today, and what did I tell myself about it?', 1),
  ('What did I handle well today?', 2),
  ('What am I carrying into tomorrow?', 3)
) AS q (text, position)
WHERE NOT EXISTS (SELECT 1 FROM questions);
